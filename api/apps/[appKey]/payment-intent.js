import crypto from "crypto";
import { dbReady, pool, readBody, sendJson } from "../../_lib.js";

function clean(value, max = 255) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 8) return `+509${digits}`;
  if (digits.length === 11 && digits.startsWith("509")) return `+${digits}`;
  return "";
}

function validPhone(value) {
  return /^\+509\d{8}$/.test(value);
}

function reference() {
  return `ZK-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-ZakaPro-Signature");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    const appKey = clean(req.query?.appKey || req.query?.app_key);
    if (!appKey) return sendJson(res, 400, { error: "appKey requis.", code: "missing_app_key" });

    const body = await readBody(req);
    const planId = clean(body.planId || body.plan_id, 128);
    const customerName = clean(body.customerName || body.name, 120);
    const email = clean(body.email, 254).toLowerCase();
    const phone = normalizePhone(body.phone);

    if (!planId) return sendJson(res, 400, { error: "planId requis.", code: "missing_plan_id" });
    if (customerName.length < 2) return sendJson(res, 400, { error: "Nom client invalide.", code: "invalid_customer_name" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { error: "Email client invalide.", code: "invalid_email" });
    if (!validPhone(phone)) return sendJson(res, 400, { error: "Numéro haïtien invalide. Utilisez 8 chiffres, par exemple 37124589 ou +509 37124589.", code: "invalid_phone" });

    const appResult = await pool.query(
      `SELECT id, name, public_key, user_id FROM apps
       WHERE id::text = $1 OR public_key = $1
       LIMIT 1`,
      [appKey]
    );
    const app = appResult.rows[0];
    if (!app) return sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });

    const planResult = await pool.query(
      `SELECT id, app_id, name, amount, recurrence, delivery
       FROM plans
       WHERE id = $1 AND app_id = $2
       LIMIT 1`,
      [planId, app.id]
    );
    const plan = planResult.rows[0];
    if (!plan) return sendJson(res, 404, { error: "Plan introuvable pour cette application.", code: "plan_not_found" });

    // SECURITY: the client never supplies or controls the authoritative amount.
    const amount = Number(plan.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sendJson(res, 422, { error: "Le prix du plan est invalide en base de données.", code: "invalid_plan_price" });

    const ref = reference();
    const { rows } = await pool.query(
      `INSERT INTO checkout_payment_intents
       (app_id, plan_id, customer_name, customer_email, customer_phone,
        base_amount, fee_amount, total_amount, delivery, reference, monetization_type)
       VALUES ($1,$2,$3,$4,$5,$6,0,$6,$7,$8,'subscription')
       RETURNING id, reference, plan_id, total_amount, delivery, status, expires_at`,
      [app.id, plan.id, customerName, email, phone, amount, Boolean(plan.delivery), ref]
    );

    return sendJson(res, 201, {
      success: true,
      ok: true,
      intent: {
        id: rows[0].id,
        reference: rows[0].reference,
        planId: rows[0].plan_id,
        total_amount: Number(rows[0].total_amount),
        amount: Number(rows[0].total_amount),
        delivery: Boolean(rows[0].delivery),
        status: rows[0].status,
        expires_at: rows[0].expires_at,
      },
      plan: { id: plan.id, name: plan.name, amount },
      payment: { currency: "HTG", methods: ["moncash", "natcash"] },
    });
  } catch (error) {
    console.error("[zakapro:payment-intent]", error);
    return sendJson(res, 500, { error: "Impossible de créer l'intention de paiement.", code: "server" });
  }
}
