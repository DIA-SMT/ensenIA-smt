-- ═══════════════════════════════════════════════════════════════════════
-- 077 · Migue gasta menos: caché medido y fichas por materia y año
--
--  · ia_events anota cuántos tokens de entrada se leyeron del caché (se
--    cobran al 10%) y cuántos se escribieron. "Consumo de IA" muestra el
--    porcentaje: es la forma de saber si el ahorro anda.
--  · fichas_curso: el currículum oficial (NAP, diseño curricular) de una
--    materia y un año, resumido UNA vez desde la Biblioteca de referencia.
--    Migue lo recibe cuando sabe de qué curso se habla, en un bloque que
--    comparten (y mantienen en caché) todos los de esa materia y año.
--  · fichas_posibles(): para el superadmin, qué materias y años se dan en
--    las escuelas, si tienen documentos oficiales cargados y si ya tienen
--    ficha (o quedó vieja porque cambió un documento).
--
-- Idempotente. Se corre con bin/correr-sql.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ia_events ADD COLUMN IF NOT EXISTS tokens_cache_leidos INT NOT NULL DEFAULT 0;
ALTER TABLE ia_events ADD COLUMN IF NOT EXISTS tokens_cache_escritos INT NOT NULL DEFAULT 0;

-- ── Fichas por materia y año ──
CREATE TABLE IF NOT EXISTS fichas_curso (
  -- normalizar_area(nombre de la materia): "Lengua y Literatura" → lenguayliteratura
  area TEXT NOT NULL CHECK (area ~ '^[a-z0-9]{2,80}$'),
  anio INT NOT NULL CHECK (anio BETWEEN 1 AND 7),
  -- Cómo se llama la materia (para mostrar y para el prompt)
  materia TEXT NOT NULL CHECK (length(btrim(materia)) BETWEEN 2 AND 80),
  texto TEXT NOT NULL CHECK (length(btrim(texto)) > 0 AND length(texto) <= 8000),
  -- Las referencias con las que se armó
  fuentes UUID[] NOT NULL DEFAULT '{}',
  generada_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generada_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (area, anio)
);

ALTER TABLE fichas_curso ENABLE ROW LEVEL SECURITY;

-- Es currículum oficial resumido: lo puede leer cualquier cuenta. La arma
-- la función migue (service role) a pedido del superadmin.
DROP POLICY IF EXISTS "Fichas: cualquiera las lee" ON fichas_curso;
CREATE POLICY "Fichas: cualquiera las lee"
  ON fichas_curso FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Fichas: el superadmin las borra" ON fichas_curso;
CREATE POLICY "Fichas: el superadmin las borra"
  ON fichas_curso FOR DELETE TO authenticated
  USING (is_superadmin());

-- Las materias y años que se dan, con sus documentos y su ficha
CREATE OR REPLACE FUNCTION fichas_posibles()
RETURNS TABLE (
  area TEXT, materia TEXT, anio INT, documentos INT,
  tiene_ficha BOOLEAN, desactualizada BOOLEAN, generada_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin ve las fichas' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH dadas AS (
    SELECT normalizar_area(s.name) AS a, min(s.name) AS m, (substring(c.name FROM '[1-7]'))::int AS y
    FROM teacher_assignments ta
    JOIN subjects s ON s.id = ta.subject_id
    JOIN courses c ON c.id = ta.course_id
    WHERE substring(c.name FROM '[1-7]') IS NOT NULL AND normalizar_area(s.name) <> ''
    GROUP BY 1, 3
  ),
  docs AS (
    SELECT d.a, d.y, r.id AS ref_id, r.updated_at
    FROM dadas d
    JOIN referencias r
      ON r.publicada AND r.vigente AND r.tipo IN ('nap', 'diseno_curricular')
     AND EXISTS (SELECT 1 FROM unnest(r.areas) x WHERE normalizar_area(x) = d.a)
     AND (cardinality(r.anios) = 0 OR d.y = ANY (r.anios))
  )
  SELECT d.a, d.m, d.y,
         count(x.ref_id)::int,
         f.area IS NOT NULL,
         COALESCE(f.area IS NOT NULL AND max(x.updated_at) > f.generada_at, false),
         f.generada_at
  FROM dadas d
  LEFT JOIN docs x ON x.a = d.a AND x.y = d.y
  LEFT JOIN fichas_curso f ON f.area = d.a AND f.anio = d.y
  GROUP BY d.a, d.m, d.y, f.area, f.generada_at
  ORDER BY count(x.ref_id) = 0, d.m, d.y;
END;
$$;

REVOKE ALL ON FUNCTION fichas_posibles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fichas_posibles() TO authenticated;

-- ── Consumo de IA con el caché (igual que en la 040, más tres números) ──
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
      -- 077: cuánto de la entrada salió del caché (se cobra al 10%)
      'tokens_entrada', (SELECT COALESCE(sum(tokens_in), 0) FROM ev),
      'cache_leidos',   (SELECT COALESCE(sum(tokens_cache_leidos), 0) FROM ev),
      'cache_escritos', (SELECT COALESCE(sum(tokens_cache_escritos), 0) FROM ev),
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
                 'tokens_entrada', sum(tokens_in),
                 'cache_leidos', sum(tokens_cache_leidos),
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

-- Comprobación: una fila, todo en true
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ia_events' AND column_name = 'tokens_cache_leidos') AS ia_events_cache,
  to_regclass('public.fichas_curso') IS NOT NULL AS fichas_curso,
  to_regprocedure('public.fichas_posibles()') IS NOT NULL AS fichas_posibles,
  to_regprocedure('public.ia_consumption(integer)') IS NOT NULL AS ia_consumption;
