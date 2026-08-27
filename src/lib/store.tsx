/* ============================================================
   ZakaPro — Store applicatif & moteur métier (multi-applications)
   Aucune donnée fictive : l'état démarre vide et n'est alimenté
   que par des événements réels (Hub, écouteur SMS, actions du
   marchand), isolés par user_id via la couche api.ts.
   Pipeline d'un paiement :
     listener SMS → parseur regex → validation transaction
     → attribution application (app_key / plan / montant)
     → moteur d'abonnements (BASIC → PREMIUM)
     → frais de zone & alerte de livraison + notification
     → webhook signé HMAC-SHA256 (+ retry)
     → alarme sonore (si alarm_enabled)
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  parseSms,
  dispatchWebhook,
  type WebhookDelivery,
  playAlarm,
  playAlarmUrgent,
  playSuccess,
  playTick,
  unlockAudio,
  ensureNotificationPermission,
  pushDeliveryNotification,
} from "./engine";
import { api, EMPTY_DB, type ZakaDb } from "./api";
import { useAuth } from "./auth";
import {
  SOURCE_META,
  buildSeries,
  fmtNum,
  genAppKeys,
  makeIncomingSms,
  matchPlan,
  txId,
  uid,
  type Activation,
  type CommitSession,
  type DayPoint,
  type DeliveryAlert,
  type DeliveryZone,
  type EngineLogEntry,
  type LogTag,
  type LogTone,
  type Recurrence,
  type SmsLogEntry,
  type Subscriber,
  type ToastMsg,
  type Transaction,
  type ZakaApp,
  type ZakaPlan,
  type ZakaSettings,
} from "./data";

export interface ZakaStore {
  db: ZakaDb;
  isLoading: boolean;
  loadError: string | null;
  retryLoad: () => void;

  apps: ZakaApp[];
  plans: ZakaPlan[];
  zones: DeliveryZone[];
  transactions: Transaction[];
  subscribers: Subscriber[];
  activations: Activation[];
  deliveries: DeliveryAlert[];
  smsLog: SmsLogEntry[];
  engineLog: EngineLogEntry[];
  webhookDeliveries: WebhookDelivery[];
  toasts: ToastMsg[];
  settings: ZakaSettings;
  notifSeen: number;
  ringKey: number;

  appBalance: (appId: string) => number;
  seriesFor: (appId: string) => DayPoint[];
  plansFor: (appId: string) => ZakaPlan[];
  zonesFor: (appId: string) => DeliveryZone[];
  pendingDeliveries: DeliveryAlert[];

  createApp: (name: string, color: string) => ZakaApp;
  addPlan: (appId: string, data: { name: string; amount: number; recurrence: Recurrence; delivery: boolean }) => ZakaPlan;
  deletePlan: (planId: string) => void;
  addZone: (appId: string, name: string, feePct: number) => void;
  deleteZone: (zoneId: string) => void;
  setZoneFee: (zoneId: string, feePct: number) => void;
  markDelivered: (alertId: string) => void;
  regenerateAppKey: (appId: string, which: "public" | "secret") => void;

  commitSms: (raw: string, session?: CommitSession) => void;
  simulateSms: () => void;
  testWebhook: () => void;

  pushToast: (t: Omit<ToastMsg, "id">) => void;
  dismissToast: (id: string) => void;
  notify: (title: string, sub?: string) => void;
  setAlarmEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  setMonitoring: (v: boolean) => void;
  setUrgency: (v: ZakaSettings["urgency"]) => void;
  setWebhookUrl: (v: string) => void;
  regenerateSecret: () => void;
  testAlarm: () => void;
  toggleSubscriberAuto: (id: string) => void;
  markNotifRead: () => void;
}

const Ctx = createContext<ZakaStore | null>(null);

export function useZaka(): ZakaStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useZaka doit être utilisé dans <ZakaProvider>");
  return ctx;
}

export function ZakaProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const authed = auth.status === "authed";
  const userId = auth.user?.id ?? null;

  const [db, setDb] = useState<ZakaDb>(EMPTY_DB);
  const [isLoading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [notifSeen, setNotifSeen] = useState(Date.now());
  const [ringKey, setRingKey] = useState(0);

  /* Chargement + abonnement temps réel, uniquement pour une session
     authentifiée : le cookie JWT httpOnly est présenté à /api/db,
     qui filtre chaque requête SQL par user_id (isolation stricte). */
  useEffect(() => {
    if (!authed || !userId) {
      setDb(EMPTY_DB);
      setLoading(false);
      setLoadError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    api
      .load()
      .then((data) => {
        if (active) setDb(data);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Erreur de chargement des données.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = api.subscribe((incoming) => {
      if (!active) return;
      setDb((current) => (incoming.rev > current.rev ? incoming : current));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authed, userId, loadAttempt]);

  const retryLoad = () => setLoadAttempt((n) => n + 1);

  /* Mutation centrale : applique, incrémente la révision, persiste. */
  const apply = useCallback((updater: (d: ZakaDb) => ZakaDb) => {
    setDb((prev) => {
      const next = { ...updater(prev), rev: prev.rev + 1 };
      api.save(next);
      return next;
    });
  }, [api]);

  /* Déblocage audio + permission de notification au premier geste. */
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      void ensureNotificationPermission();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const dbRef = useRef(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  /* ---------- Toasts ---------- */
  const pushToast = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((title: string, sub?: string) => pushToast({ kind: "info", title, sub }), [pushToast]);

  const log = useCallback(
    (tag: LogTag, msg: string, tone: LogTone = "info") => {
      apply((d) => ({ ...d, engineLog: [{ id: uid(), at: Date.now(), tag, msg, tone }, ...d.engineLog].slice(0, 90) }));
    },
    [apply]
  );

  /* ---------- Pipeline SMS → webhook → alarme ---------- */
  const commitSms = useCallback(
    (raw: string, session?: CommitSession) => {
      const d = dbRef.current;
      const s = d.settings;
      const parsed = parseSms(raw);

      log("listener", `SMS entrant capturé — expéditeur ${parsed.sender ?? "inconnu"} (${SOURCE_META[parsed.source].label})`, "info");

      if (!parsed.ok || parsed.amount === null) {
        log("parser", "SMS non transactionnel → ignoré (aucun montant ni verbe de crédit détecté)", "warn");
        apply((prev) => ({
          ...prev,
          smsLog: [{ id: uid(), at: Date.now(), raw, ok: false, source: parsed.source, amount: null, ref: null, sender: parsed.sender, webhook: "ignoré" as const }, ...prev.smsLog].slice(0, 40),
        }));
        pushToast({ kind: "info", title: "SMS non transactionnel ignoré", sub: raw.length > 70 ? raw.slice(0, 70) + "…" : raw });
        return;
      }

      const amount = parsed.amount;
      log("parser", `montant=${fmtNum(amount)} HTG · réf=${parsed.ref ?? "n/a"} · émetteur=${parsed.sender ?? "n/a"} · source=${parsed.source}`, "ok");

      const app = d.apps.find((a) => a.id === session?.appId) ?? d.apps[0];
      if (!app) {
        log("engine", "aucune application configurée → transaction rejetée", "warn");
        return;
      }

      const appPlans = d.plans.filter((p) => p.appId === app.id);
      const plan = session?.planId ? appPlans.find((p) => p.id === session.planId) ?? null : matchPlan(amount, appPlans);

      const type = session?.type ?? (plan ? plan.name : "Paiement direct — guichet");
      const delivery = Boolean(plan?.delivery || session?.delivery);
      const email = session?.email ?? "client.direct@zakapro.ht";

      const tx: Transaction = {
        id: txId(parsed.source),
        appId: app.id,
        type,
        email,
        amount,
        source: parsed.source,
        at: Date.now(),
        status: "Réussi",
        ref: parsed.ref ?? "—",
        sender: parsed.sender,
        delivery,
      };

      apply((prev) => ({
        ...prev,
        transactions: [tx, ...prev.transactions].slice(0, 200),
        smsLog: [{ id: uid(), at: Date.now(), raw, ok: true, source: parsed.source, amount, ref: parsed.ref, sender: parsed.sender, webhook: "envoyé" as const }, ...prev.smsLog].slice(0, 40),
      }));
      log("engine", `transaction ${tx.id} attribuée à « ${app.name} » → solde +${fmtNum(amount)} HTG`, "ok");

      /* Moteur d'abonnements : BASIC → PREMIUM */
      if (plan) {
        const existing = d.subscribers.find((u) => u.email === email);
        const upgrading = !existing || existing.status !== "PREMIUM" || existing.planId !== plan.id;
        if (upgrading) {
          const from = existing?.status ?? "BASIC";
          apply((prev) => {
            const subscribers = existing
              ? prev.subscribers.map((u) => (u.id === existing.id ? { ...u, status: "PREMIUM" as const, planId: plan.id } : u))
              : [
                  {
                    id: "usr_" + uid(),
                    email,
                    name: email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                    status: "PREMIUM" as const,
                    since: Date.now(),
                    autoRenew: true,
                    planId: plan.id,
                  },
                  ...prev.subscribers,
                ];
            return {
              ...prev,
              subscribers,
              activations: [
                {
                  id: "act_" + uid(),
                  at: Date.now(),
                  email,
                  name: existing?.name ?? email.split("@")[0],
                  from,
                  to: "PREMIUM" as const,
                  planName: plan.name,
                  appName: app.name,
                  amount,
                  ref: parsed.ref ?? "—",
                },
                ...prev.activations,
              ].slice(0, 60),
            };
          });
          log("plans", `${fmtNum(amount)} HTG = plan « ${plan.name} » (${app.name}) → ${email} ${from} → PREMIUM`, "gold");
          pushToast({ kind: "webhook", title: `PREMIUM activé — ${email}`, sub: `Plan « ${plan.name} » · application ${app.name}` });
        } else {
          log("plans", `plan « ${plan.name} » confirmé — renouvellement du compte ${email} (déjà PREMIUM)`, "info");
        }
      } else {
        log("plans", `${fmtNum(amount)} HTG ne correspond à aucun plan de « ${app.name} » (tolérance ±2 %)`, "info");
      }

      /* Livraison : alerte urgente + alarme + notification système */
      if (delivery) {
        const baseAmount = session?.baseAmount ?? amount;
        const feeAmount = session?.feeAmount ?? Math.max(0, amount - baseAmount);
        const alert: DeliveryAlert = {
          id: "del_" + uid(),
          at: Date.now(),
          appId: app.id,
          appName: app.name,
          planName: type,
          customerPhone: session?.customerPhone ?? parsed.sender ?? "+509 —",
          address: session?.address ?? "Adresse non capturée — rappeler le client",
          zoneName: session?.zoneName ?? "—",
          baseAmount,
          feeAmount,
          total: amount,
          ref: parsed.ref ?? "—",
          status: "en_attente",
        };
        apply((prev) => ({ ...prev, deliveries: [alert, ...prev.deliveries].slice(0, 60) }));
        log("delivery", `livraison requise (${alert.zoneName} · frais +${fmtNum(feeAmount)} HTG) → alerte urgente créée · ${alert.customerPhone}`, "gold");

        if (s.alarmEnabled) {
          if (s.urgency === "haute") playAlarmUrgent(s.volume);
          else playAlarm(s.volume);
          setRingKey((k) => k + 1);
          log("alarm", `sirène urgence « ${s.urgency} » déclenchée sur le téléphone du marchand (volume ${s.volume} %)`, "gold");
        }
        void pushDeliveryNotification(`Livraison urgente — ${fmtNum(amount)} HTG`, `${app.name} · ${type} · ${alert.customerPhone}`);
        pushToast({
          kind: s.alarmEnabled ? "alarm" : "payment",
          title: `${fmtNum(amount)} HTG · LIVRAISON requise`,
          sub: `${app.name} · ${type} · ${alert.customerPhone}${s.alarmEnabled ? "" : " (alarme coupée)"}`,
        });
      } else {
        if (s.alarmEnabled) playTick(s.volume);
        pushToast({
          kind: "payment",
          title: `${fmtNum(amount)} HTG · ${SOURCE_META[parsed.source].label}`,
          sub: plan ? `${app.name} — compte PREMIUM activé pour ${email}` : `${app.name} — webhook payment.confirmed envoyé`,
        });
      }

      /* Webhook signé vers le marchand */
      if (!s.webhookUrl) {
        log("webhook", "aucune URL de callback configurée → webhook non envoyé (Paramètres)", "warn");
        return;
      }
      log("webhook", `signature HMAC-SHA256 en cours → POST ${s.webhookUrl}`, "info");
      const payload = {
        id: "evt_" + uid(),
        event: plan ? "subscription.activated" : "payment.confirmed",
        createdAt: new Date().toISOString(),
        app: app.id,
        appKey: app.publicKey,
        transactionId: tx.id,
        reference: parsed.ref,
        amount,
        currency: "HTG",
        method: parsed.source,
        sender: parsed.sender,
        customer: { email, phone: session?.customerPhone ?? null, address: session?.address ?? null },
        delivery,
        zone: session?.zoneName ?? null,
        feeAmount: session?.feeAmount ?? 0,
        meta: { plan: plan?.name ?? null, accountStatus: plan ? "PREMIUM" : null },
      };

      void dispatchWebhook(s.webhookUrl, payload, s.secret).then((delivered) => {
        apply((prev) => ({ ...prev, webhookCount: prev.webhookCount + 1 }));
        setWebhookDeliveries((prev) => [delivered, ...prev].slice(0, 30));
        if (delivered.status === "delivered") {
          log("webhook", `→ ${delivered.httpCode} OK (${delivered.latencyMs} ms) · événement ${payload.event} livré au marchand`, "ok");
        } else {
          log("webhook", `→ échec ${delivered.httpCode} · nouvelle tentative programmée`, "warn");
          window.setTimeout(() => {
            void dispatchWebhook(s.webhookUrl, payload, s.secret, 2).then((d2) => {
              setWebhookDeliveries((prev) => [d2, ...prev].slice(0, 30));
              log("webhook", d2.status === "delivered" ? `→ retry ${d2.httpCode} OK (${d2.latencyMs} ms)` : `→ retry échoué (${d2.httpCode})`, d2.status === "delivered" ? "ok" : "warn");
            });
          }, 1600);
        }
      });
    },
    [apply, log, pushToast]
  );

  const commitRef = useRef(commitSms);
  useEffect(() => {
    commitRef.current = commitSms;
  }, [commitSms]);

  const simulateSms = useCallback(() => {
    const d = dbRef.current;
    if (!d.apps.length) {
      pushToast({ kind: "info", title: "Aucune application", sub: "Créez d'abord une application pour recevoir des paiements." });
      return;
    }
    const inc = makeIncomingSms(d.apps, d.plans, d.zones);
    commitRef.current(inc.raw, inc.session);
  }, [pushToast]);

  /* ---------- Multi-applications ---------- */
  const createApp = (name: string, color: string): ZakaApp => {
    const keys = genAppKeys();
    const monogram = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "ZK";
    const app: ZakaApp = { id: "app_" + uid(), name: name.trim(), monogram, color, publicKey: keys.publicKey, secretKey: keys.secretKey, createdAt: Date.now() };
    apply((prev) => ({ ...prev, apps: [app, ...prev.apps] }));
    log("engine", `application « ${app.name} » créée · app_key ${app.publicKey}`, "gold");
    return app;
  };

  const regenerateAppKey = (appId: string, which: "public" | "secret") => {
    const keys = genAppKeys();
    apply((prev) => ({
      ...prev,
      apps: prev.apps.map((a) =>
        a.id === appId
          ? { ...a, publicKey: which === "public" ? keys.publicKey : a.publicKey, secretKey: which === "secret" ? keys.secretKey : a.secretKey }
          : a
      ),
    }));
    playSuccess(dbRef.current.settings.volume);
    notify(
      `Clé ${which === "public" ? "publique" : "secrète"} régénérée`,
      which === "public" ? "Ré-initialisez le SDK avec la nouvelle app_key." : "L'ancienne clé secrète est révoquée immédiatement."
    );
  };

  /* ---------- Plans ---------- */
  const addPlan = (appId: string, data: { name: string; amount: number; recurrence: Recurrence; delivery: boolean }): ZakaPlan => {
    const plan: ZakaPlan = { id: "plan_" + uid(), appId, name: data.name.trim(), amount: data.amount, recurrence: data.recurrence, delivery: data.delivery, createdAt: Date.now() };
    apply((prev) => ({ ...prev, plans: [plan, ...prev.plans] }));
    log("plans", `plan « ${plan.name} » créé (${fmtNum(plan.amount)} HTG · ${plan.recurrence}${plan.delivery ? " · livraison" : ""})`, "gold");
    return plan;
  };

  const deletePlan = (planId: string) => {
    const plan = dbRef.current.plans.find((p) => p.id === planId);
    apply((prev) => ({ ...prev, plans: prev.plans.filter((p) => p.id !== planId) }));
    if (plan) notify("Plan supprimé", `« ${plan.name} » — son lien Hub n'est plus actif.`);
  };

  /* ---------- Zones ---------- */
  const addZone = (appId: string, name: string, feePct: number) => {
    const zone: DeliveryZone = { id: "zone_" + uid(), appId, name: name.trim(), feePct };
    apply((prev) => ({ ...prev, zones: [zone, ...prev.zones] }));
    log("delivery", `zone « ${zone.name} » ajoutée → frais +${zone.feePct} % sur la livraison`, "info");
  };

  const deleteZone = (zoneId: string) => {
    const zone = dbRef.current.zones.find((z) => z.id === zoneId);
    apply((prev) => ({ ...prev, zones: prev.zones.filter((z) => z.id !== zoneId) }));
    if (zone) notify("Zone supprimée", `« ${zone.name} » ne sera plus proposée au checkout.`);
  };

  const setZoneFee = (zoneId: string, feePct: number) =>
    apply((prev) => ({ ...prev, zones: prev.zones.map((z) => (z.id === zoneId ? { ...z, feePct } : z)) }));

  const markDelivered = (alertId: string) => {
    apply((prev) => ({
      ...prev,
      deliveries: prev.deliveries.map((x) => (x.id === alertId ? { ...x, status: "livre" as const, deliveredAt: Date.now() } : x)),
    }));
    playSuccess(dbRef.current.settings.volume);
    log("delivery", "alerte de livraison clôturée → commande marquée comme livrée", "ok");
    pushToast({ kind: "info", title: "Livraison confirmée", sub: "La commande a été marquée comme livrée." });
  };

  /* ---------- Paramètres ---------- */
  const setAlarmEnabled = (v: boolean) => {
    apply((prev) => ({ ...prev, settings: { ...prev.settings, alarmEnabled: v } }));
    if (v) {
      playAlarm(dbRef.current.settings.volume);
      setRingKey((k) => k + 1);
      pushToast({ kind: "alarm", title: "alarm_enabled = true", sub: "La sirène sonnera pour chaque achat avec livraison." });
    } else {
      pushToast({ kind: "info", title: "alarm_enabled = false", sub: "Les paiements resteront silencieux." });
    }
  };

  const setVolume = (v: number) => apply((prev) => ({ ...prev, settings: { ...prev.settings, volume: v } }));

  const setMonitoring = (v: boolean) => {
    apply((prev) => ({ ...prev, settings: { ...prev.settings, monitoring: v } }));
    log("listener", v ? "service d'écoute SMS démarré (arrière-plan)" : "service d'écoute SMS suspendu", v ? "ok" : "warn");
    pushToast(
      v
        ? { kind: "webhook", title: "Surveillance SMS réactivée", sub: "Écoute MonCash & Natcash pour toutes vos applications." }
        : { kind: "info", title: "Surveillance mise en pause", sub: "Aucun SMS ne sera intercepté jusqu'à réactivation." }
    );
  };

  const setUrgency = (v: ZakaSettings["urgency"]) => {
    apply((prev) => ({ ...prev, settings: { ...prev.settings, urgency: v } }));
    notify(`Niveau d'urgence : ${v}`, v === "haute" ? "Sirène 4 cycles accélérée + tonalité finale." : "Sirène standard 3 cycles.");
  };

  const setWebhookUrl = (v: string) => apply((prev) => ({ ...prev, settings: { ...prev.settings, webhookUrl: v } }));

  const regenerateSecret = () => {
    apply((prev) => ({ ...prev, settings: { ...prev.settings, secret: "zk_sec_" + Math.random().toString(36).slice(2, 18) } }));
    playSuccess(dbRef.current.settings.volume);
    notify("Clé secrète régénérée", "Mettez à jour la variable ZAKAPRO_SECRET côté serveur.");
  };

  const testAlarm = () => {
    const s = dbRef.current.settings;
    if (s.urgency === "haute") playAlarmUrgent(s.volume);
    else playAlarm(s.volume);
    setRingKey((k) => k + 1);
    log("alarm", `test manuel de la sirène — urgence « ${s.urgency} », volume ${s.volume} %`, "gold");
    pushToast({ kind: "alarm", title: "Test d'alarme en cours", sub: `Sirène de livraison « ${s.urgency} » · volume ${s.volume} %` });
  };

  const testWebhook = () => {
    const s = dbRef.current.settings;
    if (!s.webhookUrl) {
      pushToast({ kind: "info", title: "Webhook non configuré", sub: "Renseignez l'URL de callback dans Paramètres." });
      return;
    }
    notify("Événement test envoyé", `POST ${s.webhookUrl}`);
    void dispatchWebhook(s.webhookUrl, { event: "ping", createdAt: new Date().toISOString(), app: "test" }, s.secret).then((delivered) => {
      setWebhookDeliveries((prev) => [delivered, ...prev].slice(0, 30));
      pushToast(
        delivered.status === "delivered"
          ? { kind: "webhook", title: "Webhook OK", sub: `Réponse ${delivered.httpCode} en ${delivered.latencyMs} ms` }
          : { kind: "info", title: "Webhook en échec", sub: `Code ${delivered.httpCode} — vérifiez l'URL du callback.` }
      );
    });
  };

  const toggleSubscriberAuto = (id: string) =>
    apply((prev) => ({ ...prev, subscribers: prev.subscribers.map((u) => (u.id === id ? { ...u, autoRenew: !u.autoRenew } : u)) }));

  const markNotifRead = () => setNotifSeen(Date.now());

  /* ---------- Sélecteurs dérivés (100 % dynamiques) ---------- */
  const appBalance = (appId: string) => db.transactions.filter((t) => t.appId === appId).reduce((sum, t) => sum + t.amount, 0);
  const seriesFor = (appId: string) => buildSeries(db.transactions, appId);
  const plansFor = (appId: string) => db.plans.filter((p) => p.appId === appId);
  const zonesFor = (appId: string) => db.zones.filter((z) => z.appId === appId);
  const pendingDeliveries = db.deliveries.filter((x) => x.status === "en_attente");

  const value: ZakaStore = {
    db,
    isLoading,
    loadError,
    retryLoad,
    apps: db.apps,
    plans: db.plans,
    zones: db.zones,
    transactions: db.transactions,
    subscribers: db.subscribers,
    activations: db.activations,
    deliveries: db.deliveries,
    smsLog: db.smsLog,
    engineLog: db.engineLog,
    webhookDeliveries,
    toasts,
    settings: db.settings,
    notifSeen,
    ringKey,
    appBalance,
    seriesFor,
    plansFor,
    zonesFor,
    pendingDeliveries,
    createApp,
    addPlan,
    deletePlan,
    addZone,
    deleteZone,
    setZoneFee,
    markDelivered,
    regenerateAppKey,
    commitSms,
    simulateSms,
    testWebhook,
    pushToast,
    dismissToast,
    notify,
    setAlarmEnabled,
    setVolume,
    setMonitoring,
    setUrgency,
    setWebhookUrl,
    regenerateSecret,
    testAlarm,
    toggleSubscriberAuto,
    markNotifRead,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
