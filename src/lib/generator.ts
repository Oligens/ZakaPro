import type { Source } from "./engine";
import { fmtNum, type ZakaApp, type ZakaPlan } from "./data";

export interface SnippetOpts { webhook: string; amount?: number; methods: Source[]; planName?: string; planId?: string; apiBase?: string; }
const DEFAULT_API_BASE="https://zakapro.vercel.app";
const DEFAULT_SDK_URL="https://zakapro.vercel.app/sdk/v4/zaka.js";
const methodsLiteral=(methods:Source[]):string=>JSON.stringify(methods.length?methods:["moncash","natcash"]);
const js=(value:unknown):string=>JSON.stringify(value);

export function sdkSnippet(app:ZakaApp,o:SnippetOpts):string{
 const apiBase=(o.apiBase||DEFAULT_API_BASE).replace(/\/$/,"");
 return ["<!-- ZakaPro SDK v4 — tous les plans de l'application -->",`<script src="${apiBase}/sdk/v4/zaka.js"></script>`,'<div id="zakapro-plans"></div>',"<script>","ZakaPro.init({",`  appKey: ${js(app.publicKey)},`,`  apiBase: ${js(apiBase)},`,'  container: "#zakapro-plans",',`  methods: ${methodsLiteral(o.methods)},`,'  buttonClass: "zakapro-payment-button"'," });","</script>","<style>",".zakapro-payment-button{display:block;width:100%;margin:10px 0;padding:14px 18px;border:0;border-radius:10px;background:#EAB308;color:#090D16;font:800 14px system-ui,sans-serif;cursor:pointer}",".zakapro-payment-button:hover{filter:brightness(1.06)}","</style>"].join("\n");
}

export function hubButtonSnippet(app:ZakaApp,plan:ZakaPlan):string{
 const href=`${DEFAULT_API_BASE}/#/hub/${encodeURIComponent(app.id)}/${encodeURIComponent(plan.id)}`;
 return [`<!-- ZakaPro — ${plan.name} — planId: ${plan.id} -->`,`<a href="${href}" target="_blank" rel="noopener noreferrer" data-zakapro-app-key="${app.publicKey}" data-zakapro-plan-id="${plan.id}" style="display:inline-block;background:#EAB308;color:#090D16;border-radius:10px;padding:14px 26px;font-weight:800;font-family:sans-serif;text-decoration:none">`,` Peye ${plan.name} — ${fmtNum(plan.amount)} HTG`,"</a>"].join("\n");
}

export function multiPlanButtonsSnippet(app:ZakaApp,plans:ZakaPlan[]):string{
 const active=plans.filter(p=>Number.isFinite(Number(p.amount))&&Number(p.amount)>0);
 if(!active.length)return "<!-- Aucun plan actif pour cette application. -->";
 return [`<!-- ZakaPro — ${app.name} — ${active.length} plan(s) -->`,'<div class="zakapro-plans" data-zakapro-app-key="'+app.publicKey+'">',...active.map(p=>{const href=`${DEFAULT_API_BASE}/#/hub/${encodeURIComponent(app.id)}/${encodeURIComponent(p.id)}`;return `  <a class="zakapro-plan-button" href="${href}" target="_blank" rel="noopener noreferrer" data-zakapro-app-key="${app.publicKey}" data-plan-id="${p.id}" data-amount="${Number(p.amount)}" data-recurrence="${p.recurrence||"unique"}">${p.name} — ${fmtNum(p.amount)} HTG</a>`;}),"</div>","<style>",".zakapro-plans{display:grid;gap:10px}.zakapro-plan-button{display:block;padding:14px 18px;border-radius:10px;background:#EAB308;color:#090D16;text-decoration:none;font:800 14px system-ui,sans-serif;text-align:center}.zakapro-plan-button:hover{filter:brightness(1.06)}","</style>"].join("\n");
}

export function generateCurlSnippet(app:{publicKey:string},o:{planId?:string}):string{
 const planId=o.planId||"PLAN_ID_SELECTIONNE";
 return [
 `# Crée une intention de paiement — le prix est lu côté serveur depuis PostgreSQL`,
 `curl -X POST https://zakapro.vercel.app/api/apps/${encodeURIComponent(app.publicKey)}/checkout \\\n`,
 `  -H "Content-Type: application/json" \\\n`,
 `  -d '${JSON.stringify({planId,customerName:"Jean Exemple",email:"client@example.com",phone:"37124589"},null,2)}'`
 ].join("");
}
export function curlSnippet(app:ZakaApp,o:SnippetOpts):string{return generateCurlSnippet(app,{planId:o.planId});}

export function webhookSnippet(app:ZakaApp):string{
 return [
 "// Node.js / Express — endpoint de votre application, pas l'endpoint ZakaPro",
 "// ZakaPro envoie POST vers l'URL configurée dans le tableau de bord.",
 'import express from "express"; import crypto from "crypto";',
 "const app = express();",
 'const WEBHOOK_SECRET = process.env.ZAKAPRO_APP_SECRET;',
 'app.post("/webhooks/zakapro", express.raw({type:"application/json"}), (req,res) => {',
 '  if (!WEBHOOK_SECRET) return res.status(500).json({error:"ZAKAPRO_APP_SECRET manquant"});',
 '  const received = String(req.headers["x-zakapro-signature"] || "");',
 '  const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(req.body).digest("hex");',
 '  const a=Buffer.from(received); const b=Buffer.from(expected);',
 '  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:"Signature invalide"});',
 '  let event; try { event=JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({error:"JSON invalide"}); }',
 '  if (event.event === "subscription.activated") console.log("Paiement confirmé", event.reference, event.planId, event.plan, event.amount, event.method);',
 '  return res.status(200).json({received:true});',
 '});',
 `// appKey attendu: ${app.publicKey}`
 ].join("\n");
}

export function listenerSnippet(app:ZakaApp):string{
 return [
 "// Android — BroadcastReceiver : transmet uniquement le SMS brut au backend ZakaPro.",
 "// IMPORTANT : ne mettez jamais la clé secrète de l'application dans l'APK.",
 "// Configurez SMS_LISTENER_SECRET côté serveur / proxy sécurisé.",
 "class ZakaProSmsListener : BroadcastReceiver() {",
 "  override fun onReceive(ctx: Context, intent: Intent) {",
 '    val bundle = intent.extras ?: return',
 '    val pdus = bundle.get("pdus") as? Array<*> ?: return',
 '    val format = bundle.getString("format")',
 '    for (pdu in pdus) {',
 '      val sms = if (format != null) SmsMessage.createFromPdu(pdu as ByteArray, format) else SmsMessage.createFromPdu(pdu as ByteArray)',
 '      val raw = sms.messageBody ?: continue',
 `      sendToZakaPro(ctx, raw, "${app.publicKey}")`,
 "    }",
 "  }",
 "}",
 "",
 "// Implémentez sendToZakaPro avec votre transport HTTPS sécurisé vers :",
 "// POST https://zakapro.vercel.app/api/sms",
 "// Header: X-Listener-Key = secret serveur",
 "// JSON: { \"raw\": \"<SMS brut>\" }",
 "// Le backend ZakaPro parse MonCash/Natcash, retrouve l'intention par référence",
 "// et valide montant + identité avant activation."
 ].join("\n");
}
export async function copyText(text:string):Promise<boolean>{try{await navigator.clipboard.writeText(text);return true}catch{try{const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);return true}catch{return false}}}
export const ZAKAPRO_SDK_URL=DEFAULT_SDK_URL;
