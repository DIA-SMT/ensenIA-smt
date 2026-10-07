-- 059 — Comunicados a docentes, estudiantes y familias, por escuela, curso o persona
--
-- Antes la dirección podía escribirle al equipo docente (todos o uno) y, por
-- otro lado, a las familias (todas o la de un alumno). A los estudiantes no
-- había forma de escribirles, ni a un curso.
--
-- · communications ahora tiene audiencia ('docentes' | 'estudiantes') y un
--   curso opcional. Un comunicado a estudiantes lo ven los chicos de ese curso
--   (o de toda la escuela); uno a docentes con curso, los que dan clase ahí.
-- · guardian_notices suma course_id: "a las familias de 2° A".
-- · Se corrige la creación de comunicados: no chequeaba la escuela, un
--   directivo podía escribir en el muro de otra escuela.

-- ══ 1. Comunicados del equipo y de los estudiantes ══

ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS audiencia TEXT NOT NULL DEFAULT 'docentes'
    CHECK (audiencia IN ('docentes', 'estudiantes')),
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Directors can create communications" ON communications;
CREATE POLICY "Directors can create communications"
  ON communications FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    AND auth_role() = 'director'
    AND school_id = auth_school_id()
    AND (course_id IS NULL OR course_school(course_id) = school_id)
  );

DROP POLICY IF EXISTS "Users in school can see communications" ON communications;
CREATE POLICY "Users in school can see communications"
  ON communications FOR SELECT
  USING (
    school_id = auth_school_id()
    AND (
      from_user_id = auth.uid()
      -- La dirección ve todo lo de su escuela (también lo de otro directivo)
      OR auth_role() = 'director'
      -- Al equipo: todos, o los que dan clase en ese curso
      OR (is_broadcast AND audiencia = 'docentes' AND auth_role() = 'docente'
          AND (course_id IS NULL OR EXISTS (
            SELECT 1 FROM teacher_assignments ta
            WHERE ta.teacher_id = auth.uid() AND ta.course_id = communications.course_id)))
      -- A los estudiantes: toda la escuela o su curso
      OR (is_broadcast AND audiencia = 'estudiantes' AND auth_role() = 'estudiante'
          AND (course_id IS NULL OR course_id = auth_student_course_id()))
      -- A una persona
      OR id IN (SELECT cr.communication_id FROM communication_recipients cr WHERE cr.user_id = auth.uid())
    )
  );

-- Marcar leído: solo lo que uno puede ver (antes se podía marcar cualquier id)
DROP POLICY IF EXISTS "Users can mark communications as read" ON communication_reads;
CREATE POLICY "Users can mark communications as read"
  ON communication_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM communications c WHERE c.id = communication_id)
  );

-- ══ 2. Avisos a las familias de un curso ══

ALTER TABLE guardian_notices
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Directors manage school notices" ON guardian_notices;
CREATE POLICY "Directors manage school notices"
  ON guardian_notices FOR ALL
  USING (auth_role() = 'director' AND school_id = auth_school_id())
  WITH CHECK (
    auth_role() = 'director'
    AND school_id = auth_school_id()
    AND from_user_id = auth.uid()
    AND (course_id IS NULL OR course_school(course_id) = school_id)
  );

DROP POLICY IF EXISTS "Guardians see notices for their students or school-wide" ON guardian_notices;
CREATE POLICY "Guardians see notices for their students or school-wide"
  ON guardian_notices FOR SELECT
  USING (
    school_id = auth_school_id()
    AND auth_role() = 'padre'
    AND (
      -- De su hijo/a
      student_id IN (SELECT auth_guardian_student_ids())
      -- De toda la escuela o del curso de alguno de sus hijos
      OR (student_id IS NULL AND (
            course_id IS NULL
            OR course_id IN (SELECT s.course_id FROM students s WHERE s.id IN (SELECT auth_guardian_student_ids()))))
    )
  );
