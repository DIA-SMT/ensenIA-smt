-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 012: Temario por trimestre y criterios
--  Pedido de la reunión (26/8): "Criterios de evaluación. Temario de
--  primer, segundo y tercer trimestre." Y: el estudiante no tiene que
--  descargar nada — lo ve en la app.
--
--  1) planning_units.term_id: la unidad se ubica en un trimestre.
--     Asignarle trimestre ES el gesto de publicación: una unidad sin
--     trimestre queda en borrador, visible solo para su docente.
--  2) evaluation_criteria: lo que cada materia se compromete a evaluar
--     en ese trimestre, visible para estudiantes y familias.
--  3) RLS: estudiantes y familias pasan a ver el temario de las
--     materias que cursan. Hasta ahora la planificación era invisible
--     para ellos, y el temario es justamente lo que deben poder mirar.
-- ═══════════════════════════════════════════════

-- ── 1. La unidad vive en un trimestre ──
ALTER TABLE planning_units
  ADD COLUMN term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL;

CREATE INDEX idx_planning_units_term ON planning_units(term_id);

-- ── 2. Criterios de evaluación por materia × curso × trimestre ──
CREATE TABLE evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  criteria TEXT NOT NULL CHECK (char_length(criteria) <= 4000),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (subject_id, course_id, term_id)
);

CREATE INDEX idx_criteria_lookup ON evaluation_criteria(subject_id, course_id, term_id);
CREATE INDEX idx_criteria_school ON evaluation_criteria(school_id, term_id);

ALTER TABLE evaluation_criteria ENABLE ROW LEVEL SECURITY;

-- Docente: gestiona los criterios de las materias que tiene asignadas.
-- Mismo binding que la libreta (011): materia+curso asignados y trimestre
-- de la propia escuela.
CREATE POLICY "Teachers manage criteria of their assignments"
  ON evaluation_criteria FOR ALL
  USING (
    school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = evaluation_criteria.subject_id
        AND ta.course_id = evaluation_criteria.course_id
    )
  )
  WITH CHECK (
    school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = evaluation_criteria.subject_id
        AND ta.course_id = evaluation_criteria.course_id
    )
    AND EXISTS (
      SELECT 1 FROM academic_terms t
      WHERE t.id = evaluation_criteria.term_id
        AND t.school_id = evaluation_criteria.school_id
    )
  );

CREATE POLICY "Directors view school criteria"
  ON evaluation_criteria FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Students view published criteria of their subjects"
  ON evaluation_criteria FOR SELECT
  USING (
    is_published
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id = auth_student_id()
        AND e.subject_id = evaluation_criteria.subject_id
        AND e.course_id = evaluation_criteria.course_id
    )
  );

CREATE POLICY "Guardians view published criteria of their children"
  ON evaluation_criteria FOR SELECT
  USING (
    is_published
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id IN (SELECT auth_guardian_student_ids())
        AND e.subject_id = evaluation_criteria.subject_id
        AND e.course_id = evaluation_criteria.course_id
    )
  );

-- El servidor sella la autoría y la fecha.
CREATE OR REPLACE FUNCTION stamp_evaluation_criteria()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_criteria_stamp
  BEFORE INSERT OR UPDATE ON evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION stamp_evaluation_criteria();

REVOKE INSERT, UPDATE ON evaluation_criteria FROM anon, authenticated;
GRANT INSERT (school_id, subject_id, course_id, term_id, criteria, is_published)
  ON evaluation_criteria TO authenticated;
GRANT UPDATE (criteria, is_published) ON evaluation_criteria TO authenticated;

-- ── 3. El temario se vuelve visible para quien cursa ──
-- Una unidad con trimestre asignado es temario publicado; sin trimestre,
-- sigue siendo borrador del docente.
CREATE POLICY "Students view published syllabus of their subjects"
  ON planning_units FOR SELECT
  USING (
    term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id = auth_student_id()
        AND e.subject_id = planning_units.subject_id
        AND e.course_id = planning_units.course_id
    )
  );

CREATE POLICY "Guardians view published syllabus of their children"
  ON planning_units FOR SELECT
  USING (
    term_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id IN (SELECT auth_guardian_student_ids())
        AND e.subject_id = planning_units.subject_id
        AND e.course_id = planning_units.course_id
    )
  );

-- planning_classes ya hereda por "Access planning_classes via planning_units
-- RLS" (001), que resuelve unit_id IN (SELECT id FROM planning_units): al
-- abrir la unidad, sus clases acompañan sin política adicional.
