/* ============================================================
   ZakaPro — Couche d'accès aux données
   ============================================================ */

import { DEFAULT_SETTINGS, type Activation, type DeliveryAlert, type DeliveryZone, type EngineLogEntry, type SmsLogEntry, type Subscriber, type Transaction, type ZakaApp, type ZakaPlan, type ZakaSettings } from "./data";

export interface ZakaDb { rev: number; apps: ZakaApp[]; plans: ZakaPlan[]; zones: DeliveryZone[]; transactions: Transaction[]; subscribers: Subscriber[]; activations: Activation[]; deliveries: DeliveryAlert[]; smsLog: SmsLogEntry[]; engineLog: EngineLogEntry[]; webhookCount: number; settings: ZakaSettings; }
export const EMPTY_DB: ZakaDb = { rev: 0, apps: [], plans: [], zones: [], transactions: [], subscribers: [], activations: [], deliveries: [], smsLog: [], engineLog: [], webhookCount: 0, settings: DEFAULT_SETTINGS };

export interface ZakaApi {
  load(): Promise<ZakaDb>;
  save(db: ZakaDb): void;
  subscribe(cb: (db: ZakaDb) => void): () => void;
  updateAppWebhook(appKey: string, webhookUrl: string): Promise<{ appId: string; webhookUrl: string; fallback: boolean }>;
  listAppPlans(appKeyOrId: string): Promise<ZakaPlan[]>;
}

function notifyAuthExpired() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("zakapro:auth-expired"));
}

function notifyPersistenceError(message: string, code = "save_error") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("zakapro:persistence-error", { detail: { message, code } }));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { ...(init?.headers || {}), "Cache-Control": "no-cache" },
  });
}

function assertJson(res: Response): void {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new Error("API de données indisponible — déployez les fonctions serverless (/api) sur Vercel pour activer Neon DB.");
}

class RemoteApi implements ZakaApi {
  private writeQueue: Promise<void> = Promise.resolve();
  private writeGeneration = 0;
  private acknowledgedRev = 0;
  private revisionInitialized = false;

  async load(): Promise<ZakaDb> {
    for (;;) {
      const generationAtStart = this.writeGeneration;
      await this.writeQueue;
      let res: Response;
      try { res = await apiFetch("/api/db"); } catch { throw new Error("API injoignable — vérifiez votre connexion réseau."); }
      if (res.status === 401) {
        notifyAuthExpired();
        throw new Error("Session ZakaPro expirée — reconnectez-vous.");
      }
      assertJson(res);
      const parsed = (await res.json()) as Partial<ZakaDb> & { error?: string; serverRev?: number };
      if (!res.ok) throw new Error(parsed.error ?? `Erreur de l'API (HTTP ${res.status}) — réessayez.`);
      if (generationAtStart !== this.writeGeneration) continue;

      const serverRev = Number.isFinite(Number(parsed.rev)) ? Number(parsed.rev) : 0;
      this.acknowledgedRev = serverRev;
      this.revisionInitialized = true;

      return { ...EMPTY_DB, ...parsed, rev: serverRev, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } };
    }
  }

  save(db: ZakaDb): void {
    const generation = ++this.writeGeneration;
    this.writeQueue = this.writeQueue.then(async () => {
      /*
       * IMPORTANT:
       * Do not send db.rev blindly. A React snapshot may contain an old
       * revision (especially after a refresh or another tab writes).
       * The server revision acknowledged by this API is authoritative.
       */
      const revision = this.revisionInitialized ? this.acknowledgedRev : Number.isFinite(Number(db.rev)) ? Number(db.rev) : 0;
      const payload = { ...db, rev: revision };

      let res: Response;
      try {
        res = await apiFetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch {
        notifyPersistenceError("Impossible de joindre le serveur : vos modifications ne sont pas confirmées.", "offline");
        throw new Error("API injoignable — sauvegarde non confirmée.");
      }

      assertJson(res);
      const body = (await res.json()) as { error?: string; code?: string; serverRev?: number; rev?: number };

      if (res.status === 401) {
        notifyAuthExpired();
        notifyPersistenceError("Session ZakaPro expirée : la modification n'a pas été enregistrée. Reconnectez-vous.", "unauthorized");
        throw new Error("Session ZakaPro expirée — sauvegarde refusée.");
      }

      if (res.status === 409 && body.code === "stale_write") {
        /*
         * Rebase the local API revision instead of retrying the same stale
         * revision forever. The next queued snapshot will use serverRev.
         */
        if (Number.isFinite(Number(body.serverRev))) {
          this.acknowledgedRev = Number(body.serverRev);
          this.revisionInitialized = true;
        }
        console.warn(`[zakapro:db:conflict:${generation}]`, body.error, { serverRev: body.serverRev, localRev: revision });
        notifyPersistenceError("La révision serveur a changé. La prochaine sauvegarde utilisera automatiquement la nouvelle révision.", "stale_write");
        return;
      }

      if (!res.ok) {
        notifyPersistenceError(body.error ?? `Erreur de sauvegarde (HTTP ${res.status}).`, body.code ?? "save_error");
        throw new Error(body.error ?? `Erreur de sauvegarde (HTTP ${res.status}).`);
      }

      const nextRev = Number(body.rev ?? body.serverRev);
      if (Number.isFinite(nextRev)) {
        this.acknowledgedRev = nextRev;
        this.revisionInitialized = true;
      }
    }).catch((err: unknown) => {
      console.error(`[zakapro:db:save:${generation}]`, err);
    });
  }

  async updateAppWebhook(appKey: string, webhookUrl: string): Promise<{ appId: string; webhookUrl: string; fallback: boolean }> {
    const res = await apiFetch(`/api/apps/${encodeURIComponent(appKey)}/webhook`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhookUrl }) });
    assertJson(res);
    const body = (await res.json()) as { error?: string; code?: string; app?: { id: string; webhookUrl: string }; fallback?: boolean };
    if (res.status === 401) {
      notifyAuthExpired();
      notifyPersistenceError("Session ZakaPro expirée : le webhook n'a pas été enregistré. Reconnectez-vous.", "unauthorized");
      throw new Error("Session ZakaPro expirée — reconnectez-vous pour enregistrer le webhook.");
    }
    if (!res.ok || !body.app) {
      notifyPersistenceError(body.error ?? `Erreur webhook (HTTP ${res.status}).`, body.code ?? "webhook_error");
      throw new Error(body.error ?? `Erreur webhook (HTTP ${res.status}).`);
    }
    return { appId: body.app.id, webhookUrl: body.app.webhookUrl, fallback: Boolean(body.fallback) };
  }

  async listAppPlans(appKeyOrId: string): Promise<ZakaPlan[]> {
    const res = await apiFetch(`/api/apps/${encodeURIComponent(appKeyOrId)}/plans`, { headers: { Accept: "application/json" } });
    assertJson(res);
    const body = (await res.json()) as { error?: string; plans?: ZakaPlan[] };
    if (res.status === 401) {
      notifyAuthExpired();
      throw new Error("Session ZakaPro expirée — reconnectez-vous.");
    }
    if (!res.ok || !Array.isArray(body.plans)) throw new Error(body.error ?? `Erreur plans (HTTP ${res.status}).`);
    return body.plans;
  }

  subscribe(cb: (db: ZakaDb) => void): () => void {
    const t = window.setInterval(() => { void this.load().then(cb).catch(() => {}); }, 8000);
    return () => window.clearInterval(t);
  }
}

export const api: ZakaApi = new RemoteApi();
