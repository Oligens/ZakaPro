import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useZaka } from "../lib/store";
import type { Source, ZakaApp } from "../lib/data";
import { fmtNum } from "../lib/data";
import { CopyBtn, Reveal, SectionHead, inputCls, labelCls } from "../components/ui";
import { IconCheck, IconEye, IconRefresh, IconZap } from "../components/icons";
import { curlSnippet, hubButtonSnippet, listenerSnippet, sdkSnippet, webhookSnippet } from "../lib/generator";
import { AppWebhookConfig } from "../components/AppWebhookConfig";

type SnippetTab = "sdk" | "hub" | "curl" | "webhook" | "listener";

const SNIPPET_TABS: Array<{ key: SnippetTab; label: string }> = [
  { key: "sdk", label: "SDK Web (app_key)" },
  { key: "hub", label: "Bouton Hub" },
  { key: "curl", label: "cURL" },
  { key: "webhook", label: "Webhook (Node)" },
  { key: "listener", label: "Listener Android" },
];

/**
 * Vue d'intégration complète d'une application.
 * Le webhook est strictement isolé par app et la valeur saisie
 * alimente le générateur de snippet en temps réel.
 */
export function AppIntegrationDedicated() {
  const app = useOutletContext<ZakaApp>();
  const zaka = useZaka();
  const [showSecret, setShowSecret] = useState(false);
  const [tab, setTab] = useState<SnippetTab>("sdk");
  const [amount, setAmount] = useState(() => zaka.plansFor(app.id)[0]?.amount ?? 1500);
  const [methods, setMethods] = useState<Source[]>(["moncash", "natcash"]);
  const [hubPlanIdx, setHubPlanIdx] = useState(0);
  const [appWebhookUrl, setAppWebhookUrl] = useState(app.webhookUrl ?? "");

  const appPlans = zaka.plansFor(app.id);
  const hubPlan = appPlans[Math.min(hubPlanIdx, Math.max(0, appPlans.length - 1))];

  useEffect(() => {
    setAppWebhookUrl(app.webhookUrl ?? "");
    setAmount(zaka.plansFor(app.id)[0]?.amount ?? 1500);
    setHubPlanIdx(0);
  }, [app.id, app.webhookUrl, zaka]);

  const toggleMethod = (m: Source) => {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const snippets: Record<SnippetTab, string> = {
    sdk: sdkSnippet(app, { webhook: appWebhookUrl, amount, methods, planName: hubPlan?.name }),
    hub: hubPlan ? hubButtonSnippet(app, hubPlan) : "// Créez d'abord un plan dans l'onglet « Plans & Hub » pour générer un bouton.",
    curl: curlSnippet(app, { webhook: appWebhookUrl, amount, methods, planName: hubPlan?.name }),
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
                <span className="inline-flex items-center gap-1 rounded bg-mint/12 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-mint"><IconCheck width={9} height={9} strokeWidth={3.5} /> Exposable côté client</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-gold">{app.publicKey}</code>
                <CopyBtn text={app.publicKey} label="" className="px-2 py-1" />
                <button type="button" onClick={() => zaka.regenerateAppKey(app.id, "public")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold" aria-label="Régénérer la clé publique"><IconRefresh width={13} height={13} /></button>
              </div>
            </div>

            <div className="rounded-lg border border-edge bg-abyss/70 p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-fog2">Clé secrète (webhooks)</p>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider" style={{ color: "#EC4899", background: "#EC489918" }}>Serveur uniquement</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-nat">{showSecret ? app.secretKey : app.secretKey.slice(0, 10) + "•••••••••••••••"}</code>
                <button type="button" onClick={() => setShowSecret((v) => !v)} className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 transition-colors ${showSecret ? "text-gold" : "text-fog hover:text-snow"}`} aria-label="Afficher la clé secrète"><IconEye width={13} height={13} /></button>
                <CopyBtn text={app.secretKey} label="" className="px-2 py-1" />
                <button type="button" onClick={() => zaka.regenerateAppKey(app.id, "secret")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-edge2 bg-panel2 text-fog transition-colors hover:border-gold/50 hover:text-gold" aria-label="Régénérer la clé secrète"><IconRefresh width={13} height={13} /></button>
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
                      return <button key={m} type="button" onClick={() => toggleMethod(m)} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-extrabold transition-all ${active ? "" : "border-edge bg-panel2 text-fog"}`} style={active ? { borderColor: color + "77", background: color + "1a", color } : undefined}>{active ? <IconCheck width={13} height={13} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-fog2" />}{label}</button>;
                    })}
                  </div>
                </div>
                {appPlans.length > 0 && <div><label className={labelCls} htmlFor="int-plan">Plan du bouton Hub</label><select id="int-plan" value={hubPlanIdx} onChange={(e) => setHubPlanIdx(Number(e.target.value))} className={inputCls + " cursor-pointer"}>{appPlans.map((p, i) => <option key={p.id} value={i} className="bg-panel text-snow">{p.name} — {fmtNum(p.amount)} HTG{p.delivery ? " (+ frais zone)" : ""}</option>)}</select></div>}
                <button type="button" onClick={zaka.testWebhook} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border py-3 text-xs font-extrabold transition-all active:scale-[0.98]" style={{ borderColor: "#2563EB77", background: "#2563EB1a", color: "#60A5FA" }}><IconZap width={14} height={14} strokeWidth={2.4} />Envoyer un événement de test au webhook</button>
              </div>
            </div>

            <AppWebhookConfig app={app} onUrlChange={setAppWebhookUrl} />

            <div className="rounded-xl border border-edge bg-panel p-4 shadow-card">
              <SectionHead title="Dernières livraisons webhook" sub="Signées HMAC-SHA256" />
              {zaka.webhookDeliveries.length === 0 ? <p className="py-4 text-center text-xs text-fog2">Aucun webhook envoyé pour l'instant.</p> : <ul className="space-y-1.5">{zaka.webhookDeliveries.slice(0, 4).map((d) => <li key={d.id} className="flex items-center gap-2 rounded-lg bg-panel2 px-3 py-2 font-mono text-[10.5px]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.status === "delivered" ? "#22C55E" : "#EC4899" }} /><span className="truncate text-fog">{d.event}</span><span className="ml-auto shrink-0 font-bold" style={{ color: d.status === "delivered" ? "#22C55E" : "#EC4899" }}>{d.httpCode}</span><span className="shrink-0 text-fog2">{d.latencyMs} ms</span></li>)}</ul>}
            </div>
          </div>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-3">
          <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-edge bg-panel shadow-card">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-edge px-3 py-2.5">
              {SNIPPET_TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold transition-all ${tab === t.key ? "bg-gold/14 text-gold" : "text-fog hover:bg-panel2 hover:text-snow"}`}>{t.label}</button>)}
              <div className="ml-auto flex shrink-0 items-center gap-2 pl-2"><CopyBtn text={snippets[tab]} label="Copier le code" /></div>
            </div>
            <div className="code-scroll flex-1 overflow-auto bg-abyss/70 p-4"><pre key={tab + app.id + appWebhookUrl} className="animate-rise font-mono text-[11.5px] leading-[1.75] text-[#b8c4d6]">{snippets[tab]}</pre></div>
            <div className="flex items-center justify-between border-t border-edge px-4 py-3"><p className="text-[10.5px] font-semibold text-fog2">Un seul SDK par application, initialisé avec <span className="font-mono text-fog">app_key</span>.</p><span className="rounded-md bg-mint/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-mint">Mis à jour en direct</span></div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
