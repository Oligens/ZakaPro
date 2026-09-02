ALTER TABLE subscription_payment_intents
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS subscription_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly','yearly')),
  required_amount NUMERIC(12,2) NOT NULL CHECK (required_amount IN (250,2500)),
  sender_name TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  paid_reference TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscription_intents_match
  ON subscription_payment_intents (sender_phone, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_intents_user
  ON subscription_payment_intents (user_id, status, created_at DESC);
