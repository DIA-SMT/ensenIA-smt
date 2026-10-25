-- ═══════════════════════════════════════════════════════════════════
-- 072 — Juegos para repasar: un banco por material, cinco juegos para
--       cualquier materia
--
--  · library_materials.juegos: el banco que arma la IA una sola vez por
--    material (como el quiz de práctica): pares término–definición, pasos
--    en orden, grupos para clasificar, frases para completar y verdadero o
--    falso. Con él se juegan Unir, Ordenar, Clasificar, Completar y
--    Contrarreloj. Se borra si cambia el texto del material.
--  · practice_attempts.modo: cada partida se anota como un intento de
--    práctica, con su juego. Así suma XP y racha por el mismo camino que el
--    quiz. El "no farmear" (repetir lo mismo el mismo día da 5 XP) cuenta
--    por material y juego: jugar los cinco juegos de un material suma
--    los cinco.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE library_materials ADD COLUMN IF NOT EXISTS juegos JSONB;

ALTER TABLE practice_attempts ADD COLUMN IF NOT EXISTS modo TEXT NOT NULL DEFAULT 'quiz';
ALTER TABLE practice_attempts DROP CONSTRAINT IF EXISTS practice_attempts_modo_check;
ALTER TABLE practice_attempts ADD CONSTRAINT practice_attempts_modo_check
  CHECK (modo IN ('quiz', 'unir', 'ordenar', 'clasificar', 'completar', 'contrarreloj'));

-- Igual que en la 020, con el "no farmear" por material y juego
CREATE OR REPLACE FUNCTION compute_practice_xp()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NEW.total <= 0 OR NEW.total > 50 OR NEW.score < 0 OR NEW.score > NEW.total THEN
    RAISE EXCEPTION 'Puntaje de práctica inválido';
  END IF;

  -- Repetir el mismo juego del mismo material el mismo día da XP fijo bajo
  IF NEW.material_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM practice_attempts
    WHERE student_id = NEW.student_id
      AND material_id = NEW.material_id
      AND modo = NEW.modo
      AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = hoy
  ) THEN
    NEW.xp_earned := 5;
  ELSE
    NEW.xp_earned := 10 + NEW.score * 5
      + CASE WHEN NEW.score = NEW.total THEN 20 ELSE 0 END;  -- bonus por partida perfecta
  END IF;

  RETURN NEW;
END;
$$;

-- Comprobación: una fila, todo true
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'library_materials' AND column_name = 'juegos') AS banco_de_juegos,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'practice_attempts' AND column_name = 'modo') AS intento_con_juego,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_practice_xp') AS xp_sigue;
