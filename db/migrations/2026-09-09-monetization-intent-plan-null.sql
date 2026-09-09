-- Allow standalone monetization payment intents without a subscription plan.
ALTER TABLE checkout_payment_intents ALTER COLUMN plan_id DROP NOT NULL;
