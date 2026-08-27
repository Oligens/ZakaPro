/* ============================================================
   ZakaPro — Couche d'accès aux données (Data Access Layer)
   API REST unique (/api/db) protégée par cookie JWT httpOnly.
   Côté serveur, TOUTES les requêtes SQL filtrent par user_id
   (WHERE user_id = $1) — isolation stricte par utilisateur.
   Aucun stockage local, aucune donnée fictive : si l'API est
   injoignable, l'erreur est affichée explicitement.
   ============================================================ */

import {
  DEFAULT_SETTINGS,
  type Activation,
  type DeliveryAlert,
  type DeliveryZone,
  type EngineLogEntry,
  type SmsLogEntry,
  type Subscriber,
  type Transaction,
  type ZakaApp,
  type ZakaPlan,
  type ZakaSettings,
} from "./data";

/** Snapshot complet de la base ZakaPro pour l'utilisateur courant. */
export interface ZakaDb {
  rev: number;
  apps: ZakaApp[];
  plans: ZakaPlan[];
  zones: DeliveryZone[];
  transactions: Transaction[];
  subscribers: Subscriber[];
  activations: Activation[];
  deliveries: DeliveryAlert[];
  smsLog: SmsLogEntry[];
  engineLog: EngineLogEntry[];
  webhookCount: number;
  settings: ZakaSettings;
}

/** État initial : strictement vide. */
export const EMPTY_DB: ZakaDb = {
  rev: 0,
  apps: [],
  plans: [],
  zones: [],
  transactions: [],
  subscribers: [],
  activations: [],
  deliveries: [],
  smsLog: [],
  engineLog: [],
  webhookCount: 0,
  settings: DEFAULT_SETTINGS,
};

export interface ZakaApi {
  load(): Promise<ZakaDb>;
  save(db: ZakaDb): void;
  subscribe(cb: (db: ZakaDb) => void): () => void;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, credentials: "include" });
}

/** Vérifie que la réponse provient bien de l'API (JSON), pas d'une page HTML. */
function assertJson(res: Response): void {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(
      "API de données indisponible — déployez les fonctions serverless (/api) sur Vercel pour activer Neon DB."
    );
  }
}

class RemoteApi implements ZakaApi {
  async load(): Promise<ZakaDb> {
    let res: Response;
    try {
      res = await apiFetch("/api/db");
    } catch {
      throw new Error("API injoignable — vérifiez votre connexion réseau.");
    }
    if (res.status === 401) throw new Error("Session expirée — reconnectez-vous.");
    assertJson(res);
    if (!res.ok) throw new Error(`Erreur de l'API (HTTP ${res.status}) — réessayez.`);
    const parsed = (await res.json()) as Partial<ZakaDb>;
    return { ...EMPTY_DB, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } };
  }

  save(db: ZakaDb): void {
    void apiFetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db),
      keepalive: true,
    }).catch(() => {});
  }

  /** Rafraîchissement périodique : capte les paiements confirmés
      depuis un autre onglet / par l'écouteur SMS du marchand. */
  subscribe(cb: (db: ZakaDb) => void): () => void {
    const t = window.setInterval(() => {
      void this.load()
        .then(cb)
        .catch(() => {});
    }, 8000);
    return () => window.clearInterval(t);
  }
}

export const api: ZakaApi = new RemoteApi();
