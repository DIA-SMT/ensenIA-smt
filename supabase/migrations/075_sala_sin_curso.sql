-- ═══════════════════════════════════════════════════════════════════
-- 075 — Sala sin curso: la clase en vivo para una reunión, una jornada o
-- una charla con familias
--
-- Hasta ahora toda clase en vivo era de una materia y un curso, y solo la
-- abría un docente que los dicta. Una sala sin curso no tiene ninguno de
-- los dos: participan solo invitados (QR o código, sin cuenta), con todo lo
-- de siempre (preguntas rápidas, nube, competencia, preguntas del público).
-- La puede abrir un docente o la dirección.
--
--  · Las dos o ninguna: no hay "materia sin curso" ni al revés.
--  · Los estudiantes con cuenta no la ven como clase de su curso (no es de
--    ninguno): si escanean el QR, entran como cualquier invitado.
--  · Lo demás ya sirve sin curso: el estado, los resultados (cuentan los
--    invitados), las alertas (van al que abrió la sala) y el resumen.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE live_sessions ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE live_sessions ALTER COLUMN course_id DROP NOT NULL;

ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_curso_y_materia;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_curso_y_materia
  CHECK ((course_id IS NULL) = (subject_id IS NULL));

-- Quién la abre: el docente, para un curso y una materia que dicta (036), o
-- sin curso; la dirección, solo sin curso
DROP POLICY IF EXISTS "Teachers manage own live sessions" ON live_sessions;
CREATE POLICY "Teachers manage own live sessions"
  ON live_sessions FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND (
      teaches(subject_id, course_id)
      OR (course_id IS NULL AND subject_id IS NULL AND auth_role() IN ('docente', 'director'))
    )
  );

-- Comprobación: una fila, todo true
SELECT
  (SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'course_id') AS curso_opcional,
  (SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_name = 'live_sessions' AND column_name = 'subject_id') AS materia_opcional,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_curso_y_materia') AS las_dos_o_ninguna,
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_sessions' AND policyname = 'Teachers manage own live sessions'
           AND with_check LIKE '%auth_role()%') AS sala_sin_curso_permitida;
