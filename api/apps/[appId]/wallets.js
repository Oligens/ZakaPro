import { dbReady, getSession, pool, sendJson } from "../../../_lib.js";
import { ensureMonetizationTables } from "../../../_wallet.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-ZakaPro-Signature");
}

async function getOwnedApp(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Authentification requise.", code: "unauthorized" });
    return null;
  }
  const appId = String(req.query?.appId || "").trim();
  if (!appId) {
    sendJson(res, 400, { error: "appId requis.", code: "missing_app_id" });
    return null;
  }
  const { rows } = await pool.query(
    `SELECT id, name, public_key, user_id
     FROM apps
     WHERE id::text = $1 OR public_key = $1
     LIMIT 1`,
    [appId]
  );
  const app = rows[0];
  if (!app) {
    sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });
    return null;
  }
  if (String(app.user_id) !== String(session.sub)) {
    sendJson(res, 403, { error: "Application non autorisée.", code: "forbidden" });
    return null;
  }
  return app;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    const app = await getOwnedApp(req, res);
    if (!app) return;
    await ensureMonetizationTables();

    const { rows } = await pool.query(
      `SELECT app_id, user_id, balance_real, balance_tokens, tier_level, updated_at
       FROM user_wallets
       WHERE app_id = $1
       ORDER BY updated_at DESC, user_id ASC`,
      [app.id]
    );

    const totals = await pool.query(
      `SELECT
         COALESCE(SUM(balance_real), 0) AS total_real,
         COALESCE(SUM(balance_tokens), 0) AS total_tokens
       FROM user_wallets
       WHERE app_id = $1`,
      [app.id]
    );

    const volume = await pool.query(
      `SELECT
         COUNT(*)::int AS transaction_count,
         COALESCE(SUM(ABS(delta)) FILTER (WHERE currency = 'HTG'), 0) AS volume_htg,
         COALESCE(SUM(ABS(delta)) FILTER (WHERE currency = 'TOKEN'), 0) AS volume_tokens
       FROM wallet_ledger
       WHERE app_id = $1`,
      [app.id]
    );

    return sendJson(res, 200, {
      app: { id: app.id, name: app.name, appKey: app.public_key },
      wallets: rows.map((row) => ({
        appId: row.app_id,
        userId: row.user_id,
        balanceReal: Number(row.balance_real),
        balanceTokens: Number(row.balance_tokens),
        tierLevel: row.tier_level,
        updatedAt: row.updated_at,
      })),
      totals: {
        totalReal: Number(totals.rows[0]?.total_real || 0),
        totalTokens: Number(totals.rows[0]?.total_tokens || 0),
        transactionCount: Number(volume.rows[0]?.transaction_count || 0),
        volumeHtg: Number(volume.rows[0]?.volume_htg || 0),
        volumeTokens: Number(volume.rows[0]?.volume_tokens || 0),
      },
    });
  } catch (error) {
    console.error("[zakapro:monetization:wallets]", error);
    return sendJson(res, 500, { error: "Impossible de charger les portefeuilles.", code: "server" });
  }
}
