-- Clinician notes on sessions (safe if already present)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS clinician_notes text;

-- Hop tests (manual entry) + RLS
CREATE TABLE IF NOT EXISTS public.hop_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes (id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions (id) ON DELETE SET NULL,
  session_date date NOT NULL,
  test_type text NOT NULL,
  side text NOT NULL CHECK (side IN ('left', 'right')),
  trial_1_cm numeric,
  trial_2_cm numeric,
  trial_3_cm numeric,
  best_cm numeric GENERATED ALWAYS AS (
    (SELECT max(v) FROM unnest(ARRAY[trial_1_cm, trial_2_cm, trial_3_cm]) AS u (v))
  ) STORED,
  clinician_notes text,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hop_tests_athlete_date_type_side_unique UNIQUE (athlete_id, session_date, test_type, side)
);

CREATE INDEX IF NOT EXISTS hop_tests_athlete_id_idx ON public.hop_tests (athlete_id);
CREATE INDEX IF NOT EXISTS hop_tests_session_date_idx ON public.hop_tests (session_date DESC);

ALTER TABLE public.hop_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY hop_tests_staff_select ON public.hop_tests
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  );

CREATE POLICY hop_tests_staff_insert ON public.hop_tests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  );

CREATE POLICY hop_tests_staff_update ON public.hop_tests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  );

CREATE POLICY hop_tests_staff_delete ON public.hop_tests
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'staff')
  );
