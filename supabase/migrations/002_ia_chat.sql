-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 002: IA Chat System
--  Chat sessions, messages, and usage tracking
-- ═══════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────
CREATE TYPE chat_role     AS ENUM ('user', 'assistant', 'system');
CREATE TYPE ia_tool_type  AS ENUM ('act', 'eval', 'sum', 'pres', 'oral', 'free');
CREATE TYPE ia_model      AS ENUM ('haiku', 'sonnet');


-- ── Chat Sessions ──────────────────────────────
-- One session per planning_class per teacher.
-- class_id NULL = "free chat" (not tied to a specific class).
CREATE TABLE chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id    UUID REFERENCES planning_classes(id) ON DELETE SET NULL,
  subject_id  UUID REFERENCES subjects(id),
  course_id   UUID REFERENCES courses(id),
  title       TEXT NOT NULL DEFAULT 'Chat libre',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(teacher_id, class_id)
);

CREATE INDEX idx_chat_sessions_teacher ON chat_sessions(teacher_id);
CREATE INDEX idx_chat_sessions_class   ON chat_sessions(class_id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_sessions_updated
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_chat_session_timestamp();


-- ── Chat Messages ──────────────────────────────
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        chat_role NOT NULL,
  content     TEXT NOT NULL,
  tool_used   ia_tool_type,
  model_used  ia_model,
  token_count INT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_session         ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_session_created  ON chat_messages(session_id, created_at);


-- ── IA Usage (daily quotas) ────────────────────
-- One row per teacher per day, upserted by the Edge Function.
CREATE TABLE ia_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count   INT NOT NULL DEFAULT 0,
  token_count_in  INT NOT NULL DEFAULT 0,
  token_count_out INT NOT NULL DEFAULT 0,
  UNIQUE(teacher_id, usage_date)
);

CREATE INDEX idx_ia_usage_teacher_date ON ia_usage(teacher_id, usage_date);


-- ── Row Level Security ─────────────────────────

-- Chat Sessions: teachers CRUD their own
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their own chat sessions"
  ON chat_sessions FOR ALL
  USING (teacher_id = auth.uid());

-- Chat Messages: access via chat_sessions RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select chat messages via session ownership"
  ON chat_messages FOR SELECT
  USING (session_id IN (SELECT id FROM chat_sessions WHERE teacher_id = auth.uid()));

CREATE POLICY "Insert chat messages via session ownership"
  ON chat_messages FOR INSERT
  WITH CHECK (session_id IN (SELECT id FROM chat_sessions WHERE teacher_id = auth.uid()));

CREATE POLICY "Delete chat messages via session ownership"
  ON chat_messages FOR DELETE
  USING (session_id IN (SELECT id FROM chat_sessions WHERE teacher_id = auth.uid()));

-- IA Usage: teachers can only read their own.
-- INSERT/UPDATE is done by Edge Function using service_role key (bypasses RLS).
ALTER TABLE ia_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view their own usage"
  ON ia_usage FOR SELECT
  USING (teacher_id = auth.uid());
