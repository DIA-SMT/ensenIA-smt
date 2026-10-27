-- ═══════════════════════════════════════════════════════════════════
-- 083 — Horario: dos clases seguidas no se superponen
--
-- Las horas se guardan con dos decimales (NUMERIC(4,2)): 9:40 queda 9.67
-- y 40 minutos quedan 0.67. Sumando los redondeos, una clase de 9:40 a
-- 10:20 "termina" a las 10.34 y la que empieza a las 10:20 (10.33) chocaba
-- con ella, aunque una termina justo cuando empieza la otra. Salió en la
-- capacitación del 26/10/2026, al cargar módulos seguidos.
--
-- Ahora el choque se mira en minutos enteros: el error de dos decimales es
-- de menos de medio minuto, así que redondear al minuto da la hora exacta.
-- El resto de la 045 queda igual.
--
-- Requiere la 045.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION schedule_block_validar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_choque TEXT;
  v_desde INT := round(NEW.start_hour * 60);
  v_hasta INT := round((NEW.start_hour + NEW.duration) * 60);
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
  -- (en minutos: terminar 9:40 y empezar 9:40 no es pisarse)
  SELECT CASE WHEN b.course_id = NEW.course_id
              THEN 'El curso ' || b.course_name || ' ya tiene ' || b.subject_name || ' en ese horario'
              ELSE 'Ese docente ya da ' || b.subject_name || ' en ' || b.course_name || ' en ese horario' END
    INTO v_choque
  FROM schedule_blocks b
  WHERE b.id IS DISTINCT FROM NEW.id
    AND b.day_index = NEW.day_index
    AND (b.course_id = NEW.course_id OR b.teacher_id = NEW.teacher_id)
    AND round(b.start_hour * 60) < v_hasta
    AND v_desde < round((b.start_hour + b.duration) * 60)
  LIMIT 1;
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION '%', v_choque USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;
