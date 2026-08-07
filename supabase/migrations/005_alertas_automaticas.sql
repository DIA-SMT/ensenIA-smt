-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 005: Alertas automáticas
--  El sistema empieza a "comprender": señales negativas
--  repetidas y bajo desempeño generan alertas solas.
-- ═══════════════════════════════════════════════

-- ── 1. Check-ins negativos repetidos → alerta a los docentes del curso ──
CREATE OR REPLACE FUNCTION notify_negative_checkins()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  neg_count INT;
  st RECORD;
  t RECORD;
  new_alert_id UUID;
BEGIN
  IF NEW.feeling NOT IN ('frustrado', 'confundido') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO neg_count
  FROM student_checkins
  WHERE student_id = NEW.student_id
    AND feeling IN ('frustrado', 'confundido')
    AND created_at > now() - interval '7 days';

  IF neg_count < 2 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  IF st IS NULL THEN RETURN NEW; END IF;

  FOR t IN
    SELECT DISTINCT ta.teacher_id
    FROM teacher_assignments ta
    WHERE ta.course_id = st.course_id
  LOOP
    -- dedup: no repetir la misma alerta por docente/estudiante en 3 días
    IF NOT EXISTS (
      SELECT 1 FROM alerts a
      JOIN alert_students als ON als.alert_id = a.id
      WHERE als.student_id = st.id
        AND a.teacher_id = t.teacher_id
        AND a.title = 'Señales emocionales negativas'
        AND a.created_at > now() - interval '3 days'
    ) THEN
      INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
      VALUES (
        'warning', 'academic', 'Señales emocionales negativas',
        st.first_name || ' ' || st.last_name || ' registró ' || neg_count ||
          ' check-ins negativos (confundido/frustrado) en la última semana. Puede necesitar acompañamiento.',
        'Hoy', t.teacher_id, st.school_id
      )
      RETURNING id INTO new_alert_id;

      INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_negative_checkins
  AFTER INSERT ON student_checkins
  FOR EACH ROW EXECUTE FUNCTION notify_negative_checkins();

-- ── 2. Entrega con bajo desempeño → alerta al docente de la actividad ──
CREATE OR REPLACE FUNCTION notify_low_performance()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act RECORD;
  st RECORD;
  pct NUMERIC;
  new_alert_id UUID;
BEGIN
  IF NEW.status <> 'submitted' OR (OLD.status IS NOT DISTINCT FROM 'submitted') THEN
    RETURN NEW;
  END IF;
  IF NEW.auto_score IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO act FROM activities WHERE id = NEW.activity_id;
  IF act IS NULL OR act.points IS NULL OR act.points = 0 THEN
    RETURN NEW;
  END IF;

  pct := NEW.auto_score / act.points;
  IF pct > 0.4 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  IF st IS NULL THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM alerts a
    JOIN alert_students als ON als.alert_id = a.id
    WHERE als.student_id = st.id
      AND a.teacher_id = act.teacher_id
      AND a.title = 'Bajo desempeño en actividad'
      AND a.created_at > now() - interval '1 day'
  ) THEN
    INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
    VALUES (
      'danger', 'academic', 'Bajo desempeño en actividad',
      st.first_name || ' ' || st.last_name || ' obtuvo ' || NEW.auto_score || '/' || act.points ||
        ' en "' || act.title || '". Revisá sus respuestas y su huella digital.',
      'Hoy', act.teacher_id, st.school_id
    )
    RETURNING id INTO new_alert_id;

    INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, st.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_low_performance
  AFTER UPDATE ON activity_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_low_performance();
