-- ============================================================
-- ZakaPro - Schéma de Base de Données Complet et Corrigé
-- Compatible Neon PostgreSQL + Vercel Serverless
-- ============================================================
-- Instructions:
-- 1. Allez sur https://console.neon.tech
-- 2. Sélectionnez votre projet ZakaPro
-- 3. Ouvrez le "SQL Editor"
-- 4. Copiez-collez TOUT ce script et exécutez-le
-- 5. Vérifiez qu'aucune erreur n'apparaît
-- ============================================================

-- Extension pour la génération de UUIDs uniques (déjà incluse dans Neon)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TABLE DES UTILISATEURS (Gestion Inscription / Connexion)
-- ============================================================
-- Cette table est LA SEULE à utiliser. Les colonnes 'full_name' 
-- ont été remplacées par 'name' pour correspondre au code API.

CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL,                -- Remplace 'full_name'
    email                TEXT NOT NULL UNIQUE,
    password_hash        TEXT NOT NULL,
    avatar_url           TEXT,                         -- Optionnel
    is_pro               BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token   TEXT,                         -- Pour vérification email
    verification_expires TIMESTAMPTZ,                  -- Expiration du token
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. TABLE DES SESSIONS / TOKENS DE CONNEXION
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. TABLE DES NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    message    TEXT NOT NULL,
    type       VARCHAR(50) NOT NULL DEFAULT 'info',  -- 'info', 'warning', 'success', 'live'
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    link_url   VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- MIGRATION : Ajout des colonnes manquantes si la table existait déjà
-- ============================================================
-- Ces commandes sont sans danger même si les colonnes existent déjà

-- Ajout de 'name' si seulement 'full_name' existait
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

-- Si vous aviez des données dans 'full_name', on les bascule dans 'name'
-- (Cette colonne sera supprimée plus tard après migration complète)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'full_name') THEN
        UPDATE users SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;
    END IF;
END $$;

-- S'assurer que 'name' est NOT NULL avec une valeur par défaut pour les anciens enregistrements
UPDATE users SET name = 'Utilisateur' WHERE name IS NULL OR name = '';

ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users ALTER COLUMN name SET DEFAULT '';

-- Ajout des colonnes de vérification email
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;

-- Ajout des colonnes optionnelles si elles n'existent pas
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ============================================================
-- INDEX POUR OPTIMISER LES REQUÊTES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- ============================================================
-- TRIGGER : Mise à jour automatique de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- NETTOYAGE OPTIONNEL (après vérification que tout fonctionne)
-- ============================================================
-- Une fois que vous avez vérifié que 'name' est bien présent et peuplé,
-- vous pouvez supprimer l'ancienne colonne 'full_name' si elle existe :
-- ALTER TABLE users DROP COLUMN IF EXISTS full_name;

-- ============================================================
-- VÉRIFICATION FINALE
-- ============================================================
-- Exécutez cette requête pour vérifier la structure de la table users :
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- ============================================================
-- DONNÉES DE TEST (optionnel, pour développement uniquement)
-- ============================================================
-- À SUPPRIMER en production ou commenter ci-dessous :
/*
INSERT INTO users (name, email, password_hash, is_verified)
VALUES (
    'Test User',
    'test@zakapro.com',
    '$2b$10$YourHashedPasswordHere',  -- Remplacer par un vrai hash bcrypt
    TRUE
) ON CONFLICT (email) DO NOTHING;
*/

-- ============================================================
-- FIN DU SCRIPT
-- ============================================================
