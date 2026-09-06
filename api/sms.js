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

function signWebhook(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function deliverMerchantWebhook(app, payload) {
  if (!app?.webhook_url) return null;
  const body = JSON.stringify(payload);
  const signature = signWebhook(app.secret_key, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(app.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ZakaPro-Webhook/1.0",
        "X-ZakaPro-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    return { code: response.status, delivered: response.ok };
  } catch (error) {
    console.error("[zakapro:webhook]", error?.message || error);
    return { code: 0, delivered: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleMerchantIntent(client, intent, parsed, source) {
  if (parsed.amount !== Number(intent.total_amount)) {
    return { status: 422, body: {
      error: `Montant strictement invalide : ${parsed.amount} HTG reçus, ${Number(intent.total_amount)} HTG attendus.`,
      code: "amount_mismatch",
    }};
  }
  if (!parsed.senderName || !parsed.senderPhone) {
    return { status: 422, body: { error: "Nom et numéro de l'expéditeur absents du SMS.", code: "sender_missing" }};
  }
  if (!sameIdentity(parsed.senderName, intent.customer_name) || !samePhone(parsed.senderPhone, intent.customer_phone)) {
    return { status: 422, body: { error: "Le nom ou le numéro de l'expéditeur ne correspond pas à l'intention de paiement.", code: "sender_mismatch" }};
  }
  if (!source) return { status: 422, body: { error: "Source MonCash/Natcash absente.", code: "source_missing" }};

  const appResult = await client.query(
    `SELECT id, user_id, name, public_key, secret_key, webhook_url
     FROM apps WHERE id = $1 LIMIT 1`, [intent.app_id]
  );
  const app = appResult.rows[0];
  if (!app) return { status: 404, body: { error: "Application introuvable.", code: "app_not_found" }};

  const planResult = await client.query(
    `SELECT id, name, amount, delivery FROM plans
     WHERE id = $1 AND app_id = $2 LIMIT 1`, [intent.plan_id, intent.app_id]
  );
  const plan = planResult.rows[0];
  if (!plan) return { status: 404, body: { error: "Plan introuvable.", code: "plan_not_found" }};

  if (parsed.reference) {
    const duplicate = await client.query(
      `SELECT id FROM checkout_payment_intents
       WHERE paid_reference = $1 AND status = 'paid' LIMIT 1`, [parsed.reference]
    );
    if (duplicate.rowCount) return { status: 409, body: { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" }};
  }

  const existing = await client.query(
    `SELECT id, status FROM subscribers
     WHERE user_id = (SELECT user_id FROM apps WHERE id = $1)
       AND email = $2
     ORDER BY since DESC LIMIT 1`, [app.id, intent.customer_email]
  );
  const subscriberId = existing.rows[0]?.id || `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  if (existing.rowCount) {
    await client.query(
      `UPDATE subscribers SET name = $1, status = 'PREMIUM', since = $2, auto_renew = TRUE, plan_id = $3
       WHERE id = $4`,
      [intent.customer_name, Date.now(), plan.id, subscriberId]
    );
  } else {
    await client.query(
      `INSERT INTO subscribers (id, user_id, email, name, status, since, auto_renew, plan_id)
       SELECT $1, user_id, $2, $3, 'PREMIUM', $4, TRUE, $5 FROM apps WHERE id = $6`,
      [subscriberId, intent.customer_email, intent.customer_name, Date.now(), plan.id, app.id]
    );
  }

  const txId = `tx_${source === "moncash" ? "mc" : "nt"}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await client.query(
    `INSERT INTO transactions
     (id, user_id, app_id, type, email, amount, source, at, status, ref, sender, delivery)
     SELECT $1, user_id, $2, $3, $4, $5, $6, $7, 'Réussi', $8, $9, $10
     FROM apps WHERE id = $2`,
    [txId, app.id, plan.name, intent.customer_email, parsed.amount, source, Date.now(), parsed.reference, parsed.senderName, Boolean(intent.delivery)]
  );

  const activationId = `act_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await client.query(
    `INSERT INTO activations
     (id, user_id, at, email, name, from_status, to_status, plan_name, app_name, amount, ref)
     SELECT $1, user_id, $2, $3, $4, 'BASIC', 'PREMIUM', $5, $6, $7, $8
     FROM apps WHERE id = $9`,
    [activationId, Date.now(), intent.customer_email, intent.customer_name, plan.name, app.name, parsed.amount, parsed.reference, app.id]
  );

  if (intent.delivery) {
    await client.query(
      `INSERT INTO deliveries
       (id, user_id, at, app_id, app_name, plan_name, customer_phone, address, zone_name, base_amount, fee_amount, total, ref, status)
       SELECT $1, user_id, $2, $3, $4, $5, $6, COALESCE($7, ''), COALESCE(z.name, '—'), $8, $9, $10, $11, 'en_attente'
       FROM apps a LEFT JOIN zones z ON z.id = $12 AND z.app_id = a.id
       WHERE a.id = $3`,
      [`del_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, Date.now(), app.id, app.name, plan.name,
       intent.customer_phone, intent.address, Number(intent.base_amount), Number(intent.fee_amount),
       Number(intent.total_amount), parsed.reference, intent.zone_id]
    );
  }

  await client.query(
    `UPDATE checkout_payment_intents
     SET status = 'paid', paid_at = now(), paid_reference = $1
     WHERE id = $2 AND status = 'pending'`,
    [parsed.reference, intent.id]
  );

  const payload = {
    id: `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    event: "subscription.activated",
    createdAt: new Date().toISOString(),
    app: app.id,
    appKey: app.public_key,
    transactionId: txId,
    reference: parsed.reference,
    amount: parsed.amount,
    currency: "HTG",
    method: source,
    customer: { name: intent.customer_name, email: intent.customer_email, phone: intent.customer_phone, address: intent.address },
    delivery: Boolean(intent.delivery),
    zone: intent.zone_id,
    plan: { id: plan.id, name: plan.name },
  };

  return { status: 200, body: {
    ok: true, appId: app.id, planId: plan.id, plan: plan.name,
    amountReceived: parsed.amount, amountRequired: Number(intent.total_amount),
    webhook: app.webhook_url ? "queued" : "not_configured",
  }, webhook: { app, payload }};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée.", code: "method_not_allowed" });
  if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée.", code: "config" });
  if (!authorized(req)) return sendJson(res, 401, { error: "Écouteur non autorisé.", code: "unauthorized" });

  let body;
  try { body = await readBody(req); } catch (error) {
    return sendJson(res, 400, { error: error.message, code: "invalid_json" });
  }

  const parsed = parseSubscriptionSms(body.raw);
  const source = parsed.source;
  if (!source) return sendJson(res, 422, { error: "SMS MonCash/Natcash non reconnu.", code: "source_invalid" });
  if (!parsed.amount || parsed.amount <= 0) return sendJson(res, 422, { error: "Montant du paiement introuvable ou invalide.", code: "amount_invalid" });
  if (!parsed.senderPhone) return sendJson(res, 422, { error: "Numéro de l'expéditeur absent du SMS.", code: "sender_missing" });
  if (!parsed.reference) return sendJson(res, 422, { error: "Référence de transaction absente.", code: "reference_missing" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const checkout = await client.query(
      `SELECT cpi.*, p.name AS plan_name, a.user_id AS app_user_id
       FROM checkout_payment_intents cpi
       JOIN plans p ON p.id = cpi.plan_id AND p.app_id = cpi.app_id
       JOIN apps a ON a.id = cpi.app_id
       WHERE cpi.reference = $1
         AND cpi.customer_phone = $2
         AND cpi.status = 'pending'
         AND cpi.expires_at > now()
       FOR UPDATE`,
      [parsed.reference, normalizePhone(parsed.senderPhone)]
    );

    if (checkout.rowCount) {
      const result = await handleMerchantIntent(client, checkout.rows[0], parsed, source);
      if (result.status >= 400) {
        await client.query(`UPDATE checkout_payment_intents SET status = 'rejected' WHERE id = $1 AND status = 'pending'`, [checkout.rows[0].id]);
        await writeSmsLog([checkout.rows[0].app_user_id, source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, checkout.rows[0].plan_name, false, result.body.error, parsed.reference], client);
        await client.query("COMMIT");
        return sendJson(res, result.status, result.body);
      }
      await writeSmsLog([checkout.rows[0].app_user_id, source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, checkout.rows[0].plan_name, true, "Checkout marchand validé avec montant strict.", parsed.reference], client);
      await client.query("COMMIT");

      const webhookResult = result.webhook ? await deliverMerchantWebhook(result.webhook.app, result.webhook.payload) : null;
      if (result.webhook?.app?.webhook_url) {
        try {
          await pool.query(
            `INSERT INTO webhook_events (user_id, event, url, http_code)
             SELECT user_id, $1, $2, $3 FROM apps WHERE id = $4`,
            [result.webhook.payload.event, result.webhook.app.webhook_url, webhookResult?.code || 0, result.webhook.app.id]
          );
        } catch (error) { console.error("[zakapro:webhook-log]", error.message); }
      }
      return sendJson(res, result.status, { ...result.body, webhook: webhookResult?.delivered ? "delivered" : result.body.webhook });
    }

    const platform = await client.query(
      `SELECT * FROM subscription_payment_intents
       WHERE reference = $1 AND sender_phone = $2 AND status = 'pending' AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [parsed.reference, normalizePhone(parsed.senderPhone)]
    );
    const intent = platform.rows[0];
    if (!intent) {
      await client.query("ROLLBACK");
      return sendJson(res, 422, { error: "Aucun paiement en attente ne correspond à ce numéro et à cette référence.", code: "intent_not_found" });
    }

    if (parsed.amount !== Number(intent.required_amount)) {
      await writeSmsLog([intent.user_id, source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, intent.plan, false,
        `Montant strictement invalide : ${parsed.amount} HTG reçus, ${Number(intent.required_amount)} HTG attendus.`, parsed.reference], client);
      await client.query("COMMIT");
      return sendJson(res, 422, { error: "Le montant reçu doit être exactement égal au montant attendu.", code: "amount_mismatch" });
    }
    if (!sameIdentity(parsed.senderName, intent.sender_name) || !samePhone(parsed.senderPhone, intent.sender_phone)) {
      await client.query("ROLLBACK");
      return sendJson(res, 422, { error: "Le nom ou le numéro de l'expéditeur ne correspond pas à la demande de paiement.", code: "sender_mismatch" });
    }

    const duplicate = await client.query(`SELECT id FROM subscription_payments WHERE reference = $1 LIMIT 1`, [parsed.reference]);
    if (duplicate.rowCount) {
      await client.query("ROLLBACK");
      return sendJson(res, 409, { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" });
    }

    await activateSubscription(client, intent.user_id, intent.plan, parsed.amount, source, parsed.reference, parsed.senderName, normalizePhone(parsed.senderPhone));
    await client.query(
      `UPDATE subscription_payment_intents SET status = 'paid', paid_reference = $1 WHERE id = $2 AND status = 'pending'`,
      [parsed.reference, intent.id]
    );
    await writeSmsLog([intent.user_id, source, parsed.raw, parsed.amount, parsed.senderName, parsed.senderPhone, intent.plan, true,
      "Abonnement plateforme activé avec montant strict.", parsed.reference], client);
    await client.query("COMMIT");

    return sendJson(res, 200, { ok: true, plan: intent.plan, amountReceived: parsed.amount, amountRequired: Number(intent.required_amount), message: "Paiement confirmé. Abonnement activé automatiquement." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[zakapro:sms]", error);
    if (error?.code === "23505") return sendJson(res, 409, { error: "Cette transaction a déjà été traitée.", code: "duplicate_transaction" });
    return sendJson(res, 500, { error: "Impossible de traiter le SMS.", code: "server" });
  } finally {
    client.release();
  }
}
