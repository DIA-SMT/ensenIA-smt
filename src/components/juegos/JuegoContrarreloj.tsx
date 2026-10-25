/**
 * Contrarreloj: verdadero o falso, 60 segundos, con racha de aciertos.
 * Termina cuando se acaba el tiempo o las afirmaciones. Al final, las que
 * salieron mal vuelven con su explicación: ahí está lo que hay que repasar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { barajar, type VerdaderoFalso } from '../../lib/juegosRepaso';
import type { FinPartida } from './tipos';

const DURACION_MS = 60_000;
const PAUSA_MS = 450;

export default function JuegoContrarreloj({ afirmaciones, alTerminar }: { afirmaciones: VerdaderoFalso[]; alTerminar: (fin: FinPartida) => void }) {
  const ronda = useMemo(() => barajar(afirmaciones), [afirmaciones]);
  const [i, setI] = useState(0);
  const [respondidas, setRespondidas] = useState(0);
  const [bien, setBien] = useState(0);
  const [racha, setRacha] = useState(0);
  const [errores, setErrores] = useState<FinPartida['repaso']>([]);
  const [respuesta, setRespuesta] = useState<boolean | null>(null);
  const [quedan, setQuedan] = useState(DURACION_MS);
  const fin = useRef(Date.now() + DURACION_MS);
  const terminado = useRef(false);
  // Lo último, para cerrar con el tiempo sin depender de cierres viejos
  const estado = useRef({ bien: 0, respondidas: 0, errores: [] as FinPartida['repaso'] });
  useEffect(() => { estado.current = { bien, respondidas, errores }; }, [bien, respondidas, errores]);

  const terminar = (e = estado.current) => {
    if (terminado.current) return;
    terminado.current = true;
    // Sin ninguna respondida queda total 0: no se anota ni suma
    alTerminar({ score: e.bien, total: e.respondidas, repaso: e.errores });
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = Math.max(0, fin.current - Date.now());
      setQuedan(r);
      if (r === 0) { window.clearInterval(id); terminar(); }
    }, 250);
    return () => window.clearInterval(id);
    // terminar lee el estado por ref: corre una sola vez, al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const a = ronda[i];
  const responder = (v: boolean) => {
    if (respuesta !== null || terminado.current || !a) return;
    setRespuesta(v);
    const ok = v === a.verdadera;
    const e = {
      bien: bien + (ok ? 1 : 0),
      respondidas: respondidas + 1,
      errores: ok ? errores : [...errores, { pregunta: a.afirmacion, respuesta: `${a.verdadera ? 'Verdadero' : 'Falso'}. ${a.explicacion}` }],
    };
    setBien(e.bien);
    setRespondidas(e.respondidas);
    setErrores(e.errores);
    setRacha(ok ? racha + 1 : 0);
    window.setTimeout(() => {
      if (i + 1 >= ronda.length) { terminar(e); return; }
      setI(i + 1);
      setRespuesta(null);
    }, PAUSA_MS);
  };

  if (!a) return null;
  const segundos = Math.ceil(quedan / 1000);
  const ok = respuesta === a.verdadera;
  return (
    <div className="jr-cuerpo">
      <div className="jr-reloj">
        <span aria-label={`Quedan ${segundos} segundos`}>⏱️ {segundos}s</span>
        <span className="jr-reloj-barra" aria-hidden="true">
          <span className={segundos <= 10 ? 'poco' : ''} style={{ width: `${(quedan / DURACION_MS) * 100}%` }} />
        </span>
        <span className="jr-racha" aria-live="polite">{racha >= 2 ? `🔥 ${racha} seguidas` : ''}</span>
      </div>
      <div className={`jr-tarjeta ${respuesta !== null ? (ok ? 'bien' : 'mal') : ''}`}>{a.afirmacion}</div>
      <div className="jr-vf">
        <button type="button" className={`jr-boton ${respuesta === true ? (ok ? 'bien' : 'mal') : ''}`} onClick={() => responder(true)} disabled={respuesta !== null}>Verdadero</button>
        <button type="button" className={`jr-boton ${respuesta === false ? (ok ? 'bien' : 'mal') : ''}`} onClick={() => responder(false)} disabled={respuesta !== null}>Falso</button>
      </div>
      <p className={`jr-aviso ${respuesta !== null ? (ok ? 'bien' : 'mal') : ''}`} role="status" aria-live="polite">
        {respuesta !== null ? (ok ? '¡Bien!' : 'No…') : ''}
      </p>
      <span className="jr-progreso">{bien} bien de {respondidas}</span>
    </div>
  );
}
