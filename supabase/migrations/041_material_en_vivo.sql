-- ═══════════════════════════════════════════════════════════════════
-- 041 — El material de la clase, en la clase en vivo
--
-- Hasta ahora una clase en vivo sabía la materia y el curso, nada más.
-- Ahora el docente elige con qué trabaja: un tema de su temario (con el
-- contenido de la clase) o un material de su biblioteca. Lo proyecta, saca
-- preguntas de ahí y, si quiere, lo muestra en los celulares.
--
--  · live_sessions.material_id / class_id: uno u otro (o ninguno). Solo
--    material propio de esa materia, o un tema de esa materia y curso:
--    lo valida un trigger (una policy no puede mirar otras tablas sin
--    abrirles la lectura).
--  · live_sessions.material_visible: los celulares del curso lo ven
--    MIENTRAS la clase está en vivo. No lo comparte para siempre (importa
--    con páginas escaneadas de un libro): al terminar la clase, se corta.
--  · live_class_material(sesión): lo que el alumno puede ver, armado acá
--    porque el tema (planning_classes) no es visible para estudiantes y el
--    material puede no estar compartido.
--  · El archivo (PDF, Word, imagen) se lee por una policy de storage
--    atada a la clase viva.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES library_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES planning_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS live_sessions_un_material;
ALTER TABLE live_sessions ADD CONSTRAINT live_sessions_un_material
  CHECK (material_id IS NULL OR class_id IS NULL);

-- ── Solo material que corresponde a esa clase ──
CREATE OR REPLACE FUNCTION check_live_session_material()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.material_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM library_materials m
    WHERE m.id = NEW.material_id
      AND m.teacher_id = NEW.teacher_id
      AND m.subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'Ese material no es tuyo o no es de esta materia' USING ERRCODE = '42501';
  END IF;

  IF NEW.class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM planning_classes c
    JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = NEW.class_id
      AND u.subject_id = NEW.subject_id
      AND u.course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'Ese tema no es de esta materia y curso' USING ERRCODE = '42501';
  END IF;

  -- Sin material no hay nada que mostrar
  IF NEW.material_id IS NULL AND NEW.class_id IS NULL THEN
    NEW.material_visible := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_sessions_material_check ON live_sessions;
CREATE TRIGGER live_sessions_material_check
  BEFORE INSERT OR UPDATE OF material_id, class_id, material_visible, subject_id, course_id, teacher_id
  ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION check_live_session_material();

-- ── Lo que ve el alumno (y el docente, para proyectar) ──
CREATE OR REPLACE FUNCTION live_class_material(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s live_sessions%ROWTYPE;
  r JSONB;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = p_session;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- El docente de la clase siempre; el alumno, solo si es de ese curso, la
  -- clase sigue en vivo y el docente lo está mostrando.
  IF s.teacher_id IS DISTINCT FROM auth.uid() AND NOT (
    s.status = 'live' AND s.material_visible AND s.course_id = auth_student_course_id()
  ) THEN
    RETURN NULL;
  END IF;

  IF s.class_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'tipo', 'tema',
             'id', c.id,
             'titulo', c.title,
             'unidad', u.title,
             'objetivos', to_jsonb(COALESCE(c.objectives, '{}'::text[])),
             'contenido', c.content
           ) INTO r
    FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = s.class_id;
  ELSIF s.material_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'tipo', 'material',
             'id', m.id,
             'titulo', m.title,
             'descripcion', m.description,
             'file_type', m.file_type,
             'file_name', m.file_name,
             'storage_path', m.storage_path,
             'video_url', m.video_url,
             'texto', m.extracted_text
           ) INTO r
    FROM library_materials m
    WHERE m.id = s.material_id;
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION live_class_material(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION live_class_material(UUID) TO authenticated;

-- ── El archivo, solo durante la clase ──
-- Con definer: con la RLS del alumno, un material no compartido no
-- aparece en library_materials y la policy nunca lo encontraría.
CREATE OR REPLACE FUNCTION is_live_class_file(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM live_sessions ls
    JOIN library_materials m ON m.id = ls.material_id
    WHERE m.storage_path = p_name
      AND ls.status = 'live'
      AND ls.material_visible
      AND ls.course_id = auth_student_course_id()
  )
$$;

DROP POLICY IF EXISTS "Students read live class material file" ON storage.objects;
CREATE POLICY "Students read live class material file"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'library' AND public.is_live_class_file(name));

-- Comprobación: una fila, las tres en true
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'live_sessions' AND column_name = 'material_visible') AS columnas,
  to_regprocedure('public.live_class_material(uuid)') IS NOT NULL AS funcion,
  EXISTS (SELECT 1 FROM pg_policies
          WHERE tablename = 'objects' AND policyname = 'Students read live class material file') AS storage;
