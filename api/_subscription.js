import { pool } from "./_lib.js";

export const PLAN_PRICES = Object.freeze({ monthly: 250, yearly: 2500, lifetime: 0 });
const PAYMENT_PLAN_NAMES = Object.freeze({ monthly: "mensuel", yearly: "annuel", lifetime: "vie" });
const PLAN_ALIASES = Object.freeze({ monthly: "monthly", mensuel: "monthly", yearly: "yearly", annuel: "yearly", lifetime: "lifetime", vie: "lifetime" });

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

export function hasPremiumAccess(user) {
  const subscription = user?.subscription || user || {};
  const expiresAt = subscription.expiresAt ?? subscription.subscription_expires_at ?? subscription.subscription_expires;
  const subscriptionActive = subscription.status === "active" || subscription.subscription_status === "active";
  const lifetime = subscription.lifetime === true || subscription.is_lifetime === true || subscription.lifetime_access === true;
  const paidSubscription = lifetime || (subscriptionActive && (!expiresAt || new Date(expiresAt).getTime() > Date.now()));
  const promo = user?.promo;
  const promoAccess = promo?.status === "active" && (!promo.expiresAt || new Date(promo.expiresAt).getTime() > Date.now());
  return paidSubscription || promoAccess;
}

export async function getSubscription(userId, client = pool) {
  // L'accès au compte ne dépend pas du profil portefeuille ni de l'historique
  // des paiements : les deux sont des données distinctes et ne doivent pas
  // provoquer un faux 404/500 sur /api/subscription.
  const { rows } = await client.query(
    `SELECT u.id, u.subscription_plan, u.subscription_status, u.subscription_expires_at,
            u.subscription_expires, u.is_lifetime, u.lifetime_access
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;

  let latestSubscriptionSource = null;
  try {
    const payment = await client.query(
      `SELECT source FROM subscription_payments
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    latestSubscriptionSource = payment.rows[0]?.source || null;
  } catch (error) {
    console.warn("[zakapro:subscription:history]", error?.message || error);
  }

  const lifetime = Boolean(user.is_lifetime || user.lifetime_access);
  const expiresAt = user.subscription_expires_at || user.subscription_expires;
  const active = hasPremiumAccess({ subscription: { status: user.subscription_status, expiresAt, lifetime } });

  if (!active && user.subscription_status === "active") {
    await client.query(
      `UPDATE users SET subscription_status = 'expired' WHERE id = $1 AND is_lifetime = false AND lifetime_access = false`,
      [userId]
    );
    await client.query(
      `UPDATE apps SET is_active = false, listener_enabled = false, webhooks_enabled = false WHERE user_id = $1`,
      [userId]
    );
  }

  const normalized = { ...user, active, is_lifetime: lifetime, subscription_expires_at: expiresAt };
  return {
    ...normalized,
    subscription: {
      plan: user.subscription_plan,
      status: active ? "active" : user.subscription_status,
      expiresAt,
      lifetime,
    },
    promo: latestSubscriptionSource === "promo" && active
      ? { status: "active", expiresAt: expiresAt || null }
      : null,
  };
}

export async function requireActiveSubscription(userId, client = pool) {
  const subscription = await getSubscription(userId, client);
  if (!subscription || !hasPremiumAccess(subscription)) {
    const error = new Error("Abonnement requis pour créer ou gérer des applications.");
    error.code = "subscription_required";
    throw error;
  }
  return subscription;
}

export function planDuration(plan) {
  if (plan === "monthly") return "1 month";
  if (plan === "yearly") return "1 year";
  return null;
}

export function normalizePlan(plan) {
  return PLAN_ALIASES[String(plan || "").toLowerCase()] || null;
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
  plan = normalizePlan(plan);
  const duration = planDuration(plan);
  const expirySql = duration ? `now() + interval '${duration}'` : "NULL";
  const paymentPlan = PAYMENT_PLAN_NAMES[plan];
  if (!paymentPlan) throw new Error("Plan d'abonnement invalide.");
  const userUpdate = await client.query(
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
  if (!userUpdate.rowCount) throw new Error("Utilisateur introuvable : abonnement non activé.");
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
