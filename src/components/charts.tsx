import { useMemo, useRef, useState } from "react";
import { fmtNum, type DayPoint } from "../lib/data";

/* ---------- Format compact (12,4 K / 1,2 M) ---------- */

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",") + " K";
  return fmtNum(n, 0);
}

/* ---------- Graphique en aires (or + survol détaillé) ---------- */

export function AreaChart({ data, height = 190, id }: { data: DayPoint[]; height?: number; id: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const W = 600;
  const H = height;
  const totals = useMemo(() => data.map((p) => p.moncash + p.natcash + p.autre), [data]);
  const max = useMemo(() => Math.max(1, ...totals) * 1.18, [totals]);

  const px = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * W : 0);
  const py = (v: number) => H - (v / max) * (H - 26) - 10;

  const line = totals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const onMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || data.length < 2) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (data.length - 1)));
  };

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full cursor-crosshair select-none"
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EAB308" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#EAB308" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#EAB308" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#1E2632" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#grad-${id})`} className="animate-area" />
        <path d={line} fill="none" stroke="#EAB308" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="animate-draw" />
      </svg>

      {hover !== null && hovered && (
        <>
          <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-gold/40" style={{ left: `${(hover / Math.max(1, data.length - 1)) * 100}%` }} />
          <div
            className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border border-edge2 bg-panel/95 p-2.5 shadow-card backdrop-blur"
            style={{ left: `${Math.min(82, Math.max(18, (hover / Math.max(1, data.length - 1)) * 100))}%`, top: 0 }}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-fog2">{hovered.label}</p>
            <p className="tabular mt-1 font-display text-sm font-bold text-gold">
              {fmtNum(hovered.moncash + hovered.natcash + hovered.autre)} HTG
            </p>
            <div className="mt-1.5 space-y-0.5 text-[10.5px] font-semibold">
              <p className="flex justify-between text-fog"><span className="text-cash">MonCash</span> {fmtNum(hovered.moncash)}</p>
              <p className="flex justify-between text-fog"><span className="text-nat">Natcash</span> {fmtNum(hovered.natcash)}</p>
              <p className="flex justify-between text-fog"><span className="text-rosey">Autres</span> {fmtNum(hovered.autre)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Sparkline ---------- */

export function Spark({ values, color, width = 96, height = 26 }: { values: number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - 3 - ((v - min) / range) * (height - 6)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}
