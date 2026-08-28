import crypto from "crypto";
import { dbReady, pool, readBody, sendJson } from "./_lib.js";
import {
  activateSubscription,
  getSubscription,
  normalizePhone,
  parseSubscriptionSms,
  planFromAmount,
  sameIdentity,
  samePhone,
  writeSmsLog,
} from "./_subscription.js";

function authorized(req) {
  const expected = String(process.env.SMS_LISTENER_SECRET || "");
  const actual = String(req.headers["x-listener-key"] || "");
  if (!expected || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  if (!authorized(req)) return sendJson(res, 401, { error: "Écouteur non autorisé.", code: "unauthorized" });

  const body = await readBody(req);
  const parsed = parseSubscriptionSms(body.raw);
  const requestedSource = body.source ? String(body.source).toLowerCase() : parsed.source;
  const plan = planFromAmount(parsed.amount);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const walletColumn = parsed.source === "moncash" ? "moncash_phone" : parsed.source === "natcash" ? "natcash_phone" : null;
    const identityResult = walletColumn && parsed.senderPhone
      ? await client.query(`SELECT id FROM users WHERE ${walletColumn} = $1 LIMIT 1`, [normalizePhone(parsed.senderPhone)])
      : { rows: [] };
    const userId = identityResult.rows[0]?.id || null;
    const subscription = userId ? await getSubscription(userId, client) : null;
    let reason = "";
    if (!subscription) reason = "Compte d'activation introuvable.";
    else if (!parsed.source || (requestedSource && parsed.source !== requestedSource)) reason = "Source MonCash/Natcash absente ou incohérente.";
    else if (!parsed.amount || !plan) reason = "Montant invalide : seuls 250 HTG ou 2500 HTG sont acceptés.";
    else if (!parsed.senderName || !parsed.senderPhone) reason = "Nom complet ou numéro de téléphone absent du SMS.";
    else {
      const expectedName = plan && parsed.source === "moncash" ? subscription.moncash_name : subscription.natcash_name;
      const expectedPhone = parsed.source === "moncash" ? subscription.moncash_phone : subscription.natcash_phone;
      if (!sameIdentity(parsed.senderName, expectedName) || !samePhone(parsed.senderPhone, expectedPhone)) {
        reason = "Le montant, le nom ou le numéro ne correspond pas exactement à votre portefeuille MonCash/Natcash.";
      }
    }
    if (reason) {
      await writeSmsLog([userId || null, parsed.source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, plan, false, reason, parsed.reference], client);
      await client.query("COMMIT");
      return sendJson(res, 422, { error: reason, code: "activation_rejected" });
    }
    if (!parsed.reference) {
      const reasonWithoutReference = "Référence de transaction absente : impossible d'éviter un double traitement.";
      await writeSmsLog([userId, parsed.source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, plan, false, reasonWithoutReference, null], client);
      await client.query("COMMIT");
      return sendJson(res, 422, { error: reasonWithoutReference, code: "activation_rejected" });
    }
    await activateSubscription(client, userId, plan, parsed.amount, parsed.source, parsed.reference, parsed.senderName, normalizePhone(parsed.senderPhone));
    await writeSmsLog([userId, parsed.source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, plan, true, "Activation validée.", parsed.reference], client);
    await client.query("COMMIT");
    return sendJson(res, 200, { ok: true, plan, message: "Abonnement activé." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[zakapro:sms]", error.message);
    if (error.code === "23505") return sendJson(res, 409, { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" });
    return sendJson(res, 500, { error: "Impossible de traiter le SMS.", code: "server" });
  } finally {
    client.release();
  }
}
