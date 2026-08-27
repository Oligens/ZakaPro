import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useOutletContext } from "react-router-dom";
import { useZaka } from "../lib/store";
import {
  PATHS,
  RECURRENCE_LABEL,
  SOURCE_META,
  fmtNum,
  growthPct,
  hubLink,
  timeAgo,
  zoneFee,
  type DayPoint,
  type Recurrence,
  type Source,
  type Transaction,
  type ZakaApp,
  type ZakaPlan,
} from "../lib/data";
import { AreaChart, fmtCompact } from "../components/charts";
import { CopyBtn, EmptyState, Reveal, SectionHead, SourceBadge, StatusPill, Toggle, inputCls, labelCls } from "../components/ui";
import {
  IconArrowRight,
  IconBell,
  IconCheck,
  IconCode,
  IconEye,
  IconGlobe,
  IconKey,
  IconLoop,
  IconMail,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconTrend,
  IconTruck,
  IconUsers,
  IconZap,
} from "../components/icons";
import { curlSnippet, hubButtonSnippet, listenerSnippet, sdkSnippet, webhookSnippet } from "../lib/generator";
import { PlansInner } from "./PlansInner";

/* ---------- Coquille : barre d'onglets interne ---------- */

const TABS = [
  { path: "", label: "Tableau de bord", icon: IconZap },
  { path: "transactions", label: "Transactions", icon: IconSearch },
  { path: "plans", label: "Plans & Hub", icon: IconLoop },
  { path: "delivery", label: "Livraison", icon: IconTruck },
  { path: "integration", label: "Intégration", icon: IconCode },
] as const;

export function AppShell() {
  const { appId } = useParams<{ appId: string }>();
  const { pathname } = useLocation();
  const zaka = useZaka();
  const app = zaka.apps.find((a) => a.id === appId);

  if (!app) return <Navigate to={PATHS.apps} replace />;

  const suffix = pathname.replace(`/app/${app.id}`, "").replace(/^\//, "");

  return (
    <div>
      {/* En-tête application */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-panel p-4 shadow-card">
        <span className="grid h-12 w-12 place-items-center rounded-xl font-display text-base font-bold text-ink" style={{ background: app.color }}>
          {app.monogram}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold leading-tight text-snow">{app.name}</h1>
          <p className="font-mono text-[10.5px] text-fog2">{app.publicKey}</p>
        </div>
        <span className="ml-auto hidden items-center gap-1.5 rounded-md bg-mint/12 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-mint sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-mint pulse-dot" /> Live
        </span>
      </div>

      {/* Onglets internes */}
      <div className="code-scroll -mx-4 mb-5 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1.5">
          {TABS.map((t) => {
            const active = suffix === t.path;
            const Icon = t.icon;
            return (
              <Link
                key={t.path}
                to={t.path ? `/app/${app.id}/${t.path}` : `/app/${app.id}`}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-extrabold transition-all ${
                  active ? "border-gold/60 bg-gold/12 text-gold" : "border-edge bg-panel text-fog hover:border-edge2 hover:text-snow"
                }`}
              >
                <Icon width={14} height={14} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="animate-rise" key={suffix}>
        <Outlet context={app} />
      </div>
    </div>
  );
}

/* ---------- Liste de transactions partagée ---------- */

function TxList({ items, highlightId, emptyTitle }: { items: Transaction[]; highlightId?: string; emptyTitle?: string }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconSearch width={22} height={22} />}
        title={emptyTitle ?? "Aucune transaction détectée pour le moment."}
        sub="Intégrez votre SDK pour commencer à recevoir des paiements — chaque SMS MonCash ou Natcash confirmé apparaîtra ici en temps réel."
      />
    );
  }
  return (
    <ul className="divide-y divide-edge/70">
      {items.map((tx) => {
        const meta = SOURCE_META[tx.source];
        const fresh = tx.id === highlightId;
        return (
          <li key={tx.id} className={`group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-panel2/70 sm:px-2 ${fresh ? "flash-row" : ""}`}>
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold"
              style={{ background: meta.color + "1a", color: meta.color, border: `1px solid ${meta.color}33` }}
            >
              {meta.short}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-bold text-snow">{tx.type}</p>
                <SourceBadge source={tx.source} compact />
                {tx.delivery && <IconTruck width={13} height={13} className="shrink-0 text-gold" />}
              </div>
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fog">
                <IconMail width={11} height={11} className="shrink-0 text-fog2" />
                <span className="truncate">{tx.email}</span>
                <span className="ml-1 hidden font-mono text-[10px] text-fog2 sm:inline">{tx.id}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular font-display text-sm font-bold text-snow">
                {fmtNum(tx.amount)} <span className="text-[10px] font-semibold text-fog">HTG</span>
              </p>
              <div className="mt-1 flex items-center justify-end gap-2">
                <span className="text-[10px] text-fog2">{timeAgo(tx.at)}</span>
                <StatusPill status={tx.status} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Tableau de bord de l'application ---------- */

export function AppDashboard() {
  const app = useOutletContext<ZakaApp>();
  const navigate = useNavigate();
  const zaka = useZaka();

  const txs = zaka.transactions.filter((t) => t.appId === app.id);
  const appPlans = zaka.plansFor(app.id);
  const pending = zaka.pendingDeliveries.filter((d) => d.appId === app.id);
  const planIds = new Set(appPlans.map((p) => p.id));
  const subscribers = zaka.subscribers.filter((u) => u.planId && planIds.has(u.planId));
  const mrr = appPlans.reduce((a, p) => a + p.amount * zaka.subscribers.filter((u) => u.planId === p.id).length, 0);
  const series = zaka.seriesFor(app.id);
  const balance = zaka.appBalance(app.id);
  const growth = growthPct(series);

  const totals = (["moncash", "natcash", "autre"] as Source[]).map((s) => ({
    source: s,
    total: series.reduce((a, p) => a + p[s], 0),
  }));
  const grandTotal = totals.reduce((a, t) => a + t.total, 0) || 1;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Solde + graphique */}
        <Reveal>
          <section className="rounded-xl border border-edge bg-panel p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-fog">Solde collecté</h2>
                  <span className="rounded-md border border-gold/35 bg-gold/10 px-1.5 py-0.5 text-[10px] font-extrabold text-gold">HTG</span>
                </div>
                <p className="tabular mt-2 font-display text-[34px] font-bold leading-none text-snow sm:text-[40px]">
                  {fmtNum(balance)}
                  <span className="ml-2 text-base font-semibold text-fog">HTG</span>
                </p>
              </div>
              {growth !== null && (
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold ${growth >= 0 ? "border-mint/30 bg-mint/10 text-mint" : "border-edge bg-panel2 text-fog"}`}>
                  <IconTrend width={14} height={14} strokeWidth={2.4} />
                  {growth >= 0 ? "+" : ""}
                  {growth.toFixed(1).replace(".", ",")}%
                </span>
              )}
            </div>

            {txs.length === 0 ? (
              <div className="mt-4 grid h-[185px] place-items-center rounded-lg border border-dashed border-edge2">
                <div className="text-center">
                  <p className="text-sm font-bold text-fog">Aucune donnée à afficher</p>
                  <p className="mt-1 text-xs text-fog2">La courbe se dessinera dès le premier paiement reçu.</p>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <AreaChart data={series} height={185} id={`bal-${app.id}`} />
              </div>
            )}

            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              {totals.map(({ source, total }) => {
                const meta = SOURCE_META[source];
                const share = (total / grandTotal) * 100;
                return (
                  <div key={source} className="rounded-lg border border-edge bg-panel2 p-3 transition-colors hover:border-edge2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-bold text-snow">
                        <span className="h-2 w-2 rounded-sm" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="tabular font-extrabold" style={{ color: meta.color }}>
                        {share.toFixed(1).replace(".", ",")}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share}%`, background: meta.color }} />
                    </div>
                    <p className="tabular mt-2 text-[13px] font-bold text-snow">{fmtNum(total, 0)} HTG</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-edge pt-3 text-[11px] text-fog">
              <span className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${zaka.settings.monitoring ? "bg-mint pulse-dot" : "bg-gold"}`} />
                Mis à jour en temps réel via l'écouteur SMS
              </span>
              <span className="font-semibold text-fog2">14 derniers jours</span>
            </div>
          </section>
        </Reveal>

        {/* Transactions récentes */}
        <Reveal>
          <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
            <SectionHead
              title="Transactions récentes"
              sub="Isolées par application — validées via l'écouteur SMS"
              right={
                txs.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate(PATHS.appTx(app.id))}
                    className="group inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-edge bg-panel2 px-3 py-1.5 text-xs font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold"
                  >
                    Tout voir
                    <IconArrowRight width={13} height={13} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : undefined
              }
            />
            {txs.length === 0 ? (
              <EmptyState
                icon={<IconZap width={22} height={22} />}
                title="Aucune transaction détectée pour le moment."
                sub="Intégrez votre SDK pour commencer à recevoir des paiements — chaque SMS confirmé apparaîtra ici en temps réel."
                action={
                  <button
                    type="button"
                    onClick={() => navigate(PATHS.appIntegration(app.id))}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.98]"
                  >
                    Voir le code d'intégration <IconArrowRight width={13} height={13} strokeWidth={2.6} />
                  </button>
                }
              />
            ) : (
              <TxList items={txs.slice(0, 5)} highlightId={txs[0]?.id} />
            )}
          </section>
        </Reveal>
      </div>

      {/* Colonne latérale */}
      <div className="space-y-4">
        <Reveal delay={40}>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Transactions", value: String(txs.length), icon: IconZap, color: "#2563EB" },
              { label: "Abonnés PREMIUM", value: String(subscribers.length), icon: IconUsers, color: "#8B5CF6" },
              { label: "MRR estimé", value: fmtCompact(mrr), suffix: "HTG", icon: IconTrend, color: "#EAB308" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl border border-edge bg-panel p-3 shadow-card">
                  <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: s.color + "1a", color: s.color }}>
                    <Icon width={14} height={14} />
                  </span>
                  <p className="tabular mt-2 truncate font-display text-base font-bold leading-none text-snow">
                    {s.value}
                    {s.suffix && <span className="ml-1 text-[9px] font-semibold text-fog">{s.suffix}</span>}
                  </p>
                  <p className="mt-1 text-[8.5px] font-extrabold uppercase tracking-wider leading-tight text-fog2">{s.label}</p>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Alerte livraison en attente */}
        {pending.length > 0 && (
          <Reveal delay={60}>
            <button
              type="button"
              onClick={() => navigate(PATHS.deliveries)}
              className="animate-siren block w-full cursor-pointer rounded-xl border p-4 text-left transition-all hover:brightness-110"
              style={{ borderColor: "#EC489966", background: "#1b1017" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "#EC489930", color: "#EC4899" }}>
                  <IconTruck width={19} height={19} />
                </span>
                <div>
                  <p className="font-display text-sm font-bold text-snow">
                    {pending.length} livraison{pending.length > 1 ? "s" : ""} urgente{pending.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-fog">
                    Dernière : {pending[0].customerPhone} · {fmtNum(pending[0].total)} HTG perçus
                  </p>
                </div>
              </div>
            </button>
          </Reveal>
        )}

        {/* Plans */}
        <Reveal delay={80}>
          <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
            <SectionHead
              title="Plans & Hub de paiement"
              right={
                <button
                  type="button"
                  onClick={() => navigate(PATHS.appPlans(app.id))}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-edge bg-panel2 px-2.5 py-1.5 text-[11px] font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <IconPlus width={11} height={11} strokeWidth={2.8} /> Gérer
                </button>
              }
            />
            {appPlans.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-xs font-semibold text-fog2">Aucun plan — créez-en un pour générer votre lien Hub.</p>
                <button
                  type="button"
                  onClick={() => navigate(PATHS.appPlans(app.id))}
                  className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft"
                >
                  <IconPlus width={12} height={12} strokeWidth={2.8} /> Créer un plan
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {appPlans.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-snow">{p.name}</p>
                      <p className="text-[10px] text-fog2">
                        {RECURRENCE_LABEL[p.recurrence]}
                        {p.delivery ? " · livraison" : ""}
                      </p>
                    </div>
                    <span className="tabular font-display text-[13px] font-bold text-gold">{fmtNum(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>

        {/* Raccourci SDK */}
        <Reveal delay={100}>
          <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-fog">Démarrage rapide</h3>
            <pre className="mt-2.5 overflow-x-auto rounded-lg border border-edge bg-abyss/80 p-3 font-mono text-[10.5px] leading-relaxed text-fog">
{`ZakaPro.init({
  appKey: "${app.publicKey.slice(0, 18)}…"
})`}
            </pre>
            <button
              type="button"
              onClick={() => navigate(PATHS.appIntegration(app.id))}
              className="mt-3 w-full cursor-pointer rounded-lg border border-gold/50 bg-gold/10 py-2.5 text-xs font-extrabold text-gold transition-all hover:bg-gold/20"
            >
              Générer le snippet complet
            </button>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/* ---------- Transactions ---------- */

export function AppTransactions() {
  const app = useOutletContext<ZakaApp>();
  const zaka = useZaka();
  const [filter, setFilter] = useState<"tous" | Source>("tous");
  const [query, setQuery] = useState("");

  const all = useMemo(() => zaka.transactions.filter((t) => t.appId === app.id), [zaka.transactions, app.id]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (filter !== "tous" && t.source !== filter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.ref.toLowerCase().includes(q) ||
        (t.sender ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    });
  }, [all, filter, query]);

  const total = filtered.reduce((a, t) => a + t.amount, 0);
  const filters: Array<{ key: "tous" | Source; label: string; color?: string }> = [
    { key: "tous", label: "Tous" },
    { key: "natcash", label: "Natcash", color: SOURCE_META.natcash.color },
    { key: "moncash", label: "MonCash", color: SOURCE_META.moncash.color },
    { key: "autre", label: "Autre", color: SOURCE_META.autre.color },
  ];
  const countFor = (f: "tous" | Source) => (f === "tous" ? all.length : all.filter((t) => t.source === f).length);

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: "Collecté (filtre)", value: `${fmtNum(total, 0)} HTG` },
            { label: "Transactions", value: String(filtered.length) },
            { label: "Panier moyen", value: filtered.length ? `${fmtNum(total / filtered.length, 0)} HTG` : "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-edge bg-panel p-3 shadow-card">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-fog2">{s.label}</p>
              <p className="tabular mt-1 truncate font-display text-sm font-bold text-snow sm:text-lg">{s.value}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={60}>
        <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
          <SectionHead title={`Journal — ${app.name}`} sub="Recherche par ID de transaction, client, référence ou numéro +509" />
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all duration-200 ${active ? "text-ink" : "text-fog hover:text-snow"}`}
                    style={{ borderColor: active ? f.color ?? "#EAB308" : "#1E2632", background: active ? f.color ?? "#EAB308" : "transparent" }}
                  >
                    {f.label}
                    <span className={`ml-1.5 ${active ? "opacity-70" : "text-fog2"}`}>{countFor(f.key)}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, client, référence, +509…" className={inputCls + " pl-9"} />
            </div>
          </div>
          <TxList items={filtered} highlightId={all[0]?.id} />
        </section>
      </Reveal>
    </div>
  );
}

/* ---------- Plans & Hub (délègue au composant partagé) ---------- */

export function AppPlans() {
  const app = useOutletContext<ZakaApp>();
  return <PlansInner appId={app.id} />;
}

/* Ancien corps inline remplacé par PlansInner — conservé hors export. */
function _LegacyAppPlans() {
  const app = useOutletContext<ZakaApp>();
  const zaka = useZaka();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1500");
  const [recurrence, setRecurrence] = useState<Recurrence>("mensuel");
  const [delivery, setDelivery] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const appPlans = zaka.plansFor(app.id);
  const appZones = zaka.zonesFor(app.id);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const amt = Number(amount);
    if (name.trim().length < 2) errs.name = "Nom trop court (2 caractères min).";
    if (!Number.isFinite(amt) || amt < 25) errs.amount = "Montant minimum : 25 HTG.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    zaka.addPlan(app.id, { name, amount: amt, recurrence, delivery });
    zaka.notify("Plan créé", `« ${name.trim()} » — lien Hub généré automatiquement.`);
    setName("");
    setAmount("1500");
    setDelivery(false);
  };

  const onDelete = (p: ZakaPlan) => {
    if (confirmId !== p.id) {
      setConfirmId(p.id);
      window.setTimeout(() => setConfirmId((c) => (c === p.id ? null : c)), 2600);
      return;
    }
    zaka.deletePlan(p.id);
    setConfirmId(null);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Reveal className="lg:col-span-2">
        <form onSubmit={submit} className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
          <SectionHead title="Nouveau plan sur-mesure" sub={`Rattaché à « ${app.name} »`} />
          <div className="space-y-3.5">
            <div>
              <label className={labelCls} htmlFor="plan-name">Nom du plan</label>
              <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Premium Pro, Kit solè…" className={inputCls} />
              {errors.name && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="plan-amount">Montant (HTG)</label>
                <input id="plan-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " tabular font-display font-bold"} />
                {errors.amount && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.amount}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="plan-rec">Récurrence</label>
                <select id="plan-rec" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} className={inputCls + " cursor-pointer"}>
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                    <option key={r} value={r} className="bg-panel text-snow">{RECURRENCE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3.5 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-snow">
                  <IconTruck width={14} height={14} className="text-gold" /> Livraison physique requise
                </p>
                <p className="mt-0.5 text-[11px] text-fog">
                  Checkout capture adresse + téléphone ; frais de zone appliqués
                  {appZones.length > 0 ? ` (${appZones.length} zones)` : " (aucune zone)"}.
                </p>
              </div>
              <Toggle on={delivery} onChange={setDelivery} />
            </div>

            {delivery && appZones.length > 0 && (
              <div className="rounded-lg border border-gold/25 p-3" style={{ background: "#EAB3080f" }}>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-gold">Aperçu des frais</p>
                <ul className="mt-1.5 space-y-1">
                  {appZones.slice(0, 3).map((z) => {
                    const base = Number(amount) || 0;
                    return (
                      <li key={z.id} className="flex justify-between text-[11.5px] font-semibold text-fog">
                        <span>{z.name} (+{z.feePct}%)</span>
                        <span className="tabular text-snow">{fmtNum(base + zoneFee(base, z.feePct))} HTG</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <button type="submit" className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold py-3.5 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99]">
              <IconPlus width={15} height={15} strokeWidth={2.6} />
              Créer le plan & générer le lien Hub
            </button>
          </div>
        </form>
      </Reveal>

      <div className="space-y-3 lg:col-span-3">
        {appPlans.length === 0 ? (
          <Reveal>
            <EmptyState
              icon={<IconLoop width={22} height={22} />}
              title={`Aucun plan pour « ${app.name} »`}
              sub="Créez votre premier plan pour obtenir un bouton de paiement hébergé sur le Hub ZakaPro. Le SMS Listener confirmera chaque paiement et activera le statut PREMIUM automatiquement."
            />
          </Reveal>
        ) : (
          appPlans.map((p, i) => {
            const subs = zaka.subscribers.filter((u) => u.planId === p.id).length;
            const link = hubLink(app.id, p.id);
            return (
              <Reveal key={p.id} delay={i * 60}>
                <div className="rounded-xl border border-edge bg-panel p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-edge2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[15px] font-bold text-snow">{p.name}</p>
                    <span className="rounded-md bg-edge px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-fog">{RECURRENCE_LABEL[p.recurrence]}</span>
                    {p.delivery && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-gold/12 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">
                        <IconTruck width={11} height={11} /> Livraison + frais zone
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-mint/12 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-mint">
                      <IconZap width={11} height={11} /> SMS → PREMIUM auto
                    </span>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="ml-auto grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog2 transition-all hover:text-snow"
                      style={confirmId === p.id ? { borderColor: "#EC489999", background: "#EC489922", color: "#EC4899" } : undefined}
                      aria-label={`Supprimer ${p.name}`}
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <p className="tabular font-display text-xl font-bold text-gold">
                      {fmtNum(p.amount)} <span className="text-[11px] font-semibold text-fog">HTG</span>
                    </p>
                    <p className="text-[11px] font-bold text-fog">
                      {subs} abonné{subs > 1 ? "s" : ""} PREMIUM · MRR {fmtNum(subs * p.amount)} HTG
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-abyss/70 px-3 py-2.5">
                    <IconGlobe width={14} height={14} className="shrink-0 text-cash" />
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fog">{link}</code>
                    <CopyBtn text={link} label="Copier le lien" />
                    <Link
                      to={PATHS.hub(app.id, p.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-extrabold text-gold transition-all hover:bg-gold/20"
                    >
                      Ouvrir le Hub <IconArrowRight width={12} height={12} strokeWidth={2.6} />
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------- Zones de livraison ---------- */

export function AppDelivery() {
  const app = useOutletContext<ZakaApp>();
  const navigate = useNavigate();
  const zaka = useZaka();

  const zones = zaka.zonesFor(app.id);
  const firstPlan = zaka.plansFor(app.id)[0];
  const base = firstPlan?.amount ?? 1000;

  const [name, setName] = useState("");
  const [fee, setFee] = useState("15");
  const [errors, setErrors] = useState<{ name?: string; fee?: string }>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const pct = Number(fee);
    if (name.trim().length < 2) errs.name = "Nom de zone trop court.";
    if (zones.some((z) => z.name.toLowerCase() === name.trim().toLowerCase())) errs.name = "Cette zone existe déjà.";
    if (!Number.isFinite(pct) || pct < 0 || pct > 200) errs.fee = "Pourcentage entre 0 et 200.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    zaka.addZone(app.id, name, pct);
    zaka.notify("Zone ajoutée", `« ${name.trim()} » → frais de livraison +${pct}%.`);
    setName("");
    setFee("15");
  };

  const onDelete = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      window.setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 2600);
      return;
    }
    zaka.deleteZone(id);
    setConfirmId(null);
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-xl border p-4 shadow-card" style={{ borderColor: "#EAB3084d", background: "#151106" }}>
          <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-gold/10 blur-2xl" />
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/12 text-gold">
              <IconTruck width={20} height={20} />
            </span>
            <div>
              <h2 className="font-display text-sm font-bold text-snow">Frais de livraison variables par zone</h2>
              <p className="mt-1 text-xs leading-relaxed text-fog">
                Au checkout du Hub, le client choisit sa zone : le total affiché inclut automatiquement{" "}
                <span className="font-bold text-goldsoft">base + X%</span>. L'adresse et le téléphone sont capturés, puis
                transmis à votre alerte de livraison en temps réel.
              </p>
              <p className="tabular mt-2 rounded-lg border border-edge bg-abyss/70 px-3 py-2 font-mono text-[11px] text-fog">
                Exemple « {firstPlan?.name ?? "Panier Lakay"} » : {fmtNum(base)} HTG → Delmas +15 % ={" "}
                <span className="font-bold text-gold">{fmtNum(base + zoneFee(base, 15))} HTG</span>
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <form onSubmit={submit} className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
            <SectionHead title="Ajouter une zone" sub="Ville ou quartier desservi par la livraison" />
            <div className="space-y-3.5">
              <div>
                <label className={labelCls} htmlFor="zone-name">Nom de la zone</label>
                <input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Delmas, Jacmel, Tabarre…" className={inputCls} />
                {errors.name && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.name}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="zone-fee">Frais variables (+X%)</label>
                <div className="relative">
                  <input id="zone-fee" type="number" min={0} max={200} value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls + " tabular pr-9 font-display font-bold"} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gold">%</span>
                </div>
                {errors.fee && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.fee}</p>}
              </div>
              {name.trim() && Number(fee) >= 0 && (
                <div className="rounded-lg border border-edge bg-panel2 px-3 py-2.5 text-[11.5px] font-semibold text-fog">
                  Aperçu : {fmtNum(base)} HTG →{" "}
                  <span className="tabular font-extrabold text-snow">{fmtNum(base + zoneFee(base, Number(fee) || 0))} HTG</span> pour « {name.trim()} »
                </div>
              )}
              <button type="submit" className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold py-3 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99]">
                <IconPlus width={15} height={15} strokeWidth={2.6} /> Ajouter la zone
              </button>
            </div>
          </form>
        </Reveal>

        <div className="space-y-3 lg:col-span-3">
          {zones.length === 0 ? (
            <Reveal>
              <EmptyState
                icon={<IconTruck width={22} height={22} />}
                title="Aucune zone de livraison"
                sub="Sans zone configurée, les plans avec livraison factureront le montant de base sans frais additionnels."
              />
            </Reveal>
          ) : (
            zones.map((z, i) => (
              <Reveal key={z.id} delay={i * 50}>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-panel p-3.5 shadow-card transition-colors hover:border-edge2 sm:flex-nowrap">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 font-display text-[11px] font-bold text-gold">
                    +{z.feePct}%
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-snow">{z.name}</p>
                    <p className="tabular text-[11px] text-fog">
                      {fmtNum(base)} → <span className="font-extrabold text-goldsoft">{fmtNum(base + zoneFee(base, z.feePct))} HTG</span>{" "}
                      (frais +{fmtNum(zoneFee(base, z.feePct))})
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-fog2">
                    Frais
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={z.feePct}
                      onChange={(e) => zaka.setZoneFee(z.id, Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                      className="tabular w-16 rounded-lg border border-edge bg-panel2 px-2 py-1.5 text-center font-display text-xs font-bold text-snow outline-none focus:border-gold/60"
                      aria-label={`Pourcentage de frais pour ${z.name}`}
                    />
                    %
                  </label>
                  <button
                    type="button"
                    onClick={() => onDelete(z.id)}
                    className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog2 transition-all hover:text-snow"
                    style={confirmId === z.id ? { borderColor: "#EC489999", background: "#EC489922", color: "#EC4899" } : undefined}
                    aria-label={`Supprimer ${z.name}`}
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                </div>
              </Reveal>
            ))
          )}

          <Reveal delay={100}>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-panel2/60 p-4">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${zaka.settings.alarmEnabled ? "border-gold/35 bg-gold/12 text-gold" : "border-edge bg-panel text-fog2"}`}>
                <IconBell width={18} height={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-snow">
                  Alarme de livraison {zaka.settings.alarmEnabled ? `active (urgence « ${zaka.settings.urgency} »)` : "désactivée"}
                </p>
                <p className="text-[11px] text-fog">Chaque achat avec livraison déclenche la sirène sur le téléphone du marchand.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(PATHS.settings)}
                className="shrink-0 cursor-pointer rounded-lg border border-edge2 bg-panel px-3 py-2 text-[11px] font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold"
              >
                Configurer l'alarme
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* ---------- Intégration : clés API + snippets ---------- */

type SnippetTab = "sdk" | "hub" | "curl" | "webhook" | "listener";

const SNIPPET_TABS: Array<{ key: SnippetTab; label: string }> = [
  { key: "sdk", label: "SDK Web (app_key)" },
  { key: "hub", label: "Bouton Hub" },
  { key: "curl", label: "cURL" },
  { key: "webhook", label: "Webhook (Node)" },
  { key: "listener", label: "Listener Android" },
];

export function AppIntegration() {
  const app = useOutletContext<ZakaApp>();
  const zaka = useZaka();

  const [showSecret, setShowSecret] = useState(false);
  const [tab, setTab] = useState<SnippetTab>("sdk");
  const [amount, setAmount] = useState(() => zaka.plansFor(app.id)[0]?.amount ?? 1500);
  const [methods, setMethods] = useState<Source[]>(["moncash", "natcash"]);
  const [hubPlanIdx, setHubPlanIdx] = useState(0);

  const appPlans = zaka.plansFor(app.id);
  const hubPlan = appPlans[Math.min(hubPlanIdx, Math.max(0, appPlans.length - 1))];

  const toggleMethod = (m: Source) => setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const snippets: Record<SnippetTab, string> = {
    sdk: sdkSnippet(app, { webhook: zaka.settings.webhookUrl, amount, methods, planName: hubPlan?.name }),
    hub: hubPlan ? hubButtonSnippet(app, hubPlan) : "// Créez d'abord un plan dans l'onglet « Plans & Hub » pour générer un bouton.",
    curl: curlSnippet(app, { webhook: zaka.settings.webhookUrl, amount, methods, planName: hubPlan?.name }),
    webhook: webhookSnippet(app),
    listener: listenerSnippet(app),
  };

  return (
    <div className="space-y-4">
      <Reveal>
        <div className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
          <SectionHead title="Clés API de l'application" sub="La clé publique initialise le SDK — la clé secrète signe les webhooks côté serveur" />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-edge bg-abyss/70 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-fog2">Clé publique (app_key)</p>
                <span className="inline-flex items-center gap-1 rounded bg-mint/12 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-mint">
                  <IconCheck width={9} height={9} strokeWidth={3.5} /> Exposable côté client
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-gold">{app.publicKey}</code>
                <CopyBtn text={app.publicKey} label="" className="px-2 py-1" />
                <button type="button" onClick={() => zaka.regenerateAppKey(app.id, "public")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold" aria-label="Régénérer la clé publique">
                  <IconRefresh width={13} height={13} />
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-edge bg-abyss/70 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-fog2">Clé secrète (webhooks)</p>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider" style={{ color: "#EC4899", background: "#EC489918" }}>
                  Serveur uniquement
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-nat">
                  {showSecret ? app.secretKey : app.secretKey.slice(0, 10) + "•••••••••••••••"}
                </code>
                <button type="button" onClick={() => setShowSecret((v) => !v)} className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 transition-colors ${showSecret ? "text-gold" : "text-fog hover:text-snow"}`} aria-label="Afficher la clé secrète">
                  <IconEye width={13} height={13} />
                </button>
                <CopyBtn text={app.secretKey} label="" className="px-2 py-1" />
                <button type="button" onClick={() => zaka.regenerateAppKey(app.id, "secret")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold" aria-label="Régénérer la clé secrète">
                  <IconRefresh width={13} height={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <div className="space-y-4">
            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
              <SectionHead title="Paramètres du snippet" sub="Le code se régénère en direct" />
              <div className="space-y-3.5">
                <div>
                  <label className={labelCls} htmlFor="int-amount">Montant par défaut (HTG)</label>
                  <input id="int-amount" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputCls + " tabular font-display font-bold"} />
                </div>
                <div>
                  <span className={labelCls}>Méthodes Mobile Money</span>
                  <div className="flex gap-1.5">
                    {([["moncash", "MonCash", "#2563EB"], ["natcash", "Natcash", "#8B5CF6"]] as Array<[Source, string, string]>).map(([m, label, color]) => {
                      const active = methods.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMethod(m)}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-extrabold transition-all ${active ? "" : "border-edge bg-panel2 text-fog"}`}
                          style={active ? { borderColor: color + "77", background: color + "1a", color } : undefined}
                        >
                          {active ? <IconCheck width={13} height={13} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-fog2" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {appPlans.length > 0 && (
                  <div>
                    <label className={labelCls} htmlFor="int-plan">Plan du bouton Hub</label>
                    <select id="int-plan" value={hubPlanIdx} onChange={(e) => setHubPlanIdx(Number(e.target.value))} className={inputCls + " cursor-pointer"}>
                      {appPlans.map((p, i) => (
                        <option key={p.id} value={i} className="bg-panel text-snow">
                          {p.name} — {fmtNum(p.amount)} HTG{p.delivery ? " (+ frais zone)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={zaka.testWebhook}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border py-3 text-xs font-extrabold transition-all active:scale-[0.98]"
                  style={{ borderColor: "#2563EB77", background: "#2563EB1a", color: "#60A5FA" }}
                >
                  <IconZap width={14} height={14} strokeWidth={2.4} />
                  Envoyer un événement de test au webhook
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
              <SectionHead title="Dernières livraisons webhook" sub="Signées HMAC-SHA256" />
              {zaka.webhookDeliveries.length === 0 ? (
                <p className="py-4 text-center text-xs text-fog2">Aucun webhook envoyé pour l'instant.</p>
              ) : (
                <ul className="space-y-1.5">
                  {zaka.webhookDeliveries.slice(0, 4).map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg bg-panel2 px-3 py-2 font-mono text-[10.5px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.status === "delivered" ? "#22C55E" : "#EC4899" }} />
                      <span className="truncate text-fog">{d.event}</span>
                      <span className="ml-auto shrink-0 font-bold" style={{ color: d.status === "delivered" ? "#22C55E" : "#EC4899" }}>
                        {d.httpCode}
                      </span>
                      <span className="shrink-0 text-fog2">{d.latencyMs} ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-3">
          <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-edge bg-panel shadow-card">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-edge px-3 py-2.5">
              {SNIPPET_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold transition-all ${tab === t.key ? "bg-gold/14 text-gold" : "text-fog hover:bg-panel2 hover:text-snow"}`}
                >
                  {t.label}
                </button>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                <CopyBtn text={snippets[tab]} label="Copier le code" />
              </div>
            </div>
            <div className="code-scroll flex-1 overflow-auto bg-abyss/70 p-4">
              <pre key={tab + app.id} className="animate-rise font-mono text-[11.5px] leading-[1.75] text-[#b8c4d6]">
                {snippets[tab]}
              </pre>
            </div>
            <div className="flex items-center justify-between border-t border-edge px-4 py-3">
              <p className="text-[10.5px] font-semibold text-fog2">
                Un seul SDK par application, initialisé avec <span className="font-mono text-fog">app_key</span>.
              </p>
              <span className="rounded-md bg-mint/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-mint">Mis à jour en direct</span>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
