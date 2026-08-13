import { buildCmjDataPoints, type MetricLite } from "@/components/athletes/ForcePlateCMJSection";
import { buildDjDataPoints } from "@/components/athletes/ForcePlateDJSection";
import {
  formatChartAxisDate,
  hopTestDisplayName,
  isLinearSprintSession,
  metricAggregate,
  type ReportHopTestRow,
  type ReportMetricRow,
  type ReportSessionRow,
} from "@/lib/athleteReportData";
import {
  normaliseSubType,
  parseHhdMovement,
  type CriteriaResolver,
  type ReportVisibility,
} from "@/lib/reportSections";

export type GaugeItem = {
  key: string;
  label: string;
  lsi: number;
  pass: number;
  warn: number;
  isCriterion: boolean;
  colorClass: string;
};

export type TileItem = {
  key: string;
  label: string;
  value: string;
  delta: string;
  deltaColorClass: string;
};

export type HeroSeries = {
  title: string;
  unit: string;
  points: { date: string; v: number }[];
};

export type AthleteSnapshot = {
  gauges: GaugeItem[];
  tiles: TileItem[];
  hero: HeroSeries | null;
  readiness: { pass: number; total: number; line: string };
  lastTested: string | null;
};

function lsi(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const max = Math.max(a, b);
  if (max <= 0) return null;
  return Math.round((Math.min(a, b) / max) * 1000) / 10;
}

function is1080Source(source: string | null): boolean {
  const s = (source ?? "").toLowerCase();
  return s === "1080" || s === "1080_csv";
}

function is505(s: ReportSessionRow): boolean {
  const sub = normaliseSubType(s.test_sub_type).toLowerCase();
  return (
    is1080Source(s.source) &&
    (sub.includes("5-10-5") || sub.includes("5-0-5"))
  );
}

function sortChronological(sess: ReportSessionRow[]): ReportSessionRow[] {
  return [...sess].sort((a, b) => {
    const ta = a.session_date ? new Date(a.session_date).getTime() : 0;
    const tb = b.session_date ? new Date(b.session_date).getTime() : 0;
    return ta - tb;
  });
}

function latestSessionOf(
  sessions: ReportSessionRow[],
  predicate: (s: ReportSessionRow) => boolean
): ReportSessionRow | null {
  let best: ReportSessionRow | null = null;
  let bestTime = -Infinity;
  for (const s of sessions) {
    if (!predicate(s) || !s.session_date) continue;
    const t = new Date(s.session_date).getTime();
    if (t >= bestTime) {
      bestTime = t;
      best = s;
    }
  }
  return best;
}

function maxKey(rows: ReportMetricRow[], key: string): number | null {
  let max: number | null = null;
  for (const r of rows) {
    if (r.key !== key) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    max = max == null ? v : Math.max(max, v);
  }
  return max;
}

function dateKey(iso: string | null | undefined): string {
  return iso?.slice(0, 10) ?? "";
}

function makeDelta(
  current: number,
  previous: number | null,
  decimals: number,
  higherIsBetter = true
): Pick<TileItem, "delta" | "deltaColorClass"> {
  if (previous == null || !Number.isFinite(previous)) {
    return { delta: "—", deltaColorClass: "text-slate-500" };
  }
  const diff = current - previous;
  if (Math.abs(diff) < 1e-9) {
    return { delta: "—", deltaColorClass: "text-slate-500" };
  }
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const sign = diff > 0 ? "+" : "";
  const arrow = improved ? "▲" : "▼";
  return {
    delta: `${arrow} ${sign}${diff.toFixed(decimals)}`,
    deltaColorClass: improved ? "text-lime-400" : "text-rose-400",
  };
}

function hhdLsiForMovementOnDate(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  movement: string,
  onDate: string
): number | null {
  const matching = sessions.filter(
    (s) =>
      s.test_type === "force_plate_isometric" &&
      parseHhdMovement(s.test_sub_type) === movement &&
      dateKey(s.session_date) === onDate
  );

  let maxLeft: number | null = null;
  let maxRight: number | null = null;
  for (const s of matching) {
    const rows = metricsBySession.get(s.id) ?? [];
    for (const r of rows) {
      if (r.key !== "peak_force") continue;
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      const side = (r.side ?? "").toLowerCase();
      if (side === "left") maxLeft = maxLeft == null ? v : Math.max(maxLeft, v);
      if (side === "right") maxRight = maxRight == null ? v : Math.max(maxRight, v);
    }
  }
  return lsi(maxLeft, maxRight);
}

function hawkinsCsvSessions(sessions: ReportSessionRow[]): ReportSessionRow[] {
  return sessions.filter((s) => (s.source ?? "").toLowerCase() === "hawkins_csv");
}

function gaugeColorClass(lsi: number, pass: number, warn: number): string {
  // These labels render inside the dark f2p-dark-panel gauge grid, so use the
  // lighter 400-weight variants (matching the homepage DashboardShowcase
  // mockup's ring colours) rather than the 600-weight variants meant for
  // text on a white background — those read as murky/low-contrast on navy.
  if (lsi >= pass) return "text-lime-400";
  if (lsi >= warn) return "text-amber-400";
  return "text-rose-400";
}

function makeGauge(
  base: { key: string; label: string; lsi: number },
  section: string,
  subKey: string,
  criteria: CriteriaResolver
): GaugeItem {
  const pass = criteria.passCutoff(section, subKey);
  const warn = criteria.warnCutoff(section, subKey);
  const isCriterion = criteria.isCriterion(section, subKey);
  return {
    ...base,
    pass,
    warn,
    isCriterion,
    colorClass: gaugeColorClass(base.lsi, pass, warn),
  };
}

export function computeAthleteSnapshot(
  sessions: ReportSessionRow[],
  metricsBySession: Map<string, ReportMetricRow[]>,
  hopTests: ReportHopTestRow[],
  visibility: ReportVisibility,
  criteria: CriteriaResolver
): AthleteSnapshot {
  const metricsLite = metricsBySession as unknown as Map<string, MetricLite[]>;
  const gauges: GaugeItem[] = [];
  const hhdMovementDates = new Map<string, string[]>();

  if (visibility.isSectionVisible("cmj")) {
    const latestCmj = latestSessionOf(
      sessions,
      (s) =>
        (s.source ?? "").toLowerCase() === "hawkins_csv" &&
        s.test_type === "force_plate_cmj"
    );
    if (latestCmj) {
      const rows = metricsBySession.get(latestCmj.id) ?? [];
      const left = maxKey(rows, "fp_left_avg_propulsive_force");
      const right = maxKey(rows, "fp_right_avg_propulsive_force");
      const cmjLsi = lsi(left, right);
      if (cmjLsi != null) {
        gauges.push(
          makeGauge(
            { key: "cmj_prop", label: "CMJ propulsive", lsi: cmjLsi },
            "cmj",
            "",
            criteria
          )
        );
      }
    }
  }

  if (visibility.isSectionVisible("drop_jump")) {
    const latestDj = latestSessionOf(
      sessions,
      (s) =>
        (s.source ?? "").toLowerCase() === "hawkins_csv" &&
        s.test_type === "force_plate_dj"
    );
    if (latestDj) {
      const rows = metricsBySession.get(latestDj.id) ?? [];
      const left = maxKey(rows, "fp_left_avg_landing_force");
      const right = maxKey(rows, "fp_right_avg_landing_force");
      const djLsi = lsi(left, right);
      if (djLsi != null) {
        gauges.push(
          makeGauge(
            { key: "dj_landing", label: "DJ landing", lsi: djLsi },
            "drop_jump",
            "",
            criteria
          )
        );
      }
    }
  }

  if (visibility.isSectionVisible("drop_jump_single")) {
    const latestSldj = latestSessionOf(
      sessions,
      (s) =>
        (s.source ?? "").toLowerCase() === "hawkins_csv" &&
        s.test_type === "force_plate_dj_single"
    );
    if (latestSldj) {
      const rows = metricsBySession.get(latestSldj.id) ?? [];
      let slLeft: number | null = null;
      let slRight: number | null = null;
      for (const r of rows) {
        if (r.key !== "fp_rsi_best") continue;
        const v = Number(r.value);
        if (!Number.isFinite(v)) continue;
        const side = (r.side ?? "").toLowerCase();
        if (side === "left") slLeft = slLeft == null ? v : Math.max(slLeft, v);
        if (side === "right") slRight = slRight == null ? v : Math.max(slRight, v);
      }
      const slLsi = lsi(slLeft, slRight);
      if (slLsi != null) {
        gauges.push(
          makeGauge(
            { key: "sldj_rsi", label: "SL-DJ RSI", lsi: slLsi },
            "drop_jump_single",
            "",
            criteria
          )
        );
      }
    }
  }

  if (visibility.isSectionVisible("dynamometry")) {
    const isoSessions = sessions.filter((s) => s.test_type === "force_plate_isometric");
    const byMovement = new Map<string, ReportSessionRow[]>();
    for (const s of isoSessions) {
      const movement = parseHhdMovement(s.test_sub_type);
      if (!movement) continue;
      const list = byMovement.get(movement) ?? [];
      list.push(s);
      byMovement.set(movement, list);
    }

    for (const [movement, movementSessions] of byMovement) {
      if (!visibility.isSubtestVisible("dynamometry", movement)) continue;

      const dated = movementSessions
        .filter((s) => s.session_date)
        .sort(
          (a, b) =>
            new Date(b.session_date!).getTime() - new Date(a.session_date!).getTime()
        );
      if (dated.length === 0) continue;

      const latestDate = dateKey(dated[0]!.session_date);
      const dates = Array.from(
        new Set(dated.map((s) => dateKey(s.session_date)))
      ).sort();
      hhdMovementDates.set(movement, dates);

      const movementLsi = hhdLsiForMovementOnDate(
        sessions,
        metricsBySession,
        movement,
        latestDate
      );
      if (movementLsi != null) {
        gauges.push(
          makeGauge(
            { key: `hhd_${movement}`, label: movement, lsi: movementLsi },
            "dynamometry",
            movement,
            criteria
          )
        );
      }
    }
  }

  if (visibility.isSectionVisible("hop_tests")) {
    const byType = new Map<string, ReportHopTestRow[]>();
    for (const row of hopTests) {
      const list = byType.get(row.test_type) ?? [];
      list.push(row);
      byType.set(row.test_type, list);
    }

    for (const [testType, rows] of byType) {
      const latestDate = rows
        .map((r) => r.session_date)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      if (!latestDate) continue;

      const onDate = rows.filter((r) => r.session_date === latestDate);
      const left = onDate.find((r) => r.side.toLowerCase() === "left")?.best_cm ?? null;
      const right = onDate.find((r) => r.side.toLowerCase() === "right")?.best_cm ?? null;
      const hopLsi = lsi(left, right);
      if (hopLsi != null) {
        gauges.push(
          makeGauge(
            {
              key: `hop_${testType}`,
              label: hopTestDisplayName(testType),
              lsi: hopLsi,
            },
            "hop_tests",
            testType,
            criteria
          )
        );
      }
    }
  }

  gauges.sort((a, b) => a.lsi - b.lsi);

  const crit = gauges.filter((g) => g.isCriterion);
  const pass = crit.filter((g) => g.lsi >= g.pass).length;
  const total = crit.length;
  const readiness = {
    pass,
    total,
    line:
      total === 0
        ? "No exit criteria selected."
        : `Cleared on ${pass} of ${total} exit criteria.`,
  };

  const tiles: TileItem[] = [];

  if (visibility.isSectionVisible("linear")) {
    const linearSessions = sortChronological(
      sessions.filter(
        (s) =>
          isLinearSprintSession(s) &&
          visibility.isSubtestVisible("linear", s.test_sub_type ?? "")
      )
    );
    const latest = linearSessions[linearSessions.length - 1];
    const prev = linearSessions[linearSessions.length - 2];
    if (latest) {
      const current = metricAggregate(metricsBySession, latest.id, "top_speed", "max");
      const previous = prev
        ? metricAggregate(metricsBySession, prev.id, "top_speed", "max")
        : null;
      if (current != null) {
        tiles.push({
          key: "linear",
          label: "Linear sprint",
          value: `${current.toFixed(2)} m/s`,
          ...makeDelta(current, previous, 2),
        });
      }
    }
  }

  if (visibility.isSectionVisible("cod")) {
    const codSessions = sortChronological(
      sessions.filter(
        (s) =>
          is505(s) && visibility.isSubtestVisible("cod", s.test_sub_type ?? "")
      )
    );
    const latest = codSessions[codSessions.length - 1];
    const prev = codSessions[codSessions.length - 2];
    if (latest) {
      const current = metricAggregate(metricsBySession, latest.id, "top_speed", "max");
      const previous = prev
        ? metricAggregate(metricsBySession, prev.id, "top_speed", "max")
        : null;
      if (current != null) {
        tiles.push({
          key: "cod",
          label: "COD 5-10-5",
          value: `${current.toFixed(2)} m/s`,
          ...makeDelta(current, previous, 2),
        });
      }
    }
  }

  if (visibility.isSectionVisible("cmj")) {
    const cmjPoints = buildCmjDataPoints(hawkinsCsvSessions(sessions), metricsLite);
    const latest = cmjPoints[cmjPoints.length - 1];
    const prev = cmjPoints[cmjPoints.length - 2];
    if (latest?.jump_height != null) {
      tiles.push({
        key: "cmj",
        label: "CMJ",
        value: `${latest.jump_height.toFixed(1)} cm`,
        ...makeDelta(
          latest.jump_height,
          prev?.jump_height ?? null,
          1
        ),
      });
    }
  }

  if (visibility.isSectionVisible("drop_jump")) {
    const djPoints = buildDjDataPoints(hawkinsCsvSessions(sessions), metricsLite);
    const latest = djPoints[djPoints.length - 1];
    const prev = djPoints[djPoints.length - 2];
    if (latest?.rsi != null) {
      tiles.push({
        key: "drop_jump",
        label: "Drop jump",
        value: latest.rsi.toFixed(3),
        ...makeDelta(latest.rsi, prev?.rsi ?? null, 3),
      });
    }
  }

  const hhdGauges = gauges.filter((g) => g.key.startsWith("hhd_"));
  if (visibility.isSectionVisible("dynamometry") && hhdGauges.length > 0) {
    const worst = hhdGauges[0]!;
    const movement = worst.label;
    const dates = hhdMovementDates.get(movement) ?? [];
    const latestDate = dates[dates.length - 1];
    const prevDate = dates.length >= 2 ? dates[dates.length - 2] : undefined;
    const prevLsi =
      prevDate != null
        ? hhdLsiForMovementOnDate(sessions, metricsBySession, movement, prevDate)
        : null;
    tiles.push({
      key: "dynamometry",
      label: "Strength (HHD)",
      value: `${worst.lsi.toFixed(0)}% LSI`,
      ...makeDelta(worst.lsi, prevLsi, 0),
    });
  }

  const hopGauges = gauges.filter((g) => g.key.startsWith("hop_"));
  if (visibility.isSectionVisible("hop_tests") && hopGauges.length > 0) {
    const worst = hopGauges[0]!;
    tiles.push({
      key: "hop_tests",
      label: "Hop tests",
      value: `${worst.lsi.toFixed(0)}% LSI`,
      delta: "—",
      deltaColorClass: "text-slate-500",
    });
  }

  let hero: HeroSeries | null = null;

  if (visibility.isSectionVisible("cmj")) {
    const cmjPoints = buildCmjDataPoints(hawkinsCsvSessions(sessions), metricsLite);
    const heroPoints = cmjPoints
      .filter((p) => p.jump_height != null)
      .map((p) => ({
        date: formatChartAxisDate(new Date(p.t).toISOString()),
        v: p.jump_height!,
      }));
    if (heroPoints.length >= 1) {
      hero = {
        title: "CMJ jump height",
        unit: "cm",
        points: heroPoints,
      };
    }
  }

  if (!hero && visibility.isSectionVisible("linear")) {
    const linearSessions = sortChronological(
      sessions.filter(
        (s) =>
          isLinearSprintSession(s) &&
          visibility.isSubtestVisible("linear", s.test_sub_type ?? "")
      )
    );
    const heroPoints: { date: string; v: number }[] = [];
    for (const s of linearSessions) {
      if (!s.session_date) continue;
      const v = metricAggregate(metricsBySession, s.id, "top_speed", "max");
      if (v == null) continue;
      heroPoints.push({
        date: formatChartAxisDate(s.session_date),
        v,
      });
    }
    if (heroPoints.length >= 1) {
      hero = {
        title: "Sprint top speed",
        unit: "m/s",
        points: heroPoints,
      };
    }
  }

  let lastTested: string | null = null;
  let maxDate = -Infinity;
  for (const s of sessions) {
    if (!s.session_date) continue;
    const t = new Date(s.session_date).getTime();
    if (t > maxDate) {
      maxDate = t;
      lastTested = formatChartAxisDate(s.session_date);
    }
  }

  return { gauges, tiles, hero, readiness, lastTested };
}
