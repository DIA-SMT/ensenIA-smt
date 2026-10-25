-- ═══════════════════════════════════════════════════════════════════
-- 068 — Preguntas preparadas para la clase en vivo (fase 5, parte 2)
--
-- Escribir una pregunta con opciones en el celular, en el medio de la
-- clase, es lo que hacía que la clase en vivo no se usara. Ahora se
-- preparan antes, en "Preparar la clase" (con la compu y con tiempo), y en
-- el aula se lanzan con un toque.
--
--  · preguntas_en_vivo: las preguntas de cada tema, del docente que lo da.
--    Solo las ve y las cambia él (los chicos las ven recién cuando las
--    lanza, como cualquier pregunta en vivo).
--  · live_activities.class_id: de qué tema era la pregunta lanzada. Con
--    varios materiales en una clase (049), "temas para repasar" ya no la
--    atribuye al tema que estaba en pantalla, sino al suyo.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS preguntas_en_vivo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id    UUID NOT NULL REFERENCES planning_classes(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('quiz', 'encuesta', 'chips', 'nube', 'texto')),
  config      JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  orden       INT NOT NULL DEFAULT 0,
  -- La última vez que la lanzó (el panel la marca "ya la usaste")
  lanzada_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preguntas_en_vivo_tema_idx ON preguntas_en_vivo (class_id, orden, created_at);

ALTER TABLE preguntas_en_vivo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON preguntas_en_vivo FROM anon;

-- Del docente del tema: el tema tiene que ser de una unidad suya
DROP POLICY IF EXISTS "Teacher manages own live questions" ON preguntas_en_vivo;
CREATE POLICY "Teacher manages own live questions"
  ON preguntas_en_vivo FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (SELECT 1 FROM planning_classes c JOIN planning_units u ON u.id = c.unit_id
                WHERE c.id = preguntas_en_vivo.class_id AND u.teacher_id = auth.uid())
  );

-- El autor lo pone la base; la pregunta, con los mismos topes que el panel
-- (200 letras la pregunta, de 2 a 6 opciones de hasta 80)
CREATE OR REPLACE FUNCTION cuidar_pregunta_en_vivo()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_pregunta TEXT := btrim(coalesce(NEW.config->>'question', ''));
  v_opciones JSONB := NEW.config->'options';
  n INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.teacher_id := coalesce(auth.uid(), NEW.teacher_id);
    NEW.created_at := now();
  ELSE
    NEW.teacher_id := OLD.teacher_id;
    NEW.created_at := OLD.created_at;
  END IF;
  IF v_pregunta = '' OR char_length(v_pregunta) > 200 THEN
    RAISE EXCEPTION 'Escribí la pregunta (hasta 200 letras).' USING ERRCODE = '22023';
  END IF;
  IF NEW.kind IN ('quiz', 'encuesta', 'chips') THEN
    n := CASE WHEN jsonb_typeof(v_opciones) = 'array' THEN jsonb_array_length(v_opciones) ELSE 0 END;
    IF n < 2 OR n > 6 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_opciones) o
                                 WHERE btrim(coalesce(o->>'label', '')) = '' OR char_length(o->>'label') > 80
                                    OR coalesce(o->>'id', '') = '') THEN
      RAISE EXCEPTION 'Una pregunta con opciones lleva de 2 a 6, cada una de hasta 80 letras.' USING ERRCODE = '22023';
    END IF;
    IF NEW.kind = 'quiz' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_opciones) o WHERE o->>'id' = NEW.config->>'correctId') THEN
      RAISE EXCEPTION 'Marcá cuál es la respuesta correcta.' USING ERRCODE = '22023';
    END IF;
  END IF;
  NEW.config := NEW.config || jsonb_build_object('question', v_pregunta);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cuidar_pregunta_en_vivo ON preguntas_en_vivo;
CREATE TRIGGER trg_cuidar_pregunta_en_vivo
  BEFORE INSERT OR UPDATE ON preguntas_en_vivo
  FOR EACH ROW EXECUTE FUNCTION cuidar_pregunta_en_vivo();

-- De qué tema era cada pregunta lanzada
ALTER TABLE live_activities
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES planning_classes(id) ON DELETE SET NULL;

-- Comprobación: una fila, todo true
SELECT
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'preguntas_en_vivo' AND policyname = 'Teacher manages own live questions') AS preguntas,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'live_activities' AND column_name = 'class_id') AS actividad_con_tema,
  NOT has_table_privilege('anon', 'preguntas_en_vivo', 'SELECT') AS sin_anonimos;
