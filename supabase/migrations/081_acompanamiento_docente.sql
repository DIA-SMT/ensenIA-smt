-- ═══════════════════════════════════════════════════════════════════════
-- 081 · Acompañamiento de dirección a sus docentes
--
-- Lo decidió el usuario (25/10/2026): es formativo, no una calificación.
--  · La dirección observa una clase con una pauta (planificación, clima,
--    estrategias, participación, evaluación, inclusión: "Logrado", "En
--    proceso", "A fortalecer" o "No observado", con una nota), escribe
--    fortalezas y sugerencias y acuerda próximos pasos.
--  · Mientras es borrador, el docente no la ve. Al cerrarla la ve TODA, le
--    llega una notificación, puede marcar "Me notifiqué" y responder.
--    Cerrada, lo escrito ya no se cambia (el docente se notificó de eso):
--    solo se tildan los acuerdos cumplidos.
--  · La app no calcula notas ni rankings de docentes: no hay ningún número
--    acá que salga de su uso.
--
-- Idempotente. Se corre con bin/correr-sql.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS observaciones_docentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  docente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  observador_id UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  fecha DATE NOT NULL DEFAULT current_date,
  -- La clase observada (opcional)
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  -- { "<dimensión>": { "valor": "logrado|en_proceso|a_fortalecer|no_observado", "nota": "…" } }
  pauta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(pauta) = 'object' AND length(pauta::text) <= 12000),
  fortalezas TEXT CHECK (fortalezas IS NULL OR length(fortalezas) <= 4000),
  sugerencias TEXT CHECK (sugerencias IS NULL OR length(sugerencias) <= 4000),
  -- [ { "texto": "…", "cumplido": false } ]
  acuerdos JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(acuerdos) = 'array' AND length(acuerdos::text) <= 6000),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'cerrada')),
  cerrada_at TIMESTAMPTZ,
  -- Lo del docente: solo por las funciones de abajo
  notificado_at TIMESTAMPTZ,
  respuesta_docente TEXT CHECK (respuesta_docente IS NULL OR length(respuesta_docente) <= 3000),
  respondida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obs_docente ON observaciones_docentes (docente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_obs_escuela ON observaciones_docentes (school_id, fecha DESC);

ALTER TABLE observaciones_docentes ENABLE ROW LEVEL SECURITY;

-- Solo la dirección de ESA escuela (no manages_school: también daría paso al
-- superadmin de la plataforma, y esto es entre la escuela y su docente)
DROP POLICY IF EXISTS "Acompañamiento: dirección lee" ON observaciones_docentes;
CREATE POLICY "Acompañamiento: dirección lee"
  ON observaciones_docentes FOR SELECT TO authenticated
  USING (is_member_as(auth.uid(), school_id, 'director'));

-- Crea solo para docentes de su escuela, a su nombre
DROP POLICY IF EXISTS "Acompañamiento: dirección crea" ON observaciones_docentes;
CREATE POLICY "Acompañamiento: dirección crea"
  ON observaciones_docentes FOR INSERT TO authenticated
  WITH CHECK (
    is_member_as(auth.uid(), school_id, 'director')
    AND is_member_as(docente_id, school_id, 'docente')
    AND observador_id = auth.uid()
  );

-- Edita las suyas (cerradas, el trigger deja solo los acuerdos)
DROP POLICY IF EXISTS "Acompañamiento: dirección edita las suyas" ON observaciones_docentes;
CREATE POLICY "Acompañamiento: dirección edita las suyas"
  ON observaciones_docentes FOR UPDATE TO authenticated
  USING (is_member_as(auth.uid(), school_id, 'director') AND observador_id = auth.uid())
  WITH CHECK (is_member_as(auth.uid(), school_id, 'director') AND observador_id = auth.uid());

-- Borra solo un borrador suyo
DROP POLICY IF EXISTS "Acompañamiento: dirección borra borradores" ON observaciones_docentes;
CREATE POLICY "Acompañamiento: dirección borra borradores"
  ON observaciones_docentes FOR DELETE TO authenticated
  USING (is_member_as(auth.uid(), school_id, 'director') AND observador_id = auth.uid() AND estado = 'borrador');

-- El docente ve las suyas, cuando están cerradas
DROP POLICY IF EXISTS "Acompañamiento: el docente ve las suyas cerradas" ON observaciones_docentes;
CREATE POLICY "Acompañamiento: el docente ve las suyas cerradas"
  ON observaciones_docentes FOR SELECT TO authenticated
  USING (docente_id = auth.uid() AND estado = 'cerrada');

-- Lo del docente (notificarse, responder) no se escribe directo: va por las funciones
REVOKE INSERT, UPDATE ON observaciones_docentes FROM anon, authenticated;
GRANT INSERT (school_id, docente_id, observador_id, fecha, subject_id, course_id, pauta, fortalezas, sugerencias, acuerdos, estado)
  ON observaciones_docentes TO authenticated;
GRANT UPDATE (fecha, subject_id, course_id, pauta, fortalezas, sugerencias, acuerdos, estado, updated_at)
  ON observaciones_docentes TO authenticated;

-- ── Cerrada, lo escrito queda: solo se tildan acuerdos (y lo del docente) ──
CREATE OR REPLACE FUNCTION cuidar_observacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Un borrado en cascada (se borró la materia, el curso o quien observó) pone
  -- en NULL desde adentro de otro trigger: eso sí se deja, aunque esté cerrada
  v_cascada BOOLEAN := pg_trigger_depth() > 1;
BEGIN
  -- Cada acuerdo: un texto y si se cumplió (sí o no), nada más
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.acuerdos) a(v)
    WHERE jsonb_typeof(a.v) <> 'object'
       OR jsonb_typeof(a.v->'texto') IS DISTINCT FROM 'string'
       OR jsonb_typeof(a.v->'cumplido') IS DISTINCT FROM 'boolean'
       OR (a.v - 'texto' - 'cumplido') <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Cada acuerdo tiene que tener su texto y si se cumplió.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.cerrada_at := CASE WHEN NEW.estado = 'cerrada' THEN now() END;
    NEW.notificado_at := NULL; NEW.respuesta_docente := NULL; NEW.respondida_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.docente_id IS DISTINCT FROM OLD.docente_id
     OR (NEW.observador_id IS DISTINCT FROM OLD.observador_id AND NOT (v_cascada AND NEW.observador_id IS NULL)) THEN
    RAISE EXCEPTION 'No se puede cambiar de quién es la observación.' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado = 'cerrada' THEN
    IF NEW.estado <> 'cerrada'
       OR NEW.fecha IS DISTINCT FROM OLD.fecha
       OR (NEW.subject_id IS DISTINCT FROM OLD.subject_id AND NOT (v_cascada AND NEW.subject_id IS NULL))
       OR (NEW.course_id IS DISTINCT FROM OLD.course_id AND NOT (v_cascada AND NEW.course_id IS NULL))
       OR NEW.pauta IS DISTINCT FROM OLD.pauta
       OR NEW.fortalezas IS DISTINCT FROM OLD.fortalezas
       OR NEW.sugerencias IS DISTINCT FROM OLD.sugerencias THEN
      RAISE EXCEPTION 'La observación ya se compartió con el docente: solo se pueden tildar los acuerdos cumplidos.' USING ERRCODE = '22023';
    END IF;
    -- Los acuerdos: los mismos, solo cambia si se cumplieron
    IF jsonb_array_length(NEW.acuerdos) <> jsonb_array_length(OLD.acuerdos)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(NEW.acuerdos) WITH ORDINALITY n(v, i)
         JOIN jsonb_array_elements(OLD.acuerdos) WITH ORDINALITY o(v, i) USING (i)
         WHERE (n.v - 'cumplido') IS DISTINCT FROM (o.v - 'cumplido')
       ) THEN
      RAISE EXCEPTION 'La observación ya se compartió con el docente: los acuerdos no se cambian, solo se tildan.' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.estado = 'cerrada' THEN
    NEW.cerrada_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cuidar_observacion ON observaciones_docentes;
CREATE TRIGGER cuidar_observacion
  BEFORE INSERT OR UPDATE ON observaciones_docentes
  FOR EACH ROW EXECUTE FUNCTION cuidar_observacion();

-- ── Al cerrarla, al docente le llega una notificación ──
CREATE OR REPLACE FUNCTION avisar_observacion_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'cerrada' AND (TG_OP = 'INSERT' OR OLD.estado <> 'cerrada') AND NEW.observador_id IS NOT NULL THEN
    INSERT INTO notifications (from_user_id, to_user_id, title, message, priority, school_id)
    VALUES (NEW.observador_id, NEW.docente_id, 'Tenés una devolución de acompañamiento',
            'La dirección compartió con vos lo que observó en tu clase. La ves en "Mi perfil" → "Acompañamiento", donde también podés responder.',
            'medium', NEW.school_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS avisar_observacion_cerrada ON observaciones_docentes;
CREATE TRIGGER avisar_observacion_cerrada
  AFTER INSERT OR UPDATE OF estado ON observaciones_docentes
  FOR EACH ROW EXECUTE FUNCTION avisar_observacion_cerrada();

-- ── Lo del docente ──
CREATE OR REPLACE FUNCTION notificarme_observacion(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE observaciones_docentes
  SET notificado_at = COALESCE(notificado_at, now())
  WHERE id = p_id AND docente_id = auth.uid() AND estado = 'cerrada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa observación no es tuya o todavía no se compartió.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION responder_observacion(p_id UUID, p_respuesta TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_respuesta IS NULL OR length(btrim(p_respuesta)) = 0 OR length(p_respuesta) > 3000 THEN
    RAISE EXCEPTION 'La respuesta tiene que tener entre 1 y 3000 caracteres.' USING ERRCODE = '22023';
  END IF;
  UPDATE observaciones_docentes
  SET respuesta_docente = btrim(p_respuesta), respondida_at = now(),
      notificado_at = COALESCE(notificado_at, now())
  WHERE id = p_id AND docente_id = auth.uid() AND estado = 'cerrada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa observación no es tuya o todavía no se compartió.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION notificarme_observacion(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION responder_observacion(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION notificarme_observacion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION responder_observacion(UUID, TEXT) TO authenticated;

-- Comprobación: una fila, todo en true
SELECT
  to_regclass('public.observaciones_docentes') IS NOT NULL AS tabla,
  to_regprocedure('public.notificarme_observacion(uuid)') IS NOT NULL AS notificarme,
  to_regprocedure('public.responder_observacion(uuid, text)') IS NOT NULL AS responder,
  NOT has_column_privilege('authenticated', 'public.observaciones_docentes', 'respuesta_docente', 'UPDATE') AS respuesta_solo_por_funcion;
