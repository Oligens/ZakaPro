import { dbReady, getSession, pool, readBody, sendJson } from "../_lib.js";
import { requireActiveSubscription } from "../_subscription.js";

/**
 * PATCH /api/apps/:appKey
 * Renomme une application appartenant à l'utilisateur courant.
 * appKey correspond à apps.public_key (l'app_key exposée au marchand).
 */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    if (req.method !== "PATCH") return sendJson(res, 405, { error: "Méthode non autorisée" });

    // La gestion des applications reste soumise au même contrôle Premium que leur création.
    await requireActiveSubscription(session.sub);

    const appKey = String(req.query?.appKey || "").trim();
    if (!appKey) return sendJson(res, 400, { error: "app_key requis.", code: "validation" });

    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (name.length < 2) return sendJson(res, 400, { error: "Le nom doit contenir au moins 2 caractères.", code: "validation" });
    if (name.length > 80) return sendJson(res, 400, { error: "Le nom ne peut pas dépasser 80 caractères.", code: "validation" });

    const { rows } = await pool.query(
      `UPDATE apps
       SET name = $1,
           monogram = $2
       WHERE user_id = $3 AND public_key = $4
       RETURNING id, name, monogram, color, public_key, secret_key, created_at`,
      [name, name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase(), session.sub, appKey]
    );

    if (!rows.length) return sendJson(res, 404, { error: "Application introuvable.", code: "not_found" });
    return sendJson(res, 200, { app: rows[0] });
  } catch (error) {
    console.error("[zakapro:apps:rename]", error.message);
    const status = error.code === "subscription_required" ? 403 : 500;
    return sendJson(res, status, { error: error.message, code: error.code || "server" });
  }
}
