-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 011: Libreta de calificaciones (Fase 3)
--  Pedido de la reunión con las escuelas (26/8/2026):
--  "Que se traduzca en nota y seguimiento del alumno."
--  "Alumno de riesgo, alerta a la familia si tiene 5 por trimestre;
--   con 4 se lleva la materia a diciembre."
--
--  1) academic_terms: el ciclo lectivo dividido en trimestres.
--  2) term_grades: una nota por estudiante × materia × trimestre.
--     La plataforma SUGIERE (suggested_grade, a partir del trabajo
--     real); el docente FIJA (grade). La sugerencia nunca califica sola.
--  3) Regla 5/4 automática al publicar: aviso a la familia por el
--     canal que ya existe (guardian_notices, con acuse de recibo) y
--     señal para el tablero directivo (alerts, con su ciclo de vida).
--  4) Umbrales de nota configurables por escuela, junto a los de 010.
-- ═══════════════════════════════════════════════

-- ── 1. Trimestres ──
CREATE TABLE academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  number INT NOT NULL CHECK (number IN (1, 2, 3)),
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (school_id, year, number),
  CHECK (ends_on > starts_on)
);

CREATE INDEX idx_terms_school_year ON academic_terms(school_id, year, number);

ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;

-- Todos en la escuela ven el calendario (estudiantes y familias incluidos).
CREATE POLICY "School members view terms"
  ON academic_terms FOR SELECT
  USING (school_id = auth_school_id());

CREATE POLICY "Directors manage terms"
  ON academic_terms FOR ALL
  USING (school_id = auth_school_id() AND auth_role() = 'director')
  WITH CHECK (school_id = auth_school_id() AND auth_role() = 'director');

-- Crea los 3 trimestres estándar de un ciclo lectivo si faltan.
-- Idempotente: sirve para el seed inicial, para una escuela nueva y para
-- el año que viene. Sin esto, la libreta de una escuela creada después de
-- esta migración (o de cualquier año ≠ 2026) no tendría dónde apoyarse.
-- Las fechas son las del calendario escolar argentino y dirección puede
-- ajustarlas después (policy "Directors manage terms").
CREATE OR REPLACE FUNCTION ensure_academic_terms(p_school_id UUID, p_year INT)
RETURNS SETOF academic_terms
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schools WHERE id = p_school_id AND id = auth_school_id()
  ) THEN
    RAISE EXCEPTION 'Escuela fuera de alcance';
  END IF;

  INSERT INTO academic_terms (school_id, year, number, name, starts_on, ends_on)
  SELECT p_school_id, p_year, t.number, t.name,
         make_date(p_year, t.sm, t.sd), make_date(p_year, t.em, t.ed)
  FROM (VALUES
    (1, '1° Trimestre', 3, 1, 6, 5),
    (2, '2° Trimestre', 6, 8, 9, 11),
    (3, '3° Trimestre', 9, 14, 12, 11)
  ) AS t(number, name, sm, sd, em, ed)
  ON CONFLICT (school_id, year, number) DO NOTHING;

  RETURN QUERY
  SELECT * FROM academic_terms
  WHERE school_id = p_school_id AND year = p_year
  ORDER BY number;
END;
$$;

-- Solo staff: un estudiante o una familia no crean calendario escolar.
REVOKE EXECUTE ON FUNCTION ensure_academic_terms(UUID, INT) FROM PUBLIC, anon;

-- Calendario 2026 para las escuelas que ya existen.
INSERT INTO academic_terms (school_id, year, number, name, starts_on, ends_on)
SELECT s.id, 2026, t.number, t.name, t.starts_on, t.ends_on
FROM schools s
CROSS JOIN (VALUES
  (1, '1° Trimestre', DATE '2026-03-02', DATE '2026-06-05'),
  (2, '2° Trimestre', DATE '2026-06-08', DATE '2026-09-11'),
  (3, '3° Trimestre', DATE '2026-09-14', DATE '2026-12-11')
) AS t(number, name, starts_on, ends_on)
ON CONFLICT (school_id, year, number) DO NOTHING;

-- ── 2. Umbrales de nota (se suman a los de 010) ──
ALTER TABLE alert_thresholds
  ADD COLUMN grade_risk_max NUMERIC(4,2) NOT NULL DEFAULT 5 CHECK (grade_risk_max BETWEEN 1 AND 10),
  ADD COLUMN grade_fail_max NUMERIC(4,2) NOT NULL DEFAULT 4 CHECK (grade_fail_max BETWEEN 1 AND 10),
  ADD CONSTRAINT grade_thresholds_order CHECK (grade_fail_max <= grade_risk_max);

-- La función devuelve el tipo de la tabla: hay que re-crearla para que
-- los defaults incluyan las columnas nuevas.
CREATE OR REPLACE FUNCTION get_alert_thresholds(p_school_id UUID)
RETURNS alert_thresholds
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r alert_thresholds;
BEGIN
  SELECT * INTO r FROM alert_thresholds WHERE school_id = p_school_id;
  IF NOT FOUND THEN
    r.school_id := p_school_id;
    r.negative_checkins_count := 2;
    r.negative_checkins_days := 7;
    r.low_score_pct := 40;
    r.inactivity_days := 14;
    r.escalation_hours := 72;
    r.grade_risk_max := 5;
    r.grade_fail_max := 4;
  END IF;
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_alert_thresholds(UUID) FROM PUBLIC, anon, authenticated;

-- Los umbrales de NOTA son la regla que la escuela le aplica a la familia:
-- ocultárselos obligaría al portal a pintar la nota con valores por
-- defecto y contradecir el aviso que la propia escuela mandó. Se abre la
-- LECTURA a toda la escuela; escribir sigue siendo exclusivo de dirección.
DROP POLICY IF EXISTS "Staff view school thresholds" ON alert_thresholds;
CREATE POLICY "School members view thresholds"
  ON alert_thresholds FOR SELECT
  USING (school_id = auth_school_id());

-- ── 3. Libreta ──
-- status: 'borrador' la ve solo el docente; 'publicada' la ven el
-- estudiante, su familia y dirección — y recién ahí corre la regla 5/4.
CREATE TABLE term_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  grade NUMERIC(4,2) CHECK (grade BETWEEN 1 AND 10),
  suggested_grade NUMERIC(4,2) CHECK (suggested_grade BETWEEN 1 AND 10),
  suggested_from INT NOT NULL DEFAULT 0,     -- entregas que respaldan la sugerencia
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'publicada')),
  carries_to_december BOOLEAN NOT NULL DEFAULT false,  -- derivado, lo sella el trigger
  teacher_note TEXT,
  graded_by UUID,                            -- sellado por el servidor
  graded_at TIMESTAMPTZ,
  notified_category TEXT CHECK (notified_category IN ('riesgo', 'diciembre')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (student_id, subject_id, course_id, term_id)
);

CREATE INDEX idx_term_grades_lookup ON term_grades(subject_id, course_id, term_id);
CREATE INDEX idx_term_grades_student ON term_grades(student_id, term_id);
CREATE INDEX idx_term_grades_school ON term_grades(school_id, term_id);
CREATE INDEX idx_term_grades_diciembre ON term_grades(school_id) WHERE carries_to_december;

ALTER TABLE term_grades ENABLE ROW LEVEL SECURITY;

-- Docente: gestiona la libreta de las materias que tiene asignadas.
-- El binding por enrollments NO es decorativo: sin él, un docente puede
-- escribir una nota (y disparar el aviso oficial a la familia) sobre
-- cualquier menor de la escuela, aunque no lo tenga a cargo. Mismo
-- patrón que usa la 009 para las medallas.
CREATE POLICY "Teachers manage grades of their assignments"
  ON term_grades FOR ALL
  USING (
    school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = term_grades.subject_id
        AND ta.course_id = term_grades.course_id
    )
  )
  WITH CHECK (
    school_id = auth_school_id()
    AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = auth.uid()
        AND ta.subject_id = term_grades.subject_id
        AND ta.course_id = term_grades.course_id
    )
    -- El estudiante tiene que cursar ESA materia en ESE curso.
    AND EXISTS (
      SELECT 1 FROM enrollments e
      WHERE e.student_id = term_grades.student_id
        AND e.subject_id = term_grades.subject_id
        AND e.course_id = term_grades.course_id
    )
    -- Y el trimestre tiene que ser de la misma escuela.
    AND EXISTS (
      SELECT 1 FROM academic_terms t
      WHERE t.id = term_grades.term_id
        AND t.school_id = term_grades.school_id
    )
  );

CREATE POLICY "Directors view school grades"
  ON term_grades FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

-- El estudiante y su familia ven SOLO lo publicado.
CREATE POLICY "Students view own published grades"
  ON term_grades FOR SELECT
  USING (status = 'publicada' AND student_id = auth_student_id());

CREATE POLICY "Guardians view published grades of their children"
  ON term_grades FOR SELECT
  USING (status = 'publicada' AND student_id IN (SELECT auth_guardian_student_ids()));

-- ── 4. Sellos de servidor ──
-- carries_to_december y la autoría no se aceptan del cliente.
CREATE OR REPLACE FUNCTION stamp_term_grade()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  th alert_thresholds;
BEGIN
  th := get_alert_thresholds(NEW.school_id);

  NEW.carries_to_december := (
    NEW.status = 'publicada'
    AND NEW.grade IS NOT NULL
    AND NEW.grade <= th.grade_fail_max
  );

  IF auth.uid() IS NOT NULL THEN
    NEW.graded_by := auth.uid();
  END IF;
  -- OLD no existe en INSERT: discriminar por TG_OP, no por "OLD IS NULL".
  IF TG_OP = 'INSERT' OR NEW.grade IS DISTINCT FROM OLD.grade THEN
    NEW.graded_at := now();
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_term_grades_stamp
  BEFORE INSERT OR UPDATE ON term_grades
  FOR EACH ROW EXECUTE FUNCTION stamp_term_grade();

-- ── 5. Regla 5/4: aviso a la familia + señal directiva ──
-- Corre DESPUÉS de publicar. Notifica solo cuando cambia la categoría
-- (notified_category), así corregir una nota publicada no vuelve a
-- avisar por lo mismo.
-- Nota legible: 4.00 -> "4", 4.50 -> "4.5" (FM deja el punto colgando).
CREATE OR REPLACE FUNCTION format_grade(g NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT rtrim(to_char(g, 'FM990.99'), '.')
$$;

CREATE OR REPLACE FUNCTION notify_term_grade_risk()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  th alert_thresholds;
  st RECORD;
  subj_name TEXT;
  term_name TEXT;
  categoria TEXT;
  new_alert_id UUID;
  autor UUID;
BEGIN
  IF NEW.status <> 'publicada' OR NEW.grade IS NULL THEN
    RETURN NEW;
  END IF;

  th := get_alert_thresholds(NEW.school_id);

  categoria := CASE
    WHEN NEW.grade <= th.grade_fail_max THEN 'diciembre'
    WHEN NEW.grade <= th.grade_risk_max THEN 'riesgo'
    ELSE NULL
  END;

  SELECT * INTO st FROM students WHERE id = NEW.student_id;
  SELECT name INTO subj_name FROM subjects WHERE id = NEW.subject_id;
  SELECT name INTO term_name FROM academic_terms WHERE id = NEW.term_id;

  -- La nota dejó de ser preocupante PERO ya habíamos avisado: no alcanza
  -- con olvidarlo en silencio. A la familia se le dijo que el chico se
  -- llevaba la materia; si el docente corrige, hay que desdecirlo y
  -- cerrar la alerta que quedó abierta en el tablero.
  IF categoria IS NULL THEN
    IF NEW.notified_category IS NOT NULL AND st IS NOT NULL THEN
      IF NEW.graded_by IS NOT NULL THEN
        INSERT INTO guardian_notices (school_id, student_id, from_user_id, type, title, body)
        VALUES (
          NEW.school_id, NEW.student_id, NEW.graded_by, 'comunicado',
          'Corrección de nota: ' || COALESCE(subj_name, 'materia'),
          'Estimada familia: la calificación de ' || st.first_name || ' en ' ||
          COALESCE(subj_name, 'la materia') || ' (' || COALESCE(term_name, 'trimestre') ||
          ') fue corregida a ' || format_grade(NEW.grade) ||
          '. Queda sin efecto el aviso anterior sobre esa materia.'
        );
      END IF;

      UPDATE alerts a
      SET status = 'cerrada', closed_outcome = 'resuelta', closed_at = now(),
          intervention_note = COALESCE(a.intervention_note || E'\n', '') ||
            '[Automático] La nota fue corregida a ' || format_grade(NEW.grade) || '.'
      WHERE a.school_id = NEW.school_id
        AND a.status <> 'cerrada'
        AND a.title IN ('Materia a diciembre', 'Riesgo académico en el trimestre')
        AND EXISTS (
          SELECT 1 FROM alert_students als
          WHERE als.alert_id = a.id AND als.student_id = NEW.student_id
        );

      UPDATE term_grades SET notified_category = NULL WHERE id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.notified_category IS NOT DISTINCT FROM categoria THEN
    RETURN NEW;
  END IF;

  IF st IS NULL THEN RETURN NEW; END IF;

  autor := NEW.graded_by;
  IF autor IS NULL THEN
    SELECT id INTO autor FROM profiles
    WHERE school_id = NEW.school_id AND role = 'director' LIMIT 1;
  END IF;

  -- Aviso a la familia por el canal existente (con acuse de recibo).
  -- Si no hay autor posible (sin sesión y sin director dado de alta) NO
  -- se marca notified_category: el aviso se reintenta en la próxima
  -- publicación, en vez de perderse en silencio. Mismo criterio que
  -- escalate_stale_alerts() en la 010.
  IF autor IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO guardian_notices (school_id, student_id, from_user_id, type, title, body)
    VALUES (
      NEW.school_id, NEW.student_id, autor, 'comunicado',
      CASE categoria
        WHEN 'diciembre' THEN 'Materia a diciembre: ' || COALESCE(subj_name, 'materia')
        ELSE 'Situación de riesgo en ' || COALESCE(subj_name, 'materia')
      END,
      CASE categoria
        WHEN 'diciembre' THEN
          'Estimada familia: ' || st.first_name || ' obtuvo ' || format_grade(NEW.grade) ||
          ' en ' || COALESCE(subj_name, 'la materia') || ' durante el ' || COALESCE(term_name, 'trimestre') ||
          '. Con esta calificación la materia se lleva a diciembre. Los invitamos a acercarse a la escuela para acordar un plan de acompañamiento.'
        ELSE
          'Estimada familia: ' || st.first_name || ' obtuvo ' || format_grade(NEW.grade) ||
          ' en ' || COALESCE(subj_name, 'la materia') || ' durante el ' || COALESCE(term_name, 'trimestre') ||
          '. Es una situación de riesgo todavía recuperable: con acompañamiento puede revertirla en el trimestre siguiente.'
      END
    );

  -- Señal para el tablero directivo, con el ciclo de vida de la 010.
  INSERT INTO alerts (type, category, title, message, date_label, teacher_id, school_id)
  VALUES (
    -- El CASE resuelve a text: alert_level es enum y necesita cast explícito.
    (CASE categoria WHEN 'diciembre' THEN 'danger' ELSE 'warning' END)::alert_level,
    'academic'::alert_category,
    CASE categoria WHEN 'diciembre' THEN 'Materia a diciembre' ELSE 'Riesgo académico en el trimestre' END,
    st.first_name || ' ' || st.last_name || ' obtuvo ' || format_grade(NEW.grade) ||
      ' en ' || COALESCE(subj_name, 'una materia') || ' (' || COALESCE(term_name, 'trimestre') || ').' ||
      CASE categoria WHEN 'diciembre' THEN ' Se lleva la materia a diciembre.' ELSE ' Todavía es recuperable.' END ||
      ' La familia fue notificada.',
    'Hoy', NEW.graded_by, NEW.school_id
  )
  RETURNING id INTO new_alert_id;

  INSERT INTO alert_students (alert_id, student_id) VALUES (new_alert_id, NEW.student_id);

  UPDATE term_grades SET notified_category = categoria WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_term_grades_notify
  AFTER INSERT OR UPDATE OF status, grade ON term_grades
  FOR EACH ROW EXECUTE FUNCTION notify_term_grade_risk();

-- ── 5.b Reconciliar el derivado si la escuela cambia el umbral ──
-- carries_to_december se sella al publicar. Si dirección cambia
-- grade_fail_max después, las notas ya publicadas quedarían mostrando la
-- regla vieja. Se recalcula el flag SIN tocar status/grade, así que el
-- trigger de aviso (que escucha "UPDATE OF status, grade") no se dispara:
-- se corrige el dato, no se vuelve a molestar a las familias.
CREATE OR REPLACE FUNCTION resync_carries_to_december()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.grade_fail_max IS DISTINCT FROM OLD.grade_fail_max THEN
    UPDATE term_grades
    SET carries_to_december = (status = 'publicada' AND grade IS NOT NULL AND grade <= NEW.grade_fail_max)
    WHERE school_id = NEW.school_id
      AND carries_to_december IS DISTINCT FROM
          (status = 'publicada' AND grade IS NOT NULL AND grade <= NEW.grade_fail_max);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thresholds_resync_grades ON alert_thresholds;
CREATE TRIGGER trg_thresholds_resync_grades
  AFTER UPDATE ON alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION resync_carries_to_december();

-- ── 5.c Acotar los comunicados a familias entre docentes ──
-- La policy de 004 dejaba a CUALQUIER docente leer, editar y borrar todos
-- los comunicados de la escuela. Con la libreta eso pesa distinto: ahora
-- esos comunicados llevan el nombre del menor y su nota. Se acota al
-- mismo criterio que 004 usa para las observaciones — los propios y los
-- de estudiantes a cargo — - y dirección sigue viendo todo.
DROP POLICY IF EXISTS "Staff manage notices in school" ON guardian_notices;

CREATE POLICY "Directors manage school notices"
  ON guardian_notices FOR ALL
  USING (auth_role() = 'director' AND school_id = auth_school_id())
  WITH CHECK (auth_role() = 'director' AND school_id = auth_school_id() AND from_user_id = auth.uid());

CREATE POLICY "Teachers see notices they sent or of their students"
  ON guardian_notices FOR SELECT
  USING (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND (
      from_user_id = auth.uid()
      OR student_id IS NULL          -- comunicados generales de la escuela
      OR student_id IN (
        SELECT s.id FROM students s
        JOIN teacher_assignments ta ON ta.course_id = s.course_id
        WHERE ta.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Teachers send notices in school"
  ON guardian_notices FOR INSERT
  WITH CHECK (
    auth_role() = 'docente'
    AND school_id = auth_school_id()
    AND from_user_id = auth.uid()
  );

-- Un docente solo borra lo que él mismo mandó.
CREATE POLICY "Teachers delete own notices"
  ON guardian_notices FOR DELETE
  USING (auth_role() = 'docente' AND from_user_id = auth.uid());

-- ── 6. Grants por columna ──
-- El cliente no escribe lo derivado (carries_to_december, notified_category)
-- ni la autoría (graded_by/at): eso lo sellan los triggers.
-- El UPDATE excluye además las claves (student/subject/course/term): una
-- nota no se "mueve" de estudiante ni de trimestre — se corrige o se borra.
-- Por eso el servicio hace insert-o-update explícito en vez de upsert:
-- un upsert reenviaría las claves en el SET y chocaría con este grant.
REVOKE INSERT, UPDATE ON term_grades FROM anon, authenticated;
GRANT INSERT (student_id, subject_id, course_id, term_id, school_id, grade, suggested_grade, suggested_from, status, teacher_note)
  ON term_grades TO authenticated;
GRANT UPDATE (grade, suggested_grade, suggested_from, status, teacher_note)
  ON term_grades TO authenticated;
