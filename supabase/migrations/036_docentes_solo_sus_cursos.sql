-- ═══════════════════════════════════════════════════════════════════
-- 036 — Cada docente escribe solo sobre sus cursos y sus alumnos
--
-- Las policies de escritura de los docentes chequeaban una sola cosa:
-- `teacher_id = auth.uid()`. Leer sí estaba acotado a sus cursos, pero
-- escribir no, así que cualquier docente podía:
--  · cargar notas de libreta a cualquier alumno (y como hay UNIQUE por
--    alumno+materia+trimestre, ganarle de mano al docente real);
--  · pasar asistencia de cualquier alumno, que además recalcula
--    students.attendance;
--  · escribir observaciones sobre cualquier alumno;
--  · publicar actividades o abrir una clase en vivo en cualquier curso
--    (y con el índice de una sola clase en vivo por curso, bloquearle la
--    suya a otro docente);
--  · armar grupos con alumnos de otros cursos, citar a familias de
--    alumnos que no son suyos, compartir material con materias ajenas;
--  · poner cualquier school_id y aparecer en el panel de otra escuela.
-- Y como la única condición era teacher_id = uno mismo, un alumno o una
-- familia también podía hacer todo eso a su propio nombre.
--
-- Ahora cada escritura verifica contra teacher_assignments, que es de
-- donde la app ya saca los cursos de cada docente. Las condiciones van
-- en WITH CHECK: lo que ya existe se sigue viendo y se puede borrar
-- como antes; lo nuevo (o lo que se modifica) tiene que ser coherente.
--
-- Las policies de UPDATE sin WITH CHECK (alertas, corregir entregas) no
-- se tocan: Postgres usa el USING también para la fila nueva, así que
-- ya impedían pasar una alerta o una entrega a otro docente.
-- ═══════════════════════════════════════════════════════════════════

-- ── Helpers ──
-- SECURITY DEFINER: se evalúan sin pasar por la RLS de las tablas que
-- consultan, y cuestan una consulta por fila escrita.

-- ¿Doy esta materia en este curso?
CREATE OR REPLACE FUNCTION teaches(p_subject UUID, p_course UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = auth.uid() AND subject_id = p_subject AND course_id = p_course
  )
$$;

-- ¿Doy alguna materia en este curso?
CREATE OR REPLACE FUNCTION teaches_course(p_course UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = auth.uid() AND course_id = p_course
  )
$$;

-- ¿Doy esta materia en algún curso?
CREATE OR REPLACE FUNCTION teaches_subject(p_subject UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = auth.uid() AND subject_id = p_subject
  )
$$;

-- ¿Este alumno es de alguno de mis cursos? (mismo criterio que las
-- policies de lectura de observaciones y check-ins, 004)
CREATE OR REPLACE FUNCTION teaches_student(p_student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM students s
    JOIN teacher_assignments ta ON ta.course_id = s.course_id
    WHERE s.id = p_student AND ta.teacher_id = auth.uid()
  )
$$;

-- ¿Este alumno está en este curso?
CREATE OR REPLACE FUNCTION student_in_course(p_student UUID, p_course UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM students WHERE id = p_student AND course_id = p_course)
$$;

-- ── Actividades ──

DROP POLICY IF EXISTS "Teachers manage own activities" ON activities;
CREATE POLICY "Teachers manage own activities"
  ON activities FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

-- ── Observaciones ──

DROP POLICY IF EXISTS "Teachers manage own observations" ON student_observations;
CREATE POLICY "Teachers manage own observations"
  ON student_observations FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND teaches_student(student_id));

-- ── Libreta digital ──

DROP POLICY IF EXISTS "Teachers manage own report grades" ON report_grades;
CREATE POLICY "Teachers manage own report grades"
  ON report_grades FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND teaches(subject_id, course_id)
    AND student_in_course(student_id, course_id)
  );

-- ── Asistencia ──

DROP POLICY IF EXISTS "Teachers manage own attendance sessions" ON attendance_sessions;
CREATE POLICY "Teachers manage own attendance sessions"
  ON attendance_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

DROP POLICY IF EXISTS "Teachers manage records of own sessions" ON attendance_records;
CREATE POLICY "Teachers manage records of own sessions"
  ON attendance_records FOR ALL
  USING (session_id IN (SELECT id FROM attendance_sessions WHERE teacher_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM attendance_sessions s
    WHERE s.id = session_id
      AND s.teacher_id = auth.uid()
      AND student_in_course(student_id, s.course_id)
  ));

-- ── Clase en vivo ──

DROP POLICY IF EXISTS "Teachers manage own live sessions" ON live_sessions;
CREATE POLICY "Teachers manage own live sessions"
  ON live_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

-- La pregunta dirigida (014) solo a alumnos del curso de la clase
DROP POLICY IF EXISTS "Teachers manage activities of own sessions" ON live_activities;
CREATE POLICY "Teachers manage activities of own sessions"
  ON live_activities FOR ALL
  USING (session_id IN (SELECT id FROM live_sessions WHERE teacher_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM live_sessions ls
    WHERE ls.id = session_id
      AND ls.teacher_id = auth.uid()
      AND (target_student_id IS NULL OR student_in_course(target_student_id, ls.course_id))
  ));

-- ── Grupos ──

DROP POLICY IF EXISTS "Teachers manage own groups" ON course_groups;
CREATE POLICY "Teachers manage own groups"
  ON course_groups FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND teaches_course(course_id));

DROP POLICY IF EXISTS "Teachers manage members of own groups" ON course_group_members;
CREATE POLICY "Teachers manage members of own groups"
  ON course_group_members FOR ALL
  USING (group_id IN (SELECT id FROM course_groups WHERE teacher_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM course_groups g
    WHERE g.id = group_id
      AND g.teacher_id = auth.uid()
      AND student_in_course(student_id, g.course_id)
  ));

-- ── Avisos a familias ──
-- El comunicado a toda la escuela (student_id NULL) lo puede mandar
-- cualquier docente, como hasta ahora (Familias.tsx lo ofrece). Lo que
-- va a la familia de un alumno puntual, solo si el alumno es suyo; la
-- dirección, a cualquiera de la escuela.

DROP POLICY IF EXISTS "Staff manage notices in school" ON guardian_notices;
CREATE POLICY "Staff manage notices in school"
  ON guardian_notices FOR ALL
  USING (auth_role() IN ('director', 'docente') AND school_id = auth_school_id())
  WITH CHECK (
    auth_role() IN ('director', 'docente')
    AND school_id = auth_school_id()
    AND from_user_id = auth.uid()
    AND (auth_role() = 'director' OR student_id IS NULL OR teaches_student(student_id))
  );

-- ── Biblioteca ──
-- Compartir material con alumnos es por materia: solo materias propias.

DROP POLICY IF EXISTS "Teachers can insert their own materials" ON library_materials;
CREATE POLICY "Teachers can insert their own materials"
  ON library_materials FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches_subject(subject_id)
  );

DROP POLICY IF EXISTS "Teachers can update their own materials" ON library_materials;
CREATE POLICY "Teachers can update their own materials"
  ON library_materials FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches_subject(subject_id)
  );

-- Subir archivos: solo personal de la escuela. Las dos policies de 003
-- valían para cualquier cuenta (la FOR ALL sin WITH CHECK también
-- habilita INSERT), así que un alumno podía llenar el bucket.
DROP POLICY IF EXISTS "Teachers upload to own folder" ON storage.objects;
CREATE POLICY "Teachers upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth_role() IN ('docente', 'director')
  );

DROP POLICY IF EXISTS "Teachers manage own files" ON storage.objects;
CREATE POLICY "Teachers manage own files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'library'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND auth_role() IN ('docente', 'director')
  );
