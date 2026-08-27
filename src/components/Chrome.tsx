import { useLocation, useNavigate } from "react-router-dom";
import { PATHS, tabForPath, type Tab, type ToastMsg } from "../lib/data";
import { useZaka } from "../lib/store";
import { IconBell, IconCard, IconGear, IconGrid, IconInbox, IconLoop, IconRadio, IconTruck, IconX, IconZap } from "./icons";

/* ---------- Barre de navigation inférieure ---------- */

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = tabForPath(pathname);
  const zaka = useZaka();
  const pending = zaka.pendingDeliveries.length;

  const go = (path: string) => {
    navigate(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const items: Array<{ path: string; label: string; icon: typeof IconGrid; tab: Tab; badge?: number }> = [
    { path: PATHS.apps, label: "Apps", icon: IconGrid, tab: "apps" },
    { path: PATHS.plans, label: "Plans", icon: IconLoop, tab: "plans" },
    { path: PATHS.listener, label: "Écouteur", icon: IconRadio, tab: "listener" },
    { path: PATHS.deliveries, label: "Livraisons", icon: IconTruck, tab: "deliveries", badge: pending },
    { path: PATHS.settings, label: "Réglages", icon: IconGear, tab: "settings" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-edge backdrop-blur-md" style={{ background: "rgba(6,9,15,0.92)" }}>
      <div className="mx-auto grid h-[68px] max-w-6xl grid-cols-5 items-stretch px-2">
        {items.map((item) => {
          const active = tab === item.tab;
          const Icon = item.icon;
          const isCenter = item.tab === "listener";

          if (isCenter) {
            return (
              <div key={item.tab} className="relative flex flex-col items-center justify-end pb-1.5">
                <button
                  type="button"
                  onClick={() => go(item.path)}
                  className={`absolute -top-6 grid h-14 w-14 cursor-pointer place-items-center rounded-full border-4 transition-all duration-200 active:scale-90 ${
                    active ? "border-ink bg-goldsoft text-ink shadow-glow" : "border-abyss bg-gold text-ink shadow-glow hover:bg-goldsoft"
                  }`}
                  aria-label="Écouteur SMS"
                >
                  <IconRadio width={23} height={23} strokeWidth={2} />
                  {zaka.settings.monitoring && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-gold bg-mint pulse-dot" />}
                </button>
                <span className={`text-[9.5px] font-extrabold ${active ? "text-gold" : "text-fog2"}`}>{item.label}</span>
              </div>
            );
          }

          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => go(item.path)}
              className={`relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg transition-all duration-200 active:scale-95 ${
                active ? "text-gold" : "text-fog2 hover:text-snow"
              }`}
            >
              <span className="relative">
                <Icon width={20} height={20} strokeWidth={active ? 2.1 : 1.8} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[8.5px] font-extrabold text-snow pulse-gold"
                    style={{ background: "#EC4899" }}
                  >
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[9.5px] font-extrabold">{item.label}</span>
              {active && <span className="absolute bottom-0.5 h-1 w-6 rounded-full bg-gold" />}
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

/* ---------- Toasts temps réel ---------- */

const KIND_STYLE: Record<ToastMsg["kind"], { color: string; icon: typeof IconBell; label: string }> = {
  payment: { color: "#22C55E", icon: IconCard, label: "Paiement reçu" },
  alarm: { color: "#EAB308", icon: IconBell, label: "Alarme déclenchée" },
  webhook: { color: "#2563EB", icon: IconZap, label: "Webhook" },
  info: { color: "#8B98AB", icon: IconInbox, label: "Information" },
};

export function Toasts({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-24 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5">
      {toasts.map((t) => {
        const s = KIND_STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role="status"
            className="animate-toast pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-xl border border-edge2 bg-panel/95 p-3.5 pr-2.5 shadow-card backdrop-blur sm:w-[350px]"
            style={{ borderLeft: `3px solid ${s.color}` }}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.kind === "alarm" ? "pulse-gold" : ""}`} style={{ background: s.color + "1c", color: s.color }}>
              <Icon width={18} height={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: s.color }}>
                {s.label}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-snow">{t.title}</p>
              {t.sub && <p className="mt-0.5 text-[11px] leading-snug text-fog">{t.sub}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-fog2 transition-colors hover:bg-panel2 hover:text-snow"
              aria-label="Fermer la notification"
            >
              <IconX width={13} height={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
