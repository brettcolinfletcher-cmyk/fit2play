/**
 * Match a PlayerData athlete to a Fit2Play athlete by name (pure, tested).
 *
 * 1. Full name, exact after normalising (case, accents, punctuation).
 *    Several hits: date of birth decides if both sides have one.
 * 2. "First L" style names (PlayerData often shortens surnames): first name +
 *    surname initial, accepted only when date of birth also matches.
 * Anything else is left unmatched for staff to link by hand.
 */

export type MatchCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
};

export type MatchResult =
  | { athleteId: string; how: "full_name" | "full_name_dob" | "initial_dob" }
  | { athleteId: null; reason: string };

export function normaliseName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(c: MatchCandidate): string {
  return normaliseName(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
}

export function matchAthlete(
  name: string,
  dob: string | null,
  candidates: MatchCandidate[]
): MatchResult {
  const target = normaliseName(name);
  if (!target) return { athleteId: null, reason: "No name in PlayerData" };
  const dobDay = dob ? dob.slice(0, 10) : null;

  const exact = candidates.filter((c) => fullName(c) === target);
  if (exact.length === 1) return { athleteId: exact[0].id, how: "full_name" };
  if (exact.length > 1) {
    if (dobDay) {
      const byDob = exact.filter((c) => c.date_of_birth?.slice(0, 10) === dobDay);
      if (byDob.length === 1) return { athleteId: byDob[0].id, how: "full_name_dob" };
    }
    return { athleteId: null, reason: `${exact.length} athletes share this name` };
  }

  const parts = target.split(" ");
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last.length === 1) {
    const first = parts.slice(0, -1).join(" ");
    const initialHits = candidates.filter(
      (c) =>
        normaliseName(c.first_name ?? "") === first &&
        normaliseName(c.last_name ?? "").startsWith(last)
    );
    if (initialHits.length === 0) return { athleteId: null, reason: "No athlete with this name" };
    if (!dobDay) return { athleteId: null, reason: "Surname is an initial and no date of birth in PlayerData" };
    const byDob = initialHits.filter((c) => c.date_of_birth?.slice(0, 10) === dobDay);
    if (byDob.length === 1) return { athleteId: byDob[0].id, how: "initial_dob" };
    return { athleteId: null, reason: "Surname is an initial and date of birth did not confirm a match" };
  }

  return { athleteId: null, reason: "No athlete with this name" };
}
