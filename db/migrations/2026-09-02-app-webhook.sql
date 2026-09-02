-- Webhook isolé par application.
-- Ce fichier contient uniquement du SQL PostgreSQL : ne pas préfixer avec le chemin du fichier.
ALTER TABLE apps
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

CREATE INDEX IF NOT EXISTS idx_apps_user_webhook_url
  ON apps (user_id)
  WHERE webhook_url IS NOT NULL AND webhook_url <> '';
