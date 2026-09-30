-- ═══════════════════════════════════════════════════════════════════
-- 037 — Deshacer lo que la 036 pisó de la 024 y la 027
--
-- La 036 (antes "020": cada docente escribe solo sobre sus cursos) se
-- escribió sin ver las migraciones de la rama front-renovado, que ya
-- estaban aplicadas en producción. Recreó dos policies que esa rama había
-- reemplazado a propósito por otras más finas:
--
--  · "Staff manage notices in school" (guardian_notices): la 024 la había
--    borrado porque dejaba a CUALQUIER docente leer, editar y borrar todos
--    los avisos a familias de la escuela, que ahora llevan el nombre del
--    menor y sus notas. Al volver, reabrió eso. Además la policy de envío
--    de la 024 no limitaba a quién se cita: un docente podía citar a la
--    familia de un alumno que no es suyo.
--
--  · "Teachers manage own activities" (activities): la 027 la había
--    reemplazado por "Teachers manage activities of their assignments",
--    que exige que el docente dé esa materia en ese curso también para
--    leer, editar y borrar. La de la 036 exigía lo mismo para escribir,
--    pero dejaba leer y borrar lo propio sin la asignación.
--
-- Queda el diseño de la 024/027, con el control de la 036 que le faltaba
-- al envío de avisos. Idempotente: se puede correr aunque la 036 no se
-- haya corrido.
-- ═══════════════════════════════════════════════════════════════════

-- ── Avisos a familias ──

DROP POLICY IF EXISTS "Staff manage notices in school" ON guardian_notices;

-- El comunicado a toda la escuela (student_id NULL) lo sigue pudiendo
-- mandar cualquier docente, como en la 024. El dirigido a la familia de
-- un alumno, solo si el alumno es de sus cursos.
DROP POLICY IF EXISTS "Teachers send notices in school" ON guardian_notices;
CREATE POLICY "Teachers send notices in school"
  ON guardian_notices FOR INSERT
  WITH CHECK (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND from_user_id = auth.uid()
    AND (student_id IS NULL OR teaches_student(student_id))
  );

-- ── Actividades ──

DROP POLICY IF EXISTS "Teachers manage own activities" ON activities;
