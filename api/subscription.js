import { getSession, pool, dbReady, readBody, sendJson } from "./_lib.js";
import { getSubscription, normalizePhone } from "./_subscription.js";
import { getWalletProfile, saveWalletProfile } from "./_wallet.js";

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });

  try {
    if (req.method === "GET") {
      const subscription = await getSubscription(session.sub);
      if (!subscription) return sendJson(res, 404, { error: "Compte introuvable" });

      const wallets = await getWalletProfile(session.sub);
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
        wallets,
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
      return sendJson(res, 400, {
        error: "Les noms et numéros MonCash/Natcash sont obligatoires.",
        code: "validation",
      });
    }

    const saved = await saveWalletProfile(session.sub, fields);
    return sendJson(res, 200, { ok: true, wallets: saved });
  } catch (error) {
    console.error("[zakapro:subscription]", error.message);
    return sendJson(res, 500, {
      error: "Impossible de mettre à jour le profil portefeuille.",
      code: "server",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
