/**
 * Completar: la frase con la palabra que falta, entre cuatro. Las otras son
 * errores que se cometen de verdad, así que hay que saberlo.
 */

import { useMemo, useState } from 'react';
import { barajar, type Completar } from '../../lib/juegosRepaso';
import type { FinPartida } from './tipos';

const MAXIMO = 6;

export default function JuegoCompletar({ frases, alTerminar }: { frases: Completar[]; alTerminar: (fin: FinPartida) => void }) {
  const ronda = useMemo(
    () => barajar(frases).slice(0, MAXIMO).map(f => ({ ...f, opciones: barajar([f.respuesta, ...f.distractores.slice(0, 3)]) })),
    [frases],
  );
  const [i, setI] = useState(0);
  const [bien, setBien] = useState(0);
  const [errores, setErrores] = useState<FinPartida['repaso']>([]);
  const [elegida, setElegida] = useState<string | null>(null);

  const f = ronda[i];
  if (!f) return null;
  const [antes, despues] = f.frase.split('___');
  const ok = elegida === f.respuesta;

  const elegir = (o: string) => {
    if (elegida) return;
    setElegida(o);
    if (o === f.respuesta) setBien(b => b + 1);
    else setErrores(e => [...e, { pregunta: f.frase.replace('___', '…'), respuesta: f.respuesta }]);
  };

  const seguir = () => {
    if (i + 1 >= ronda.length) {
      alTerminar({ score: bien, total: ronda.length, repaso: errores });
      return;
    }
    setI(i + 1);
    setElegida(null);
  };

  return (
    <div className="jr-cuerpo">
      <span className="jr-progreso">{i + 1} de {ronda.length}</span>
      <p className="jr-frase">
        {antes}<span className="jr-hueco">{elegida ? f.respuesta : ' '}</span>{despues}
      </p>
      <div className="jr-definiciones" role="group" aria-label="Opciones">
        {f.opciones.map(o => (
          <button
            key={o}
            type="button"
            className={`jr-boton ${elegida && o === f.respuesta ? 'bien' : elegida === o ? 'mal' : ''}`}
            onClick={() => elegir(o)}
            disabled={elegida !== null}
          >
            {o}
          </button>
        ))}
      </div>
      <p className={`jr-aviso ${elegida ? (ok ? 'bien' : 'mal') : ''}`} role="status" aria-live="polite">
        {elegida ? (ok ? '¡Bien!' : `Era «${f.respuesta}».`) : ''}
      </p>
      {elegida && (
        <button type="button" className="btn btn-primary" onClick={seguir} autoFocus>
          {i + 1 >= ronda.length ? 'Terminar' : 'Siguiente'}
        </button>
      )}
    </div>
  );
}
