-- ═══════════════════════════════════════════════════════════════════
-- 040 — Consumo de IA para el superadmin
--
-- Hasta ahora el uso de IA quedaba solo en ia_usage: una fila por persona
-- y por día con la cantidad de usos y los tokens (sirve para el tope
-- diario). No dice cuánto costó, qué función lo gastó (chat, Migue,
-- documentos, podcast) ni con qué modelo, y el podcast no se anotaba.
--
--  · ia_events: una fila por llamada a la IA, con su costo en dólares tal
--    como lo informa OpenRouter. La escriben las funciones del servidor
--    (service role). Arranca vacía: se llena desde que se despliegan las
--    funciones nuevas.
--  · ia_consumption(días): el resumen que muestra la pantalla "Consumo de
--    IA". Solo para el superadmin. Usos y tokens salen de ia_usage (hay
--    historia), el costo y el detalle por función de ia_events.
--  · Por persona solo aparecen docentes y dirección: cuánto usa Migue un
--    estudiante dice mucho de él, y el superadmin no ve datos sensibles
--    de los chicos (039). Estudiantes y familias van sumados por rol y
--    por escuela.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ia_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Escuela y rol al momento de la llamada (la escuela activa puede cambiar)
  school_id   UUID REFERENCES schools(id) ON DELETE SET NULL,
  role        TEXT,
  -- chat | migue | migue_riesgo | documentos | podcast
  feature     TEXT NOT NULL,
  -- modo de documentos, herramienta del chat, etc.
  detail      TEXT,
  model       TEXT,
  tokens_in   INT NOT NULL DEFAULT 0,
  tokens_out  INT NOT NULL DEFAULT 0,
  -- Lo que cobró OpenRouter por esta llamada; NULL si no lo informó
  cost_usd    NUMERIC(12, 6),
  -- Caracteres convertidos a voz (ElevenLabs cobra por caracter)
  tts_chars   INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ia_events_created ON ia_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ia_events_user ON ia_events (user_id, created_at);

ALTER TABLE ia_events ENABLE ROW LEVEL SECURITY;

-- Solo lectura y solo superadmin; escriben las funciones con service role
DROP POLICY IF EXISTS "Superadmin views ia events" ON ia_events;
CREATE POLICY "Superadmin views ia events"
  ON ia_events FOR SELECT
  USING (is_superadmin());


CREATE OR REPLACE FUNCTION ia_consumption(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desde DATE;
  v_hoy   DATE := (now() AT TIME ZONE 'UTC')::date;
  r       JSONB;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede ver el consumo de IA' USING ERRCODE = '42501';
  END IF;
  -- ia_usage.usage_date es la fecha UTC del servidor
  v_desde := v_hoy - (GREATEST(LEAST(COALESCE(p_days, 30), 366), 1) - 1);

  WITH uso AS (
    SELECT u.usage_date AS dia, u.teacher_id AS user_id, u.message_count AS usos,
           u.token_count_in + u.token_count_out AS tokens,
           p.role::text AS rol, p.school_id,
           COALESCE(s.name, 'Sin escuela') AS escuela,
           trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS nombre, p.email
    FROM ia_usage u
    JOIN profiles p ON p.id = u.teacher_id
    LEFT JOIN schools s ON s.id = p.school_id
    WHERE u.usage_date >= v_desde
  ),
  ev AS (
    SELECT e.*, (e.created_at AT TIME ZONE 'UTC')::date AS dia,
           COALESCE(s.name, 'Sin escuela') AS escuela
    FROM ia_events e
    LEFT JOIN schools s ON s.id = e.school_id
    WHERE e.created_at >= v_desde::timestamp AT TIME ZONE 'UTC'
  )
  SELECT jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hoy,
    'totales', jsonb_build_object(
      'usos',          (SELECT COALESCE(sum(usos), 0) FROM uso),
      'tokens',        (SELECT COALESCE(sum(tokens), 0) FROM uso),
      'personas',      (SELECT count(DISTINCT user_id) FROM uso),
      'usos_hoy',      (SELECT COALESCE(sum(usos), 0) FROM uso WHERE dia = v_hoy),
      'personas_hoy',  (SELECT count(DISTINCT user_id) FROM uso WHERE dia = v_hoy),
      'costo_usd',     (SELECT sum(cost_usd) FROM ev),
      'costo_hoy_usd', (SELECT sum(cost_usd) FROM ev WHERE dia = v_hoy),
      'llamadas',      (SELECT count(*) FROM ev),
      'caracteres_voz', (SELECT COALESCE(sum(tts_chars), 0) FROM ev),
      -- Desde cuándo hay costo registrado (antes de desplegar las funciones, nada)
      'costo_desde',   (SELECT min(created_at) FROM ia_events)
    ),
    'por_dia', (
      SELECT jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'usos', COALESCE((SELECT sum(usos) FROM uso WHERE uso.dia = d.dia), 0),
               'tokens', COALESCE((SELECT sum(tokens) FROM uso WHERE uso.dia = d.dia), 0),
               'costo_usd', (SELECT sum(cost_usd) FROM ev WHERE ev.dia = d.dia)
             ) ORDER BY d.dia)
      FROM (SELECT generate_series(v_desde, v_hoy, interval '1 day')::date AS dia) d
    ),
    'por_escuela', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'usos')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'escuela', escuela,
                 'usos', sum(usos), 'tokens', sum(tokens), 'personas', count(DISTINCT user_id),
                 'costo_usd', (SELECT sum(cost_usd) FROM ev WHERE ev.escuela = uso.escuela)
               ) AS x
        FROM uso GROUP BY escuela
      ) t
    ),
    'por_rol', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'usos')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'rol', rol,
                 'usos', sum(usos), 'tokens', sum(tokens), 'personas', count(DISTINCT user_id),
                 'costo_usd', (SELECT sum(cost_usd) FROM ev WHERE ev.role = uso.rol)
               ) AS x
        FROM uso GROUP BY rol
      ) t
    ),
    'por_funcion', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'costo_usd')::numeric DESC NULLS LAST, (x->>'llamadas')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'funcion', feature, 'modelo', model,
                 'llamadas', count(*),
                 'tokens', sum(tokens_in + tokens_out),
                 'costo_usd', sum(cost_usd),
                 'caracteres_voz', sum(tts_chars)
               ) AS x
        FROM ev GROUP BY feature, model
      ) t
    ),
    -- Solo personal: ver el comentario de arriba
    'personas', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'usos')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
                 'nombre', max(nombre), 'email', max(email), 'rol', max(rol), 'escuela', max(escuela),
                 'usos', sum(usos), 'tokens', sum(tokens),
                 'usos_hoy', COALESCE(sum(usos) FILTER (WHERE dia = v_hoy), 0),
                 'costo_usd', (SELECT sum(cost_usd) FROM ev WHERE ev.user_id = uso.user_id)
               ) AS x
        FROM uso
        WHERE rol IN ('docente', 'director', 'superadmin')
        GROUP BY user_id
        ORDER BY sum(usos) DESC
        LIMIT 30
      ) t
    )
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION ia_consumption(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia_consumption(INT) TO authenticated;

-- Comprobación: tiene que devolver una fila con ia_events = true y la función
SELECT
  to_regclass('public.ia_events') IS NOT NULL AS ia_events,
  to_regprocedure('public.ia_consumption(integer)') IS NOT NULL AS ia_consumption;
