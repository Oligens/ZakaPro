/* ============================================================
   ZakaPro — Point d'entrée applicatif
   ============================================================ */

import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ZakaProvider, useZaka } from "./lib/store";
import Header from "./components/Header";
import { BottomNav, Toasts } from "./components/Chrome";
import { LoginPage, RegisterPage, VerifyEmailPage } from "./views/AuthViews";
import AppsView from "./views/AppsView";
import { AppShell, AppDashboard, AppTransactions, AppPlans, AppDelivery } from "./views/AppArea";
import { AppIntegration } from "./views/AppIntegrationDedicated";
import { SmsListenerView, DeliveriesView } from "./views/Operations";
import { PlansGlobalView } from "./views/ConfigViews";
import EnhancedSettingsView from "./views/EnhancedSettingsView";
import Hub from "./views/Hub";
import type { ReactNode } from "react";

function BootSkeleton() {
  return <div className="min-h-screen"><div className="border-b border-edge bg-ink/85"><div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4"><div className="h-9 w-9 animate-pulse rounded-lg bg-panel" /><div className="space-y-1.5"><div className="h-3.5 w-28 animate-pulse rounded bg-panel" /><div className="h-2 w-44 animate-pulse rounded bg-panel2" /></div><div className="ml-auto flex gap-2"><div className="h-10 w-10 animate-pulse rounded-lg bg-panel" /><div className="h-10 w-24 animate-pulse rounded-lg bg-panel" /></div></div></div><main className="mx-auto max-w-6xl px-4 pb-32 pt-6"><div className="mb-5 flex items-center gap-2 text-xs font-bold text-fog"><span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />Vérification de la session et chargement des données…</div><div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><div className="h-72 animate-pulse rounded-xl border border-edge bg-panel" /><div className="grid grid-cols-3 gap-2.5"><div className="h-24 animate-pulse rounded-xl border border-edge bg-panel" /><div className="h-24 animate-pulse rounded-xl border border-edge bg-panel" /><div className="h-24 animate-pulse rounded-xl border border-edge bg-panel" /></div></div><div className="space-y-4"><div className="h-28 animate-pulse rounded-xl border border-edge bg-panel" /><div className="h-40 animate-pulse rounded-xl border border-edge bg-panel" /></div></div></main></div>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="grid min-h-screen place-items-center px-4"><div className="w-full max-w-md rounded-xl border bg-panel p-6 text-center shadow-card" style={{ borderColor: "#EC489966" }}><span className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-gold/30 bg-gold/10 font-display text-xl font-bold text-gold">!</span><h1 className="mt-4 font-display text-lg font-bold text-snow">Impossible de charger les données</h1><p className="mt-2 text-[13px] leading-relaxed text-fog">{message} Vérifiez votre connexion, votre session, ou le déploiement des fonctions serverless sur Vercel.</p><button type="button" onClick={onRetry} className="mt-5 w-full cursor-pointer rounded-xl bg-gold py-3 text-sm font-extrabold text-ink shadow-glow transition-all hover:bg-goldsoft active:scale-[0.99]">Réessayer</button></div></div>;
}

function Protected({ children }: { children: ReactNode }) { const auth = useAuth(); if (auth.status === "loading") return <BootSkeleton />; if (auth.status === "guest") return <Navigate to="/login" replace />; return <>{children}</>; }
function PublicOnly({ children }: { children: ReactNode }) { const auth = useAuth(); if (auth.status === "loading") return <BootSkeleton />; if (auth.status === "authed") return <Navigate to="/apps" replace />; return <>{children}</>; }

function Shell() {
  const zaka = useZaka();
  if (zaka.isLoading) return <BootSkeleton />;
  if (zaka.loadError) return <LoadError message={zaka.loadError} onRetry={zaka.retryLoad} />;
  return <div className="min-h-screen"><Header /><main className="mx-auto max-w-6xl px-4 pb-32 pt-5"><Routes><Route path="/" element={<Navigate to="/apps" replace />} /><Route path="/apps" element={<AppsView />} /><Route path="/plans" element={<PlansGlobalView />} /><Route path="/sms-listener" element={<SmsListenerView />} /><Route path="/deliveries" element={<DeliveriesView />} /><Route path="/settings" element={<EnhancedSettingsView />} /><Route path="/app/:appId" element={<AppShell />}><Route index element={<AppDashboard />} /><Route path="transactions" element={<AppTransactions />} /><Route path="plans" element={<AppPlans />} /><Route path="delivery" element={<AppDelivery />} /><Route path="integration" element={<AppIntegration />} /></Route></Routes></main><BottomNav /><Toasts toasts={zaka.toasts} onDismiss={zaka.dismissToast} /></div>;
}

function Router() {
  return <Routes><Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} /><Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} /><Route path="/verify-email" element={<VerifyEmailPage />} /><Route path="/hub/:appId/:planId" element={<Hub />} /><Route path="/*" element={<Protected><Shell /></Protected>} /></Routes>;
}

export default function App() {
  return <AuthProvider><ZakaProvider><HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Router /></HashRouter></ZakaProvider></AuthProvider>;
}
