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

interface DialogoProps {
  abierto: boolean;
  alCerrar: () => void;
  /** Nombre accesible, cuando no hay un título visible. */
  etiqueta?: string;
  /** id del título visible que nombra al diálogo. */
  etiquetadoPor?: string;
  className?: string;
  children: ReactNode;
}

export default function Dialogo({ abierto, alCerrar, etiqueta, etiquetadoPor, className = '', children }: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const alCerrarRef = useRef(alCerrar);

  useEffect(() => { alCerrarRef.current = alCerrar; }, [alCerrar]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      previo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      d.querySelector<HTMLElement>('[data-inicial]')?.focus();
    } else if (!abierto && d.open) {
      d.close();
    }
  }, [abierto]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const alCerrarse = () => {
      alCerrarRef.current();
      const volver = previo.current;
      previo.current = null;
      if (volver?.isConnected) volver.focus();
    };
    d.addEventListener('close', alCerrarse);
    return () => {
      d.removeEventListener('close', alCerrarse);
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
      onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
    >
      {abierto && <div className="dialogo-cuerpo">{children}</div>}
    </dialog>
  );
}
