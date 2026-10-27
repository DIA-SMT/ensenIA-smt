-- ═══════════════════════════════════════════════════════════════════════
-- 084 · El estudiante no ve la clave de corrección
--
-- La 019 le sacó al estudiante la opción correcta de las preguntas
-- (correct_index), pero una evaluación armada con la IA llega como texto
-- (content_md) y la IA le suma al final "✅ Respuestas correctas", "🔑 Clave
-- de corrección (uso docente)" o "📌 Nota para el docente". Al publicarla, el
-- estudiante la recibía entera, con las respuestas. Lo vio el usuario el
-- 26/10/2026 entrando como estudiante de prueba.
--
--  · parte_para_estudiante(md): el texto hasta el primer título que anuncia
--    la parte del docente. Mismo corte que src/lib/parteDocente.ts: si
--    cambia una, cambia la otra. El título tiene que EMPEZAR así ("Marcá
--    las respuestas correctas" es una consigna y no corta).
--  · student_activities devuelve content_md cortado. El docente sigue
--    viendo su texto entero (lee activities). Mismas columnas que la 078,
--    en el mismo orden. Sigue de solo lectura (064).
--
-- Desde ahora la IA escribe esa parte al final bajo "## 🔒 Solo para el
-- docente" (ia-chat/_tools.ts); los títulos viejos también se reconocen.
--
-- Idempotente. Se corre con bin/correr-sql. Requiere la 078.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION parte_para_estudiante(md TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_pos INT;
BEGIN
  IF md IS NULL THEN RETURN NULL; END IF;
  -- 'n': ^ y $ son principio y fin de línea; 'i': sin importar mayúsculas
  v_pos := regexp_instr(md,
    '^[ \t]*(#{1,4}|\*\*)[ \t]*[^[:alpha:]\n]*('
    || 'solo para (el|la|los) docentes?'
    || '|(notas?|sugerencias|orientaciones|indicaciones) para (el|la|los) docentes?'
    || '|para (el|la) docente'
    || '|uso (del |de la )?docente'
    || '|claves? de (correcci|respuestas)'
    || '|respuestas? (correctas?|esperadas|sugeridas|modelo)'
    || '|solucionario'
    || '|soluciones[ \t:.*]*$'
    || '|gu[iíÍ]a de correcci'
    || '|pauta de correcci'
    || '|criterios de correcci'
    || '|r[uúÚ]brica de correcci'
    || ')', 1, 1, 0, 'in');
  IF v_pos = 0 THEN RETURN md; END IF;
  -- Sin la raya (---) que suele separar las dos partes
  RETURN regexp_replace(left(md, v_pos - 1), '[[:space:]*_-]+$', '');
END;
$$;

GRANT EXECUTE ON FUNCTION parte_para_estudiante(TEXT) TO authenticated;

CREATE OR REPLACE VIEW student_activities AS
SELECT
  a.id,
  a.title,
  a.description,
  parte_para_estudiante(a.content_md) AS content_md,
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
  a.published_at,
  a.ia_permitida
FROM activities a
WHERE a.status = 'published'
  AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth_student_id()
      AND e.subject_id = a.subject_id
      AND e.course_id = a.course_id
  );

-- Solo lectura (064): sin el REVOKE, la vista aceptaría UPDATE, INSERT y
-- DELETE saltando la RLS de activities.
REVOKE ALL ON student_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON student_activities TO authenticated;
ALTER VIEW student_activities SET (security_barrier = true);

-- Comprobación: una fila, todo en true
SELECT
  parte_para_estudiante(E'# Evaluación\n1) ¿Qué es?\n\n---\n\n## ✅ Respuestas correctas\n1) b') = E'# Evaluación\n1) ¿Qué es?' AS corta_respuestas,
  parte_para_estudiante(E'Consigna\n### 🔑 Clave de corrección (uso docente)\n1-a') = 'Consigna' AS corta_clave,
  parte_para_estudiante(E'Consigna\n## 🔒 Solo para el docente\nTodo') = 'Consigna' AS corta_solo_docente,
  parte_para_estudiante(E'## Marcá las respuestas correctas\n1) …') = E'## Marcá las respuestas correctas\n1) …' AS respeta_consignas,
  parte_para_estudiante(E'## Soluciones para cuidar el agua\nIdeas') = E'## Soluciones para cuidar el agua\nIdeas' AS respeta_temas,
  NOT has_table_privilege('authenticated', 'public.student_activities', 'UPDATE') AS vista_solo_lectura;
