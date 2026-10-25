-- ═══════════════════════════════════════════════════════════════════════
-- 079 · Migue para repasar un tema
--
-- El docente abre, desde el tema, un repaso con Migue para su curso: los
-- estudiantes conversan con Migue como tutor de ESE tema (pistas y
-- preguntas, no respuestas), y el docente recibe un resumen de qué les
-- costó, SIN nombres y solo cuando lo usaron al menos tres estudiantes (si
-- no, se podría saber quién preguntó qué). El docente nunca lee las charlas.
--
--  · tutor_temas: un repaso por tema (abierto o cerrado, con una consigna
--    opcional del docente y el último resumen). El resumen lo escribe la
--    función migue (service role): el docente no puede escribirlo.
--  · migue_sessions.class_id: la charla de repaso de un estudiante sobre un
--    tema. Una por tema (más la de siempre, sin tema).
--  · tutores_abiertos(): lo que ve el estudiante (los repasos abiertos de
--    sus materias y cursos), y tutor_abierto(tema): ese, si lo ve.
--  · uso_tutor(tema): para el docente, cuántos estudiantes lo usaron y
--    cuántos mensajes hubo. Solo números.
--
-- Idempotente. Se corre con bin/correr-sql.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tutor_temas (
  class_id UUID PRIMARY KEY REFERENCES planning_classes(id) ON DELETE CASCADE,
  abierto BOOLEAN NOT NULL DEFAULT true,
  -- Lo que el docente quiere que Migue haga (opcional)
  consigna TEXT CHECK (consigna IS NULL OR length(consigna) <= 600),
  -- El último resumen de lo que les costó (lo escribe la función migue)
  resumen TEXT CHECK (resumen IS NULL OR length(resumen) <= 6000),
  resumen_at TIMESTAMPTZ,
  resumen_estudiantes INT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tutor_temas ENABLE ROW LEVEL SECURITY;

-- El docente, en sus temas (mismo criterio que planificacion_nap, 050)
DROP POLICY IF EXISTS "Tutor: el docente en sus temas" ON tutor_temas;
CREATE POLICY "Tutor: el docente en sus temas"
  ON tutor_temas FOR ALL TO authenticated
  USING (es_mi_tema(class_id))
  WITH CHECK (es_mi_tema(class_id));

-- El docente abre, cierra y escribe la consigna; el resumen, no
REVOKE INSERT, UPDATE ON tutor_temas FROM anon, authenticated;
GRANT INSERT (class_id, abierto, consigna) ON tutor_temas TO authenticated;
GRANT UPDATE (abierto, consigna, updated_at) ON tutor_temas TO authenticated;

-- ── Las charlas de repaso ──
ALTER TABLE migue_sessions ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES planning_classes(id) ON DELETE CASCADE;

-- Una charla por persona y audiencia… y por tema (032 era una sola)
ALTER TABLE migue_sessions DROP CONSTRAINT IF EXISTS migue_sessions_user_audience_key;
CREATE UNIQUE INDEX IF NOT EXISTS migue_sessions_una_por_tema
  ON migue_sessions (user_id, audience, COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_migue_sessions_tema ON migue_sessions (class_id) WHERE class_id IS NOT NULL;

-- El cliente crea su charla con el tema (user_id y escuela los sigue poniendo el servidor, 031).
-- Que el tema sea de un repaso abierto de su curso lo controla la función migue.
GRANT INSERT (audience, title, class_id) ON migue_sessions TO authenticated;

-- ── Lo que ve el estudiante: los repasos abiertos de sus materias ──
CREATE OR REPLACE FUNCTION tutores_abiertos()
RETURNS TABLE (
  class_id UUID, titulo TEXT, unidad TEXT, materia TEXT, subject_id UUID, course_id UUID,
  consigna TEXT, objetivos JSONB, ya_empezo BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, u.title, s.name, u.subject_id, u.course_id,
         t.consigna, to_jsonb(c.objectives),
         EXISTS (SELECT 1 FROM migue_sessions ms WHERE ms.user_id = auth.uid() AND ms.class_id = c.id)
  FROM tutor_temas t
  JOIN planning_classes c ON c.id = t.class_id
  JOIN planning_units u ON u.id = c.unit_id
  JOIN subjects s ON s.id = u.subject_id
  JOIN enrollments e ON e.subject_id = u.subject_id AND e.course_id = u.course_id
  WHERE t.abierto
    AND e.student_id = auth_student_id()
    -- Del año, y del docente que todavía da esa materia en ese curso: si lo
    -- cambiaron, el repaso no queda abierto sin nadie que lo pueda cerrar
    AND (u.anio IS NULL OR u.anio = extract(year FROM now())::int)
    AND EXISTS (SELECT 1 FROM teacher_assignments ta
                WHERE ta.teacher_id = u.teacher_id AND ta.subject_id = u.subject_id AND ta.course_id = u.course_id)
  ORDER BY t.updated_at DESC
$$;

REVOKE ALL ON FUNCTION tutores_abiertos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tutores_abiertos() TO authenticated;

-- El de un tema, para la función migue en cada mensaje (con el JWT del estudiante)
CREATE OR REPLACE FUNCTION tutor_abierto(p_class UUID)
RETURNS TABLE (
  class_id UUID, titulo TEXT, unidad TEXT, materia TEXT, subject_id UUID, course_id UUID,
  consigna TEXT, objetivos JSONB, ya_empezo BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM tutores_abiertos() x WHERE x.class_id = p_class
$$;

REVOKE ALL ON FUNCTION tutor_abierto(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tutor_abierto(UUID) TO authenticated;

-- ── Para el docente: cuánto se usó (solo números, nunca el contenido) ──
CREATE OR REPLACE FUNCTION uso_tutor(p_class UUID)
RETURNS TABLE (estudiantes INT, mensajes INT, ultimo TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT es_mi_tema(p_class) THEN
    RAISE EXCEPTION 'Ese tema no es tuyo' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT count(DISTINCT ms.user_id)::int, count(mm.id)::int, max(mm.created_at)
  FROM migue_sessions ms
  JOIN migue_messages mm ON mm.session_id = ms.id AND mm.role = 'user'
  WHERE ms.class_id = p_class AND ms.audience = 'estudiante';
END;
$$;

REVOKE ALL ON FUNCTION uso_tutor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION uso_tutor(UUID) TO authenticated;

-- Comprobación: una fila, todo en true
SELECT
  to_regclass('public.tutor_temas') IS NOT NULL AS tutor_temas,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'migue_sessions' AND column_name = 'class_id') AS sesion_con_tema,
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'migue_sessions_user_audience_key') AS sin_unica_vieja,
  to_regclass('public.migue_sessions_una_por_tema') IS NOT NULL AS una_por_tema,
  to_regprocedure('public.tutores_abiertos()') IS NOT NULL AS tutores_abiertos,
  to_regprocedure('public.tutor_abierto(uuid)') IS NOT NULL AS tutor_abierto,
  to_regprocedure('public.uso_tutor(uuid)') IS NOT NULL AS uso_tutor;
