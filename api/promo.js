import crypto from "crypto";
import { getSession, pool, dbReady, readBody, sendJson } from "./_lib.js";
import { activateSubscription } from "./_subscription.js";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée" });

  const body = await readBody(req);
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return sendJson(res, 400, { error: "Code promo requis.", code: "validation" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT code, duration_type, is_used, expires_at
       FROM promo_codes WHERE code = $1 FOR UPDATE`,
      [code]
    );
    const promo = result.rows[0];
    if (!promo || promo.is_used || (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now())) {
      await client.query("ROLLBACK");
      return sendJson(res, 400, { error: "Code promo invalide, expiré ou déjà utilisé.", code: "invalid_promo" });
    }
    const reference = `PROMO-${code}-${session.sub}-${crypto.randomUUID()}`;
    await activateSubscription(client, session.sub, promo.duration_type, 0, "promo", reference, null, null);
    await client.query(
      `UPDATE promo_codes
       SET is_used = true, used_at = now(), used_by = $2
       WHERE code = $1`,
      [code, session.sub]
    );
    await client.query("COMMIT");
    return sendJson(res, 200, { ok: true, plan: promo.duration_type, message: "Abonnement activé par code promo." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[zakapro:promo]", error.message);
    return sendJson(res, 500, { error: "Impossible d'activer le code promo.", code: "server" });
  } finally {
    client.release();
  }
}
