import crypto from "crypto";
import { dbReady, pool, readBody, sendJson } from "./_lib.js";
import {
  activateSubscription,
  normalizePhone,
  parseSubscriptionSms,
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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let intent = null;
    if (parsed.senderPhone) {
      const result = await client.query(
        `SELECT id, user_id, plan, required_amount, sender_name, sender_phone
         FROM subscription_payment_intents
         WHERE sender_phone = $1
           AND status = 'pending'
           AND expires_at > now()
         ORDER BY (required_amount = $2) DESC, created_at DESC
         LIMIT 1`,
        [normalizePhone(parsed.senderPhone), parsed.amount ?? 0]
      );
      intent = result.rows[0] || null;
    }

    const userId = intent?.user_id || null;
    let reason = "";

    if (!parsed.source || (requestedSource && parsed.source !== requestedSource)) {
      reason = "Source MonCash/Natcash absente ou incohérente.";
    } else if (!parsed.amount || parsed.amount <= 0) {
      reason = "Montant du paiement introuvable ou invalide.";
    } else if (!intent) {
      reason = "Aucun paiement en attente ne correspond à ce numéro de téléphone.";
    } else if (parsed.amount < Number(intent.required_amount)) {
      reason = `Paiement insuffisant : ${parsed.amount} HTG reçus, ${Number(intent.required_amount)} HTG requis pour le plan sélectionné.`;
    } else if (!parsed.senderName || !parsed.senderPhone) {
      reason = "Nom complet ou numéro de téléphone absent du SMS.";
    } else if (!sameIdentity(parsed.senderName, intent.sender_name) || !samePhone(parsed.senderPhone, intent.sender_phone)) {
      reason = "Le nom ou le numéro de l'expéditeur ne correspond pas à la demande de paiement.";
    } else if (!parsed.reference) {
      reason = "Référence de transaction absente : impossible d'éviter un double traitement.";
    }

    if (reason) {
      await writeSmsLog([
        userId,
        parsed.source,
        parsed.raw,
        parsed.amount,
        parsed.senderName,
        parsed.senderPhone,
        intent?.plan || null,
        false,
        reason,
        parsed.reference,
      ], client);
      await client.query("COMMIT");
      return sendJson(res, 422, { error: reason, code: "activation_rejected" });
    }

    const duplicate = await client.query(
      `SELECT id FROM subscription_payments WHERE reference = $1 LIMIT 1`,
      [parsed.reference]
    );
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return sendJson(res, 409, { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" });
    }

    await activateSubscription(
      client,
      intent.user_id,
      intent.plan,
      parsed.amount,
      parsed.source,
      parsed.reference,
      parsed.senderName,
      normalizePhone(parsed.senderPhone)
    );

    await client.query(
      `UPDATE subscription_payment_intents
       SET status = 'paid', paid_reference = $1
       WHERE id = $2 AND status = 'pending'`,
      [parsed.reference, intent.id]
    );

    await writeSmsLog([
      intent.user_id,
      parsed.source,
      parsed.raw,
      parsed.amount,
      parsed.senderName,
      parsed.senderPhone,
      intent.plan,
      true,
      `Activation validée : ${parsed.amount} HTG reçus pour ${Number(intent.required_amount)} HTG requis.`,
      parsed.reference,
    ], client);

    await client.query("COMMIT");
    return sendJson(res, 200, {
      ok: true,
      plan: intent.plan,
      amountReceived: parsed.amount,
      amountRequired: Number(intent.required_amount),
      message: "Paiement confirmé. Abonnement activé automatiquement.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[zakapro:sms]", error.message);
    if (error.code === "23505") return sendJson(res, 409, { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" });
    return sendJson(res, 500, { error: "Impossible de traiter le SMS.", code: "server" });
  } finally {
    client.release();
  }
}
