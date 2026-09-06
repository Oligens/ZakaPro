/* ============================================================
   ZakaPro — Bibliothèque partagée des fonctions serverless
   · Pool PostgreSQL Neon (DATABASE_URL), URL assainie pour le
     driver serverless (channel_binding retiré — géré par TLS)
   · JWT HS256 en cookie httpOnly (zakapro_token)
   · Réponses JSON unifiées { success, ... } — plus de 500 brut
   Sécurité : aucune clé n'est exposée au client.
   ============================================================ */

import { Pool } from "@neondatabase/serverless";
import ws from "ws";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "zakapro_dev_secret_change_me_in_production_0123456789abcdef";
const COOKIE_NAME = "zakapro_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

function cleanDbUrl(url) {
  return String(url || "")
    .replace(/([?&])channel_binding=require(&|$)/g, (_m, p1, p2) => (p2 ? p1 : ""))
    .replace(/[?&]$/, "");
}

const DB_URL = cleanDbUrl(process.env.DATABASE_URL);

export const pool = DB_URL
  ? new Pool({
      connectionString: DB_URL,
      max: 3,
      webSocketConstructor: ws,
    })
  : null;

export function dbReady() {
  return pool !== null;
}

function cookieAttributes() {
  const secure = process.env.VERCEL || process.env.NODE_ENV === "production" ? "Secure;" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; ${secure}`;
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res, user) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${signToken(user)}; ${cookieAttributes()}`);
}

export function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function getSession(req) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Authentification requise", code: "unauthorized" });
    return null;
  }
  return session;
}

export function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Les endpoints API sont sessionnés : aucune réponse ne doit être servie
  // depuis un cache avec l'état d'authentification d'une autre requête.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
  res.end(JSON.stringify({ success: status < 400, ...body }));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Corps de requête trop volumineux"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

export function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `https://${req.headers.host || "localhost"}`;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
