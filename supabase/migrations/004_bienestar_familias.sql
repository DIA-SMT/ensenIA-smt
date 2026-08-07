-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 004: Bienestar, observaciones,
--  devoluciones rápidas y portal de familias
-- ═══════════════════════════════════════════════

-- ── Check-in emocional del estudiante ──
-- Cómo llega y cómo se va de cada actividad.
CREATE TABLE student_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  moment TEXT NOT NULL CHECK (moment IN ('inicio', 'fin')),
  feeling TEXT NOT NULL CHECK (feeling IN ('genial', 'bien', 'neutral', 'confundido', 'frustrado')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checkins_student ON student_checkins(student_id, created_at DESC);
CREATE INDEX idx_checkins_activity ON student_checkins(activity_id);

-- ── Observaciones del docente (la info que no se ve) ──
CREATE TABLE student_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('logro', 'dificultad', 'participacion', 'conducta', 'familia', 'otro')),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_observations_student ON student_observations(student_id, created_at DESC);
CREATE INDEX idx_observations_teacher ON student_observations(teacher_id);

-- ── Devolución rápida sobre entregas ──
ALTER TABLE activity_submissions
  ADD COLUMN IF NOT EXISTS feedback_reaction TEXT;

-- ── Familias ──
CREATE TABLE student_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'tutor',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, guardian_user_id)
);

CREATE INDEX idx_guardians_student ON student_guardians(student_id);
CREATE INDEX idx_guardians_user ON student_guardians(guardian_user_id);

-- Comunicados oficiales y citaciones a familias.
-- student_id NULL = comunicado general (todas las familias de la escuela).
CREATE TABLE guardian_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('comunicado', 'citacion')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  meeting_at TIMESTAMPTZ,
  meeting_place TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notices_school ON guardian_notices(school_id, created_at DESC);
CREATE INDEX idx_notices_student ON guardian_notices(student_id);

-- Acuse de recibo / respuesta a citaciones por tutor
CREATE TABLE guardian_notice_receipts (
  notice_id UUID NOT NULL REFERENCES guardian_notices(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  response TEXT CHECK (response IN ('asistire', 'no_puedo')),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (notice_id, guardian_user_id)
);

-- Helper RLS: ids de estudiantes a cargo del tutor logueado
CREATE OR REPLACE FUNCTION auth_guardian_student_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT student_id FROM student_guardians WHERE guardian_user_id = auth.uid()
$$;

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════

-- Check-ins
ALTER TABLE student_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own checkins"
  ON student_checkins FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id());

CREATE POLICY "Teachers view checkins of their activities"
  ON student_checkins FOR SELECT
  USING (activity_id IN (SELECT id FROM activities WHERE teacher_id = auth.uid()));

CREATE POLICY "Teachers view checkins of their students"
  ON student_checkins FOR SELECT
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN teacher_assignments ta ON ta.course_id = s.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  );

-- Observaciones
ALTER TABLE student_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own observations"
  ON student_observations FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers view observations of their students"
  ON student_observations FOR SELECT
  USING (
    student_id IN (
      SELECT s.id FROM students s
      JOIN teacher_assignments ta ON ta.course_id = s.course_id
      WHERE ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Directors view school observations"
  ON student_observations FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

-- Tutores: ven la ficha de sus hijos
CREATE POLICY "Guardians see their students"
  ON students FOR SELECT
  USING (id IN (SELECT auth_guardian_student_ids()));

-- Vínculos familia-estudiante
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians see own links"
  ON student_guardians FOR SELECT
  USING (guardian_user_id = auth.uid());

CREATE POLICY "Staff see links in school"
  ON student_guardians FOR SELECT
  USING (
    auth_role() IN ('director', 'docente')
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

-- Comunicados / citaciones
ALTER TABLE guardian_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians see notices for their students or school-wide"
  ON guardian_notices FOR SELECT
  USING (
    school_id = auth_school_id()
    AND (
      student_id IS NULL
      OR student_id IN (SELECT auth_guardian_student_ids())
    )
    AND auth_role() = 'padre'
  );

CREATE POLICY "Staff manage notices in school"
  ON guardian_notices FOR ALL
  USING (auth_role() IN ('director', 'docente') AND school_id = auth_school_id())
  WITH CHECK (auth_role() IN ('director', 'docente') AND school_id = auth_school_id() AND from_user_id = auth.uid());

-- Acuses de recibo
ALTER TABLE guardian_notice_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians manage own receipts"
  ON guardian_notice_receipts FOR ALL
  USING (guardian_user_id = auth.uid())
  WITH CHECK (guardian_user_id = auth.uid());

CREATE POLICY "Staff view receipts of school notices"
  ON guardian_notice_receipts FOR SELECT
  USING (
    notice_id IN (SELECT id FROM guardian_notices WHERE school_id = auth_school_id())
    AND auth_role() IN ('director', 'docente')
  );
