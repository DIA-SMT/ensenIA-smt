-- ═══════════════════════════════════════════════════════════════════
-- 071 — Clase en vivo con poca señal, y las clases que quedan abiertas
--
-- Fase 5, partes 3 y 4.
--
--  · Un pedido por vuelta. Cada 2,5 s el celular del estudiante hacía 2 a 4
--    pedidos (la sesión, la actividad, mi respuesta, los resultados, la
--    presencia, las medallas) y el panel del docente, 6. Con el wifi de la
--    escuela o datos escasos se encimaban y se perdían. live_estado_alumno y
--    live_estado_docente traen todo en uno, con los permisos de quien llama
--    (SECURITY INVOKER: las mismas reglas de siempre). El estudiante además
--    late adentro del mismo pedido (presencia), a lo sumo cada 25 s.
--  · Respuesta explícita: "sin_clase" o "terminada" solo cuando el servidor
--    lo dice. Antes un pedido que fallaba por la señal se leía como "no hay
--    clase" y el celular salía de la clase.
--  · Clases olvidadas: una clase sin ninguna señal de vida (actividades,
--    respuestas, presencia, invitados, emojis) en 2 horas se cierra sola
--    (pg_cron cada 15 min), con la hora de fin en su última señal. Mientras
--    tanto, el estudiante ya no la ve y el docente se entera al abrirla.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Señales de vida de una clase ──

-- El panel del docente abierto también es señal de vida: un taller largo,
-- con los celulares bloqueados y sin preguntas, no es una clase olvidada.
-- live_estado_docente lo anota, a lo sumo una vez por minuto.
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS docente_visto_at TIMESTAMPTZ;

-- La última vez que pasó algo en la clase. Interna (la usan las de abajo).
CREATE OR REPLACE FUNCTION _ultima_senal_clase(p_session UUID)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT greatest(
    ls.created_at,
    ls.docente_visto_at,
    (SELECT max(created_at) FROM live_activities WHERE session_id = ls.id),
    (SELECT max(coalesce(updated_at, created_at)) FROM live_responses WHERE session_id = ls.id),
    (SELECT max(last_seen_at) FROM live_presence WHERE session_id = ls.id),
    (SELECT max(last_seen_at) FROM live_guests WHERE session_id = ls.id),
    (SELECT max(created_at) FROM live_reactions WHERE session_id = ls.id)
  )
  FROM live_sessions ls WHERE ls.id = p_session
$$;
REVOKE EXECUTE ON FUNCTION _ultima_senal_clase(UUID) FROM PUBLIC, anon, authenticated;

-- Para buscar rápido lo último que se respondió en una clase (las otras
-- tablas ya tienen su índice por clase)
CREATE INDEX IF NOT EXISTS live_responses_session ON live_responses(session_id);

-- ¿Quedó abierta sin que nadie la use? Solo dice sí o no, de una clase que
-- quien pregunta ya conoce: la usan los pedidos de estudiante y docente,
-- en cada vuelta. Por eso, una clase de menos de 2 horas ni se mira (el
-- CASE asegura ese orden): no puede estar olvidada.
CREATE OR REPLACE FUNCTION clase_en_vivo_olvidada(p_session UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT CASE
              WHEN ls.status <> 'live' OR ls.created_at > now() - interval '2 hours' THEN false
              ELSE _ultima_senal_clase(ls.id) < now() - interval '2 hours'
            END
     FROM live_sessions ls WHERE ls.id = p_session),
    false)
$$;
REVOKE EXECUTE ON FUNCTION clase_en_vivo_olvidada(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION clase_en_vivo_olvidada(UUID) TO authenticated;

-- Las cierra: terminada, con la hora de su última señal (así el resumen
-- dice cuánto duró de verdad). La corre pg_cron; la app no la llama.
CREATE OR REPLACE FUNCTION cerrar_clases_en_vivo_olvidadas()
RETURNS INT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INT;
BEGIN
  UPDATE live_sessions ls
     SET status = 'ended', ended_at = _ultima_senal_clase(ls.id)
   WHERE ls.status = 'live' AND clase_en_vivo_olvidada(ls.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION cerrar_clases_en_vivo_olvidadas() FROM PUBLIC, anon, authenticated;

-- El docente que vuelve a una clase suya que quedó olvidada la cierra igual
-- (con la hora de su última señal, no la de ahora: si no, el resumen diría
-- que duró 22 horas). Solo la suya y solo si de verdad quedó olvidada.
CREATE OR REPLACE FUNCTION cerrar_mi_clase_olvidada(p_session UUID)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE live_sessions
     SET status = 'ended', ended_at = _ultima_senal_clase(id)
   WHERE id = p_session AND teacher_id = auth.uid() AND clase_en_vivo_olvidada(id);
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION cerrar_mi_clase_olvidada(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cerrar_mi_clase_olvidada(UUID) TO authenticated;

-- ── 2. El estudiante: todo en un pedido ──
--
-- p_session: la clase que tiene abierta (null: la que esté viva en su
-- curso). p_medallas_desde: si se la dieron durante la clase, se festeja.
-- Devuelve estado = 'en_vivo' | 'terminada' | 'sin_clase'.

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
    'medalla', v_medalla
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_alumno(UUID, TIMESTAMPTZ) TO authenticated;

-- ── 3. El docente: todo en un pedido ──
-- Solo su propia clase. null si no es suya o no existe.

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
       WHERE lp.session_id = ses.id AND lp.last_seen_at > now() - interval '90 seconds'), '[]'::jsonb)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION live_estado_docente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION live_estado_docente(UUID) TO authenticated;

-- ── 4. Cerrar las olvidadas cada 15 minutos, si hay pg_cron (como la 061) ──
DO $cron$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('estudia-cerrar-clases-olvidadas', '*/15 * * * *', 'SELECT cerrar_clases_en_vivo_olvidadas()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%). Las clases olvidadas igual dejan de verse.', SQLERRM;
END
$cron$;

-- Comprobación: una fila, todo true
SELECT
  NOT has_function_privilege('anon', 'live_estado_alumno(uuid, timestamptz)', 'EXECUTE') AS alumno_sin_anonimos,
  NOT has_function_privilege('anon', 'live_estado_docente(uuid)', 'EXECUTE') AS docente_sin_anonimos,
  NOT has_function_privilege('authenticated', 'cerrar_clases_en_vivo_olvidadas()', 'EXECUTE') AS cerrar_solo_servidor,
  NOT has_function_privilege('authenticated', '_ultima_senal_clase(uuid)', 'EXECUTE') AS senal_interna,
  NOT has_function_privilege('anon', 'cerrar_mi_clase_olvidada(uuid)', 'EXECUTE') AS cerrar_la_mia_sin_anonimos,
  (SELECT prosecdef = false FROM pg_proc WHERE proname = 'live_estado_alumno') AS alumno_con_sus_permisos,
  (SELECT prosecdef = false FROM pg_proc WHERE proname = 'live_estado_docente') AS docente_con_sus_permisos;
