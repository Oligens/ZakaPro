/* ============================================================
   ZakaPro — Données utilisateur (Vercel Serverless)
   GET  /api/db  → charge l'état complet de l'utilisateur courant
   POST /api/db  → synchronise les collections (transaction SQL)
   ISOLATION : TOUTES les requêtes filtrent WHERE user_id = $1
   ============================================================ */

import { pool, dbReady, requireAuth, readBody, sendJson } from "./_lib.js";
import { requireActiveSubscription } from "./_subscription.js";

const TABLES = {
  apps: {
    cols: ["id", "name", "monogram", "color", "public_key", "secret_key", "webhook_url", "created_at"],
    map: (r) => ({ id: r.id, name: r.name, monogram: r.monogram, color: r.color, publicKey: r.public_key, secretKey: r.secret_key, webhookUrl: r.webhook_url || "", createdAt: Number(r.created_at) }),
    unmap: (o) => [o.id, o.name, o.monogram, o.color, o.publicKey, o.secretKey, o.webhookUrl || "", o.createdAt],
  },
  plans: {
    cols: ["id", "app_id", "name", "amount", "recurrence", "delivery", "created_at"],
    map: (r) => ({ id: r.id, appId: r.app_id, name: r.name, amount: Number(r.amount), recurrence: r.recurrence, delivery: r.delivery, createdAt: Number(r.created_at) }),
    unmap: (o) => [o.id, o.appId, o.name, o.amount, o.recurrence, o.delivery, o.createdAt],
  },
  zones: {
    cols: ["id", "app_id", "name", "fee_pct"],
    map: (r) => ({ id: r.id, appId: r.app_id, name: r.name, feePct: Number(r.fee_pct) }),
    unmap: (o) => [o.id, o.appId, o.name, o.feePct],
  },
  transactions: {
    cols: ["id", "app_id", "type", "email", "amount", "source", "at", "status", "ref", "sender", "delivery"],
    map: (r) => ({ id: r.id, appId: r.app_id, type: r.type, email: r.email, amount: Number(r.amount), source: r.source, at: Number(r.at), status: r.status, ref: r.ref, sender: r.sender, delivery: r.delivery }),
    unmap: (o) => [o.id, o.appId, o.type, o.email, o.amount, o.source, o.at, o.status, o.ref, o.sender ?? null, o.delivery],
  },
  subscribers: {
    cols: ["id", "email", "name", "status", "since", "auto_renew", "plan_id"],
    map: (r) => ({ id: r.id, email: r.email, name: r.name, status: r.status, since: Number(r.since), autoRenew: r.auto_renew, planId: r.plan_id }),
    unmap: (o) => [o.id, o.email, o.name, o.status, o.since, o.autoRenew, o.planId ?? null],
  },
  activations: {
    cols: ["id", "at", "email", "name", "from_status", "to_status", "plan_name", "app_name", "amount", "ref"],
    map: (r) => ({ id: r.id, at: Number(r.at), email: r.email, name: r.name, from: r.from_status, to: r.to_status, planName: r.plan_name, appName: r.app_name, amount: Number(r.amount), ref: r.ref }),
    unmap: (o) => [o.id, o.at, o.email, o.name, o.from, o.to, o.planName, o.appName, o.amount, o.ref],
  },
  deliveries: {
    cols: ["id", "at", "app_id", "app_name", "plan_name", "customer_phone", "address", "zone_name", "base_amount", "fee_amount", "total", "ref", "status", "delivered_at"],
    map: (r) => ({ id: r.id, at: Number(r.at), appId: r.app_id, appName: r.app_name, planName: r.plan_name, customerPhone: r.customer_phone, address: r.address, zoneName: r.zone_name, baseAmount: Number(r.base_amount), feeAmount: Number(r.fee_amount), total: Number(r.total), ref: r.ref, status: r.status, deliveredAt: r.delivered_at ? Number(r.delivered_at) : undefined }),
    unmap: (o) => [o.id, o.at, o.appId, o.appName, o.planName, o.customerPhone, o.address, o.zoneName, o.baseAmount, o.feeAmount, o.total, o.ref, o.status, o.deliveredAt ?? null],
  },
  smsLog: { table: "sms_log", cols: ["id", "at", "raw", "ok", "source", "amount", "ref", "sender", "webhook"], map: (r) => ({ id: r.id, at: Number(r.at), raw: r.raw, ok: r.ok, source: r.source, amount: r.amount === null ? null : Number(r.amount), ref: r.ref, sender: r.sender, webhook: r.webhook }), unmap: (o) => [o.id, o.at, o.raw, o.ok, o.source ?? null, o.amount ?? null, o.ref ?? null, o.sender ?? null, o.webhook] },
  engineLog: { table: "engine_log", cols: ["id", "at", "tag", "msg", "tone"], map: (r) => ({ id: r.id, at: Number(r.at), tag: r.tag, msg: r.msg, tone: r.tone }), unmap: (o) => [o.id, o.at, o.tag, o.msg, o.tone] },
};

const tableName = (key) => TABLES[key].table || key;
const REQUIRED_TABLES = Object.keys(TABLES).map(tableName);

async function checkSchema() {
  const { rows: tableRows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [REQUIRED_TABLES]);
  const available = new Set(tableRows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !available.has(table));
  const presentTables = REQUIRED_TABLES.filter((table) => available.has(table));
  if (!presentTables.length) return missing;
  const { rows: columnRows } = await pool.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [presentTables]);
  const columnsByTable = new Map();
  for (const row of columnRows) { if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set()); columnsByTable.get(row.table_name).add(row.column_name); }
  for (const [key, definition] of Object.entries(TABLES)) {
    const table = tableName(key); if (!available.has(table)) continue;
    const requiredColumns = ["user_id", ...definition.cols]; const columns = columnsByTable.get(table) || new Set();
    for (const column of requiredColumns) if (!columns.has(column)) missing.push(`${table}.${column}`);
  }
  return missing;
}

async function syncCollection(client, userId, key, rows) {
  const def = TABLES[key]; const table = tableName(key);
  await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  if (!rows || !rows.length) return;
  const cols = ["user_id", ...def.cols]; const placeholders = []; const values = [];
  rows.forEach((row, i) => { const mapped = def.unmap(row); const base = i * (def.cols.length + 1); placeholders.push("(" + cols.map((_, j) => `$${base + j + 1}`).join(", ") + ")"); values.push(userId, ...mapped); });
  await client.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${placeholders.join(", ")}`, values);
}

export default async function handler(req, res) {
  const session = requireAuth(req, res); if (!session) return;
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée : vérifiez DATABASE_URL sur Vercel.", code: "config" });
  const userId = session.sub;
  try {
    const missingTables = await checkSchema();
    if (missingTables.length) return sendJson(res, 503, { error: "Schéma de base de données incomplet : exécutez db/schema.sql dans Neon.", code: "schema_missing", missingTables });
    if (req.method === "GET") {
      const db = { rev: 0, webhookCount: 0 };
      for (const key of Object.keys(TABLES)) {
        const table = tableName(key); const order = key === "smsLog" || key === "engineLog" || key === "transactions" ? "ORDER BY at DESC LIMIT 200" : "";
        const { rows } = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ${order}`, [userId]); db[key] = rows.map(TABLES[key].map);
      }
      let settings = null;
      try {
        const settingsResult = await pool.query("SELECT * FROM merchant_settings WHERE user_id = $1", [userId]); const s = settingsResult.rows[0];
        if (s) settings = { alarmEnabled: s.alarm_enabled, volume: s.volume, monitoring: s.monitoring, urgency: s.urgency, webhookUrl: s.webhook_url || "", secret: s.secret };
      } catch (err) { console.warn("[zakapro:db:settings]", err.message); }
      db.settings = settings;
      try { const counters = await pool.query("SELECT COUNT(*)::int AS c FROM webhook_events WHERE user_id = $1", [userId]); db.webhookCount = counters.rows[0]?.c ?? 0; } catch (err) { console.warn("[zakapro:db:webhook]", err.message); }
      return sendJson(res, 200, db);
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (Array.isArray(body.apps)) await requireActiveSubscription(userId);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const key of Object.keys(TABLES)) if (Array.isArray(body[key])) await syncCollection(client, userId, key, body[key].slice(0, 300));
        if (body.settings) {
          const st = body.settings;
          try { await client.query(`INSERT INTO merchant_settings (user_id, alarm_enabled, volume, monitoring, urgency, webhook_url, secret) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET alarm_enabled=$2, volume=$3, monitoring=$4, urgency=$5, webhook_url=$6, secret=$7`, [userId, Boolean(st.alarmEnabled), Number(st.volume) || 70, Boolean(st.monitoring), String(st.urgency || "haute"), String(st.webhookUrl || ""), String(st.secret || "")]); } catch (err) { console.warn("[zakapro:db:settings:write]", err.message); }
        }
        await client.query("COMMIT"); return sendJson(res, 200, { ok: true, rev: Number(body.rev) || 0 });
      } catch (err) { await client.query("ROLLBACK"); throw err; } finally { client.release(); }
    }
    return sendJson(res, 405, { error: "Méthode non autorisée" });
  } catch (err) {
    console.error("[zakapro:db]", err.message);
    const isTableMissing = err.message && err.message.includes("relation") && err.message.includes("does not exist");
    return sendJson(res, 500, { error: isTableMissing ? `Table base de données manquante : ${err.message}. Exécutez le script SQL de migration sur Neon.` : "Erreur serveur — réessayez.", code: isTableMissing ? "missing_table" : "server", details: process.env.NODE_ENV === "development" ? err.message : undefined });
  }
}
