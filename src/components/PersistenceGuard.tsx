import { useEffect, useState } from "react";

interface PersistenceErrorDetail { message?: string; code?: string }

export default function PersistenceGuard() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<PersistenceErrorDetail>).detail;
      setMessage(detail?.message || "La sauvegarde n'a pas été confirmée par le serveur.");
      window.setTimeout(() => setMessage(null), 7000);
    };
    window.addEventListener("zakapro:persistence-error", onError);
    return () => window.removeEventListener("zakapro:persistence-error", onError);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[100] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-red-400/30 bg-panel/95 p-4 shadow-2xl backdrop-blur-xl" role="alert">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-500/10 text-sm font-black text-red-300">!</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-snow">Sauvegarde non confirmée</p>
          <p className="mt-1 text-xs leading-relaxed text-fog">{message}</p>
        </div>
        <button type="button" onClick={() => setMessage(null)} className="text-xs font-bold text-fog hover:text-snow" aria-label="Fermer">Fermer</button>
      </div>
    </div>
  );
}
