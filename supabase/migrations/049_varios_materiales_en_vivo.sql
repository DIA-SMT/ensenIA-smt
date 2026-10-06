-- ═══════════════════════════════════════════════════════════════════
-- 049 — Varios materiales en la clase en vivo
--
-- La 041 dejaba elegir UN material por clase. Pero una clase suele usar
-- más de uno: el tema del temario, un PDF, un video, las diapositivas.
-- Ahora la clase tiene su lista (live_session_materials) y el docente pasa
-- de uno a otro con un toque.
--
-- Lo que no cambia: en cada momento hay UNO "en pantalla"
-- (live_sessions.material_id / class_id, de la 041). Es el que se
-- proyecta, el que ven los celulares si el docente lo muestra y del que la
-- IA saca preguntas. Los alumnos siguen viendo solo ese, solo mientras la
-- clase está en vivo (live_class_material e is_live_class_file no cambian).
--
--  · Solo material propio de esa materia, o temas de esa materia y curso
--    (mismas reglas que la 041, con un trigger).
--  · El que está en pantalla siempre está en la lista: si se elige uno
--    nuevo (o se arranca la clase con uno), se suma solo. Así también anda
--    la app de antes de esta migración.
--  · Si se quita de la lista el que está en pantalla, pasa el siguiente.
-- Requiere la 041.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS live_session_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  material_id UUID REFERENCES library_materials(id) ON DELETE CASCADE,
  class_id UUID REFERENCES planning_classes(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT live_session_materials_uno_u_otro CHECK ((material_id IS NULL) <> (class_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS live_session_materials_material_unico
  ON live_session_materials(session_id, material_id) WHERE material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS live_session_materials_tema_unico
  ON live_session_materials(session_id, class_id) WHERE class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS live_session_materials_orden
  ON live_session_materials(session_id, sort_order);

ALTER TABLE live_session_materials ENABLE ROW LEVEL SECURITY;

-- Solo el docente de la clase. Los alumnos ven el que está en pantalla por
-- live_class_material (041), no la lista.
DROP POLICY IF EXISTS "Teachers manage the materials of their live sessions" ON live_session_materials;
CREATE POLICY "Teachers manage the materials of their live sessions"
  ON live_session_materials FOR ALL
  USING (EXISTS (SELECT 1 FROM live_sessions s WHERE s.id = session_id AND s.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM live_sessions s WHERE s.id = session_id AND s.teacher_id = auth.uid()));

-- ── Solo material que corresponde a esa clase ──
CREATE OR REPLACE FUNCTION check_live_session_materials_item()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s live_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = NEW.session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa clase no existe' USING ERRCODE = '23503';
  END IF;

  IF NEW.material_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM library_materials m
    WHERE m.id = NEW.material_id AND m.teacher_id = s.teacher_id AND m.subject_id = s.subject_id
  ) THEN
    RAISE EXCEPTION 'Ese material no es tuyo o no es de esta materia' USING ERRCODE = '42501';
  END IF;

  IF NEW.class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM planning_classes c
    JOIN planning_units u ON u.id = c.unit_id
    WHERE c.id = NEW.class_id AND u.subject_id = s.subject_id AND u.course_id = s.course_id
  ) THEN
    RAISE EXCEPTION 'Ese tema no es de esta materia y curso' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_session_materials_check ON live_session_materials;
CREATE TRIGGER live_session_materials_check
  BEFORE INSERT OR UPDATE OF material_id, class_id, session_id ON live_session_materials
  FOR EACH ROW EXECUTE FUNCTION check_live_session_materials_item();

-- ── El que está en pantalla siempre está en la lista ──
CREATE OR REPLACE FUNCTION live_session_material_a_la_lista()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.material_id IS NULL AND NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM live_session_materials l
    WHERE l.session_id = NEW.id
      AND (l.material_id = NEW.material_id OR l.class_id = NEW.class_id)
  ) THEN
    INSERT INTO live_session_materials (session_id, material_id, class_id, sort_order)
    SELECT NEW.id, NEW.material_id, NEW.class_id,
           COALESCE((SELECT max(sort_order) FROM live_session_materials WHERE session_id = NEW.id), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_sessions_material_a_la_lista ON live_sessions;
CREATE TRIGGER live_sessions_material_a_la_lista
  AFTER INSERT OR UPDATE OF material_id, class_id ON live_sessions
  FOR EACH ROW EXECUTE FUNCTION live_session_material_a_la_lista();

-- ── Si se quita el que está en pantalla, pasa el siguiente ──
CREATE OR REPLACE FUNCTION live_session_material_quitado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sig live_session_materials%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM live_sessions s
    WHERE s.id = OLD.session_id
      AND (s.material_id = OLD.material_id OR s.class_id = OLD.class_id)
  ) THEN
    RETURN OLD;
  END IF;

  SELECT * INTO sig FROM live_session_materials
  WHERE session_id = OLD.session_id
  ORDER BY (sort_order < OLD.sort_order), sort_order  -- primero el que seguía; si no, el primero
  LIMIT 1;

  UPDATE live_sessions
  SET material_id = sig.material_id, class_id = sig.class_id
  WHERE id = OLD.session_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS live_session_materials_quitado ON live_session_materials;
CREATE TRIGGER live_session_materials_quitado
  AFTER DELETE ON live_session_materials
  FOR EACH ROW EXECUTE FUNCTION live_session_material_quitado();

-- Las clases en vivo que están andando ahora: su material entra a la lista
INSERT INTO live_session_materials (session_id, material_id, class_id, sort_order)
SELECT s.id, s.material_id, s.class_id, 1
FROM live_sessions s
WHERE s.status = 'live'
  AND (s.material_id IS NOT NULL OR s.class_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM live_session_materials l WHERE l.session_id = s.id);

-- Comprobación: una fila, las dos en true
SELECT
  to_regclass('public.live_session_materials') IS NOT NULL AS tabla,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'live_sessions_material_a_la_lista') AS en_pantalla_en_la_lista;
