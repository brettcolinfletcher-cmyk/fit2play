"use client";

import AthleteAvatar from "@/components/AthleteAvatar";

export type AthleteIdentity = {
  first_name: string | null;
  last_name: string | null;
  primary_sport?: string | null;
  team?: string | null;
  status?: string | null;
  notes?: string | null;
  dominant_leg?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  dominant_hand?: string | null;
  profile_image_url?: string | null;
};

function displayName(athlete: AthleteIdentity | null): string {
  if (!athlete) return "Athlete";
  const name = `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim();
  return name || "Athlete";
}

function statusPillClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "monitoring") {
    return "border-amber-400/60 bg-amber-50 text-amber-700";
  }
  if (s === "archived") {
    return "border-slate-300 bg-slate-100 text-slate-500";
  }
  return "border-lime-500/50 bg-lime-50 text-lime-700";
}

type Props = {
  athlete: AthleteIdentity | null;
  /** e.g. "last tested 12/06/2026" — appended to the meta line if provided */
  lastTested?: string | null;
  /** Extra line shown below the meta row (RTP mode uses this for "Cleared on X of Y exit criteria") */
  footer?: React.ReactNode;
};

/**
 * White identity card at the top of the athlete profile — avatar, name,
 * status pill, sport/team/anthropometrics, notes. Shared by both dashboard
 * modes (RTP and Performance) so the page header looks identical regardless
 * of which score panel follows it below.
 */
export default function AthleteIdentityCard({ athlete, lastTested, footer }: Props) {
  const metaParts = [
    athlete?.primary_sport,
    athlete?.team,
    athlete?.status,
    athlete?.height_cm != null ? `${athlete.height_cm} cm` : null,
    athlete?.weight_kg != null ? `${athlete.weight_kg} kg` : null,
    athlete?.dominant_leg || athlete?.dominant_hand
      ? `dom ${athlete.dominant_leg ?? "—"}/${athlete.dominant_hand ?? "—"}`
      : null,
    lastTested ? `last tested ${lastTested}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start gap-4">
        <AthleteAvatar
          url={athlete?.profile_image_url}
          firstName={athlete?.first_name}
          lastName={athlete?.last_name}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">{displayName(athlete)}</h2>
            {athlete?.status ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusPillClass(athlete.status)}`}
              >
                {athlete.status}
              </span>
            ) : null}
          </div>
          {metaParts.length > 0 ? (
            <p className="mt-1 text-sm text-slate-500">{metaParts.join(" · ")}</p>
          ) : null}
          {athlete?.notes?.trim() ? (
            <p className="mt-2 text-sm text-slate-600">{athlete.notes.trim()}</p>
          ) : null}
        </div>
      </div>

      {footer ? <div className="mt-4 text-sm text-slate-500">{footer}</div> : null}
    </div>
  );
}
