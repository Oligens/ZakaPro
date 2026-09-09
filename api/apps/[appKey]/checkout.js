import crypto from "crypto";
import { dbReady, getSession, pool, readBody, sendJson } from "../../_lib.js";
import { ensureMonetizationTables, getMonetizationConfig, getUserWallet, creditWallet, debitWallet } from "../../_wallet.js";

// Haitian phone numbers use the +509 country code and exactly 8 national digits.
// Accept common user input forms (509..., +509..., spaces, dashes, parentheses)
// but always persist the canonical +509XXXXXXXX representation.
function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("509")) return `+${digits}`;
  if (digits.length === 8) return `+509${digits}`;
  return "";
}

function isValidHaitianPhone(value) {
  return /^\+509\d{8}$/.test(value);
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

// Subscription checkout is intentionally handled here as well as by
// /payment-intent. This prevents legacy SDKs/cURL integrations that still
// call /checkout from falling into the monetization action router and getting
// a misleading HTTP 400 "unknown_action" response.
async function handleSubscriptionCheckout(req, res, app, body) {
  const planId = cleanText(body.planId || body.plan_id, 128);
  const customerName = cleanText(body.customerName || body.name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(body.phone);

  if (!planId) return sendJson(res, 400, { error: "planId requis.", code: "missing_plan_id" });
  if (customerName.length < 2) return sendJson(res, 400, { error: "Nom client invalide.", code: "invalid_customer_name" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { error: "Email client invalide.", code: "invalid_email" });
  if (!isValidHaitianPhone(phone)) return sendJson(res, 400, { error: "Numéro haïtien invalide. Utilisez 8 chiffres, par exemple 37124589 ou +509 37124589.", code: "invalid_phone" });

  const planResult = await pool.query(
    `SELECT id, app_id, name, amount, recurrence, delivery
     FROM plans WHERE id=$1 AND app_id=$2 LIMIT 1`,
    [planId, app.id]
  );
  const plan = planResult.rows[0];
  if (!plan) return sendJson(res, 404, { error: "Plan introuvable pour cette application.", code: "plan_not_found" });

  const amount = money(plan.amount);
  if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 422, { error: "Le prix du plan est invalide en base de données.", code: "invalid_plan_price" });

  const ref = reference("ZK");
  const { rows } = await pool.query(
    `INSERT INTO checkout_payment_intents
     (app_id,plan_id,customer_name,customer_email,customer_phone,
      base_amount,fee_amount,total_amount,delivery,reference,monetization_type)
     VALUES($1,$2,$3,$4,$5,$6,0,$6,$7,$8,'subscription')
     RETURNING id,reference,plan_id,total_amount,delivery,status,expires_at`,
    [app.id, plan.id, customerName, email, phone, amount, Boolean(plan.delivery), ref]
  );

  return sendJson(res, 201, {
    success: true,
    ok: true,
    intent: {
      id: rows[0].id,
      reference: rows[0].reference,
      planId: rows[0].plan_id,
      total_amount: Number(rows[0].total_amount),
      amount: Number(rows[0].total_amount),
      delivery: Boolean(rows[0].delivery),
      status: rows[0].status,
      expires_at: rows[0].expires_at,
    },
    plan: { id: plan.id, name: plan.name, amount },
    payment: { currency: "HTG", methods: ["moncash", "natcash"] },
  });
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
    if(!isValidHaitianPhone(customerPhone))return sendJson(res,400,{error:"Numéro haïtien invalide. Utilisez un numéro à 8 chiffres, par exemple 37 00 12 34 ou +509 37 00 12 34.",code:"validation"});
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
    const appKey=cleanText(req.query?.appKey||req.query?.app_key||"");
    if(!appKey)return sendJson(res,400,{error:"appKey requis.",code:"missing_app_key"});
    const app=await getApp(appKey);
    if(!app)return sendJson(res,404,{error:"Application introuvable.",code:"app_not_found"});

    if(req.method==="OPTIONS")return sendJson(res,200,{ok:true});

    // Subscription checkout has its own namespace. Older clients may send an
    // action field such as "checkout" or "subscription"; these are aliases for
    // the secure plan checkout and MUST be handled before the monetization router.
    // This prevents a subscription request from falling through to
    // handleMonetization() and returning the misleading "unknown_action" 400.
    const requestBody = req.method==="GET" ? {} : await readBody(req);
    const hasPlan = Boolean(cleanText(requestBody.planId || requestBody.plan_id, 128));
    const requestedAction = cleanText(requestBody.action, 64).toLowerCase();
    const subscriptionActions = new Set([
      "",
      "checkout",
      "subscription",
      "subscription_checkout",
      "subscription_intent",
      "payment_intent",
      "create_payment_intent"
    ]);
    if(req.method==="POST" && hasPlan && subscriptionActions.has(requestedAction)){
      return handleSubscriptionCheckout(req,res,app,requestBody);
    }

    if(req.method==="PUT" && String(req.query?.mode||"")==="monetization_settings"){
      const session=getSession(req);
      if(!session)return sendJson(res,401,{error:"Authentification requise.",code:"unauthorized"});
      if(String(app.user_id)!==String(session.sub))return sendJson(res,403,{error:"Application non autorisée.",code:"forbidden"});
      const body=requestBody;
      const tokenRate=money(body.tokenToHtgRate);
      if(!Number.isFinite(tokenRate)||tokenRate<=0||tokenRate>1000000)
        return sendJson(res,400,{error:"Le taux Jeton → HTG est invalide.",code:"invalid_rate"});
      const inputRules=body.rules&&typeof body.rules==="object"?body.rules:{};
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        await client.query(`INSERT INTO app_monetization_settings(app_id,token_to_htg_rate,enabled)
          VALUES($1,$2,TRUE)
          ON CONFLICT(app_id) DO UPDATE SET token_to_htg_rate=EXCLUDED.token_to_htg_rate,updated_at=now()`,[app.id,tokenRate]);
        for(const tier of ["standard","intermediate","vip"]){
          const pct=money(inputRules[tier]);
          if(!Number.isFinite(pct)||pct<0||pct>100){
            await client.query("ROLLBACK");
            return sendJson(res,400,{error:`Pourcentage invalide pour le palier ${tier}.`,code:"invalid_rule"});
          }
          await client.query(`INSERT INTO revenue_share_rules(app_id,tier_level,creator_pct)
            VALUES($1,$2,$3)
            ON CONFLICT(app_id,tier_level) DO UPDATE SET creator_pct=EXCLUDED.creator_pct,updated_at=now()`,[app.id,tier,pct]);
        }
        await client.query("COMMIT");
      }catch(error){
        try{await client.query("ROLLBACK")}catch{}
        throw error;
      }finally{client.release()}
      return sendJson(res,200,{ok:true,app:{id:app.id,name:app.name,appKey:app.public_key},monetization:await getMonetizationConfig(app.id)});
    }

    if(req.method==="PATCH" && String(req.query?.mode||"")==="withdrawals"){
      const session=getSession(req);
      if(!session)return sendJson(res,401,{error:"Authentification requise.",code:"unauthorized"});
      if(String(app.user_id)!==String(session.sub))return sendJson(res,403,{error:"Application non autorisée.",code:"forbidden"});
      const body=requestBody;
      const withdrawalId=cleanText(body.withdrawalId,128);
      const nextStatus=cleanText(body.status,20);
      const note=cleanText(body.adminNote,500);
      if(!withdrawalId||!["processing","completed","rejected","cancelled"].includes(nextStatus))
        return sendJson(res,400,{error:"Demande de retrait ou statut invalide.",code:"validation"});
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        const current=await client.query(`SELECT * FROM withdrawal_requests WHERE id::text=$1 AND app_id=$2 FOR UPDATE`,[withdrawalId,app.id]);
        if(!current.rowCount){await client.query("ROLLBACK");return sendJson(res,404,{error:"Demande de retrait introuvable.",code:"not_found"});}
        const w=current.rows[0];
        if(["completed","rejected","cancelled"].includes(w.status)){
          await client.query("ROLLBACK");
          return sendJson(res,409,{error:"Cette demande est déjà clôturée.",code:"already_closed"});
        }
        if(["rejected","cancelled"].includes(nextStatus)){
          await creditWallet(client,{appId:app.id,userId:w.user_id,amount:Number(w.amount),currency:w.currency,reason:"withdrawal_refund",reference:`withdrawal-refund:${w.id}`,metadata:{withdrawalId:w.id,status:nextStatus}});
        }
        const {rows}=await client.query(
          `UPDATE withdrawal_requests SET status=$1,admin_note=$2,updated_at=now() WHERE id=$3 RETURNING id,status,amount,currency,method,destination,created_at,updated_at,admin_note`,
          [nextStatus,note||null,w.id]
        );
        await client.query("COMMIT");
        const payload={id:`evt_${crypto.randomUUID().replace(/-/g,"").slice(0,20)}`,event:`withdrawal.${nextStatus}`,createdAt:new Date().toISOString(),app:app.id,appKey:app.public_key,withdrawal:rows[0]};
        await sendWebhook(app,payload);
        return sendJson(res,200,{ok:true,withdrawal:rows[0]});
      }catch(error){
        try{await client.query("ROLLBACK")}catch{}
        throw error;
      }finally{client.release()}
    }

    return handleMonetization(req,res,app,requestBody);
  } catch(error) {
    console.error("[zakapro:checkout]",error);
    return sendJson(res,500,{error:"Erreur interne du serveur.",code:"internal_error"});
  }
}
