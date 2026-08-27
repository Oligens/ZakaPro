import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useZaka } from "../lib/store";
import { PATHS, RECURRENCE_LABEL, fmtNum, zoneFee, type Source } from "../lib/data";
import { inputCls, labelCls } from "../components/ui";
import { IconArrowLeft, IconCheck, IconPhone, IconTruck, IconZap } from "../components/icons";

type Step = "form" | "instructions" | "processing" | "success";

/**
 * Hub de Paiement ZakaPro — checkout hébergé par plan.
 * Capture email + téléphone (+509) et, si livraison, l'adresse et la
 * zone (frais +X%). Le paiement est confirmé par le SMS Listener.
 */
export default function Hub() {
  const { appId, planId } = useParams<{ appId: string; planId: string }>();
  const navigate = useNavigate();
  const zaka = useZaka();

  const app = zaka.apps.find((a) => a.id === appId);
  const plan = zaka.plans.find((p) => p.id === planId && p.appId === appId);

  const zones = useMemo(() => (app ? zaka.zonesFor(app.id) : []), [zaka, app]);

  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Source>("moncash");
  const [ref] = useState(() => "ZK-" + Math.random().toString(36).slice(2, 8).toUpperCase());

  if (!app || !plan) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="grid place-items-center rounded-xl border border-dashed border-edge2 bg-panel/40 px-6 py-16 text-center">
          <p className="font-display text-base font-bold text-snow">Lien de paiement invalide</p>
          <p className="mt-1 text-[13px] text-fog">Ce plan ou cette application n'existe plus.</p>
          <Link to={PATHS.apps} className="mt-5 rounded-xl bg-gold px-5 py-3 text-sm font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft">
            Retour aux applications
          </Link>
        </div>
      </div>
    );
  }

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const fee = plan.delivery && zone ? zoneFee(plan.amount, zone.feePct) : 0;
  const total = plan.amount + fee;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Adresse email invalide.";
    if (phone.replace(/\D/g, "").length < 8) errs.phone = "Numéro de téléphone requis (8 chiffres min).";
    if (plan.delivery) {
      if (address.trim().length < 6) errs.address = "Adresse de livraison trop courte.";
      if (zones.length > 0 && !zone) errs.zone = "Choisissez votre zone pour calculer les frais.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const pay = (m: Source) => {
    setMethod(m);
    setStep("processing");
    const phoneNum = phone.replace(/\D/g, "").replace(/^(\d{4})(\d{4})$/, "$1 $2");
    const raw =
      m === "moncash"
        ? `MonCash: Ou resevwa ${fmtNum(total, 2)} HTG soti nan +509 ${phoneNum}. Peman: ${plan.name}. REF: ${ref}. Balans ou: 15 420,00 HTG. *800#`
        : `NatCash - peman konfime. ${fmtNum(total, 2)} HTG resevwa de +509 ${phoneNum} pou "${plan.name}". Referans: ${ref}. Mèsi!`;

    window.setTimeout(() => {
      zaka.commitSms(raw, {
        email,
        appId: app.id,
        planId: plan.id,
        delivery: plan.delivery,
        type: plan.name,
        customerPhone: `+509 ${phoneNum}`,
        address: plan.delivery ? address.trim() : undefined,
        zoneName: zone?.name,
        baseAmount: plan.amount,
        feeAmount: fee,
        total,
      });
      setStep("success");
    }, 1400);
  };

  const reset = () => {
    setStep("form");
    setEmail("");
    setPhone("");
    setAddress("");
    setZoneId("");
    setErrors({});
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(PATHS.apps)}
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge bg-panel text-fog transition-all hover:border-gold/50 hover:text-gold active:scale-95"
          aria-label="Retour"
        >
          <IconArrowLeft width={17} height={17} />
        </button>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold font-display text-sm font-bold text-ink">Z</span>
          <div>
            <p className="font-display text-sm font-bold leading-tight text-snow">Hub de Paiement ZakaPro</p>
            <p className="text-[10.5px] font-semibold text-fog2">Paiement sécurisé · MonCash & Natcash</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-sm font-bold text-ink" style={{ background: app.color }}>
            {app.monogram}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.14em] text-fog2">{app.name}</p>
            <p className="truncate font-display text-[17px] font-bold text-snow">{plan.name}</p>
          </div>
          <span className="shrink-0 rounded-md bg-edge px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-fog">
            {RECURRENCE_LABEL[plan.recurrence]}
          </span>
        </div>

        <div className="mt-4 space-y-1.5 rounded-lg border border-edge bg-panel2 p-3.5 text-[12.5px]">
          <div className="flex justify-between font-semibold text-fog">
            <span>Prix de base</span>
            <span className="tabular text-snow">{fmtNum(plan.amount)} HTG</span>
          </div>
          {plan.delivery && (
            <div className="flex justify-between font-semibold text-fog">
              <span className="flex items-center gap-1.5">
                <IconTruck width={13} height={13} className="text-gold" />
                Frais de livraison {zone ? `— ${zone.name} (+${zone.feePct}%)` : zones.length === 0 ? "— tarif de base" : "— zone non choisie"}
              </span>
              <span className="tabular text-snow">{zone ? `+${fmtNum(fee)} HTG` : "—"}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-edge pt-2 font-display text-[15px] font-bold text-snow">
            <span>Total à payer</span>
            <span className="tabular text-gold">{fmtNum(total)} HTG</span>
          </div>
        </div>

        {step === "form" && (
          <div className="mt-4 space-y-3.5">
            <div>
              <label className={labelCls} htmlFor="hub-email">Votre email (compte à activer)</label>
              <input id="hub-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@exemple.ht" className={inputCls} />
              {errors.email && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.email}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="hub-phone">Numéro de téléphone</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs font-extrabold text-gold">
                  <IconPhone width={13} height={13} /> +509
                </span>
                <input id="hub-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3712 4589" className={inputCls + " pl-[74px]"} />
              </div>
              {errors.phone && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.phone}</p>}
            </div>

            {plan.delivery && (
              <>
                <div>
                  <label className={labelCls} htmlFor="hub-address">Adresse de livraison</label>
                  <textarea id="hub-address" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="N°, rue, quartier, ville…" className={inputCls + " resize-none"} />
                  {errors.address && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.address}</p>}
                </div>
                <div>
                  <label className={labelCls} htmlFor="hub-zone">Zone de livraison (frais variables)</label>
                  {zones.length === 0 ? (
                    <p className="rounded-lg border border-edge bg-panel2 px-3 py-2.5 text-[11.5px] font-semibold text-fog2">
                      Le marchand n'a configuré aucune zone — livraison au tarif de base.
                    </p>
                  ) : (
                    <select id="hub-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputCls + " cursor-pointer"}>
                      <option value="" className="bg-panel">Choisir une zone…</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id} className="bg-panel text-snow">
                          {z.name} — +{z.feePct}% ({fmtNum(plan.amount + zoneFee(plan.amount, z.feePct))} HTG)
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.zone && <p className="mt-1 text-[11px] font-bold" style={{ color: "#EC4899" }}>{errors.zone}</p>}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => validate() && setStep("instructions")}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold py-4 font-display text-[13px] font-bold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99]"
            >
              Continuer vers le paiement <IconZap width={15} height={15} strokeWidth={2.4} />
            </button>
          </div>
        )}

        {step === "instructions" && (
          <div className="animate-rise mt-4 space-y-3">
            <div className="rounded-lg border border-gold/30 p-4" style={{ background: "#EAB3080f" }}>
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-gold">Instructions de paiement</p>
              <p className="mt-2 text-[13px] leading-relaxed text-snow">
                Envoyez <span className="tabular font-extrabold text-gold">{fmtNum(total)} HTG</span> au numéro marchand{" "}
                <span className="font-mono font-bold">{method === "moncash" ? "+509 3712 0045" : "+509 4845 2210"}</span> avec le mémo{" "}
                <span className="font-mono font-bold text-goldsoft">{ref}</span>.
              </p>
              <p className="mt-2 text-[11px] text-fog">
                Dès réception du SMS de confirmation, votre plan est activé automatiquement
                {plan.delivery && " et le marchand reçoit l'alerte de livraison"}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => pay("moncash")} className="cursor-pointer rounded-xl py-3.5 text-xs font-extrabold text-snow transition-all hover:brightness-110 active:scale-[0.98]" style={{ background: "#2563EB" }}>
                J'ai payé via MonCash
              </button>
              <button type="button" onClick={() => pay("natcash")} className="cursor-pointer rounded-xl py-3.5 text-xs font-extrabold text-snow transition-all hover:brightness-110 active:scale-[0.98]" style={{ background: "#8B5CF6" }}>
                J'ai payé via Natcash
              </button>
            </div>
            <button type="button" onClick={() => setStep("form")} className="w-full cursor-pointer py-1 text-center text-[11px] font-bold text-fog2 hover:text-snow">
              Modifier mes informations
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="animate-rise mt-5 grid place-items-center py-6 text-center">
            <span className="relative grid h-14 w-14 place-items-center">
              <span className="absolute inset-0 animate-ring rounded-full border-2 border-gold/60" />
              <span className="grid h-11 w-11 place-items-center rounded-full border border-gold/40 bg-gold/10">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
              </span>
            </span>
            <p className="mt-4 font-display text-sm font-bold text-snow">Confirmation du SMS {method === "moncash" ? "MonCash" : "Natcash"}…</p>
            <p className="mt-1 text-[11.5px] text-fog">L'écouteur ZakaPro analyse la transaction {ref} et notifie « {app.name} ».</p>
          </div>
        )}

        {step === "success" && (
          <div className="animate-rise mt-5 space-y-3">
            <div className="grid place-items-center py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-mint/50 bg-mint/12 text-mint">
                <IconCheck width={26} height={26} strokeWidth={2.6} />
              </span>
              <p className="mt-3 font-display text-lg font-bold text-snow">Paiement confirmé</p>
              <p className="tabular mt-0.5 text-[13px] font-bold text-gold">{fmtNum(total)} HTG · réf {ref}</p>
            </div>

            <div className="rounded-lg border border-mint/30 bg-mint/8 p-3.5 text-center">
              <p className="text-xs font-extrabold uppercase tracking-wider text-mint">Statut PREMIUM activé</p>
              <p className="mt-1 text-[12px] font-semibold text-snow">
                Le compte <span className="font-mono">{email}</span> est passé de <span className="text-fog">BASIC</span> à{" "}
                <span className="font-extrabold text-mint">PREMIUM</span> (« {plan.name} »).
              </p>
            </div>

            {plan.delivery && (
              <div className="animate-siren rounded-lg border p-3.5" style={{ borderColor: "#EC489966", background: "#EC489912" }}>
                <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider" style={{ color: "#EC4899" }}>
                  <IconTruck width={13} height={13} /> Alerte de livraison transmise au marchand
                </p>
                <div className="mt-2 space-y-1 text-[12px] font-semibold text-snow">
                  <p className="flex justify-between gap-3"><span className="text-fog">Téléphone</span> <span className="font-mono">+509 {phone}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-fog">Adresse</span> <span className="truncate text-right">{address}</span></p>
                  {zone && <p className="flex justify-between gap-3"><span className="text-fog">Zone</span> <span>{zone.name} (+{zone.feePct}%)</span></p>}
                </div>
              </div>
            )}

            <button type="button" onClick={reset} className="w-full cursor-pointer rounded-xl border border-edge2 bg-panel2 py-3 text-xs font-extrabold text-snow transition-all hover:border-gold/50 hover:text-gold active:scale-[0.98]">
              Effectuer un autre paiement
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[10.5px] font-semibold text-fog2">
        Propulsé par ZakaPro · application « {app.name} » · {RECURRENCE_LABEL[plan.recurrence]}
      </p>
    </div>
  );
}
