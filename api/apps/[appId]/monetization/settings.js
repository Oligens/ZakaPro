import { dbReady, getSession, pool, readBody, sendJson } from "../../../_lib.js";
import { ensureMonetizationTables, getMonetizationConfig } from "../../../_wallet.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
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

  const result = await pool.query(
    `SELECT id, name, public_key, user_id
     FROM apps
     WHERE id::text = $1 OR public_key = $1
     LIMIT 1`,
    [appId]
  );
  const app = result.rows[0];
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
  if (!["GET", "PUT"].includes(req.method)) {
    return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  }
  if (!dbReady()) {
    return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  }

  try {
    const app = await getOwnedApp(req, res);
    if (!app) return;

    await ensureMonetizationTables();

    if (req.method === "GET") {
      return sendJson(res, 200, {
        app: { id: app.id, name: app.name, appKey: app.public_key },
        monetization: await getMonetizationConfig(app.id),
      });
    }

    const body = await readBody(req);
    const rate = Number(body.tokenToHtgRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) {
      return sendJson(res, 400, { error: "Le taux Jeton → HTG est invalide.", code: "invalid_rate" });
    }

    const inputRules = body.rules && typeof body.rules === "object" ? body.rules : {};
    const rules = {};
    for (const tier of ["standard", "intermediate", "vip"]) {
      const value = Number(inputRules[tier]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return sendJson(res, 400, { error: `Pourcentage invalide pour le palier ${tier}.`, code: "invalid_rule" });
      }
      rules[tier] = value;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO app_monetization_settings(app_id, token_to_htg_rate, enabled)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (app_id)
         DO UPDATE SET token_to_htg_rate = EXCLUDED.token_to_htg_rate, updated_at = now()`,
        [app.id, rate]
      );

      for (const [tier, pct] of Object.entries(rules)) {
        await client.query(
          `INSERT INTO revenue_share_rules(app_id, tier_level, creator_pct)
           VALUES ($1, $2, $3)
           ON CONFLICT (app_id, tier_level)
           DO UPDATE SET creator_pct = EXCLUDED.creator_pct, updated_at = now()`,
          [app.id, tier, pct]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }

    return sendJson(res, 200, {
      ok: true,
      app: { id: app.id, name: app.name, appKey: app.public_key },
      monetization: await getMonetizationConfig(app.id),
    });
  } catch (error) {
    console.error("[zakapro:monetization:settings]", error);
    return sendJson(res, 500, { error: "Impossible de sauvegarder la configuration.", code: "server" });
  }
}
