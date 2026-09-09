-- ZakaPro monetization / isolated wallets
-- Idempotent Neon PostgreSQL migration.

CREATE TABLE IF NOT EXISTS app_monetization_settings (
  app_id TEXT PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  token_to_htg_rate NUMERIC(12,6) NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_share_rules (
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  tier_level TEXT NOT NULL,
  creator_pct NUMERIC(5,2) NOT NULL CHECK (creator_pct >= 0 AND creator_pct <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, tier_level)
);

CREATE TABLE IF NOT EXISTS user_wallets (
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  balance_real NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance_real >= 0),
  balance_tokens NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (balance_tokens >= 0),
  tier_level TEXT NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_app ON user_wallets(app_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_tier ON user_wallets(app_id, tier_level);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('HTG','USD','TOKEN')),
  delta NUMERIC(18,4) NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, reference, user_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(app_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monetization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  sender_user_id TEXT,
  recipient_user_id TEXT,
  gross_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  token_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  creator_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  creator_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  platform_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'HTG',
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_monetization_events_recipient ON monetization_events(app_id, recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'HTG' CHECK (currency IN ('HTG','USD')),
  method TEXT NOT NULL CHECK (method IN ('moncash','natcash','bank')),
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected','cancelled')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_app_status ON withdrawal_requests(app_id, status, created_at DESC);

ALTER TABLE plans ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS monetization_type TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS recipient_user_id TEXT;
ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS sender_user_id TEXT;
ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS token_amount NUMERIC(18,4);
ALTER TABLE checkout_payment_intents ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(12,6);

INSERT INTO revenue_share_rules (app_id, tier_level, creator_pct)
SELECT id, tier_level, pct
FROM apps
CROSS JOIN (VALUES ('standard',30.00),('intermediate',70.00),('vip',100.00)) AS defaults(tier_level,pct)
ON CONFLICT (app_id,tier_level) DO NOTHING;

INSERT INTO app_monetization_settings (app_id)
SELECT id FROM apps
ON CONFLICT (app_id) DO NOTHING;
