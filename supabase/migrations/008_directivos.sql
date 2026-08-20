-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 008: Segmento directivo (Fase 0)
--  1) Bitácora de acceso (audit_log): trazabilidad sobre datos
--     sensibles de menores ANTES de ampliar la visibilidad del rol.
--     Alcance Fase 0: registra los accesos hechos DESDE LA APP
--     (advisory). El registro forzado en servidor (RPC SECURITY
--     DEFINER que loguea y devuelve los datos) llega en Fase 1.
--  2) Lectura para el rol director sobre las tablas de señal real
--     (entregas, huella digital, check-ins, práctica, uso de IA),
--     siempre acotada a su escuela.
--  3) Fix multiescuela: las políticas de communication_recipients /
--     communication_reads de 001 dejaban a cualquier director ver e
--     insertar filas de comunicados de OTRA escuela.
-- ═══════════════════════════════════════════════

-- ── 1. Bitácora de acceso ──
-- Inmutable: solo INSERT (staff registra sus propios accesos)
-- y SELECT para dirección. Sin UPDATE ni DELETE.
-- user_id SIN foreign key a propósito: si se da de baja la cuenta
-- (fin de ciclo, egreso, sanción) la bitácora debe sobrevivir.
-- user_label denormaliza la identidad del actor por la misma razón.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_label TEXT NOT NULL DEFAULT '' CHECK (char_length(user_label) <= 120),
  school_id UUID NOT NULL REFERENCES schools(id),
  action TEXT NOT NULL CHECK (char_length(action) <= 64),        -- 'view_student_profile' | 'view_teacher_profile' | ...
  entity_type TEXT NOT NULL CHECK (char_length(entity_type) <= 32),  -- 'student' | 'teacher' | ...
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_school ON audit_log(school_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Solo staff inserta (los estudiantes/familias no acceden a fichas);
-- cada uno registra únicamente sus propios accesos, en su escuela.
CREATE POLICY "Staff log own actions"
  ON audit_log FOR INSERT
  WITH CHECK (
    auth_role() IN ('director', 'docente')
    AND user_id = auth.uid()
    AND school_id = auth_school_id()
  );

CREATE POLICY "Directors view school audit log"
  ON audit_log FOR SELECT
  USING (auth_role() = 'director' AND school_id = auth_school_id());

-- ── 2. Lectura del director sobre la señal real de su escuela ──

-- Entregas (por la actividad, que siempre tiene school_id)
CREATE POLICY "Directors view school submissions"
  ON activity_submissions FOR SELECT
  USING (
    auth_role() = 'director'
    AND activity_id IN (SELECT id FROM activities WHERE school_id = auth_school_id())
  );

-- Huella digital
CREATE POLICY "Directors view school activity events"
  ON activity_events FOR SELECT
  USING (
    auth_role() = 'director'
    AND activity_id IN (SELECT id FROM activities WHERE school_id = auth_school_id())
  );

-- Check-ins emocionales
CREATE POLICY "Directors view school checkins"
  ON student_checkins FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

-- Modo Estudio: intentos, progreso y logros
CREATE POLICY "Directors view school practice attempts"
  ON practice_attempts FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

CREATE POLICY "Directors view school student progress"
  ON student_progress FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

CREATE POLICY "Directors view school student badges"
  ON student_badges FOR SELECT
  USING (
    auth_role() = 'director'
    AND student_id IN (SELECT id FROM students WHERE school_id = auth_school_id())
  );

-- Uso de IA por docente (adopción real de la herramienta)
CREATE POLICY "Directors view school ia usage"
  ON ia_usage FOR SELECT
  USING (
    auth_role() = 'director'
    AND teacher_id IN (SELECT id FROM profiles WHERE school_id = auth_school_id())
  );

-- ── 3. Fix multiescuela: comunicados internos ──
-- Las políticas de 001 no acotaban por escuela: cualquier director
-- veía los destinatarios/lecturas de comunicados ajenos y podía
-- insertar destinatarios en comunicados de otra escuela.
-- OJO: acotar con un subquery directo a communications recursiona
-- (la política de communications ya consulta communication_recipients),
-- por eso el helper SECURITY DEFINER, que evalúa sin RLS.

CREATE OR REPLACE FUNCTION communication_school_id(comm_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM communications WHERE id = comm_id
$$;

DROP POLICY IF EXISTS "Users can see recipient entries" ON communication_recipients;
CREATE POLICY "Users can see recipient entries"
  ON communication_recipients FOR SELECT
  USING (
    user_id = auth.uid()
    OR (auth_role() = 'director' AND communication_school_id(communication_id) = auth_school_id())
  );

DROP POLICY IF EXISTS "Directors can insert recipients" ON communication_recipients;
CREATE POLICY "Directors can insert recipients"
  ON communication_recipients FOR INSERT
  WITH CHECK (
    auth_role() = 'director'
    AND communication_school_id(communication_id) = auth_school_id()
  );

DROP POLICY IF EXISTS "Users can see their own reads" ON communication_reads;
CREATE POLICY "Users can see their own reads"
  ON communication_reads FOR SELECT
  USING (
    user_id = auth.uid()
    OR (auth_role() = 'director' AND communication_school_id(communication_id) = auth_school_id())
  );
