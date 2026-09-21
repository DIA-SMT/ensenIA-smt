-- ════════════════════════════════════════════════════════════════════
--  ENSEÑIA SMT — 022: reponer la autoría de las notas mudadas
--
--  El trigger de la 021 asignaba NEW.author_id := auth.uid() sin más, y
--  la mudanza de notas de esa misma migración corre como superusuario,
--  donde auth.uid() es NULL. Resultado: la migración preservaba el autor
--  y el trigger se lo comía en el mismo paso.
--
--  La 021 ya quedó corregida para quien la corra de cero; esto repone el
--  dato donde la versión anterior ya pasó.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION stamp_wellbeing_note()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.author_id := coalesce(auth.uid(), NEW.author_id);
  NEW.created_at := coalesce(NEW.created_at, now());
  RETURN NEW;
END;
$$;

-- La señal conserva handled_by: de ahí sale quién había escrito la nota.
UPDATE wellbeing_notes n
SET author_id = ws.handled_by
FROM wellbeing_signals ws
WHERE n.signal_id = ws.id
  AND n.author_id IS NULL
  AND ws.handled_by IS NOT NULL;
