import { pool } from "./_lib.js";

export const PLAN_PRICES = Object.freeze({ monthly: 250, yearly: 2500, lifetime: 0 });
const PAYMENT_PLAN_NAMES = Object.freeze({ monthly: "mensuel", yearly: "annuel", lifetime: "vie" });

export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("509") ? `+${digits}` : digits ? `+509${digits}` : "";
}

export function normalizeIdentity(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}

export function sameIdentity(left, right) {
  return normalizeIdentity(left) !== "" && normalizeIdentity(left) === normalizeIdentity(right);
}

export function samePhone(left, right) {
  return normalizePhone(left) !== "" && normalizePhone(left) === normalizePhone(right);
}

export async function getSubscription(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, subscription_plan, subscription_status, subscription_expires_at, is_lifetime,
            moncash_name, moncash_phone, natcash_name, natcash_phone
     FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  const active = Boolean(user.is_lifetime) || (
    user.subscription_status === "active" &&
    user.subscription_expires_at &&
    new Date(user.subscription_expires_at).getTime() > Date.now()
  );
  if (!active && user.subscription_status === "active") {
    await client.query(
      `UPDATE users SET subscription_status = 'expired' WHERE id = $1 AND is_lifetime = false`,
      [userId]
    );
    await client.query(
      `UPDATE apps SET is_active = false, listener_enabled = false, webhooks_enabled = false WHERE user_id = $1`,
      [userId]
    );
  }
  return { ...user, active };
}

export async function requireActiveSubscription(userId, client = pool) {
  const subscription = await getSubscription(userId, client);
  if (!subscription?.active) {
    const error = new Error("Abonnement requis pour créer ou gérer des applications.");
    error.code = "subscription_required";
    throw error;
  }
  return subscription;
}

export function planDuration(plan) {
  if (plan === "monthly") return "30 days";
  if (plan === "yearly") return "365 days";
  return null;
}

export function planFromAmount(amount) {
  const numeric = Number(amount);
  if (numeric === PLAN_PRICES.monthly) return "monthly";
  if (numeric === PLAN_PRICES.yearly) return "yearly";
  return null;
}

export function parseSubscriptionSms(raw) {
  const text = String(raw || "");
  const source = /mon\s?cash/i.test(text) ? "moncash" : /nat\s?cash/i.test(text) ? "natcash" : null;
  const amountMatch = text.match(/(?:re[cç]u|receiv|peman|paiement|montant|amount|transf[eé]r?e?)[^\d]{0,24}(\d[\d .]*?(?:[.,]\d{1,2})?)\s*(?:HTG|GDES?|GOURDES?)?/i)
    || text.match(/(\d[\d .]*?(?:[.,]\d{1,2})?)\s*(?:HTG|GDES?|GOURDES?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/\s/g, "").replace(/,/g, ".")) : null;
  const phoneMatch = text.match(/(?:\+?509[\s.-]?)?\d{4}[\s.-]?\d{4}/);
  const senderPhone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
  const nameMatch = text.match(/(?:soti nan|de la part de|from|exp[eé]diteur|sender)\s*[:.-]?\s*([A-Za-zÀ-ÿ' -]{3,60}?)(?=\s*(?:\+?509|\d{4}[\s.-]?\d{4}|ref|r[eé]f|montant|amount|pour|$))/i);
  const senderName = nameMatch ? nameMatch[1].trim().replace(/[.]+$/, "") : null;
  const referenceMatch = text.match(/(?:ref(?:erence)?|id|no\.?\s*(?:transaction|tranzaksyon)?)\s*[:#.-]?\s*([A-Z0-9-]{4,})/i);
  const reference = referenceMatch ? referenceMatch[1].toUpperCase() : null;
  return { source, amount: Number.isFinite(amount) ? amount : null, senderName, senderPhone, reference, raw: text };
}

export async function writeSmsLog(values, client = pool) {
  await client.query(
    `INSERT INTO subscription_sms_logs
      (user_id, source, raw, parsed_amount, sender_name, sender_phone, plan, accepted, reason, reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    values
  );
}

export async function activateSubscription(client, userId, plan, amount, source, reference, senderName, senderPhone) {
  const duration = planDuration(plan);
  const expirySql = duration ? `now() + interval '${duration}'` : "NULL";
  const paymentPlan = PAYMENT_PLAN_NAMES[plan];
  if (!paymentPlan) throw new Error("Plan d'abonnement invalide.");
  await client.query(
    `UPDATE users
     SET subscription_plan = $2,
         subscription_status = 'active',
       subscription_expires_at = ${expirySql},
       is_lifetime = ($2 = 'lifetime'),
       subscription_expires = ${expirySql},
       lifetime_access = ($2 = 'lifetime')
     WHERE id = $1`,
    [userId, plan]
  );
  await client.query(
    `UPDATE apps SET is_active = true, listener_enabled = true, webhooks_enabled = true WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `INSERT INTO subscription_payments (user_id, plan, amount, source, reference, sender_name, sender_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, paymentPlan, amount, source, reference, senderName, senderPhone]
  );
}
