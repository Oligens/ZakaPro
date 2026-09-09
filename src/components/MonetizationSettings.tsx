import { useEffect, useState } from "react";

type Props = { appKey: string };

export function MonetizationSettings({ appKey }: Props) {
  const [rules, setRules] = useState({ standard: 30, intermediate: 70, vip: 100 });
  const [rate, setRate] = useState("1");
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  const load = async () => {
    const [cfg, wd] = await Promise.all([
      fetch(`/api/apps/${encodeURIComponent(appKey)}/checkout?mode=monetization`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/apps/${encodeURIComponent(appKey)}/checkout?mode=withdrawals`, { credentials: "include", cache: "no-store" }),
    ]);
    if (cfg.ok) {
      const body = await cfg.json();
      setRules({ standard: Number(body.monetization?.rules?.standard ?? 30), intermediate: Number(body.monetization?.rules?.intermediate ?? 70), vip: Number(body.monetization?.rules?.vip ?? 100) });
      setRate(String(body.monetization?.tokenToHtgRate ?? 1));
    }
    if (wd.ok) {
      const body = await wd.json();
      setWithdrawals(Array.isArray(body.withdrawals) ? body.withdrawals : []);
    }
  };

  useEffect(() => { void load(); }, [appKey]);

  const save = async () => {
    setStatus("Enregistrement…");
    const res = await fetch(`/api/apps/${encodeURIComponent(appKey)}/checkout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config", tokenToHtgRate: Number(rate), rules }),
    });
    const body = await res.json();
    setStatus(res.ok ? "Configuration enregistrée." : body.error || "Échec de sauvegarde.");
  };

  const updateWithdrawal = async (id: string, nextStatus: string) => {
    const res = await fetch(`/api/apps/${encodeURIComponent(appKey)}/checkout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdrawal_update", withdrawalId: id, status: nextStatus }),
    });
    if (res.ok) await load();
  };

  return (
    <div className="space-y-4 rounded-xl border border-edge bg-panel p-4 shadow-card sm:p-5">
      <div>
        <h3 className="font-display text-sm font-bold text-snow">Monétisation & portefeuilles</h3>
        <p className="mt-1 text-xs text-fog">Règles de partage par palier. Les montants sont calculés exclusivement côté serveur.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(["standard", "intermediate", "vip"] as const).map((tier) => (
          <label key={tier} className="text-[11px] font-bold text-fog">
            {tier === "standard" ? "Standard" : tier === "intermediate" ? "Intermédiaire" : "VIP"}
            <input type="number" min="0" max="100" value={rules[tier]} onChange={(e) => setRules((r) => ({ ...r, [tier]: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-snow" />
          </label>
        ))}
        <label className="text-[11px] font-bold text-fog">1 jeton = HTG
          <input type="number" min="0.000001" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-snow" />
        </label>
      </div>
      <button type="button" onClick={save} className="rounded-lg bg-gold px-4 py-2 text-xs font-extrabold text-ink">Enregistrer les règles</button>
      {status && <span className="ml-2 text-xs text-fog">{status}</span>}

      <div className="border-t border-edge pt-4">
        <h4 className="text-xs font-bold text-snow">Demandes de retrait</h4>
        <div className="mt-2 space-y-2">
          {withdrawals.length === 0 ? <p className="text-xs text-fog2">Aucune demande.</p> : withdrawals.slice(0, 10).map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-panel2 p-3 text-xs">
              <span className="font-bold text-snow">{Number(w.amount).toLocaleString("fr-FR")} {w.currency}</span>
              <span className="text-fog">{w.method} · {w.destination}</span>
              <span className="ml-auto text-fog2">{w.status}</span>
              {w.status === "pending" && <button type="button" onClick={() => updateWithdrawal(w.id, "processing")} className="rounded-md border border-edge px-2 py-1 font-bold text-fog">Traiter</button>}
              {["pending","processing"].includes(w.status) && <button type="button" onClick={() => updateWithdrawal(w.id, "completed")} className="rounded-md bg-gold px-2 py-1 font-bold text-ink">Payé</button>}
              {["pending","processing"].includes(w.status) && <button type="button" onClick={() => updateWithdrawal(w.id, "rejected")} className="rounded-md border border-rose-400/30 px-2 py-1 font-bold text-rose-300">Refuser</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
