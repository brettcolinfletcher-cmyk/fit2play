# Metric keys

## Canonical keys in `metrics.key`

Dashboard charts, comparison, PDF builders, and sync paths expect **canonical** snake_case keys. Do not write camelCase CSV column names to the database.

## 1080 sprint — CSV / form → database

Manual upload forms send field names that match 1080 CSV column headers. Translation happens **at write time** in the API routes below (not on read).

| CSV / form field | DB key (`metrics.key`) |
|------------------|------------------------|
| `peakSpeed`      | `top_speed`            |
| `peakForce`      | `peak_force`           |
| `peakPower`      | `peak_power`           |
| `split5m`        | `split_5m_time`        |
| `split10m`       | `split_10m_time`       |
| `split20m`       | `split_20m_time`       |

### Write paths

- `app/api/upload-1080/route.ts` — staff upload (`collectMetricRows` + legacy flat `metrics` payload)
- `app/api/upload/1080/route.ts` — sync/automation upload (`sets[]` objects keyed by CSV field names)

### Already canonical (no remap on read)

- `lib/sync/motion1080Sync.ts` — 1080 Motion API sync writes canonical keys directly

## Read paths

Query `metrics` and use keys as stored. **Do not** add read-side alias maps; production data uses canonical keys only.

## Out of scope for this document

- `lib/parse1080Csv.ts` / `lib/load1080.ts` — CSV parsing column names (upstream of upload routes)
- Force plate / Hawkins keys — see upload normalizers and `lib/uploadForceplateNormalize.ts`
- Hop tests — `hop_tests` table, not `metrics.key`
