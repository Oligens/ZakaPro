import crypto from "crypto";
import { dbReady, pool, readBody, sendJson } from "../../_lib.js";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("509") ? `+${digits}` : digits ? `+509${digits}` : "";
}
function cleanText(value, max = 255) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function money(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function reference() { return `ZK-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    const appKey = cleanText(req.query?.appKey || "");
    if (!appKey) return sendJson(res, 400, { error: "appKey requis.", code: "missing_app_key" });

    const body = await readBody(req);
    const customerName = cleanText(body.customerName, 120);
    const customerEmail = cleanText(body.email, 254).toLowerCase();
    const customerPhone = normalizePhone(body.phone);
    const planId = cleanText(body.planId, 128);
    const zoneId = cleanText(body.zoneId, 128) || null;
    const address = cleanText(body.address, 500) || null;
    // IMPORTANT: body.amount est volontairement ignoré. Le prix vient exclusivement de PostgreSQL.

    if (customerName.length < 2) return sendJson(res, 400, { error: "Nom client invalide.", code: "validation" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) return sendJson(res, 400, { error: "Email client invalide.", code: "validation" });
    if (!/^\+509\d{8}$/.test(customerPhone)) return sendJson(res, 400, { error: "Numéro haïtien invalide.", code: "validation" });
    if (!planId) return sendJson(res, 400, { error: "planId requis.", code: "missing_plan_id" });

    const appResult = await pool.query(
      `SELECT id, name, public_key, secret_key, webhook_url
       FROM apps
       WHERE id::text = $1 OR public_key = $1
       LIMIT 1`, [appKey]
    );
    const app = appResult.rows[0];
    if (!app) return sendJson(res, 404, { error: "Application introuvable.", code: "app_not_found" });

    const planResult = await pool.query(
      `SELECT id, app_id, name, amount, delivery
       FROM plans WHERE id = $1 AND app_id = $2 LIMIT 1`, [planId, app.id]
    );
    const plan = planResult.rows[0];
    if (!plan) return sendJson(res, 404, { error: "Plan introuvable pour cette application.", code: "plan_not_found" });

    let fee = 0;
    if (Boolean(plan.delivery)) {
      if (zoneId) {
        const zoneResult = await pool.query(
          `SELECT id, name, fee_pct FROM zones WHERE id = $1 AND app_id = $2 LIMIT 1`, [zoneId, app.id]
        );
        const zone = zoneResult.rows[0];
        if (!zone) return sendJson(res, 400, { error: "Zone de livraison invalide.", code: "zone_not_found" });
        fee = Math.round((Number(plan.amount) * Number(zone.fee_pct) / 100) * 100) / 100;
      } else {
        const zoneCount = await pool.query(`SELECT count(*)::int AS count FROM zones WHERE app_id = $1`, [app.id]);
        if (zoneCount.rows[0].count > 0) return sendJson(res, 400, { error: "Une zone de livraison est requise.", code: "zone_required" });
      }
      if (!address || address.length < 6) return sendJson(res, 400, { error: "Adresse de livraison requise.", code: "address_required" });
    }

    const baseAmount = money(plan.amount);
    const totalAmount = money(baseAmount + fee);
    const ref = reference();

    const { rows } = await pool.query(
      `INSERT INTO checkout_payment_intents
       (app_id, plan_id, customer_name, customer_email, customer_phone, base_amount, fee_amount, total_amount, zone_id, address, delivery, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, reference, app_id, plan_id, base_amount, fee_amount, total_amount, delivery, expires_at`,
      [app.id, plan.id, customerName, customerEmail, customerPhone, baseAmount, fee, totalAmount, zoneId, address, Boolean(plan.delivery), ref]
    );

    return sendJson(res, 201, {
      success: true,
      intent: rows[0],
      app: { id: app.id, name: app.name, appKey: app.public_key },
      plan: { id: plan.id, name: plan.name, amount: baseAmount, delivery: Boolean(plan.delivery) },
      payment: { amount: totalAmount, currency: "HTG", methods: ["moncash", "natcash"] }
    });
  } catch (error) {
    console.error("[zakapro:checkout-intent]", error);
    return sendJson(res, 500, { error: "Impossible de préparer le checkout.", code: "server" });
  }
}
