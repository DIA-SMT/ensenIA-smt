-- ═══════════════════════════════════════════════════════════════════════
-- 080 · Qué va logrando cada estudiante, por saber
--
-- Un "saber" es un NAP vinculado al tema (planificacion_nap, 050) o, si el
-- tema todavía no tiene NAP vinculados, el tema mismo. La evidencia son las
-- actividades, TP y evaluaciones de esos temas ya entregadas y corregidas
-- (también las de papel que anotó el docente, 063): el puntaje sobre el
-- total de la actividad. La app lo muestra como "Logrado" (60% o más, el 6
-- de aprobación), "En proceso" (40 a 59%) o "Todavía no".
--
--  · progreso_saberes(materia, curso): para el docente de esa materia y
--    curso. Un JSON con los saberes (y de qué temas salen) y, por
--    estudiante, el promedio y la cantidad de evidencias de cada uno.
--
-- Solo lectura; no cambia ninguna tabla. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION progreso_saberes(p_subject UUID, p_course UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r JSONB;
  v_anio INT := extract(year FROM now())::int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teacher_assignments ta
    WHERE ta.teacher_id = auth.uid() AND ta.subject_id = p_subject AND ta.course_id = p_course
  ) THEN
    RAISE EXCEPTION 'Esa materia y ese curso no son tuyos' USING ERRCODE = '42501';
  END IF;

  WITH temas AS (
    -- Los temas de su planificación de este año en esa materia y curso
    SELECT c.id, c.title, c.sort_order AS orden_tema, u.sort_order AS orden_unidad
    FROM planning_classes c
    JOIN planning_units u ON u.id = c.unit_id
    WHERE u.teacher_id = auth.uid() AND u.subject_id = p_subject AND u.course_id = p_course
      AND (u.anio IS NULL OR u.anio = v_anio)
  ),
  -- Cada tema aporta a sus NAP; sin NAP, a sí mismo
  saber_de_tema AS (
    SELECT t.id AS class_id, 'nap:' || pn.fragmento_id AS saber_id
    FROM temas t JOIN planificacion_nap pn ON pn.class_id = t.id
    UNION ALL
    SELECT t.id, 'tema:' || t.id
    FROM temas t
    WHERE NOT EXISTS (SELECT 1 FROM planificacion_nap pn WHERE pn.class_id = t.id)
  ),
  acts AS (
    SELECT a.id, a.class_id, a.points
    FROM activities a
    WHERE a.class_id IN (SELECT id FROM temas)
      AND a.subject_id = p_subject AND a.course_id = p_course
      AND a.status IN ('published', 'closed')
      AND a.points IS NOT NULL AND a.points > 0
  ),
  notas AS (
    -- Lo entregado y con puntaje: el corregido por el docente o, si no, el automático
    SELECT s.student_id, a.class_id,
           LEAST(100, GREATEST(0, 100.0 * COALESCE(s.score, s.auto_score) / a.points)) AS pct
    FROM activity_submissions s
    JOIN acts a ON a.id = s.activity_id
    WHERE s.status IN ('submitted', 'graded')
      AND COALESCE(s.score, s.auto_score) IS NOT NULL
  ),
  por_saber AS (
    SELECT n.student_id, sdt.saber_id, round(avg(n.pct))::int AS pct, count(*)::int AS n
    FROM notas n JOIN saber_de_tema sdt ON sdt.class_id = n.class_id
    GROUP BY n.student_id, sdt.saber_id
  ),
  saberes AS (
    SELECT sdt.saber_id,
           -- El CASE asegura que solo se convierta lo que es un NAP
           CASE WHEN sdt.saber_id LIKE 'nap:%' THEN substring(sdt.saber_id FROM 5)::uuid END AS frag_id,
           min(t.orden_unidad) AS ou, min(t.orden_tema) AS ot,
           jsonb_agg(DISTINCT t.title) AS temas,
           (SELECT count(*) FROM acts a JOIN saber_de_tema x ON x.class_id = a.class_id WHERE x.saber_id = sdt.saber_id)::int AS actividades
    FROM saber_de_tema sdt JOIN temas t ON t.id = sdt.class_id
    GROUP BY sdt.saber_id
  ),
  alumnos AS (
    SELECT st.id, st.first_name, st.last_name
    FROM enrollments e JOIN students st ON st.id = e.student_id
    WHERE e.subject_id = p_subject AND e.course_id = p_course
  )
  SELECT jsonb_build_object(
    'saberes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.saber_id,
               'tipo', split_part(s.saber_id, ':', 1),
               'titulo', CASE WHEN s.saber_id LIKE 'nap:%'
                              THEN COALESCE(f.seccion, left(f.texto, 120))
                              ELSE s.temas->>0 END,
               'documento', CASE WHEN s.saber_id LIKE 'nap:%' THEN COALESCE(ref.numero, ref.titulo) END,
               'temas', s.temas,
               'actividades', s.actividades
             ) ORDER BY s.ou NULLS LAST, s.ot NULLS LAST, s.saber_id)
      FROM saberes s
      LEFT JOIN referencia_fragmentos f ON f.id = s.frag_id
      LEFT JOIN referencias ref ON ref.id = f.referencia_id
    ), '[]'::jsonb),
    'estudiantes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', al.id, 'nombre', al.first_name, 'apellido', al.last_name,
               'valores', COALESCE((
                 SELECT jsonb_object_agg(ps.saber_id, jsonb_build_object('pct', ps.pct, 'n', ps.n))
                 FROM por_saber ps WHERE ps.student_id = al.id
               ), '{}'::jsonb)
             ) ORDER BY al.last_name, al.first_name)
      FROM alumnos al
    ), '[]'::jsonb)
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION progreso_saberes(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION progreso_saberes(UUID, UUID) TO authenticated;

-- Comprobación: una fila en true
SELECT to_regprocedure('public.progreso_saberes(uuid, uuid)') IS NOT NULL AS progreso_saberes;
