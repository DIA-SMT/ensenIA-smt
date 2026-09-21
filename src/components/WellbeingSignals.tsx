/**
 * Señales de bienestar que derivó Migue.
 *
 * Una alerta que nadie mira no es una alerta. Esto es lo que hace que lo
 * que un chico le contó a Migue llegue a una persona de la escuela con un
 * botón para hacerse cargo.
 *
 * Muestra el motivo y la frase que la disparó, NO la conversación: el
 * equipo necesita saber qué pasa, no leer todo lo que el chico escribió.
 */

import { useState, useEffect } from 'react';
import { HeartPulse, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import {
  getWellbeingSignals, updateSignal,
  type WellbeingSignalWithStudent,
} from '../services/wellbeing.service';
import { formatRelative } from '../lib/format';
import type { WellbeingStatus } from '../types';
import './WellbeingSignals.css';

const ESTADO_LABEL: Record<WellbeingStatus, string> = {
  abierta: 'Sin tomar',
  en_seguimiento: 'En seguimiento',
  cerrada: 'Cerrada',
};

export default function WellbeingSignals() {
  const [señales, setSeñales] = useState<WellbeingSignalWithStudent[] | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    const s = await getWellbeingSignals();
    setSeñales(s);
  };

  useEffect(() => {
    let cancelado = false;
    getWellbeingSignals()
      .then(s => { if (!cancelado) setSeñales(s); })
      .catch(err => {
        console.error(err);
        if (!cancelado) { setSeñales([]); setError('No se pudieron cargar las señales.'); }
      });
    return () => { cancelado = true; };
  }, []);

  const marcar = async (id: string, estado: WellbeingStatus) => {
    setBusy(true); setError('');
    try {
      await updateSignal(id, estado, nota);
      await cargar();
      setAbierta(null);
      setNota('');
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? 'No se pudo actualizar la señal.');
    } finally {
      setBusy(false);
    }
  };

  // Si no hay ninguna, no ocupamos lugar en la pantalla de alertas.
  if (señales === null || (señales.length === 0 && !error)) return null;

  const pendientes = señales.filter(s => s.status !== 'cerrada');

  return (
    <section className="wb-panel">
      <header className="wb-head">
        <h3><HeartPulse size={17} className="text-cyan" /> Señales de Migue</h3>
        <p className="text-secondary text-sm">
          Estudiantes que le escribieron algo a Migue que amerita que alguien
          de la escuela se acerque. {pendientes.length > 0 && (
            <strong>{pendientes.length} sin cerrar.</strong>
          )}
        </p>
      </header>

      {error && <div className="em-error">{error}</div>}

      <div className="wb-list">
        {señales.map(s => (
          <div key={s.id} className={`card wb-card nivel-${s.level} estado-${s.status}`}>
            <div className="wb-card-top">
              <div>
                <h4>
                  {s.studentName}
                  {s.courseName && <span className="text-subtle text-sm"> · {s.courseName}</span>}
                </h4>
                <p className="text-sm">{s.reason}</p>
                {s.excerpt && <blockquote className="wb-excerpt">“{s.excerpt}”</blockquote>}
              </div>
              <div className="wb-badges">
                {s.level === 'urgente'
                  ? <span className="badge badge-danger"><ShieldAlert size={11} /> Urgente</span>
                  : <span className="badge badge-warning">Seguimiento</span>}
                <span className={`badge ${s.status === 'cerrada' ? 'badge-success' : 'badge-neutral'}`}>
                  {ESTADO_LABEL[s.status]}
                </span>
                <span className="text-xs text-subtle">{formatRelative(s.createdAt)}</span>
              </div>
            </div>

            {s.note && <p className="wb-nota">{s.note}</p>}

            {s.status !== 'cerrada' && (
              abierta === s.id ? (
                <div className="wb-form">
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Qué hiciste o qué vas a hacer. Lo lee el resto del equipo."
                    value={nota}
                    disabled={busy}
                    onChange={e => setNota(e.target.value)}
                  />
                  <div className="libreta-actions-right">
                    <button className="btn btn-ghost btn-sm" disabled={busy}
                            onClick={() => { setAbierta(null); setNota(''); }}>
                      Cancelar
                    </button>
                    {s.status === 'abierta' && (
                      <button className="btn btn-outline btn-sm" disabled={busy}
                              onClick={() => marcar(s.id, 'en_seguimiento')}>
                        {busy ? <Loader2 size={14} className="spin" /> : null} Tomar el caso
                      </button>
                    )}
                    <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => marcar(s.id, 'cerrada')}>
                      <CheckCircle size={14} /> Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-outline btn-sm"
                        onClick={() => { setAbierta(s.id); setNota(s.note ?? ''); }}>
                  Registrar qué se hizo
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
