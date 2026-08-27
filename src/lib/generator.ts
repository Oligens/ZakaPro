import type { Source } from "./engine";
import { fmtNum, hubLink, type ZakaApp, type ZakaPlan } from "./data";

/* ============================================================
   ZakaPro — Générateur de snippets d'intégration
   Un SDK unique par application, initialisé avec son app_key.
   ============================================================ */

export interface SnippetOpts {
  webhook: string;
  amount: number;
  methods: Source[];
  planName?: string;
}

const methodsLit = (methods: Source[]): string =>
  "[" + (methods.length ? methods.map((m) => `"${m}"`).join(", ") : `"moncash", "natcash"`) + "]";

/** SDK Web JavaScript — à coller sur le site du marchand. */
export function sdkSnippet(app: ZakaApp, o: SnippetOpts): string {
  return [
    "<!-- ZakaPro SDK v3.0 — " + app.name + " -->",
    `<script src="https://cdn.zakapro.ht/sdk/v3/zaka.min.js"></script>`,
    "<script>",
    "  // Un seul SDK par application : il est initialisé avec l'app_key",
    "  const zaka = ZakaPro.init({",
    `    appKey: "${app.publicKey}",`,
    `    webhookUrl: "${o.webhook || "https://votre-site.ht/api/webhooks/zakapro"}",`,
    '    locale: "ht",          // "ht" | "fr" | "en"',
    '    theme: "dark",',
    "  });",
    "",
    "  // Déclenche le paiement Mobile Money (MonCash / Natcash)",
    `  document.querySelector("#pay-btn").addEventListener("click", async () => {`,
    "    const session = await zaka.checkout.open({",
    `      amount: ${o.amount},              // HTG`,
    '      currency: "HTG",',
    `      label: "${o.planName ?? app.name + " — paiement"}",`,
    `      methods: ${methodsLit(o.methods)},`,
    "      customer: { email: clientEmail },",
    "      onSuccess(tx) {",
    "        // Le webhook ZakaPro a déjà validé le paiement côté serveur",
    '        console.log("Paiement confirmé : " + tx.reference + " · " + tx.amount + " HTG");',
    "      },",
    "      onCancel() { /* afficher un message */ },",
    "    });",
    "  });",
    "</script>",
  ].join("\n");
}

/** Bouton autonome pointant vers le Hub de Paiement ZakaPro. */
export function hubButtonSnippet(app: ZakaApp, plan: ZakaPlan): string {
  const link = hubLink(app.id, plan.id);
  return [
    "<!-- Bouton Hub ZakaPro — copier/coller tel quel -->",
    `<a href="${link}" target="_blank" rel="noopener"`,
    '   style="display:inline-block;background:#EAB308;color:#090D16;border-radius:10px;',
    '          padding:14px 26px;font-weight:800;font-family:sans-serif;text-decoration:none">',
    `  Peye kounye a — ${fmtNum(plan.amount)} HTG`,
    "</a>",
    "",
    "<!-- Le Hub capture l'adresse + le téléphone du client,",
    "     applique les frais de zone, puis l'écouteur SMS confirme",
    "     le paiement et active le plan automatiquement. -->",
  ].join("\n");
}

/** Requête cURL signée avec la clé secrète de l'application. */
export function curlSnippet(app: ZakaApp, o: SnippetOpts): string {
  return [
    "# Création de session de paiement — API ZakaPro",
    "curl -X POST https://api.zakapro.ht/v1/checkout \\",
    `  -H "Authorization: Bearer ${app.secretKey.slice(0, 14)}…"  # clé secrète`,
    '  -H "Content-Type: application/json" \\',
    "  -d '{",
    `    "app_key": "${app.publicKey}",`,
    `    "amount": ${o.amount},`,
    '    "currency": "HTG",',
    `    "methods": [${o.methods.map((m) => `"${m}"`).join(", ")}],`,
    `    "callback_url": "${o.webhook || "https://votre-site.ht/api/webhooks/zakapro"}",`,
    '    "meta": { "plan": "' + (o.planName ?? "paiement") + '" }',
    "  }'",
  ].join("\n");
}

/** Vérification de webhook côté serveur (Node.js / Express). */
export function webhookSnippet(app: ZakaApp): string {
  return [
    "// server/webhook-zakapro.js — réception sécurisée des événements",
    'import express from "express";',
    'import crypto from "crypto";',
    "",
    "const app = express();",
    "",
    `// Clé secrète de l'application « ${app.name} » (stockée en variable d'environnement)`,
    `app.post("/webhooks/zakapro", express.raw({ type: "application/json" }), (req, res) => {`,
    '  const signature = req.headers["zakapro-signature"];',
    "  const expected = crypto",
    '    .createHmac("sha256", process.env.ZAKAPRO_APP_SECRET)',
    "    .update(req.body)",
    '    .digest("hex");',
    "",
    '  if (signature !== expected) return res.status(401).send("Signature invalide");',
    "",
    "  const event = JSON.parse(req.body);",
    '  if (event.event === "payment.confirmed" || event.event === "subscription.activated") {',
    "    const { reference, amount, method, customer, delivery } = event;",
    "    // 1) Activer l'abonnement premium / valider la commande",
    "    activateAccount(customer.email, event.meta.plan);",
    "    // 2) Alerte livraison chez le marchand (alarme temps réel)",
    '    if (delivery) notifyMerchant("Paiement " + amount + " HTG — livraison requise");',
    "    console.log(`[ZakaPro] ${method} · ${reference}`);",
    "  }",
    "  res.status(200).json({ received: true });",
    "});",
    "",
    "app.listen(3000);",
  ].join("\n");
}

/** Listener Android (Kotlin) — interception SMS temps réel. */
export function listenerSnippet(app: ZakaApp): string {
  return [
    "// ZakaProSmsListener.kt — écouteur SMS d'arrière-plan",
    "class ZakaProSmsListener : BroadcastReceiver() {",
    "",
    "  override fun onReceive(ctx: Context, intent: Intent) {",
    '    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return',
    "",
    '    val pdus = intent.extras?.get("pdus") as? Array<*> ?: return',
    "    for (pdu in pdus) {",
    "      val sms = SmsMessage.createFromPdu(pdu as ByteArray)",
    "      // Analyse regex SDK : source, montant HTG, référence, +509",
    "      val parsed = ZakaPro.parseSms(sms.messageBody)",
    "",
    `      if (parsed.isValid && parsed.appKey == "${app.publicKey}") {`,
    "        ZakaPro.triggerWebhook(parsed)   // événement payment.confirmed",
    "        ZakaPro.ringDeliveryAlarm(ctx)   // alarme si livraison requise",
    "        DashboardSync.push(parsed)       // tableau de bord temps réel",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
}

/** Copie dans le presse-papiers avec repli hors contexte sécurisé. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
