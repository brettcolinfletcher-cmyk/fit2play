/**
 * Supabase caps a select at 1000 rows by default, and an unpaged select drops
 * the rest without an error. Page through in chunks until a short page comes
 * back. The query must have a stable order (add .order("id") as a tiebreak).
 *
 *   const { data, error } = await fetchAllRows((from, to) =>
 *     supabase.from("sessions").select("athlete_id, session_date").order("id").range(from, to)
 *   );
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}

/**
 * All metric rows for a set of sessions. Chunks the session ids (keeps the
 * request URL short) and pages each chunk, so athletes with thousands of
 * metric rows are not cut off at 1000. Same approach as loadAthleteReportData.
 */
export async function fetchMetricsForSessions<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from: (table: string) => any },
  sessionIds: string[],
  columns: string,
  chunkSize = 100
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize);
    const { data, error } = await fetchAllRows<T>((from, to) =>
      client.from("metrics").select(columns).in("session_id", chunk).order("id", { ascending: true }).range(from, to)
    );
    all.push(...data);
    if (error) return { data: all, error };
  }
  return { data: all, error: null };
}
