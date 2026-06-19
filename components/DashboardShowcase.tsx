function Gauge({
  value,
  label,
  pass = 90,
  warn = 80,
}: {
  value: number;
  label: string;
  pass?: number;
  warn?: number;
}) {
  const circumference = 150.8;
  const dashoffset = circumference * (1 - value / 100);
  const stroke =
    value >= pass ? "#a3e635" : value >= warn ? "#fbbf24" : "#f87171";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 60 60" className="h-14 w-14" aria-hidden>
        <circle
          cx="30"
          cy="30"
          r="24"
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="5"
        />
        <circle
          cx="30"
          cy="30"
          r="24"
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 30 30)"
        />
        <text
          x="30"
          y="34"
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="15"
          fontWeight="500"
        >
          {value}
        </text>
      </svg>
      <span className="text-center text-[10px] leading-tight text-slate-400">
        {label}
      </span>
    </div>
  );
}

type PerfTile = {
  label: string;
  value: string;
  unit: string;
  delta: string;
  deltaClass: string;
};

const PERF_TILES: PerfTile[] = [
  {
    label: "Max speed",
    value: "8.1",
    unit: "m/s",
    delta: "▲ +0.2",
    deltaClass: "text-lime-400",
  },
  {
    label: "Acceleration",
    value: "5.9",
    unit: "m/s²",
    delta: "▲ +0.4",
    deltaClass: "text-lime-400",
  },
  {
    label: "Deceleration",
    value: "5.4",
    unit: "m/s²",
    delta: "▼ −0.3",
    deltaClass: "text-rose-400",
  },
  {
    label: "Reactive strength",
    value: "1.42",
    unit: "",
    delta: "▲ +0.10",
    deltaClass: "text-amber-400",
  },
  {
    label: "Jump height",
    value: "31.0",
    unit: "cm",
    delta: "▲ +1.2",
    deltaClass: "text-lime-400",
  },
];

export default function DashboardShowcase() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70 shadow-xl shadow-lime-400/10">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
        <span className="ml-2 text-[10px] text-slate-500">athlete dashboard</span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-lime-400/40 bg-lime-400/15 text-sm font-semibold text-lime-300">
            A
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-medium text-slate-100">Athlete A</span>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-300">
                Monitoring
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              AFL · 178 cm · 74 kg · last tested Jun 2026
            </p>
          </div>
        </div>

        <p className="my-4 text-sm text-slate-300">
          Cleared on <b className="text-amber-300">4 of 8</b> exit criteria —{" "}
          <span className="text-rose-400">quadriceps strength</span> and{" "}
          <span className="text-rose-400">reactive (drop-jump) symmetry</span> remain
          the priorities.
        </p>

        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-lime-300">
          Isometric strength · LSI
        </h3>
        <div className="grid max-w-[330px] grid-cols-3 gap-3">
          <Gauge value={78} label="Knee extension" />
          <Gauge value={86} label="Knee flexion" />
          <Gauge value={94} label="Hip abduction" />
        </div>

        <h3 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-lime-300">
          Jump &amp; hop · LSI
        </h3>
        <div className="grid grid-cols-5 gap-2">
          <Gauge value={91} label="CMJ (propulsive)" />
          <Gauge value={83} label="Drop jump — double" />
          <Gauge value={76} label="Drop jump — single" />
          <Gauge value={90} label="Single-leg hop" />
          <Gauge value={93} label="Triple hop" />
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-lime-300">
            Return-to-sport progress
          </h3>
          <svg viewBox="0 0 600 90" className="h-16 w-full" aria-hidden>
            <polyline
              points="20,72 135,60 250,46 365,34 480,24 575,18"
              fill="none"
              stroke="#a3e635"
              strokeWidth="2.5"
            />
            <circle cx="20" cy="72" r="3.5" fill="#a3e635" />
            <circle cx="135" cy="60" r="3.5" fill="#a3e635" />
            <circle cx="250" cy="46" r="3.5" fill="#a3e635" />
            <circle cx="365" cy="34" r="3.5" fill="#a3e635" />
            <circle cx="480" cy="24" r="3.5" fill="#a3e635" />
            <circle cx="575" cy="18" r="3.5" fill="#a3e635" />
          </svg>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Speed, power &amp; reactive strength
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PERF_TILES.map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5"
              >
                <p className="text-[10px] text-slate-400">{tile.label}</p>
                <p className="text-base font-medium text-slate-100">
                  {tile.value}
                  {tile.unit ? (
                    <span className="ml-0.5 text-[10px] font-normal text-slate-500">
                      {tile.unit}
                    </span>
                  ) : null}
                </p>
                <p className={`text-[10px] ${tile.deltaClass}`}>{tile.delta}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
