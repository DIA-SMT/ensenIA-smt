-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 021: cierre de la revisión de Migue y grabadas
--
--  (A) LO MÁS GRAVE. La policy "Students see their own signals" de la 017
--      deja al estudiante leer la FILA ENTERA de su señal de bienestar,
--      incluida `note`: el campo donde el equipo escribe cómo está
--      manejando el caso. El textarea le promete a la docente que "lo lee
--      el resto del equipo".
--
--      Comprobado con la cuenta de una alumna: leyó textualmente la nota
--      que la docente había escrito sobre ella. La RLS filtra filas, no
--      columnas, así que acotar la policy no alcanza.
--
--      En un caso real esa nota dice cosas como "sospecho maltrato en la
--      casa, no avisar a la familia todavía". Que la lea el chico ya es
--      grave; en un celular compartido la lee el adulto del que se está
--      hablando.
--
--      La separación correcta no es por columna sino por naturaleza del
--      dato: lo que el chico generó y se le avisó que se compartía
--      (motivo, cita, estado) es suyo y lo puede ver. Lo que el equipo
--      escribe sobre el caso es otra cosa y vive en otra tabla.
--
--  (B) recorded_classes: el WITH CHECK ataba materia y curso pero dejaba
--      libres unit_id y term_id, que el cliente escribe. Un docente podía
--      colgar una grabación de su materia bajo una unidad de otra.
-- ════════════════════════════════════════════════════════════════════

-- ── A. La gestión del caso se separa de la señal ──

CREATE TABLE wellbeing_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES wellbeing_signals(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wb_notes_signal ON wellbeing_notes(signal_id, created_at DESC);

ALTER TABLE wellbeing_notes ENABLE ROW LEVEL SECURITY;

-- Mismo alcance que ver la señal, MENOS el estudiante. Sin policy para
-- 'estudiante' ni para 'padre': no es que no la vean por descuido, es que
-- no existe la regla que se las mostraría.
CREATE POLICY "Directors manage case notes"
  ON wellbeing_notes FOR ALL
  USING (auth_role() = 'director' AND school_id = auth_school_id())
  WITH CHECK (auth_role() = 'director' AND school_id = auth_school_id());

CREATE POLICY "Teachers read case notes of their students"
  ON wellbeing_notes FOR SELECT
  USING (
    auth_role() = 'docente'
    AND EXISTS (
      SELECT 1 FROM wellbeing_signals ws
      JOIN enrollments e ON e.student_id = ws.student_id
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE ws.id = wellbeing_notes.signal_id
        AND ta.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers write case notes of their students"
  ON wellbeing_notes FOR INSERT
  WITH CHECK (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM wellbeing_signals ws
      JOIN enrollments e ON e.student_id = ws.student_id
      JOIN teacher_assignments ta
        ON ta.subject_id = e.subject_id AND ta.course_id = e.course_id
      WHERE ws.id = wellbeing_notes.signal_id
        AND ta.teacher_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION stamp_wellbeing_note()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- coalesce y no asignación directa: la mudanza de más abajo corre como
  -- superusuario, donde auth.uid() es NULL, y sin esto el trigger borraba
  -- la autoría histórica que la migración estaba justamente preservando.
  NEW.author_id := coalesce(auth.uid(), NEW.author_id);
  NEW.created_at := coalesce(NEW.created_at, now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wb_note_stamp
  BEFORE INSERT ON wellbeing_notes
  FOR EACH ROW EXECUTE FUNCTION stamp_wellbeing_note();

REVOKE INSERT, UPDATE ON wellbeing_notes FROM anon, authenticated;
GRANT INSERT (signal_id, school_id, body) ON wellbeing_notes TO authenticated;

-- Mudar lo que ya estaba escrito antes de borrar la columna.
INSERT INTO wellbeing_notes (signal_id, school_id, body, author_id, created_at)
SELECT ws.id, ws.school_id, ws.note, ws.handled_by, coalesce(ws.handled_at, ws.created_at)
FROM wellbeing_signals ws
WHERE ws.note IS NOT NULL AND btrim(ws.note) <> '';

ALTER TABLE wellbeing_signals DROP COLUMN note;

-- Ya no hace falta cerrar nada más sobre wellbeing_signals. Los GRANT por
-- columna se aplican al ROL, no por policy, así que no sirven para
-- separar al estudiante del docente: los dos son 'authenticated'. Por eso
-- la separación es por tabla y no por columna.
--
-- Lo que queda en la fila —nivel, motivo, la cita que él mismo escribió,
-- el estado y quién la tomó— es exactamente lo que se le dijo que se
-- compartía, más el dato de que alguien se está ocupando. Que lo vea es
-- coherente con habérselo avisado.
--
-- El estudiante ya no puede escribir la nota, tampoco: la columna no
-- existe y el GRANT UPDATE de la 017 pasa a cubrir solo el estado.
REVOKE UPDATE ON wellbeing_signals FROM anon, authenticated;
GRANT UPDATE (status) ON wellbeing_signals TO authenticated;

-- ── B. La grabación no puede colgarse de una unidad ajena ──

DROP POLICY IF EXISTS "Teachers manage recordings of their assignments" ON recorded_classes;

CREATE POLICY "Teachers manage recordings of their assignments"
  ON recorded_classes FOR ALL
  USING (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = recorded_classes.subject_id
        AND ta.course_id = recorded_classes.course_id
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = recorded_classes.subject_id
        AND ta.course_id = recorded_classes.course_id
    )
    -- La unidad, si viene, tiene que ser de la MISMA materia y curso.
    AND (
      unit_id IS NULL
      OR EXISTS (
        SELECT 1 FROM planning_units pu
        WHERE pu.id = recorded_classes.unit_id
          AND pu.subject_id = recorded_classes.subject_id
          AND pu.course_id = recorded_classes.course_id
      )
    )
    -- Y el trimestre, de la propia escuela.
    AND (
      term_id IS NULL
      OR EXISTS (
        SELECT 1 FROM academic_terms t
        WHERE t.id = recorded_classes.term_id
          AND t.school_id = auth_school_id()
      )
    )
  );
