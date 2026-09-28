-- ═══════════════════════════════════════════════════════════════════
-- 019 — El alumno no recibe las respuestas correctas antes de entregar
--
-- La policy "Students see published activities of their enrollments"
-- (003) le daba al alumno la fila entera de activities, con
-- questions[].correct_index adentro: con las herramientas del navegador
-- se veía cuál era la opción correcta de cada pregunta.
--
-- Ahora el alumno no lee activities: lee la vista student_activities,
-- que es la misma fila con las preguntas sin correct_index y filtrada a
-- lo que le corresponde (publicada, de sus materias). La corrección la
-- hace la base al entregar (018) y la entrega guarda `correct` y
-- `correct_index` de cada respuesta, que es de donde la app muestra el
-- resultado.
--
-- La vista es GET a /rest/v1/, así que el service worker la sigue
-- cacheando y las actividades ya vistas abren sin conexión.
--
-- Requiere la 018 (student_can_see_activity y la policy de INSERT).
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Students see published activities of their enrollments" ON activities;

-- Sin security_invoker: corre con los permisos del dueño y no pasa por
-- la RLS de activities (que el alumno ya no tiene). El filtro de abajo
-- hace de RLS: un docente o director que la consulte no ve nada.
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
  a.updated_at
FROM activities a
WHERE a.status = 'published'
  AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = auth_student_id()
      AND e.subject_id = a.subject_id
      AND e.course_id = a.course_id
  );

REVOKE ALL ON student_activities FROM PUBLIC, anon;
GRANT SELECT ON student_activities TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- Clase en vivo: lo mismo con el quiz
--
-- El alumno leía live_activities entero, con config.correctId, mientras
-- la sala todavía votaba. Los invitados ya lo tenían resuelto
-- (live_guest_state, 012); ahora el alumno logueado lee
-- live_activities_alumno, que saca correctId hasta que el docente revela.
--
-- El nombre empieza con live_ a propósito: el service worker no cachea
-- /rest/v1/live_* (ver vite.config.ts), y en la clase en vivo una
-- respuesta vieja es peor que ninguna.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Students see activities of their course sessions" ON live_activities;

CREATE OR REPLACE VIEW live_activities_alumno AS
SELECT
  la.id,
  la.session_id,
  la.kind,
  la.status,
  CASE
    WHEN la.kind = 'quiz' AND la.status <> 'revealed' THEN la.config - 'correctId'
    ELSE la.config
  END AS config,
  la.target_student_id,
  la.created_at
FROM live_activities la
WHERE la.session_id IN (
  SELECT id FROM live_sessions WHERE course_id = auth_student_course_id()
);

REVOKE ALL ON live_activities_alumno FROM PUBLIC, anon;
GRANT SELECT ON live_activities_alumno TO authenticated;
