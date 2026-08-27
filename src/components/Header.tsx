import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PATHS, SOURCE_META, tabForPath, timeAgo, type Tab } from "../lib/data";
import { useAuth } from "../lib/auth";
import { useZaka } from "../lib/store";
import {
  IconBell,
  IconCard,
  IconCheck,
  IconChevronDown,
  IconGear,
  IconGrid,
  IconLogOut,
  IconLoop,
  IconMenu,
  IconPlus,
  IconRadio,
  IconTruck,
  IconX,
} from "./icons";

const NAV: Array<{ tab: Tab; path: string; label: string; icon: typeof IconGrid }> = [
  { tab: "apps", path: PATHS.apps, label: "Mes applications", icon: IconGrid },
  { tab: "plans", path: PATHS.plans, label: "Abonnements & plans", icon: IconLoop },
  { tab: "listener", path: PATHS.listener, label: "Écouteur SMS", icon: IconRadio },
  { tab: "deliveries", path: PATHS.deliveries, label: "Livraisons", icon: IconTruck },
  { tab: "settings", path: PATHS.settings, label: "Paramètres", icon: IconGear },
];

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid shrink-0 place-items-center rounded-lg bg-gold shadow-glow" style={{ width: 38, height: 38 }}>
        <span className="font-display text-lg font-bold leading-none text-ink">Z</span>
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-ink bg-mint pulse-dot" />
      </div>
      <div className="leading-none">
        <div className="font-display text-[15px] font-bold tracking-[0.08em] text-snow">
          ZAKA <span className="text-gold">PRO</span>
        </div>
        {!compact && (
          <div className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.2em] text-fog">
            Paiements • Abonnements • Intégration
          </div>
        )}
      </div>
    </div>
  );
}

/** Zone d'authentification : boutons invités ou menu utilisateur. */
function AuthZone() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (auth.status === "loading") {
    return <div className="h-10 w-36 animate-pulse rounded-lg border border-edge bg-panel" />;
  }

  if (auth.status === "guest") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate(PATHS.login)}
          className="cursor-pointer rounded-lg border border-edge bg-panel px-3 py-2 text-xs font-extrabold text-fog transition-colors hover:border-gold/50 hover:text-gold"
        >
          Se connecter
        </button>
        <button
          type="button"
          onClick={() => navigate(PATHS.register)}
          className="cursor-pointer rounded-lg bg-gold px-3 py-2 text-xs font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-95"
        >
          S'inscrire
        </button>
      </div>
    );
  }

  const u = auth.user!;
  const initials = u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border py-1 pl-1 pr-2.5 transition-colors ${
          open ? "border-gold/50 bg-gold/8" : "border-edge bg-panel hover:border-gold/40"
        }`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-goldsoft to-gold font-display text-[12px] font-bold text-ink">
          {initials}
        </span>
        <span className="hidden max-w-[110px] text-left sm:block">
          <span className="block truncate text-xs font-bold leading-tight text-snow">{u.name}</span>
          <span className="block text-[10px] leading-tight text-fog">Compte marchand</span>
        </span>
        <IconChevronDown width={14} height={14} className={`text-fog2 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="animate-pop absolute right-0 z-50 mt-2 w-64 rounded-xl border border-edge2 bg-panel shadow-card">
          <div className="border-b border-edge px-4 py-3">
            <p className="truncate text-sm font-bold text-snow">{u.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-fog">{u.email}</p>
            <div className="mt-2 flex gap-1.5">
              {u.verified && (
                <span className="inline-flex items-center gap-1 rounded-md bg-mint/12 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-mint">
                  <IconCheck width={10} height={10} strokeWidth={3} /> Email vérifié
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void auth.logout();
              setOpen(false);
              navigate(PATHS.login);
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-b-xl px-4 py-3 text-[13px] font-bold text-fog transition-colors hover:bg-rosey/10 hover:text-snow"
            style={{ color: "#EC4899" }}
          >
            <IconLogOut width={15} height={15} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = tabForPath(pathname);
  const auth = useAuth();
  const zaka = useZaka();
  const [drawer, setDrawer] = useState(false);
  const [notif, setNotif] = useState(false);

  const unread = zaka.smsLog.filter((e) => e.at > zaka.notifSeen).length;
  const go = (path: string) => {
    navigate(path);
    setDrawer(false);
    setNotif(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg border border-edge bg-panel text-fog transition-colors hover:border-gold/50 hover:text-gold lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <IconMenu width={19} height={19} />
          </button>

          <button type="button" onClick={() => go(PATHS.apps)} className="cursor-pointer">
            <Logo />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Liens desktop */}
            <nav className="mr-2 hidden items-center gap-1 lg:flex">
              {NAV.map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => go(item.path)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${
                    tab === item.tab ? "bg-gold/12 text-gold" : "text-fog hover:bg-panel hover:text-snow"
                  }`}
                >
                  {item.label.split(" ")[0] === "Abonnements" ? "Abonnements" : item.label.split(" ")[0] === "Mes" ? "Applications" : item.label.split(" ")[0]}
                </button>
              ))}
            </nav>

            {/* Cloche de notifications */}
            {auth.status === "authed" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotif((v) => !v)}
                  className={`relative grid h-10 w-10 cursor-pointer place-items-center rounded-lg border transition-colors ${
                    notif ? "border-gold/50 bg-gold/10 text-gold" : "border-edge bg-panel text-fog hover:border-gold/50 hover:text-gold"
                  }`}
                  aria-label="Notifications"
                >
                  <IconBell width={18} height={18} />
                  {unread > 0 && (
                    <span
                      className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-ink pulse-gold"
                      style={{ height: 18, minWidth: 18 }}
                    >
                      {unread}
                    </span>
                  )}
                </button>

                {notif && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotif(false)} />
                    <div className="animate-rise absolute right-0 z-50 mt-2 w-[min(88vw,340px)] rounded-xl border border-edge2 bg-panel shadow-card">
                      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
                        <span className="font-display text-sm font-bold text-snow">Notifications</span>
                        <span className="rounded-md bg-gold/12 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">Temps réel</span>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {zaka.smsLog.length === 0 && (
                          <p className="px-4 py-8 text-center text-xs text-fog2">
                            Aucune interception pour l'instant — l'écouteur SMS est en veille.
                          </p>
                        )}
                        {zaka.smsLog.slice(0, 7).map((e) => (
                          <div key={e.id} className="flex gap-3 border-b border-edge/60 px-4 py-3 last:border-0">
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: e.ok && e.source ? SOURCE_META[e.source].color : "#5c6980" }} />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-snow">
                                {e.ok ? `Paiement ${e.amount?.toLocaleString("fr-FR")} HTG reçu` : "SMS non transactionnel ignoré"}
                              </p>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-fog">{e.raw}</p>
                              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fog2">
                                {timeAgo(e.at)} · Webhook {e.webhook}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {zaka.smsLog.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            zaka.markNotifRead();
                            setNotif(false);
                          }}
                          className="w-full cursor-pointer rounded-b-xl border-t border-edge px-4 py-2.5 text-xs font-bold text-gold transition-colors hover:bg-gold/8"
                        >
                          Tout marquer comme lu
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <AuthZone />
          </div>
        </div>
      </header>

      {/* Tiroir mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-abyss/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="animate-rise absolute bottom-0 left-0 top-0 flex w-[min(84vw,300px)] flex-col border-r border-edge2 bg-panel shadow-card">
            <div className="flex items-center justify-between border-b border-edge px-4 py-4">
              <Logo compact />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-edge text-fog hover:text-snow"
                aria-label="Fermer le menu"
              >
                <IconX width={16} height={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = tab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => go(item.path)}
                    className={`mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                      active ? "bg-gold/12 text-gold" : "text-fog hover:bg-panel2 hover:text-snow"
                    }`}
                  >
                    <Icon width={18} height={18} />
                    {item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
                  </button>
                );
              })}

              {auth.status === "guest" && (
                <div className="mt-4 space-y-2 border-t border-edge pt-4">
                  <button
                    type="button"
                    onClick={() => go(PATHS.login)}
                    className="w-full cursor-pointer rounded-lg border border-edge2 bg-panel2 py-2.5 text-sm font-bold text-snow transition-colors hover:border-gold/50 hover:text-gold"
                  >
                    Se connecter
                  </button>
                  <button
                    type="button"
                    onClick={() => go(PATHS.register)}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gold py-2.5 text-sm font-extrabold text-ink shadow-glow"
                  >
                    <IconPlus width={14} height={14} strokeWidth={2.6} /> S'inscrire
                  </button>
                </div>
              )}
            </div>
            <div className="border-t border-edge p-4">
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${zaka.settings.monitoring ? "border-mint/25 bg-mint/8" : "border-edge bg-panel2"}`}>
                <IconRadio width={20} height={20} className={`shrink-0 ${zaka.settings.monitoring ? "text-mint" : "text-fog2"}`} />
                <div>
                  <p className="text-xs font-bold text-snow">{zaka.settings.monitoring ? "Écouteur SMS actif" : "Écouteur en pause"}</p>
                  <p className="text-[11px] text-fog">MonCash · Natcash en arrière-plan</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
