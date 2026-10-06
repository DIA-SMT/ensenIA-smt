-- 051 — Material por curso y citaciones del docente por materia
--
-- 1) library_materials.course_id
--    El material es de un curso. NULL = "todos mis cursos de esta materia":
--    los cursos donde QUIEN LO SUBIÓ da esa materia. Antes lo compartido lo
--    veía todo inscripto en la materia, de cualquier curso, también los
--    cursos de otro docente que da la misma materia.
--    Los cuatro caminos del estudiante a un material compartido usan la misma
--    regla (student_sees_material): la fila, el archivo, el podcast y la
--    función process-document (que la replica en TypeScript).
--
-- 2) guardian_notices
--    El docente ya no manda comunicados (eso es de dirección). Solo
--    citaciones, a la familia de un estudiante inscripto en una materia
--    suya, y la citación dice de qué materia es (subject_id).
--    Los avisos automáticos de la libreta (notify_term_grade_risk) son
--    SECURITY DEFINER y no pasan por estas policies.

-- ── 1. Material por curso ─────────────────────────────────────

ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_materials_course ON library_materials(course_id);

-- ¿El estudiante logueado puede ver un material compartido con estos datos?
CREATE OR REPLACE FUNCTION student_sees_material(p_subject UUID, p_course UUID, p_teacher UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth_student_id()
      AND e.subject_id = p_subject
      AND (
        e.course_id = p_course
        OR (p_course IS NULL AND (
          -- "Todos mis cursos": los cursos donde quien lo subió da la materia
          EXISTS (
            SELECT 1 FROM teacher_assignments ta
            WHERE ta.teacher_id = p_teacher
              AND ta.subject_id = p_subject
              AND ta.course_id = e.course_id
          )
          -- Material de quien no da la materia (dirección, o un docente que
          -- ya no la tiene): sigue como antes, toda la materia
          OR NOT EXISTS (
            SELECT 1 FROM teacher_assignments ta
            WHERE ta.teacher_id = p_teacher AND ta.subject_id = p_subject
          )
        ))
      )
  )
$$;

DROP POLICY IF EXISTS "Students see shared materials of enrolled subjects" ON library_materials;
CREATE POLICY "Students see shared materials of enrolled subjects"
  ON library_materials FOR SELECT
  USING (is_shared_with_students = true AND student_sees_material(subject_id, course_id, teacher_id));

-- El curso del material tiene que ser uno donde el docente da esa materia
DROP POLICY IF EXISTS "Teachers can insert their own materials" ON library_materials;
CREATE POLICY "Teachers can insert their own materials"
  ON library_materials FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches_subject(subject_id)
    AND (course_id IS NULL OR teaches(subject_id, course_id))
  );

DROP POLICY IF EXISTS "Teachers can update their own materials" ON library_materials;
CREATE POLICY "Teachers can update their own materials"
  ON library_materials FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches_subject(subject_id)
    AND (course_id IS NULL OR teaches(subject_id, course_id))
  );

-- Archivos y podcasts: misma regla que la fila
DROP POLICY IF EXISTS "Read library files via materials RLS" ON storage.objects;
CREATE POLICY "Read library files via materials RLS"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM library_materials m
      WHERE m.storage_path = objects.name
        AND (
          m.teacher_id = auth.uid()
          OR (auth_role() = 'director' AND m.school_id = auth_school_id())
          OR (m.is_shared_with_students AND student_sees_material(m.subject_id, m.course_id, m.teacher_id))
        )
    )
  );

DROP POLICY IF EXISTS "Read podcasts via materials RLS" ON storage.objects;
CREATE POLICY "Read podcasts via materials RLS"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library'
    AND EXISTS (
      SELECT 1 FROM library_materials m
      WHERE m.podcast_path = objects.name
        AND (
          m.teacher_id = auth.uid()
          OR (auth_role() = 'director' AND m.school_id = auth_school_id())
          OR (m.is_shared_with_students AND student_sees_material(m.subject_id, m.course_id, m.teacher_id))
        )
    )
  );

-- ── 2. Citaciones del docente ─────────────────────────────────

ALTER TABLE guardian_notices
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;

-- ¿Este estudiante cursa esta materia conmigo? (inscripción en materia y
-- curso donde el docente logueado tiene esa asignación)
CREATE OR REPLACE FUNCTION teaches_student_subject(p_student UUID, p_subject UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN teacher_assignments ta
      ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
    WHERE e.student_id = p_student
      AND e.subject_id = p_subject
      AND ta.teacher_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "Teachers send notices in school" ON guardian_notices;
DROP POLICY IF EXISTS "Teachers send citations to their subject students" ON guardian_notices;
CREATE POLICY "Teachers send citations to their subject students"
  ON guardian_notices FOR INSERT
  WITH CHECK (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND from_user_id = auth.uid()
    AND type = 'citacion'
    AND student_id IS NOT NULL
    AND subject_id IS NOT NULL
    AND teaches_student_subject(student_id, subject_id)
  );
