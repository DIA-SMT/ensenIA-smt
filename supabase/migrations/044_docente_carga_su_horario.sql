-- ═══════════════════════════════════════════════════════════════════
-- 044 — El docente carga su propio horario
--
-- schedule_blocks solo tenía policies de LECTURA: el horario se cargaba
-- con los seeds y desde la app nadie podía escribirlo. Sin horario, "Hoy"
-- (la pantalla principal del docente) no muestra clases, ni "Pasar lista"
-- ni "Preparar". Ahora cada docente escribe SUS bloques:
--
--  · solo con teacher_id = él, en su escuela activa, y de una materia y
--    curso que tiene asignados (teaches(), de la 036);
--  · las columnas copiadas (subject_name, course_name, student_count,
--    day_of_week) NO las decide el cliente: las completa un trigger desde
--    las tablas reales, así nadie puede mostrarle a dirección un nombre
--    de materia o un curso que no son;
--  · hora y duración razonables (7 a 23 h, de 20 minutos a 4 horas).
--
-- Dirección sigue viendo el horario de su escuela (policy de la 001); no
-- se le da escritura: si hace falta, va en otra migración.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION schedule_block_completar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dias day_of_week[] := ARRAY['lunes', 'martes', 'miercoles', 'jueves', 'viernes']::day_of_week[];
BEGIN
  IF NEW.day_index IS NULL OR NEW.day_index NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'El día tiene que ser de lunes a viernes' USING ERRCODE = '22023';
  END IF;
  IF NEW.start_hour IS NULL OR NEW.start_hour < 7 OR NEW.start_hour > 23 THEN
    RAISE EXCEPTION 'La hora de inicio tiene que estar entre las 7 y las 23' USING ERRCODE = '22023';
  END IF;
  IF NEW.duration IS NULL OR NEW.duration < 0.33 OR NEW.duration > 4 THEN
    RAISE EXCEPTION 'La clase tiene que durar entre 20 minutos y 4 horas' USING ERRCODE = '22023';
  END IF;

  NEW.day_of_week := dias[NEW.day_index + 1];
  SELECT name INTO NEW.subject_name FROM subjects WHERE id = NEW.subject_id;
  SELECT name, COALESCE(student_count, 0) INTO NEW.course_name, NEW.student_count
  FROM courses WHERE id = NEW.course_id;
  IF NEW.subject_name IS NULL OR NEW.course_name IS NULL THEN
    RAISE EXCEPTION 'La materia o el curso no existen' USING ERRCODE = '23503';
  END IF;
  NEW.room := NULLIF(left(trim(COALESCE(NEW.room, '')), 40), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_block_completar ON schedule_blocks;
CREATE TRIGGER trg_schedule_block_completar
  BEFORE INSERT OR UPDATE ON schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION schedule_block_completar();

DROP POLICY IF EXISTS "Teachers add own schedule" ON schedule_blocks;
CREATE POLICY "Teachers add own schedule"
  ON schedule_blocks FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

DROP POLICY IF EXISTS "Teachers change own schedule" ON schedule_blocks;
CREATE POLICY "Teachers change own schedule"
  ON schedule_blocks FOR UPDATE
  USING (teacher_id = auth.uid() AND school_id = auth_school_id())
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND teaches(subject_id, course_id)
  );

DROP POLICY IF EXISTS "Teachers remove own schedule" ON schedule_blocks;
CREATE POLICY "Teachers remove own schedule"
  ON schedule_blocks FOR DELETE
  USING (teacher_id = auth.uid() AND school_id = auth_school_id());
