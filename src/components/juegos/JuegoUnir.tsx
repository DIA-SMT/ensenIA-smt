/**
 * Unir: cada término con su definición. Se toca un término y después lo
 * que significa. Cuenta como bien el par que salió sin errores.
 */

import { useMemo, useState } from 'react';
import { barajar, type Par } from '../../lib/juegosRepaso';
import type { FinPartida } from './tipos';

const MAXIMO = 6;

export default function JuegoUnir({ pares, alTerminar }: { pares: Par[]; alTerminar: (fin: FinPartida) => void }) {
  const ronda = useMemo(() => barajar(pares).slice(0, MAXIMO), [pares]);
  const terminos = useMemo(() => barajar(ronda), [ronda]);
  const definiciones = useMemo(() => barajar(ronda), [ronda]);
  const [elegido, setElegido] = useState<Par | null>(null);
  const [unidos, setUnidos] = useState<Set<Par>>(new Set());
  const [fallados, setFallados] = useState<Set<Par>>(new Set());
  const [mal, setMal] = useState<Par | null>(null);
  const [aviso, setAviso] = useState('');

  const tocarDefinicion = (d: Par) => {
    if (unidos.has(d)) return;
    if (!elegido) { setAviso('Primero tocá un término.'); return; }
    if (d === elegido) {
      const nuevos = new Set(unidos).add(d);
      setUnidos(nuevos);
      setElegido(null);
      setAviso(`¡Bien! ${d.termino}.`);
      if (nuevos.size === ronda.length) {
        alTerminar({
          score: ronda.length - fallados.size,
          total: ronda.length,
          repaso: ronda.filter(p => fallados.has(p)).map(p => ({ pregunta: p.termino, respuesta: p.definicion })),
        });
      }
    } else {
      setFallados(prev => new Set(prev).add(elegido));
      setMal(d);
      setAviso('No va con ese. Probá otra.');
      window.setTimeout(() => setMal(m => (m === d ? null : m)), 600);
    }
  };

  return (
    <div className="jr-cuerpo">
      <p className="jr-ayuda">Tocá un término y después lo que significa.</p>
      <div className="jr-terminos" role="group" aria-label="Términos">
        {terminos.map(t => (
          <button
            key={t.termino}
            type="button"
            className={`jr-termino ${unidos.has(t) ? 'hecho' : ''}`}
            aria-pressed={elegido === t}
            disabled={unidos.has(t)}
            onClick={() => { setElegido(t); setAviso(''); }}
          >
            {t.termino}
          </button>
        ))}
      </div>
      <div className="jr-definiciones" role="group" aria-label="Definiciones">
        {definiciones.map(d => (
          <button
            key={d.definicion}
            type="button"
            className={`jr-boton ${unidos.has(d) ? 'bien' : mal === d ? 'mal' : ''}`}
            disabled={unidos.has(d)}
            onClick={() => tocarDefinicion(d)}
          >
            {unidos.has(d) && <strong>{d.termino}: </strong>}{d.definicion}
          </button>
        ))}
      </div>
      <p className="jr-aviso" role="status" aria-live="polite">{aviso}</p>
      <span className="jr-progreso">{unidos.size} de {ronda.length}</span>
    </div>
  );
}
