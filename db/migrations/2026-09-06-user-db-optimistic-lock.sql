-- ZakaPro — verrou/version PostgreSQL par utilisateur
-- Empêche deux onglets/clients de remplacer silencieusement un état plus récent.

CREATE TABLE IF NOT EXISTS user_db_versions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_db_versions_updated_at
  ON user_db_versions (updated_at DESC);

INSERT INTO user_db_versions (user_id, version)
SELECT id, 0 FROM users
ON CONFLICT (user_id) DO NOTHING;
