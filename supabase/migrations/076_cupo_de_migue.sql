-- ═══════════════════════════════════════════════════════════════════
-- 076 — Migue con su propio cupo
--
-- Migue sumaba sus mensajes al mismo contador (ia_usage.message_count) que
-- usan los botones "con IA" para su tope de 15 por día: 15 preguntas a Migue
-- apagaban todo lo demás, y el cartel "Te quedan N usos de IA hoy" mentía.
-- Desde ahora las charlas con Migue van en su propia columna; los tokens se
-- siguen sumando juntos (Consumo de IA) y la adopción docente de la
-- dirección vuelve a contar solo lo que se generó.
--
-- Se puede correr más de una vez. Comprobación al final: una fila, todo true.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ia_usage ADD COLUMN IF NOT EXISTS migue_mensajes INT NOT NULL DEFAULT 0;

-- Comprobación: una fila, todo true
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_name = 'ia_usage' AND column_name = 'migue_mensajes'
) AS migue_con_su_cupo;
