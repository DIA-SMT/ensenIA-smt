/**
 * Preguntar al servidor cada tanto, sin que los pedidos se encimen.
 *
 * Con setInterval, si un pedido tarda más que el intervalo (el wifi de la
 * escuela, datos escasos) sale el siguiente igual, y se apilan: diez pedidos
 * colgados que terminan en desorden y gastan lo poco que hay. Acá la vuelta
 * siguiente se programa recién cuando termina la anterior.
 *
 * Cada vuelta tiene su propio tope (8 s): con un wifi que no contesta, el
 * navegador esperaría mucho más y el aviso de "sin señal" llegaría tarde.
 * Si falla, se espera más (2, 4, 8… hasta 15 s) y se avisa: quien mira la
 * pantalla tiene que saber que lo que ve puede ser viejo. Una falla de red
 * no es lo mismo que un error del servidor, y el aviso lo dice.
 *
 * Con la pantalla apagada o en otra app no se pregunta; al volver, se
 * pregunta enseguida.
 */

import { useEffect, useRef, useState } from 'react';
import { esErrorDeRed } from './conexion';

const ESPERA_MAXIMA_MS = 15_000;
const TOPE_VUELTA_MS = 8_000;

export interface EstadoSondeo {
  /** Cuántas vueltas seguidas fallaron (0: anda bien) */
  fallas: number;
  /** La última falla fue de red (sin señal) y no un error del servidor */
  deRed: boolean;
  /** Cuándo respondió bien por última vez (ms), o null si todavía no */
  ultimaOk: number | null;
  /** Preguntar ya (por ejemplo, después de mandar algo). Si hay una vuelta en curso, se repite al terminar. */
  ahora: () => void;
}

/** `tarea` recibe una señal que se corta al tope de la vuelta: pasásela al pedido. */
export function useSondeo(tarea: (senal: AbortSignal) => Promise<void>, cadaMs: number, activo = true): EstadoSondeo {
  const tareaRef = useRef(tarea);
  useEffect(() => { tareaRef.current = tarea; }, [tarea]);
  const [fallas, setFallas] = useState(0);
  const [deRed, setDeRed] = useState(true);
  const [ultimaOk, setUltimaOk] = useState<number | null>(null);
  const disparar = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let corriendo = false;
    let repetir = false;
    let seguidas = 0;
    let timer: number | undefined;

    const programar = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void vuelta(); }, ms);
    };

    const vuelta = async () => {
      if (!vivo) return;
      if (corriendo) { repetir = true; return; }
      // Pantalla apagada u otra app: no se gasta; al volver se retoma
      if (document.visibilityState === 'hidden') return;
      corriendo = true;
      repetir = false;
      window.clearTimeout(timer);
      const control = new AbortController();
      let vencida = false;
      const tope = window.setTimeout(() => { vencida = true; control.abort(); }, TOPE_VUELTA_MS);
      try {
        await tareaRef.current(control.signal);
        seguidas = 0;
        if (vivo) { setFallas(0); setUltimaOk(Date.now()); }
      } catch (err) {
        seguidas++;
        if (vivo) { setFallas(seguidas); setDeRed(vencida || esErrorDeRed(err)); }
      } finally {
        window.clearTimeout(tope);
        corriendo = false;
      }
      if (!vivo) return;
      if (repetir && seguidas === 0) { void vuelta(); return; }
      programar(seguidas === 0 ? cadaMs : Math.min(cadaMs * 2 ** Math.min(seguidas, 3), ESPERA_MAXIMA_MS));
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') void vuelta();
    };
    disparar.current = () => { void vuelta(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    void vuelta();
    return () => {
      vivo = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
      disparar.current = () => undefined;
    };
  }, [activo, cadaMs]);

  return { fallas, deRed, ultimaOk, ahora: () => disparar.current() };
}
