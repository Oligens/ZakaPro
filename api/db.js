/* ZakaPro — persistence API with per-user PostgreSQL revision locking. */
import { pool, dbReady, requireAuth, readBody, sendJson } from "./_lib.js";
import { requireActiveSubscription } from "./_subscription.js";

const TABLES = {
  apps: { cols:["id","name","monogram","color","public_key","secret_key","webhook_url","created_at"], map:r=>({id:r.id,name:r.name,monogram:r.monogram,color:r.color,publicKey:r.public_key,secretKey:r.secret_key,webhookUrl:r.webhook_url||"",createdAt:Number(r.created_at)}), unmap:o=>[o.id,o.name,o.monogram,o.color,o.publicKey,o.secretKey,o.webhookUrl||"",o.createdAt] },
  plans: { cols:["id","app_id","name","amount","recurrence","delivery","created_at","product_type"], map:r=>({id:r.id,appId:r.app_id,name:r.name,amount:Number(r.amount),recurrence:r.recurrence,delivery:r.delivery,createdAt:Number(r.created_at),productType:r.product_type||"subscription"}), unmap:o=>[o.id,o.appId,o.name,o.amount,o.recurrence,o.delivery,o.createdAt,o.productType||"subscription"] },
  zones: { cols:["id","app_id","name","fee_pct"], map:r=>({id:r.id,appId:r.app_id,name:r.name,feePct:Number(r.fee_pct)}), unmap:o=>[o.id,o.appId,o.name,o.feePct] },
  transactions: { cols:["id","app_id","type","email","amount","source","at","status","ref","sender","delivery"], map:r=>({id:r.id,appId:r.app_id,type:r.type,email:r.email,amount:Number(r.amount),source:r.source,at:Number(r.at),status:r.status,ref:r.ref,sender:r.sender,delivery:r.delivery}), unmap:o=>[o.id,o.appId,o.type,o.email,o.amount,o.source,o.at,o.status,o.ref,o.sender??null,o.delivery] },
  subscribers: { cols:["id","email","name","status","since","auto_renew","plan_id"], map:r=>({id:r.id,email:r.email,name:r.name,status:r.status,since:Number(r.since),autoRenew:r.auto_renew,planId:r.plan_id}), unmap:o=>[o.id,o.email,o.name,o.status,o.since,o.autoRenew,o.planId??null] },
  activations: { cols:["id","at","email","name","from_status","to_status","plan_name","app_name","amount","ref"], map:r=>({id:r.id,at:Number(r.at),email:r.email,name:r.name,from:r.from_status,to:r.to_status,planName:r.plan_name,appName:r.app_name,amount:Number(r.amount),ref:r.ref}), unmap:o=>[o.id,o.at,o.email,o.name,o.from,o.to,o.planName,o.appName,o.amount,o.ref] },
  deliveries: { cols:["id","at","app_id","app_name","plan_name","customer_phone","address","zone_name","base_amount","fee_amount","total","ref","status","delivered_at"], map:r=>({id:r.id,at:Number(r.at),appId:r.app_id,appName:r.app_name,planName:r.plan_name,customerPhone:r.customer_phone,address:r.address,zoneName:r.zone_name,baseAmount:Number(r.base_amount),feeAmount:Number(r.fee_amount),total:Number(r.total),ref:r.ref,status:r.status,deliveredAt:r.delivered_at?Number(r.delivered_at):undefined}), unmap:o=>[o.id,o.at,o.appId,o.appName,o.planName,o.customerPhone,o.address,o.zoneName,o.baseAmount,o.feeAmount,o.total,o.ref,o.status,o.deliveredAt??null] },
  smsLog: { table:"sms_log", cols:["id","at","raw","ok","source","amount","ref","sender","webhook"], map:r=>({id:r.id,at:Number(r.at),raw:r.raw,ok:r.ok,source:r.source,amount:r.amount===null?null:Number(r.amount),ref:r.ref,sender:r.sender,webhook:r.webhook}), unmap:o=>[o.id,o.at,o.raw,o.ok,o.source??null,o.amount??null,o.ref??null,o.sender??null,o.webhook] },
  engineLog: { table:"engine_log", cols:["id","at","tag","msg","tone"], map:r=>({id:r.id,at:Number(r.at),tag:r.tag,msg:r.msg,tone:r.tone}), unmap:o=>[o.id,o.at,o.tag,o.msg,o.tone] }
};
const tableName=k=>TABLES[k].table||k;
const REQUIRED_TABLES=Object.keys(TABLES).map(tableName);

async function checkSchema(){
  const {rows:tr}=await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])",[REQUIRED_TABLES]);
  const available=new Set(tr.map(r=>r.table_name)); const missing=REQUIRED_TABLES.filter(t=>!available.has(t)); const present=REQUIRED_TABLES.filter(t=>available.has(t));
  if(!present.length)return missing;
  const {rows:cr}=await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",[present]);
  const by=new Map(); for(const r of cr){if(!by.has(r.table_name))by.set(r.table_name,new Set());by.get(r.table_name).add(r.column_name);}
  for(const [k,d] of Object.entries(TABLES)){const t=tableName(k);if(!available.has(t))continue;for(const c of ["user_id",...d.cols])if(!(by.get(t)||new Set()).has(c))missing.push(`${t}.${c}`);}
  return missing;
}

async function syncCollection(client,userId,key,rows){
  const d=TABLES[key], t=tableName(key); await client.query(`DELETE FROM ${t} WHERE user_id=$1`,[userId]); if(!rows?.length)return;
  const cols=["user_id",...d.cols], placeholders=[], values=[];
  rows.forEach((row,i)=>{const mapped=d.unmap(row),base=i*cols.length;placeholders.push("("+cols.map((_,j)=>`$${base+j+1}`).join(",")+")");values.push(userId,...mapped);});
  await client.query(`INSERT INTO ${t} (${cols.join(",")}) VALUES ${placeholders.join(",")}`,values);
}

export default async function handler(req,res){
  const session=requireAuth(req,res);if(!session)return;
  if(!dbReady())return sendJson(res,503,{error:"Base de données non configurée.",code:"config"});
  const userId=session.sub;
  try{
    const missing=await checkSchema();if(missing.length)return sendJson(res,503,{error:"Schéma de base de données incomplet.",code:"schema_missing",missingTables:missing});
    if(req.method==="GET"){
      const client=await pool.connect();try{await client.query("BEGIN");
        await client.query("INSERT INTO user_db_versions(user_id,version) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[userId]);
        const vr=await client.query("SELECT version FROM user_db_versions WHERE user_id=$1",[userId]);const db={rev:Number(vr.rows[0]?.version??0),webhookCount:0};
        for(const key of Object.keys(TABLES)){const t=tableName(key),order=["smsLog","engineLog","transactions"].includes(key)?"ORDER BY at DESC LIMIT 200":"";const {rows}=await client.query(`SELECT * FROM ${t} WHERE user_id=$1 ${order}`,[userId]);db[key]=rows.map(TABLES[key].map);}
        try{const sr=await client.query("SELECT * FROM merchant_settings WHERE user_id=$1",[userId]);const s=sr.rows[0];db.settings=s?{alarmEnabled:s.alarm_enabled,volume:s.volume,monitoring:s.monitoring,urgency:s.urgency,webhookUrl:s.webhook_url||"",secret:s.secret}:null;}catch{}
        try{const c=await client.query("SELECT COUNT(*)::int c FROM webhook_events WHERE user_id=$1",[userId]);db.webhookCount=c.rows[0]?.c??0;}catch{}
        await client.query("COMMIT");return sendJson(res,200,db);
      }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
    }
    if(req.method==="POST"){
      const body=await readBody(req);if(Array.isArray(body.apps))await requireActiveSubscription(userId);
      const client=await pool.connect();try{await client.query("BEGIN");
        let lock=await client.query("SELECT version FROM user_db_versions WHERE user_id=$1 FOR UPDATE",[userId]);
        let currentVersion;
        if(!lock.rows[0]){
          await client.query("INSERT INTO user_db_versions(user_id,version) VALUES($1,0)",[userId]);
          currentVersion=0;
        } else currentVersion=Number(lock.rows[0].version);
        const clientVersion=Number.isFinite(Number(body.rev))?Number(body.rev):0;
        /*
         * Migration compatibility: old clients can legitimately hold a higher
         * local revision while the new server row is still 0. Bootstrap the
         * server revision instead of returning 409 forever.
         */
        if(currentVersion===0 && clientVersion>0){
          await client.query("UPDATE user_db_versions SET version=$2,updated_at=now() WHERE user_id=$1",[userId,clientVersion]);
          currentVersion=clientVersion;
        } else if(clientVersion!==currentVersion){
          await client.query("ROLLBACK");
          return sendJson(res,409,{ok:false,code:"stale_write",error:"Cet état est obsolète : la version serveur a changé.",serverRev:currentVersion});
        }
        for(const key of Object.keys(TABLES))if(Array.isArray(body[key]))await syncCollection(client,userId,key,body[key].slice(0,300));
        if(body.settings){const s=body.settings;try{await client.query("INSERT INTO merchant_settings(user_id,alarm_enabled,volume,monitoring,urgency,webhook_url,secret) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET alarm_enabled=$2,volume=$3,monitoring=$4,urgency=$5,webhook_url=$6,secret=$7",[userId,!!s.alarmEnabled,Number(s.volume)||70,!!s.monitoring,String(s.urgency||"haute"),String(s.webhookUrl||""),String(s.secret||"")])}catch{}}
        const nextVersion=currentVersion+1;await client.query("UPDATE user_db_versions SET version=$2,updated_at=now() WHERE user_id=$1",[userId,nextVersion]);await client.query("COMMIT");
        return sendJson(res,200,{ok:true,rev:nextVersion});
      }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
    }
    return sendJson(res,405,{error:"Méthode non autorisée"});
  }catch(e){console.error("[zakapro:db]",e.message);return sendJson(res,500,{error:"Erreur serveur — réessayez.",code:"server",details:process.env.NODE_ENV==="development"?e.message:undefined})}
}
