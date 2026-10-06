/**
 * Horario: la dirección arma la semana de cada curso. Cada clase es una
 * materia con su docente (las asignaciones de Personal), un día, un
 * horario y un aula. La base completa el resto y frena superposiciones
 * del mismo curso o del mismo docente (migración 043).
 *
 * Lo que se carga acá es lo que el docente ve en "Mi día" y en su Agenda,
 * y lo que la dirección ve en Horario de la escuela.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, AlertCircle, Trash2 } from 'lucide-react';
import {
  getSchoolSchedule, createScheduleBlock, updateScheduleBlock, deleteScheduleBlock,
  horaTexto, horaDecimal, type ClaseHorario,
} from '../../services/schedule.service';
import HorarioSemanal from '../../components/HorarioSemanal';
import { DIAS } from '../../lib/horario';
import { Barra, Campo, DialogoForm } from './ui';
import type { TabProps } from './GestionEscuela';
import type { ScheduleBlock } from '../../types';

interface Edicion { id: string | null; asignacion: string; dia: number; desde: string; hasta: string; aula: string }

const aHHMM = (h: number) => horaTexto(h).padStart(5, '0');

export default function HorarioTab({ data, irA }: TabProps) {
  const [cursoId, setCursoId] = useState(data.courses[0]?.id ?? '');
  const [bloques, setBloques] = useState<ScheduleBlock[] | null>(null);
  const [error, setError] = useState('');
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const cargar = useCallback(() => {
    getSchoolSchedule(data.school.id)
      .then(setBloques)
      .catch(() => setError('No se pudo cargar el horario. ¿Está corrida la migración 043?'));
  }, [data.school.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const docente = useMemo(() => {
    const m = new Map(data.members.map(p => [p.userId, `${p.firstName} ${p.lastName}`.trim()]));
    return (id: string) => m.get(id) ?? 'Docente';
  }, [data.members]);

  const asignaciones = data.assignments.filter(a => a.courseId === cursoId);
  const delCurso = (bloques ?? []).filter(b => b.courseId === cursoId);
  const curso = data.courses.find(c => c.id === cursoId);
  const horasSemana = delCurso.reduce((n, b) => n + b.duration, 0);

  const nueva = () => {
    // Por comodidad, arranca donde termina la última clase de ese día
    setErrorForm('');
    setEdicion({ id: null, asignacion: asignaciones[0]?.id ?? '', dia: 0, desde: '07:30', hasta: '08:50', aula: '' });
  };
  const editar = (b: ScheduleBlock) => {
    setErrorForm('');
    const a = data.assignments.find(x => x.teacherId === b.teacherId && x.subjectId === b.subjectId && x.courseId === b.courseId);
    setEdicion({ id: b.id, asignacion: a?.id ?? '', dia: b.dayIndex, desde: aHHMM(b.startHour), hasta: aHHMM(b.startHour + b.duration), aula: b.room });
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edicion || guardando) return;
    const a = data.assignments.find(x => x.id === edicion.asignacion);
    const desde = horaDecimal(edicion.desde);
    const hasta = horaDecimal(edicion.hasta);
    if (!a) { setErrorForm('Elegí la materia y el docente.'); return; }
    if (!(hasta > desde)) { setErrorForm('La hora de fin tiene que ser después de la de inicio.'); return; }
    const c: ClaseHorario = {
      teacherId: a.teacherId, subjectId: a.subjectId, courseId: a.courseId,
      dayIndex: edicion.dia, startHour: desde, duration: Math.round((hasta - desde) * 100) / 100, room: edicion.aula.trim(),
    };
    setGuardando(true);
    setErrorForm('');
    try {
      if (edicion.id) await updateScheduleBlock(edicion.id, c);
      else await createScheduleBlock(data.school.id, c);
      // Queda abierto para cargar la siguiente: arranca donde terminó esta
      if (!edicion.id) setEdicion({ ...edicion, desde: edicion.hasta, hasta: aHHMM(hasta + (hasta - desde)) });
      else setEdicion(null);
      cargar();
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!edicion?.id || !window.confirm('¿Borrar esta clase del horario?')) return;
    try {
      await deleteScheduleBlock(edicion.id);
      setEdicion(null);
      cargar();
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'No se pudo borrar.');
    }
  };

  if (data.courses.length === 0) {
    return (
      <p className="adm-aviso"><AlertCircle size={14} aria-hidden="true" /> Primero creá los cursos.{' '}
        <button type="button" className="adm-link" onClick={() => irA('cursos')}>Ir a Cursos y materias</button></p>
    );
  }

  return (
    <div className="adm-seccion">
      <Barra detalle={curso ? `${curso.name} · ${delCurso.length} clase${delCurso.length !== 1 ? 's' : ''} por semana${horasSemana ? ` · ${horaTexto(horasSemana)} h` : ''}` : ''}>
        <select className="form-select" value={cursoId} onChange={e => setCursoId(e.target.value)} aria-label="Curso">
          {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="btn btn-primary" onClick={nueva} disabled={asignaciones.length === 0}>
          <CalendarPlus size={16} aria-hidden="true" /> Agregar clase
        </button>
      </Barra>

      {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
      {asignaciones.length === 0 && (
        <p className="adm-aviso"><AlertCircle size={14} aria-hidden="true" /> {curso?.name} todavía no tiene materias con docente. El horario se arma con lo que asignes en Personal.{' '}
          <button type="button" className="adm-link" onClick={() => irA('personal')}>Ir a Personal</button></p>
      )}

      {bloques === null ? <p className="text-secondary">Cargando…</p> : (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <HorarioSemanal
            bloques={delCurso}
            etiqueta={b => ({ titulo: b.subjectName, detalle: docente(b.teacherId) })}
            onBloque={editar}
            vacio={asignaciones.length > 0 && <p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              {curso?.name} no tiene clases cargadas. Tocá "Agregar clase" para armar la semana: queda abierto para cargar una después de otra.</p>}
          />
        </div>
      )}

      {edicion && (
        <DialogoForm abierto alCerrar={() => setEdicion(null)} id="hor-dialogo"
          titulo={edicion.id ? 'Editar clase' : `Agregar clase · ${curso?.name ?? ''}`}
          bajada={edicion.id ? undefined : 'Queda abierto para cargar la siguiente.'}
          pie={<>
            {edicion.id && <button type="button" className="btn btn-ghost" onClick={borrar} style={{ marginRight: 'auto' }}><Trash2 size={15} aria-hidden="true" /> Borrar</button>}
            <button type="button" className="btn btn-ghost" onClick={() => setEdicion(null)}>{edicion.id ? 'Cancelar' : 'Terminar'}</button>
            <button type="submit" form="form-horario" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </>}>
          <form id="form-horario" className="adm-form" onSubmit={guardar}>
            {errorForm && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errorForm}</div>}
            <Campo label="Materia y docente" htmlFor="hor-asig">
              <select id="hor-asig" className="form-select" data-inicial value={edicion.asignacion}
                onChange={e => setEdicion({ ...edicion, asignacion: e.target.value })}>
                <option value="">Elegir…</option>
                {asignaciones.map(a => <option key={a.id} value={a.id}>{a.subjectName} — {docente(a.teacherId)}</option>)}
              </select>
            </Campo>
            <Campo label="Día" htmlFor="hor-dia">
              <select id="hor-dia" className="form-select" value={edicion.dia} onChange={e => setEdicion({ ...edicion, dia: Number(e.target.value) })}>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Campo>
            <div className="adm-fila">
              <Campo label="Desde" htmlFor="hor-desde">
                <input id="hor-desde" type="time" step={300} className="form-input" value={edicion.desde} onChange={e => setEdicion({ ...edicion, desde: e.target.value })} />
              </Campo>
              <Campo label="Hasta" htmlFor="hor-hasta">
                <input id="hor-hasta" type="time" step={300} className="form-input" value={edicion.hasta} onChange={e => setEdicion({ ...edicion, hasta: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Aula (opcional)" htmlFor="hor-aula">
              <input id="hor-aula" className="form-input" value={edicion.aula} onChange={e => setEdicion({ ...edicion, aula: e.target.value })} placeholder="Ej: Aula 4, Laboratorio" />
            </Campo>
          </form>
        </DialogoForm>
      )}
    </div>
  );
}
