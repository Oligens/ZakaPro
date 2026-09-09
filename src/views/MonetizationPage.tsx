import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowLeft, Check, Clipboard, Coins, DollarSign, RefreshCw, Save, Settings2, Wallet, XCircle, type LucideIcon } from "lucide-react";
import type { ZakaApp } from "../lib/data";

type Rules = { standard: number; intermediate: number; vip: number };
type WalletRow = { appId: string; userId: string; balanceReal: number; balanceTokens: number; tierLevel: string; updatedAt: string };
type Withdrawal = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  method: string;
  destination: string;
  status: "pending" | "processing" | "completed" | "rejected" | "cancelled";
  adminNote?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

const fmt = (value: number, maximumFractionDigits = 2) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);

function apiError(body: any, fallback: string) {
  return typeof body?.error === "string" && body.error.trim() ? body.error : fallback;
}

export default function MonetizationPage() {
  const app = useOutletContext<ZakaApp>();
  const [rules, setRules] = useState<Rules>({ standard: 30, intermediate: 70, vip: 100 });
  const [rate, setRate] = useState("1");
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [totals, setTotals] = useState({ totalReal: 0, totalTokens: 0, transactionCount: 0, volumeHtg: 0, volumeTokens: 0 });
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const base = `/api/apps/${encodeURIComponent(app.id)}`;
  const widgetCode = useMemo(
    () => `<div
  id="zakapro-monetization-widget"
  data-zakapro-app-key="${app.publicKey}"
  data-recipient-user-id="USER_TARGET_ID"
  data-theme="glassmorphism">
</div>
<script src="https://zakapro.vercel.app/sdk/v4/widget.js"></script>`,
    [app.id, app.publicKey]
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [settingsRes, walletsRes, withdrawalsRes] = await Promise.all([
        fetch(`${base}/monetization/settings`, { credentials: "include", cache: "no-store" }),
        fetch(`${base}/wallets`, { credentials: "include", cache: "no-store" }),
        fetch(`${base}/withdrawals`, { credentials: "include", cache: "no-store" }),
      ]);

      const responses = [settingsRes, walletsRes, withdrawalsRes];
      const bodies = await Promise.all(responses.map((res) => res.json().catch(() => ({}))));
      const failed = responses.findIndex((res) => !res.ok);
      if (failed !== -1) {
        throw new Error(apiError(bodies[failed], `Erreur API HTTP ${responses[failed].status}`));
      }

      const settingsBody = bodies[0];
      const walletsBody = bodies[1];
      const withdrawalsBody = bodies[2];

      setRules({
        standard: Number(settingsBody.monetization?.rules?.standard ?? 30),
        intermediate: Number(settingsBody.monetization?.rules?.intermediate ?? 70),
        vip: Number(settingsBody.monetization?.rules?.vip ?? 100),
      });
      setRate(String(settingsBody.monetization?.tokenToHtgRate ?? 1));
      setWallets(Array.isArray(walletsBody.wallets) ? walletsBody.wallets : []);
      setTotals({
        totalReal: Number(walletsBody.totals?.totalReal ?? 0),
        totalTokens: Number(walletsBody.totals?.totalTokens ?? 0),
        transactionCount: Number(walletsBody.totals?.transactionCount ?? 0),
        volumeHtg: Number(walletsBody.totals?.volumeHtg ?? 0),
        volumeTokens: Number(walletsBody.totals?.volumeTokens ?? 0),
      });
      setWithdrawals(Array.isArray(withdrawalsBody.withdrawals) ? withdrawalsBody.withdrawals : []);
      if (!silent) setMessage(null);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Impossible de charger la monétisation." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const saveSettings = async () => {
    const parsedRate = Number(rate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setMessage({ kind: "error", text: "Le taux Jeton → HTG doit être supérieur à 0." });
      return;
    }
    if (Object.values(rules).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setMessage({ kind: "error", text: "Chaque pourcentage doit être compris entre 0 et 100." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${base}/monetization/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenToHtgRate: parsedRate, rules }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(body, `Échec de sauvegarde (HTTP ${res.status}).`));
      setMessage({ kind: "ok", text: "Configuration de monétisation enregistrée dans PostgreSQL." });
      setRules({
        standard: Number(body.monetization?.rules?.standard ?? rules.standard),
        intermediate: Number(body.monetization?.rules?.intermediate ?? rules.intermediate),
        vip: Number(body.monetization?.rules?.vip ?? rules.vip),
      });
      setRate(String(body.monetization?.tokenToHtgRate ?? parsedRate));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Échec de sauvegarde." });
    } finally {
      setSaving(false);
    }
  };

  const updateWithdrawal = async (id: string, status: Withdrawal["status"]) => {
    setWorkingId(id);
    setMessage(null);
    try {
      const res = await fetch(`${base}/withdrawals`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(body, `Échec de la mise à jour (HTTP ${res.status}).`));
      setMessage({
        kind: "ok",
        text: body.refunded ? "Demande rejetée : le montant a été recrédité au portefeuille." : `Demande passée à « ${status} ».`,
      });
      await load(true);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Échec de la mise à jour du retrait." });
    } finally {
      setWorkingId(null);
    }
  };

  const copyWidget = async () => {
    try {
      await navigator.clipboard.writeText(widgetCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage({ kind: "error", text: "Copie impossible dans ce navigateur. Sélectionnez le code manuellement." });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/apps" className="inline-flex items-center gap-2 rounded-lg border border-edge2 bg-panel2 px-3 py-2 text-xs font-extrabold text-fog hover:text-snow">
            <ArrowLeft size={14} /> Applications
          </Link>
          <span className="grid h-11 w-11 place-items-center rounded-xl font-display text-sm font-bold text-ink" style={{ background: app.color }}>
            {app.monogram}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-snow">Monétisation — {app.name}</h1>
            <p className="truncate font-mono text-[10px] text-fog2">{app.publicKey}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-mint/12 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint pulse-dot" /> LIVE
          </span>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-edge2 bg-panel2 px-3 py-2 text-xs font-extrabold text-fog hover:text-gold">
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${message.kind === "ok" ? "border-mint/30 bg-mint/10 text-mint" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
          {message.text}
        </div>
      )}

      <section className="rounded-xl border border-gold/20 bg-panel p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold"><Settings2 size={18} /></div>
          <div>
            <h2 className="font-display text-sm font-bold text-snow">Paliers & taux de change</h2>
            <p className="text-xs text-fog">Ces règles sont stockées par application dans PostgreSQL et appliquées côté serveur.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {([
            ["standard", "Standard", "Part créateur"],
            ["intermediate", "Intermédiaire", "Part créateur"],
            ["vip", "VIP", "Part créateur"],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="rounded-lg border border-edge bg-panel2 p-3 text-[11px] font-bold text-fog">
              <span className="block text-snow">{label}</span>
              <span className="mt-0.5 block text-[10px] text-fog2">{hint}</span>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min="0" max="100" step="1" value={rules[key]} onChange={(e) => setRules((current) => ({ ...current, [key]: Number(e.target.value) }))} className="w-full rounded-lg border border-edge2 bg-abyss px-3 py-2 text-snow outline-none focus:border-gold/60" />
                <span className="font-display text-gold">%</span>
              </div>
            </label>
          ))}
          <label className="rounded-lg border border-edge bg-panel2 p-3 text-[11px] font-bold text-fog">
            <span className="block text-snow">Conversion</span>
            <span className="mt-0.5 block text-[10px] text-fog2">1 Jeton → HTG</span>
            <input type="number" min="0.000001" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-2 w-full rounded-lg border border-edge2 bg-abyss px-3 py-2 text-snow outline-none focus:border-gold/60" />
          </label>
        </div>
        <button type="button" disabled={saving} onClick={() => void saveSettings()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-60">
          <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer la configuration"}
        </button>
      </section>

      <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold"><Wallet size={18} /></div>
          <div>
            <h2 className="font-display text-sm font-bold text-snow">Portefeuilles utilisateurs</h2>
            <p className="text-xs text-fog">Isolation stricte par application + user_id. Actualisation automatique toutes les 10 secondes.</p>
          </div>
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          {([
            ["Fonds réels", `${fmt(totals.totalReal)} HTG`, DollarSign],
            ["Jetons", fmt(totals.totalTokens, 4), Coins],
            ["Volume HTG", `${fmt(totals.volumeHtg)} HTG`, DollarSign],
            ["Transactions", fmt(totals.transactionCount, 0), RefreshCw],
          ] as Array<[string, string, LucideIcon]>).map(([label, value, Icon]) => (
            <div key={String(label)} className="rounded-lg border border-edge bg-panel2 p-3">
              <div className="flex items-center gap-2 text-fog2"><Icon size={13} /><span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span></div>
              <p className="mt-1 font-display text-base font-bold text-gold">{String(value)}</p>
            </div>
          ))}
        </div>
        {loading ? (
          <div className="rounded-lg border border-edge bg-panel2 p-6 text-center text-xs text-fog">Chargement des portefeuilles…</div>
        ) : wallets.length === 0 ? (
          <div className="rounded-lg border border-edge bg-panel2 p-6 text-center text-xs text-fog">Aucun portefeuille n'a encore été créé pour cette application.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-panel2 text-[10px] uppercase tracking-wider text-fog2">
                <tr><th className="px-3 py-2.5">Utilisateur</th><th className="px-3 py-2.5">Solde réel</th><th className="px-3 py-2.5">Jetons</th><th className="px-3 py-2.5">Palier</th><th className="px-3 py-2.5">Mis à jour</th></tr>
              </thead>
              <tbody className="divide-y divide-edge/70">
                {wallets.map((wallet) => (
                  <tr key={`${wallet.appId}:${wallet.userId}`} className="hover:bg-panel2/60">
                    <td className="px-3 py-3 font-mono text-snow">{wallet.userId}</td>
                    <td className="px-3 py-3 font-bold text-gold">{fmt(wallet.balanceReal)} HTG</td>
                    <td className="px-3 py-3 font-bold text-snow">{fmt(wallet.balanceTokens, 4)}</td>
                    <td className="px-3 py-3"><span className="rounded-md bg-gold/10 px-2 py-1 text-[10px] font-extrabold uppercase text-gold">{wallet.tierLevel}</span></td>
                    <td className="px-3 py-3 text-fog2">{new Date(wallet.updatedAt).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
        <div className="mb-4">
          <h2 className="font-display text-sm font-bold text-snow">Demandes de retrait</h2>
          <p className="text-xs text-fog">Les rejets et annulations recréditent automatiquement le portefeuille du créateur.</p>
        </div>
        {withdrawals.length === 0 ? (
          <div className="rounded-lg border border-edge bg-panel2 p-6 text-center text-xs text-fog">Aucune demande de retrait.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-panel2 text-[10px] uppercase tracking-wider text-fog2">
                <tr><th className="px-3 py-2.5">Demande</th><th className="px-3 py-2.5">Créateur</th><th className="px-3 py-2.5">Montant</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Statut</th><th className="px-3 py-2.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-edge/70">
                {withdrawals.map((withdrawal) => {
                  const busy = workingId === withdrawal.id;
                  return (
                    <tr key={withdrawal.id} className="hover:bg-panel2/60">
                      <td className="px-3 py-3 font-mono text-fog">{withdrawal.id.slice(0, 12)}…</td>
                      <td className="px-3 py-3 font-mono text-snow">{withdrawal.userId}</td>
                      <td className="px-3 py-3 font-bold text-gold">{fmt(withdrawal.amount)} {withdrawal.currency}</td>
                      <td className="px-3 py-3 text-fog2">{new Date(withdrawal.createdAt).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-3"><span className="rounded-md bg-edge px-2 py-1 text-[10px] font-extrabold uppercase text-fog">{withdrawal.status}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1.5">
                          {withdrawal.status === "pending" && <button disabled={busy} onClick={() => void updateWithdrawal(withdrawal.id, "processing")} className="rounded-md border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] font-extrabold text-gold disabled:opacity-50">Traiter</button>}
                          {["pending", "processing"].includes(withdrawal.status) && <button disabled={busy} onClick={() => void updateWithdrawal(withdrawal.id, "completed")} className="rounded-md bg-gold px-2 py-1 text-[10px] font-extrabold text-ink disabled:opacity-50">Valider</button>}
                          {["pending", "processing"].includes(withdrawal.status) && <button disabled={busy} onClick={() => void updateWithdrawal(withdrawal.id, "rejected")} className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-extrabold text-rose-200 disabled:opacity-50"><XCircle size={11}/> Rejeter</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold"><Clipboard size={18} /></div>
          <div>
            <h2 className="font-display text-sm font-bold text-snow">Intégrateur Widget / SDK</h2>
            <p className="text-xs text-fog">Extrait public : aucune clé secrète n'est incluse.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-edge bg-abyss/80">
          <pre className="code-scroll overflow-x-auto p-4 font-mono text-[11px] leading-6 text-[#b8c4d6]">{widgetCode}</pre>
          <div className="flex items-center justify-between border-t border-edge px-3 py-2.5">
            <span className="text-[10px] text-fog2">Widget v4 · thème glassmorphism · destinataire fourni par l'application cliente</span>
            <button type="button" onClick={() => void copyWidget()} className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[10px] font-extrabold text-ink">
              {copied ? <Check size={12}/> : <Clipboard size={12}/>} {copied ? "Copié" : "Copier le code"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
