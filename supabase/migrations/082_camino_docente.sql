-- ═══════════════════════════════════════════════════════════════════════
-- 082 · Camino Docente Tech: la gamificación del docente
--
-- Lo decidió el usuario (25/10/2026):
--  · Sin ranking: cada docente ve su avance (puntos, nivel, medallas, racha)
--    y una meta de toda su escuela, sin nombres.
--  · Lo ve el docente; la dirección, solo si comparte su perfil (el mismo
--    interruptor del perfil docente, 070).
--  · Al subir de nivel, si comparte, le llega un aviso a la dirección para
--    felicitarlo. La primera vez que se calcula no avisa a nadie.
--  · La constancia se cuenta por semanas en las que hizo algo (tomar lista,
--    subir, corregir, dar una clase, escribir), no por abrir la app.
--
-- Nada se registra aparte: todo sale de lo que ya hizo en la app este año.
-- Las medallas y trofeos se arman en el front con estos números
-- (src/lib/caminoDocente.ts). Los nombres de los niveles: iguales allá.
--
-- Idempotente. Se corre con bin/correr-sql.
-- ═══════════════════════════════════════════════════════════════════════

-- El último nivel de cada año, para saber cuándo sube (y avisar una sola vez)
CREATE TABLE IF NOT EXISTS camino_docente (
  docente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  nivel INT NOT NULL DEFAULT 1,
  subio_at TIMESTAMPTZ,
  PRIMARY KEY (docente_id, anio)
);
ALTER TABLE camino_docente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON camino_docente FROM PUBLIC, anon, authenticated;

-- ── Cuánto vale cada cosa (el front muestra esto mismo en "Cómo se suman") ──
CREATE OR REPLACE FUNCTION camino_pesos()
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT '{
    "materiales": 10, "unidades": 5, "temasConFecha": 1, "temasDados": 5, "actividades": 15,
    "corregidas": 2, "devoluciones": 3, "listas": 2, "enVivo": 20, "checkins": 3,
    "medallasDadas": 5, "conversaciones": 4, "medallasDireccion": 25, "semanas": 15, "ciclos": 30
  }'::jsonb
$$;

-- Desde cuántos puntos empieza cada nivel; y sus nombres (iguales en el front)
CREATE OR REPLACE FUNCTION camino_umbrales()
RETURNS INT[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[0, 150, 400, 900, 1800, 3200] $$;
CREATE OR REPLACE FUNCTION camino_nombres()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['Chispa', 'Brújula', 'Puente', 'Docente Tech', 'Referente', 'Faro'] $$;

-- ── Lo que hizo este año (interna: no se le da a nadie directo) ──
CREATE OR REPLACE FUNCTION _camino_numeros(p_docente UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (
    SELECT date_trunc('year', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires' AS inicio,
           extract(year FROM now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS anio,
           date_trunc('week', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS esta_semana
  ),
  mis_unidades AS (
    SELECT u.id FROM planning_units u, d
    WHERE u.teacher_id = p_docente AND (u.anio = d.anio OR (u.anio IS NULL AND u.created_at >= d.inicio))
  ),
  mis_temas AS (
    SELECT c.id, c.fecha, c.is_complete FROM planning_classes c JOIN mis_unidades u ON u.id = c.unit_id
  ),
  -- Una clase en vivo cuenta si duró al menos 5 minutos (abrir y cerrar no suma)
  mis_vivo AS (
    SELECT s.id, s.created_at FROM live_sessions s, d
    WHERE s.teacher_id = p_docente AND s.created_at >= d.inicio
      AND s.status = 'ended' AND s.ended_at - s.created_at >= interval '5 minutes'
  ),
  corregidas AS (
    SELECT s.graded_at, s.feedback FROM activity_submissions s JOIN activities a ON a.id = s.activity_id, d
    WHERE a.teacher_id = p_docente AND s.graded_at >= d.inicio
  ),
  -- Cuándo hizo algo de verdad: de ahí salen las semanas
  hechos AS (
    SELECT m.uploaded_at AS t FROM library_materials m, d WHERE m.teacher_id = p_docente AND m.uploaded_at >= d.inicio
    UNION ALL SELECT a.created_at FROM activities a, d WHERE a.teacher_id = p_docente AND a.created_at >= d.inicio
    UNION ALL SELECT graded_at FROM corregidas
    UNION ALL SELECT (s.taken_on + time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM attendance_sessions s, d
      WHERE s.teacher_id = p_docente AND s.taken_on >= d.inicio::date
    UNION ALL SELECT created_at FROM mis_vivo
    UNION ALL SELECT x.created_at FROM mensajes x, d WHERE x.autor_id = p_docente AND x.created_at >= d.inicio
  ),
  semanas AS (
    SELECT DISTINCT date_trunc('week', t AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS s FROM hechos
  ),
  -- Semanas seguidas: cada isla de semanas consecutivas tiene el mismo "grupo"
  islas AS (SELECT s, s - (row_number() OVER (ORDER BY s) * 7)::int AS grupo FROM semanas),
  rachas AS (SELECT count(*) AS largo, max(s) AS ultima FROM islas GROUP BY grupo)
  SELECT jsonb_build_object(
    'anio', (SELECT anio FROM d),
    'materiales', (SELECT count(*) FROM library_materials m, d WHERE m.teacher_id = p_docente AND m.uploaded_at >= d.inicio),
    'unidades', (SELECT count(*) FROM mis_unidades),
    'temasConFecha', (SELECT count(*) FROM mis_temas WHERE fecha IS NOT NULL),
    'temasDados', (SELECT count(*) FROM mis_temas WHERE is_complete),
    'actividades', (SELECT count(*) FROM activities a, d WHERE a.teacher_id = p_docente AND a.status <> 'draft' AND a.created_at >= d.inicio),
    'corregidas', (SELECT count(*) FROM corregidas),
    -- Una devolución con palabras (no solo la nota)
    'devoluciones', (SELECT count(*) FROM corregidas WHERE char_length(btrim(coalesce(feedback, ''))) >= 20),
    'listas', (SELECT count(*) FROM attendance_sessions s, d WHERE s.teacher_id = p_docente AND s.taken_on >= d.inicio::date),
    'enVivo', (SELECT count(*) FROM mis_vivo),
    'respuestasEnVivo', (SELECT count(*) FROM live_responses r JOIN mis_vivo v ON v.id = r.session_id),
    'checkins', (SELECT count(*) FROM live_activities a JOIN mis_vivo v ON v.id = a.session_id WHERE a.kind = 'checkin'),
    'medallasDadas', (SELECT count(*) FROM student_awards w, d WHERE w.teacher_id = p_docente AND w.created_at >= d.inicio),
    'conversaciones', (
      SELECT count(DISTINCT x.conversacion_id) FROM mensajes x JOIN conversaciones c ON c.id = x.conversacion_id, d
      WHERE x.autor_id = p_docente AND c.con_estudiante AND x.created_at >= d.inicio
    ),
    'medallasDireccion', (SELECT count(*) FROM teacher_awards w, d WHERE w.teacher_id = p_docente AND w.created_at >= d.inicio),
    'semanas', (SELECT count(*) FROM semanas),
    'racha', COALESCE((SELECT max(largo) FROM rachas, d WHERE ultima >= d.esta_semana - 7), 0),
    'mejorRacha', COALESCE((SELECT max(largo) FROM rachas), 0),
    -- El ciclo completo de un tema: material, actividad corregida y tema dado
    'ciclos', (
      SELECT count(*) FROM mis_temas t
      WHERE t.is_complete
        AND EXISTS (SELECT 1 FROM library_materials m WHERE m.class_id = t.id AND m.teacher_id = p_docente)
        AND EXISTS (
          SELECT 1 FROM activities a JOIN activity_submissions s ON s.activity_id = a.id
          WHERE a.class_id = t.id AND a.teacher_id = p_docente AND s.graded_at IS NOT NULL
        )
    )
  )
$$;

CREATE OR REPLACE FUNCTION _camino_puntos(p_numeros JSONB)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  -- Los temas con fecha suman hasta 120 (se cargan de a muchos al subir el programa)
  SELECT COALESCE(sum(
    (p.value)::int * CASE WHEN p.key = 'temasConFecha' THEN LEAST(COALESCE((p_numeros->>p.key)::int, 0), 120)
                         ELSE COALESCE((p_numeros->>p.key)::int, 0) END
  ), 0)::int
  FROM jsonb_each_text(camino_pesos()) p
$$;

CREATE OR REPLACE FUNCTION _camino_nivel(p_puntos INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT max(i) FROM generate_subscripts(camino_umbrales(), 1) i WHERE (camino_umbrales())[i] <= p_puntos
$$;

REVOKE EXECUTE ON FUNCTION _camino_numeros(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _camino_puntos(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _camino_nivel(INT) FROM PUBLIC, anon, authenticated;

-- ── El docente: su camino. Si subió de nivel lo anota y, si comparte, avisa ──
CREATE OR REPLACE FUNCTION mi_camino_docente()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_n JSONB;
  v_puntos INT;
  v_nivel INT;
  v_anio INT;
  v_antes INT;
  v_subio BOOLEAN := false;
  v_primera BOOLEAN := false;
  v_escuela UUID;
  v_nombre TEXT;
BEGIN
  IF v_me IS NULL OR NOT es_docente_o_directivo(v_me) THEN
    RAISE EXCEPTION 'El camino es para docentes.' USING ERRCODE = '42501';
  END IF;
  v_n := _camino_numeros(v_me);
  v_puntos := _camino_puntos(v_n);
  v_nivel := _camino_nivel(v_puntos);
  v_anio := (v_n->>'anio')::int;

  SELECT nivel INTO v_antes FROM camino_docente WHERE docente_id = v_me AND anio = v_anio FOR UPDATE;
  IF NOT FOUND THEN
    -- La primera vez: se anota dónde está, sin avisar a nadie
    INSERT INTO camino_docente (docente_id, anio, nivel) VALUES (v_me, v_anio, v_nivel)
    ON CONFLICT (docente_id, anio) DO NOTHING;
    v_primera := true;
  ELSIF v_nivel > v_antes THEN
    UPDATE camino_docente SET nivel = v_nivel, subio_at = now() WHERE docente_id = v_me AND anio = v_anio;
    v_subio := true;
    -- A la dirección de su escuela, solo si comparte el perfil
    IF EXISTS (SELECT 1 FROM perfil_docente WHERE user_id = v_me AND compartir_con_direccion) THEN
      SELECT school_id, btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) INTO v_escuela, v_nombre
      FROM profiles WHERE id = v_me;
      IF v_escuela IS NOT NULL THEN
        INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
        SELECT v_me, m.user_id,
               v_nombre || ' subió de nivel',
               v_nombre || ' llegó a «' || (camino_nombres())[v_nivel] || '» en su camino Docente Tech. Es un buen momento para '
                 || 'felicitar y, si querés, darle una medalla (Docentes → su perfil → "Dar medalla").',
               'low', v_escuela
        FROM school_memberships m
        WHERE m.school_id = v_escuela AND m.role = 'director' AND m.user_id <> v_me;
      END IF;
    END IF;
  END IF;

  RETURN v_n || jsonb_build_object(
    'puntos', v_puntos, 'nivel', v_nivel, 'umbrales', to_jsonb(camino_umbrales()), 'pesos', camino_pesos(),
    'subio', v_subio, 'primeraVez', v_primera
  );
END;
$$;

-- ── La dirección: el camino de un docente de su escuela, si lo compartió ──
-- Sin los puntos (lo que se ve es el nivel y las medallas). NULL si no se puede.
CREATE OR REPLACE FUNCTION camino_de_docente(p_docente UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM school_memberships m
    JOIN school_memberships yo ON yo.school_id = m.school_id AND yo.user_id = auth.uid() AND yo.role = 'director'
    WHERE m.user_id = p_docente AND m.role = 'docente'
  ) OR NOT EXISTS (SELECT 1 FROM perfil_docente WHERE user_id = p_docente AND compartir_con_direccion) THEN
    RETURN NULL;
  END IF;
  v_n := _camino_numeros(p_docente);
  RETURN v_n || jsonb_build_object('nivel', _camino_nivel(_camino_puntos(v_n)));
END;
$$;

-- ── Entre todos: lo de este mes en la escuela del que pregunta, sin nombres ──
CREATE OR REPLACE FUNCTION meta_de_mi_escuela()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escuela UUID;
  v_mes TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_semana TIMESTAMPTZ := date_trunc('week', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires';
BEGIN
  SELECT p.school_id INTO v_escuela FROM profiles p
  WHERE p.id = auth.uid()
    AND EXISTS (SELECT 1 FROM school_memberships m WHERE m.user_id = p.id AND m.school_id = p.school_id AND m.role IN ('docente', 'director'));
  IF v_escuela IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'clasesEnVivo', (SELECT count(*) FROM live_sessions s WHERE s.school_id = v_escuela AND s.created_at >= v_mes
                       AND s.status = 'ended' AND s.ended_at - s.created_at >= interval '5 minutes'),
    'actividades', (SELECT count(*) FROM activities a WHERE a.school_id = v_escuela AND a.status <> 'draft' AND a.created_at >= v_mes),
    'materiales', (SELECT count(*) FROM library_materials m WHERE m.school_id = v_escuela AND m.uploaded_at >= v_mes),
    'devoluciones', (SELECT count(*) FROM activity_submissions s JOIN activities a ON a.id = s.activity_id
                       WHERE a.school_id = v_escuela AND s.graded_at >= v_mes AND char_length(btrim(coalesce(s.feedback, ''))) >= 20),
    'docentes', (SELECT count(*) FROM school_memberships m WHERE m.school_id = v_escuela AND m.role = 'docente'),
    -- Cuántos hicieron algo esta semana (sin decir quiénes)
    'docentesEstaSemana', (
      SELECT count(DISTINCT t) FROM (
        SELECT teacher_id AS t FROM activities WHERE school_id = v_escuela AND created_at >= v_semana
        UNION SELECT teacher_id FROM library_materials WHERE school_id = v_escuela AND uploaded_at >= v_semana
        UNION SELECT teacher_id FROM attendance_sessions WHERE school_id = v_escuela AND taken_on >= v_semana::date
        UNION SELECT teacher_id FROM live_sessions WHERE school_id = v_escuela AND created_at >= v_semana
      ) x
      WHERE EXISTS (SELECT 1 FROM school_memberships m WHERE m.user_id = x.t AND m.school_id = v_escuela AND m.role = 'docente')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION mi_camino_docente() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION camino_de_docente(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION meta_de_mi_escuela() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mi_camino_docente() TO authenticated;
GRANT EXECUTE ON FUNCTION camino_de_docente(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION meta_de_mi_escuela() TO authenticated;

-- Comprobación: una fila, todo en true
SELECT
  to_regclass('public.camino_docente') IS NOT NULL AS tabla,
  NOT has_function_privilege('authenticated', 'public._camino_numeros(uuid)', 'EXECUTE') AS numeros_internos,
  has_function_privilege('authenticated', 'public.mi_camino_docente()', 'EXECUTE') AS mi_camino,
  NOT has_function_privilege('anon', 'public.mi_camino_docente()', 'EXECUTE') AS sin_anonimos,
  NOT has_table_privilege('authenticated', 'public.camino_docente', 'SELECT') AS estado_sin_lectura_directa;
