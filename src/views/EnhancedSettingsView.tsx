import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SettingsView as LegacySettingsView } from "./ConfigViews";
import { CopyBtn, inputCls, labelCls } from "../components/ui";
import { IconCheck, IconPhone, IconRefresh, IconShield, IconZap } from "../components/icons";

type Plan = "monthly" | "yearly";

type AdminPayment = {
  moncashPhone: string;
  natcashPhone: string;
  merchantName: string;
};

const PLANS: Record<Plan, { label: string; amount: number; duration: string }> = {
  monthly: { label: "Mensuel", amount: 250, duration: "1 mois" },
  yearly: { label: "Annuel", amount: 2500, duration: "1 an" },
};

function PaymentModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"form" | "payment">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<Plan>("monthly");
  const [adminPayment, setAdminPayment] = useState<AdminPayment>({
    moncashPhone: "50944617600",
    natcashPhone: "50940243434",
    merchantName: "Cleef O. JOSEPH",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/subscribe", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (data.adminPayment) setAdminPayment(data.adminPayment);
      })
      .catch(() => {});
  }, []);

  const continueToPayment = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/subscription-payment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de préparer le paiement.");
      setStep("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de préparer le paiement.");
    } finally {
      setBusy(false);
    }
  };

  const current = PLANS[plan];
  const moncash = `+${adminPayment.moncashPhone.replace(/\D/g, "")}`;
  const natcash = `+${adminPayment.natcashPhone.replace(/\D/g, "")}`;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="subscription-modal-title">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gold/35 bg-[#0E1118] shadow-2xl">
        <div className="flex items-start justify-between border-b border-edge px-5 py-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-gold">ZakaPro Premium</p>
            <h2 id="subscription-modal-title" className="mt-1 font-display text-lg font-bold text-snow">{step === "form" ? "Préparer votre paiement" : "Effectuer le paiement"}</h2>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg px-2 py-1 text-xl text-fog hover:bg-panel hover:text-snow" aria-label="Fermer">×</button>
        </div>

        {step === "form" ? (
          <form onSubmit={continueToPayment} className="space-y-4 p-5">
            <div>
              <label className={labelCls} htmlFor="subscription-full-name">Nom complet</label>
              <input id="subscription-full-name" required minLength={3} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ex. Jean Dupont" autoComplete="name" />
            </div>
            <div>
              <label className={labelCls} htmlFor="subscription-phone">Numéro de téléphone de l'expéditeur</label>
              <input id="subscription-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+509 0000 0000" inputMode="tel" autoComplete="tel" />
              <p className="mt-1 text-[10.5px] text-fog2">Ce numéro sera comparé au numéro qui apparaît dans le SMS de paiement.</p>
            </div>
            <div>
              <p className={labelCls}>Choix du plan</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(PLANS) as Plan[]).map((key) => {
                  const selected = key === plan;
                  const item = PLANS[key];
                  return (
                    <button key={key} type="button" onClick={() => setPlan(key)} className={`cursor-pointer rounded-xl border p-3 text-left transition-all ${selected ? "border-gold bg-gold/10 shadow-glow" : "border-edge bg-panel2 hover:border-edge2"}`}>
                      <p className={`text-xs font-extrabold ${selected ? "text-gold" : "text-snow"}`}>{item.label} · {item.duration}</p>
                      <p className="mt-1 font-display text-lg font-bold text-snow">{item.amount} <span className="text-xs text-fog">HTG</span></p>
                    </button>
                  );
                })}
              </div>
            </div>
            {error && <div className="rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-2.5 text-[11px] font-bold text-pink-300">{error}</div>}
            <button type="submit" disabled={busy} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold py-3.5 text-xs font-extrabold text-ink shadow-glow hover:bg-goldsoft disabled:cursor-wait disabled:opacity-60">
              {busy ? <IconRefresh width={14} height={14} className="animate-spin" /> : <IconZap width={14} height={14} />}
              {busy ? "Préparation…" : "Continuer vers le paiement"}
            </button>
          </form>
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-gold/35 bg-gold/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-fog">Montant requis</p>
                  <p className="mt-1 font-display text-2xl font-extrabold text-gold">{current.amount} HTG</p>
                </div>
                <span className="rounded-lg border border-mint/25 bg-mint/10 px-2.5 py-1.5 text-[10px] font-extrabold text-mint">{current.label}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-fog">Envoyez <strong className="text-snow">au minimum {current.amount} HTG</strong>. Un montant inférieur sera automatiquement refusé et n'activera pas l'abonnement.</p>
            </div>

            <div className="rounded-xl border border-edge bg-panel2 p-3.5">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-fog">Compte destinataire</p>
              <p className="text-sm font-extrabold text-snow">{adminPayment.merchantName}</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-panel px-3 py-2.5">
                  <div><p className="text-[10px] font-bold text-fog">MonCash</p><p className="font-mono text-xs font-extrabold text-snow">{moncash}</p></div>
                  <CopyBtn text={moncash} label="Copier" className="px-2 py-1.5" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-panel px-3 py-2.5">
                  <div><p className="text-[10px] font-bold text-fog">Natcash</p><p className="font-mono text-xs font-extrabold text-snow">{natcash}</p></div>
                  <CopyBtn text={natcash} label="Copier" className="px-2 py-1.5" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-edge bg-panel px-3 py-2.5 text-[11px] leading-relaxed text-fog">
              <span className="font-bold text-snow">Expéditeur :</span> {name} · {phone}
              <br />Après réception du SMS, le système compare automatiquement le nom, le numéro, le plan et le montant avec votre demande.
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-mint/25 bg-mint/10 px-3 py-2.5 text-[11px] font-bold text-mint">
              <IconCheck width={14} height={14} /> Paiement en attente de confirmation SMS.
            </div>
            <button type="button" onClick={onClose} className="w-full cursor-pointer rounded-xl border border-edge2 bg-panel2 py-3 text-xs font-extrabold text-snow hover:border-gold/50 hover:text-gold">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionPaymentFlow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="relative overflow-hidden rounded-xl border border-gold/40 bg-[#151106] p-4 shadow-card sm:p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 text-gold"><IconPhone width={18} height={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-bold text-snow">Paiement de l'abonnement ZakaPro</h2>
            <p className="mt-1 text-xs leading-relaxed text-fog">Choisissez votre plan et renseignez les informations de l'expéditeur avant d'effectuer le paiement.</p>
            <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99] sm:w-auto">
              <IconZap width={14} height={14} /> Activer un plan (Mensuel / Annuel)
            </button>
          </div>
        </div>
      </section>
      {open && <PaymentModal onClose={() => setOpen(false)} />}
    </>
  );
}

export default function EnhancedSettingsView() {
  return (
    <div className="zakapro-settings-enhanced">
      <style>{`.zakapro-settings-enhanced > .space-y-4 > .grid > .space-y-4 > :first-child{display:none!important}`}</style>
      <SubscriptionPaymentFlow />
      <LegacySettingsView />
    </div>
  );
}
