# 🚀 Guide de Migration - ZakaPro

## Problème Identifié

Les logs Vercel montrent :
```
[zakapro:auth:register:db] column "name" of relation "users" does not exist
```

**Cause :** La table `users` existe dans votre base de données Neon, mais elle a été créée **avant** l'ajout des colonnes `name`, `is_verified`, `verification_token`, etc. Les migrations dans `db/schema.sql` n'ont jamais été exécutées.

---

## ✅ Solution : Exécuter les Migrations

### Option 1 : Via Neon Dashboard (Recommandé)

1. Allez sur https://console.neon.tech
2. Sélectionnez votre projet ZakaPro
3. Cliquez sur **"SQL Editor"** dans le menu de gauche
4. Copiez-collez le contenu de `db/schema.sql`
5. Exécutez le script entier

**OU** exécutez uniquement les migrations manquantes :

```sql
-- Ajouter les colonnes manquantes à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;

-- Créer l'index pour le token de vérification
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);
```

### Option 2 : Via CLI Neon

```bash
# Installer Neon CLI
npm install -g neonctl

# Se connecter
neonctl auth

# Exécuter le script SQL
neonctl sql --file db/schema.sql --project-id <votre-project-id>
```

### Option 3 : Via psql en local

```bash
# Récupérer l'URL de connexion depuis Neon Dashboard
# Puis exécuter :
psql "postgresql://user:password@ep-xxx-yyy.region.neon.tech/dbname?sslmode=require" -f db/schema.sql
```

---

## 🔍 Vérification Après Migration

Exécutez cette requête SQL pour vérifier que la table est correcte :

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
```

**Résultat attendu :**
```
id          | uuid     | NO
name        | text     | NO
email       | text     | NO
password_hash | text   | NO
is_verified | boolean  | NO
verification_token | text | YES
verification_expires | timestamptz | YES
created_at  | timestamptz | NO
```

---

## 🧪 Test des Endpoints

Après migration, testez avec curl :

```bash
# Register
curl -X POST https://zakapro.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test1234"}'

# Login
curl -X POST https://zakapro.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'

# Me (après login)
curl -X GET https://zakapro.vercel.app/api/auth/me \
  -H "Cookie: zakapro_token=<votre_token>"
```

---

## ⚠️ Notes Importantes

1. **DATABASE_URL** doit être configurée dans Vercel → Settings → Environment Variables
2. **JWT_SECRET** doit être un secret fort (min 32 caractères)
3. **RESEND_API_KEY** est requis pour l'envoi d'emails de vérification
4. Les migrations sont **idempotentes** (peuvent être exécutées plusieurs fois sans danger)

---

## 📋 Checklist Finale

- [ ] Exécuter migrations SQL sur Neon
- [ ] Vérifier structure table `users`
- [ ] Tester endpoint `/api/auth/register` → devrait retourner 201
- [ ] Tester endpoint `/api/auth/login` → devrait retourner 200
- [ ] Tester endpoint `/api/auth/me` → devrait retourner 200 si authentifié

---

**Support :** Si vous rencontrez toujours des erreurs, copiez-collez les logs Vercel complets.
