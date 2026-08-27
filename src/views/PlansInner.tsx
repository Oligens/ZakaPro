import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useZaka } from "../lib/store";
import { PATHS, RECURRENCE_LABEL, fmtNum, hubLink, zoneFee, type Recurrence, type ZakaPlan } from "../lib/data";
import { CopyBtn, EmptyState, Reveal, SectionHead, Toggle, inputCls, labelCls } from "../components/ui";
import { IconArrowRight, IconGlobe, IconLoop, IconPlus, IconTrash, IconTruck, IconZap } from "../components/icons";

/**
 * Formulaire + liste des plans d'une application.
 * Utilisé par /app/:id/plans (coquille) et /plans (vue globale).
 */
export function PlansInner({ appId }: { appId: string }) {
  const zaka = useZaka();
  const app = zaka.apps.find((a) => a.id === appId);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1500");
  const [recurrence, setRecurrence] = useState<Recurrence>("mensuel");
  const [delivery, setDelivery] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (!app) return null;

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
              <label className={labelCls} htmlFor={`plan-name-${app.id}`}>Nom du plan</label>
              <input id={`plan-name-${app.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Premium Pro, Kit solè…" className={inputCls} />
              {errors.name && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor={`plan-amount-${app.id}`}>Montant (HTG)</label>
                <input id={`plan-amount-${app.id}`} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + " tabular font-display font-bold"} />
                {errors.amount && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.amount}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor={`plan-rec-${app.id}`}>Récurrence</label>
                <select id={`plan-rec-${app.id}`} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} className={inputCls + " cursor-pointer"}>
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
