-- ═══════════════════════════════════════════════════════════════════
-- 073 — Competencia en la clase en vivo (estilo Kahoot)
--
-- Preguntas con tiempo, puntos por rapidez y podio. Es la pregunta rápida
-- de siempre (kind 'quiz') con config.competencia = { segundos, ronda }:
-- todas las preguntas de una misma ronda suman para el mismo podio.
--
--  · En el servidor, no en el celular: la respuesta no se cambia (la
--    primera vale), y la que llega fuera de tiempo se rechaza. Las horas
--    las pone la base (067), así que nadie adelanta su reloj.
--  · Los puntos NO se guardan en la respuesta: se calculan al pedir las
--    posiciones y solo de las preguntas reveladas (revelada_at). Si viajaran
--    antes, el chico sabría si acertó mientras corre el tiempo y se lo
--    pasaría al resto. Una que se cerró sin revelar no suma.
--    Correcta: de 1000 (al instante) a 500 (en el último segundo). Mal: 0.
--  · Mientras corre el tiempo, a los chicos y a los invitados no les llega
--    cuántos eligieron cada opción. Y borrar la respuesta para mandar otra
--    tampoco sirve: la primera vale.
--  · Posiciones: el docente ve todas (y el podio, que proyecta); cada
--    participante ve solo su propio lugar. A los celulares no viaja ningún
--    nombre: la app evita los rankings a propósito.
--  · Los pedidos de estado (alumno, docente, invitado) traen la hora del
--    servidor ('ahora'): la cuenta regresiva no depende del reloj del celular.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Una pregunta de competencia, bien armada al lanzarla ──

CREATE OR REPLACE FUNCTION cuidar_competencia()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  c JSONB := NEW.config->'competencia';
  v_seg INT;
BEGIN
  IF c IS NULL OR jsonb_typeof(c) <> 'object' THEN
    NEW.config := NEW.config - 'competencia';
    RETURN NEW;
  END IF;
  -- Solo preguntas con una correcta, para todo el curso
  IF NEW.kind <> 'quiz' OR coalesce(NEW.config->>'correctId', '') = '' THEN
    RAISE EXCEPTION 'La competencia es con preguntas rápidas que tengan una respuesta correcta' USING ERRCODE = '22023';
  END IF;
  v_seg := CASE WHEN (c->>'segundos') ~ '^\d{1,3}$' THEN (c->>'segundos')::int ELSE 20 END;
  v_seg := least(120, greatest(5, v_seg));
  NEW.target_student_id := NULL;
  NEW.config := (NEW.config - 'groupMode') || jsonb_build_object('competencia', jsonb_build_object(
    'segundos', v_seg,
    'ronda', left(coalesce(nullif(btrim(c->>'ronda'), ''), gen_random_uuid()::text), 40)
  ));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cuidar_competencia ON live_activities;
CREATE TRIGGER trg_cuidar_competencia
  BEFORE INSERT ON live_activities
  FOR EACH ROW EXECUTE FUNCTION cuidar_competencia();

-- Cuándo se reveló: solo esas suman (cerrar sin revelar, o lanzar otra
-- mientras corre el tiempo, la deja afuera)
ALTER TABLE live_activities ADD COLUMN IF NOT EXISTS revelada_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION marcar_actividad_revelada()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'revealed' AND OLD.status IS DISTINCT FROM 'revealed' THEN
    NEW.revelada_at := coalesce(OLD.revelada_at, now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_marcar_actividad_revelada ON live_activities;
CREATE TRIGGER trg_marcar_actividad_revelada
  BEFORE UPDATE OF status ON live_activities
  FOR EACH ROW EXECUTE FUNCTION marcar_actividad_revelada();

-- ── 2. Las respuestas: igual que en la 067, más las reglas de la competencia ──

CREATE OR REPLACE FUNCTION cuidar_respuesta_en_vivo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act live_activities;
  ses live_sessions;
  p JSONB := coalesce(NEW.payload, '{}'::jsonb);
  clean JSONB := '{}'::jsonb;
  sel JSONB;
  ids TEXT[];
  v_texto TEXT;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = NEW.activity_id;
  -- La actividad tiene que ser de esa misma clase (antes alcanzaba con que
  -- la clase fuera del curso del estudiante)
  IF act.id IS NULL OR act.session_id IS DISTINCT FROM NEW.session_id THEN
    RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;
  IF ses.status IS DISTINCT FROM 'live' OR act.status <> 'active' THEN
    RAISE EXCEPTION 'ACTIVIDAD_CERRADA' USING ERRCODE = 'P0001';
  END IF;
  -- Dirigida: solo contesta ese estudiante
  IF act.target_student_id IS NOT NULL AND NEW.student_id IS DISTINCT FROM act.target_student_id THEN
    RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE' USING ERRCODE = '42501';
  END IF;
  -- Competencia (073): la primera respuesta vale y fuera de tiempo no entra
  -- (dos segundos de gracia por la demora de la red)
  IF act.config ? 'competencia' THEN
    -- Ya había una (un reintento sin señal que llega tarde, o un cambio): vale esa
    IF TG_OP = 'UPDATE' OR EXISTS (
      SELECT 1 FROM live_responses r
       WHERE r.activity_id = NEW.activity_id
         AND ((NEW.student_id IS NOT NULL AND r.student_id = NEW.student_id)
           OR (NEW.guest_id IS NOT NULL AND r.guest_id = NEW.guest_id))
    ) THEN
      RAISE EXCEPTION 'RESPUESTA_YA_ENVIADA' USING ERRCODE = 'P0001';
    END IF;
    IF now() > act.created_at + make_interval(secs => coalesce((act.config->'competencia'->>'segundos')::int, 20) + 2) THEN
      RAISE EXCEPTION 'TIEMPO_TERMINADO' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Solo lo que corresponde al tipo de pregunta, y con tope: lo que se
  -- escribe puede terminar proyectado. Las opciones, solo las de la pregunta
  -- (si no, un texto cualquiera viaja como "opción" a todos los celulares).
  ids := ARRAY(SELECT o->>'id' FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(act.config->'options') = 'array' THEN act.config->'options' ELSE '[]'::jsonb END) o);
  IF act.kind IN ('quiz', 'encuesta') AND (p->>'opcion') = ANY (ids) THEN
    clean := jsonb_build_object('opcion', p->>'opcion');
  ELSIF act.kind = 'chips' AND jsonb_typeof(p->'selected') = 'array' THEN
    SELECT coalesce(jsonb_agg(DISTINCT v), '[]'::jsonb) INTO sel
      FROM jsonb_array_elements_text(p->'selected') v WHERE v = ANY (ids);
    clean := jsonb_build_object('selected', sel);
  ELSIF act.kind = 'checkin' AND p->>'feeling' IN ('genial', 'bien', 'neutral', 'confundido', 'frustrado') THEN
    clean := jsonb_build_object('feeling', p->>'feeling');
  ELSIF act.kind = 'texto' AND btrim(coalesce(p->>'texto', '')) <> '' THEN
    clean := jsonb_build_object('texto', left(btrim(p->>'texto'), 300));
  ELSIF act.kind = 'nube' AND btrim(coalesce(p->>'palabra', '')) <> '' THEN
    clean := jsonb_build_object('palabra', left(btrim(p->>'palabra'), 30));
  END IF;
  IF clean = '{}'::jsonb THEN
    RAISE EXCEPTION 'RESPUESTA_VACIA' USING ERRCODE = '22023';
  END IF;

  -- Las fechas las pone la base (ordenan los textos, alimentan las señales
  -- y dan los puntos de la competencia)
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();

  v_texto := concat_ws(' ', clean->>'texto', clean->>'palabra');
  IF v_texto <> '' AND texto_preocupa(v_texto) THEN
    -- No se proyecta ni la ven los compañeros (live_results_json); el
    -- aviso sale de avisar_respuesta_que_preocupa, con la fila ya guardada
    clean := clean || '{"oculta": true}'::jsonb;
  END IF;

  NEW.payload := clean;
  RETURN NEW;
END $$;

-- Un estudiante no puede borrar su respuesta de competencia para mandar
-- otra (la política le deja borrar las suyas). El docente sí: saca respuestas
-- e invitados, y los borrados en cascada no pasan por un estudiante.
CREATE OR REPLACE FUNCTION cuidar_borrado_en_competencia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth_student_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM live_activities a WHERE a.id = OLD.activity_id AND a.config ? 'competencia'
  ) THEN
    RAISE EXCEPTION 'RESPUESTA_YA_ENVIADA' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_cuidar_borrado_en_competencia ON live_responses;
CREATE TRIGGER trg_cuidar_borrado_en_competencia
  BEFORE DELETE ON live_responses
  FOR EACH ROW EXECUTE FUNCTION cuidar_borrado_en_competencia();

-- Los resultados: igual que en la 067, sin los conteos de una competencia en curso
CREATE OR REPLACE FUNCTION live_results_json(p_activity UUID, p_include_names BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act live_activities;
  ses live_sessions;
  participants INT;
  responded INT;
  counts JSONB;
  texts JSONB;
  words JSONB;
  retenidas INT;
BEGIN
  SELECT * INTO act FROM live_activities WHERE id = p_activity;
  IF act.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ses FROM live_sessions WHERE id = act.session_id;

  IF ses.guests_enabled THEN
    SELECT count(*) INTO participants
      FROM live_guests
     WHERE session_id = ses.id AND last_seen_at > now() - interval '2 minutes' AND expulsado_at IS NULL;
  ELSE
    SELECT count(*) INTO participants FROM students WHERE course_id = ses.course_id;
  END IF;

  SELECT count(*) FILTER (WHERE payload ? 'oculta'), count(*) FILTER (WHERE p_include_names OR NOT payload ? 'oculta')
    INTO retenidas, responded
    FROM live_responses WHERE activity_id = p_activity;
  participants := GREATEST(participants, responded);

  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO counts FROM (
    SELECT payload->>'opcion' AS k, count(*) AS n
      FROM live_responses WHERE activity_id = p_activity AND payload ? 'opcion'
     GROUP BY 1
    UNION ALL
    SELECT payload->>'feeling', count(*)
      FROM live_responses WHERE activity_id = p_activity AND payload ? 'feeling'
     GROUP BY 1
    UNION ALL
    SELECT sel.value, count(*)
      FROM live_responses, jsonb_array_elements_text(payload->'selected') sel
     WHERE activity_id = p_activity AND payload ? 'selected'
     GROUP BY 1
  ) t WHERE k IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', CASE WHEN p_include_names
                 THEN COALESCE(s.first_name || ' ' || s.last_name, g.display_name)
                 ELSE NULL END,
    'text', left(r.payload->>'texto', 300)
  ) ORDER BY r.updated_at), '[]'::jsonb)
  INTO texts
  FROM live_responses r
  LEFT JOIN students s ON s.id = r.student_id
  LEFT JOIN live_guests g ON g.id = r.guest_id
  WHERE r.activity_id = p_activity
    AND r.payload ? 'texto' AND btrim(r.payload->>'texto') <> ''
    AND NOT r.payload ? 'oculta';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('word', w, 'n', n) ORDER BY n DESC), '[]'::jsonb)
  INTO words
  FROM (
    SELECT lower(btrim(payload->>'palabra')) AS w, count(*) AS n
      FROM live_responses
     WHERE activity_id = p_activity AND payload ? 'palabra' AND btrim(payload->>'palabra') <> ''
       AND NOT payload ? 'oculta'
     GROUP BY 1 ORDER BY n DESC LIMIT 40
  ) t;

  -- Competencia (073): mientras corre el tiempo, a los chicos y a los
  -- invitados no les llega qué eligió cada uno (se lo pasarían al resto)
  IF NOT p_include_names AND act.config ? 'competencia' AND act.status = 'active' THEN
    counts := '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'activityId', act.id,
    'kind', act.kind,
    'status', act.status,
    'courseTotal', participants,
    'responded', responded,
    'counts', counts,
    'texts', texts,
    'words', words,
    -- Solo para el docente y la dirección: cuántas se retuvieron, sin quién
    'retenidas', CASE WHEN p_include_names THEN retenidas ELSE 0 END
  );
END $$;

REVOKE EXECUTE ON FUNCTION live_results_json(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── 3. Puntos y posiciones (solo de las preguntas reveladas) ──

-- Cuántos puntos dio una respuesta: de 1000 (al instante) a 500 (al final)
CREATE OR REPLACE FUNCTION _puntos_competencia(p_correcta TEXT, p_segundos INT, p_lanzada TIMESTAMPTZ, p_opcion TEXT, p_respondida TIMESTAMPTZ)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_opcion IS NOT NULL AND p_opcion = p_correcta THEN
    greatest(500, round(1000 * (1 - least(1, greatest(0, extract(epoch FROM p_respondida - p_lanzada)) / greatest(1, p_segundos)) / 2)))::int
  ELSE 0 END
$$;

-- Las posiciones de una ronda: una fila por participante. Interna.
CREATE OR REPLACE FUNCTION _posiciones_competencia(p_session UUID, p_ronda TEXT)
RETURNS TABLE (student_id UUID, guest_id UUID, nombre TEXT, puntos INT, aciertos INT, respondidas INT, ultima INT, posicion INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH preguntas AS (
    SELECT a.id, a.created_at, a.config->>'correctId' AS correcta,
           coalesce((a.config->'competencia'->>'segundos')::int, 20) AS segundos,
           row_number() OVER (ORDER BY a.created_at DESC) AS desde_el_final
      FROM live_activities a
     WHERE a.session_id = p_session
       AND a.config->'competencia'->>'ronda' = p_ronda
       AND a.revelada_at IS NOT NULL
  ),
  puntos AS (
    SELECT r.student_id, r.guest_id,
           _puntos_competencia(p.correcta, p.segundos, p.created_at, r.payload->>'opcion', r.created_at) AS pts,
           p.desde_el_final
      FROM preguntas p
      JOIN live_responses r ON r.activity_id = p.id
  ),
  suma AS (
    SELECT student_id, guest_id,
           sum(pts)::int AS puntos,
           count(*) FILTER (WHERE pts > 0)::int AS aciertos,
           count(*)::int AS respondidas,
           coalesce(sum(pts) FILTER (WHERE desde_el_final = 1), 0)::int AS ultima
      FROM puntos
     GROUP BY student_id, guest_id
  )
  SELECT s.student_id, s.guest_id,
         coalesce(CASE WHEN st.id IS NOT NULL THEN btrim(st.first_name || ' ' || left(coalesce(st.last_name, ''), 1) || '.') END, g.display_name, 'Participante'),
         s.puntos, s.aciertos, s.respondidas, s.ultima,
         rank() OVER (ORDER BY s.puntos DESC)::int
    FROM suma s
    LEFT JOIN students st ON st.id = s.student_id
    LEFT JOIN live_guests g ON g.id = s.guest_id
$$;
REVOKE EXECUTE ON FUNCTION _posiciones_competencia(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Lo que ve cada uno: { reveladas, participantes, yo?: {...} } y, el docente, podio y todos
CREATE OR REPLACE FUNCTION _vista_competencia(p_session UUID, p_ronda TEXT, p_student UUID, p_guest UUID, p_todos BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pos AS (SELECT * FROM _posiciones_competencia(p_session, p_ronda))
  SELECT jsonb_build_object(
    'ronda', p_ronda,
    'reveladas', (SELECT count(*) FROM live_activities a WHERE a.session_id = p_session
                   AND a.config->'competencia'->>'ronda' = p_ronda AND a.revelada_at IS NOT NULL),
    'participantes', (SELECT count(*) FROM pos),
    -- Los nombres, solo al docente (es el que proyecta el podio)
    'podio', CASE WHEN p_todos THEN coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'puntos', puntos, 'posicion', posicion) ORDER BY posicion, nombre)
                         FROM (SELECT * FROM pos WHERE posicion <= 3 AND puntos > 0 ORDER BY posicion, nombre LIMIT 5) x), '[]'::jsonb)
             ELSE '[]'::jsonb END,
    'yo', (SELECT jsonb_build_object('puntos', puntos, 'posicion', posicion, 'aciertos', aciertos, 'respondidas', respondidas, 'ultima', ultima)
             FROM pos WHERE (p_student IS NOT NULL AND student_id = p_student) OR (p_guest IS NOT NULL AND guest_id = p_guest) LIMIT 1),
    'todos', CASE WHEN p_todos THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
               'nombre', nombre, 'puntos', puntos, 'posicion', posicion, 'aciertos', aciertos, 'respondidas', respondidas, 'esInvitado', guest_id IS NOT NULL)
               ORDER BY posicion, nombre) FROM pos), '[]'::jsonb) END
  )
$$;
REVOKE EXECUTE ON FUNCTION _vista_competencia(UUID, TEXT, UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Docente de la clase: todas las posiciones. Estudiante de ese curso: la suya.
CREATE OR REPLACE FUNCTION live_competencia(p_session UUID, p_ronda TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ses live_sessions;
  v_st UUID;
BEGIN
  SELECT * INTO ses FROM live_sessions WHERE id = p_session;
  IF ses.id IS NULL THEN RETURN NULL; END IF;
  IF ses.teacher_id = auth.uid() THEN
    RETURN _vista_competencia(p_session, p_ronda, NULL, NULL, true);
  END IF;
  v_st := auth_student_id();
  IF v_st IS NOT NULL AND ses.course_id = auth_student_course_id() THEN
    RETURN _vista_competencia(p_session, p_ronda, v_st, NULL, false);
  END IF;
  RAISE EXCEPTION 'Sin acceso a esta clase' USING ERRCODE = '42501';
END;
$$;
REVOKE EXECUTE ON FUNCTION live_competencia(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_competencia(UUID, TEXT) TO authenticated;

-- Invitado (sin cuenta): con su token y la sala abierta, su lugar
CREATE OR REPLACE FUNCTION live_competencia_invitado(p_token UUID, p_ronda TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g live_guests;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL OR g.expulsado_at IS NOT NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM live_sessions s WHERE s.id = g.session_id AND s.status = 'live' AND s.guests_enabled) THEN
    RAISE EXCEPTION 'ACTIVIDAD_NO_DISPONIBLE';
  END IF;
  RETURN _vista_competencia(g.session_id, p_ronda, NULL, g.id, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION live_competencia_invitado(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION live_competencia_invitado(UUID, TEXT) TO anon, authenticated;

-- ── 4. La hora del servidor en los pedidos de estado ──

-- El estudiante: igual que en la 071, con la hora del servidor
CREATE OR REPLACE FUNCTION live_estado_alumno(p_session UUID DEFAULT NULL, p_medallas_desde TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_st UUID := auth_student_id();
  ses live_sessions;
  act live_activities_alumno;
  mine JSONB;
  v_resultados JSONB;
  v_medalla JSONB;
BEGIN
  IF v_st IS NULL THEN
    RAISE EXCEPTION 'Solo para estudiantes' USING ERRCODE = '42501';
  END IF;

  IF p_session IS NOT NULL THEN
    SELECT * INTO ses FROM live_sessions WHERE id = p_session;
    IF ses.id IS NOT NULL AND ses.status = 'ended' THEN
      RETURN jsonb_build_object('estado', 'terminada', 'sessionId', ses.id, 'titulo', ses.title);
    END IF;
  END IF;
  -- La que venía ya no se ve (o no venía ninguna): la viva de su curso
  IF ses.id IS NULL THEN
    SELECT * INTO ses FROM live_sessions
     WHERE course_id = auth_student_course_id() AND status = 'live'
     LIMIT 1;
  END IF;
  IF ses.id IS NULL OR clase_en_vivo_olvidada(ses.id) THEN
    RETURN jsonb_build_object('estado', 'sin_clase');
  END IF;

  -- Presencia: late con el mismo pedido, a lo sumo cada 25 s. Se mira antes
  -- de escribir: un INSERT … ON CONFLICT bloquea y escribe aunque no cambie
  -- nada, y esto corre en cada vuelta de cada celular.
  IF NOT EXISTS (
    SELECT 1 FROM live_presence
     WHERE session_id = ses.id AND student_id = v_st AND last_seen_at > now() - interval '25 seconds'
  ) THEN
    INSERT INTO live_presence (session_id, student_id, last_seen_at)
    VALUES (ses.id, v_st, now())
    ON CONFLICT (session_id, student_id) DO UPDATE SET last_seen_at = now();
  END IF;

  -- La vista del alumno no trae la correcta del quiz hasta que se revela
  SELECT * INTO act FROM live_activities_alumno
   WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;

  IF act.id IS NOT NULL THEN
    SELECT payload INTO mine FROM live_responses WHERE activity_id = act.id AND student_id = v_st;
    -- Los resultados se le muestran después de responder: antes, ni viajan
    IF mine IS NOT NULL AND act.status <> 'closed' THEN
      v_resultados := get_live_results(act.id);
    END IF;
  END IF;

  IF p_medallas_desde IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', sa.id, 'student_id', sa.student_id, 'teacher_id', sa.teacher_id, 'subject_id', sa.subject_id,
             'badge_code', sa.badge_code, 'message', sa.message, 'created_at', sa.created_at,
             'profiles', CASE WHEN p.id IS NULL THEN NULL
                              ELSE jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) END)
      INTO v_medalla
      FROM student_awards sa
      LEFT JOIN profiles p ON p.id = sa.teacher_id
     WHERE sa.student_id = v_st AND sa.created_at > p_medallas_desde
     ORDER BY sa.created_at DESC
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'estado', 'en_vivo',
    'session', to_jsonb(ses),
    'activity', CASE WHEN act.id IS NULL THEN NULL ELSE to_jsonb(act) END,
    'myAnswer', mine,
    'results', v_resultados,
    'medalla', v_medalla,
    -- La hora del servidor: la cuenta regresiva no depende del reloj del celular (073)
    'ahora', now()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) TO authenticated;

-- El docente: igual que en la 071, con la hora del servidor
CREATE OR REPLACE FUNCTION live_estado_docente(p_session UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  ses live_sessions;
  act live_activities;
  v_resultados JSONB;
  v_olvidada BOOLEAN;
BEGIN
  SELECT * INTO ses FROM live_sessions WHERE id = p_session AND teacher_id = auth.uid();
  IF ses.id IS NULL THEN RETURN NULL; END IF;

  -- Primero si quedó olvidada (el docente que vuelve al otro día no la
  -- revive sin querer: la app se la cierra); después, que está mirando,
  -- a lo sumo una vez por minuto
  v_olvidada := ses.status = 'live' AND clase_en_vivo_olvidada(ses.id);
  IF ses.status = 'live' AND NOT v_olvidada
     AND (ses.docente_visto_at IS NULL OR ses.docente_visto_at < now() - interval '60 seconds') THEN
    UPDATE live_sessions SET docente_visto_at = now() WHERE id = ses.id;
  END IF;

  SELECT * INTO act FROM live_activities WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;
  IF act.id IS NOT NULL AND act.status <> 'closed' THEN
    v_resultados := get_live_results(act.id);
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(ses),
    'activity', CASE WHEN act.id IS NULL THEN NULL ELSE to_jsonb(act) END,
    'results', v_resultados,
    'olvidada', v_olvidada,
    -- Los emojis del último minuto (con la hora del servidor, no la del equipo)
    'reacciones', CASE WHEN ses.reactions_enabled THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'createdAt', r.created_at) ORDER BY r.created_at DESC)
        FROM (SELECT emoji, created_at FROM live_reactions
               WHERE session_id = ses.id AND created_at > now() - interval '60 seconds'
               ORDER BY created_at DESC LIMIT 60) r), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'invitados', CASE WHEN ses.guests_enabled THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'nombre', g.display_name, 'vistoAt', g.last_seen_at) ORDER BY g.created_at)
        FROM live_guests g WHERE g.session_id = ses.id AND g.expulsado_at IS NULL), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    -- Estudiantes vistos en los últimos 90 s
    'conectados', coalesce((
      SELECT jsonb_agg(lp.student_id) FROM live_presence lp
       WHERE lp.session_id = ses.id AND lp.last_seen_at > now() - interval '90 seconds'), '[]'::jsonb),
    -- La hora del servidor, para la cuenta regresiva de la competencia (073)
    'ahora', now()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_docente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_docente(UUID) TO authenticated;

-- El invitado: igual que en la 067, con la hora y cuándo se lanzó la pregunta
CREATE OR REPLACE FUNCTION live_guest_state(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g live_guests;
  ses live_sessions;
  act live_activities;
  safe_config JSONB;
  mine JSONB;
BEGIN
  SELECT * INTO g FROM live_guests WHERE token = p_token;
  IF g.id IS NULL THEN RAISE EXCEPTION 'INVITADO_DESCONOCIDO'; END IF;
  IF g.expulsado_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'expulsado', 'motivo', coalesce(g.motivo_salida, 'sacado'));
  END IF;

  IF g.last_seen_at < now() - interval '30 seconds' THEN
    UPDATE live_guests SET last_seen_at = now() WHERE id = g.id;
  END IF;

  SELECT * INTO ses FROM live_sessions WHERE id = g.session_id;
  IF ses.status <> 'live' THEN
    RETURN jsonb_build_object('status', 'ended');
  END IF;
  -- Cerrar la sala a invitados saca a los que ya estaban
  IF NOT ses.guests_enabled THEN
    RETURN jsonb_build_object('status', 'cerrada');
  END IF;

  SELECT * INTO act FROM live_activities
   WHERE session_id = ses.id ORDER BY created_at DESC LIMIT 1;

  -- Una pregunta dirigida a un estudiante no es para los invitados
  IF act.id IS NULL OR act.status = 'closed' OR act.target_student_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'idle',
      'title', ses.title,
      'reactionsEnabled', ses.reactions_enabled,
      'ahora', now()
    );
  END IF;

  safe_config := act.config;
  IF act.kind = 'quiz' AND act.status <> 'revealed' THEN
    safe_config := safe_config - 'correctId';
  END IF;

  SELECT payload INTO mine FROM live_responses
   WHERE activity_id = act.id AND guest_id = g.id;

  RETURN jsonb_build_object(
    'status', 'active',
    'title', ses.title,
    'reactionsEnabled', ses.reactions_enabled,
    'activity', jsonb_build_object(
      'id', act.id, 'kind', act.kind,
      'config', safe_config, 'status', act.status,
      'creada', act.created_at
    ),
    'myAnswer', mine,
    'results', live_results_json(act.id, false),
    'ahora', now()
  );
END $$;

-- Comprobación: una fila, todo true
SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cuidar_competencia') AS competencia_cuidada,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_marcar_actividad_revelada') AS revelada_marcada,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cuidar_borrado_en_competencia') AS borrar_no_cambia,
  NOT has_function_privilege('anon', 'live_competencia(uuid, text)', 'EXECUTE') AS posiciones_sin_anonimos,
  NOT has_function_privilege('authenticated', '_posiciones_competencia(uuid, text)', 'EXECUTE') AS posiciones_internas,
  has_function_privilege('anon', 'live_competencia_invitado(uuid, text)', 'EXECUTE') AS invitados_con_token,
  _puntos_competencia('a', 20, now() - interval '0 seconds', 'a', now()) = 1000 AS al_instante_1000,
  _puntos_competencia('a', 20, now() - interval '20 seconds', 'a', now()) = 500 AS al_final_500,
  _puntos_competencia('a', 20, now(), 'b', now()) = 0 AS mal_0;
