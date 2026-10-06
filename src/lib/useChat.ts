/**
 * Cómo se mueve un chat mientras la IA escribe (Laboratorio, Migue, Mi guía).
 *
 * Antes cada fragmento que llegaba disparaba scrollIntoView({ smooth }):
 * decenas de animaciones por segundo que se pisaban entre sí, movían la
 * página entera (no solo el chat) y arrastraban hacia abajo aunque el
 * docente hubiera subido a leer. Y como el texto llega a borbotones, se
 * veía a los saltos.
 *
 *  · useSeguirAlFinal: acompaña la respuesta SOLO si quien lee está abajo
 *    de todo; si sube, lo deja leer tranquilo y ofrece "Ir al final".
 *    Mueve únicamente el contenedor que de verdad se desplaza, antes de
 *    pintar y sin animación (la animación es lo que se veía violento).
 *  · useTextoSuave: muestra el texto de a poco, a un ritmo parejo, aunque
 *    llegue a borbotones, y nunca corta una palabra al medio.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Distancia al final (px) por debajo de la cual se considera "abajo de todo". */
const UMBRAL = 96;

function contenedorQueSeDesplaza(el: HTMLElement | null): HTMLElement | null {
  let actual = el?.parentElement ?? null;
  while (actual && actual !== document.body) {
    const { overflowY } = getComputedStyle(actual);
    if ((overflowY === 'auto' || overflowY === 'scroll') && actual.scrollHeight > actual.clientHeight + 1) return actual;
    actual = actual.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function distanciaAlFinal(c: HTMLElement): number {
  return c.scrollHeight - c.scrollTop - c.clientHeight;
}

/**
 * @param finRef   marcador al final de la lista de mensajes
 * @param cambio   algo que cambia cuando crece el contenido (texto en curso, cantidad de mensajes)
 * @returns        si está lejos del final (para mostrar "Ir al final") y la función para ir
 */
export function useSeguirAlFinal(finRef: RefObject<HTMLElement | null>, cambio: unknown) {
  const pegado = useRef(true);
  const [lejos, setLejos] = useState(false);
  /** Hay un viaje suave al final en curso: sus propios eventos de scroll no despegan. */
  const yendo = useRef<number | null>(null);

  // Seguir el scroll de quien lee: si sube, se despega; si vuelve abajo, se pega.
  // Se escucha en captura sobre todo el documento y el contenedor se busca en
  // cada evento: con el chat vacío todavía no desborda (o en celular desplaza
  // la página), y atarse al primero que se encontró al montar sería atarse al
  // equivocado.
  useEffect(() => {
    const alDesplazar = (e: Event) => {
      const c = contenedorQueSeDesplaza(finRef.current);
      if (!c) return;
      const t = e.target;
      const esElMismo = t === c || ((t === document || t === window) && c === document.scrollingElement);
      if (!esElMismo) return;
      if (yendo.current !== null) {
        if (distanciaAlFinal(c) >= UMBRAL) return;
        clearTimeout(yendo.current);
        yendo.current = null;
      }
      const cerca = distanciaAlFinal(c) < UMBRAL;
      pegado.current = cerca;
      setLejos(!cerca);
    };
    document.addEventListener('scroll', alDesplazar, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', alDesplazar, { capture: true });
  }, [finRef]);

  // Cuando crece el contenido: si estaba abajo, se queda abajo. Antes de que
  // se pinte (layout effect), así la línea nueva y el desplazamiento llegan en
  // el mismo cuadro; con un rAF de por medio el texto asomaba abajo y el chat
  // lo alcanzaba un cuadro después, a tironcitos. useTextoSuave ya limita los
  // cambios a uno por cuadro.
  useLayoutEffect(() => {
    if (!pegado.current || yendo.current !== null) return;
    const c = contenedorQueSeDesplaza(finRef.current);
    if (c) c.scrollTop = c.scrollHeight;
  }, [cambio, finRef]);

  /** Ir al final (por ejemplo, al mandar un mensaje nuevo): vuelve a pegarse. */
  const irAlFinal = useCallback((suave = true) => {
    pegado.current = true;
    setLejos(false);
    const c = contenedorQueSeDesplaza(finRef.current);
    if (!c) return;
    const quiereMovimiento = suave && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && document.documentElement.dataset.movimiento !== 'reducido';
    if (yendo.current !== null) clearTimeout(yendo.current);
    yendo.current = null;
    if (quiereMovimiento) {
      // Mientras viaja no se lo interrumpe con saltos; si en el camino la
      // respuesta creció, al llegar (o a lo sumo en un segundo) se termina de pegar
      yendo.current = window.setTimeout(() => { yendo.current = null; }, 1000);
    }
    c.scrollTo({ top: c.scrollHeight, behavior: quiereMovimiento ? 'smooth' : 'auto' });
  }, [finRef]);

  useEffect(() => () => { if (yendo.current !== null) clearTimeout(yendo.current); }, []);

  return { lejos, irAlFinal };
}

/**
 * Texto que se va mostrando de forma pareja.
 * @param texto   lo que llegó hasta ahora
 * @param activo  true mientras la IA sigue escribiendo; al terminar se muestra todo
 */
export function useTextoSuave(texto: string, activo: boolean): string {
  const [mostrado, setMostrado] = useState(0);
  const objetivo = useRef(texto);
  useLayoutEffect(() => { objetivo.current = texto; }, [texto]);

  useEffect(() => {
    if (!activo) return;
    let id = 0;
    const paso = () => {
      setMostrado(n => {
        const falta = objetivo.current.length - n;
        // Respuesta nueva (el texto volvió a empezar): arrancar de cero
        if (falta < 0) return 0;
        if (falta === 0) return n;
        // Si viene muy atrás, acelera; si viene al día, escribe a ritmo de lectura
        return n + Math.max(2, Math.ceil(falta / 10));
      });
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [activo]);

  if (!activo) return texto;
  if (mostrado >= texto.length) return texto;
  // No cortar una palabra (ni una marca de Markdown) al medio
  const corte = texto.lastIndexOf(' ', mostrado);
  const corteLinea = texto.lastIndexOf('\n', mostrado);
  return texto.slice(0, Math.max(corte, corteLinea, 0));
}
