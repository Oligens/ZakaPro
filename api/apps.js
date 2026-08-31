import crypto from "crypto";
import { dbReady, getSession, pool, readBody, sendJson } from "./_lib.js";
import { requireActiveSubscription } from "./_subscription.js";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée" });

    // Source de vérité côté serveur : abonnement payé/vie OU accès promo actif.
    await requireActiveSubscription(session.sub);

    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (name.length < 2) return sendJson(res, 400, { error: "Nom d'application requis.", code: "validation" });
    const id = String(body.id || crypto.randomUUID());
    const monogram = String(body.monogram || name.slice(0, 2)).trim().toUpperCase();
    const color = String(body.color || "#EAB308");
    const publicKey = String(body.publicKey || `zk_pub_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`);
    const secretKey = String(body.secretKey || `zk_sec_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`);
    const { rows } = await pool.query(
      `INSERT INTO apps (id, user_id, name, monogram, color, public_key, secret_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, monogram, color, public_key, secret_key, created_at`,
      [id, session.sub, name, monogram, color, publicKey, secretKey, Date.now()]
    );
    return sendJson(res, 201, { app: rows[0] });
  } catch (error) {
    console.error("[zakapro:apps]", error.message);
    const status = error.code === "subscription_required" ? 403 : 500;
    return sendJson(res, status, { error: error.message, code: error.code || "server" });
  }
}
