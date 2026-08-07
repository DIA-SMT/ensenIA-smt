-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 004a: rol padre/tutor
-- ═══════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'padre';
