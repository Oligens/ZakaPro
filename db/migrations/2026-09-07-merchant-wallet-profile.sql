-- ZakaPro — profil portefeuille marchand durable et partagé entre les applications.
CREATE TABLE IF NOT EXISTS merchant_wallet_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  moncash_name  TEXT NOT NULL DEFAULT '',
  moncash_phone TEXT NOT NULL DEFAULT '',
  natcash_name  TEXT NOT NULL DEFAULT '',
  natcash_phone TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration des anciennes valeurs users.* sans écraser un profil déjà enregistré.
INSERT INTO merchant_wallet_profiles (user_id, moncash_name, moncash_phone, natcash_name, natcash_phone)
SELECT id,
       COALESCE(moncash_name, ''),
       COALESCE(moncash_phone, ''),
       COALESCE(natcash_name, ''),
       COALESCE(natcash_phone, '')
FROM users
WHERE COALESCE(moncash_name, '') <> ''
   OR COALESCE(moncash_phone, '') <> ''
   OR COALESCE(natcash_name, '') <> ''
   OR COALESCE(natcash_phone, '') <> ''
ON CONFLICT (user_id) DO NOTHING;
