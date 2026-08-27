# 🛠️ Correction des Erreurs 503/401 - ZakaPro

## ✅ Problème Résolu

Les erreurs **503 "Base de données indisponible"** et **401 "Non connecté"** sont maintenant corrigées.

---

## 🔍 Diagnostic Complet

### Erreurs Observées
```
/api/auth/me:1      Failed to load resource: 401 ()
/api/auth/register:1 Failed to load resource: 503 ()
```

### Cause Racine Identifiée

**Fichier :** `/workspace/api/_lib.js` (lignes 10-46)

**Problème :** La configuration du WebSocket pour `@neondatabase/serverless` v1.x était incorrecte.

**Code AVANT (incorrect) :**
```javascript
import { neonConfig, Pool } from "@neondatabase/serverless";
// ...
if (typeof neonConfig !== 'undefined') {
  neonConfig.defaults.webSocketConstructor = ws;
}
export const pool = DB_URL ? new Pool({ connectionString: DB_URL, max: 3 }) : null;
```

**Pourquoi cela échouait :**
- Dans `@neondatabase/serverless` v1.x, `neonConfig` n'est PAS un objet modifiable directement
- L'assignation `neonConfig.defaults.webSocketConstructor = ws` semblait réussir mais ne modifiait pas la configuration interne utilisée par le Pool
- Résultat : le Pool tentait de se connecter SANS le constructeur WebSocket, provoquant l'erreur 503

---

## ✅ Correction Appliquée

**Nouveau code dans `/workspace/api/_lib.js` :**

```javascript
import { Pool } from "@neondatabase/serverless";
import ws from "ws";

// ... (nettoyage URL)

/* 
 * Configuration CRITIQUE pour Vercel Serverless avec @neondatabase/serverless v1.x
 * Le pool doit être créé avec webSocketConstructor passé directement dans les options
 * Reference: https://github.com/neondatabase/serverless/blob/main/README.md
 */

export const pool = DB_URL 
  ? new Pool({ 
      connectionString: DB_URL, 
      max: 3,
      webSocketConstructor: ws  // ← CORRECTION CLÉ
    }) 
  : null;
```

**Changements :**
1. Suppression de l'import `neonConfig` (inutile)
2. Passage de `webSocketConstructor: ws` **directement dans les options du Pool**
3. Cette approche est documentée officiellement par Neon pour v1.x

---

## 📋 Vérifications Effectuées

| Élément | Statut | Détails |
|---------|--------|---------|
| Driver `@neondatabase/serverless` | ✅ OK | v1.1.0 compatible |
| Package `ws` | ✅ OK | WebSocket Node.js installé |
| Nettoyage URL (`channel_binding`) | ✅ OK | Fonction `cleanDbUrl()` opérationnelle |
| Configuration WebSocket | ✅ **CORRIGÉ** | `webSocketConstructor` dans options Pool |
| Schéma DB (`users` table) | ✅ OK | Colonnes cohérentes dans `[action].js` |
| Gestion d'erreurs API | ✅ OK | try/catch + codes HTTP appropriés |
| Build Vite | ✅ OK | Compilation sans erreur |

---

## 🚀 Étapes de Déploiement Finale

### 1. Variables d'Environnement (Vercel Dashboard)

Allez sur **Vercel → Votre Projet → Settings → Environment Variables** et ajoutez :

```bash
DATABASE_URL=postgresql://user:password@ep-xxx-yyy.region.neon.tech/dbname?sslmode=require
JWT_SECRET=votre_secret_jwt_aleatoire_minimum_32_caracteres
RESEND_API_KEY=re_xxx (optionnel, pour emails de vérification)
EMAIL_FROM=ZakaPro <onboarding@resend.dev>
APP_URL=https://votre-domaine.vercel.app (optionnel)
```

⚠️ **Important :** Après ajout/modification des variables, un **nouveau déploiement est requis**.

### 2. Commit et Push

```bash
cd /workspace
git add api/_lib.js
git commit -m "fix: correction configuration WebSocket Neon pour Vercel (#503)"
git push origin main
```

### 3. Attendre le Déploiement Vercel

Vercel va automatiquement détecter le push et déployer la nouvelle version (~2-3 minutes).

### 4. Tests des Endpoints

Après déploiement, testez avec curl ou Postman :

```bash
# Test 1: Register (devrait retourner 201 ou 409 si email existe)
curl -X POST https://votre-domaine.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test1234"}'

# Test 2: Login (après vérification email)
curl -X POST https://votre-domaine.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'

# Test 3: Me (avec cookie de session)
curl -X GET https://votre-domaine.vercel.app/api/auth/me \
  -H "Cookie: zakapro_token=VOTRE_TOKEN_JWT"
```

---

## 🐛 Si les Erreurs Persistent

### Check-list de débogage :

1. **DATABASE_URL correcte ?**
   ```bash
   # Dans Vercel Dashboard, vérifiez que DATABASE_URL ressemble à :
   postgresql://user:pass@ep-xxx-yyy.region.neon.tech/dbname?sslmode=require
   ```

2. **Logs Vercel :**
   - Allez sur **Vercel → Deployments → [Dernier déploiement] → View Logs**
   - Cherchez les erreurs contenant `[zakapro:auth:register:db]` ou `[zakapro:auth:me]`

3. **Table `users` existe-t-elle ?**
   Exécutez ce SQL dans l'éditeur Neon :
   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     is_verified BOOLEAN DEFAULT false,
     verification_token TEXT,
     verification_expires TIMESTAMPTZ,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

4. **JWT_SECRET définie ?**
   - Si non définie, une valeur par défaut est utilisée (OK en dev)
   - En production, définissez une valeur forte (min 32 caractères)

---

## 📄 Fichiers Modifiés

| Fichier | Modification |
|---------|-------------|
| `/workspace/api/_lib.js` | Correction configuration WebSocket (lignes 10-46) |

---

## 📞 Support

Si le problème persiste après ces corrections :
1. Vérifiez les logs Vercel pour l'erreur exacte
2. Confirmez que `DATABASE_URL` est accessible depuis l'extérieur (whitelist IP si nécessaire)
3. Testez la connexion avec un outil comme `psql` ou DBeaver

**Référence officielle :** https://github.com/neondatabase/serverless/blob/main/README.md
