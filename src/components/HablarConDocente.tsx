/**
 * "Quiero hablar con un docente" (alumno, 051). Elige a uno de sus docentes
 * o a cualquiera del curso y, si quiere, cuenta de qué. Le llega al docente
 * como alerta "Quiere hablar con vos" (y la ve dirección). Sin señal queda
 * guardado en el equipo y se envía solo.
 */

import { useEffect, useState } from 'react';
import { MessageCircleHeart, X, Send, Loader2, Check } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { getMisDocentes, type DocenteDelAlumno } from '../services/alerts.service';
import { pedirHablarResiliente } from '../services/offline-queue.service';
import './Modals.css';
import './HablarConDocente.css';

export default function HablarConDocente() {
  const [abierto, setAbierto] = useState(false);
  const [docentes, setDocentes] = useState<DocenteDelAlumno[] | null>(null);
  const [elegido, setElegido] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || docentes) return;
    getMisDocentes().then(setDocentes).catch(err => { console.error(err); setDocentes([]); });
  }, [abierto, docentes]);

  const abrir = () => {
    setAbierto(true);
    setError('');
    setListo(null);
  };

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError('');
    try {
      const quien = docentes?.find(d => d.teacherId === elegido);
      const resultado = await pedirHablarResiliente(elegido || null, motivo, quien ? `Pedido para hablar con ${quien.nombre}` : 'Pedido para hablar con un docente');
      setListo(resultado === 'pendiente'
        ? 'Quedó guardado en tu celular: les llega apenas tengas señal.'
        : quien ? `Listo: le avisamos a ${quien.nombre}. Te va a buscar para hablar.` : 'Listo: les avisamos a tus docentes. Alguno te va a buscar para hablar.');
      setMotivo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo avisar. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button type="button" className="hablar-boton" onClick={abrir}>
        <MessageCircleHeart size={18} aria-hidden="true" />
        <span>
          <strong>Quiero hablar con un docente</strong>
          <small>Le avisamos para que te busque</small>
        </span>
      </button>

      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} etiquetadoPor="hablar-titulo" className="dialogo-em">
        <div className="em-modal" style={{ maxWidth: 460 }}>
          <div className="em-modal-header">
            <h3 id="hablar-titulo"><MessageCircleHeart size={18} aria-hidden="true" /> Quiero hablar con un docente</h3>
            <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={() => setAbierto(false)}><X size={18} aria-hidden="true" /></button>
          </div>
          <div className="em-modal-body">
            {listo ? (
              <p className="hablar-listo" role="status"><Check size={16} aria-hidden="true" /> {listo}</p>
            ) : (
              <>
                <div className="em-field">
                  <label htmlFor="hablar-quien">¿Con quién?</label>
                  <select id="hablar-quien" className="form-select" value={elegido} onChange={e => setElegido(e.target.value)}>
                    <option value="">Con cualquiera de mis docentes</option>
                    {(docentes ?? []).map(d => (
                      <option key={d.teacherId} value={d.teacherId}>{d.nombre} ({d.materias})</option>
                    ))}
                  </select>
                </div>
                <div className="em-field">
                  <label htmlFor="hablar-motivo">¿Querés contar de qué? (opcional)</label>
                  <textarea id="hablar-motivo" rows={3} maxLength={500} value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Podés dejarlo en blanco y contarlo cuando hablen." />
                </div>
                <p className="em-hint">Lo ve el docente que elegiste (o tus docentes) y la dirección de la escuela.</p>
                {error && <p className="em-error" role="alert">{error}</p>}
              </>
            )}
          </div>
          <div className="em-modal-footer">
            {listo ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAbierto(false)}>Cerrar</button>
            ) : (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={enviar} disabled={enviando}>
                  {enviando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                  {enviando ? 'Avisando…' : 'Avisar'}
                </button>
              </>
            )}
          </div>
        </div>
      </Dialogo>
    </>
  );
}
