-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 015: Libreta digital
--  La verdadera tarea administrativa del docente: cargar notas por
--  trimestre. Régimen de Tucumán (secundaria): 3 trimestres, escala
--  numérica 1-10, se aprueba con 6, promedio anual, instancias de
--  diciembre y febrero. El boletín registra también inasistencias por
--  trimestre y la valoración de la convivencia (conducta).
-- ═══════════════════════════════════════════════

-- ── Nota trimestral por estudiante y materia ──
CREATE TABLE IF NOT EXISTS report_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  school_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  -- 1, 2, 3 = trimestres · 4 = diciembre · 5 = febrero (instancias de apoyo)
  term INT NOT NULL CHECK (term BETWEEN 1 AND 5),
  grade NUMERIC(4,2) CHECK (grade BETWEEN 1 AND 10),
  -- Valoración de la convivencia del trimestre (va en el boletín)
  conduct TEXT CHECK (conduct IN ('muy_buena', 'buena', 'regular', 'mala')),
  comment TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, school_year, term)
);

CREATE INDEX IF NOT EXISTS report_grades_course
  ON report_grades(course_id, subject_id, school_year, term);
CREATE INDEX IF NOT EXISTS report_grades_student
  ON report_grades(student_id, school_year);

DROP TRIGGER IF EXISTS report_grades_touch ON report_grades;
CREATE TRIGGER report_grades_touch BEFORE UPDATE ON report_grades
  FOR EACH ROW EXECUTE FUNCTION live_touch_updated_at();

ALTER TABLE report_grades ENABLE ROW LEVEL SECURITY;

-- El docente carga y corrige las notas de sus materias
DROP POLICY IF EXISTS "Teachers manage own report grades" ON report_grades;
CREATE POLICY "Teachers manage own report grades"
  ON report_grades FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Dirección ve la libreta de toda su escuela
DROP POLICY IF EXISTS "Directors view school report grades" ON report_grades;
CREATE POLICY "Directors view school report grades"
  ON report_grades FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p
    JOIN students s ON s.school_id = p.school_id
    WHERE p.id = auth.uid() AND p.role = 'director' AND s.id = report_grades.student_id
  ));

-- El estudiante ve su propia libreta
DROP POLICY IF EXISTS "Students view own report grades" ON report_grades;
CREATE POLICY "Students view own report grades"
  ON report_grades FOR SELECT
  USING (student_id = auth_student_id());

-- La familia ve la libreta de sus hijos
DROP POLICY IF EXISTS "Guardians view children report grades" ON report_grades;
CREATE POLICY "Guardians view children report grades"
  ON report_grades FOR SELECT
  USING (student_id IN (
    SELECT student_id FROM student_guardians WHERE guardian_user_id = auth.uid()
  ));
