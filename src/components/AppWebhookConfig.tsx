import { useEffect, useState } from "react";
import { useZaka } from "../lib/store";
import { inputCls } from "./ui";
import { IconCheck, IconGlobe, IconRefresh } from "./icons";

export function AppWebhookConfig({ app }: { app: { id: string; publicKey: string; webhookUrl?: string } }) {
  const zaka = useZaka();
  const [url, setUrl] = useState(app.webhookUrl || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setUrl(app.webhookUrl || "");
    setStatus(null);
  }, [app.id, app.webhookUrl]);

  const save = async () => {
    const value = url.trim();
    if (value) {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Le webhook doit utiliser HTTP ou HTTPS.");
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : "URL invalide." });
        return;
      }
    }
    setSaving(true); setStatus(null);
    try {
      await zaka.updateAppWebhook(app.id, value);
      setStatus({ kind: "ok", text: value ? "Webhook de cette application enregistré." : "Webhook supprimé : le webhook global servira de secours." });
      window.setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Impossible d'enregistrer le webhook." });
    } finally { setSaving(false); }
  };

  const fallback = !url.trim();
  return (
    <section className="relative overflow-hidden rounded-xl border p-4 shadow-card sm:p-5" style={{ borderColor: "#EAB30866", background: "#151106" }}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold/35 bg-gold/12 text-gold"><IconGlobe width={18} height={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-snow">Webhook dédié à cette application</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-fog">Cette URL est isolée par application. Elle est prioritaire sur le webhook global configuré dans Paramètres.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://votre-site.ht/api/webhooks/zakapro" className={inputCls + " font-mono text-[11px]"} inputMode="url" aria-label="URL webhook de l'application" />
          <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft disabled:cursor-wait disabled:opacity-60">
            {saving ? <IconRefresh width={14} height={14} className="animate-spin" /> : <IconCheck width={14} height={14} strokeWidth={2.8} />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10.5px]">
          <span className={`rounded-md px-2 py-1 font-bold ${fallback ? "border border-edge bg-panel2 text-fog" : "border border-mint/25 bg-mint/10 text-mint"}`}>
            {fallback ? "Fallback global actif" : "Webhook dédié actif"}
          </span>
          <span className="font-mono text-fog2">app_key: {app.publicKey}</span>
        </div>
        {status && <p className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-bold ${status.kind === "ok" ? "border-mint/25 bg-mint/10 text-mint" : "border-pink-500/30 bg-pink-500/10 text-pink-300"}`}>{status.text}</p>}
      </div>
    </section>
  );
}
