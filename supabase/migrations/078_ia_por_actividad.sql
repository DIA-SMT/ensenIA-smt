-- ═══════════════════════════════════════════════════════════════════════
-- 078 · Cuánta IA permite el docente en cada actividad
--
--  · activities.ia_permitida: 'sin_ia' (Migue no ayuda con esa actividad,
--    aunque le peguen la consigna), 'guia' (pistas, no respuestas: lo de
--    siempre y el valor por defecto) o 'libre' (puede revisar el borrador y
--    dar ejemplos resueltos parecidos, sin hacerla entera).
--  · student_activities la muestra (el estudiante ve la regla en la
--    actividad). Mismas columnas que la 063, en el mismo orden, y la nueva
--    al final. Sigue de solo lectura (064).
--
-- Las ya publicadas quedan en 'guia': no se cambia lo que el docente ya
-- decidió. Al armar una evaluación nueva, la app propone 'sin_ia'.
--
-- Idempotente. Se corre con bin/correr-sql.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS ia_permitida TEXT NOT NULL DEFAULT 'guia';

DO $$ BEGIN
  ALTER TABLE activities ADD CONSTRAINT activities_ia_permitida_check
    CHECK (ia_permitida IN ('sin_ia', 'guia', 'libre'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activities' AND column_name = 'ia_permitida') AS columna,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_activities' AND column_name = 'ia_permitida') AS en_la_vista,
  NOT has_table_privilege('authenticated', 'public.student_activities', 'UPDATE') AS vista_solo_lectura;
