import crypto from "crypto";
import { dbReady, getSession, pool, readBody, sendJson } from "../../_lib.js";
import { ensureMonetizationTables, getMonetizationConfig, getUserWallet, creditWallet, debitWallet } from "../../_wallet.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("509") ? `+${digits}` : digits ? `+509${digits}` : "";
}
function cleanText(value, max = 255) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function reference(prefix = "ZK") { return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stable(value[k])).join(",")}}`;
  return JSON.stringify(value);
}
function validAppSignature(app, body, req) {
  const received = String(req.headers["x-zakapro-app-signature"] || "").replace(/^sha256=/i, "");
  if (!received || !app?.secret_key) return false;
  const expected = crypto.createHmac("sha256", app.secret_key).update(stable(body)).digest("hex");
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
async function getApp(appKey) {
  const { rows } = await pool.query(
    `SELECT id,name,public_key,secret_key,webhook_url,user_id FROM apps
     WHERE id::text=$1 OR public_key=$1 LIMIT 1`, [appKey]
  );
  return rows[0] || null;
}
async function sendWebhook(app, payload) {
  if (!app?.webhook_url) return null;
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", app.secret_key).update(body).digest("hex");
  try {
    const response = await fetch(app.webhook_url, {
      method: "POST",
      headers: {"Content-Type":"application/json","User-Agent":"ZakaPro-Monetization/1.0","X-ZakaPro-Signature":`sha256=${sig}`},
      body
    });
    return {code:response.status,delivered:response.ok};
  } catch (error) {
    console.error("[zakapro:monetization:webhook]", error?.message || error);
    return {code:0,delivered:false};
  }
}

async function handleMonetization(req,res,app,body) {
  await ensureMonetizationTables();
  const action=String(body.action||"").trim();

  if (req.method==="GET" || action==="config") {
    const config=await getMonetizationConfig(app.id);
    const recipient=cleanText(req.query?.recipientUserId||body.recipientUserId,128);
    const wallet=recipient ? await getUserWallet(app.id,recipient) : null;
    return sendJson(res,200,{app:{id:app.id,name:app.name,appKey:app.public_key},monetization:config,wallet});
  }

  if (action==="donation_intent") {
    const recipientUserId=cleanText(body.recipientUserId,128);
    const customerName=cleanText(body.customerName,120);
    const customerEmail=cleanText(body.email,254).toLowerCase();
    const customerPhone=normalizePhone(body.phone);
    const amount=money(body.amount);
    if(!recipientUserId)return sendJson(res,400,{error:"recipientUserId requis.",code:"recipient_required"});
    if(customerName.length<2)return sendJson(res,400,{error:"Nom client invalide.",code:"validation"});
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))return sendJson(res,400,{error:"Email client invalide.",code:"validation"});
    if(!/^\+509\\d{8}$/.test(customerPhone))return sendJson(res,400,{error:"Numéro haïtien invalide.",code:"validation"});
    if(!Number.isFinite(amount)||amount<=0)return sendJson(res,400,{error:"Montant du don invalide.",code:"validation"});
    const config=await getMonetizationConfig(app.id);
    if(!config.enabled)return sendJson(res,403,{error:"Monétisation désactivée pour cette application.",code:"disabled"});
    const ref=reference("ZKD");
    const {rows}=await pool.query(
      `INSERT INTO checkout_payment_intents
       (app_id,plan_id,customer_name,customer_email,customer_phone,base_amount,fee_amount,total_amount,delivery,reference,monetization_type,recipient_user_id)
       VALUES($1,NULL,$2,$3,$4,$5,0,$5,FALSE,$6,'donation',$7)
       RETURNING id,reference,total_amount,expires_at,recipient_user_id`,
      [app.id,customerName,customerEmail,customerPhone,amount,ref,recipientUserId]
    );
    return sendJson(res,201,{ok:true,intent:rows[0],payment:{amount,currency:"HTG",methods:["moncash","natcash"]},recipientUserId});
  }

  if(action==="token_gift" || action==="withdrawal" || action==="wallet") {
    if(!validAppSignature(app,body,req))return sendJson(res,401,{error:"Signature serveur de l'application requise.",code:"app_signature_required"});
  }

  if(action==="wallet"){
    const wallet=await getUserWallet(app.id,cleanText(body.userId,128));
    return sendJson(res,200,{wallet});
  }

  if(action==="token_gift"){
    const senderUserId=cleanText(body.senderUserId,128);
    const recipientUserId=cleanText(body.recipientUserId,128);
    const tokenAmount=Number(body.tokenAmount);
    if(!senderUserId||!recipientUserId||senderUserId===recipientUserId)return sendJson(res,400,{error:"Expéditeur et destinataire invalides.",code:"validation"});
    if(!Number.isFinite(tokenAmount)||tokenAmount<=0)return sendJson(res,400,{error:"tokenAmount invalide.",code:"validation"});
    const config=await getMonetizationConfig(app.id);
    if(!config.enabled)return sendJson(res,403,{error:"Monétisation désactivée.",code:"disabled"});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const recipient=await getUserWallet(app.id,recipientUserId,client);
      const gross=money(tokenAmount*config.tokenToHtgRate);
      const pct=Number(config.rules[recipient.tierLevel] ?? config.rules.standard ?? 30);
      const creator=money(gross*pct/100);
      const platform=money(gross-creator);
      const eventKey=cleanText(body.eventKey,128)||reference("ZKG");
      const exists=await client.query("SELECT id FROM monetization_events WHERE event_key=$1 LIMIT 1",[eventKey]);
      if(exists.rowCount){await client.query("COMMIT");return sendJson(res,200,{ok:true,duplicate:true,eventKey});}
      await debitWallet(client,{appId:app.id,userId:senderUserId,amount:tokenAmount,currency:"TOKEN",reason:"gift_sent",reference:eventKey,metadata:{recipientUserId}});
      await creditWallet(client,{appId:app.id,userId:recipientUserId,amount:creator,currency:"HTG",reason:"gift_received",reference:eventKey,metadata:{senderUserId,tokenAmount,pct}});
      const appOwner=`merchant:${String(app.user_id)}`;
      if(platform>0) await creditWallet(client,{appId:app.id,userId:appOwner,amount:platform,currency:"HTG",reason:"platform_revenue",reference:eventKey,metadata:{recipientUserId}});
      await client.query(
        `INSERT INTO monetization_events(app_id,event_key,event_type,sender_user_id,recipient_user_id,gross_amount,token_amount,creator_pct,creator_amount,platform_amount,currency,reference,metadata)
         VALUES($1,$2,'gift',$3,$4,$5,$6,$7,$8,$9,'HTG',$2,$10)`,
        [app.id,eventKey,senderUserId,recipientUserId,gross,tokenAmount,pct,creator,platform,JSON.stringify({rate:config.tokenToHtgRate})]
      );
      await client.query("COMMIT");
      const payload={id:`evt_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`,event:"monetization.gift.received",createdAt:new Date().toISOString(),app:app.id,appKey:app.public_key,eventKey,senderUserId,recipientUserId,tokenAmount,grossAmount:gross,creatorPct:pct,creatorAmount:creator,platformAmount:platform,currency:"HTG"};
      const webhook=await sendWebhook(app,payload);
      return sendJson(res,200,{ok:true,eventKey,wallet:await getUserWallet(app.id,recipientUserId),creatorAmount:creator,platformAmount:platform,webhook:webhook?.delivered?"delivered":app.webhook_url?"failed":"not_configured"});
    }catch(error){
      try{await client.query("ROLLBACK")}catch{}
      if(/Solde insuffisant/.test(error.message))return sendJson(res,422,{error:error.message,code:"insufficient_balance"});
      throw error;
    }finally{client.release()}
  }

  if(action==="withdrawal"){
    const userId=cleanText(body.userId,128), amount=money(body.amount), method=cleanText(body.method,20), destination=cleanText(body.destination,255);
    if(!userId||!Number.isFinite(amount)||amount<=0||!["moncash","natcash","bank"].includes(method)||!destination)return sendJson(res,400,{error:"Demande de retrait invalide.",code:"validation"});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const ref=reference("ZKW");
      await debitWallet(client,{appId:app.id,userId,amount,currency:"HTG",reason:"withdrawal_hold",reference:ref,metadata:{method,destination}});
      const {rows}=await client.query(
        `INSERT INTO withdrawal_requests(app_id,user_id,amount,currency,method,destination) VALUES($1,$2,$3,'HTG',$4,$5) RETURNING id,status,amount,currency,method,destination,created_at`,
        [app.id,userId,amount,method,destination]
      );
      await client.query("COMMIT");
      const payload={id:`evt_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`,event:"withdrawal.requested",createdAt:new Date().toISOString(),app:app.id,appKey:app.public_key,withdrawal:rows[0]};
      const webhook=await sendWebhook(app,payload);
      return sendJson(res,201,{ok:true,withdrawal:rows[0],webhook:webhook?.delivered?"delivered":app.webhook_url?"failed":"not_configured"});
    }catch(error){
      try{await client.query("ROLLBACK")}catch{}
      if(/Solde insuffisant/.test(error.message))return sendJson(res,422,{error:error.message,code:"insufficient_balance"});
      throw error;
    }finally{client.release()}
  }

  return sendJson(res,400,{error:"Action de monétisation inconnue.",code:"unknown_action"});
}

export default async function handler(req,res) {
  if(!dbReady())return sendJson(res,503,{error:"Base de données non configurée.",code:"config"});
  try {
    const appKey=cleanText(req.query?.appKey||"");
    if(!appKey)return sendJson(res,400,{error:"appKey requis.",code:"missing_app_key"});
    const app=await getApp(appKey);
    if(!app)return sendJson(res,404,{error:"Application introuvable.",code:"app_not_found"});

    if(req.method==="OPTIONS")return sendJson(res,200,{ok:true});

    if(req.method==="GET"){
      if(String(req.query?.mode||"")==="withdrawals"){
        const session=getSession(req);
        if(!session)return sendJson(res,401,{error:"Authentification requise.",code:"unauthorized"});
        if(String(app.user_id)!==String(session.sub))return sendJson(res,403,{error:"Application non autorisée.",code:"forbidden"});
        const result=await pool.query(
          `SELECT id,user_id,amount,currency,method,destination,status,admin_note,created_at,completed_at
           FROM withdrawal_requests WHERE app_id=$1 ORDER BY created_at DESC LIMIT 100`,[app.id]
        );
        return sendJson(res,200,{withdrawals:result.rows});
      }
      const plans=await pool.query(`SELECT id,app_id,name,amount,recurrence,delivery,product_type FROM plans WHERE app_id=$1 ORDER BY created_at DESC`,[app.id]);
      const config=await getMonetizationConfig(app.id);
      const recipient=cleanText(req.query?.recipientUserId||"",128);
      const wallet=recipient ? await getUserWallet(app.id,recipient) : null;
      return sendJson(res,200,{app:{id:app.id,name:app.name,appKey:app.public_key},plans:plans.rows.map(p=>({id:p.id,name:p.name,amount:Number(p.amount),recurrence:p.recurrence,delivery:Boolean(p.delivery),productType:p.product_type})),monetization:config,wallet});
    }

    if(req.method==="POST"){
      const body=await readBody(req);
      if(String(body.action||"")==="withdrawal_update"){
        const session=getSession(req);
        if(!session)return sendJson(res,401,{error:"Authentification requise.",code:"unauthorized"});
        if(String(app.user_id)!==String(session.sub))return sendJson(res,403,{error:"Application non autorisée.",code:"forbidden"});
        const withdrawalId=cleanText(body.withdrawalId,128);
        const nextStatus=cleanText(body.status,20);
        const note=cleanText(body.adminNote,500);
        if(!withdrawalId||!["processing","completed","rejected","cancelled"].includes(nextStatus))return sendJson(res,400,{error:"Statut de retrait invalide.",code:"validation"});
        const client=await pool.connect();
        try{
          await client.query("BEGIN");
          const current=await client.query(`SELECT * FROM withdrawal_requests WHERE id::text=$1 AND app_id=$2 FOR UPDATE`,[withdrawalId,app.id]);
          if(!current.rowCount){await client.query("ROLLBACK");return sendJson(res,404,{error:"Demande de retrait introuvable.",code:"not_found"});}
          const w=current.rows[0];
          if(["completed","rejected","cancelled"].includes(w.status)){await client.query("ROLLBACK");return sendJson(res,409,{error:"Cette demande est déjà clôturée.",code:"already_closed"});}
          if(["rejected","cancelled"].includes(nextStatus)){
            await creditWallet(client,{appId:app.id,userId:w.user_id,amount:Number(w.amount),currency:w.currency,reason:"withdrawal_refund",reference:`withdrawal-refund:${w.id}`,metadata:{withdrawalId:w.id}});
          }
          const {rows}=await client.query(
            `UPDATE withdrawal_requests SET status=$1,admin_note=$2,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END
             WHERE id=$3 RETURNING id,user_id,amount,currency,method,destination,status,admin_note,created_at,completed_at`,
            [nextStatus,note||null,w.id]
          );
          await client.query("COMMIT");
          const payload={id:`evt_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`,event:"withdrawal.updated",createdAt:new Date().toISOString(),app:app.id,appKey:app.public_key,withdrawal:rows[0]};
          const webhook=await sendWebhook(app,payload);
          return sendJson(res,200,{ok:true,withdrawal:rows[0],refunded:["rejected","cancelled"].includes(nextStatus),webhook:webhook?.delivered?"delivered":app.webhook_url?"failed":"not_configured"});
        }catch(error){
          try{await client.query("ROLLBACK")}catch{}
          throw error;
        }finally{client.release()}
      }

      if(["donation_intent","token_gift","withdrawal","wallet","config"].includes(String(body.action||""))) {
        if(body.action==="config"){
          const session=getSession(req);
          if(!session)return sendJson(res,401,{error:"Authentification requise.",code:"unauthorized"});
          const owned=String(app.user_id)===String(session.sub);
          if(!owned)return sendJson(res,403,{error:"Application non autorisée.",code:"forbidden"});
          const config=await getMonetizationConfig(app.id);
          const tokenRate=money(body.tokenToHtgRate);
          const client=await pool.connect();
          try{
            await client.query("BEGIN");
            if(Number.isFinite(tokenRate)&&tokenRate>0)await client.query(`UPDATE app_monetization_settings SET token_to_htg_rate=$2,updated_at=now() WHERE app_id=$1`,[app.id,tokenRate]);
            if(body.rules&&typeof body.rules==="object"){
              for(const [tier,pctRaw] of Object.entries(body.rules)){
                const pct=money(pctRaw);
                if(["standard","intermediate","vip"].includes(tier)&&Number.isFinite(pct)&&pct>=0&&pct<=100)
                  await client.query(`INSERT INTO revenue_share_rules(app_id,tier_level,creator_pct) VALUES($1,$2,$3) ON CONFLICT(app_id,tier_level) DO UPDATE SET creator_pct=EXCLUDED.creator_pct,updated_at=now()`,[app.id,tier,pct]);
              }
            }
            await client.query("COMMIT");
          }catch(error){try{await client.query("ROLLBACK")}catch{};throw error}finally{client.release()}
          return sendJson(res,200,{ok:true,monetization:await getMonetizationConfig(app.id)});
        }
        return handleMonetization(req,res,app,body);
      }

      const customerName=cleanText(body.customerName,120);
      const customerEmail=cleanText(body.email,254).toLowerCase();
      const customerPhone=normalizePhone(body.phone);
      const planId=cleanText(body.planId,128);
      const zoneId=cleanText(body.zoneId,128)||null;
      const address=cleanText(body.address,500)||null;
      if(customerName.length<2)return sendJson(res,400,{error:"Nom client invalide.",code:"validation"});
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))return sendJson(res,400,{error:"Email client invalide.",code:"validation"});
      if(!/^\+509\\d{8}$/.test(customerPhone))return sendJson(res,400,{error:"Numéro haïtien invalide.",code:"validation"});
      if(!planId)return sendJson(res,400,{error:"planId requis.",code:"missing_plan_id"});
      const planResult=await pool.query(`SELECT id,app_id,name,amount,delivery,product_type FROM plans WHERE id=$1 AND app_id=$2 LIMIT 1`,[planId,app.id]);
      const plan=planResult.rows[0];
      if(!plan)return sendJson(res,404,{error:"Plan introuvable pour cette application.",code:"plan_not_found"});
      let fee=0;
      if(Boolean(plan.delivery)){
        if(zoneId){
          const zoneResult=await pool.query(`SELECT id,name,fee_pct FROM zones WHERE id=$1 AND app_id=$2 LIMIT 1`,[zoneId,app.id]);
          const zone=zoneResult.rows[0];if(!zone)return sendJson(res,400,{error:"Zone de livraison invalide.",code:"zone_not_found"});
          fee=Math.round((Number(plan.amount)*Number(zone.fee_pct)/100)*100)/100;
        }else{
          const zoneCount=await pool.query(`SELECT count(*)::int AS count FROM zones WHERE app_id=$1`,[app.id]);
          if(zoneCount.rows[0].count>0)return sendJson(res,400,{error:"Une zone de livraison est requise.",code:"zone_required"});
        }
        if(!address||address.length<6)return sendJson(res,400,{error:"Adresse de livraison requise.",code:"address_required"});
      }
      const baseAmount=money(plan.amount),totalAmount=money(baseAmount+fee),ref=reference();
      const {rows}=await pool.query(
        `INSERT INTO checkout_payment_intents(app_id,plan_id,customer_name,customer_email,customer_phone,base_amount,fee_amount,total_amount,zone_id,address,delivery,reference,monetization_type)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,reference,app_id,plan_id,base_amount,fee_amount,total_amount,delivery,expires_at`,
        [app.id,plan.id,customerName,customerEmail,customerPhone,baseAmount,fee,totalAmount,zoneId,address,Boolean(plan.delivery),ref,plan.product_type==="token_purchase"?"token_purchase":"subscription"]
      );
      return sendJson(res,201,{ok:true,intent:rows[0],app:{id:app.id,name:app.name,appKey:app.public_key},plan:{id:plan.id,name:plan.name,amount:baseAmount,delivery:Boolean(plan.delivery),productType:plan.product_type},payment:{amount:totalAmount,currency:"HTG",methods:["moncash","natcash"]}});
    }
    return sendJson(res,405,{error:"Méthode non autorisée.",code:"method_not_allowed"});
  }catch(error){
    console.error("[zakapro:checkout]",error);
    return sendJson(res,500,{error:error.message||"Impossible de préparer le checkout.",code:"server"});
  }
}
