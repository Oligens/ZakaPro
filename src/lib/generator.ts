import type { Source } from "./engine";
import { fmtNum, hubLink, type ZakaApp, type ZakaPlan } from "./data";

export interface SnippetOpts { webhook: string; amount?: number; methods: Source[]; planName?: string; planId?: string; }
const DEFAULT_WEBHOOK = "https://votre-site.ht/api/webhooks/zakapro";
const methodsLit = (methods: Source[]) => "[" + (methods.length ? methods.map(JSON.stringify).join(", ") : '"moncash", "natcash"') + "]";
const js = (value: string) => JSON.stringify(value);

/** SDK universel : tous les plans de l'application sont chargés par app_key. */
export function sdkSnippet(app: ZakaApp, o: SnippetOpts): string {
  const webhook = o.webhook || DEFAULT_WEBHOOK;
  return [
    `<!-- ZakaPro SDK v4 — ${app.name} — plans dynamiques -->`,
    `<script src="https://cdn.zakapro.ht/sdk/v3/zaka.min.js"></script>`,
    "<script>",
    `const ZAKAPRO_APP_KEY = ${js(app.publicKey)};`,
    "const ZAKAPRO_PLANS_URL = `/api/apps/${encodeURIComponent(ZAKAPRO_APP_KEY)}/plans`;",
    "const zaka = ZakaPro.init({",
    "  appKey: ZAKAPRO_APP_KEY,",
    `  webhookUrl: ${js(webhook)},`,
    '  locale: "ht", theme: "dark",',
    "});",
    "",
    "async function loadZakaPlans() {",
    "  const response = await fetch(ZAKAPRO_PLANS_URL, { headers: { Accept: \"application/json\" } });",
    "  const body = await response.json();",
    "  if (!response.ok || !body.success) throw new Error(body.error || \"Impossible de charger les plans.\");",
    "  return Array.isArray(body.plans) ? body.plans : [];",
    "}",
    "",
    "async function populateZakaPlans() {",
    "  const select = document.querySelector(\"#zaka-plan\");",
    "  const plans = await loadZakaPlans();",
    "  if (!select) return plans;",
    "  select.replaceChildren();",
    "  for (const plan of plans) {",
    "    const option = document.createElement(\"option\");",
    "    option.value = plan.id; option.textContent = `${plan.name} — ${Number(plan.amount).toLocaleString()} HTG`;",
    "    select.appendChild(option);",
    "  }",
    "  return plans;",
    "}",
    "",
    "document.querySelector(\"#pay-btn\").addEventListener(\"click\", async () => {",
    "  try {",
    "    const plans = await loadZakaPlans();",
    "    const selectedId = document.querySelector(\"#zaka-plan\")?.value || plans[0]?.id;",
    "    const plan = plans.find((p) => p.id === selectedId);",
    "    if (!plan) throw new Error(\"Aucun plan valide n'est disponible.\");",
    "    await zaka.checkout.open({",
    "      planId: plan.id, amount: Number(plan.amount), currency: \"HTG\", label: plan.name,",
    `      methods: ${methodsLit(o.methods)},`,
    "      customer: { email: clientEmail }, meta: { planId: plan.id, appId: plan.appId },",
    "      onSuccess(tx) { console.log(\"Paiement confirmé\", tx.reference, plan.id); },",
    "      onCancel() { console.log(\"Paiement annulé\"); },",
    "    });",
    "  } catch (error) { console.error(\"[ZakaPro]\", error); }",
    "});",
    "void populateZakaPlans();",
    "</script>",
    '<select id="zaka-plan" name="zaka_plan" aria-label="Choisir un plan"></select>',
  ].join("\n");
}

export function hubButtonSnippet(app: ZakaApp, plan: ZakaPlan): string {
  const link = hubLink(app.id, plan.id);
  return ["<!-- Bouton Hub ZakaPro — planId -->", `<a href="${link}" target="_blank" rel="noopener" style="display:inline-block;background:#EAB308;color:#090D16;border-radius:10px;padding:14px 26px;font-weight:800;font-family:sans-serif;text-decoration:none">`, `  Peye kounye a — ${fmtNum(plan.amount)} HTG`, "</a>", "<!-- Le Hub utilise planId : aucun montant n'est codé en dur côté validation. -->"].join("\n");
}

export function curlSnippet(app: ZakaApp, o: SnippetOpts): string {
  return [
    "# Création de session — planId dynamique",
    "curl -X POST https://api.zakapro.ht/v1/checkout \\",
    `  -H "Authorization: Bearer ${app.secretKey.slice(0, 14)}…" \\",
    '  -H "Content-Type: application/json" \\",
    "  -d '{",
    `    "app_key": ${js(app.publicKey)},`,
    `    "plan_id": ${js(o.planId || "PLAN_ID_SELECTIONNE")},`,
    ...(o.amount === undefined ? [] : [`    "amount": ${Number(o.amount)},`]),
    '    "currency": "HTG",',
    `    "methods": ${methodsLit(o.methods)},`,
    `    "callback_url": ${js(o.webhook || DEFAULT_WEBHOOK)}`,
    "  }'",
  ].join("\n");
}

/** Exemple marchand : signature HMAC + validation planId/appId/montant dans PostgreSQL. */
export function webhookSnippet(app: ZakaApp): string {
  return [
    "// server/webhook-zakapro.js",
    'import express from "express"; import crypto from "crypto"; import pg from "pg";',
    "const { Pool } = pg; const db = new Pool({ connectionString: process.env.DATABASE_URL }); const app = express();",
    "function moneyEquals(a,b){ return Math.round(Number(a)*100)===Math.round(Number(b)*100); }",
    "async function validatePaymentPlan({appId,planId,amount}){",
    "  if(!appId||!planId) return {ok:false,error:\"appId et planId sont obligatoires.\"};",
    "  const {rows}=await db.query('SELECT id,app_id,name,amount,recurrence,delivery FROM plans WHERE id=$1 AND app_id=$2 LIMIT 1',[planId,appId]);",
    "  const plan=rows[0]; if(!plan) return {ok:false,error:\"Plan invalide pour cette application.\"};",
    "  if(!moneyEquals(amount,plan.amount)) return {ok:false,error:\"Montant différent du plan configuré.\"}; return {ok:true,plan};",
    "}",
    'app.post("/webhooks/zakapro",express.raw({type:"application/json"}),async(req,res)=>{',
    '  const signature=String(req.headers["zakapro-signature"]||""); const expected=crypto.createHmac("sha256",process.env.ZAKAPRO_APP_SECRET).update(req.body).digest("hex");',
    '  if(!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return res.status(401).json({error:"Signature invalide"});',
    "  try { const event=JSON.parse(req.body.toString(\"utf8\"));",
    '    if(event.event==="payment.confirmed"||event.event==="subscription.activated"){',
    '      const appId=String(event.appId||event.app?.id||event.meta?.appId||""); const planId=String(event.planId||event.meta?.planId||"");',
    "      const validation=await validatePaymentPlan({appId,planId,amount:Number(event.amount)}); if(!validation.ok) return res.status(422).json({error:validation.error});",
    "      const {plan}=validation; await activateAccount(event.customer?.email,plan.id,plan.name);",
    "      console.log(`[ZakaPro] ${event.reference} · ${plan.name}`);",
    "    } return res.status(200).json({received:true});",
    '  } catch(e) { return res.status(400).json({error:"Webhook invalide."}); }',
    "}); app.listen(3000);",
  ].join("\n");
}

export function listenerSnippet(app: ZakaApp): string { return ["// ZakaProSmsListener.kt", "class ZakaProSmsListener : BroadcastReceiver() {", "  override fun onReceive(ctx: Context, intent: Intent) {", "    val pdus = intent.extras?.get(\"pdus\") as? Array<*> ?: return", "    for (pdu in pdus) {", "      val sms = SmsMessage.createFromPdu(pdu as ByteArray)", "      val parsed = ZakaPro.parseSms(sms.messageBody)", `      if (parsed.isValid && parsed.appKey == ${JSON.stringify(app.publicKey)}) ZakaPro.triggerWebhook(parsed)`, "    }", "  }", "}"].join("\n"); }

export async function copyText(text: string): Promise<boolean> { try { await navigator.clipboard.writeText(text); return true; } catch { try { const ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); return true; } catch { return false; } } }
