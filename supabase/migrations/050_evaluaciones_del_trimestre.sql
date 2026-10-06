-- ═══════════════════════════════════════════════════════════════════
-- 050 — Las notas de cada evaluación del trimestre
--
-- La libreta tenía una sola nota por trimestre y una "sugerida" que salía
-- de las actividades hechas en la app. Pero en la escuela casi todo se
-- evalúa en papel (pruebas escritas, trabajos prácticos, orales) y sin
-- celulares en clase esa sugerida quedaba vacía: el docente ponía la nota
-- del trimestre sin tener a la vista las notas que la explican.
--
--  · assessments: una evaluación (prueba, TP, oral, trabajo en clase,
--    concepto) de una materia y curso, en un trimestre, con su fecha.
--  · assessment_grades: la nota de cada alumno (1 a 10) o "ausente".
--  · guardar_evaluacion: la evaluación y todas sus notas de una vez (todo
--    o nada); con el id elegido por la app, reintentar no duplica (sirve
--    para la cola sin conexión).
--
-- Quién ve qué:
--  · Los docentes de esa materia y curso la cargan y la corrigen (si dos
--    comparten la materia, comparten la libreta, como en la 024).
--  · El alumno ve sus notas y la familia las de sus hijos, apenas se cargan
--    (como la prueba corregida que se devuelve). La nota del TRIMESTRE sigue
--    viéndose recién cuando se publica.
--  · Dirección ve las de su escuela.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  kind TEXT NOT NULL DEFAULT 'prueba'
    CHECK (kind IN ('prueba', 'tp', 'oral', 'trabajo', 'concepto', 'otra')),
  held_on DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_libreta ON assessments(subject_id, course_id, term_id, held_on);

CREATE TABLE IF NOT EXISTS assessment_grades (
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade NUMERIC(4,2) CHECK (grade BETWEEN 1 AND 10),
  absent BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, student_id),
  -- O tiene nota o estuvo ausente (sin nada, no hay fila)
  CONSTRAINT assessment_grades_nota_o_ausente CHECK ((grade IS NOT NULL) <> absent)
);

CREATE INDEX IF NOT EXISTS assessment_grades_alumno ON assessment_grades(student_id);

-- ── Sellos: escuela del curso, quién la creó, trimestre de esa escuela ──
CREATE OR REPLACE FUNCTION stamp_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.school_id := course_school(NEW.course_id);
  IF TG_OP = 'INSERT' THEN
    NEW.teacher_id := COALESCE(auth.uid(), NEW.teacher_id);
  ELSE
    -- Una evaluación no cambia de autor, materia ni curso: se corrige o se borra
    NEW.teacher_id := OLD.teacher_id;
    NEW.subject_id := OLD.subject_id;
    NEW.course_id := OLD.course_id;
    NEW.school_id := OLD.school_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM academic_terms t WHERE t.id = NEW.term_id AND t.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Ese trimestre no es de esta escuela' USING ERRCODE = '23514';
  END IF;
  NEW.title := trim(NEW.title);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessments_stamp ON assessments;
CREATE TRIGGER trg_assessments_stamp
  BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION stamp_assessment();

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_grades ENABLE ROW LEVEL SECURITY;

-- ── Evaluaciones ──
DROP POLICY IF EXISTS "Teachers manage assessments of their assignments" ON assessments;
CREATE POLICY "Teachers manage assessments of their assignments"
  ON assessments FOR ALL
  USING (school_id = auth_school_id() AND teaches(subject_id, course_id))
  WITH CHECK (course_school(course_id) = auth_school_id() AND teaches(subject_id, course_id));

DROP POLICY IF EXISTS "Directors view school assessments" ON assessments;
CREATE POLICY "Directors view school assessments"
  ON assessments FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

DROP POLICY IF EXISTS "Students view assessments of their subjects" ON assessments;
CREATE POLICY "Students view assessments of their subjects"
  ON assessments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth_student_id() AND e.subject_id = assessments.subject_id AND e.course_id = assessments.course_id
  ));

DROP POLICY IF EXISTS "Guardians view assessments of their children" ON assessments;
CREATE POLICY "Guardians view assessments of their children"
  ON assessments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id IN (SELECT auth_guardian_student_ids())
      AND e.subject_id = assessments.subject_id AND e.course_id = assessments.course_id
  ));

-- ── Notas ──
-- El docente solo califica a quien cursa esa materia en ese curso (mismo
-- criterio que la libreta, 024).
DROP POLICY IF EXISTS "Teachers manage grades of their assessments" ON assessment_grades;
CREATE POLICY "Teachers manage grades of their assessments"
  ON assessment_grades FOR ALL
  USING (EXISTS (
    SELECT 1 FROM assessments a
    WHERE a.id = assessment_grades.assessment_id AND a.school_id = auth_school_id() AND teaches(a.subject_id, a.course_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM assessments a
    JOIN enrollments e ON e.subject_id = a.subject_id AND e.course_id = a.course_id
    WHERE a.id = assessment_grades.assessment_id
      AND a.school_id = auth_school_id()
      AND teaches(a.subject_id, a.course_id)
      AND e.student_id = assessment_grades.student_id
  ));

DROP POLICY IF EXISTS "Students view own assessment grades" ON assessment_grades;
CREATE POLICY "Students view own assessment grades"
  ON assessment_grades FOR SELECT
  USING (student_id = auth_student_id());

DROP POLICY IF EXISTS "Guardians view assessment grades of their children" ON assessment_grades;
CREATE POLICY "Guardians view assessment grades of their children"
  ON assessment_grades FOR SELECT
  USING (student_id IN (SELECT auth_guardian_student_ids()));

DROP POLICY IF EXISTS "Directors view school assessment grades" ON assessment_grades;
CREATE POLICY "Directors view school assessment grades"
  ON assessment_grades FOR SELECT
  USING (auth_role() = 'director' AND EXISTS (
    SELECT 1 FROM assessments a WHERE a.id = assessment_grades.assessment_id AND a.school_id = auth_school_id()
  ));

-- ── Guardar una evaluación con todas sus notas, de una vez ──
-- p_notas: [{ student_id, nota, ausente }]. Lo que viene sin nota y sin
-- ausente se borra (el docente vació la casilla). Corre con los permisos
-- de quien llama: valen las reglas de arriba.
CREATE OR REPLACE FUNCTION guardar_evaluacion(
  p_id UUID,
  p_subject UUID,
  p_course UUID,
  p_term UUID,
  p_titulo TEXT,
  p_tipo TEXT,
  p_fecha DATE,
  p_notas JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO assessments AS a (id, school_id, subject_id, course_id, term_id, title, kind, held_on)
  VALUES (p_id, course_school(p_course), p_subject, p_course, p_term, p_titulo, p_tipo, p_fecha)
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    kind = EXCLUDED.kind,
    held_on = EXCLUDED.held_on,
    term_id = EXCLUDED.term_id;

  DELETE FROM assessment_grades g
  WHERE g.assessment_id = p_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(COALESCE(p_notas, '[]'::jsonb)) AS f(student_id UUID, nota NUMERIC, ausente BOOLEAN)
      WHERE f.student_id = g.student_id AND (f.nota IS NOT NULL OR COALESCE(f.ausente, false))
    );

  INSERT INTO assessment_grades (assessment_id, student_id, grade, absent)
  SELECT p_id, f.student_id,
         CASE WHEN COALESCE(f.ausente, false) THEN NULL ELSE f.nota END,
         COALESCE(f.ausente, false)
  FROM jsonb_to_recordset(COALESCE(p_notas, '[]'::jsonb)) AS f(student_id UUID, nota NUMERIC, ausente BOOLEAN)
  WHERE f.nota IS NOT NULL OR COALESCE(f.ausente, false)
  ON CONFLICT (assessment_id, student_id) DO UPDATE SET
    grade = EXCLUDED.grade,
    absent = EXCLUDED.absent,
    updated_at = now();

  RETURN p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION guardar_evaluacion(UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_evaluacion(UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, JSONB) TO authenticated;

-- Comprobación: una fila, las tres en true
SELECT
  to_regclass('public.assessments') IS NOT NULL AS evaluaciones,
  to_regclass('public.assessment_grades') IS NOT NULL AS notas,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'guardar_evaluacion') AS guardar;
