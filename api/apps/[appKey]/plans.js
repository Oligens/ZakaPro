import { dbReady, pool, sendJson } from "../../_lib.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function resolveAppKey(req) {
  const pathKey = String(req.query?.appKey || "").trim();
  const queryKey = String(req.query?.app_key || "").trim();
  const appId = String(req.query?.app_id || "").trim();
  return { key: pathKey || queryKey, appId };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    const { key, appId } = resolveAppKey(req);
    if (!key && !appId) return sendJson(res, 400, { error: "app_key ou app_id requis.", code: "missing_app_identifier" });

    const appResult = key
      ? await pool.query(
          `SELECT id, name, public_key FROM apps WHERE id::text = $1 OR public_key = $1 LIMIT 1`,
          [key]
        )
      : await pool.query(
          `SELECT id, name, public_key FROM apps WHERE id::text = $1 LIMIT 1`,
          [appId]
        );

    const app = appResult.rows[0];
    if (!app) return sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });

    const { rows } = await pool.query(
      `SELECT id, app_id, name, amount, recurrence, delivery, created_at
       FROM plans
       WHERE app_id = $1
       ORDER BY created_at ASC, id ASC`,
      [app.id]
    );

    return sendJson(res, 200, {
      app: { id: app.id, name: app.name, appKey: app.public_key },
      plans: rows.map((plan) => ({
        id: plan.id,
        appId: plan.app_id,
        name: plan.name,
        amount: Number(plan.amount),
        recurrence: plan.recurrence,
        delivery: Boolean(plan.delivery),
        createdAt: Number(plan.created_at),
      })),
    });
  } catch (error) {
    console.error("[zakapro:apps:plans]", error.message);
    return sendJson(res, 500, { error: "Impossible de charger les plans de l'application.", code: "server" });
  }
}
