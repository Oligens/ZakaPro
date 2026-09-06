-- Harden platform subscription intents with a unique payment reference.
ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS reference TEXT;
UPDATE subscription_payment_intents
SET reference = 'ZKS-' || replace(id::text, '-', '')
WHERE reference IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_intents_reference
  ON subscription_payment_intents(reference);
