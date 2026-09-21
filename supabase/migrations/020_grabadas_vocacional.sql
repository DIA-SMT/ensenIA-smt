-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 020: clases grabadas y orientación vocacional
--
--  Últimos dos pedidos de la reunión del 26/8: "clases grabadas" y
--  "orientación vocacional. Completar".
--
--  CLASES GRABADAS
--  La escuela no aloja video: sube a YouTube, Drive o Meet y pega el
--  link. La grabación cuelga de la materia+curso y, si se quiere, de la
--  unidad del temario — así el estudiante la encuentra donde busca el
--  tema, no en una lista suelta.
--
--  ORIENTACIÓN VOCACIONAL
--  Un perfil por estudiante que él mismo completa y puede rehacer. No es
--  un test que "da" una carrera: junta intereses declarados y deja un
--  resumen para conversar con el equipo de orientación. Por eso el
--  resultado es texto y no un puntaje.
-- ════════════════════════════════════════════════════════════════════

-- ── Clases grabadas ──

CREATE TYPE recording_provider AS ENUM ('youtube', 'drive', 'meet', 'otro');

CREATE TABLE recorded_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Opcionales: si están, la grabación aparece junto a esa unidad del temario.
  unit_id UUID REFERENCES planning_units(id) ON DELETE SET NULL,
  term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  provider recording_provider NOT NULL DEFAULT 'otro',
  duration_min INT,
  recorded_on DATE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recordings_subject_course
  ON recorded_classes(subject_id, course_id) WHERE is_published;
CREATE INDEX idx_recordings_unit ON recorded_classes(unit_id);
CREATE INDEX idx_recordings_teacher ON recorded_classes(teacher_id);

ALTER TABLE recorded_classes ENABLE ROW LEVEL SECURITY;

-- Mismo binding que el resto del proyecto: autoría + materia y curso
-- efectivamente asignados.
CREATE POLICY "Teachers manage recordings of their assignments"
  ON recorded_classes FOR ALL
  USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = recorded_classes.subject_id
        AND ta.course_id = recorded_classes.course_id
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = recorded_classes.subject_id
        AND ta.course_id = recorded_classes.course_id
    )
  );

CREATE POLICY "Directors view school recordings"
  ON recorded_classes FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Students view published recordings of their subjects"
  ON recorded_classes FOR SELECT
  USING (
    is_published
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id = auth_student_id()
        AND e.subject_id = recorded_classes.subject_id
        AND e.course_id = recorded_classes.course_id
    )
  );

CREATE POLICY "Guardians view published recordings of their children"
  ON recorded_classes FOR SELECT
  USING (
    is_published
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id IN (SELECT auth_guardian_student_ids())
        AND e.subject_id = recorded_classes.subject_id
        AND e.course_id = recorded_classes.course_id
    )
  );

CREATE OR REPLACE FUNCTION stamp_recorded_class()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.teacher_id := auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.teacher_id := OLD.teacher_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recording_stamp
  BEFORE INSERT OR UPDATE ON recorded_classes
  FOR EACH ROW EXECUTE FUNCTION stamp_recorded_class();

REVOKE INSERT, UPDATE ON recorded_classes FROM anon, authenticated;
GRANT INSERT (school_id, subject_id, course_id, unit_id, term_id, title,
              description, url, provider, duration_min, recorded_on, is_published)
  ON recorded_classes TO authenticated;
GRANT UPDATE (unit_id, term_id, title, description, url, provider,
              duration_min, recorded_on, is_published)
  ON recorded_classes TO authenticated;

-- ── Orientación vocacional ──

CREATE TABLE vocational_profiles (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Respuestas crudas del cuestionario: {clave: 1..5}
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Áreas que quedaron arriba, en orden.
  top_areas TEXT[] NOT NULL DEFAULT '{}',
  -- Lo que el estudiante escribe de su puño: qué le gusta, qué imagina.
  own_words TEXT,
  -- Devolución para conversar, no un veredicto.
  summary TEXT,
  -- El estudiante decide si el equipo de orientación lo ve.
  shared_with_school BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vocational_profiles ENABLE ROW LEVEL SECURITY;

-- Es del estudiante: lo hace, lo rehace y decide si lo comparte.
CREATE POLICY "Students manage their own vocational profile"
  ON vocational_profiles FOR ALL
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id() AND school_id = auth_school_id());

-- La escuela lo ve solo si el estudiante lo compartió. Un perfil
-- vocacional a medias, leído sin permiso, hace más daño que bien.
CREATE POLICY "Directors view shared vocational profiles"
  ON vocational_profiles FOR SELECT
  USING (
    shared_with_school
    AND auth_role() = 'director'
    AND school_id = auth_school_id()
  );

CREATE POLICY "Teachers view shared profiles of their students"
  ON vocational_profiles FOR SELECT
  USING (
    shared_with_school
    AND auth_role() = 'docente'
    AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE e.student_id = vocational_profiles.student_id
        AND ta.teacher_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION stamp_vocational_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vocational_stamp
  BEFORE INSERT OR UPDATE ON vocational_profiles
  FOR EACH ROW EXECUTE FUNCTION stamp_vocational_profile();

REVOKE UPDATE ON vocational_profiles FROM anon, authenticated;
GRANT UPDATE (answers, top_areas, own_words, summary, shared_with_school)
  ON vocational_profiles TO authenticated;
