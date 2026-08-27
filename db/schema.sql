-- ============================================================
-- ZakaPro — Schéma PostgreSQL (Neon DB)
-- À exécuter une seule fois dans la console SQL Neon :
--   https://console.neon.tech → votre projet → SQL Editor
-- Toutes les tables métier portent user_id → isolation stricte
-- des données par compte marchand (WHERE user_id = $1).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Utilisateurs & authentification ----------
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,              -- bcrypt (12 rounds)
  is_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token   TEXT,                       -- usage unique, 24 h
  verification_expires TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);

-- ---------- Applications du marchand ----------
CREATE TABLE IF NOT EXISTS apps (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  monogram    TEXT NOT NULL,
  color       TEXT NOT NULL,
  public_key  TEXT NOT NULL UNIQUE,                -- zk_pub_… (SDK)
  secret_key  TEXT NOT NULL,                       -- zk_sec_… (webhooks)
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_user ON apps (user_id);

-- ---------- Plans d'abonnement / produits ----------
CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id      TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,              -- HTG
  recurrence  TEXT NOT NULL,                       -- mensuel|trimestriel|annuel|unique
  delivery    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans (user_id);
CREATE INDEX IF NOT EXISTS idx_plans_app ON plans (app_id);

-- ---------- Zones de livraison (frais +X%) ----------
CREATE TABLE IF NOT EXISTS zones (
  id       TEXT PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id   TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  fee_pct  NUMERIC(6,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_zones_user ON zones (user_id);

-- ---------- Transactions ----------
CREATE TABLE IF NOT EXISTS transactions (
  id        TEXT PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id    TEXT NOT NULL,
  type      TEXT NOT NULL,
  email     TEXT NOT NULL,
  amount    NUMERIC(12,2) NOT NULL,
  source    TEXT NOT NULL,                         -- moncash|natcash|autre
  at        BIGINT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'Réussi',
  ref       TEXT NOT NULL,
  sender    TEXT,                                  -- +509…
  delivery  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_app ON transactions (user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_tx_at ON transactions (at DESC);

-- ---------- Abonnés des marchands (statut BASIC/PREMIUM) ----------
CREATE TABLE IF NOT EXISTS subscribers (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'BASIC',       -- BASIC → PREMIUM (auto)
  since       BIGINT NOT NULL,
  auto_renew  BOOLEAN NOT NULL DEFAULT TRUE,
  plan_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscribers (user_id);
CREATE INDEX IF NOT EXISTS idx_subs_email ON subscribers (user_id, email);

-- ---------- Journal des activations PREMIUM ----------
CREATE TABLE IF NOT EXISTS activations (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at          BIGINT NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  plan_name   TEXT NOT NULL,
  app_name    TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  ref         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_act_user ON activations (user_id);

-- ---------- Alertes de livraison ----------
CREATE TABLE IF NOT EXISTS deliveries (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at              BIGINT NOT NULL,
  app_id          TEXT NOT NULL,
  app_name        TEXT NOT NULL,
  plan_name       TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,                   -- téléphone capturé au checkout
  address         TEXT NOT NULL,                   -- adresse capturée au checkout
  zone_name       TEXT NOT NULL,
  base_amount     NUMERIC(12,2) NOT NULL,
  fee_amount      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) NOT NULL,
  ref             TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente → livre
  delivered_at    BIGINT
);
CREATE INDEX IF NOT EXISTS idx_del_user ON deliveries (user_id);
CREATE INDEX IF NOT EXISTS idx_del_status ON deliveries (user_id, status);

-- ---------- Journal SMS (écouteur) ----------
CREATE TABLE IF NOT EXISTS sms_log (
  id       TEXT PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at       BIGINT NOT NULL,
  raw      TEXT NOT NULL,
  ok       BOOLEAN NOT NULL,
  source   TEXT,
  amount   NUMERIC(12,2),
  ref      TEXT,
  sender   TEXT,
  webhook  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sms_user ON sms_log (user_id, at DESC);

-- ---------- Journal moteur ----------
CREATE TABLE IF NOT EXISTS engine_log (
  id      TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      BIGINT NOT NULL,
  tag     TEXT NOT NULL,
  msg     TEXT NOT NULL,
  tone    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_user ON engine_log (user_id, at DESC);

-- ---------- Paramètres du marchand ----------
CREATE TABLE IF NOT EXISTS merchant_settings (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alarm_enabled BOOLEAN NOT NULL DEFAULT TRUE,     -- alarm_enabled
  volume        INT NOT NULL DEFAULT 70,
  monitoring    BOOLEAN NOT NULL DEFAULT TRUE,
  urgency       TEXT NOT NULL DEFAULT 'haute',     -- standard|haute
  webhook_url   TEXT,
  secret        TEXT
);

-- ---------- Événements webhook envoyés ----------
CREATE TABLE IF NOT EXISTS webhook_events (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event     TEXT NOT NULL,
  url       TEXT NOT NULL,
  http_code INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_user ON webhook_events (user_id);
