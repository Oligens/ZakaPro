import { getSession, pool, dbReady, readBody, sendJson } from "./_lib.js";
import { getSubscription, normalizePhone } from "./_subscription.js";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  try {
    if (req.method === "GET") {
      const subscription = await getSubscription(session.sub);
      if (!subscription) return sendJson(res, 404, { error: "Compte introuvable" });
      return sendJson(res, 200, {
        adminPayment: {
          moncashPhone: process.env.ADMIN_MONCASH_PHONE || "50944617600",
          natcashPhone: process.env.ADMIN_NATCASH_PHONE || "50940243434",
          merchantName: process.env.ADMIN_MERCHANT_NAME || "Cleef O. JOSEPH",
        },
        subscription: {
          plan: subscription.subscription_plan,
          status: subscription.active ? "active" : subscription.subscription_status,
          expiresAt: subscription.subscription_expires_at,
          lifetime: Boolean(subscription.is_lifetime),
        },
        wallets: {
          moncashName: subscription.moncash_name || "",
          moncashPhone: subscription.moncash_phone || "",
          natcashName: subscription.natcash_name || "",
          natcashPhone: subscription.natcash_phone || "",
        },
      });
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée" });
    const body = await readBody(req);
    const wallets = body.wallets || body;
    const fields = {
      moncashName: String(wallets.moncashName || "").trim(),
      moncashPhone: normalizePhone(wallets.moncashPhone),
      natcashName: String(wallets.natcashName || "").trim(),
      natcashPhone: normalizePhone(wallets.natcashPhone),
    };
    if (!fields.moncashName || !fields.moncashPhone || !fields.natcashName || !fields.natcashPhone) {
      return sendJson(res, 400, { error: "Les noms et numéros MonCash/Natcash sont obligatoires.", code: "validation" });
    }
    await pool.query(
      `UPDATE users SET moncash_name = $1, moncash_phone = $2, natcash_name = $3, natcash_phone = $4 WHERE id = $5`,
      [fields.moncashName, fields.moncashPhone, fields.natcashName, fields.natcashPhone, session.sub]
    );
    return sendJson(res, 200, { ok: true, wallets: fields });
  } catch (error) {
    console.error("[zakapro:subscription]", error.message);
    return sendJson(res, 500, { error: "Impossible de mettre à jour l'abonnement.", code: "server" });
  }
}
