/**
 * Señales de bienestar que derivó Migue.
 *
 * Una alerta que nadie mira no es una alerta. Esto es lo que hace que lo
 * que un chico le contó a Migue llegue a una persona de la escuela con un
 * botón para hacerse cargo.
 *
 * Muestra el motivo y la frase que lo disparó, NO la conversación: el
 * equipo necesita saber qué pasa, no leer todo lo que el chico escribió.
 *
 * Las notas de seguimiento son del equipo y viven en wellbeing_notes
 * (021). Están separadas de la señal porque la RLS filtra filas y no
 * columnas: mientras estuvieron en la misma fila, el propio estudiante
 * las leía desde la API.
 */

import { useState, useEffect } from 'react';
import { HeartPulse, ShieldAlert, CheckCircle, Loader2, Lock } from 'lucide-react';
import {
  getWellbeingSignals, updateSignalStatus, addCaseNote,
  type WellbeingSignalWithStudent,
} from '../services/wellbeing.service';
import { formatRelative } from '../lib/format';
import type { WellbeingStatus } from '../types';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import './Modals.css';
import '../pages/Libreta.css';
import './WellbeingSignals.css';

const ESTADO_LABEL: Record<WellbeingStatus, string> = {
  abierta: 'Sin tomar',
  en_seguimiento: 'En seguimiento',
  cerrada: 'Cerrada',
};

export default function WellbeingSignals({ schoolId }: { schoolId: string }) {
  const [señales, setSeñales] = useState<WellbeingSignalWithStudent[] | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  // Una nota por señal: con un único estado compartido, abrir el
  // formulario de otra tarjeta borraba lo que se estaba escribiendo.
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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

  const guardar = async (id: string, estado: WellbeingStatus) => {
    setBusy(true); setError('');
    try {
      const texto = notas[id] ?? '';
      if (texto.trim()) await addCaseNote(id, schoolId, texto);
      await updateSignalStatus(id, estado);
      setSeñales(await getWellbeingSignals());
      setAbierta(null);
      setNotas(n => { const c = { ...n }; delete c[id]; return c; });
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

            {s.notes.length > 0 && (
              <div className="wb-notas">
                <span className="wb-notas-titulo"><Lock size={11} /> Seguimiento del equipo</span>
                {s.notes.map(n => (
                  <p key={n.id} className="wb-nota">
                    {n.body}
                    <span className="text-xs text-subtle"> · {formatRelative(n.createdAt)}</span>
                  </p>
                ))}
              </div>
            )}

            {s.status !== 'cerrada' && (
              abierta === s.id ? (
                <div className="wb-form">
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Qué hiciste o qué vas a hacer. Lo lee el equipo de la escuela; el estudiante no."
                    value={notas[s.id] ?? ''}
                    disabled={busy}
                    onChange={e => setNotas(n => ({ ...n, [s.id]: e.target.value }))}
                  />
                  <div className="libreta-actions-right">
                    <button className="btn btn-ghost btn-sm" disabled={busy}
                            onClick={() => setAbierta(null)}>
                      Cancelar
                    </button>
                    {s.status === 'abierta' && (
                      <button className="btn btn-outline btn-sm" disabled={busy}
                              onClick={() => guardar(s.id, 'en_seguimiento')}>
                        {busy ? <Loader2 size={14} className="spin" /> : null} Tomar el caso
                      </button>
                    )}
                    <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => guardar(s.id, 'cerrada')}>
                      <CheckCircle size={14} /> Cerrar
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => setAbierta(s.id)}>
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
