import type { Source } from "./engine";

export type { Source };

/* ============================================================
   ZakaPro — Types, routes & helpers métier (multi-applications)
   Aucune donnée fictive : tout est alimenté dynamiquement par
   les événements réels (Hub, écouteur SMS, webhooks) et isolé
   par user_id côté base de données.
   ============================================================ */

export type Tab = "apps" | "plans" | "listener" | "deliveries" | "settings" | "app";

export const PATHS = {
  apps: "/apps",
  plans: "/plans",
  listener: "/sms-listener",
  deliveries: "/deliveries",
  settings: "/settings",
  login: "/login",
  register: "/register",
  verify: "/verify-email",
  app: (id: string) => `/app/${id}`,
  appTx: (id: string) => `/app/${id}/transactions`,
  appPlans: (id: string) => `/app/${id}/plans`,
  appZones: (id: string) => `/app/${id}/delivery`,
  appIntegration: (id: string) => `/app/${id}/integration`,
  hub: (appId: string, planId: string) => `/hub/${appId}/${planId}`,
};

export function tabForPath(pathname: string): Tab {
  if (pathname.startsWith("/app/")) return "app";
  const map: Record<string, Tab> = {
    "/apps": "apps",
    "/plans": "plans",
    "/sms-listener": "listener",
    "/deliveries": "deliveries",
    "/settings": "settings",
  };
  return map[pathname] ?? "apps";
}

/* ---------- Interfaces ---------- */

export interface ZakaApp {
  id: string;
  name: string;
  monogram: string;
  color: string;
  publicKey: string;         // zk_pub_… (initialise le SDK)
  secretKey: string;         // zk_sec_… (signe les webhooks)
  createdAt: number;
}

export type Recurrence = "mensuel" | "trimestriel" | "annuel" | "unique";

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  annuel: "Annuel",
  unique: "Paiement unique",
};

export interface ZakaPlan {
  id: string;
  appId: string;
  name: string;
  amount: number;            // HTG
  recurrence: Recurrence;
  delivery: boolean;         // true → livraison physique requise
  createdAt: number;
}

export interface DeliveryZone {
  id: string;
  appId: string;
  name: string;
  feePct: number;            // frais variables +X%
}

export interface DeliveryAlert {
  id: string;
  at: number;
  appId: string;
  appName: string;
  planName: string;
  customerPhone: string;
  address: string;
  zoneName: string;
  baseAmount: number;
  feeAmount: number;
  total: number;
  ref: string;
  status: "en_attente" | "livre";
  deliveredAt?: number;
}

export interface DayPoint {
  label: string;
  moncash: number;
  natcash: number;
  autre: number;
}

export interface Transaction {
  id: string;
  appId: string;
  type: string;
  email: string;
  amount: number;
  source: Source;
  at: number;
  status: "Réussi" | "En attente";
  ref: string;
  sender: string | null;
  delivery: boolean;
}

export interface SmsLogEntry {
  id: string;
  at: number;
  raw: string;
  ok: boolean;
  source: Source | null;
  amount: number | null;
  ref: string | null;
  sender: string | null;
  webhook: "envoyé" | "ignoré";
}

export type LogTag = "listener" | "parser" | "engine" | "webhook" | "plans" | "alarm" | "delivery" | "auth";
export type LogTone = "ok" | "warn" | "info" | "gold";

export interface EngineLogEntry {
  id: string;
  at: number;
  tag: LogTag;
  msg: string;
  tone: LogTone;
}

export interface ToastMsg {
  id: string;
  kind: "payment" | "alarm" | "webhook" | "info";
  title: string;
  sub?: string;
}

export interface ZakaSettings {
  alarmEnabled: boolean;     // alarm_enabled
  volume: number;
  monitoring: boolean;
  urgency: "standard" | "haute";
  webhookUrl: string;
  secret: string;
}

/** Session de paiement liée à un SMS (hub, simulation…). */
export interface CommitSession {
  email?: string;
  delivery?: boolean;
  type?: string;
  appId?: string;
  planId?: string;
  customerPhone?: string;
  address?: string;
  zoneName?: string;
  baseAmount?: number;
  feeAmount?: number;
  total?: number;
}

/* ---------- Moteur d'abonnements (clients du marchand) ---------- */

export type UserStatus = "BASIC" | "PREMIUM";

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  since: number;
  autoRenew: boolean;
  planId: string | null;
}

export interface Activation {
  id: string;
  at: number;
  email: string;
  name: string;
  from: UserStatus;
  to: UserStatus;
  planName: string;
  appName: string;
  amount: number;
  ref: string;
}

const TOLERANCE = 0.02;

/** Vérifie le montant reçu par rapport aux plans configurés (±2 %). */
export function matchPlan(amount: number, plans: ZakaPlan[]): ZakaPlan | null {
  for (const plan of plans) {
    if (Math.abs(amount - plan.amount) <= plan.amount * TOLERANCE) return plan;
  }
  return null;
}

/* ---------- Utilitaires ---------- */

export const uid = () => Math.random().toString(36).slice(2, 10);

export const txId = (source: Source) =>
  `tx_${source === "moncash" ? "mc" : source === "natcash" ? "nt" : "ot"}_${uid().slice(0, 6)}`;

export function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const SOURCE_META: Record<Source, { label: string; short: string; color: string }> = {
  moncash: { label: "MonCash", short: "MC", color: "#2563EB" },
  natcash: { label: "Natcash", short: "NT", color: "#8B5CF6" },
  autre: { label: "Autre", short: "OT", color: "#EC4899" },
};

const keyRand = (len: number) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

/** Paire de clés API (publique / secrète) pour une application. */
export function genAppKeys(): { publicKey: string; secretKey: string } {
  return { publicKey: "zk_pub_" + keyRand(20), secretKey: "zk_sec_" + keyRand(24) };
}

/** Lien absolu vers le Hub de Paiement ZakaPro pour un plan. */
export function hubLink(appId: string, planId: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#${PATHS.hub(appId, planId)}`;
}

/** Frais de livraison par zone : total = base × (1 + X%). */
export function zoneFee(base: number, feePct: number): number {
  return Math.round((base * feePct) / 100);
}

/* ---------- Séries dérivées des transactions réelles ---------- */

const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Série quotidienne (14 jours) construite depuis les transactions réelles. */
export function buildSeries(transactions: Transaction[], appId: string, days = 14): DayPoint[] {
  const out: DayPoint[] = [];
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(dayKey(d.getTime()));
    out.push({ label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), moncash: 0, natcash: 0, autre: 0 });
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const t of transactions) {
    if (t.appId !== appId) continue;
    const i = index.get(dayKey(t.at));
    if (i !== undefined) out[i][t.source] += t.amount;
  }
  return out;
}

/** Croissance réelle : 7 derniers jours vs les 7 précédents (null si référence vide). */
export function growthPct(series: DayPoint[]): number | null {
  const total = (p: DayPoint) => p.moncash + p.natcash + p.autre;
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, p) => a + total(p), 0);
  const curr = series.slice(half).reduce((a, p) => a + total(p), 0);
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

/* ---------- Configuration par défaut (aucune donnée fictive) ---------- */

export const DEFAULT_SETTINGS: ZakaSettings = {
  alarmEnabled: true,
  volume: 70,
  monitoring: true,
  urgency: "haute",
  webhookUrl: "",
  secret: "zk_sec_" + Math.random().toString(36).slice(2, 18),
};

/* ---------- Générateur de SMS opérateur (simulation terrain) ---------- */

const TYPES: Record<Source, Array<{ label: string; delivery: boolean }>> = {
  moncash: [
    { label: "Achat — Kit solè kay", delivery: true },
    { label: "Achat — Recharge 150 min", delivery: true },
    { label: "Don — Fon Kominotè", delivery: false },
    { label: "Achat — Sèvis VPN 3 mwa", delivery: false },
  ],
  natcash: [
    { label: "Achat — Pwodui Lakay", delivery: true },
    { label: "Achat — Kat kado 500", delivery: true },
    { label: "Achat — Manje cho (livrezon)", delivery: true },
    { label: "Achat — E-book Kreyòl", delivery: false },
  ],
  autre: [{ label: "Transfert bancaire entrant", delivery: false }],
};

const PHONES = ["3712 4589", "4845 2210", "3155 8734", "4423 9981", "3690 1127", "4973 5540"];
const ADDRESSES = [
  "12, Rue Rigaud, Pétion-Ville",
  "45, Angle Rues Lamarre & Capois, Delmas 33",
  "8, Boulevard du 15 Octobre, Croix-des-Bouquets",
  "23, Rue 3, Cité Soleil, Port-au-Prince",
  "117, Rue Sainte-Philomène, Cap-Haïtien",
  "4, Rue Comité, Jacmel",
];

const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const randomEmail = () =>
  ["w.charles@zafem.ht", "r.etienne@kreyol.io", "f.desir@lakay.ht", "marc.jn@kreyolmail.ht", "sylvie.augustin@natmail.ht", "johnny.b@lakay.ht"][
    Math.floor(Math.random() * 6)
  ];

export interface IncomingSms {
  raw: string;
  session: CommitSession;
}

function buildRaw(source: Source, type: string, amount: number, phone: string, ref: string): string {
  if (source === "moncash") {
    return `MonCash: Ou resevwa ${fmtNum(amount, 2)} HTG soti nan +509 ${phone}. Peman: ${type}. REF: ${ref}. Balans ou: ${fmtNum(
      12000 + Math.random() * 40000,
      2
    )} HTG. *800#`;
  }
  if (source === "natcash") {
    return `NatCash - peman konfime. ${fmtNum(amount, 2)} HTG resevwa de +509 ${phone} pou "${type}". Referans: ${ref}. Mèsi!`;
  }
  return `Unibank: Transfè entènasyonal konfime — ${fmtNum(amount, 2)} HTG resevwa sou kont ou. Referans: ${ref}.`;
}

function makeRef(source: Source): string {
  const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  if (source === "moncash") return `MC${ymd}.${Math.floor(10000 + Math.random() * 89999)}`;
  if (source === "natcash") return `NT-${Math.floor(10000000 + Math.random() * 89999999)}`;
  return `UB-${Math.floor(1000000 + Math.random() * 8999999)}`;
}

/**
 * Construit un SMS opérateur réaliste + sa session de paiement.
 * 45 % des cas : un plan réel d'une application (montant exact,
 * frais de zone inclus si livraison) → déclenche l'auto-activation.
 */
export function makeIncomingSms(apps: ZakaApp[], plans: ZakaPlan[], zones: DeliveryZone[]): IncomingSms {
  const app = apps.length ? rand(apps) : null;
  const appPlans = app ? plans.filter((p) => p.appId === app.id) : [];
  const phone = rand(PHONES);
  const source: Source = Math.random() < 0.45 ? "moncash" : Math.random() < 0.85 ? "natcash" : "autre";

  if (app && appPlans.length && Math.random() < 0.45) {
    const plan = rand(appPlans);
    const appZones = zones.filter((z) => z.appId === app.id);
    const zone = plan.delivery && appZones.length ? rand(appZones) : null;
    const fee = zone ? zoneFee(plan.amount, zone.feePct) : 0;
    const total = plan.amount + fee;
    return {
      raw: buildRaw(source, plan.name, total, phone, makeRef(source)),
      session: {
        email: randomEmail(),
        appId: app.id,
        planId: plan.id,
        delivery: plan.delivery,
        type: plan.name,
        customerPhone: `+509 ${phone}`,
        address: zone ? rand(ADDRESSES) : undefined,
        zoneName: zone?.name,
        baseAmount: plan.amount,
        feeAmount: fee,
        total,
      },
    };
  }

  const typeInfo = rand(TYPES[source]);
  const amount = rand([500, 750, 850, 1200, 1500, 2250, 2500, 3200]);
  const appZones = app ? zones.filter((z) => z.appId === app.id) : [];
  const zone = typeInfo.delivery && appZones.length ? rand(appZones) : null;
  const fee = zone ? zoneFee(amount, zone.feePct) : 0;
  return {
    raw: buildRaw(source, typeInfo.label, amount + fee, phone, makeRef(source)),
    session: {
      email: randomEmail(),
      appId: app?.id,
      delivery: typeInfo.delivery,
      type: typeInfo.label,
      customerPhone: `+509 ${phone}`,
      address: zone ? rand(ADDRESSES) : undefined,
      zoneName: zone?.name,
      baseAmount: amount,
      feeAmount: fee,
      total: amount + fee,
    },
  };
}
