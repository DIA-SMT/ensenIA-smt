-- ═══════════════════════════════════════════════════════════════════
-- 046 — Cuándo se lleva una materia a diciembre: cada escuela con su regla
--
-- La 024 armó la regla que se habló en la reunión del 26/8: una nota de 4
-- o menos en CUALQUIER trimestre marca "se lleva a diciembre" y se le
-- avisa a la familia. En el relevamiento (5/10) la Storni contestó que en
-- su escuela no es así:
--
--   · El 4 del 1° o del 2° trimestre se promedia: no manda a diciembre.
--   · La nota final es el promedio de los 3 trimestres, con decimales, y
--     el 3° trimestre tiene que aprobarse sí o sí con 6 o más.
--
-- Ahora cada escuela elige su regla (alert_thresholds.december_rule):
--   'trimestre' — la de la 024, sigue siendo la de siempre.
--   'anual'     — la de la Storni: va a diciembre si el 3° trimestre no
--                 llega a 6, o si el promedio de los tres no llega a 6.
--                 Una nota baja en el 1° o el 2° solo avisa a la familia
--                 que hay riesgo.
--
-- Se aprueba con 6, igual que PASSING_GRADE en src/services/libreta.service.ts.
-- Requiere la 024.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. La regla de cada escuela ──
ALTER TABLE alert_thresholds
  ADD COLUMN IF NOT EXISTS december_rule TEXT NOT NULL DEFAULT 'trimestre'
  CHECK (december_rule IN ('trimestre', 'anual'));

-- Devuelve la fila de la tabla: se re-crea para que el default de la
-- escuela sin fila también traiga la regla.
CREATE OR REPLACE FUNCTION get_alert_thresholds(p_school_id UUID)
RETURNS alert_thresholds
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r alert_thresholds;
BEGIN
  SELECT * INTO r FROM alert_thresholds WHERE school_id = p_school_id;
  IF NOT FOUND THEN
    r.school_id := p_school_id;
    r.negative_checkins_count := 2;
    r.negative_checkins_days := 7;
    r.low_score_pct := 40;
    r.inactivity_days := 14;
    r.escalation_hours := 72;
    r.grade_risk_max := 5;
    r.grade_fail_max := 4;
    r.december_rule := 'trimestre';
  END IF;
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_alert_thresholds(UUID) FROM PUBLIC, anon, authenticated;

-- Nota legible en los avisos, con coma como en la plataforma: 4.50 → "4,5"
CREATE OR REPLACE FUNCTION format_grade(g NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT replace(rtrim(to_char(g, 'FM990.99'), '.'), '.', ',')
$$;

-- ── 2. Promedio del año y "¿se lleva a diciembre?" ──

-- Promedio de los tres trimestres del año de esa nota (contando la nota
-- tal como viene, aunque todavía no esté guardada), redondeado a dos
-- decimales como en la libreta. NULL si falta alguno publicado.
CREATE OR REPLACE FUNCTION promedio_anual(t term_grades)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anio INT;
  v_prom NUMERIC;
  n INT;
BEGIN
  SELECT year INTO v_anio FROM academic_terms WHERE id = t.term_id;
  SELECT count(*), round(avg(x.nota), 2) INTO n, v_prom
  FROM (
    SELECT g.grade AS nota
    FROM term_grades g
    JOIN academic_terms a ON a.id = g.term_id
    WHERE g.student_id = t.student_id AND g.subject_id = t.subject_id AND g.course_id = t.course_id
      AND a.school_id = t.school_id AND a.year = v_anio AND g.term_id <> t.term_id
      AND g.status = 'publicada' AND g.grade IS NOT NULL
    UNION ALL
    SELECT t.grade WHERE t.status = 'publicada' AND t.grade IS NOT NULL
  ) x;
  RETURN CASE WHEN n = 3 THEN v_prom END;
END;
$$;

CREATE OR REPLACE FUNCTION lleva_a_diciembre(t term_grades)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  th alert_thresholds;
  v_num INT;
BEGIN
  IF t.status IS DISTINCT FROM 'publicada' OR t.grade IS NULL THEN
    RETURN false;
  END IF;
  th := get_alert_thresholds(t.school_id);

  IF th.december_rule = 'anual' THEN
    -- Solo el 3° trimestre decide: por su nota o por el promedio del año
    SELECT number INTO v_num FROM academic_terms WHERE id = t.term_id;
    IF v_num IS DISTINCT FROM 3 THEN
      RETURN false;
    END IF;
    RETURN t.grade < 6 OR COALESCE(promedio_anual(t) < 6, false);
  END IF;

  RETURN t.grade <= th.grade_fail_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION promedio_anual(term_grades) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lleva_a_diciembre(term_grades) FROM PUBLIC, anon, authenticated;

-- ── 3. Sello de cada nota: la regla de su escuela ──
-- Además, "quién calificó" cambia solo cuando cambia la nota o su estado:
-- recalcular el diciembre de una nota (abajo) no la vuelve de otra persona.
CREATE OR REPLACE FUNCTION stamp_term_grade()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.carries_to_december := lleva_a_diciembre(NEW);

  -- OLD no existe en INSERT: discriminar por TG_OP, no por "OLD IS NULL".
  IF auth.uid() IS NOT NULL AND (
    TG_OP = 'INSERT' OR NEW.grade IS DISTINCT FROM OLD.grade OR NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    NEW.graded_by := auth.uid();
  END IF;
  IF TG_OP = 'INSERT' OR NEW.grade IS DISTINCT FROM OLD.grade THEN
    NEW.graded_at := now();
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

-- ── 4. Aviso a la familia y señal a dirección ──
-- Igual que en la 024, pero "diciembre" es lo que selló la regla de la
-- escuela, y con la regla anual el aviso dice por qué: la nota del 3°
-- trimestre o el promedio del año.
CREATE OR REPLACE FUNCTION notify_term_grade_risk()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  th alert_thresholds;
  st RECORD;
  subj_name TEXT;
  term_name TEXT;
  categoria TEXT;
  new_alert_id UUID;
  autor UUID;
  v_prom NUMERIC;
  motivo_familia TEXT;
  motivo_alerta TEXT;
BEGIN
  IF NEW.status <> 'publicada' OR NEW.grade IS NULL THEN
    RETURN NEW;
  END IF;

  th := get_alert_thresholds(NEW.school_id);

  categoria := CASE
    WHEN NEW.carries_to_december THEN 'diciembre'
    WHEN NEW.grade <= th.grade_risk_max THEN 'riesgo'
    ELSE NULL
  END;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  SELECT name INTO subj_name FROM subjects WHERE id = NEW.subject_id;
  SELECT name INTO term_name FROM academic_terms WHERE id = NEW.term_id;

  -- La nota dejó de ser preocupante PERO ya habíamos avisado: no alcanza
  -- con olvidarlo en silencio. A la familia se le dijo que el chico se
  -- llevaba la materia; si el docente corrige, hay que desdecirlo y
  -- cerrar la alerta que quedó abierta en el tablero.
  IF categoria IS NULL THEN
    IF NEW.notified_category IS NOT NULL AND st IS NOT NULL THEN
      IF NEW.graded_by IS NOT NULL THEN
        INSERT INTO guardian_notices (school_id, student_id, from_user_id, type, title, body)
        VALUES (
          NEW.school_id, NEW.student_id, NEW.graded_by, 'comunicado',
          'Corrección de nota: ' || COALESCE(subj_name, 'materia'),
          'Estimada familia: la calificación de ' || st.first_name || ' en ' ||
          COALESCE(subj_name, 'la materia') || ' (' || COALESCE(term_name, 'trimestre') ||
          ') fue corregida a ' || format_grade(NEW.grade) ||
          '. Queda sin efecto el aviso anterior sobre esa materia.'
        );
      END IF;

      UPDATE alerts a
      SET status = 'cerrada', closed_outcome = 'resuelta', closed_at = now(),
          intervention_note = COALESCE(a.intervention_note || E'\n', '') ||
            '[Automático] La nota fue corregida a ' || format_grade(NEW.grade) || '.'
      WHERE a.school_id = NEW.school_id
        AND a.status <> 'cerrada'
        AND a.title IN ('Materia a diciembre', 'Riesgo académico en el trimestre')
        AND EXISTS (
          SELECT 1 FROM alert_students als
          WHERE als.alert_id = a.id AND als.student_id = NEW.student_id
        );

      UPDATE term_grades SET notified_category = NULL WHERE id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.notified_category IS NOT DISTINCT FROM categoria THEN
    RETURN NEW;
  END IF;

  IF st IS NULL THEN RETURN NEW; END IF;

  autor := NEW.graded_by;
  IF autor IS NULL THEN
    SELECT id INTO autor FROM profiles
    WHERE school_id = NEW.school_id AND role = 'director' LIMIT 1;
  END IF;

  -- Aviso a la familia por el canal existente (con acuse de recibo).
  -- Si no hay autor posible (sin sesión y sin director dado de alta) NO
  -- se marca notified_category: el aviso se reintenta en la próxima
  -- publicación, en vez de perderse en silencio. Mismo criterio que
  -- escalate_stale_alerts() en la 010.
  IF autor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Por qué se lleva la materia (con la regla anual hay dos motivos)
  IF categoria = 'diciembre' AND th.december_rule = 'anual' AND NEW.grade >= 6 THEN
    v_prom := promedio_anual(NEW);
    motivo_familia := ' terminó el año en ' || COALESCE(subj_name, 'la materia') ||
      ' con un promedio de ' || format_grade(v_prom) ||
      ', y para aprobar hace falta 6. La materia se lleva a diciembre.';
    motivo_alerta := ' terminó el año con promedio ' || format_grade(v_prom) ||
      ' en ' || COALESCE(subj_name, 'una materia') || '. Se lleva la materia a diciembre.';
  ELSIF categoria = 'diciembre' AND th.december_rule = 'anual' THEN
    motivo_familia := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'la materia') ||
      ' durante el ' || COALESCE(term_name, 'trimestre') ||
      '. El 3° trimestre se aprueba con 6 o más: la materia se lleva a diciembre.';
    motivo_alerta := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'una materia') ||
      ' (' || COALESCE(term_name, 'trimestre') || '). Se lleva la materia a diciembre.';
  ELSIF categoria = 'diciembre' THEN
    motivo_familia := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'la materia') ||
      ' durante el ' || COALESCE(term_name, 'trimestre') ||
      '. Con esta calificación la materia se lleva a diciembre.';
    motivo_alerta := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'una materia') ||
      ' (' || COALESCE(term_name, 'trimestre') || '). Se lleva la materia a diciembre.';
  ELSE
    motivo_familia := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'la materia') ||
      ' durante el ' || COALESCE(term_name, 'trimestre') ||
      '. Es una situación de riesgo todavía recuperable: con acompañamiento puede revertirla en el trimestre siguiente.';
    motivo_alerta := ' obtuvo ' || format_grade(NEW.grade) || ' en ' || COALESCE(subj_name, 'una materia') ||
      ' (' || COALESCE(term_name, 'trimestre') || '). Todavía es recuperable.';
  END IF;

  INSERT INTO guardian_notices (school_id, student_id, from_user_id, type, title, body)
    VALUES (
      NEW.school_id, NEW.student_id, autor, 'comunicado',
      CASE categoria
        WHEN 'diciembre' THEN 'Materia a diciembre: ' || COALESCE(subj_name, 'materia')
        ELSE 'Situación de riesgo en ' || COALESCE(subj_name, 'materia')
      END,
      'Estimada familia: ' || st.first_name || motivo_familia ||
      CASE categoria WHEN 'diciembre'
        THEN ' Los invitamos a acercarse a la escuela para acordar un plan de acompañamiento.'
        ELSE '' END
    );

  -- Señal para el tablero directivo, con el ciclo de vida de la 010.
  INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
  VALUES (
    -- El CASE resuelve a text: alert_level es enum y necesita cast explícito.
    (CASE categoria WHEN 'diciembre' THEN 'danger' ELSE 'warning' END)::alert_level,
    'academic'::alert_category,
    CASE categoria WHEN 'diciembre' THEN 'Materia a diciembre' ELSE 'Riesgo académico en el trimestre' END,
    st.first_name || ' ' || st.last_name || motivo_alerta || ' La familia fue notificada.',
    'Hoy', NEW.graded_by, NEW.school_id
  )
  RETURNING id INTO new_alert_id;

  INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, NEW.student_id);

  UPDATE term_grades SET notified_category = categoria WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- ── 5. Con la regla anual, el 1° y el 2° cuentan para el promedio ──
-- Si se carga o corrige una nota del 1° o del 2° trimestre cuando el 3°
-- ya estaba publicado, se recalcula si el 3° se lleva la materia. Igual
-- que la 024 al cambiar el umbral: se corrige el dato, sin volver a
-- mandarle avisos a la familia (el trigger de aviso escucha solo
-- "UPDATE OF status, grade").
CREATE OR REPLACE FUNCTION recalcular_diciembre_del_anio()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r term_grades;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;

  UPDATE term_grades t3
  SET carries_to_december = lleva_a_diciembre(t3)
  FROM academic_terms a, academic_terms a3
  WHERE a.id = r.term_id AND a.number IN (1, 2)
    AND t3.student_id = r.student_id AND t3.subject_id = r.subject_id AND t3.course_id = r.course_id
    AND a3.id = t3.term_id AND a3.number = 3 AND a3.year = a.year AND a3.school_id = a.school_id
    AND t3.carries_to_december IS DISTINCT FROM lleva_a_diciembre(t3);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_term_grades_recalcular_anio ON term_grades;
CREATE TRIGGER trg_term_grades_recalcular_anio
  AFTER INSERT OR UPDATE OF status, grade OR DELETE ON term_grades
  FOR EACH ROW EXECUTE FUNCTION recalcular_diciembre_del_anio();

-- ── 6. Si la escuela cambia el umbral o la regla, se recalcula ──
-- Ahora también cuando la escuela crea su fila (antes usaba los valores
-- por defecto) y cuando cambia de regla.
CREATE OR REPLACE FUNCTION resync_carries_to_december()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.grade_fail_max IS DISTINCT FROM OLD.grade_fail_max
     OR NEW.december_rule IS DISTINCT FROM OLD.december_rule THEN
    UPDATE term_grades tg
    SET carries_to_december = lleva_a_diciembre(tg)
    WHERE tg.school_id = NEW.school_id
      AND tg.carries_to_december IS DISTINCT FROM lleva_a_diciembre(tg);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thresholds_resync_grades ON alert_thresholds;
CREATE TRIGGER trg_thresholds_resync_grades
  AFTER INSERT OR UPDATE ON alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION resync_carries_to_december();

-- ── 7. La Storni: regla anual (relevamiento del 5/10) ──
INSERT INTO alert_thresholds (school_id, december_rule)
SELECT id, 'anual' FROM schools WHERE name = 'Escuela Municipal Alfonsina Storni Secundaria'
ON CONFLICT (school_id) DO UPDATE SET december_rule = 'anual';

-- Comprobación: la regla de cada escuela (la Storni tiene que decir "anual")
SELECT s.name AS escuela, (get_alert_thresholds(s.id)).december_rule AS regla_diciembre
FROM schools s
ORDER BY s.name;
