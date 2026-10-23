-- ═══════════════════════════════════════════════════════════════════
-- 065 — Uso de la plataforma, para el superadmin (Dirección de IA)
--
-- "Consumo de IA" (040) mide la IA. Esto mide si se usa la herramienta:
-- quién entra, qué hace cada docente y qué herramientas se usan, para
-- acompañar a las escuelas (por ejemplo, a quien nunca entró después de
-- la capacitación).
--
--  · uso_plataforma(días): el resumen de la pantalla "Uso de la
--    plataforma". Solo para el superadmin, como ia_consumption.
--  · Los ingresos salen del registro del inicio de sesión
--    (auth.audit_log_entries): "login" es entrar y "token_refreshed" es
--    tener la app abierta (la sesión se renueva sola). Hay registro desde
--    la mudanza al servidor propio (13/10/2026); antes solo se sabe el
--    último ingreso de cada uno (auth.users.last_sign_in_at).
--  · Lo que hizo cada docente sale de lo que guardó: actividades
--    publicadas, entregas corregidas, clases en vivo, listas, evaluaciones,
--    materiales, clases enviadas, unidades de planificación, preguntas a
--    Migue y usos de IA.
--  · Por persona solo aparecen docentes y dirección. Los estudiantes van
--    contados por escuela, sin nombres (mismo criterio que la 040).
--  · Los días son de Argentina.
--  · Solo lectura: no crea tablas ni cambia datos.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION uso_plataforma(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz    CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_dias  INT  := GREATEST(LEAST(COALESCE(p_days, 30), 366), 1);
  v_hoy   DATE := (now() AT TIME ZONE v_tz)::date;
  v_desde DATE := v_hoy - (v_dias - 1);
  v_ini   TIMESTAMPTZ := v_desde::timestamp AT TIME ZONE v_tz;
  r       JSONB;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede ver el uso de la plataforma' USING ERRCODE = '42501';
  END IF;

  WITH
  -- Entró o tuvo la app abierta ese día
  ingreso AS (
    SELECT (a.payload->>'actor_id')::uuid AS user_id,
           (a.created_at AT TIME ZONE v_tz)::date AS dia
    FROM auth.audit_log_entries a
    WHERE a.created_at >= v_ini
      AND a.payload->>'action' IN ('login', 'token_refreshed')
      AND (a.payload->>'actor_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- Docentes y dirección de cada escuela
  personal AS (
    SELECT m.user_id, m.school_id, m.role::text AS rol
    FROM school_memberships m
    WHERE m.role::text IN ('docente', 'director')
  ),
  ultimo AS (
    SELECT u.id AS user_id, u.last_sign_in_at FROM auth.users u
  ),
  -- Lo que hizo cada persona en el período, una fila por cosa
  hecho AS (
    SELECT teacher_id AS user_id, school_id, 'actividades' AS que FROM activities WHERE published_at >= v_ini
    UNION ALL
    SELECT a.teacher_id, a.school_id, 'correcciones'
      FROM activity_submissions su JOIN activities a ON a.id = su.activity_id WHERE su.graded_at >= v_ini
    UNION ALL
    SELECT teacher_id, school_id, 'clases_en_vivo' FROM live_sessions WHERE created_at >= v_ini
    UNION ALL
    SELECT teacher_id, school_id, 'asistencia' FROM attendance_sessions WHERE created_at >= v_ini
    UNION ALL
    SELECT teacher_id, school_id, 'evaluaciones' FROM assessments WHERE created_at >= v_ini
    UNION ALL
    SELECT teacher_id, school_id, 'materiales' FROM library_materials WHERE uploaded_at >= v_ini
    UNION ALL
    SELECT teacher_id, school_id, 'clases_enviadas' FROM clases_enviadas WHERE enviada_at >= v_ini
    UNION ALL
    SELECT pu.teacher_id, c.school_id, 'planificacion'
      FROM planning_units pu JOIN courses c ON c.id = pu.course_id WHERE pu.created_at >= v_ini
    UNION ALL
    SELECT ms.user_id, ms.school_id, 'migue'
      FROM migue_messages mm JOIN migue_sessions ms ON ms.id = mm.session_id
      WHERE mm.role::text = 'user' AND mm.created_at >= v_ini
    UNION ALL
    SELECT e.user_id, e.school_id, 'ia'
      FROM ia_events e WHERE e.created_at >= v_ini AND e.feature NOT IN ('migue', 'migue_riesgo')
  ),
  hecho_personal AS (
    SELECT h.* FROM hecho h WHERE h.user_id IN (SELECT user_id FROM personal)
  ),
  -- Del personal, quién usó la app en el período. Solo cuenta haber
  -- entrado: lo cargado a su nombre (por ejemplo la planificación que se
  -- subió por SQL antes de la capacitación) no dice que la haya usado.
  activo AS (
    SELECT DISTINCT pe.user_id
    FROM personal pe
    LEFT JOIN ultimo u ON u.user_id = pe.user_id
    WHERE u.last_sign_in_at >= v_ini
       OR EXISTS (SELECT 1 FROM ingreso i WHERE i.user_id = pe.user_id)
  ),
  alumno AS (
    SELECT st.id, st.user_id, st.school_id FROM students st
  ),
  entrega AS (
    SELECT su.student_id, a.school_id
    FROM activity_submissions su JOIN activities a ON a.id = su.activity_id
    WHERE su.submitted_at >= v_ini
  ),
  alumno_activo AS (
    SELECT DISTINCT al.id, al.school_id
    FROM alumno al
    LEFT JOIN ultimo u ON u.user_id = al.user_id
    WHERE u.last_sign_in_at >= v_ini
       OR EXISTS (SELECT 1 FROM ingreso i WHERE i.user_id = al.user_id)
       OR EXISTS (SELECT 1 FROM entrega e WHERE e.student_id = al.id)
  ),
  -- Llamadas a la IA de todos los roles (el costo es de la escuela)
  iae AS (
    SELECT e.school_id, e.cost_usd FROM ia_events e WHERE e.created_at >= v_ini
  ),
  usos_ia AS (
    SELECT teacher_id AS user_id, sum(message_count) AS n
    FROM ia_usage WHERE usage_date >= v_desde GROUP BY 1
  )
  SELECT jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hoy,
    'dias', v_dias,
    'ingresos_desde', (SELECT (min(a.created_at) AT TIME ZONE v_tz)::date FROM auth.audit_log_entries a),

    'totales', jsonb_build_object(
      'personal_total',  (SELECT count(DISTINCT user_id) FROM personal),
      'personal_activo', (SELECT count(*) FROM activo),
      'personal_nunca',  (SELECT count(DISTINCT pe.user_id) FROM personal pe
                            JOIN ultimo u ON u.user_id = pe.user_id WHERE u.last_sign_in_at IS NULL),
      'alumnos_total',   (SELECT count(*) FROM alumno),
      'alumnos_activos', (SELECT count(*) FROM alumno_activo),
      'entregas',        (SELECT count(*) FROM entrega),
      'usos_ia',         (SELECT count(*) FROM iae),
      'costo_ia_usd',    (SELECT sum(cost_usd) FROM iae)
    ),

    'por_dia', (
      SELECT jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'personal', (SELECT count(DISTINCT i.user_id) FROM ingreso i
                              WHERE i.dia = d.dia AND i.user_id IN (SELECT user_id FROM personal)),
               'estudiantes', (SELECT count(DISTINCT i.user_id) FROM ingreso i JOIN profiles p ON p.id = i.user_id
                                 WHERE i.dia = d.dia AND p.role::text = 'estudiante'),
               'familias', (SELECT count(DISTINCT i.user_id) FROM ingreso i JOIN profiles p ON p.id = i.user_id
                              WHERE i.dia = d.dia AND p.role::text = 'padre')
             ) ORDER BY d.dia)
      FROM (SELECT generate_series(v_desde, v_hoy, interval '1 day')::date AS dia) d
    ),

    'por_escuela', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x->>'escuela'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'escuela', COALESCE(s.short_name, s.name),
          'personal_total',  (SELECT count(*) FROM personal pe WHERE pe.school_id = s.id),
          'personal_activo', (SELECT count(*) FROM personal pe
                                WHERE pe.school_id = s.id AND pe.user_id IN (SELECT user_id FROM activo)),
          'personal_nunca',  (SELECT count(*) FROM personal pe JOIN ultimo u ON u.user_id = pe.user_id
                                WHERE pe.school_id = s.id AND u.last_sign_in_at IS NULL),
          'alumnos_total',   (SELECT count(*) FROM alumno al WHERE al.school_id = s.id),
          'alumnos_activos', (SELECT count(*) FROM alumno_activo aa WHERE aa.school_id = s.id),
          'entregas',        (SELECT count(*) FROM entrega e WHERE e.school_id = s.id),
          'usos_ia',         (SELECT count(*) FROM iae WHERE iae.school_id = s.id),
          'costo_ia_usd',    (SELECT sum(cost_usd) FROM iae WHERE iae.school_id = s.id),
          'herramientas',    COALESCE((SELECT jsonb_object_agg(t.que, t.n) FROM (
                                SELECT h.que, count(*) AS n FROM hecho_personal h
                                WHERE h.school_id = s.id GROUP BY h.que) t), '{}'::jsonb)
        ) AS x
        FROM schools s
      ) q
    ),

    -- Qué se usa y qué no: cuántas veces y cuántas personas del personal
    'herramientas', (
      SELECT jsonb_agg(jsonb_build_object(
               'herramienta', t.que, 'usos', COALESCE(c.n, 0), 'personas', COALESCE(c.d, 0)
             ) ORDER BY COALESCE(c.d, 0) DESC, COALESCE(c.n, 0) DESC, t.orden)
      FROM (VALUES ('actividades', 1), ('correcciones', 2), ('clases_en_vivo', 3), ('asistencia', 4),
                   ('evaluaciones', 5), ('materiales', 6), ('clases_enviadas', 7), ('planificacion', 8),
                   ('migue', 9), ('ia', 10)) AS t(que, orden)
      LEFT JOIN (SELECT que, count(*) AS n, count(DISTINCT user_id) AS d
                 FROM hecho_personal GROUP BY que) c ON c.que = t.que
    ),

    'por_persona', (
      SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'total')::int DESC, x->>'nombre'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'nombre', trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
          'escuelas', (SELECT string_agg(DISTINCT COALESCE(s.short_name, s.name), ' · ')
                       FROM personal pe JOIN schools s ON s.id = pe.school_id WHERE pe.user_id = p.id),
          'rol', CASE WHEN EXISTS (SELECT 1 FROM personal pe WHERE pe.user_id = p.id AND pe.rol = 'director')
                      THEN 'director' ELSE 'docente' END,
          'ultimo_ingreso', u.last_sign_in_at,
          'dias_activo', (SELECT count(DISTINCT i.dia) FROM ingreso i WHERE i.user_id = p.id),
          'usos_ia', COALESCE((SELECT ui.n FROM usos_ia ui WHERE ui.user_id = p.id), 0),
          'herramientas', COALESCE((SELECT jsonb_object_agg(t.que, t.n) FROM (
                             SELECT h.que, count(*) AS n FROM hecho_personal h
                             WHERE h.user_id = p.id GROUP BY h.que) t), '{}'::jsonb),
          'total', (SELECT count(*) FROM hecho_personal h WHERE h.user_id = p.id)
        ) AS x
        FROM profiles p
        LEFT JOIN ultimo u ON u.user_id = p.id
        WHERE p.id IN (SELECT user_id FROM personal)
      ) q
    )
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION uso_plataforma(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uso_plataforma(INT) TO authenticated;

-- Comprobación: tiene que devolver true
SELECT to_regprocedure('public.uso_plataforma(integer)') IS NOT NULL AS uso_plataforma;
