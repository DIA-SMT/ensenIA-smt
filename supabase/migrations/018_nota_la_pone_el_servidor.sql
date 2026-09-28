-- ═══════════════════════════════════════════════════════════════════
-- 018 — La nota la pone el servidor, no el celular del alumno
--
-- La policy "Students manage own submissions" (003) era FOR ALL sin
-- restricción de columnas, y el puntaje lo calculaba el navegador
-- (RealizarActividad) y lo mandaba ya hecho. Un estudiante podía:
--  · escribirse score, feedback o status = 'graded' con un UPDATE;
--  · mandar el auto_score que quisiera al entregar;
--  · cambiar las respuestas después de entregar, o borrar la entrega y
--    volver a hacerla;
--  · crear entregas para actividades que no le corresponden.
-- Y como grant_auto_achievements (007) mira score/auto_score, de paso se
-- regalaba el logro "Puntaje perfecto".
--
-- Ahora:
--  · el alumno puede ver, crear y actualizar su entrega, pero no borrarla,
--    y solo sobre actividades que ve (publicadas y de sus materias);
--  · un trigger descarta lo que no le toca escribir (score, feedback,
--    devolución, fecha de corrección) y recalcula auto_score y el
--    `correct` de cada respuesta a partir de activities.questions;
--  · una vez entregada, la entrega del alumno no se modifica más.
--
-- La nota la calcula solo la base (misma fórmula que usaba
-- RealizarActividad). Con la 019 el alumno tampoco recibe las respuestas
-- correctas antes de entregar: las ve en su entrega, ya corregida.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Policies del estudiante: sin DELETE y solo actividades visibles ──

DROP POLICY IF EXISTS "Students manage own submissions" ON activity_submissions;

CREATE POLICY "Students view own submissions"
  ON activity_submissions FOR SELECT
  USING (student_id = auth_student_id());

-- ¿La actividad es para este alumno? Publicada y de una materia+curso en
-- la que está inscripto. SECURITY DEFINER porque desde la 019 el alumno
-- no lee activities directo (vería las respuestas correctas).
CREATE OR REPLACE FUNCTION student_can_see_activity(p_activity_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM activities a
    JOIN enrollments e
      ON e.subject_id = a.subject_id AND e.course_id = a.course_id
    WHERE a.id = p_activity_id
      AND a.status = 'published'
      AND e.student_id = auth_student_id()
  )
$$;

CREATE POLICY "Students create own submissions"
  ON activity_submissions FOR INSERT
  WITH CHECK (
    student_id = auth_student_id()
    AND student_can_see_activity(activity_id)
  );

CREATE POLICY "Students update own submissions"
  ON activity_submissions FOR UPDATE
  USING (student_id = auth_student_id())
  WITH CHECK (student_id = auth_student_id());

-- ── 2. Lo que escribe el alumno pasa por acá ──

CREATE OR REPLACE FUNCTION guard_student_submission()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth_student_id();
  qs JSONB;
  pts INT;
  q JSONB;
  a JSONB;
  ans TEXT;
  ok BOOLEAN;
  mcqs INT := 0;
  hits INT := 0;
BEGIN
  -- Solo cuando escribe el propio estudiante. El docente que corrige, la
  -- service role y el SQL editor pasan derecho.
  IF me IS NULL
     OR me IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NEW.student_id ELSE OLD.student_id END)
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Ya entregada: no se toca más. Se descarta en silencio en vez de
    -- tirar error porque la cola offline puede traer un guardado tardío
    -- y reintentaría para siempre.
    IF OLD.status IN ('submitted', 'graded') THEN
      RETURN NULL;
    END IF;

    NEW.id          := OLD.id;
    NEW.activity_id := OLD.activity_id;
    NEW.student_id  := OLD.student_id;
    NEW.started_at  := OLD.started_at;
    NEW.created_at  := OLD.created_at;
  END IF;

  -- Esto lo escribe solo el docente
  NEW.score             := CASE WHEN TG_OP = 'UPDATE' THEN OLD.score END;
  NEW.feedback          := CASE WHEN TG_OP = 'UPDATE' THEN OLD.feedback END;
  NEW.feedback_reaction := CASE WHEN TG_OP = 'UPDATE' THEN OLD.feedback_reaction END;
  NEW.graded_at         := CASE WHEN TG_OP = 'UPDATE' THEN OLD.graded_at END;

  -- El alumno solo puede estar trabajando o entregar
  IF NEW.status NOT IN ('in_progress', 'submitted') THEN
    NEW.status := 'in_progress';
  END IF;

  IF NEW.status <> 'submitted' THEN
    NEW.auto_score   := NULL;
    NEW.submitted_at := NULL;
    RETURN NEW;
  END IF;

  -- ── Entrega: corrección automática de opción múltiple ──
  NEW.submitted_at := now();
  NEW.answers := COALESCE(NEW.answers, '{}'::jsonb);

  SELECT questions, points INTO qs, pts FROM activities WHERE id = NEW.activity_id;

  FOR q IN SELECT value FROM jsonb_array_elements(COALESCE(qs, '[]'::jsonb)) LOOP
    a := NEW.answers -> (q->>'id');
    CONTINUE WHEN a IS NULL OR jsonb_typeof(a) <> 'object';

    IF q->>'type' = 'multiple_choice' THEN
      -- CASE y no AND: el AND no garantiza orden, y un cast de algo que
      -- no es número tiraría abajo la entrega entera.
      ans := trim(a->>'answer');
      ok := CASE
        WHEN ans ~ '^[0-9]+$' AND (q->>'correct_index') ~ '^[0-9]+$'
          THEN ans::NUMERIC = (q->>'correct_index')::NUMERIC
        ELSE false
      END;
      IF ok THEN hits := hits + 1; END IF;
      -- correct_index viaja en la entrega: el alumno ve cuál era la
      -- correcta después de entregar, sin leer las preguntas con la
      -- respuesta (migración 019).
      NEW.answers := jsonb_set(NEW.answers, ARRAY[q->>'id'],
        a || jsonb_build_object('correct', ok, 'correct_index', q->'correct_index'));
    ELSE
      -- Las abiertas las corrige el docente: el alumno no se las marca bien
      NEW.answers := jsonb_set(NEW.answers, ARRAY[q->>'id'], a - 'correct' - 'correct_index');
    END IF;
  END LOOP;

  SELECT count(*) INTO mcqs
  FROM jsonb_array_elements(COALESCE(qs, '[]'::jsonb)) x
  WHERE x.value->>'type' = 'multiple_choice';

  -- Sobre todas las de opción múltiple, contestadas o no; sin puntaje
  -- definido, sobre 10. Igual que RealizarActividad.
  NEW.auto_score := CASE
    WHEN mcqs = 0 THEN NULL
    ELSE round(hits::NUMERIC / mcqs * COALESCE(pts, 10), 1)
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_submission ON activity_submissions;
CREATE TRIGGER trg_guard_student_submission
  BEFORE INSERT OR UPDATE ON activity_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_student_submission();
