import { dbReady, pool, sendJson } from "./_lib.js";

function clean(value, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  }
  if (!dbReady()) {
    return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  }

  try {
    const appKey = clean(req.query?.appKey, 255);
    const reference = clean(req.query?.reference, 128);

    if (!appKey || !reference) {
      return sendJson(res, 400, {
        error: "appKey et reference requis.",
        code: "missing_parameters",
      });
    }

    const appResult = await pool.query(
      `SELECT id, public_key
       FROM apps
       WHERE id::text = $1 OR public_key = $1
       LIMIT 1`,
      [appKey]
    );
    const app = appResult.rows[0];

    if (!app) {
      return sendJson(res, 404, {
        error: "Application introuvable.",
        code: "app_not_found",
      });
    }

    const result = await pool.query(
      `SELECT
         cpi.status,
         cpi.reference,
         cpi.total_amount,
         cpi.paid_at,
         cpi.expires_at,
         p.id AS plan_id,
         p.name AS plan_name,
         p.amount AS plan_amount,
         a.id AS app_id
       FROM checkout_payment_intents cpi
       JOIN plans p
         ON p.id = cpi.plan_id
        AND p.app_id = cpi.app_id
       JOIN apps a
         ON a.id = cpi.app_id
       WHERE cpi.reference = $1
         AND cpi.app_id = $2
       LIMIT 1`,
      [reference, app.id]
    );

    const row = result.rows[0];

    if (!row) {
      return sendJson(res, 404, {
        error: "Intention de paiement introuvable.",
        code: "intent_not_found",
      });
    }

    let status = String(row.status || "pending");

    if (
      status === "pending" &&
      row.expires_at &&
      new Date(row.expires_at).getTime() < Date.now()
    ) {
      status = "expired";
    }

    return sendJson(res, 200, {
      status,
      reference: row.reference,
      amount: Number(row.total_amount),
      paidAt: row.paid_at || null,
      expiresAt: row.expires_at || null,
      plan: {
        id: row.plan_id,
        name: row.plan_name,
        amount: Number(row.plan_amount),
      },
      appId: row.app_id,
    });
  } catch (error) {
    console.error("[zakapro:checkout-status]", error);
    return sendJson(res, 500, {
      error: "Impossible de vérifier le paiement.",
      code: "server",
    });
  }
}
