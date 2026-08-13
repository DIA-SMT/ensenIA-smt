-- ═══════════════════════════════════════════════
--  ENSEÑIA SMT — Migration 006: Placas de estudio
--  Tarjetas visuales generadas por IA a partir del
--  material de la biblioteca. [{emoji, title, body}]
-- ═══════════════════════════════════════════════

ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS study_cards JSONB;
