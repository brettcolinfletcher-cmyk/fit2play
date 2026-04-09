// /lib/parse1080Csv.ts

export type Parsed1080 = {
  testType: "1080_sprint" | "other";
  summary: {
    peakSpeed: number | null;
    peakForce: number | null;
    peakPower: number | null;
    split5m: number | null;
    split10m: number | null;
    split20m: number | null;
  };
  reps: {
    repIndex: number;
    peakSpeed: number | null;
    peakForce: number | null;
    peakPower: number | null;
    split5m: number | null;
    split10m: number | null;
    split20m: number | null;
  }[];
  timeSeries: {
    repIndex: number;
    t: number[];
    x: number[];
    v: number[];
    a: number[];
    f: number[];
    p: number[];
  }[];
};

export function parse1080SamplesCsv(text: string): Parsed1080 {
  const rows = text.trim().split(/\r?\n/).map(r => r.split(","));

  const header = rows[0].map(h => h.trim());

  // ---- MATCH YOUR EXACT COLUMN NAMES ----
  const COL_T = header.indexOf("Time [s]");
  const COL_X = header.indexOf("Distance [m]");
  const COL_V = header.indexOf("Speed [m/s]");
  const COL_A = header.indexOf("Acceleration [m/s2]");
  const COL_F = header.indexOf("Force [N]");
  const COL_P = header.indexOf("Power [W]");

  if (COL_T < 0 || COL_X < 0 || COL_V < 0) {
    throw new Error("Missing required time-series columns");
  }

  // The 1080 CSV groups reps using a column that counts up each rep
  // In your screenshot it's the FIRST column (index 0)
  const REP_COL = 0;

  const repMap: Record<number, {
    t: number[];
    x: number[];
    v: number[];
    a: number[];
    f: number[];
    p: number[];
  }> = {};

  // Parse time-series rows
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length) continue;

    const repIndex = parseInt(r[REP_COL], 10);
    if (!repIndex) continue;

    if (!repMap[repIndex]) {
      repMap[repIndex] = { t: [], x: [], v: [], a: [], f: [], p: [] };
    }

    const block = repMap[repIndex];

    const t = parseFloat(r[COL_T]);
    const x = parseFloat(r[COL_X]);
    const v = parseFloat(r[COL_V]);
    const a = COL_A >= 0 ? parseFloat(r[COL_A]) : NaN;
    const f = COL_F >= 0 ? parseFloat(r[COL_F]) : NaN;
    const p = COL_P >= 0 ? parseFloat(r[COL_P]) : NaN;

    if (!isNaN(t)) block.t.push(t);
    if (!isNaN(x)) block.x.push(x);
    if (!isNaN(v)) block.v.push(v);
    if (!isNaN(a)) block.a.push(a);
    if (!isNaN(f)) block.f.push(f);
    if (!isNaN(p)) block.p.push(p);
  }

  // Build output time-series array
  const timeSeries = Object.entries(repMap).map(([rep, data]) => ({
    repIndex: Number(rep),
    ...data,
  }));

  // Build simple summary from max reps
  const reps = timeSeries.map(r => ({
    repIndex: r.repIndex,
    peakSpeed: Math.max(...r.v),
    peakForce: Math.max(...r.f),
    peakPower: Math.max(...r.p),
    split5m: null,
    split10m: null,
    split20m: null,
  }));

  // Session summary → best rep
  const peakSpeed = reps.length ? Math.max(...reps.map(r => r.peakSpeed)) : null;

  return {
    testType: "1080_sprint",
    summary: {
      peakSpeed,
      peakForce: null,
      peakPower: null,
      split5m: null,
      split10m: null,
      split20m: null,
    },
    reps,
    timeSeries,
  };
}