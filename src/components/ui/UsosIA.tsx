/**
 * "Te quedan N usos de IA hoy": para que el límite diario no aparezca de
 * golpe en medio de algo. Se actualiza solo cada vez que algo usa la IA.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayUsage } from '../../services/chat-history.service';
import { LIMITE_DIARIO_IA, alGastarUsoIA } from '../../lib/usoIA';
import './ui.css';

export default function UsosIA({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const [usados, setUsados] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    const leer = () => {
      getTodayUsage(user.id)
        .then(u => { if (vivo) setUsados(u?.messageCount ?? 0); })
        .catch(() => { /* si no se puede leer, no se muestra */ });
    };
    leer();
    const dejar = alGastarUsoIA(leer);
    return () => { vivo = false; dejar(); };
  }, [user]);

  if (usados === null) return null;
  const quedan = Math.max(0, LIMITE_DIARIO_IA - usados);
  const nivel = quedan === 0 ? 'agotado' : quedan <= 10 ? 'poco' : 'ok';

  return (
    <p className={`usos-ia usos-ia-${nivel} ${className}`} title={`Se renuevan todos los días. Hoy usaste ${usados} de ${LIMITE_DIARIO_IA}.`}>
      <Sparkles size={14} aria-hidden="true" />
      {quedan === 0
        ? 'Usaste todos tus usos de IA de hoy. Mañana se renuevan.'
        : `Te ${quedan === 1 ? 'queda 1 uso' : `quedan ${quedan} usos`} de IA hoy`}
    </p>
  );
}
