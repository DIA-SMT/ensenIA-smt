/**
 * El cartel de la conexión. Dice lo que pasa de verdad, según quién usa la
 * app: antes le decía a todos "todo se guarda en este dispositivo", y para
 * el docente no se guardaba nada.
 *
 *   - Sin señal (o wifi conectado sin internet, ver lib/conexion.ts): qué se
 *     puede seguir haciendo y que lo que se ve es de la última conexión.
 *   - Cambios esperando o enviándose.
 *   - Lo que el servidor no aceptó, con el motivo, para descartarlo o
 *     reintentarlo (antes se perdía en silencio).
 */

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CloudUpload, AlertTriangle, X, RotateCcw, Trash2 } from 'lucide-react';
import {
  subscribe, noGuardadas, descartarNoGuardada, reintentarNoGuardada, type NoGuardada,
} from '../services/offline-queue.service';
import { haySenial, suscribirConexion } from '../lib/conexion';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import Dialogo from './shell/Dialogo';
import './OfflineBanner.css';
import './Modals.css';

/** Qué sigue andando sin señal, según el rol. */
const SIN_SENIAL: Partial<Record<UserRole, string>> = {
  estudiante: 'Podés seguir: tus actividades, prácticas y cómo te sentís se guardan en este equipo y se envían solos cuando haya señal.',
  docente: 'Ves lo de la última vez que te conectaste. La asistencia, las notas en borrador, el boletín y las observaciones se guardan en este equipo y se envían solas; lo demás necesita señal.',
};
const SIN_SENIAL_RESTO = 'Ves lo de la última vez que te conectaste; para cambiar algo hace falta señal.';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function OfflineBanner() {
  const { user, isOfflineProfile } = useAuth();
  const [senial, setSenial] = useState(haySenial());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [rechazadas, setRechazadas] = useState(0);
  const [verRechazadas, setVerRechazadas] = useState(false);

  useEffect(() => {
    const unsubSenial = suscribirConexion(() => setSenial(haySenial()));
    const unsubCola = subscribe((p, s, r) => { setPending(p); setSyncing(s); setRechazadas(r); });
    return () => { unsubSenial(); unsubCola(); };
  }, []);

  const sinSenial = !senial || isOfflineProfile;
  if (!sinSenial && pending === 0 && rechazadas === 0) return null;

  const esperando = pending > 0 ? ` ${plural(pending, 'cambio espera', 'cambios esperan')} para enviarse.` : '';

  return (
    <>
      {sinSenial ? (
        <div className="offline-banner is-offline" role="status">
          <WifiOff size={14} aria-hidden="true" />
          <span>
            <strong>Sin conexión.</strong> {(user && SIN_SENIAL[user.role]) ?? SIN_SENIAL_RESTO}{esperando}
          </span>
        </div>
      ) : pending > 0 ? (
        <div className="offline-banner is-syncing" role="status">
          {syncing ? <RefreshCw size={14} className="spin" aria-hidden="true" /> : <CloudUpload size={14} aria-hidden="true" />}
          <span>
            {syncing
              ? `Enviando ${plural(pending, 'cambio guardado', 'cambios guardados')} en este equipo…`
              : `${plural(pending, 'cambio guardado', 'cambios guardados')} en este equipo, esperando para enviarse.`}
          </span>
        </div>
      ) : null}

      {rechazadas > 0 && (
        <div className="offline-banner is-rechazo" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            {rechazadas === 1
              ? '1 cambio no se pudo guardar: el servidor no lo aceptó.'
              : `${rechazadas} cambios no se pudieron guardar: el servidor no los aceptó.`}
          </span>
          <button type="button" className="offline-banner-btn" onClick={() => setVerRechazadas(true)}>Ver</button>
        </div>
      )}

      {verRechazadas && <NoGuardadasDialogo alCerrar={() => setVerRechazadas(false)} />}
    </>
  );
}

function NoGuardadasDialogo({ alCerrar }: { alCerrar: () => void }) {
  const [lista, setLista] = useState<NoGuardada[]>(noGuardadas());
  useEffect(() => subscribe(() => {
    const ahora = noGuardadas();
    setLista(ahora);
    if (ahora.length === 0) alCerrar();
  }), [alCerrar]);

  return (
    <Dialogo abierto alCerrar={alCerrar} etiquetadoPor="no-guardadas-titulo" className="dialogo-em">
      <div className="em-modal" style={{ maxWidth: 520 }}>
        <div className="em-modal-header">
          <h3 id="no-guardadas-titulo"><AlertTriangle size={17} aria-hidden="true" /> No se pudo guardar</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="em-modal-body">
          <p className="em-hint">
            Esto se cargó en este equipo pero el servidor no lo aceptó. Si ya se resolvió (por ejemplo, dirección te volvió a
            asignar la materia), reintentalo; si no, descartalo y cargalo de nuevo.
          </p>
          <ul className="no-guardadas">
            {lista.map(n => (
              <li key={n.ts}>
                <div>
                  <strong>{n.descripcion}</strong>
                  <span className="em-hint">{new Date(n.ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {n.motivo}</span>
                </div>
                <div className="no-guardadas-acciones">
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => reintentarNoGuardada(n.ts)}>
                    <RotateCcw size={13} aria-hidden="true" /> Reintentar
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => descartarNoGuardada(n.ts)}>
                    <Trash2 size={13} aria-hidden="true" /> Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialogo>
  );
}
