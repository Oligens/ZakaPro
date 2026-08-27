import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Source } from "../lib/engine";
import { SOURCE_META } from "../lib/data";
import { copyText } from "../lib/generator";
import { IconCheck, IconCopy } from "./icons";

/* ---------- Constantes de style partagées ---------- */

export const inputCls =
  "w-full rounded-lg border border-edge bg-panel2 px-3.5 py-2.5 text-sm text-snow placeholder:text-fog2 outline-none transition-colors focus:border-gold/60 focus:ring-2 focus:ring-gold/15";

export const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-fog";

/* ---------- Toggle ---------- */

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-12 shrink-0 rounded-full border transition-colors duration-300 ${
        on ? "border-gold/60 bg-gold" : "border-edge2 bg-edge"
      } ${disabled ? "opacity-40" : "cursor-pointer"}`}
      style={{ height: 26 }}
    >
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow transition-all duration-300 ${
          on ? "left-[calc(100%-22px)] bg-ink" : "left-0.5 bg-snow"
        }`}
      />
    </button>
  );
}

/* ---------- Badges ---------- */

export function SourceBadge({ source, compact }: { source: Source; compact?: boolean }) {
  const meta = SOURCE_META[source];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold"
      style={{ color: meta.color, borderColor: meta.color + "44", background: meta.color + "14" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function StatusPill({ status }: { status: "Réussi" | "En attente" }) {
  const ok = status === "Réussi";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${ok ? "bg-mint/12 text-mint" : "bg-gold/12 text-gold"}`}>
      {ok ? <IconCheck width={11} height={11} strokeWidth={3} /> : <span className="h-1.5 w-1.5 animate-blink rounded-full bg-gold" />}
      {status}
    </span>
  );
}

/* ---------- Révélation au scroll ---------- */

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.07 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------- Bouton copier ---------- */

export function CopyBtn({ text, label = "Copier", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
        copied ? "border-mint/50 bg-mint/12 text-mint" : "border-edge2 bg-panel2 text-fog hover:border-gold/50 hover:text-gold"
      } ${className}`}
    >
      {copied ? <IconCheck width={13} height={13} strokeWidth={2.6} /> : <IconCopy width={13} height={13} />}
      {copied ? "Copié !" : label}
    </button>
  );
}

/* ---------- En-tête de section ---------- */

export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-[15px] font-bold text-snow">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-fog">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- État vide générique ---------- */

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-edge2 bg-panel/30 px-6 py-12 text-center">
      <span className="grid h-13 w-13 place-items-center rounded-xl border border-gold/30 bg-gold/10 text-gold" style={{ width: 52, height: 52 }}>
        {icon}
      </span>
      <p className="mt-4 font-display text-[15px] font-bold text-snow">{title}</p>
      {sub && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-fog">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton de chargement ---------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl border border-edge bg-panel ${className}`} />;
}

/* ---------- Compteur animé ---------- */

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
