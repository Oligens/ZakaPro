import { pool, dbReady, requireAuth, readBody, sendJson } from "../../_lib.js";
import { requireActiveSubscription } from "../../_subscription.js";

const MAX_URL_LENGTH = 2048;

function normalizeWebhookUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length > MAX_URL_LENGTH) throw new Error("L'URL du webhook ne peut pas dépasser 2048 caractères.");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("URL de webhook invalide."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Le webhook doit utiliser HTTP ou HTTPS.");
  if (!parsed.hostname) throw new Error("Domaine du webhook manquant.");
  return parsed.toString();
}

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  const appKey = String(req.query?.appKey || "").trim();
  if (!appKey) return sendJson(res, 400, { error: "appKey requis.", code: "missing_app_key" });

  try {
    const appResult = await pool.query(
      `SELECT id, name, public_key, webhook_url FROM apps WHERE user_id = $1 AND (id = $2 OR public_key = $2) LIMIT 1`,
      [session.sub, appKey]
    );
    const app = appResult.rows[0];
    if (!app) return sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });

    if (req.method === "GET") {
      return sendJson(res, 200, {
        appId: app.id,
        appKey: app.public_key,
        webhookUrl: app.webhook_url || "",
        configured: Boolean(app.webhook_url),
      });
    }

    if (req.method !== "PATCH" && req.method !== "PUT") return sendJson(res, 405, { error: "Méthode non autorisée." });

    await requireActiveSubscription(session.sub);
    const body = await readBody(req);
    const webhookUrl = normalizeWebhookUrl(body.webhookUrl ?? body.callbackUrl ?? body.url);

    const updated = await pool.query(
      `UPDATE apps SET webhook_url = $1 WHERE user_id = $2 AND id = $3 RETURNING id, name, public_key, webhook_url`,
      [webhookUrl || null, session.sub, app.id]
    );
    const row = updated.rows[0];
    return sendJson(res, 200, {
      ok: true,
      app: { id: row.id, name: row.name, appKey: row.public_key, webhookUrl: row.webhook_url || "" },
      fallback: webhookUrl ? false : true,
      message: webhookUrl ? "Webhook de l'application enregistré." : "Webhook de l'application supprimé : le webhook global sera utilisé en secours.",
    });
  } catch (err) {
    if (err?.code === "subscription_required") return sendJson(res, 403, { error: err.message, code: err.code });
    if (/URL de webhook|webhook doit|Domaine du webhook|dépasser 2048/.test(String(err?.message || ""))) {
      return sendJson(res, 400, { error: err.message, code: "invalid_webhook_url" });
    }
    console.error("[zakapro:apps:webhook]", err);
    return sendJson(res, 500, { error: "Impossible de sauvegarder le webhook de l'application.", code: "server" });
  }
}
