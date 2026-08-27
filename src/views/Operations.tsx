import { useState } from "react";
import { useZaka } from "../lib/store";
import { SOURCE_META, fmtClock, fmtNum, randomEmail, timeAgo, type EngineLogEntry, type SmsLogEntry } from "../lib/data";
import { EmptyState, Reveal, SectionHead, SourceBadge, Toggle, inputCls } from "../components/ui";
import { IconBell, IconCheck, IconMapPin, IconPhone, IconRadio, IconScan, IconShield, IconTruck, IconVolume, IconX, IconZap } from "../components/icons";

function blipPos(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const r = 14 + ((h >> 4) % 30);
  return { left: `${50 + Math.cos(angle) * r}%`, top: `${50 + Math.sin(angle) * r}%` };
}

const TAG_COLOR: Record<EngineLogEntry["tag"], string> = {
  listener: "#2563EB",
  parser: "#8B5CF6",
  engine: "#22C55E",
  webhook: "#EC4899",
  plans: "#EAB308",
  alarm: "#EAB308",
  delivery: "#EC4899",
  auth: "#60A5FA",
};

const TONE_COLOR: Record<EngineLogEntry["tone"], string> = {
  ok: "#22C55E",
  warn: "#EAB308",
  info: "#8B98AB",
  gold: "#FDE047",
};

const SAMPLE_SMS =
  "MonCash: Ou resevwa 1 499,00 HTG soti nan +509 3712 4589. Peman: Abonnement Premium — Pro. REF: MC250214.88231. Balans ou: 18 236,50 HTG. *800#";

/* ================= /sms-listener ================= */

export function SmsListenerView() {
  const zaka = useZaka();
  const { settings, smsLog, engineLog } = zaka;
  const [paste, setPaste] = useState("");
  const [benchAppId, setBenchAppId] = useState(zaka.apps[0]?.id ?? "");

  const okCount = smsLog.filter((e) => e.ok).length;
  const parseRate = smsLog.length > 0 ? Math.round((okCount / smsLog.length) * 100) : null;

  const analyse = () => {
    const text = paste.trim();
    if (!text) return;
    zaka.commitSms(text, { appId: benchAppId || undefined, email: randomEmail(), delivery: false });
    setPaste("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">Écouteur SMS</h1>
          <p className="mt-1 max-w-xl text-[13px] text-fog">
            Le service d'arrière-plan intercepte chaque SMS MonCash & Natcash, l'analyse via regex
            (montant · ID · +509) et exécute votre webhook signé en moins d'une seconde.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-edge bg-panel px-3.5 py-2.5">
          <span className="text-xs font-extrabold text-snow">Surveillance</span>
          <Toggle on={settings.monitoring} onChange={zaka.setMonitoring} />
          <span className={`text-[10px] font-extrabold uppercase tracking-wider ${settings.monitoring ? "text-mint" : "text-fog2"}`}>
            {settings.monitoring ? "Actif" : "Pause"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          {/* Radar */}
          <Reveal>
            <div className="rounded-xl border border-edge bg-panel p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-snow">Radar d'interception</h2>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${settings.monitoring ? "bg-mint/12 text-mint" : "bg-edge text-fog2"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${settings.monitoring ? "bg-mint pulse-dot" : "bg-fog2"}`} />
                  {settings.monitoring ? "En écoute" : "En pause"}
                </span>
              </div>

              <div className="relative mx-auto mt-5 aspect-square w-full max-w-[250px]">
                <div className="absolute inset-0 rounded-full border border-edge2 bg-abyss/60" />
                <div className="absolute inset-[14%] rounded-full border border-edge2/80" />
                <div className="absolute inset-[29%] rounded-full border border-edge2/60" />
                <div className="absolute inset-[43%] rounded-full border border-edge2/40" />
                {settings.monitoring && (
                  <div className="animate-spin-slow absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(234,179,8,0.38), rgba(234,179,8,0.05) 70deg, transparent 95deg)" }} />
                )}
                {smsLog.slice(0, 7).map((e, i) => {
                  const pos = blipPos(e.id);
                  const color = e.ok && e.source ? SOURCE_META[e.source].color : "#5c6980";
                  const fresh = Date.now() - e.at < 20_000;
                  return (
                    <span
                      key={e.id}
                      className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fresh ? "animate-blip pulse-gold" : ""}`}
                      style={{ ...pos, background: color, boxShadow: `0 0 12px ${color}`, opacity: Math.max(0.35, 1 - i * 0.12) }}
                    />
                  );
                })}
                <div className="absolute inset-0 grid place-items-center">
                  <span className={`grid h-14 w-14 place-items-center rounded-full border border-gold/40 bg-ink text-gold shadow-glow ${settings.monitoring ? "" : "opacity-50"}`}>
                    <IconScan width={26} height={26} />
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Interceptés", value: smsLog.length.toLocaleString("fr-FR") },
                  { label: "Taux parsing", value: parseRate === null ? "—" : `${parseRate}%` },
                  { label: "Latence", value: "≈ 0,4 s" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-edge bg-panel2 py-2.5">
                    <p className="tabular font-display text-sm font-bold text-snow">{s.value}</p>
                    <p className="mt-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-fog2">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={zaka.simulateSms}
                  disabled={!settings.monitoring}
                  className="flex-1 cursor-pointer rounded-lg border border-gold/50 bg-gold/10 px-3 py-2.5 text-xs font-extrabold text-gold transition-all hover:bg-gold/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconZap width={13} height={13} className="mr-1.5 inline" strokeWidth={2.4} />
                  Simuler un SMS opérateur
                </button>
                <button
                  type="button"
                  onClick={zaka.testAlarm}
                  className="flex-1 cursor-pointer rounded-lg border border-edge2 bg-panel2 px-3 py-2.5 text-xs font-bold text-fog transition-all hover:border-gold/40 hover:text-gold active:scale-[0.98]"
                >
                  <IconVolume width={13} height={13} className="mr-1.5 inline" />
                  Tester l'alarme {settings.alarmEnabled ? "(active)" : "(coupée)"}
                </button>
              </div>
            </div>
          </Reveal>

          {/* Banc de test */}
          <Reveal delay={60}>
            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
              <h3 className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fog">
                <IconShield width={14} height={14} /> Banc de test — parseSms()
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-fog2">
                Collez un SMS brut : le moteur l'analyse (source, montant, ID, +509) puis exécute tout le pipeline.
              </p>
              {zaka.apps.length > 0 && (
                <select value={benchAppId} onChange={(e) => setBenchAppId(e.target.value)} className={inputCls + " mt-2.5 cursor-pointer"} aria-label="Application cible du test">
                  {zaka.apps.map((a) => (
                    <option key={a.id} value={a.id} className="bg-panel text-snow">
                      Attribuer à : {a.name}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={3}
                placeholder="Ex. MonCash: Ou resevwa 2 500,00 HTG soti nan +509 3712 4589…"
                className={inputCls + " mt-2.5 resize-none font-mono text-[11.5px] leading-relaxed"}
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setPaste(SAMPLE_SMS)} className="cursor-pointer rounded-lg border border-edge2 bg-panel2 px-3 py-2 text-[11px] font-bold text-fog transition-colors hover:border-nat/60 hover:text-nat">
                  Insérer un exemple
                </button>
                <button
                  type="button"
                  onClick={analyse}
                  disabled={!paste.trim()}
                  className="flex-1 cursor-pointer rounded-lg bg-gold px-3 py-2 text-[11px] font-extrabold text-ink transition-all hover:bg-goldsoft active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Analyser & exécuter le pipeline
                </button>
              </div>
            </div>
          </Reveal>

          {/* Permissions */}
          <Reveal delay={100}>
            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
              <h3 className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fog">
                <IconPhone width={14} height={14} /> Permissions Android
              </h3>
              <ul className="mt-3 space-y-2.5">
                {[
                  { label: "Accès aux SMS", status: "Accordé", ok: true, icon: IconRadio },
                  { label: "Service arrière-plan", status: "Actif", ok: true, icon: IconPhone },
                  { label: "Optimisation batterie", status: "Désactivée (recommandé)", ok: true, icon: IconZap },
                  { label: "Notification d'alarme", status: settings.alarmEnabled ? "Activée" : "Coupée", ok: settings.alarmEnabled, icon: IconBell },
                ].map((p) => {
                  const Icon = p.icon;
                  return (
                    <li key={p.label} className="flex items-center gap-3 rounded-lg border border-edge bg-panel2 px-3 py-2.5">
                      <Icon width={16} height={16} className={p.ok ? "text-mint" : "text-fog2"} />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-snow">{p.label}</p>
                        <p className={`text-[10.5px] font-semibold ${p.ok ? "text-mint" : "text-gold"}`}>{p.status}</p>
                      </div>
                      {p.ok ? <IconCheck width={14} height={14} strokeWidth={2.6} className="text-mint" /> : <IconX width={14} height={14} className="text-fog2" />}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>
        </div>

        {/* Journal moteur + flux */}
        <div className="space-y-4 lg:col-span-3">
          <Reveal delay={40}>
            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-sm font-bold text-snow">Journal d'exécution du moteur</h2>
                  <p className="mt-0.5 text-xs text-fog">listener → parser → plans → livraison → webhook → alarme</p>
                </div>
                <span className="rounded-md bg-mint/10 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-mint">
                  {engineLog.length} événement{engineLog.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-edge bg-abyss/80 p-3">
                {engineLog.length === 0 ? (
                  <p className="py-6 text-center font-mono text-[11px] text-fog2">
                    En attente d'événements — simulez un SMS ou laissez l'écouteur capter un paiement réel.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {engineLog.slice(0, 24).map((e) => (
                      <li key={e.id} className="animate-rise flex items-start gap-2 font-mono text-[10.5px] leading-relaxed">
                        <span className="shrink-0 text-fog2">{fmtClock(e.at)}</span>
                        <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wider" style={{ background: TAG_COLOR[e.tag] + "1e", color: TAG_COLOR[e.tag] }}>
                          {e.tag}
                        </span>
                        <span style={{ color: TONE_COLOR[e.tone] }}>{e.msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="flex flex-col rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-sm font-bold text-snow">Flux SMS temps réel</h2>
                  <p className="mt-0.5 text-xs text-fog">Analyse du parseur : source · montant · ID · expéditeur +509</p>
                </div>
                <span className="rounded-md bg-gold/12 px-2 py-1 font-mono text-[10px] font-bold text-gold">parseSms()</span>
              </div>

              {smsLog.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<IconRadio width={22} height={22} />}
                    title="Aucun SMS intercepté pour l'instant"
                    sub={settings.monitoring ? "L'écouteur est en veille — le prochain SMS MonCash ou Natcash apparaîtra ici instantanément." : "Activez la surveillance pour commencer l'interception."}
                  />
                </div>
              ) : (
                <ul className="mt-4 max-h-[480px] flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {smsLog.slice(0, 10).map((e) => (
                    <SmsRow key={e.id} e={e} />
                  ))}
                </ul>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function SmsRow({ e }: { e: SmsLogEntry }) {
  return (
    <li className="animate-rise rounded-lg border border-edge bg-panel2/60 p-3 transition-colors hover:border-edge2">
      <div className="flex flex-wrap items-center gap-2">
        {e.ok && e.source ? <SourceBadge source={e.source} /> : <span className="rounded-md bg-edge px-2 py-0.5 text-[11px] font-bold text-fog2">Hors transaction</span>}
        {e.sender && <span className="font-mono text-[10px] font-semibold text-fog">{e.sender}</span>}
        <span className="font-mono text-[10px] text-fog2">{fmtClock(e.at)}</span>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${e.ok ? "bg-mint/12 text-mint" : "bg-edge text-fog2"}`}>
          {e.ok ? <IconCheck width={10} height={10} strokeWidth={3.2} /> : <IconX width={10} height={10} strokeWidth={3} />}
          Webhook {e.webhook}
        </span>
      </div>
      <p className="mt-2 rounded-md border border-edge bg-abyss/80 p-2.5 font-mono text-[11px] leading-relaxed text-fog">{e.raw}</p>
      {e.ok && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="tabular rounded-md bg-gold/12 px-2 py-0.5 text-[11px] font-extrabold text-gold">{fmtNum(e.amount ?? 0)} HTG</span>
          {e.ref && <span className="rounded-md bg-panel px-2 py-0.5 font-mono text-[10.5px] font-semibold text-fog">ID {e.ref}</span>}
        </div>
      )}
    </li>
  );
}

/* ================= /deliveries ================= */

export function DeliveriesView() {
  const zaka = useZaka();
  const pending = zaka.pendingDeliveries;
  const delivered = zaka.deliveries.filter((d) => d.status === "livre");

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <h1 className="font-display text-[22px] font-bold text-snow sm:text-2xl">Alertes de livraison</h1>
        <p className="mt-1 text-[13px] text-fog">
          Chaque achat nécessitant une livraison physique déclenche la sirène du marchand et crée une alerte urgente
          avec les coordonnées du client.
        </p>
      </div>

      {/* File des livraisons urgentes */}
      <section>
        <SectionHead
          title={`File d'attente urgente (${pending.length})`}
          sub={zaka.settings.alarmEnabled ? `Alarme « ${zaka.settings.urgency} » active à chaque nouvelle alerte` : "Alarme coupée — activez-la dans Paramètres"}
        />
        {pending.length === 0 ? (
          <EmptyState
            icon={<IconTruck width={22} height={22} />}
            title="Aucune livraison en attente"
            sub="Quand un client paiera un plan avec livraison (via le Hub ou un SMS direct), l'alerte urgente s'affichera ici avec son téléphone et son adresse."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((d, i) => (
              <Reveal key={d.id} delay={i * 60}>
                <div className="animate-siren rounded-xl border p-4" style={{ borderColor: "#EC489966", background: "#160d13" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: "#EC489926", color: "#EC4899" }}>
                        <IconTruck width={20} height={20} />
                      </span>
                      <div>
                        <p className="font-display text-[15px] font-bold text-snow">{d.planName}</p>
                        <p className="mt-0.5 text-[11px] font-bold text-fog2">
                          {d.appName} · {timeAgo(d.at)} · réf <span className="font-mono">{d.ref}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-display text-xl font-bold" style={{ color: "#EC4899" }}>{fmtNum(d.total)} HTG</p>
                      <p className="text-[10px] font-semibold text-fog2">perçus (base + frais)</p>
                    </div>
                  </div>

                  <div className="mt-3.5 grid gap-2 sm:grid-cols-3">
                    <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-abyss/60 px-3 py-2.5">
                      <IconPhone width={15} height={15} className="shrink-0 text-gold" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-fog2">Téléphone client</p>
                        <a href={`tel:${d.customerPhone.replace(/\s/g, "")}`} className="block truncate font-mono text-xs font-bold text-snow hover:text-gold">
                          {d.customerPhone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-abyss/60 px-3 py-2.5">
                      <IconMapPin width={15} height={15} className="shrink-0 text-gold" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-fog2">Adresse de livraison</p>
                        <p className="truncate text-xs font-bold text-snow" title={d.address}>{d.address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-abyss/60 px-3 py-2.5">
                      <IconZap width={15} height={15} className="shrink-0 text-gold" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-extrabold uppercase tracking-wider text-fog2">Détail du montant</p>
                        <p className="tabular truncate text-xs font-bold text-snow">
                          {fmtNum(d.baseAmount)} + {fmtNum(d.feeAmount)} ({d.zoneName})
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => zaka.markDelivered(d.id)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.98]"
                    >
                      <IconCheck width={13} height={13} strokeWidth={3} />
                      Marquer comme livrée
                    </button>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* Historique */}
      {delivered.length > 0 && (
        <Reveal>
          <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
            <SectionHead title="Livraisons effectuées" sub={`${delivered.length} commande${delivered.length > 1 ? "s" : ""} clôturée${delivered.length > 1 ? "s" : ""}`} />
            <ul className="divide-y divide-edge/70">
              {delivered.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-mint/30 bg-mint/10 text-mint">
                    <IconCheck width={15} height={15} strokeWidth={2.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-snow">{d.planName}</p>
                    <p className="text-[11px] text-fog">
                      {d.customerPhone} · {d.zoneName} ·{" "}
                      {d.deliveredAt ? `livrée ${timeAgo(d.deliveredAt)}` : ""}
                    </p>
                  </div>
                  <span className="tabular font-display text-sm font-bold text-snow">{fmtNum(d.total)} HTG</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
    </div>
  );
}
