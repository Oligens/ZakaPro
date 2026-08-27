# ZakaPro — Passerelle Mobile Money Haïtienne

Plateforme de paiement type Stripe adaptée au marché haïtien : **MonCash**, **Natcash**, abonnements premium à activation automatique, webhooks signés HMAC-SHA256 et **écouteur SMS temps réel** avec alarme de livraison.

> PWA prête pour [PWABuilder](https://www.pwabuilder.com) (manifest + service worker + notifications push) — transformable en application Android native.

---

## Fonctionnalités

- **Authentification complète** — inscription (`bcryptjs`, 12 rounds), e-mail de vérification via **Resend**, session JWT en cookie `httpOnly` (7 j), routes protégées `/login` · `/register` · `/verify-email`.
- **Multi-applications** — chaque marchand crée un nombre illimité d'applications isolées, chacune avec sa paire de clés API (`app_key` publique / secrète), son tableau de bord, ses plans et ses transactions. Toutes les requêtes SQL filtrent `WHERE user_id = $1`.
- **Hub de Paiement** — chaque plan génère un lien de checkout hébergé (`/hub/:appId/:planId`) : e-mail, téléphone +509, adresse et zone de livraison avec **frais variables +X %**.
- **Écouteur SMS** — parseur regex des SMS MonCash/Natcash (montant HTG, ID de transaction, expéditeur +509, source), moteur `listener → parser → plans → livraison → webhook → alarme`.
- **Auto-activation PREMIUM** — le montant reçu est vérifié contre les plans (tolérance ±2 %) ; le statut passe `BASIC → PREMIUM` automatiquement.
- **Alarme de livraison** — sirène Web Audio (urgence standard/haute, volume réglable) + alerte urgente (téléphone, adresse, détails, montant perçu) + notification système push.

## Stack

| Couche | Technologie |
|---|---|
| Front | React 18 + Vite + Tailwind CSS v4 · React Router v6 (flags v7) |
| Backend | Vercel Serverless Functions (`/api/*`, ESM) |
| Base de données | **PostgreSQL Neon** (`@neondatabase/serverless`) |
| E-mails | **Resend SDK** |
| Sécurité | `bcryptjs` · `jsonwebtoken` (HS256, cookie httpOnly) |

## Structure

```
api/
  _lib.js            Pool Neon (URL assainie), JWT, cookies, réponses JSON { success }
  auth/[action].js   register · login · verify · resend · me · logout
  db.js              GET/POST /api/db — données isolées par user_id
db/schema.sql        Schéma PostgreSQL complet (à exécuter dans Neon)
public/
  manifest.json      PWA (standalone, portrait, #090D16, shortcuts)
  sw.js              Cache hors-ligne + notifications push
src/
  lib/               moteur métier (parseur SMS, webhooks signés, alarme, store)
  views/             /login · /register · /verify-email · /apps · /app/:id/* · /hub/*
vercel.json          Rewrites SPA + headers de sécurité + cache
deploy/export-github.sh
```

## Développement local

```bash
npm install
cp .env.example .env        # renseignez DATABASE_URL, RESEND_API_KEY, JWT_SECRET…
npx vercel dev              # frontend + fonctions /api/*
```

> Sans backend déployé, les appels API échouent proprement avec un message JSON clair (`{ success: false, error }`) — aucune donnée fictive.

## Déploiement Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `Oligens/ZakaPro`.
2. Framework **Vite** (auto) · Build `npm run build` · Output `dist`.
3. Variables d'environnement :

   | Variable | Description |
   |---|---|
   | `DATABASE_URL` | URL Neon (retirez `channel_binding` — géré par le driver) |
   | `RESEND_API_KEY` | Clé `re_…` |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `EMAIL_FROM` | `ZakaPro <no-reply@votre-domaine.ht>` (domaine vérifié Resend) |
   | `APP_URL` | URL `*.vercel.app` attribuée |

4. **Deploy**, puis exécutez `db/schema.sql` dans la console SQL de Neon.

## Sécurité

- `.env` est exclu via `.gitignore` — les secrets ne doivent jamais être commités.
- Toute réponse API est unifiée `{ success, … }` ; une configuration manquante renvoie `503` explicite au lieu d'un crash 500.
- Les mots de passe ne quittent jamais le serveur ; le client ne voit que le cookie de session.
