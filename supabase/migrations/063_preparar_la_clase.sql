-- ═══════════════════════════════════════════════════════════════════
-- 063 — Preparar la clase: trabajos prácticos por partes, borradores y
--       material ordenado por tema
--
-- Lo que pidió el docente después de planificar: armar el material de
-- cada tema en orden (presentación, trabajo práctico, evaluación) y
-- dejarles actividades a los chicos.
--
--  · activities.tipo: actividad, trabajo práctico o evaluación.
--  · Cada parte (questions[]) puede tener sus puntos (`points`). Si los
--    tiene, el puntaje total es la suma y la corrección automática suma
--    los puntos de las de opción múltiple bien contestadas. Sin puntos
--    por parte, todo sigue como en la 018.
--  · activity_submissions.puntajes: lo que el docente le pone a cada
--    parte al corregir. El alumno no lo escribe.
--  · Borradores: la actividad se puede guardar sin publicar (el alumno no
--    la ve: student_activities filtra 'published') y editar después de
--    publicada. Con entregas, se pueden corregir textos, la respuesta
--    correcta y los puntos (las entregas se vuelven a corregir solas),
--    pero no agregar, quitar ni reordenar partes ni opciones, cambiar de
--    curso o volver a borrador.
--  · El tema (class_id) de una actividad o un material tiene que ser de
--    la planificación del mismo docente, materia y curso.
--  · Lo de papel en el mismo lugar (secciones 8 y 9): la entrega en papel
--    o "no entregó" dentro de la actividad de la app, y en las
--    evaluaciones del trimestre lo que no lleva nota (control de carpeta).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Columnas nuevas ──

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'actividad',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE activities ADD CONSTRAINT activities_tipo_valido
    CHECK (tipo IN ('actividad', 'tp', 'evaluacion'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE activities SET published_at = created_at
WHERE status <> 'draft' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_class ON activities(class_id) WHERE class_id IS NOT NULL;

-- puntajes: {questionId: puntos}. registro: lo que el docente anota de lo
-- que pasó fuera de la app ('papel': lo entregó en papel; 'no_entrego').
-- Solo los escribe el docente.
ALTER TABLE activity_submissions
  ADD COLUMN IF NOT EXISTS puntajes JSONB,
  ADD COLUMN IF NOT EXISTS registro TEXT;

DO $$ BEGIN
  ALTER TABLE activity_submissions ADD CONSTRAINT activity_submissions_registro_valido
    CHECK (registro IN ('papel', 'no_entrego'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Corrección automática (una sola fórmula para todos) ──

-- Puntos de una parte; sin puntos o con algo que no es número, 0.
CREATE OR REPLACE FUNCTION puntos_de_parte(q JSONB)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(q->'points') = 'number' THEN (q->>'points')::NUMERIC ELSE 0 END
$$;

-- ¿Alguna parte tiene puntos? Entonces la actividad se corrige por partes.
CREATE OR REPLACE FUNCTION tiene_puntos_por_parte(qs JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(qs) = 'array' THEN qs ELSE '[]'::jsonb END) x
    WHERE jsonb_typeof(x.value->'points') = 'number'
  )
$$;

-- Marca cada respuesta de opción múltiple (correct, correct_index) y
-- calcula auto_score.
--  · Sin puntos por parte (como la 018): sobre todas las de opción
--    múltiple, contestadas o no, escalado a `points` (o a 10).
--  · Con puntos por parte: la suma de los puntos de las de opción múltiple
--    bien contestadas. Si hay una abierta que vale puntos, NULL: la nota
--    la pone el docente y un subtotal de opción múltiple no es la nota
--    (las alertas de bajo desempeño lo leerían como si lo fuera).
CREATE OR REPLACE FUNCTION corregir_respuestas(p_questions JSONB, p_points INT, p_answers JSONB,
  OUT respuestas JSONB, OUT auto_score NUMERIC)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  qs JSONB := CASE WHEN jsonb_typeof(p_questions) = 'array' THEN p_questions ELSE '[]'::jsonb END;
  q JSONB;
  a JSONB;
  ans TEXT;
  ok BOOLEAN;
  mcqs INT := 0;
  hits INT := 0;
  suma NUMERIC := 0;
  por_partes BOOLEAN := tiene_puntos_por_parte(qs);
  abiertas_con_puntos BOOLEAN := false;
BEGIN
  respuestas := CASE WHEN jsonb_typeof(p_answers) = 'object' THEN p_answers ELSE '{}'::jsonb END;

  FOR q IN SELECT value FROM jsonb_array_elements(qs) LOOP
    IF q->>'type' = 'multiple_choice' THEN
      mcqs := mcqs + 1;
    ELSIF puntos_de_parte(q) > 0 THEN
      abiertas_con_puntos := true;
    END IF;

    a := respuestas -> (q->>'id');
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
      IF ok THEN
        hits := hits + 1;
        suma := suma + puntos_de_parte(q);
      END IF;
      respuestas := jsonb_set(respuestas, ARRAY[q->>'id'],
        a || jsonb_build_object('correct', ok, 'correct_index', q->'correct_index'));
    ELSE
      -- Las abiertas las corrige el docente: el alumno no se las marca bien
      respuestas := jsonb_set(respuestas, ARRAY[q->>'id'], a - 'correct' - 'correct_index');
    END IF;
  END LOOP;

  auto_score := CASE
    WHEN mcqs = 0 THEN NULL
    WHEN por_partes AND abiertas_con_puntos THEN NULL
    WHEN por_partes THEN suma
    ELSE round(hits::NUMERIC / mcqs * COALESCE(p_points, 10), 1)
  END;
END;
$$;

-- ── 3. Lo que escribe el alumno (reemplaza la de la 018) ──
-- Igual que antes, más: no escribe puntajes, y la corrección sale de
-- corregir_respuestas.

CREATE OR REPLACE FUNCTION guard_student_submission()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me UUID := auth_student_id();
  qs JSONB;
  pts INT;
  c RECORD;
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
    -- La fila que creó el docente ("no entregó") no tiene started_at: la
    -- pone la base cuando el alumno empieza. Así "empezó" se sabe por la
    -- base y no por lo que mande el celular.
    NEW.started_at  := COALESCE(OLD.started_at, now());
    NEW.created_at  := OLD.created_at;
  END IF;

  -- Esto lo escribe solo el docente
  NEW.score             := CASE WHEN TG_OP = 'UPDATE' THEN OLD.score END;
  NEW.feedback          := CASE WHEN TG_OP = 'UPDATE' THEN OLD.feedback END;
  NEW.feedback_reaction := CASE WHEN TG_OP = 'UPDATE' THEN OLD.feedback_reaction END;
  NEW.graded_at         := CASE WHEN TG_OP = 'UPDATE' THEN OLD.graded_at END;
  NEW.puntajes          := CASE WHEN TG_OP = 'UPDATE' THEN OLD.puntajes END;
  -- "No entregó" lo marca el docente; si después entrega, deja de valer
  NEW.registro          := CASE WHEN TG_OP = 'UPDATE' AND NEW.status <> 'submitted' THEN OLD.registro END;

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
  SELECT questions, points INTO qs, pts FROM activities WHERE id = NEW.activity_id;
  SELECT * INTO c FROM corregir_respuestas(qs, pts, NEW.answers);
  NEW.answers    := c.respuestas;
  NEW.auto_score := c.auto_score;

  RETURN NEW;
END;
$$;

-- ── 4. Puntaje por parte que pone el docente ──

CREATE OR REPLACE FUNCTION validar_puntajes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qs JSONB;
  pts INT;
  k TEXT;
  v JSONB;
  q JSONB;
  ord BIGINT;
  tope NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.puntajes IS NOT DISTINCT FROM OLD.puntajes THEN
    RETURN NEW;
  END IF;
  IF NEW.puntajes IS NULL OR NEW.puntajes = '{}'::jsonb THEN
    NEW.puntajes := NULL;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.puntajes) <> 'object' THEN
    RAISE EXCEPTION 'Los puntajes por parte no tienen el formato esperado.' USING ERRCODE = '22023';
  END IF;

  SELECT questions, points INTO qs, pts FROM activities WHERE id = NEW.activity_id;

  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.puntajes) LOOP
    SELECT x.value, x.ord INTO q, ord
    FROM jsonb_array_elements(COALESCE(qs, '[]'::jsonb)) WITH ORDINALITY AS x(value, ord)
    WHERE x.value->>'id' = k;
    IF q IS NULL THEN
      RAISE EXCEPTION 'Hay un puntaje para una parte que la actividad ya no tiene. Volvé a abrir la entrega.'
        USING ERRCODE = '22023';
    END IF;
    tope := CASE WHEN jsonb_typeof(q->'points') = 'number' THEN puntos_de_parte(q) ELSE COALESCE(pts, 100) END;
    IF jsonb_typeof(v) <> 'number' OR v::TEXT::NUMERIC < 0 OR v::TEXT::NUMERIC > tope THEN
      RAISE EXCEPTION 'El puntaje de la parte % va de 0 a %.', ord, tope USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Después de trg_guard_student_submission (los BEFORE corren por nombre):
-- lo que manda el alumno ya llega acá sin puntajes.
DROP TRIGGER IF EXISTS trg_validar_puntajes ON activity_submissions;
CREATE TRIGGER trg_validar_puntajes
  BEFORE INSERT OR UPDATE OF puntajes ON activity_submissions
  FOR EACH ROW EXECUTE FUNCTION validar_puntajes();

-- ── 5. Cuidar la actividad: puntos, borradores, edición con entregas, tema ──

-- La estructura de las partes: lo que no puede cambiar si ya hay entregas
-- (las respuestas guardan el índice de la opción elegida).
CREATE OR REPLACE FUNCTION forma_de_partes(qs JSONB)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.value->'id',
           'type', x.value->'type',
           'opciones', CASE WHEN jsonb_typeof(x.value->'options') = 'array'
                            THEN jsonb_array_length(x.value->'options') ELSE 0 END
         ) ORDER BY x.ord), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(qs) = 'array' THEN qs ELSE '[]'::jsonb END)
       WITH ORDINALITY AS x(value, ord)
$$;

CREATE OR REPLACE FUNCTION cuidar_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q JSONB;
  suma NUMERIC;
  ids TEXT[];
  v_unidad UUID;
  hay_entregas BOOLEAN;
BEGIN
  -- ── Partes ──
  -- Solo cuando cambian: una actividad vieja con partes raras se tiene que
  -- poder seguir cerrando o renombrando.
  IF TG_OP = 'INSERT' OR NEW.questions IS DISTINCT FROM OLD.questions THEN
    IF NEW.questions IS NULL OR jsonb_typeof(NEW.questions) <> 'array' THEN
      RAISE EXCEPTION 'Las partes de la actividad no tienen el formato esperado.' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(x.value->>'id') INTO ids FROM jsonb_array_elements(NEW.questions) x;
    IF EXISTS (SELECT 1 FROM unnest(ids) i WHERE i IS NULL OR i = '')
       OR (SELECT count(DISTINCT i) FROM unnest(ids) i) <> COALESCE(array_length(ids, 1), 0) THEN
      RAISE EXCEPTION 'Cada parte tiene que tener un identificador propio.' USING ERRCODE = '22023';
    END IF;

    FOR q IN SELECT value FROM jsonb_array_elements(NEW.questions) LOOP
      -- CASE y no AND: el AND no garantiza orden y el cast de algo que no
      -- es número saldría con un error que el docente no entiende. Entre
      -- paréntesis: si no, el THEN del CASE cierra el IF.
      IF jsonb_typeof(q->'points') IS NOT NULL AND jsonb_typeof(q->'points') <> 'null' AND NOT (CASE
           WHEN jsonb_typeof(q->'points') = 'number'
             THEN (q->>'points')::NUMERIC BETWEEN 0 AND 100
                  AND (q->>'points')::NUMERIC * 2 = trunc((q->>'points')::NUMERIC * 2)
           ELSE false
         END) THEN
        RAISE EXCEPTION 'Cada parte vale entre 0 y 100 puntos, enteros o con medio punto.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  -- Con puntos por parte, el total es la suma (y tiene que ser entero:
  -- la nota final es "sobre" ese número).
  IF (TG_OP = 'INSERT' OR NEW.questions IS DISTINCT FROM OLD.questions OR NEW.points IS DISTINCT FROM OLD.points)
     AND tiene_puntos_por_parte(NEW.questions) THEN
    SELECT sum(puntos_de_parte(x.value)) INTO suma FROM jsonb_array_elements(NEW.questions) x;
    IF suma <> trunc(suma) THEN
      RAISE EXCEPTION 'Los puntos de las partes suman %: tienen que sumar un número entero.', suma
        USING ERRCODE = '22023';
    END IF;
    IF suma < 1 OR suma > 999 THEN
      RAISE EXCEPTION 'Los puntos de las partes tienen que sumar entre 1 y 999.' USING ERRCODE = '22023';
    END IF;
    NEW.points := suma::INT;
  ELSIF (TG_OP = 'INSERT' OR NEW.points IS DISTINCT FROM OLD.points)
        AND NEW.points IS NOT NULL AND (NEW.points < 1 OR NEW.points > 999) THEN
    -- auto_score y score son NUMERIC(5,2): más de 999 no entra
    RAISE EXCEPTION 'El puntaje total va de 1 a 999.' USING ERRCODE = '22023';
  END IF;

  -- ── Publicación ──
  -- published_at: la primera vez que se publicó, y no se mueve más
  IF TG_OP = 'INSERT' THEN
    NEW.published_at := CASE WHEN NEW.status <> 'draft' THEN now() END;
  ELSE
    NEW.published_at := COALESCE(OLD.published_at, CASE WHEN NEW.status <> 'draft' THEN now() END);
  END IF;

  -- ── Con entregas, la estructura queda ──
  IF TG_OP = 'UPDATE' AND (
       forma_de_partes(NEW.questions) IS DISTINCT FROM forma_de_partes(OLD.questions)
       OR (NEW.status = 'draft' AND OLD.status <> 'draft')
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
     ) THEN
    hay_entregas := EXISTS (SELECT 1 FROM activity_submissions s WHERE s.activity_id = NEW.id);
    IF hay_entregas THEN
      IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
          RAISE EXCEPTION 'Ya hay entregas en esta actividad: no puede volver a borrador. Si querés que no la vean más, cerrala.'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
        RAISE EXCEPTION 'Ya hay entregas en esta actividad: no se puede pasar a otro curso. Copiala a ese curso.'
          USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'Ya hay entregas en esta actividad: podés corregir los textos, la respuesta correcta y los puntos, pero no agregar, quitar ni reordenar partes u opciones. Para eso, duplicala como borrador desde el editor.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── El tema es de su planificación ──
  -- El SQL editor y la service role (seeds) pasan derecho.
  IF NEW.class_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR NEW.class_id IS DISTINCT FROM OLD.class_id
       OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
     ) THEN
    SELECT u.id INTO v_unidad
    FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = NEW.class_id
      AND u.teacher_id = NEW.teacher_id
      AND u.subject_id = NEW.subject_id
      AND u.course_id = NEW.course_id;
    IF v_unidad IS NULL THEN
      RAISE EXCEPTION 'Ese tema no es de tu planificación de esta materia y este curso.' USING ERRCODE = '42501';
    END IF;
    NEW.unit_id := v_unidad;
  ELSIF NEW.unit_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
     ) AND NOT EXISTS (
       SELECT 1 FROM planning_units u
       WHERE u.id = NEW.unit_id
         AND u.teacher_id = NEW.teacher_id
         AND u.subject_id = NEW.subject_id
         AND u.course_id = NEW.course_id
     ) THEN
    -- La unidad sola (sin tema) también tiene que ser de su planificación
    RAISE EXCEPTION 'Esa unidad no es de tu planificación de esta materia y este curso.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cuidar_actividad ON activities;
CREATE TRIGGER trg_cuidar_actividad
  BEFORE INSERT OR UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION cuidar_actividad();

-- Si el docente corrige la respuesta correcta o los puntos, las entregas
-- ya hechas se vuelven a corregir. La nota que ya puso (score) no se toca:
-- la decide él.
CREATE OR REPLACE FUNCTION recorregir_entregas()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lo entregado en papel no tiene respuestas en la app: no se corrige
  -- (si no, quedaría con auto_score 0 y un 1 en la libreta). Y solo se
  -- escribe lo que cambia: cada escritura dispara los logros (007).
  UPDATE activity_submissions s
  SET answers = c.respuestas, auto_score = c.auto_score
  FROM (
    SELECT x.id, r.respuestas, r.auto_score
    FROM activity_submissions x,
         LATERAL corregir_respuestas(NEW.questions, NEW.points, x.answers) r
    WHERE x.activity_id = NEW.id
      AND x.status IN ('submitted', 'graded')
      AND x.registro IS NULL
  ) c
  WHERE s.id = c.id
    AND (s.answers IS DISTINCT FROM c.respuestas OR s.auto_score IS DISTINCT FROM c.auto_score);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recorregir_entregas ON activities;
CREATE TRIGGER trg_recorregir_entregas
  AFTER UPDATE OF questions, points ON activities
  FOR EACH ROW
  WHEN (OLD.questions IS DISTINCT FROM NEW.questions OR OLD.points IS DISTINCT FROM NEW.points)
  EXECUTE FUNCTION recorregir_entregas();

-- ── 6. El tema de un material es de su planificación ──

CREATE OR REPLACE FUNCTION material_del_tema()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.class_id IS NULL OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id
     AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
     AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id
     AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id THEN
    RETURN NEW;
  END IF;
  -- Material para "todos mis cursos" (course_id NULL): cualquier tema de
  -- esa materia. Material de un curso: un tema de ese curso.
  IF NOT EXISTS (
    SELECT 1 FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = NEW.class_id
      AND u.teacher_id = NEW.teacher_id
      AND u.subject_id = NEW.subject_id
      AND (NEW.course_id IS NULL OR u.course_id = NEW.course_id)
  ) THEN
    RAISE EXCEPTION 'Ese tema no es de tu planificación de esta materia y este curso.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_del_tema ON library_materials;
CREATE TRIGGER trg_material_del_tema
  BEFORE INSERT OR UPDATE OF class_id, teacher_id, subject_id, course_id ON library_materials
  FOR EACH ROW EXECUTE FUNCTION material_del_tema();

-- ── 7. Lo que ve el alumno: el tipo y desde cuándo está publicada ──
-- Mismas columnas que la 019, en el mismo orden, y dos nuevas al final.
-- `points` de cada parte viaja (no es secreto); correct_index no.

CREATE OR REPLACE VIEW student_activities AS
SELECT
  a.id,
  a.title,
  a.description,
  a.content_md,
  COALESCE(
    (SELECT jsonb_agg(q.value - 'correct_index' ORDER BY q.ord)
     FROM jsonb_array_elements(a.questions) WITH ORDINALITY AS q(value, ord)),
    '[]'::jsonb
  ) AS questions,
  a.subject_id,
  a.course_id,
  a.teacher_id,
  a.school_id,
  a.unit_id,
  a.class_id,
  a.source_tool,
  a.status,
  a.due_date,
  a.points,
  a.created_at,
  a.updated_at,
  a.tipo,
  a.published_at
FROM activities a
WHERE a.status = 'published'
  AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth_student_id()
      AND e.subject_id = a.subject_id
      AND e.course_id = a.course_id
  );

-- Solo lectura (lo mismo que la 064, por si esta corre antes): sin el
-- REVOKE a authenticated, la vista aceptaría UPDATE, INSERT y DELETE
-- saltando la RLS de activities.
REVOKE ALL ON student_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON student_activities TO authenticated;
ALTER VIEW student_activities SET (security_barrier = true);

-- ═══════════════════════════════════════════════════════════════════
-- Lo digital y lo de papel, en el mismo lugar
--
-- Los TP y las evaluaciones terminan en la nota del trimestre y en el
-- concepto, y de cada estudiante tiene que quedar registro de todo, se
-- haya hecho en la app o en papel. Sin escanear nada: se anota.
--
--  · En una actividad de la app, el docente anota la entrega en papel
--    (con nota, puntaje por parte y devolución) o que no la entregó. Así
--    un TP que unos hicieron en el celular y otros en la carpeta es una
--    sola columna de la libreta.
--  · En las evaluaciones del trimestre (050), además de la nota de 1 a 10,
--    lo que se registra sin nota: carpeta completa, incompleta o que no
--    la trajo; entregó o no entregó. Y un comentario corto por estudiante.
-- ═══════════════════════════════════════════════════════════════════

-- ── 8. Entrega anotada por el docente ──
-- p_registro: 'papel' | 'no_entrego' | NULL (borrar lo anotado).
-- Con nota, queda corregida; sin nota, entregada (papel) o pendiente.
CREATE OR REPLACE FUNCTION registrar_entrega_docente(
  p_activity UUID,
  p_student UUID,
  p_registro TEXT,
  p_score NUMERIC DEFAULT NULL,
  p_puntajes JSONB DEFAULT NULL,
  p_feedback TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a activities%ROWTYPE;
  s activity_submissions%ROWTYPE;
  v_id UUID;
  v_feedback TEXT := NULLIF(trim(COALESCE(p_feedback, '')), '');
BEGIN
  SELECT * INTO a FROM activities WHERE id = p_activity;
  IF a.id IS NULL OR a.teacher_id IS DISTINCT FROM auth.uid()
     OR NOT COALESCE(teaches(a.subject_id, a.course_id), false) THEN
    RAISE EXCEPTION 'Esta actividad no es tuya.' USING ERRCODE = '42501';
  END IF;
  IF a.status = 'draft' THEN
    RAISE EXCEPTION 'La actividad todavía es un borrador: publicala antes de anotar entregas.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = p_student AND e.subject_id = a.subject_id AND e.course_id = a.course_id
  ) THEN
    RAISE EXCEPTION 'Ese estudiante no cursa esta materia en este curso.' USING ERRCODE = '42501';
  END IF;
  IF p_registro IS NOT NULL AND p_registro NOT IN ('papel', 'no_entrego') THEN
    RAISE EXCEPTION 'No se reconoce lo que se quiere anotar.' USING ERRCODE = '22023';
  END IF;
  -- "No entregó" no lleva nota ni puntajes: con nota quedaría 'graded' y
  -- contaría como entrega (logros, señales tempranas). Si corresponde un 1,
  -- va en la nota del trimestre.
  IF p_registro = 'no_entrego' AND (p_score IS NOT NULL OR p_puntajes IS NOT NULL) THEN
    RAISE EXCEPTION 'Si no lo entregó, no lleva nota acá: la nota va en la libreta del trimestre.' USING ERRCODE = '22023';
  END IF;
  IF p_score IS NOT NULL AND (p_score < 0 OR p_score > COALESCE(a.points, 100)) THEN
    RAISE EXCEPTION 'La nota va de 0 a %.', COALESCE(a.points, 100) USING ERRCODE = '22023';
  END IF;
  IF char_length(v_feedback) > 2000 THEN
    RAISE EXCEPTION 'La devolución es demasiado larga.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM activity_submissions
  WHERE activity_id = p_activity AND student_id = p_student
  FOR UPDATE;

  -- Lo que entregó en la app se corrige en su entrega: no se pisa
  IF s.id IS NOT NULL AND s.registro IS NULL AND s.status IN ('submitted', 'graded') THEN
    RAISE EXCEPTION 'Ya lo entregó en la app: corregí su entrega.' USING ERRCODE = 'P0001';
  END IF;

  -- Borrar lo anotado (por ejemplo, se anotó al estudiante equivocado)
  IF p_registro IS NULL THEN
    IF s.id IS NULL OR s.registro IS NULL THEN
      RETURN s.id;
    END IF;
    -- Se borra solo lo que el alumno nunca tocó: la fila que creó el
    -- docente y sigue pendiente, o la de papel sin nada de la app. Si el
    -- alumno ya la abrió, borrarla le haría perder lo que está haciendo.
    IF (s.status = 'pending'
        OR (s.registro = 'papel' AND s.started_at IS NULL
            AND COALESCE(s.answers, '{}'::jsonb) = '{}'::jsonb AND s.response_text IS NULL)) THEN
      DELETE FROM activity_submissions WHERE id = s.id;
      RETURN NULL;
    END IF;
    IF s.status = 'in_progress' THEN
      -- La está haciendo: solo se saca la marca
      UPDATE activity_submissions SET registro = NULL WHERE id = s.id;
      RETURN s.id;
    END IF;
    -- Había empezado en la app: vuelve a estar en curso, como la dejó
    UPDATE activity_submissions
    SET registro = NULL, status = 'in_progress', score = NULL, puntajes = NULL, feedback = NULL,
        graded_at = NULL, submitted_at = NULL, auto_score = NULL
    WHERE id = s.id;
    RETURN s.id;
  END IF;

  IF s.id IS NULL THEN
    INSERT INTO activity_submissions (activity_id, student_id, status, registro, score, puntajes, feedback,
                                      submitted_at, graded_at)
    VALUES (
      p_activity, p_student,
      (CASE WHEN p_score IS NOT NULL THEN 'graded' WHEN p_registro = 'papel' THEN 'submitted' ELSE 'pending' END)::submission_status,
      p_registro, p_score, p_puntajes, v_feedback,
      CASE WHEN p_registro = 'papel' THEN now() END,
      CASE WHEN p_score IS NOT NULL THEN now() END
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE activity_submissions
  SET registro = p_registro,
      status = (CASE
        WHEN p_score IS NOT NULL THEN 'graded'
        WHEN p_registro = 'papel' THEN 'submitted'
        WHEN s.status = 'in_progress' THEN 'in_progress'
        ELSE 'pending'
      END)::submission_status,
      score = p_score,
      puntajes = p_puntajes,
      feedback = v_feedback,
      auto_score = NULL,
      submitted_at = CASE WHEN p_registro = 'papel' THEN COALESCE(s.submitted_at, now()) END,
      graded_at = CASE WHEN p_score IS NOT NULL THEN now() END
  WHERE id = s.id;
  RETURN s.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION registrar_entrega_docente(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_entrega_docente(UUID, UUID, TEXT, NUMERIC, JSONB, TEXT) TO authenticated;

-- ── 8b. updated_at de la entrega es actividad del alumno ──
-- detect_silent_students (023) toma max(updated_at) como "lo vimos por
-- última vez", y las señales tempranas (016) cuentan entregas recientes por
-- updated_at. Si lo que escribe el docente (corregir, anotar "no entregó",
-- volver a corregir por la clave) movía esa fecha, anotarle "no entregó" a
-- un chico desenganchado le apagaba justo a él la alerta de abandono.
-- Ahora solo la mueve el alumno, o la entrega en papel (que sí es suya).
CREATE OR REPLACE FUNCTION hora_del_alumno()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  es_el_alumno BOOLEAN := auth_student_id() IS NOT DISTINCT FROM NEW.student_id AND auth_student_id() IS NOT NULL;
BEGIN
  -- Service role y SQL editor (sin sesión): como siempre
  IF auth.uid() IS NULL OR es_el_alumno THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := CASE WHEN NEW.registro = 'papel' THEN now() END;
  ELSIF NEW.registro = 'papel' AND OLD.registro IS DISTINCT FROM 'papel' THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

-- "trg_zz": los BEFORE corren por nombre, este va después de
-- trg_submissions_updated (que pone now()).
DROP TRIGGER IF EXISTS trg_zz_hora_del_alumno ON activity_submissions;
CREATE TRIGGER trg_zz_hora_del_alumno
  BEFORE INSERT OR UPDATE ON activity_submissions
  FOR EACH ROW EXECUTE FUNCTION hora_del_alumno();

-- ── 9. Evaluaciones del trimestre: también lo que no lleva nota ──

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS escala TEXT NOT NULL DEFAULT 'nota';

DO $$ BEGIN
  ALTER TABLE assessments ADD CONSTRAINT assessments_escala_valida
    CHECK (escala IN ('nota', 'cumplimiento'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 'carpeta': control de carpeta
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_kind_check;
ALTER TABLE assessments ADD CONSTRAINT assessments_kind_check
  CHECK (kind IN ('prueba', 'tp', 'oral', 'trabajo', 'concepto', 'carpeta', 'otra'));

-- marca: completo · incompleto · no_entrego (no la trajo / no lo entregó).
-- comentario: corto, y lo ven el estudiante y su familia (como la nota).
ALTER TABLE assessment_grades
  ADD COLUMN IF NOT EXISTS marca TEXT,
  ADD COLUMN IF NOT EXISTS comentario TEXT;

DO $$ BEGIN
  ALTER TABLE assessment_grades ADD CONSTRAINT assessment_grades_marca_valida
    CHECK (marca IN ('completo', 'incompleto', 'no_entrego'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE assessment_grades ADD CONSTRAINT assessment_grades_comentario_corto
    CHECK (char_length(comentario) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Una nota, una marca o ausente: una sola cosa (sin nada, no hay fila)
ALTER TABLE assessment_grades DROP CONSTRAINT IF EXISTS assessment_grades_nota_o_ausente;
ALTER TABLE assessment_grades DROP CONSTRAINT IF EXISTS assessment_grades_una_cosa;
ALTER TABLE assessment_grades ADD CONSTRAINT assessment_grades_una_cosa
  CHECK (num_nonnulls(grade, marca) + (CASE WHEN absent THEN 1 ELSE 0 END) = 1);

-- La de la 050 con la escala, la marca y el comentario. p_escala va al
-- final y es opcional: sin ella, una evaluación nueva es con nota y una que
-- ya existe conserva la suya (lo que quedó en la cola sin conexión con la
-- forma vieja no le borra las marcas a un control de carpeta).
DROP FUNCTION IF EXISTS guardar_evaluacion(UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, JSONB);

CREATE OR REPLACE FUNCTION guardar_evaluacion(
  p_id UUID,
  p_subject UUID,
  p_course UUID,
  p_term UUID,
  p_titulo TEXT,
  p_tipo TEXT,
  p_fecha DATE,
  p_notas JSONB,
  p_escala TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_escala TEXT;
BEGIN
  INSERT INTO assessments AS a (id, school_id, subject_id, course_id, term_id, title, kind, held_on, escala)
  VALUES (p_id, course_school(p_course), p_subject, p_course, p_term, p_titulo, p_tipo, p_fecha, COALESCE(p_escala, 'nota'))
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    kind = EXCLUDED.kind,
    held_on = EXCLUDED.held_on,
    term_id = EXCLUDED.term_id,
    escala = COALESCE(p_escala, a.escala)
  RETURNING a.escala INTO v_escala;

  -- Lo que viene sin nada (ni nota, ni marca, ni ausente) se borra: el
  -- docente vació la casilla.
  DELETE FROM assessment_grades g
  WHERE g.assessment_id = p_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(COALESCE(p_notas, '[]'::jsonb))
        AS f(student_id UUID, nota NUMERIC, ausente BOOLEAN, marca TEXT, comentario TEXT)
      WHERE f.student_id = g.student_id
        AND (COALESCE(f.ausente, false)
             OR (v_escala = 'nota' AND f.nota IS NOT NULL)
             OR (v_escala = 'cumplimiento' AND f.marca IS NOT NULL))
    );

  INSERT INTO assessment_grades (assessment_id, student_id, grade, marca, absent, comentario)
  SELECT p_id, f.student_id,
         CASE WHEN NOT COALESCE(f.ausente, false) AND v_escala = 'nota' THEN f.nota END,
         CASE WHEN NOT COALESCE(f.ausente, false) AND v_escala = 'cumplimiento' THEN f.marca END,
         COALESCE(f.ausente, false),
         NULLIF(trim(COALESCE(f.comentario, '')), '')
  FROM jsonb_to_recordset(COALESCE(p_notas, '[]'::jsonb))
    AS f(student_id UUID, nota NUMERIC, ausente BOOLEAN, marca TEXT, comentario TEXT)
  WHERE COALESCE(f.ausente, false)
     OR (v_escala = 'nota' AND f.nota IS NOT NULL)
     OR (v_escala = 'cumplimiento' AND f.marca IS NOT NULL)
  ON CONFLICT (assessment_id, student_id) DO UPDATE SET
    grade = EXCLUDED.grade,
    marca = EXCLUDED.marca,
    absent = EXCLUDED.absent,
    comentario = EXCLUDED.comentario,
    updated_at = now();

  RETURN p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION guardar_evaluacion(UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_evaluacion(UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, JSONB, TEXT) TO authenticated;
