/**
 * Cuántas conversaciones tienen mensajes sin leer (060), para el número de la
 * barra de arriba y del menú. Se actualiza cada 2 minutos, al volver a la
 * pestaña y cuando la bandeja avisa que algo cambió.
 */

import { useEffect, useState } from 'react';
import { mensajesSinLeer, EVENTO_MENSAJES } from '../services/mensajes.service';

export function useMensajesSinLeer(activo: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const contar = () => { mensajesSinLeer().then(x => { if (vivo) setN(x); }).catch(() => {}); };
    contar();
    const t = window.setInterval(contar, 120_000);
    const alVolver = () => { if (document.visibilityState === 'visible') contar(); };
    window.addEventListener(EVENTO_MENSAJES, contar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      window.clearInterval(t);
      window.removeEventListener(EVENTO_MENSAJES, contar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [activo]);
  return n;
}
