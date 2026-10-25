/**
 * "Migue para repasar" en el tema (079): el docente abre un repaso con Migue
 * para el curso, le pide algo en especial si quiere y ve, sin nombres, qué
 * les costó. Nunca lee las charlas.
 */

import { useEffect, useState } from 'react';
import { MessagesSquare, Loader2, Lock, Unlock, Sparkles, Users } from 'lucide-react';
import {
  getTutorDelTema, guardarTutor, getUsoTutor, pedirResumenTutor, type TutorTema,
} from '../services/tutor.service';
import MarkdownRenderer from './MarkdownRenderer';
import { avisar } from './ui/avisar';
import './RepasoConMigue.css';

const MINIMO = 3;

export default function RepasoConMigue({ classId, curso }: { classId: string; curso: string }) {
  const [tutor, setTutor] = useState<TutorTema | null | undefined>(undefined);
  const [consigna, setConsigna] = useState('');
  const [uso, setUso] = useState<{ estudiantes: number; mensajes: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resumiendo, setResumiendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    getTutorDelTema(classId)
      .then(t => {
        if (!vivo) return;
        setTutor(t);
        setConsigna(t?.consigna ?? '');
        if (t) getUsoTutor(classId).then(u => { if (vivo) setUso(u); }).catch(() => { /* sin señal: sin números */ });
      })
      .catch(() => { if (vivo) setTutor(null); });
    return () => { vivo = false; };
  }, [classId]);

  if (tutor === undefined) return null;

  const guardar = async (abierto: boolean) => {
    setGuardando(true);
    setError('');
    try {
      await guardarTutor(classId, { abierto, consigna }, tutor !== null);
      setTutor(prev => ({ resumen: null, resumenAt: null, resumenEstudiantes: null, ...prev, abierto, consigna: consigna.trim() || null }));
      if (!uso) getUsoTutor(classId).then(setUso).catch(() => setUso({ estudiantes: 0, mensajes: 0 }));
      avisar.exito(abierto ? `Repaso abierto para ${curso}` : 'Repaso cerrado', abierto ? 'Lo ven en "Estudiar".' : 'Los chicos ya no lo ven.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const resumir = async () => {
    setResumiendo(true);
    setError('');
    try {
      const r = await pedirResumenTutor(classId);
      setUso({ estudiantes: r.estudiantes, mensajes: r.mensajes });
      if (r.resumen) setTutor(prev => (prev ? { ...prev, resumen: r.resumen, resumenAt: new Date().toISOString(), resumenEstudiantes: r.estudiantes } : prev));
      else avisar.info(`Todavía lo usaron ${r.estudiantes} estudiante${r.estudiantes !== 1 ? 's' : ''}`, `El resumen sale desde ${r.minimo}, así no se sabe quién preguntó qué.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el resumen.');
    } finally {
      setResumiendo(false);
    }
  };

  const abierto = tutor?.abierto ?? false;
  const cambioConsigna = (tutor?.consigna ?? '') !== consigna.trim();
  const alcanza = (uso?.estudiantes ?? 0) >= MINIMO;

  return (
    <div className="rcm">
      <p className="tp-ayuda">
        Los chicos de {curso} repasan este tema con Migue: les pregunta, les da pistas y no les da las
        respuestas. Vos no leés las charlas: ves un resumen de lo que les costó, sin nombres, cuando lo
        usaron al menos {MINIMO}.
      </p>

      <label className="rcm-campo">
        <span>¿Algo en especial? (opcional)</span>
        <textarea rows={2} maxLength={600} value={consigna} onChange={e => setConsigna(e.target.value)}
          placeholder="Ej: que practiquen con ejemplos de la cocina y lleguen a simplificar" />
      </label>

      <div className="rcm-acciones">
        {abierto ? (
          <>
            <span className="badge badge-success"><Unlock size={12} aria-hidden="true" /> Abierto para {curso}</span>
            {cambioConsigna && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardar(true)} disabled={guardando}>
                Guardar el pedido
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void guardar(false)} disabled={guardando}>
              <Lock size={14} aria-hidden="true" /> Cerrar el repaso
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardar(true)} disabled={guardando}>
            {guardando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <MessagesSquare size={14} aria-hidden="true" />}
            {tutor ? 'Volver a abrirlo' : `Abrir el repaso para ${curso}`}
          </button>
        )}
      </div>

      {tutor && (
        <div className="rcm-uso">
          <span><Users size={14} aria-hidden="true" /> {uso
            ? `Lo usaron ${uso.estudiantes} estudiante${uso.estudiantes !== 1 ? 's' : ''} · ${uso.mensajes} mensaje${uso.mensajes !== 1 ? 's' : ''}`
            : 'Contando…'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void resumir()} disabled={resumiendo || !alcanza}
            title={alcanza ? 'Un resumen de lo que más preguntaron y dónde se trabaron' : `Sale cuando lo usen al menos ${MINIMO} estudiantes`}>
            {resumiendo ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {resumiendo ? 'Armando…' : tutor.resumen ? 'Actualizar qué les costó' : 'Ver qué les costó'}
          </button>
        </div>
      )}

      {tutor?.resumen && (
        <div className="rcm-resumen">
          <p className="rcm-resumen-cuando">
            {tutor.resumenAt ? `Resumen del ${new Date(tutor.resumenAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}` : ''}
            {tutor.resumenEstudiantes ? ` · con lo que preguntaron ${tutor.resumenEstudiantes} estudiantes` : ''}
          </p>
          <MarkdownRenderer content={tutor.resumen} />
        </div>
      )}

      {error && <p className="em-error" role="alert">{error}</p>}
    </div>
  );
}
