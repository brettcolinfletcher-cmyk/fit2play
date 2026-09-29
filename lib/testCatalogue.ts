// Test catalogue for testing protocols (Bronze / Silver / Gold).
// test_key values here match protocol_tests.test_key and
// athlete_protocol_overrides.test_key in Supabase.

export type TestKey =
  | "cmj"
  | "broad_jump"
  | "sl_hop_distance"
  | "adductor_squeeze"
  | "abductor_squeeze"
  | "iso_hamstring"
  | "cod_505"
  | "sprint_40m";

export type TestSource = "hawkins" | "1080" | "hop_tests";

export type CatalogueTest = {
  key: TestKey;
  label: string;
  source: TestSource;
  /** Options a protocol can switch on for this test, e.g. symmetry report. */
  options?: { key: string; label: string }[];
};

export const TEST_CATALOGUE: CatalogueTest[] = [
  {
    key: "cmj",
    label: "Counter movement jump",
    source: "hawkins",
    options: [
      { key: "concentric_peak_force", label: "Concentric peak force" },
      { key: "symmetry", label: "Symmetry report" },
    ],
  },
  { key: "broad_jump", label: "Broad jump", source: "hop_tests" },
  { key: "sl_hop_distance", label: "Single leg hop for distance", source: "hop_tests" },
  { key: "adductor_squeeze", label: "Adductor isometric squeeze (60° hip flexion)", source: "hawkins" },
  { key: "abductor_squeeze", label: "Abductor isometric squeeze", source: "hawkins" },
  { key: "iso_hamstring", label: "Isometric hamstring", source: "hawkins" },
  { key: "cod_505", label: "5-0-5 COD test", source: "1080" },
  {
    key: "sprint_40m",
    label: "40m sprint",
    source: "1080",
    options: [{ key: "symmetry", label: "Symmetry report" }],
  },
];

export const TEST_BY_KEY: Record<TestKey, CatalogueTest> = Object.fromEntries(
  TEST_CATALOGUE.map((t) => [t.key, t])
) as Record<TestKey, CatalogueTest>;

// ── Speed dials ────────────────────────────────────────────────────────────
// metric values match athlete_cohort_ranks() RPC output.

export type DialMetric = "max_speed" | "acceleration" | "deceleration" | "cod" | "jump_height";

export type DialDef = {
  metric: DialMetric;
  label: string;
  unit: string;
  decimals: number;
  /** Dial only shows when this test is in the athlete's resolved protocol. */
  testKey: TestKey;
};

export const DIALS: DialDef[] = [
  { metric: "max_speed", label: "Max speed", unit: "km/h", decimals: 1, testKey: "sprint_40m" },
  { metric: "acceleration", label: "Acceleration", unit: "m/s²", decimals: 1, testKey: "sprint_40m" },
  { metric: "deceleration", label: "Deceleration", unit: "m/s²", decimals: 1, testKey: "cod_505" },
  { metric: "cod", label: "5-0-5 COD", unit: "s", decimals: 2, testKey: "cod_505" },
  { metric: "jump_height", label: "Jump height", unit: "cm", decimals: 1, testKey: "cmj" },
];
