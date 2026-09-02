import { getSession, pool, dbReady, readBody, sendJson } from "./_lib.js";
import { PLAN_PRICES, normalizePhone, normalizePlan } from "./_subscription.js";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée" });

  try {
    const body = await readBody(req);
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    const phone = normalizePhone(body.phone);
    const plan = normalizePlan(body.plan);
    const amount = PLAN_PRICES[plan];

    if (!name || name.length < 3) return sendJson(res, 400, { error: "Veuillez saisir votre nom complet.", code: "validation" });
    if (!phone) return sendJson(res, 400, { error: "Veuillez saisir un numéro de téléphone valide.", code: "validation" });
    if (plan !== "monthly" && plan !== "yearly") return sendJson(res, 400, { error: "Plan invalide.", code: "validation" });

    const { rows } = await pool.query(
      `INSERT INTO subscription_payment_intents (user_id, plan, required_amount, sender_name, sender_phone)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, plan, required_amount, sender_name, sender_phone, expires_at`,
      [session.sub, plan, amount, name, phone]
    );

    return sendJson(res, 200, {
      ok: true,
      intent: {
        id: rows[0].id,
        plan: rows[0].plan,
        amount: Number(rows[0].required_amount),
        senderName: rows[0].sender_name,
        senderPhone: rows[0].sender_phone,
        expiresAt: rows[0].expires_at,
      },
    });
  } catch (error) {
    console.error("[zakapro:subscription-payment]", error.message);
    return sendJson(res, 500, { error: "Impossible de préparer le paiement.", code: "server" });
  }
}
