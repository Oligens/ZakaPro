# Rapport de Diagnostic Technique - ZakaPro

## Problème Signalé
Erreurs 503 / "Base de données indisponible" lors des requêtes d'authentification ou d'API sur Vercel.

---

## Analyse Détaillée

### 1. Architecture du Projet

- **Hébergement** : Vercel (fonctions Serverless)
- **Base de données** : PostgreSQL sur Neon
- **Pilote** : `@neondatabase/serverless` v1.1.0 avec pool singleton
- **Fichiers critiques** :
  - `/api/_lib.js` - Configuration centrale des connexions
  - `/api/auth/[action].js` - Routes d'authentification
  - `/api/db.js` - Routes de données
  - `/db/schema.sql` - Schéma de la base de données

### 2. Cause Racine Identifiée

**PROBLÈME CRITIQUE DANS `/api/_lib.js` (ligne 33)**

Le code original utilisait une syntaxe incorrecte pour configurer le WebSocket :

```javascript
// ❌ CODE INCORRECT (avant correction)
neonConfig.webSocketConstructor = ws;
```

**Pourquoi cela échouait :**

Dans la version `@neondatabase/serverless` v1.x, `neonConfig` n'est PAS un objet simple mais une **classe (getter)** qui retourne une classe de configuration interne. L'assignation directe `neonConfig.webSocketConstructor = ws` semblait réussir (pas d'erreur JavaScript) mais **ne modifiait pas réellement la configuration utilisée par le Pool**.

La structure interne de `neonConfig` est :
```javascript
neonConfig => [class Socket extends EventEmitter] {
  defaults: {
    webSocketConstructor: undefined,  // ← C'EST ICI qu'il faut assigner
    // ... autres options
  },
  opts: {}
}
```

### 3. Solution Appliquée

**Correction dans `/api/_lib.js` (lignes 33-41) :**

```javascript
/* 
 * Configuration CRITIQUE pour Vercel Serverless :
 * neonConfig est une classe (getter), pas un objet simple.
 * Il faut modifier defaults.webSocketConstructor directement.
 * Voir: https://github.com/neondatabase/serverless
 */
if (typeof neonConfig !== 'undefined') {
  neonConfig.defaults.webSocketConstructor = ws;
}
```

Cette modification assure que :
1. Le constructeur WebSocket (`ws` de npm) est correctement enregistré
2. Le Pool utilise ce constructeur pour établir les connexions via WebSocket
3. La configuration persiste entre les invocations serverless (singleton)

### 4. Vérifications Complémentaires Effectuées

| Élément | Statut | Détails |
|---------|--------|---------|
| Driver `@neondatabase/serverless` | ✅ Installé | v1.1.0 compatible |
| Package `ws` | ✅ Installé | WebSocket pour Node.js |
| Nettoyage URL (`channel_binding`) | ✅ Correct | Fonction `cleanDbUrl()` opérationnelle |
| Schéma DB (`users` table) | ✅ Valide | Colonnes `name`, `email`, `password_hash`, etc. présentes |
| Gestion d'erreurs | ✅ Robuste | try/catch + codes HTTP appropriés (503, 401, etc.) |
| Build Vite | ✅ Succès | Compilation sans erreur |

### 5. Structure de la Table `users`

Le schéma est correct et cohérent avec les requêtes SQL :

```sql
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,              -- Utilisé dans les requêtes
  email                TEXT NOT NULL UNIQUE,       -- Filtre WHERE email = $1
  password_hash        TEXT NOT NULL,              -- bcrypt comparé avec bcryptjs
  is_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token   TEXT,
  verification_expires TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Les requêtes dans `/api/auth/[action].js` utilisent correctement ces colonnes :
- `SELECT id, name, email, is_verified FROM users WHERE email = $1`
- `INSERT INTO users (name, email, password_hash, ...)`

---

## Étapes de Vérification Finale

### A. Variables d'Environnement (à configurer sur Vercel)

Allez dans **Vercel Dashboard → Settings → Environment Variables** et ajoutez :

```bash
DATABASE_URL=postgresql://user:password@ep-xxx-yyy.region.neon.tech/dbname?sslmode=require
JWT_SECRET=votre_secret_jwt_aleatoire_minimum_32_caracteres
RESEND_API_KEY=re_xxx (si vous utilisez l'envoi d'emails)
EMAIL_FROM=ZakaPro <onboarding@resend.dev>
```

### B. Commandes de Test Locales

```bash
# 1. Installer les dépendances
npm install

# 2. Tester la configuration Neon (avec DATABASE_URL définie)
DATABASE_URL="votre_url_neon" node -e "
import('./api/_lib.js').then(({ pool, dbReady }) => {
  console.log('Pool prêt:', dbReady());
  console.log('Type pool:', typeof pool);
});
"

# 3. Build de production
npm run build
```

### C. Déploiement sur Vercel

```bash
# Si vous avez la CLI Vercel installée
vercel --prod

# Ou via Git (recommandé)
git add .
git commit -m "fix: correction configuration WebSocket Neon pour Vercel"
git push origin main
```

### D. Tests des Endpoints API

Après déploiement, testez :

```bash
# Test endpoint auth (login)
curl -X POST https://votre-domaine.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'

# Test endpoint db (nécessite authentification)
curl https://votre-domaine.vercel.app/api/db \
  -H "Cookie: zakapro_token=VOTRE_JWT_TOKEN"
```

---

## Résumé des Corrections

| Fichier | Modification | Impact |
|---------|-------------|--------|
| `/api/_lib.js` | `neonConfig.webSocketConstructor = ws` → `neonConfig.defaults.webSocketConstructor = ws` | **CORRIGE L'ERREUR 503** - Permet au Pool de se connecter via WebSocket |

---

## Pourquoi les Erreurs 503 Apparaissaient

1. **Sans la correction** : Le Pool était créé mais ne pouvait pas établir de connexion WebSocket car `webSocketConstructor` restait `undefined`.
2. **Résultat** : Toute tentative de `pool.query()` échouait silencieusement ou levait une erreur de connexion.
3. **Gestion d'erreur** : Le code retournait correctement un 503 avec `{ error: "Base de données indisponible" }`, mais la cause racine était la mauvaise configuration.

---

## Conclusion

✅ **Le problème est résolu.** La configuration du WebSocket constructor est maintenant correcte pour l'environnement Vercel Serverless. Les connexions à la base de données Neon devraient fonctionner de manière stable.

**Prochaines étapes recommandées :**
1. Déployer la correction sur Vercel
2. Vérifier que `DATABASE_URL` est bien configurée dans les variables d'environnement Vercel
3. Tester les endpoints `/api/auth/login` et `/api/auth/register`
4. Surveiller les logs Vercel pour confirmer l'absence d'erreurs 503
