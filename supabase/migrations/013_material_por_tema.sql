-- ═══════════════════════════════════════════════
--  SMT EstudIA — Migration 013: el material queda atado a su tema
--
--  Hasta ahora "Armar módulo" producía un material suelto en la biblioteca:
--  nada sabía que ese material era DE tal tema de la planificación. Resultado:
--  el docente volvía a generar lo mismo cada vez, gastando cuota y tiempo.
--
--  Con class_id, cada tema conoce su material (placas, podcast, actividad):
--  se genera una sola vez y queda a disposición desde la planificación.
-- ═══════════════════════════════════════════════

ALTER TABLE library_materials
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES planning_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS library_materials_class ON library_materials(class_id);
