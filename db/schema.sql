CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Utilisateurs & authentification ----------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE, verification_token TEXT, verification_expires TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS moncash_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS moncash_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS natcash_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS natcash_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_access BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);

-- ---------- Abonnements de la plateforme ----------
CREATE TABLE IF NOT EXISTS subscription_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL CHECK (plan IN ('mensuel', 'annuel', 'vie')), amount NUMERIC(12,2) NOT NULL, source TEXT NOT NULL CHECK (source IN ('moncash', 'natcash', 'promo')), reference TEXT NOT NULL UNIQUE, sender_name TEXT, sender_phone TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS promo_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, duration_type TEXT NOT NULL CHECK (duration_type IN ('monthly', 'yearly', 'lifetime')), is_used BOOLEAN NOT NULL DEFAULT FALSE, used_by UUID REFERENCES users(id) ON DELETE SET NULL, used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, plan TEXT, uses_remaining INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS duration_type TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS uses_remaining INT DEFAULT 1;
UPDATE promo_codes SET duration_type = CASE plan WHEN 'mensuel' THEN 'monthly' WHEN 'annuel' THEN 'yearly' WHEN 'vie' THEN 'lifetime' END WHERE duration_type IS NULL;
UPDATE promo_codes SET is_used = (uses_remaining <= 0) WHERE uses_remaining IS NOT NULL;
ALTER TABLE promo_codes ALTER COLUMN duration_type SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
INSERT INTO promo_codes (code, duration_type, plan, is_used, uses_remaining) VALUES ('ZAKA-MONTH-2026', 'monthly', 'mensuel', FALSE, 1), ('ZAKA-YEAR-VIP', 'yearly', 'annuel', FALSE, 1), ('ZAKA-LIFETIME-FREE', 'lifetime', 'vie', FALSE, 1) ON CONFLICT (code) DO NOTHING;
CREATE TABLE IF NOT EXISTS subscription_sms_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, source TEXT, raw TEXT NOT NULL, parsed_amount NUMERIC(12,2), sender_name TEXT, sender_phone TEXT, plan TEXT, accepted BOOLEAN NOT NULL DEFAULT FALSE, reason TEXT NOT NULL, reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_subscription_sms_logs_user ON subscription_sms_logs (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS subscription_payment_intents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL CHECK (plan IN ('monthly','yearly')), required_amount NUMERIC(12,2) NOT NULL CHECK (required_amount IN (250,2500)), sender_name TEXT NOT NULL, sender_phone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected','expired')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'), paid_reference TEXT);
CREATE INDEX IF NOT EXISTS idx_subscription_intents_match ON subscription_payment_intents (sender_phone, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_intents_user ON subscription_payment_intents (user_id, status, created_at DESC);

-- ---------- Applications du marchand ----------
CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, monogram TEXT NOT NULL, color TEXT NOT NULL, public_key TEXT NOT NULL UNIQUE, secret_key TEXT NOT NULL, webhook_url TEXT, created_at BIGINT NOT NULL);
ALTER TABLE apps ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS webhooks_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS listener_enabled BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_apps_user ON apps (user_id);
CREATE INDEX IF NOT EXISTS idx_apps_webhook_url ON apps (user_id) WHERE webhook_url IS NOT NULL AND webhook_url <> '';

-- ---------- Plans d'abonnement / produits ----------
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE, name TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, recurrence TEXT NOT NULL, delivery BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans (user_id); CREATE INDEX IF NOT EXISTS idx_plans_app ON plans (app_id);
CREATE TABLE IF NOT EXISTS zones (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE, name TEXT NOT NULL, fee_pct NUMERIC(6,2) NOT NULL DEFAULT 0);
ALTER TABLE zones ADD COLUMN IF NOT EXISTS app_id TEXT REFERENCES apps(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_zones_user ON zones (user_id); CREATE INDEX IF NOT EXISTS idx_zones_app ON zones (app_id);
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, app_id TEXT NOT NULL, type TEXT NOT NULL, email TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, source TEXT NOT NULL, at BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'Réussi', ref TEXT NOT NULL, sender TEXT, delivery BOOLEAN NOT NULL DEFAULT FALSE);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions (user_id); CREATE INDEX IF NOT EXISTS idx_tx_user_app ON transactions (user_id, app_id); CREATE INDEX IF NOT EXISTS idx_tx_at ON transactions (at DESC);
CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'BASIC', since BIGINT NOT NULL, auto_renew BOOLEAN NOT NULL DEFAULT TRUE, plan_id TEXT);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscribers (user_id); CREATE INDEX IF NOT EXISTS idx_subs_email ON subscribers (user_id, email);
CREATE TABLE IF NOT EXISTS activations (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, at BIGINT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL, plan_name TEXT NOT NULL, app_name TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL, ref TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_act_user ON activations (user_id);
CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, at BIGINT NOT NULL, app_id TEXT NOT NULL, app_name TEXT NOT NULL, plan_name TEXT NOT NULL, customer_phone TEXT NOT NULL, address TEXT NOT NULL, zone_name TEXT NOT NULL, base_amount NUMERIC(12,2) NOT NULL, fee_amount NUMERIC(12,2) NOT NULL, total NUMERIC(12,2) NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'en_attente', delivered_at BIGINT);
CREATE INDEX IF NOT EXISTS idx_del_user ON deliveries (user_id); CREATE INDEX IF NOT EXISTS idx_del_status ON deliveries (user_id, status);
CREATE TABLE IF NOT EXISTS sms_log (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, at BIGINT NOT NULL, raw TEXT NOT NULL, ok BOOLEAN NOT NULL, source TEXT, amount NUMERIC(12,2), ref TEXT, sender TEXT, webhook TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sms_user ON sms_log (user_id, at DESC);
CREATE TABLE IF NOT EXISTS engine_log (id TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, at BIGINT NOT NULL, tag TEXT NOT NULL, msg TEXT NOT NULL, tone TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_engine_user ON engine_log (user_id, at DESC);
CREATE TABLE IF NOT EXISTS merchant_settings (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, alarm_enabled BOOLEAN NOT NULL DEFAULT TRUE, volume INT NOT NULL DEFAULT 70, monitoring BOOLEAN NOT NULL DEFAULT TRUE, urgency TEXT NOT NULL DEFAULT 'haute', webhook_url TEXT, secret TEXT);
CREATE TABLE IF NOT EXISTS webhook_events (id BIGSERIAL PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, event TEXT NOT NULL, url TEXT NOT NULL, http_code INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_wh_user ON webhook_events (user_id);
