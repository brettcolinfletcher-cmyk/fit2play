import { buildCmjDataPoints } from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import {
  buildLrDisplayRows,
  type SummaryMap,
} from "@/lib/metricsLrDisplay";
import {
  bucket,
  formatChartAxisDate,
  hopTestDisplayName,
  isLinearSprintSession,
  metricAggregate,
  sessionsChronological,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
export type MetricRowWithSide = ReportMetricRow & { side?: string | null };

function is1080(s: ReportSessionRow): boolean {
  return bucket(s.source) === "1080";
}

function is505Session(s: ReportSessionRow): boolean {
  return is1080(s) && (s.test_sub_type ?? "").toLowerCase().includes("5-10-5");
}

function latestSession(
  sessions: ReportSessionRow[],
  pred: (s: ReportSessionRow) => boolean
): ReportSessionRow | null {
  const list = sessionsChronological(sessions.filter(pred)).filter((s) => s.session_date);
  return list.length ? list[list.length - 1]! : null;
}

function buildSummaryMap(rows: MetricRowWithSide[]): SummaryMap {
  const m: SummaryMap = {};
  for (const row of rows) {
    if (row.rep_index != null) continue;
    if (row.value != null && typeof row.value === "number") m[row.key] = row.value;
  }
  return m;
}

function minTotalTimeForSide(
  rows: MetricRowWithSide[] | undefined,
  side: "left" | "right"
): number | null {
  if (!rows?.length) return null;
  const s = side.toLowerCase();
  const vals = rows
    .filter(
      (r) =>
        r.key === "total_time" &&
        r.value != null &&
        (r.side ?? "").toLowerCase() === s
    )
    .map((r) => r.value!);
  if (vals.length === 0) return null;
  return Math.min(...vals);
}

function lsiPct(left: number, right: number): number | null {
  const hi = Math.max(left, right);
  if (hi <= 0) return null;
  return Math.round((Math.min(left, right) / hi) * 1000) / 10;
}

export type PdfSprintSplitsChart = {
  title: string;
  dateCaption: string;
  unit: string;
  items: { label: string; value: number }[];
};

export type PdfCodChart = {
  title: string;
  dateCaption: string;
  unit: string;
  left: number;
  right: number;
  lsiPct: number | null;
};

export type PdfJumpChart =
  | {
      variant: "line";
      title: string;
      dateCaption: string;
      points: { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }[];
    }
  | {
      variant: "bar";
      title: string;
      dateCaption: string;
      jumpCm: number | null;
      rsi: number | null;
    };

export type PdfStrengthChart = {
  title: string;
  dateCaption: string;
  unit: string;
  pairs: { label: string; left: number; right: number; lsiPct: number | null }[];
};

export type PdfHopChart = {
  title: string;
  dateCaption: string;
  unit: string;
  pairs: { label: string; left: number; right: number; lsiPct: number | null }[];
};

export type PdfReportCharts = {
  rangeCaption: string;
  sprint: PdfSprintSplitsChart | null;
  cod: PdfCodChart | null;
  jump: PdfJumpChart | null;
  strength: PdfStrengthChart | null;
  hop: PdfHopChart | null;
};

export function buildPdfReportCharts(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, MetricRowWithSide[]>,
  hopTests: ReportHopTestRow[],
  rangeStart: string | null,
  rangeEnd: string | null
): PdfReportCharts {
  const metricsNorm = metricsBySession as Map<string, MetricRowWithSide[]>;

  const rangeCaption =
    rangeStart || rangeEnd
      ? `${rangeStart ?? "…"} – ${rangeEnd ?? "…"}`
      : "Full history";

  const linearLatest = latestSession(sessions, isLinearSprintSession);
  let sprint: PdfSprintSplitsChart | null = null;
  if (linearLatest) {
    const items: { label: string; value: number }[] = [];
    const defs = [
      { dist: 5, key: "split_5m_time" },
      { dist: 10, key: "split_10m_time" },
      { dist: 20, key: "split_20m_time" },
      { dist: 40, key: "split_40m_time" },
    ] as const;
    for (const d of defs) {
      const v = metricAggregate(
        metricsNorm as Map<string, ReportMetricRow[]>,
        linearLatest.id,
        d.key,
        "min"
      );
      if (v != null && Number.isFinite(v)) {
        items.push({ label: `${d.dist} m`, value: v });
      }
    }
    if (items.length > 0) {
      sprint = {
        title: "Sprint split times — latest session",
        dateCaption: linearLatest.session_date
          ? formatChartAxisDate(linearLatest.session_date)
          : "—",
        unit: "s",
        items,
      };
    }
  }

  let cod: PdfCodChart | null = null;
  const codLatest = latestSession(sessions, is505Session);
  if (codLatest) {
    const rows = metricsNorm.get(codLatest.id) ?? [];
    const left = minTotalTimeForSide(rows, "left");
    const right = minTotalTimeForSide(rows, "right");
    if (left != null && right != null) {
      cod = {
        title: "5-10-5 — latest session",
        dateCaption: codLatest.session_date
          ? formatChartAxisDate(codLatest.session_date)
          : "—",
        unit: "s",
        left,
        right,
        lsiPct: lsiPct(left, right),
      };
    }
  }

  const hawkinsCsv = sessionsChronological(
    sessions.filter((s) => (s.source ?? "").toLowerCase() === "hawkins_csv")
  );
  const cmjPts = buildCmjDataPoints(hawkinsCsv, metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>);
  const djPts = buildDjDataPoints(hawkinsCsv, metricsNorm as Map<string, { key: string; value: number | null; rep_index: number | null }[]>);

  const merged: { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }[] = [];
  const byT = new Map<number, { t: number; xLabel: string; jumpCm: number | null; rsi: number | null }>();
  for (const p of cmjPts) {
    const cur = byT.get(p.t) ?? {
      t: p.t,
      xLabel: p.date,
      jumpCm: null as number | null,
      rsi: null as number | null,
    };
    cur.jumpCm = p.jump_height;
    byT.set(p.t, cur);
  }
  for (const p of djPts) {
    const cur = byT.get(p.t) ?? {
      t: p.t,
      xLabel: p.date,
      jumpCm: null as number | null,
      rsi: null as number | null,
    };
    cur.rsi = p.rsi;
    byT.set(p.t, cur);
  }
  for (const v of byT.values()) merged.push(v);
  merged.sort((a, b) => a.t - b.t);

  let jump: PdfJumpChart | null = null;
  const withAny = merged.filter((p) => p.jumpCm != null || p.rsi != null);
  if (withAny.length >= 1) {
    jump = {
      variant: "line",
      title: "Jump performance over time",
      dateCaption: rangeCaption,
      points: withAny.map((p) => ({
        t: p.t,
        xLabel: p.xLabel,
        jumpCm: p.jumpCm,
        rsi: p.rsi,
      })),
    };
  }

  let strength: PdfStrengthChart | null = null;
  const dynoSessions = sessions
    .filter((s) => s.session_date)
    .sort((a, b) => {
      const ta = new Date(a.session_date!).getTime();
      const tb = new Date(b.session_date!).getTime();
      return tb - ta;
    });
  for (const s of dynoSessions) {
    const rows = metricsNorm.get(s.id) ?? [];
    if (!rows.some((r) => r.key.startsWith("dyno_"))) continue;
    const map = buildSummaryMap(rows);
    const lr = buildLrDisplayRows(map).filter((r) => r.left != null && r.right != null);
    if (lr.length === 0) continue;
    strength = {
      title: "Strength — latest session",
      dateCaption: s.session_date ? formatChartAxisDate(s.session_date) : "—",
      unit: "N",
      pairs: lr.map((r) => ({
        label: r.label,
        left: r.left!,
        right: r.right!,
        lsiPct:
          r.left != null && r.right != null ? lsiPct(r.left, r.right) : null,
      })),
    };
    break;
  }

  let hop: PdfHopChart | null = null;
  const byType = new Map<string, ReportHopTestRow[]>();
  for (const h of hopTests) {
    const list = byType.get(h.test_type) ?? [];
    list.push(h);
    byType.set(h.test_type, list);
  }
  const hopPairs: PdfHopChart["pairs"] = [];
  for (const [tt, rows] of byType) {
    const dates = [...new Set(rows.map((r) => r.session_date.slice(0, 10)))].sort(
      (a, b) => b.localeCompare(a)
    );
    const latestD = dates[0];
    if (!latestD) continue;
    const day = rows.filter((r) => r.session_date.slice(0, 10) === latestD);
    let left: number | null = null;
    let right: number | null = null;
    for (const r of day) {
      const sd = (r.side ?? "").toLowerCase();
      if (sd === "left") left = r.best_cm;
      if (sd === "right") right = r.best_cm;
    }
    if (left != null && right != null) {
      hopPairs.push({
        label: hopTestDisplayName(tt),
        left,
        right,
        lsiPct: lsiPct(left, right),
      });
    }
  }
  if (hopPairs.length > 0) {
    hop = {
      title: "Hop battery — latest session",
      dateCaption: rangeCaption,
      unit: "cm",
      pairs: hopPairs.sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  return {
    rangeCaption,
    sprint,
    cod,
    jump,
    strength,
    hop,
  };
}
