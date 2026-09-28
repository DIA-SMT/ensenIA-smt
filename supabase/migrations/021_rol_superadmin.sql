-- ═══════════════════════════════════════════════════════════════════
-- 021 — Rol superadmin
--
-- Separada de la 022 porque ALTER TYPE ... ADD VALUE no se puede usar en
-- la misma transacción que agrega el valor (como 003a y 004a).
-- Correrla sola, antes de la 022.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
