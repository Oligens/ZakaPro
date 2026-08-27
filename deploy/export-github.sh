#!/usr/bin/env bash
# ============================================================
# ZakaPro — Export du projet vers GitHub (en une commande)
# Dépôt principal : https://github.com/Oligens/ZakaPro
# Dépôt miroir    : https://github.com/Oligens/ZakaProPay
#
# USAGE (macOS / Linux / Git Bash Windows) :
#   chmod +x deploy/export-github.sh && ./deploy/export-github.sh
#
# SÉCURITÉ :
#   · .env (secrets réels) est exclu via .gitignore — le script
#     BLOQUE le push si .env est suivi par git.
#   · Ne collez jamais de token ghp_… dans un terminal : GitHub
#     authentifie via `gh auth login`, HTTPS + navigateur, ou SSH.
#   · Tout token déjà partagé en clair doit être révoqué :
#     GitHub → Settings → Developer settings → Tokens → Revoke.
# ============================================================
set -uo pipefail

REPO_MAIN="https://github.com/Oligens/ZakaPro.git"
REPO_ALT="https://github.com/Oligens/ZakaProPay.git"
PUSH_ALT="${PUSH_ALT:-0}"   # PUSH_ALT=1 ./deploy/export-github.sh → pousse aussi le miroir

# ---- Prérequis -----------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "✗ git n'est pas installé."
  echo "  → macOS : xcode-select --install"
  echo "  → Windows : https://git-scm.com/download/win (puis relancer dans Git Bash)"
  echo "  → Linux : sudo apt install git"
  exit 1
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "→ Vérification des secrets (.env ne doit JAMAIS partir sur GitHub)…"
if git ls-files --cached 2>/dev/null | grep -qE '^\.env(\.|$)'; then
  echo "✗ STOP : .env est suivi par git. Corrigez d'abord avec :"
  echo "    git rm --cached .env && git commit -m \"chore: exclure .env\""
  exit 1
fi
if [ -f .env ] && ! git check-ignore -q .env 2>/dev/null; then
  echo "⚠ Avertissement : .env existe mais n'est pas ignoré — vérifiez .gitignore."
fi

echo "→ Initialisation du dépôt local…"
if [ ! -d .git ]; then
  git init -q
fi
git branch -M main 2>/dev/null || true

echo "→ Commit de l'ensemble du code…"
git add -A
git commit -q -m "feat: ZakaPro — passerelle Mobile Money (auth Neon/SMTP Gmail, écouteur SMS, hub de paiement)" \
  || echo "  (aucun changement à committer)"

echo "→ Contenu prêt à être poussé :"
git status --short | head -40
echo ""

echo "→ Liaison à $REPO_MAIN…"
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_MAIN"

echo "→ Envoi du code (GitHub vous demandera de vous authentifier)…"
if ! git push -u origin main; then
  echo ""
  echo "✗ Le push a échoué (souvent : authentification)."
  echo "  Solution 1 : gh auth login   (puis relancez ce script)"
  echo "  Solution 2 : clé SSH — git remote set-url origin git@github.com:Oligens/ZakaPro.git"
  echo "  Solution 3 : sans terminal → glisser-déposer dans GitHub (voir README.md)"
  exit 1
fi

if [ "$PUSH_ALT" = "1" ]; then
  echo "→ Envoi du miroir vers $REPO_ALT…"
  git remote remove zakapropay 2>/dev/null || true
  git remote add zakapropay "$REPO_ALT"
  git push -u zakapropay main || echo "⚠ Miroir non poussé — vérifiez que le dépôt ZakaProPay existe."
fi

echo ""
echo "✅ Code poussé avec succès."
echo ""
echo "→ ÉTAPE SUIVANTE : déployer sur Vercel"
echo "  1. https://vercel.com/new → Import Git Repository → Oligens/ZakaPro"
echo "  2. Framework : Vite (auto) — Build : npm run build — Output : dist"
echo "  3. Environment Variables (obligatoires) :"
echo "       DATABASE_URL   = postgresql://…@ep-hidden-water-aywc5qmj-pooler…/neondb?sslmode=require"
echo "       EMAIL_USER     = votre-adresse@gmail.com"
echo "       EMAIL_PASS     = mot de passe d'application Google"
echo "       JWT_SECRET     = chaîne longue aléatoire (openssl rand -hex 32)"
echo "       APP_URL        = https://votre-projet.vercel.app (après 1er déploiement)"
echo "  4. Deploy — puis exécutez db/schema.sql dans la console SQL de Neon."
