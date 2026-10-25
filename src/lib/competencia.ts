/**
 * Competencia en la clase en vivo (073): el reloj de cada pregunta.
 *
 * La cuenta regresiva va con la hora del servidor ('ahora', que viene en
 * cada vuelta), no con la del celular: uno con la hora corrida no tiene ni
 * más ni menos tiempo que el resto. Igual, el que manda es el servidor:
 * la respuesta que llega tarde no entra.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveActivityConfig, LiveActivityKind } from '../services/live.service';

/** Los tiempos para elegir al lanzar una pregunta de competencia */
export const SEGUNDOS_COMPETENCIA = [10, 20, 30, 60] as const;

/** Una pregunta que espera su turno en la competencia (las preparadas, en orden) */
export interface PreguntaEnCola {
    kind: LiveActivityKind;
    config: LiveActivityConfig;
    classId: string;
    /** Si es una preparada: se marca como lanzada */
    preguntaId?: string;
}

/**
 * Cuánto va adelantado el servidor respecto de este equipo, en ms.
 * La demora de la red solo atrasa cada muestra: la más alta de las últimas
 * es la más fiel. Solo las últimas: si el reloj del equipo se corrige, en
 * medio minuto la cuenta ya va con la hora nueva.
 */
const MUESTRAS = 12;
export function useDesfaseServidor() {
    const [desfase, setDesfase] = useState(0);
    const muestras = useRef<number[]>([]);
    const medir = useCallback((ahora: string | null | undefined) => {
        if (!ahora) return;
        const muestra = Date.parse(ahora) - Date.now();
        if (Number.isNaN(muestra)) return;
        muestras.current = [...muestras.current, muestra].slice(-MUESTRAS);
        setDesfase(Math.max(...muestras.current));
    }, []);
    return { desfase, medir };
}

/** Cuándo se termina el tiempo de una pregunta (ms), o null si no corre */
export function finDePregunta(
    actividad: { config: LiveActivityConfig; status: string } | null | undefined,
    creada: string | null | undefined,
): number | null {
    const c = actividad?.config.competencia;
    if (!c || !creada || actividad?.status !== 'active') return null;
    const t = Date.parse(creada);
    return Number.isNaN(t) ? null : t + c.segundos * 1000;
}

/** Los segundos que quedan (negativo: ya pasó). null: no hay reloj corriendo */
export function useCuentaRegresiva(fin: number | null, desfase: number): number | null {
    const [tic, setTic] = useState<{ fin: number; ahora: number } | null>(null);
    useEffect(() => {
        if (fin === null) return;
        const medir = () => setTic({ fin, ahora: Date.now() });
        const primero = window.setTimeout(medir, 0);
        const cada = window.setInterval(medir, 200);
        return () => { window.clearTimeout(primero); window.clearInterval(cada); };
    }, [fin]);
    if (fin === null || !tic || tic.fin !== fin) return null;
    return (fin - (tic.ahora + desfase)) / 1000;
}

export const puntos = (n: number) => n.toLocaleString('es-AR');
