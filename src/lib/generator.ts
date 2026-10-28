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
 return [
  `<!-- ZakaPro — ${plan.name} — planId: ${plan.id} — modal checkout -->`,
  '<script src="https://zakapro.vercel.app/sdk/v4/zaka.js"></script>',
  `<button type="button" id="zakapro-plan-${plan.id}" data-zakapro-app-key="${app.publicKey}" data-zakapro-plan-id="${plan.id}" style="display:inline-block;background:#EAB308;color:#090D16;border:0;border-radius:10px;padding:14px 26px;font-weight:800;font-family:sans-serif;cursor:pointer">Peye ${plan.name} — ${fmtNum(plan.amount)} HTG</button>`,
  '<script>',
  `const zaka=ZakaPro.init({appKey: ${js(app.publicKey)}, autoRender:false});`,
  `document.getElementById("zakapro-plan-${plan.id}").addEventListener("click",()=>zaka.openPlan(${js(plan.id)}));`,
  '</script>'
 ].join("\n");
}

export function multiPlanButtonsSnippet(app:ZakaApp,plans:ZakaPlan[]):string{
 const active=plans.filter(p=>Number.isFinite(Number(p.amount))&&Number(p.amount)>0);
 if(!active.length)return "<!-- Aucun plan actif pour cette application. -->";
 return [
  `<!-- ZakaPro — ${app.name} — ${active.length} plan(s) — checkout modal, aucun nouvel onglet -->`,
  '<script src="https://zakapro.vercel.app/sdk/v4/zaka.js"></script>',
  '<div id="zakapro-plans"></div>',
  '<script>',
  `const zaka=ZakaPro.init({appKey: ${js(app.publicKey)}, container:"#zakapro-plans", methods:["moncash","natcash"]});`,
  '</script>',
  '<style>.zakapro-payment-button{display:block;width:100%;margin:10px 0;padding:14px 18px;border:0;border-radius:10px;background:#EAB308;color:#090D16;font:800 14px system-ui,sans-serif;cursor:pointer}</style>'
 ].join("\n");
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
 '  if (event.event === "subscription.activated") console.log("Paiement confirmé", event.reference, event.plan?.id, event.plan?.name, event.amount, event.method);',
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

export function monetizationWidgetSnippet(app: ZakaApp, recipientUserId = "USER_TARGET_ID"): string {
  return [
    `<!-- ZakaPro — Widget de monétisation pour ${app.name} -->`,
    `<div id="zakapro-monetization-widget" data-zakapro-app-key="${app.publicKey}" data-recipient-user-id="${recipientUserId}" data-theme="glassmorphism"></div>`,
    '<script src="https://zakapro.vercel.app/sdk/v4/widget.js" async></script>',
    '<script>',
    'window.addEventListener("DOMContentLoaded",function(){',
    '  const el=document.getElementById("zakapro-monetization-widget");',
    '  const widget=ZakaProMonetization.init({appKey:el.dataset.zakaproAppKey,recipientUserId:el.dataset.recipientUserId,apiBase:"https://zakapro.vercel.app"});',
    '  el.innerHTML=\'<button type="button" style="display:inline-block;background:#EAB308;color:#090D16;border:0;border-radius:10px;padding:13px 22px;font:800 14px system-ui;cursor:pointer">Faire un don</button>\';',
    '  el.querySelector("button").addEventListener("click",function(){widget.open();});',
    '});',
    '</script>',
  ].join("\n");
}

/**
 * Construit automatiquement un prompt unique prêt à coller dans une IA.
 * Il contient la configuration de l'application et TOUS les codes générés
 * par l'onglet Intégration. La clé secrète n'est volontairement jamais incluse.
 */
export function completeIntegrationPrompt(
  app: ZakaApp,
  plans: ZakaPlan[],
  options: { webhook: string; methods: Source[]; apiBase?: string }
): string {
  const selectedPlan = plans[0];
  const snippets: Array<[string, string]> = [
    ["SDK Web — tous les plans", sdkSnippet(app, { webhook: options.webhook, methods: options.methods, planId: selectedPlan?.id, planName: selectedPlan?.name, amount: selectedPlan?.amount, apiBase: options.apiBase })],
    ["Boutons multi-plans", multiPlanButtonsSnippet(app, plans)],
    ["cURL", curlSnippet(app, { webhook: options.webhook, methods: options.methods, planId: selectedPlan?.id })],
    ["Monétisation", monetizationWidgetSnippet(app)],
    ["Webhook Node.js", webhookSnippet(app)],
    ["Listener Android", listenerSnippet(app)],
  ];

  const planTable = plans.length
    ? plans.map((p) => `- ${p.name} | ID: ${p.id} | ${fmtNum(p.amount)} HTG | ${p.recurrence} | livraison: ${p.delivery ? "oui" : "non"} | type: ${p.productType}`).join("\n")
    : "- Aucun plan configuré";

  return [
    `# PROMPT D'INTÉGRATION ZAKAPRO — ${app.name}`,
    "",
    "Tu es un développeur senior. Intègre ZakaPro dans mon application existante sans casser son architecture, ses routes, ses API, son authentification ou sa logique métier.",
    "",
    "## OBJECTIF",
    "Implémenter le paiement ZakaPro avec les plans configurés, le checkout, les méthodes Mobile Money sélectionnées, le webhook signé et, si nécessaire, le listener Android. Utilise les codes ci-dessous comme source de vérité et adapte uniquement ce qui est nécessaire au framework de mon projet.",
    "",
    "## CONFIGURATION",
    `- Application: ${app.name}`,
    `- App key publique: ${app.publicKey}`,
    `- API base: ${options.apiBase || DEFAULT_API_BASE}`,
    `- Webhook configuré: ${options.webhook || "non configuré"}`,
    `- Méthodes: ${options.methods.length ? options.methods.join(", ") : "moncash, natcash"}`,
    "",
    "## PLANS CONFIGURÉS",
    planTable,
    "",
    "## RÈGLES DE SÉCURITÉ",
    "- Ne jamais mettre la clé secrète ZakaPro dans le navigateur, une application mobile ou un dépôt public.",
    "- La clé publique peut être exposée côté client.",
    "- Vérifier les événements webhook avec HMAC-SHA256 avant de confirmer un paiement.",
    "- Ne jamais considérer un paiement comme confirmé uniquement à partir du montant fourni par le client.",
    "- Conserver les secrets dans les variables d'environnement du serveur.",
    "",
    "## CODES GÉNÉRÉS PAR ZAKAPRO",
    ...snippets.flatMap(([title, code]) => [`### ${title}`, "```", code, "```", ""]),
    "## LIVRABLE ATTENDU",
    "Retourne les fichiers à créer/modifier, les dépendances nécessaires, les variables d'environnement à configurer et les étapes de test. Ne supprime aucune fonctionnalité existante. Vérifie les erreurs TypeScript/JavaScript et les incompatibilités avec le framework avant de considérer l'intégration terminée.",
  ].join("\n");
}
