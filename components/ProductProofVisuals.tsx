// Representative, de-identified visuals for the homepage "product proof"
// section. These are marketing mockups (no live data) that mirror the in-app
// design language: lime #a3e635 / blue #60a5fa, LSI thresholds (lime ≥90,
// amber 80–89, rose <80), dark panels with the soft lime glow.

const LIME = "#a3e635";
const BLUE = "#60a5fa";

const cardShell =
  "flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-950/70 p-5 shadow-xl shadow-lime-400/10";

function lsiClass(lsi: number): string {
  if (lsi >= 90) return "text-lime-400";
  if (lsi >= 80) return "text-amber-400";
  return "text-rose-400";
}

export function ReportFindingsCard({ className = "" }: { className?: string }) {
  const rows = [
    { label: "Quadriceps strength LSI", value: "93%", lsi: 93 },
    { label: "CMJ jump symmetry", value: "91%", lsi: 91 },
    { label: "Hop test LSI", value: "88%", lsi: 88 },
    { label: "Sprint top speed", value: "Good", lsi: 100 },
  ];
  return (
    <div className={`${cardShell} ${className}`}>
      <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-2">
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-lime-300">
          Return-to-play report
        </span>
        <span className="text-[0.6rem] text-slate-500">12 Jun 2026</span>
      </div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-100">Athlete A · Football</p>
        <p className="text-xs text-slate-500">Left ACL · 28 weeks post-op</p>
      </div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-lime-400/30 bg-lime-400/5 px-3 py-2">
        <span className="text-xs font-medium text-slate-200">Readiness</span>
        <span className="rounded-full bg-lime-400/15 px-2 py-0.5 text-xs font-semibold text-lime-300 ring-1 ring-lime-500/40">
          5 / 6 criteria met
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">{r.label}</span>
            <span className={`font-mono font-medium ${lsiClass(r.lsi)}`}>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendMiniCard({ className = "" }: { className?: string }) {
  const data = [
    { label: "Feb", v: 28 },
    { label: "Mar", v: 31 },
    { label: "Apr", v: 33 },
    { label: "May", v: 35 },
    { label: "Jun", v: 37 },
  ];
  const MAXV = 42;
  const top = 6;
  const bottom = 92;
  const left = 8;
  const right = 232;
  const span = bottom - top;
  const slot = (right - left) / data.length;
  const barW = 24;
  const refY = bottom - (data[0].v / MAXV) * span;

  return (
    <div className={`${cardShell} ${className}`}>
      <p className="mb-1 text-sm font-semibold text-slate-100">Jump height over time</p>
      <p className="mb-3 text-xs text-slate-500">Session-over-session progress (cm)</p>
      <div className="mt-auto min-h-[130px] flex-1">
        <svg
          viewBox="0 0 240 112"
          className="h-full w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Jump height improving across five sessions"
        >
          <defs>
            <linearGradient id="ppTrendBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bef264" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#a3e635" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#4d7c0f" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <line
            x1={left}
            y1={refY}
            x2={right}
            y2={refY}
            stroke="#3b475c"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          {data.map((d, i) => {
            const barTop = bottom - (d.v / MAXV) * span;
            const h = bottom - barTop;
            const x = left + i * slot + (slot - barW) / 2;
            return (
              <g key={d.label}>
                <rect x={x} y={barTop} width={barW} height={h} rx="3" fill="url(#ppTrendBar)" />
                <text
                  x={x + barW / 2}
                  y="106"
                  textAnchor="middle"
                  fontSize="8"
                  fill="#94a3b8"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function AsymmetryMiniCard({ className = "" }: { className?: string }) {
  const rows = [
    { label: "Peak force", l: 1420, r: 1510 },
    { label: "Landing force", l: 2100, r: 2380 },
    { label: "Propulsive force", l: 980, r: 1010 },
  ];
  return (
    <div className={`${cardShell} ${className}`}>
      <p className="text-sm font-semibold text-slate-100">Left / right asymmetry</p>
      <div className="mb-3 mt-1 flex items-center gap-3 text-[0.65rem] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BLUE }} /> Left
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LIME }} /> Right
        </span>
      </div>
      <ul className="flex flex-1 flex-col justify-center space-y-4">
        {rows.map((row) => {
          const total = row.l + row.r;
          const leftPct = (row.l / total) * 100;
          const lsi =
            Math.round((Math.min(row.l, row.r) / Math.max(row.l, row.r)) * 1000) / 10;
          return (
            <li key={row.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className={`font-mono text-xs font-medium ${lsiClass(lsi)}`}>
                  LSI {lsi.toFixed(1)}%
                </span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                <div style={{ width: `${leftPct}%`, backgroundColor: BLUE }} />
                <div style={{ width: `${100 - leftPct}%`, backgroundColor: LIME }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                <span>L {row.l}</span>
                <span>R {row.r}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
