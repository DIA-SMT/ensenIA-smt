/**
 * Aviso de la clase en vivo cuando no llegan los datos (poca señal).
 *
 * Sin esto, el docente miraba resultados congelados creyendo que nadie más
 * respondía, y el estudiante tocaba una opción sin saber si había salido.
 * No aparece por un pedido suelto que falla: con dos seguidos, o con uno
 * cuando ya pasaron 10 s sin datos. Un error del servidor no se disfraza
 * de falta de señal.
 */

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

const hace = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
};

export default function SenialEnVivo({ fallas, deRed = true, ultimaOk, detalle }: {
  fallas: number;
  /** La falla es de red (sin señal) y no un error del servidor */
  deRed?: boolean;
  ultimaOk: number | null;
  /** Qué pasa mientras tanto, para quien mira esta pantalla */
  detalle: string;
}) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (fallas === 0) return;
    const ya = window.setTimeout(() => setAhora(Date.now()), 0);
    const id = window.setInterval(() => setAhora(Date.now()), 2_500);
    return () => { window.clearTimeout(ya); window.clearInterval(id); };
  }, [fallas]);

  const atrasado = ultimaOk !== null && ahora - ultimaOk > 10_000;
  if (fallas === 0 || (fallas < 2 && !atrasado)) return null;
  const Icono = deRed ? WifiOff : RefreshCw;
  return (
    <div className="cv-senial" role="status" aria-live="polite">
      <Icono size={16} aria-hidden="true" />
      <span>
        <strong>{deRed ? 'Sin señal, reintentando…' : 'No se pudo actualizar, reintentando…'}</strong>
        {ultimaOk ? ` Lo último llegó hace ${hace(Math.max(0, ahora - ultimaOk))}.` : ''} {detalle}
      </span>
    </div>
  );
}
