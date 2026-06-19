"use client";

import { useEffect, useMemo, useState } from "react";
import { hopTestDisplayName, type ReportHopTestRow } from "@/lib/athleteReportData";
import {
  REPORT_SECTIONS,
  normaliseSubType,
  parseHhdMovement,
  type CriteriaResolver,
  type ReportVisibility,
} from "@/lib/reportSections";

export type ReportBuilderSession = {
  id: string;
  source: string | null;
  test_type: string | null;
  test_sub_type: string | null;
};

type Props = {
  sessions: ReportBuilderSession[];
  visibility: ReportVisibility;
  criteria: CriteriaResolver;
  hopTests: ReportHopTestRow[];
  onToggle: (section: string, subKey: string, visible: boolean) => void;
  onSetCriterion: (section: string, subKey: string, isCriterion: boolean) => void;
  onSetCutoff: (section: string, subKey: string, lsiPass: number | null) => void;
  onSetClinicDefault: (
    section: string,
    subKey: string,
    lsiPass: number,
    isCriterion: boolean
  ) => void;
};

const CHECKBOX_CLASS =
  "h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-lime-400";

function distinctSubKeys(
  sessions: ReportBuilderSession[],
  derive: (session: ReportBuilderSession) => string | null
): string[] {
  const seen = new Map<string, string>();
  for (const session of sessions) {
    const subKey = derive(session);
    if (!subKey) continue;
    const lower = subKey.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, subKey);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function subTestsForSection(
  sessions: ReportBuilderSession[],
  sectionKey: string
): string[] {
  switch (sectionKey) {
    case "linear":
      return distinctSubKeys(sessions, (s) => {
        if ((s.source ?? "").toLowerCase() !== "1080") return null;
        const subKey = normaliseSubType(s.test_sub_type);
        const lower = subKey.toLowerCase();
        if (
          lower.includes("5-10-5") ||
          lower.includes("5-0-5") ||
          lower.includes("shuttle")
        ) {
          return null;
        }
        return subKey || null;
      });
    case "cod":
      return distinctSubKeys(sessions, (s) => {
        if ((s.source ?? "").toLowerCase() !== "1080") return null;
        const subKey = normaliseSubType(s.test_sub_type);
        if (!subKey.toLowerCase().includes("5-10-5")) return null;
        return subKey;
      });
    case "dynamometry":
      return distinctSubKeys(sessions, (s) => {
        if (s.test_type !== "force_plate_isometric") return null;
        const subKey = parseHhdMovement(s.test_sub_type);
        return subKey || null;
      });
    default:
      return [];
  }
}

const SOURCE_LABELS: Record<"1080" | "hawkins" | "mixed", string> = {
  "1080": "1080",
  hawkins: "Hawkins",
  mixed: "Mixed",
};

type CriterionControlsProps = {
  section: string;
  subKey: string;
  enabled: boolean;
  criteria: CriteriaResolver;
  onSetCriterion: (section: string, subKey: string, isCriterion: boolean) => void;
  onSetCutoff: (section: string, subKey: string, lsiPass: number | null) => void;
  onSetClinicDefault: (
    section: string,
    subKey: string,
    lsiPass: number,
    isCriterion: boolean
  ) => void;
};

function CriterionControls({
  section,
  subKey,
  enabled,
  criteria,
  onSetCriterion,
  onSetCutoff,
  onSetClinicDefault,
}: CriterionControlsProps) {
  const passCutoff = criteria.passCutoff(section, subKey);
  const [passInput, setPassInput] = useState(String(passCutoff));

  useEffect(() => {
    setPassInput(String(criteria.passCutoff(section, subKey)));
  }, [criteria, section, subKey, passCutoff]);

  const commitCutoff = () => {
    onSetCutoff(
      section,
      subKey,
      passInput.trim() === "" ? null : Number(passInput)
    );
  };

  const isCriterion = criteria.isCriterion(section, subKey);

  return (
    <div
      className={`ml-auto flex shrink-0 flex-wrap items-center gap-2 ${enabled ? "" : "pointer-events-none opacity-40"}`}
    >
      <label className="flex cursor-pointer items-center gap-1">
        <input
          type="checkbox"
          checked={isCriterion}
          disabled={!enabled}
          onChange={() => onSetCriterion(section, subKey, !isCriterion)}
          className={CHECKBOX_CLASS}
        />
        <span className="text-[10px] text-slate-500">Criterion</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-[10px] text-slate-500">pass %</span>
        <input
          type="number"
          value={passInput}
          disabled={!enabled}
          onChange={(e) => setPassInput(e.target.value)}
          onBlur={commitCutoff}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitCutoff();
          }}
          className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-200"
        />
      </label>
      <button
        type="button"
        disabled={!enabled}
        onClick={() =>
          onSetClinicDefault(
            section,
            subKey,
            criteria.passCutoff(section, subKey),
            criteria.isCriterion(section, subKey)
          )
        }
        className="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-40"
      >
        set default
      </button>
    </div>
  );
}

export default function ReportBuilder({
  sessions,
  visibility,
  criteria,
  hopTests,
  onToggle,
  onSetCriterion,
  onSetCutoff,
  onSetClinicDefault,
}: Props) {
  const [open, setOpen] = useState(false);

  const subTestsBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const section of REPORT_SECTIONS) {
      const subTests = subTestsForSection(sessions, section.key);
      if (subTests.length > 0) map.set(section.key, subTests);
    }
    return map;
  }, [sessions]);

  const hopTypes = useMemo(() => {
    const seen = new Set<string>();
    const types: string[] = [];
    for (const row of hopTests) {
      if (!seen.has(row.test_type)) {
        seen.add(row.test_type);
        types.push(row.test_type);
      }
    }
    return types.sort();
  }, [hopTests]);

  const visibleFamilyCount = REPORT_SECTIONS.filter((s) =>
    visibility.isSectionVisible(s.key)
  ).length;

  const criterionProps = {
    criteria,
    onSetCriterion,
    onSetCutoff,
    onSetClinicDefault,
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-lime-300">
            Report builder
          </span>
          <span className="text-xs text-slate-500">choose what this athlete sees</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          <span>
            {visibleFamilyCount} of {REPORT_SECTIONS.length} shown
          </span>
          <span aria-hidden>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
          {REPORT_SECTIONS.map((section) => {
            const sectionVisible = visibility.isSectionVisible(section.key);
            const subTests = subTestsBySection.get(section.key) ?? [];

            return (
              <div key={section.key}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={sectionVisible}
                      onChange={(e) =>
                        onToggle(section.key, "", e.target.checked)
                      }
                      className={CHECKBOX_CLASS}
                    />
                    <span className="text-sm text-slate-200">{section.label}</span>
                    <span className="rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                      {SOURCE_LABELS[section.source]}
                    </span>
                  </label>
                  {["cmj", "drop_jump", "drop_jump_single"].includes(section.key) ? (
                    <CriterionControls
                      section={section.key}
                      subKey=""
                      enabled={sectionVisible}
                      {...criterionProps}
                    />
                  ) : null}
                </div>

                {sectionVisible && subTests.length > 0 ? (
                  <div className="ml-6 mt-2 space-y-1">
                    {subTests.map((subKey) => (
                      <div
                        key={subKey}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={visibility.isSubtestVisible(section.key, subKey)}
                            onChange={(e) =>
                              onToggle(section.key, subKey, e.target.checked)
                            }
                            className={CHECKBOX_CLASS}
                          />
                          <span className="text-xs text-slate-300">{subKey}</span>
                        </label>
                        {section.key === "dynamometry" ? (
                          <CriterionControls
                            section="dynamometry"
                            subKey={subKey}
                            enabled={sectionVisible}
                            {...criterionProps}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {section.key === "hop_tests" && sectionVisible && hopTypes.length > 0 ? (
                  <div className="ml-6 mt-2 space-y-1">
                    {hopTypes.map((testType) => (
                      <div
                        key={testType}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={visibility.isSubtestVisible("hop_tests", testType)}
                            onChange={(e) =>
                              onToggle("hop_tests", testType, e.target.checked)
                            }
                            className={CHECKBOX_CLASS}
                          />
                          <span className="text-xs text-slate-300">
                            {hopTestDisplayName(testType)}
                          </span>
                        </label>
                        <CriterionControls
                          section="hop_tests"
                          subKey={testType}
                          enabled={sectionVisible}
                          {...criterionProps}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
