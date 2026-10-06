-- ═══════════════════════════════════════════════════════════════════
-- 045 — Horario: también lo arma la dirección, sin superposiciones
--
-- La 044 le dio al docente la carga de SU horario y completa los datos
-- copiados de cada clase (nombres, día). Esta suma lo que faltaba para
-- que el horario sirva a toda la escuela:
--
--  · La dirección (y el superadmin) cargan y corrigen el horario de
--    cualquier docente de su escuela, desde Gestión de la escuela →
--    Horario.
--  · Ni el docente ni la dirección pueden cargar una clase de una materia
--    que ese docente no da en ese curso, ni dos clases a la misma hora del
--    mismo curso o del mismo docente.
--  · Los estudiantes ven el horario de su curso.
--  · Al sacarle a un docente una materia de un curso, se van sus clases
--    del horario, y los estudiantes dejan de tener esa materia si nadie
--    más la da en el curso (antes la seguían viendo).
--  · Borrar un curso o una materia borra su horario (antes lo impedía).
--
-- Requiere la 044 (trigger schedule_block_completar).
-- ═══════════════════════════════════════════════════════════════════

-- Si se llegó a correr la versión anterior de esta migración (043_horario,
-- que también completaba los datos), su trigger se reemplaza por el de abajo
DROP TRIGGER IF EXISTS trg_schedule_block_prepare ON schedule_blocks;
DROP FUNCTION IF EXISTS schedule_block_prepare();

-- ── Al borrar un curso o una materia se va su horario ──
ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_course_id_fkey;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE schedule_blocks DROP CONSTRAINT IF EXISTS schedule_blocks_subject_id_fkey;
ALTER TABLE schedule_blocks ADD CONSTRAINT schedule_blocks_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

-- ── Escritura de la dirección de la escuela y el superadmin ──
DROP POLICY IF EXISTS "Managers manage schedule" ON schedule_blocks;
CREATE POLICY "Managers manage schedule"
  ON schedule_blocks FOR ALL
  USING (manages_school(school_id))
  WITH CHECK (manages_school(school_id) AND course_school(course_id) = school_id);

-- ── Lectura del estudiante: el horario de su curso ──
DROP POLICY IF EXISTS "Students see their course schedule" ON schedule_blocks;
CREATE POLICY "Students see their course schedule"
  ON schedule_blocks FOR SELECT
  USING (course_id = auth_student_course_id());

-- ── Validar cada clase (corre después del completado de la 044) ──
CREATE OR REPLACE FUNCTION schedule_block_validar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_choque TEXT;
  v_fin NUMERIC := NEW.start_hour + NEW.duration;
BEGIN
  -- La escuela es la del curso, la ponga quien la ponga
  NEW.school_id := course_school(NEW.course_id);

  IF NOT EXISTS (
    SELECT 1 FROM teacher_assignments
    WHERE teacher_id = NEW.teacher_id AND subject_id = NEW.subject_id AND course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'Ese docente no tiene asignada esa materia en ese curso. Asignásela primero en Personal.'
      USING ERRCODE = '23514';
  END IF;

  -- El mismo curso o el mismo docente, el mismo día, horas que se pisan
  SELECT CASE WHEN b.course_id = NEW.course_id
              THEN 'El curso ' || b.course_name || ' ya tiene ' || b.subject_name || ' en ese horario'
              ELSE 'Ese docente ya da ' || b.subject_name || ' en ' || b.course_name || ' en ese horario' END
    INTO v_choque
  FROM schedule_blocks b
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.day_index = NEW.day_index
    AND (b.course_id = NEW.course_id OR b.teacher_id = NEW.teacher_id)
    AND b.start_hour < v_fin
    AND NEW.start_hour < b.start_hour + b.duration
  LIMIT 1;
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION '%', v_choque USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

-- Los triggers BEFORE corren por orden alfabético: este ("…_validar")
-- después del "…_completar" de la 044, que ya llenó los nombres.
DROP TRIGGER IF EXISTS trg_schedule_block_validar ON schedule_blocks;
CREATE TRIGGER trg_schedule_block_validar
  BEFORE INSERT OR UPDATE ON schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION schedule_block_validar();

-- ── Al sacarle una materia a un docente ──
CREATE OR REPLACE FUNCTION on_assignment_removed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM schedule_blocks
  WHERE teacher_id = OLD.teacher_id AND subject_id = OLD.subject_id AND course_id = OLD.course_id;

  -- Si nadie más da esa materia en el curso, los estudiantes dejan de tenerla
  IF NOT EXISTS (
    SELECT 1 FROM teacher_assignments WHERE subject_id = OLD.subject_id AND course_id = OLD.course_id
  ) THEN
    DELETE FROM enrollments WHERE subject_id = OLD.subject_id AND course_id = OLD.course_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_removed ON teacher_assignments;
CREATE TRIGGER trg_assignment_removed
  AFTER DELETE ON teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION on_assignment_removed();

-- ── La cantidad de estudiantes y el nombre del curso siguen al curso ──
CREATE OR REPLACE FUNCTION on_course_count_changed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.student_count IS DISTINCT FROM OLD.student_count OR NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE schedule_blocks SET student_count = COALESCE(NEW.student_count, 0), course_name = NEW.name
    WHERE course_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_count_schedule ON courses;
CREATE TRIGGER trg_course_count_schedule
  AFTER UPDATE OF student_count, name ON courses
  FOR EACH ROW EXECUTE FUNCTION on_course_count_changed();

-- Comprobación: una fila, las tres en true
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schedule_blocks' AND policyname = 'Managers manage schedule') AS escritura,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schedule_block_validar') AS validacion,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assignment_removed') AS limpieza;
