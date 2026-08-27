# 🚨 Migration des Tables Manquantes - ZakaPro

## Problème Identifié

Les erreurs **500** sur `/api/db` sont causées par l'absence de deux tables optionnelles dans votre base de données Neon :
- `merchant_settings` (paramètres du marchand)
- `webhook_events` (journal des événements webhook)

Ces tables ne sont pas critiques pour le fonctionnement de base, mais leur absence provoque des erreurs 500 lors du chargement du dashboard.

## Solution Immédiate

### Option 1 : Exécuter le Script SQL Complet (Recommandé)

1. Rendez-vous sur https://console.neon.tech
2. Sélectionnez votre projet **ZakaPro**
3. Ouvrez le **SQL Editor**
4. Copiez-collez et exécutez le script suivant :

```sql
-- ============================================================
-- TABLES MANQUANTES : merchant_settings & webhook_events
-- ============================================================

-- Table des paramètres du marchand
CREATE TABLE IF NOT EXISTS merchant_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    alarm_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    volume          INTEGER NOT NULL DEFAULT 70,
    monitoring      BOOLEAN NOT NULL DEFAULT TRUE,
    urgency         VARCHAR(50) NOT NULL DEFAULT 'haute',
    webhook_url     TEXT,
    secret          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table des événements webhook
CREATE TABLE IF NOT EXISTS webhook_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, success, failed
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_merchant_settings_user ON merchant_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user ON webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);

-- Trigger pour updated_at sur merchant_settings
DROP TRIGGER IF EXISTS update_merchant_settings_updated_at ON merchant_settings;
CREATE TRIGGER update_merchant_settings_updated_at
    BEFORE UPDATE ON merchant_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Option 2 : Code Correctif Déjà Déployé

Le fichier `/api/db.js` a été modifié pour **gérer gracieusement** l'absence de ces tables :
- Les requêtes vers `merchant_settings` et `webhook_events` sont maintenant entourées de blocs `try/catch`
- Si une table manque, un warning est loggé et l'API continue avec des valeurs par défaut
- Plus d'erreur 500 — le dashboard se charge même sans ces tables

## Vérification Post-Migration

Après avoir exécuté le SQL ci-dessus, vérifiez que les tables existent :

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('merchant_settings', 'webhook_events');
```

## Prochaines Étapes

1. ✅ Le code correctif est déjà commité et poussé sur GitHub
2. ⏳ Attendez le déploiement automatique Vercel (~2-3 min)
3. 🧪 Testez `/api/db` — devrait retourner 200 avec les données
4. 📊 Optionnel : exécutez le SQL ci-dessus pour activer toutes les fonctionnalités

---

**Note :** Les erreurs 401 sur `/api/auth/me` et `/api/auth/login` sont normales si vous n'êtes pas connecté. Elles disparaîtront après une inscription/connexion réussie.
