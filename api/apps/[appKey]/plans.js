import { dbReady, pool, sendJson } from "../../_lib.js";
import { getWalletProfile } from "../../_wallet.js";

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
          `SELECT a.id, a.user_id, a.name, a.public_key, a.color, a.monogram
           FROM apps a
           WHERE a.id::text = $1 OR a.public_key = $1
           LIMIT 1`,
          [key]
        )
      : await pool.query(
          `SELECT a.id, a.user_id, a.name, a.public_key, a.color, a.monogram
           FROM apps a
           WHERE a.id::text = $1
           LIMIT 1`,
          [appId]
        );
    const app = appResult.rows[0];
    if (!app) return sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });

    const { rows: plans } = await pool.query(
      `SELECT id, app_id, name, amount, recurrence, delivery, created_at
       FROM plans WHERE app_id = $1 ORDER BY created_at ASC, id ASC`,
      [app.id]
    );
    const { rows: zones } = await pool.query(
      `SELECT id, app_id, name, fee_pct FROM zones WHERE app_id = $1 ORDER BY name ASC, id ASC`,
      [app.id]
    );

    let wallets = await getWalletProfile(app.user_id);
    if (!wallets.moncashPhone || !wallets.natcashPhone) {
      // Compatibilité avec les anciennes bases qui stockaient encore le profil
      // directement dans users. Un schéma ancien sans ces colonnes ne doit
      // jamais casser le Hub public.
      try {
        const legacy = await pool.query(
          `SELECT moncash_name, moncash_phone, natcash_name, natcash_phone
           FROM users WHERE id = $1 LIMIT 1`,
          [app.user_id]
        );
        const row = legacy.rows[0];
        if (row) {
          wallets = {
            moncashName: wallets.moncashName || row.moncash_name || "",
            moncashPhone: wallets.moncashPhone || row.moncash_phone || "",
            natcashName: wallets.natcashName || row.natcash_name || "",
            natcashPhone: wallets.natcashPhone || row.natcash_phone || "",
          };
        }
      } catch (error) {
        console.warn("[zakapro:apps:plans:legacy-wallet]", error?.message || error);
      }
    }

    return sendJson(res, 200, {
      success: true,
      app: {
        id: app.id,
        name: app.name,
        appKey: app.public_key,
        color: app.color,
        monogram: app.monogram,
        wallets,
      },
      plans: plans.map((p) => ({
        id: p.id,
        appId: p.app_id,
        name: p.name,
        amount: Number(p.amount),
        recurrence: p.recurrence,
        delivery: Boolean(p.delivery),
        createdAt: Number(p.created_at),
      })),
      zones: zones.map((z) => ({
        id: z.id,
        appId: z.app_id,
        name: z.name,
        feePct: Number(z.fee_pct),
      })),
    });
  } catch (error) {
    console.error("[zakapro:apps:plans]", error);
    return sendJson(res, 500, {
      error: "Impossible de charger les plans de l'application.",
      code: "server",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
