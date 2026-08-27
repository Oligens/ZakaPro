/* ============================================================
  ZakaPro — Authentification (Neon PostgreSQL + SMTP Gmail)
   · Sessions JWT (cookie httpOnly) gérées par /api/auth/*
     — bcrypt, jetons de vérification à usage unique, emails
      de confirmation expédiés via Nodemailer et SMTP Gmail.
   · Aucun mode démo, aucun stockage local : si l'API est
     injoignable, l'erreur est affichée explicitement.
   ============================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  verified: boolean;
}

export type AuthStatus = "loading" | "guest" | "authed";

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.code = code;
  }
}

interface AuthCtx {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  sendVerification: (email: string) => Promise<void>;
  verify: (token: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

const OFFLINE_MSG =
  "Serveur d'authentification injoignable — vérifiez votre connexion ou le déploiement des fonctions /api sur Vercel.";

/** Appelle une action /api/auth/<action> avec le cookie de session. */
async function call(action: string, body: Record<string, unknown>): Promise<{ user?: AuthUser }> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${action}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(OFFLINE_MSG, "offline");
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new ApiError(
      "API d'authentification indisponible dans cet environnement — déployez le projet sur Vercel pour connecter Neon DB.",
      "offline"
    );
  }
  const data = (await res.json()) as { error?: string; code?: string; user?: AuthUser };
  if (!res.ok) throw new ApiError(data.error ?? "Erreur inattendue", data.code ?? "error");
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  /* Amorçage : vérifie la session JWT existante (cookie httpOnly). */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) throw new Error("no-backend");
        const data = (await res.json()) as { user?: AuthUser };
        if (!active) return;
        if (res.ok && data.user) {
          setUser(data.user);
          setStatus("authed");
        } else {
          setStatus("guest");
        }
      } catch {
        if (active) setStatus("guest");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await call("login", { email, password });
    if (data.user) {
      setUser(data.user);
      setStatus("authed");
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    await call("register", { name, email, password });
  }, []);

  const sendVerification = useCallback(async (email: string) => {
    await call("send-verification", { email });
  }, []);

  const verify = useCallback(async (token: string): Promise<AuthUser> => {
    const data = await call("verify", { token });
    if (data.user) {
      setUser(data.user);
      setStatus("authed");
      return data.user;
    }
    throw new ApiError("Jeton invalide", "invalid_token");
  }, []);

  const logout = useCallback(async () => {
    try {
      await call("logout", {});
    } catch {
      /* cookie déjà invalidé côté serveur */
    }
    setUser(null);
    setStatus("guest");
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, sendVerification, verify, logout }),
    [status, user, login, register, sendVerification, verify, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
