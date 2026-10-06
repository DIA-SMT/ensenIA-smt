/**
 * Diálogo modal sobre el <dialog> nativo del navegador.
 *
 * Con showModal() el navegador ya resuelve lo difícil de accesibilidad: el
 * resto de la página queda inerte (ni el teclado ni el lector de pantalla
 * se escapan por detrás), Escape cierra y el diálogo va arriba de todo.
 * Acá sumamos: devolver el foco a quien lo abrió, cerrar al tocar afuera y
 * elegir qué control recibe el foco primero (`data-inicial`).
 */

import { useEffect, useRef, type ReactNode } from 'react';
// Sus estilos viajan con él: también se usa fuera del armazón (login, avisos)
import './shell.css';

interface DialogoProps {
  abierto: boolean;
  alCerrar: () => void;
  /** Nombre accesible, cuando no hay un título visible. */
  etiqueta?: string;
  /** id del título visible que nombra al diálogo. */
  etiquetadoPor?: string;
  className?: string;
  /**
   * Si está, Escape y tocar afuera NO cierran: llaman a esto, y la pantalla
   * decide (por ejemplo, preguntar si se descartan cambios sin guardar).
   */
  alPedirCierre?: () => void;
  children: ReactNode;
}

export default function Dialogo({ abierto, alCerrar, etiqueta, etiquetadoPor, className = '', alPedirCierre, children }: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const alCerrarRef = useRef(alCerrar);
  const alPedirRef = useRef(alPedirCierre);

  useEffect(() => { alCerrarRef.current = alCerrar; }, [alCerrar]);
  useEffect(() => { alPedirRef.current = alPedirCierre; }, [alPedirCierre]);
  // Para distinguir el cierre que pidió la pantalla (abierto=false) del que
  // hizo el navegador por su cuenta (Escape sin poder frenarlo).
  const abiertoRef = useRef(abierto);
  const cierrePedido = useRef(false);
  useEffect(() => { abiertoRef.current = abierto; }, [abierto]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      d.querySelector<HTMLElement>('[data-inicial]')?.focus();
    } else if (!abierto && d.open) {
      cierrePedido.current = true;
      d.close();
    }
  }, [abierto]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const alCerrarse = () => {
      // El evento 'close' llega en una tarea aparte: si para entonces el
      // diálogo ya se volvió a abrir (React monta, desmonta y vuelve a montar
      // en desarrollo; o se cerró y reabrió enseguida), ese cierre es viejo.
      if (d.open) return;
      const pedido = cierrePedido.current;
      cierrePedido.current = false;
      // Chrome no siempre deja frenar el 'cancel' de Escape (lo permite solo
      // tras una interacción reciente). Si la pantalla quería decidir y el
      // navegador cerró igual, se vuelve a abrir y se le pregunta.
      if (!pedido && alPedirRef.current && abiertoRef.current) {
        d.showModal();
        alPedirRef.current();
        return;
      }
      alCerrarRef.current();
      const volver = previo.current;
      previo.current = null;
      if (volver?.isConnected) volver.focus();
    };
    // Escape dispara 'cancel' antes de cerrar: ahí se puede frenar
    const alCancelar = (e: Event) => {
      if (!alPedirRef.current) return;
      e.preventDefault();
      alPedirRef.current();
    };
    // Escape se frena desde la tecla, antes de que el navegador lo convierta en 'cancel'
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !alPedirRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      alPedirRef.current();
    };
    d.addEventListener('close', alCerrarse);
    d.addEventListener('cancel', alCancelar);
    d.addEventListener('keydown', alTeclear);
    return () => {
      d.removeEventListener('close', alCerrarse);
      d.removeEventListener('cancel', alCancelar);
      d.removeEventListener('keydown', alTeclear);
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialogo ${className}`}
      aria-label={etiquetadoPor ? undefined : etiqueta}
      aria-labelledby={etiquetadoPor}
      // Tocar el fondo oscuro (el propio <dialog>, fuera del cuerpo) cierra.
      onClick={e => {
        if (e.target !== e.currentTarget) return;
        if (alPedirRef.current) alPedirRef.current();
        else e.currentTarget.close();
      }}
    >
      {abierto && <div className="dialogo-cuerpo">{children}</div>}
    </dialog>
  );
}
