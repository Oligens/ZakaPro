-- ZakaPro: intents de checkout par application / plan.
-- Idempotent: safe à rejouer.
CREATE TABLE IF NOT EXISTS checkout_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL CHECK (base_amount > 0),
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
  address TEXT,
  delivery BOOLEAN NOT NULL DEFAULT FALSE,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  paid_at TIMESTAMPTZ,
  paid_reference TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_checkout_intents_phone_status
  ON checkout_payment_intents (customer_phone, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_intents_app_status
  ON checkout_payment_intents (app_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_intents_plan
  ON checkout_payment_intents (plan_id, created_at DESC);
