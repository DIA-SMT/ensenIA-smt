/**
 * Clasificar: aparece una cosa por vez y se toca su grupo. Dice al momento
 * si estaba bien y, si no, cuál era.
 */

import { useMemo, useState } from 'react';
import { barajar, type Clasificacion } from '../../lib/juegosRepaso';
import type { FinPartida } from './tipos';

const PAUSA_MS = 900;

export default function JuegoClasificar({ clasificaciones, alTerminar }: { clasificaciones: Clasificacion[]; alTerminar: (fin: FinPartida) => void }) {
  const c = useMemo(() => barajar(clasificaciones)[0], [clasificaciones]);
  const items = useMemo(
    () => barajar(c.grupos.flatMap(g => g.elementos.map(e => ({ elemento: e, grupo: g.nombre })))),
    [c],
  );
  const [i, setI] = useState(0);
  const [bien, setBien] = useState(0);
  const [errores, setErrores] = useState<FinPartida['repaso']>([]);
  const [respuesta, setRespuesta] = useState<string | null>(null);

  const actual = items[i];
  const elegir = (grupo: string) => {
    if (respuesta) return;
    setRespuesta(grupo);
    const ok = grupo === actual.grupo;
    const nuevosBien = bien + (ok ? 1 : 0);
    const nuevosErrores = ok ? errores : [...errores, { pregunta: actual.elemento, respuesta: actual.grupo }];
    setBien(nuevosBien);
    setErrores(nuevosErrores);
    window.setTimeout(() => {
      if (i + 1 >= items.length) {
        alTerminar({ score: nuevosBien, total: items.length, repaso: nuevosErrores });
      } else {
        setI(i + 1);
        setRespuesta(null);
      }
    }, PAUSA_MS);
  };

  if (!actual) return null;
  const ok = respuesta === actual.grupo;
  return (
    <div className="jr-cuerpo">
      <p className="jr-ayuda"><strong>{c.titulo}</strong></p>
      <span className="jr-progreso">{i + 1} de {items.length}</span>
      <div className={`jr-tarjeta ${respuesta ? (ok ? 'bien' : 'mal') : ''}`}>{actual.elemento}</div>
      <div className="jr-grupos" role="group" aria-label="Grupos">
        {c.grupos.map(g => (
          <button
            key={g.nombre}
            type="button"
            className={`jr-boton ${respuesta && g.nombre === actual.grupo ? 'bien' : respuesta === g.nombre ? 'mal' : ''}`}
            onClick={() => elegir(g.nombre)}
            disabled={respuesta !== null}
          >
            {g.nombre}
          </button>
        ))}
      </div>
      <p className={`jr-aviso ${respuesta ? (ok ? 'bien' : 'mal') : ''}`} role="status" aria-live="polite">
        {respuesta ? (ok ? '¡Bien!' : `Era: ${actual.grupo}`) : ''}
      </p>
    </div>
  );
}
