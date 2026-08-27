/* ============================================================
   ZakaPro — Authentification (Vercel Serverless)
  Actions : register · login · verify · send-verification · me · logout
   · bcrypt (12 rounds) pour les mots de passe
    · Jeton de vérification à usage unique (24 h) envoyé via SMTP Gmail
   · Session JWT HS256 en cookie httpOnly
    · Robustesse : chaque étape (Neon, SMTP) est isolée dans un
     try/catch et retourne { success:false, error } + code HTTP
     approprié — la fonction ne plante jamais en 500 brut.
   ============================================================ */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import {
  pool,
  dbReady,
  readBody,
  sendJson,
  setAuthCookie,
  clearAuthCookie,
  getSession,
  appUrl,
  EMAIL_RE,
} from "../_lib.js";

function verificationEmailHtml(name, link) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#090D16;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#141923;border:1px solid #1E2632;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 32px;border-bottom:1px solid #1E2632;">
        <span style="display:inline-block;background:#EAB308;color:#090D16;font-weight:800;font-size:20px;border-radius:10px;padding:8px 14px;">Z</span>
        <span style="color:#E9EEF6;font-weight:800;font-size:18px;letter-spacing:1px;margin-left:10px;">ZAKA <span style="color:#EAB308;">PRO</span></span>
      </div>
      <div style="padding:32px;">
        <h1 style="color:#E9EEF6;font-size:22px;margin:0 0 12px;">Bonjou, ${name}</h1>
        <p style="color:#8B98AB;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Merci de rejoindre ZakaPro — la passerelle Mobile Money haïtienne.
          Confirmez votre adresse email pour activer votre compte marchand.
        </p>
        <a href="${link}" style="display:inline-block;background:#EAB308;color:#090D16;font-weight:800;font-size:14px;text-decoration:none;border-radius:10px;padding:14px 28px;">
          Confirmer mon email
        </a>
        <p style="color:#5C6980;font-size:12px;line-height:1.6;margin:24px 0 0;">
          Ce lien expire dans 24 heures.<br/>
          Si le bouton ne fonctionne pas, copiez ce lien :<br/>
          <span style="color:#8B98AB;word-break:break-all;">${link}</span>
        </p>
      </div>
      <div style="padding:20px 32px;border-top:1px solid #1E2632;">
        <p style="color:#5C6980;font-size:11px;margin:0;">
          ZakaPro · Paiements MonCash & Natcash · Port-au-Prince, Haïti
        </p>
      </div>
    </div>
  </div>`;
}

/** Envoi SMTP isolé — lève une erreur explicite, jamais un crash. */
async function sendVerificationEmail(email, name, token, req) {
  const user = String(process.env.EMAIL_USER || "").trim();
  const password = String(process.env.EMAIL_PASS || "");
  if (!user || !password) {
    throw new Error("Configuration SMTP incomplète : renseignez EMAIL_USER et EMAIL_PASS.");
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password },
  });
  const link = `${appUrl(req)}/#/verify-email?token=${token}`;
  await transporter.sendMail({
    from: { name: "ZakaPro", address: user },
    to: email,
    subject: "ZakaPro — Confirmez votre adresse email",
    html: verificationEmailHtml(name, link),
  });
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, verified: row.is_verified };
}

export default async function handler(req, res) {
  const action = req.query.action;

  try {
    /* ---------- me ---------- */
    if (action === "me") {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: "Non connecté", code: "unauthorized" });
      if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée (DATABASE_URL).", code: "config" });
      try {
        const { rows } = await pool.query("SELECT id, name, email, is_verified FROM users WHERE id = $1", [session.sub]);
        if (!rows.length) {
          clearAuthCookie(res);
          return sendJson(res, 401, { error: "Compte introuvable", code: "unauthorized" });
        }
        return sendJson(res, 200, { user: publicUser(rows[0]) });
      } catch (err) {
        console.error("[zakapro:auth:me]", err.message);
        return sendJson(res, 503, { error: "Base de données momentanément indisponible — réessayez.", code: "db_unavailable" });
      }
    }

    /* ---------- logout ---------- */
    if (action === "logout") {
      clearAuthCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "POST") return sendJson(res, 405, { error: "Méthode non autorisée", code: "method" });

    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: "Corps de requête JSON invalide.", code: "invalid_json" });
    }

    /* ============================================================
      REGISTER — INSERT users + email SMTP, entièrement protégé
       ============================================================ */
    if (action === "register") {
      /* Pré-vérification de la configuration (évite tout 500 brut) */
      if (!dbReady()) {
        return sendJson(res, 503, {
          error: "Base de données non configurée : ajoutez DATABASE_URL dans Vercel → Settings → Environment Variables.",
          code: "config",
        });
      }

      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (name.length < 2) return sendJson(res, 400, { error: "Nom complet requis (2 caractères min).", code: "validation" });
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "Adresse email invalide.", code: "validation" });
      if (password.length < 8) return sendJson(res, 400, { error: "Mot de passe : 8 caractères minimum.", code: "validation" });

      /* 1) Vérification d'unicité + INSERT (erreurs Neon capturées) */
      let created;
      try {
        const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rows.length) {
          return sendJson(res, 409, { error: "Un compte existe déjà avec cet email.", code: "exists" });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 3600 * 1000);

        const { rows } = await pool.query(
          `INSERT INTO users (name, email, password_hash, is_verified, verification_token, verification_expires)
           VALUES ($1, $2, $3, false, $4, $5)
           RETURNING id, name, email, is_verified`,
          [name, email, passwordHash, token, expires]
        );
        created = { row: rows[0], token };
      } catch (err) {
        console.error("[zakapro:auth:register:db]", err.message);
        /* Contrainte d'unicité violée entre le SELECT et l'INSERT */
        if (err.code === "23505") {
          return sendJson(res, 409, { error: "Un compte existe déjà avec cet email.", code: "exists" });
        }
        return sendJson(res, 503, {
          error: "Impossible d'enregistrer le compte (base de données indisponible). Réessayez dans un instant.",
          code: "db_error",
        });
      }

      /* 2) Envoi de l'e-mail de confirmation via SMTP.
            En cas d'échec : on supprime le compte créé pour que
            l'utilisateur puisse réessayer proprement. */
      try {
        await sendVerificationEmail(email, name, created.token, req);
      } catch (err) {
        console.error("[zakapro:auth:register:email]", err.message);
        try {
          await pool.query("DELETE FROM users WHERE id = $1 AND is_verified = false", [created.row.id]);
        } catch {
          /* nettoyage best-effort */
        }
        return sendJson(res, 502, {
          error: `Compte non finalisé : ${err.message} Vérifiez la configuration SMTP sur Vercel, puis réessayez.`,
          code: "email_failed",
        });
      }

      return sendJson(res, 201, { ok: true, user: publicUser(created.row), message: "Email de vérification envoyé" });
    }

    /* ---------- login ---------- */
    if (action === "login") {
      if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée (DATABASE_URL).", code: "config" });

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!EMAIL_RE.test(email) || !password) {
        return sendJson(res, 400, { error: "Email et mot de passe requis.", code: "validation" });
      }

      let rows;
      try {
        ({ rows } = await pool.query("SELECT id, name, email, password_hash, is_verified FROM users WHERE email = $1", [email]));
      } catch (err) {
        console.error("[zakapro:auth:login:db]", err.message);
        return sendJson(res, 503, { error: "Base de données momentanément indisponible — réessayez.", code: "db_unavailable" });
      }

      if (!rows.length) return sendJson(res, 401, { error: "Identifiants incorrects.", code: "invalid_credentials" });

      const ok = await bcrypt.compare(password, rows[0].password_hash);
      if (!ok) return sendJson(res, 401, { error: "Identifiants incorrects.", code: "invalid_credentials" });

      if (!rows[0].is_verified) {
        return sendJson(res, 403, { error: "Compte non vérifié — consultez votre boîte mail.", code: "unverified", email });
      }

      setAuthCookie(res, rows[0]);
      return sendJson(res, 200, { user: publicUser(rows[0]) });
    }

    /* ---------- verify ---------- */
    if (action === "verify") {
      if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée (DATABASE_URL).", code: "config" });

      const token = String(body.token || "");
      if (!token) return sendJson(res, 400, { error: "Jeton manquant.", code: "invalid_token" });

      try {
        const { rows } = await pool.query(
          `UPDATE users
           SET is_verified = true, verification_token = NULL, verification_expires = NULL
           WHERE verification_token = $1 AND (verification_expires IS NULL OR verification_expires > now())
           RETURNING id, name, email, is_verified`,
          [token]
        );
        if (!rows.length) return sendJson(res, 400, { error: "Lien invalide ou expiré.", code: "invalid_token" });

        setAuthCookie(res, rows[0]);
        return sendJson(res, 200, { user: publicUser(rows[0]) });
      } catch (err) {
        console.error("[zakapro:auth:verify:db]", err.message);
        return sendJson(res, 503, { error: "Base de données momentanément indisponible — réessayez.", code: "db_unavailable" });
      }
    }

    /* ---------- send-verification ---------- */
    if (action === "send-verification") {
      if (!dbReady()) return sendJson(res, 503, { error: "Base de données non configurée (DATABASE_URL).", code: "config" });

      const email = String(body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: "Adresse email invalide.", code: "validation" });

      try {
        const { rows } = await pool.query("SELECT id, name, is_verified FROM users WHERE email = $1", [email]);
        if (!rows.length) return sendJson(res, 200, { ok: true }); // anti-énumération
        if (rows[0].is_verified) return sendJson(res, 200, { ok: true, already: true });

        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 24 * 3600 * 1000);
        await pool.query("UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3", [token, expires, rows[0].id]);
        await sendVerificationEmail(email, rows[0].name, token, req);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error("[zakapro:auth:send-verification]", err.message);
        return sendJson(res, 502, { error: `Envoi impossible : ${err.message}`, code: "email_failed" });
      }
    }

    return sendJson(res, 404, { error: "Action inconnue", code: "not_found" });
  } catch (err) {
    /* Filet de sécurité final : message clair, aucun détail interne. */
    console.error("[zakapro:auth:fatal]", err);
    return sendJson(res, 500, { error: "Erreur serveur inattendue — réessayez.", code: "server" });
  }
}
