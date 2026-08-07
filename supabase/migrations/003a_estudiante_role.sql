-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 003a: rol estudiante
--  (separada: ALTER TYPE ... ADD VALUE no puede
--   usarse en la misma transacción que lo usa)
-- ═══════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'estudiante';
