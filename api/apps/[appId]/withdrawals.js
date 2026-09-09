import { dbReady, getSession, pool, readBody, sendJson } from "../../../_lib.js";
import { ensureMonetizationTables, creditWallet } from "../../../_wallet.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
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
  if (!["GET", "PATCH"].includes(req.method)) {
    return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  }
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    const app = await getOwnedApp(req, res);
    if (!app) return;
    await ensureMonetizationTables();

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT id, user_id, amount, currency, method, destination, status, admin_note, created_at, completed_at
         FROM withdrawal_requests
         WHERE app_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [app.id]
      );
      return sendJson(res, 200, {
        withdrawals: rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          amount: Number(row.amount),
          currency: row.currency,
          method: row.method,
          destination: row.destination,
          status: row.status,
          adminNote: row.admin_note,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        })),
      });
    }

    const body = await readBody(req);
    const withdrawalId = String(body.withdrawalId || "").trim();
    const nextStatus = String(body.status || "").trim().toLowerCase();
    const adminNote = String(body.adminNote || "").trim().slice(0, 500);

    if (!withdrawalId || !["processing", "completed", "rejected", "cancelled"].includes(nextStatus)) {
      return sendJson(res, 400, { error: "Demande de retrait ou statut invalide.", code: "validation" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT *
         FROM withdrawal_requests
         WHERE id::text = $1 AND app_id = $2
         FOR UPDATE`,
        [withdrawalId, app.id]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return sendJson(res, 404, { error: "Demande de retrait introuvable.", code: "not_found" });
      }

      const withdrawal = current.rows[0];
      if (["completed", "rejected", "cancelled"].includes(withdrawal.status)) {
        await client.query("ROLLBACK");
        return sendJson(res, 409, { error: "Cette demande est déjà clôturée.", code: "already_closed" });
      }

      if (["rejected", "cancelled"].includes(nextStatus)) {
        await creditWallet(client, {
          appId: app.id,
          userId: withdrawal.user_id,
          amount: Number(withdrawal.amount),
          currency: withdrawal.currency,
          reason: "withdrawal_refund",
          reference: `withdrawal-refund:${withdrawal.id}`,
          metadata: { withdrawalId: withdrawal.id, status: nextStatus },
        });
      }

      const { rows } = await client.query(
        `UPDATE withdrawal_requests
         SET status = $1,
             admin_note = $2,
             completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
         WHERE id = $3
         RETURNING id, user_id, amount, currency, method, destination, status, admin_note, created_at, completed_at`,
        [nextStatus, adminNote || null, withdrawal.id]
      );
      await client.query("COMMIT");

      return sendJson(res, 200, {
        ok: true,
        refunded: ["rejected", "cancelled"].includes(nextStatus),
        withdrawal: {
          id: rows[0].id,
          userId: rows[0].user_id,
          amount: Number(rows[0].amount),
          currency: rows[0].currency,
          method: rows[0].method,
          destination: rows[0].destination,
          status: rows[0].status,
          adminNote: rows[0].admin_note,
          createdAt: rows[0].created_at,
          completedAt: rows[0].completed_at,
        },
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[zakapro:monetization:withdrawals]", error);
    return sendJson(res, 500, { error: "Impossible de traiter la demande de retrait.", code: "server" });
  }
}
