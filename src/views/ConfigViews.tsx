import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useZaka } from "../lib/store";
import { PATHS } from "../lib/data";
import { playSuccess } from "../lib/engine";
import { CopyBtn, Reveal, SectionHead, Toggle, inputCls, labelCls } from "../components/ui";
import { PlansInner } from "./PlansInner";
import { IconBell, IconEye, IconGrid, IconKey, IconPhone, IconRadio, IconRefresh, IconShield, IconVolume, IconZap } from "../components/icons";

function Section({ icon: Icon, title, sub, children }: { icon: typeof IconBell; title: string; sub: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
            <Icon width={18} height={18} />
          </span>
          <div>
            <h2 className="font-display text-sm font-bold text-snow">{title}</h2>
            <p className="mt-0.5 text-xs text-fog">{sub}</p>
          </div>
        </div>
        {children}
      </section>
    </Reveal>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-edge/70 py-3.5 first:border-0 first:pt-0">
      <div>
        <p className="text-[13px] font-bold text-snow">{label}</p>
        <p className="mt-0.5 text-[11px] text-fog">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function WalletIdentity() {
  const [wallets, setWallets] = useState({ moncashName: "", moncashPhone: "", natcashName: "", natcashPhone: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/subscription", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setWallets(data.wallets ?? wallets))
      .catch(() => setStatus("Profil indisponible pour le moment."));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallets }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Enregistrement impossible.");
      setStatus("Profil portefeuille enregistré.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={IconPhone} title="Profil d'activation" sub="Ces informations sont comparées strictement aux SMS MonCash et Natcash.">
      <form onSubmit={save} className="space-y-3">
        {(["moncashName", "moncashPhone", "natcashName", "natcashPhone"] as const).map((field) => (
          <div key={field}>
            <label className={labelCls} htmlFor={field}>{field.includes("Name") ? `Nom ${field.startsWith("moncash") ? "MonCash" : "Natcash"}` : `Numéro ${field.startsWith("moncash") ? "MonCash" : "Natcash"}`}</label>
            <input id={field} value={wallets[field]} onChange={(event) => setWallets((current) => ({ ...current, [field]: event.target.value }))} className={inputCls} placeholder={field.includes("Name") ? "Nom exact du portefeuille" : "+509 0000 0000"} />
          </div>
        ))}
        <p className="text-[11px] leading-relaxed text-fog2">Le nom et le numéro doivent correspondre exactement au portefeuille qui envoie le paiement d'abonnement.</p>
        <button type="submit" disabled={busy} className="w-full cursor-pointer rounded-lg bg-gold py-3 text-xs font-extrabold text-ink disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer le profil"}</button>
        {status && <p className="text-[11px] font-bold text-fog">{status}</p>}
      </form>
    </Section>
  );
}

function PromoCodeForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/promo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Code promo invalide.");
      setMessage(`Abonnement ${data.plan} activé.`);
      setCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={IconZap} title="Code promo" sub="Activez un abonnement mensuel, annuel ou à vie sans SMS.">
      <form onSubmit={redeem} className="flex flex-wrap gap-2">
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ZAKA-XXXX-XXXX" className={inputCls + " min-w-[200px] flex-1 font-mono"} aria-label="Code promo" />
        <button type="submit" disabled={busy || !code.trim()} className="cursor-pointer rounded-lg bg-gold px-4 py-3 text-xs font-extrabold text-ink disabled:opacity-50">{busy ? "Activation…" : "Activer"}</button>
      </form>
      {message && <p className="mt-2 text-[11px] font-bold text-fog">{message}</p>}
    </Section>
  );
}

function SubscriptionPaymentInfo() {
  const [adminPayment, setAdminPayment] = useState({
    moncashPhone: "50944617600",
    natcashPhone: "50940243434",
    merchantName: "Cleef O. JOSEPH",
  });

  useEffect(() => {
    void fetch("/api/subscribe", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (data.adminPayment) setAdminPayment(data.adminPayment);
      })
      .catch(() => {});
  }, []);

  const moncash = `+${adminPayment.moncashPhone.replace(/\D/g, "")}`;
  const natcash = `+${adminPayment.natcashPhone.replace(/\D/g, "")}`;

  return (
    <Section icon={IconPhone} title="Paiement de l'abonnement ZakaPro" sub="Activez votre accès mensuel ou annuel par MonCash ou Natcash.">
      <div className="rounded-lg border border-gold/30 bg-gold/8 p-3.5">
        <p className="text-[12px] font-bold leading-relaxed text-snow">Envoyez exactement <span className="text-gold">250 HTG</span> pour 1 mois ou <span className="text-gold">2500 HTG</span> pour 1 an.</p>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-edge bg-panel2 px-3 py-2">
            <span className="text-xs font-bold text-fog">MonCash · {adminPayment.merchantName}</span>
            <span className="flex items-center gap-2 font-mono text-xs font-extrabold text-snow"><span>{moncash}</span><CopyBtn text={moncash} label="" className="px-1.5 py-1" /></span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-edge bg-panel2 px-3 py-2">
            <span className="text-xs font-bold text-fog">Natcash · {adminPayment.merchantName}</span>
            <span className="flex items-center gap-2 font-mono text-xs font-extrabold text-snow"><span>{natcash}</span><CopyBtn text={natcash} label="" className="px-1.5 py-1" /></span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-fog2">Le système écoutera automatiquement le SMS et validera l'abonnement si le nom et le numéro correspondent. Vous pouvez aussi entrer un code promo ci-dessous.</p>
      </div>
    </Section>
  );
}

/* ================= /settings ================= */

export function SettingsView() {
  const zaka = useZaka();
  const auth = useAuth();
  const navigate = useNavigate();
  const { settings } = zaka;

  const [webhookDraft, setWebhookDraft] = useState(settings.webhookUrl);
  const [showSecret, setShowSecret] = useState(false);

  const saveWebhook = () => {
    zaka.setWebhookUrl(webhookDraft.trim() || settings.webhookUrl);
    playSuccess(settings.volume);
    zaka.notify("Webhook mis à jour", webhookDraft.trim());
  };

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">Paramètres</h1>
        <p className="mt-1 text-[13px] text-fog">
          Réglages globaux du compte <span className="font-bold text-snow">{auth.user?.email}</span> — les clés API vivent
          dans chaque application.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SubscriptionPaymentInfo />
          <WalletIdentity />
          <PromoCodeForm />
          <Section icon={IconRadio} title="Écouteur SMS" sub="Service d'arrière-plan — commun à toutes vos applications">
            <Row label="Surveillance automatique" desc="Intercepte et analyse les SMS MonCash & Natcash en temps réel.">
              <Toggle on={settings.monitoring} onChange={zaka.setMonitoring} />
            </Row>
            <Row label="Ignorer les SMS promotionnels" desc="Seuls les SMS transactionnels déclenchent un webhook.">
              <Toggle on onChange={() => zaka.notify("Option verrouillée", "Toujours active pour économiser la batterie.")} />
            </Row>
            <Row label="Attribution par application" desc="Chaque paiement est rattaché à l'app via app_key, plan ou montant.">
              <Toggle on onChange={() => zaka.notify("Option verrouillée", "L'attribution multi-apps est toujours active.")} />
            </Row>
          </Section>

          <Section icon={IconBell} title="Alarme sonore de livraison" sub="alarm_enabled — sirène déclenchée si la transaction exige une livraison physique">
            <Row label="Alarme en temps réel (alarm_enabled)" desc="Sirène à chaque achat confirmé nécessitant une livraison.">
              <Toggle on={settings.alarmEnabled} onChange={zaka.setAlarmEnabled} />
            </Row>

            <div className="border-t border-edge/70 py-3.5">
              <p className="text-[13px] font-bold text-snow">Niveau d'urgence</p>
              <p className="mt-0.5 text-[11px] text-fog">Puissance de la sirène pour les livraisons immédiates.</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {([
                  { key: "standard", title: "Standard", desc: "Sirène bi-ton · 3 cycles" },
                  { key: "haute", title: "Haute", desc: "4 cycles accélérés + tonalité finale" },
                ] as const).map((u) => {
                  const active = settings.urgency === u.key;
                  return (
                    <button
                      key={u.key}
                      type="button"
                      onClick={() => zaka.setUrgency(u.key)}
                      className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all duration-200 ${active ? "border-gold/60 bg-gold/12" : "border-edge bg-panel2 hover:border-edge2"}`}
                    >
                      <p className={`text-xs font-extrabold ${active ? "text-gold" : "text-snow"}`}>{u.title}</p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-fog">{u.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-edge/70 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold text-snow">Volume de l'alarme</p>
                  <p className="mt-0.5 text-[11px] text-fog">Puissance maximale recommandée en boutique bruyante.</p>
                </div>
                <span className="tabular rounded-md bg-gold/12 px-2 py-1 font-display text-xs font-bold text-gold">{settings.volume}%</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <IconVolume width={16} height={16} className="shrink-0 text-fog2" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.volume}
                  onChange={(e) => zaka.setVolume(Number(e.target.value))}
                  className="w-full"
                  style={{ "--fill": `${settings.volume}%` } as CSSProperties}
                  aria-label="Volume de l'alarme"
                />
                <IconVolume width={20} height={20} className="shrink-0 text-gold" />
              </div>
            </div>

            <button
              type="button"
              onClick={zaka.testAlarm}
              className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-gold/50 bg-gold/10 py-3 text-xs font-extrabold text-gold transition-all hover:bg-gold/20 active:scale-[0.98]"
            >
              <IconZap width={14} height={14} strokeWidth={2.4} />
              Tester l'alarme maintenant
            </button>
          </Section>
        </div>

        <div className="space-y-4">
          <Section icon={IconShield} title="Webhook global & signature" sub="Événements signés HMAC-SHA256 envoyés à votre serveur à chaque paiement">
            <div>
              <label className={labelCls} htmlFor="webhook-url">URL du callback marchand</label>
              <div className="flex gap-2">
                <input id="webhook-url" value={webhookDraft} onChange={(e) => setWebhookDraft(e.target.value)} placeholder="https://votre-site.ht/api/webhooks/zakapro" className={inputCls + " font-mono text-[12px]"} />
                <button type="button" onClick={saveWebhook} className="shrink-0 cursor-pointer rounded-lg bg-gold px-3.5 text-xs font-extrabold text-ink transition-all hover:bg-goldsoft active:scale-95">
                  Sauver
                </button>
              </div>
            </div>
            <div className="mt-4">
              <label className={labelCls} htmlFor="webhook-secret">Clé secrète de signature (ZAKAPRO_SECRET)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    id="webhook-secret"
                    readOnly
                    value={showSecret ? settings.secret : settings.secret.slice(0, 8) + "••••••••••••"}
                    className={inputCls + " pr-10 font-mono text-[12px]"}
                  />
                  <button type="button" onClick={() => setShowSecret((v) => !v)} className={`absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 ${showSecret ? "text-gold" : "text-fog2 hover:text-snow"}`} aria-label="Afficher la clé secrète">
                    <IconEye width={15} height={15} />
                  </button>
                </div>
                <button type="button" onClick={zaka.regenerateSecret} className="grid w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold" aria-label="Régénérer la clé">
                  <IconRefresh width={15} height={15} />
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyBtn text={settings.secret} label="Copier la clé" />
              <button
                type="button"
                onClick={zaka.testWebhook}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-edge2 bg-panel2 px-3 py-1.5 text-xs font-bold text-fog transition-colors hover:border-cash/60 hover:text-cash"
              >
                <IconZap width={13} height={13} />
                Envoyer un événement test
              </button>
            </div>
          </Section>

          <Section icon={IconGrid} title="Applications du compte" sub="Chaque application possède sa propre paire de clés API — requêtes filtrées par user_id">
            {zaka.apps.length === 0 ? (
              <p className="rounded-lg border border-dashed border-edge2 bg-panel2/50 px-3 py-5 text-center text-xs font-semibold text-fog2">
                Aucune application — créez-en une depuis « Mes applications ».
              </p>
            ) : (
              <ul className="space-y-2">
                {zaka.apps.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold text-ink" style={{ background: a.color }}>
                      {a.monogram}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-snow">{a.name}</p>
                      <p className="truncate font-mono text-[10px] text-fog2">{a.publicKey}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(PATHS.appIntegration(a.id))}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-edge2 bg-panel px-2.5 py-1.5 text-[11px] font-bold text-fog transition-colors hover:border-gold/50 hover:text-gold"
                    >
                      <IconKey width={11} height={11} /> Clés API
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={IconShield} title="Compte & session" sub="Authentification JWT — cookie httpOnly, données isolées par user_id">
            <div className="space-y-2.5 text-[12px]">
              <div className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                <span className="font-bold text-fog">Utilisateur</span>
                <span className="truncate pl-3 font-mono text-[11px] text-snow">{auth.user?.email}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                <span className="font-bold text-fog">Base de données</span>
                <span className="pl-3 font-mono text-[10.5px] font-bold text-mint">Neon PostgreSQL · user_id isolé</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                <span className="font-bold text-fog">Statut</span>
                <span className="font-extrabold text-mint">{auth.user?.verified ? "Email vérifié" : "En attente"}</span>
              </div>
            </div>
          </Section>

          <Reveal>
            <div className="rounded-xl border border-edge bg-panel2/60 p-4 text-center">
              <p className="font-display text-xs font-bold text-snow">ZakaPro v3.0 — PWA Android</p>
              <p className="mt-1 text-[11px] text-fog2">Écouteur SMS multi-apps · Chiffrement AES-256 · Serveurs à Port-au-Prince</p>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* ================= /plans (vue globale) ================= */

export function PlansGlobalView() {
  const zaka = useZaka();
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useState(zaka.apps[0]?.id ?? "");
  const appId = selectedAppId || zaka.apps[0]?.id;
  const app = zaka.apps.find((a) => a.id === appId);

  if (zaka.apps.length === 0) {
    return (
      <div className="space-y-4">
        <div className="pt-1">
          <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">Abonnements & plans</h1>
          <p className="mt-1 text-[13px] text-fog">Créez des plans sur-mesure et générez leurs liens vers le Hub de Paiement.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(PATHS.apps)}
          className="w-full cursor-pointer rounded-xl border border-dashed border-edge2 bg-panel/30 px-6 py-14 text-center transition-colors hover:border-gold/50"
        >
          <p className="font-display text-base font-bold text-snow">Créez d'abord une application</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-fog">Les plans sont rattachés à une application et à sa clé API.</p>
          <span className="mt-5 inline-block rounded-xl bg-gold px-5 py-3 text-sm font-extrabold text-ink shadow-glow">+ Nouvelle application</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">Abonnements & plans</h1>
        <p className="mt-1 text-[13px] text-fog">
          Plans sur-mesure par application — chaque plan génère un lien vers le <span className="font-bold text-gold">Hub de Paiement</span>,
          le SMS Listener confirme et active le statut <span className="font-bold text-mint">PREMIUM</span>.
        </p>
      </div>

      <div className="code-scroll -mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1.5">
          {zaka.apps.map((a) => {
            const active = a.id === appId;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAppId(a.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold transition-all ${active ? "text-ink" : "border-edge bg-panel text-fog hover:text-snow"}`}
                style={active ? { background: a.color, borderColor: a.color } : undefined}
              >
                <span className="grid h-5 w-5 place-items-center rounded font-display text-[9px] font-bold" style={{ background: active ? "rgba(0,0,0,0.25)" : a.color, color: active ? "#fff" : "#090D16" }}>
                  {a.monogram}
                </span>
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      {app && (
        <div className="animate-rise" key={app.id}>
          <PlansInner appId={app.id} />
        </div>
      )}
    </div>
  );
}
