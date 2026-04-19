CREATE TABLE IF NOT EXISTS public.athlete_section_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes (id) ON DELETE CASCADE,
  section text NOT NULL,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id),
  CONSTRAINT athlete_section_comments_athlete_section_unique UNIQUE (athlete_id, section)
);

CREATE INDEX IF NOT EXISTS athlete_section_comments_athlete_id_idx
  ON public.athlete_section_comments (athlete_id);

ALTER TABLE public.athlete_section_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage section comments"
  ON public.athlete_section_comments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    )
  );
