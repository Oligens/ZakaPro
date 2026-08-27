import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useZaka } from "../lib/store";
import { PATHS, fmtNum, type ZakaApp } from "../lib/data";
import { CopyBtn, EmptyState, Reveal, inputCls, labelCls } from "../components/ui";
import { Spark } from "../components/charts";
import { IconArrowRight, IconKey, IconLoop, IconPlus, IconTruck, IconZap } from "../components/icons";

const COLORS = ["#EAB308", "#2563EB", "#8B5CF6", "#EC4899", "#22C55E"];

export default function AppsView() {
  const zaka = useZaka();
  const auth = useAuth();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);

  const totalBalance = zaka.apps.reduce((a, app) => a + zaka.appBalance(app.id), 0);
  const firstName = auth.user?.name.split(/\s+/)[0] ?? "";

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 6) return "Bòn nwit";
    if (h < 12) return "Bonjou";
    if (h < 18) return "Bon aprèmidi";
    return "Bonswa";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">
            {greeting()}, {firstName}
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-1 text-[13px] text-fog">
            {zaka.apps.length > 0 ? (
              <>
                {zaka.apps.length} application{zaka.apps.length > 1 ? "s" : ""} · solde cumulé{" "}
                <span className="tabular font-bold text-gold">{fmtNum(totalBalance)} HTG</span> — données isolées par
                application et par compte (<span className="font-mono text-[11px]">user_id</span>).
              </>
            ) : (
              "Votre espace est prêt — créez votre première application pour obtenir vos clés API."
            )}
          </p>
        </div>
        {zaka.apps.length > 0 && (
          <button
            type="button"
            onClick={() => setModal(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gold px-4 py-3 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.98]"
          >
            <IconPlus width={15} height={15} strokeWidth={2.6} />
            Nouvelle application
          </button>
        )}
      </div>

      {zaka.apps.length === 0 ? (
        <Reveal>
          <EmptyState
            icon={<IconZap width={24} height={24} />}
            title="Bienvenue sur ZakaPro"
            sub="Aucune application pour le moment. Créez votre première application pour générer une paire de clés API (publique/secrète), configurer vos plans et commencer à encaisser en gourdes via MonCash et Natcash."
            action={
              <button
                type="button"
                onClick={() => setModal(true)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gold px-5 py-3 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.98]"
              >
                <IconPlus width={15} height={15} strokeWidth={2.6} />
                + Créer une Application
              </button>
            }
          />
        </Reveal>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {zaka.apps.map((app, i) => (
            <AppCard key={app.id} app={app} delay={i * 70} onOpen={() => navigate(PATHS.app(app.id))} />
          ))}

          <Reveal delay={zaka.apps.length * 70}>
            <button
              type="button"
              onClick={() => setModal(true)}
              className="grid h-full min-h-[230px] w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed border-edge2 bg-panel/30 text-fog2 transition-all duration-200 hover:border-gold/50 hover:text-gold"
              style={{ transitionProperty: "border-color, color, background" }}
            >
              <span className="flex flex-col items-center gap-2.5">
                <span className="grid h-11 w-11 place-items-center rounded-full border border-current">
                  <IconPlus width={20} height={20} />
                </span>
                <span className="text-sm font-bold">Ajouter une application</span>
                <span className="text-[11px] font-semibold">Applications illimitées · isolation totale</span>
              </span>
            </button>
          </Reveal>
        </div>
      )}

      {modal && <CreateAppModal onClose={() => setModal(false)} />}
    </div>
  );
}

function AppCard({ app, delay, onOpen }: { app: ZakaApp; delay: number; onOpen: () => void }) {
  const navigate = useNavigate();
  const zaka = useZaka();
  const balance = zaka.appBalance(app.id);
  const txs = zaka.transactions.filter((t) => t.appId === app.id);
  const appPlans = zaka.plansFor(app.id);
  const pending = zaka.pendingDeliveries.filter((d) => d.appId === app.id).length;
  const spark = zaka.seriesFor(app.id).map((p) => p.moncash + p.natcash + p.autre);

  return (
    <Reveal delay={delay}>
      <div
        className="group relative overflow-hidden rounded-xl border border-edge bg-panel p-4 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-edge2"
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 18px 44px -18px ${app.color}44`)}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "")}
      >
        <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full opacity-[0.09] blur-2xl" style={{ background: app.color }} />

        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-ink shadow-card" style={{ background: app.color }}>
            {app.monogram}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold text-snow">{app.name}</p>
            <p className="mt-0.5 text-[10.5px] font-semibold text-fog2">
              créée le {new Date(app.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-mint/12 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint pulse-dot" /> Live
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-edge bg-abyss/70 px-2.5 py-2">
          <IconKey width={13} height={13} className="shrink-0 text-gold" />
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fog">{app.publicKey}</code>
          <CopyBtn text={app.publicKey} label="" className="px-2 py-1" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-edge bg-panel2 p-2.5">
            <p className="tabular font-display text-[15px] font-bold leading-none text-snow">{fmtNum(balance, 0)}</p>
            <p className="mt-1 text-[9px] font-extrabold uppercase tracking-wider text-fog2">Solde HTG</p>
          </div>
          <div className="rounded-lg border border-edge bg-panel2 p-2.5">
            <p className="tabular font-display text-[15px] font-bold leading-none text-snow">{fmtNum(txs.length)}</p>
            <p className="mt-1 text-[9px] font-extrabold uppercase tracking-wider text-fog2">Transactions</p>
          </div>
          <div className="rounded-lg border border-edge bg-panel2 p-2.5">
            <p className="flex items-center gap-1 font-display text-[15px] font-bold leading-none text-snow">
              {appPlans.length}
              {pending > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[8.5px] font-extrabold text-snow" style={{ background: "#EC4899" }}>
                  {pending}
                </span>
              )}
            </p>
            <p className="mt-1 text-[9px] font-extrabold uppercase tracking-wider text-fog2">Plans{pending > 0 ? " · livr." : ""}</p>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between">
          <Spark values={spark} color={app.color} width={150} height={30} />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => navigate(PATHS.appPlans(app.id))}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-nat/60 hover:text-nat"
              aria-label="Plans de l'application"
            >
              <IconLoop width={14} height={14} />
            </button>
            <button
              type="button"
              onClick={() => navigate(PATHS.appZones(app.id))}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold"
              aria-label="Zones de livraison"
            >
              <IconTruck width={14} height={14} />
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-[11px] font-extrabold text-gold transition-all hover:bg-gold/20"
            >
              Ouvrir <IconArrowRight width={12} height={12} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function CreateAppModal({ onClose }: { onClose: () => void }) {
  const zaka = useZaka();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    const app = zaka.createApp(name, color);
    zaka.notify("Application créée", `« ${app.name} » — app_key ${app.publicKey.slice(0, 16)}…`);
    onClose();
    navigate(PATHS.app(app.id));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-abyss/75 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="animate-pop relative w-full max-w-md rounded-xl border border-edge2 bg-panel p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-snow">Nouvelle application</h2>
        <p className="mt-1 text-xs text-fog">Chaque application reçoit sa propre paire de clés API et ses données isolées.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelCls} htmlFor="app-name">Nom de l'application</label>
            <input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. LakayDev Boutique" className={inputCls} autoFocus />
            {error && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{error}</p>}
          </div>
          <div>
            <span className={labelCls}>Couleur d'identité</span>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 cursor-pointer rounded-lg transition-all ${color === c ? "scale-110 ring-2 ring-snow/70 ring-offset-2 ring-offset-panel" : "hover:scale-105"}`}
                  style={{ background: c }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 cursor-pointer rounded-xl border border-edge2 bg-panel2 py-3 text-xs font-bold text-fog transition-colors hover:text-snow">
            Annuler
          </button>
          <button type="submit" className="flex-1 cursor-pointer rounded-xl bg-gold py-3 font-display text-xs font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.98]">
            Créer & générer les clés
          </button>
        </div>
      </form>
    </div>
  );
}
