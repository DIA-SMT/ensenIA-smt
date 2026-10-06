/**
 * Horario de la escuela (dirección): la semana de cada curso o de cada
 * docente, para saber quién está dando qué y dónde. Se arma en Mi escuela
 * → Horario; acá se consulta.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSchoolSchedule, horaTexto } from '../services/schedule.service';
import { listCourses, listMembers, type AdminCourse, type AdminMember } from '../services/admin.service';
import HorarioSemanal from '../components/HorarioSemanal';
import { hoyIndice } from '../lib/horario';
import type { ScheduleBlock } from '../types';
import './admin/Admin.css';

type Vista = 'curso' | 'docente';

export default function HorarioEscuela() {
  const { user } = useAuth();
  const [bloques, setBloques] = useState<ScheduleBlock[] | null>(null);
  const [cursos, setCursos] = useState<AdminCourse[]>([]);
  const [docentes, setDocentes] = useState<AdminMember[]>([]);
  const [vista, setVista] = useState<Vista>('curso');
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.schoolId) return;
    Promise.all([getSchoolSchedule(user.schoolId), listCourses(user.schoolId), listMembers(user.schoolId)])
      .then(([b, c, m]) => { setBloques(b); setCursos(c); setDocentes(m.filter(x => x.role === 'docente')); })
      .catch(() => { setBloques([]); setError('No se pudo cargar el horario.'); });
  }, [user?.schoolId]);

  const nombreDocente = useMemo(() => {
    const m = new Map(docentes.map(d => [d.userId, `${d.firstName} ${d.lastName}`.trim()]));
    return (id: string) => m.get(id) ?? 'Docente';
  }, [docentes]);

  // Solo los cursos y docentes que tienen clases, primero; si no hay nada, todos
  const opciones = vista === 'curso'
    ? cursos.map(c => ({ id: c.id, nombre: c.name, n: (bloques ?? []).filter(b => b.courseId === c.id).length }))
    : docentes.map(d => ({ id: d.userId, nombre: `${d.firstName} ${d.lastName}`.trim(), n: (bloques ?? []).filter(b => b.teacherId === d.userId).length }));
  const actual = elegido && opciones.some(o => o.id === elegido) ? elegido : (opciones.find(o => o.n > 0) ?? opciones[0])?.id ?? '';
  const visibles = (bloques ?? []).filter(b => (vista === 'curso' ? b.courseId : b.teacherId) === actual);
  const horas = visibles.reduce((n, b) => n + b.duration, 0);

  if (!user) return null;

  return (
    <div className="adm-container animate-in">
      <header className="adm-head">
        <div>
          <h2><CalendarClock size={20} aria-hidden="true" /> Horario de la escuela</h2>
          <p>{bloques ? `${bloques.length} clases por semana en ${new Set(bloques.map(b => b.courseId)).size} cursos` : 'Cargando…'}</p>
        </div>
        <Link to="/mi-escuela" className="btn btn-secondary"><Pencil size={15} aria-hidden="true" /> Editar en Mi escuela</Link>
      </header>

      {error && <div className="adm-error" role="alert">{error}</div>}

      <div className="adm-barra">
        <div className="hor-vista" role="group" aria-label="Ver por">
          <button type="button" className={`btn btn-sm ${vista === 'curso' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={vista === 'curso'} onClick={() => { setVista('curso'); setElegido(''); }}>Por curso</button>
          <button type="button" className={`btn btn-sm ${vista === 'docente' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={vista === 'docente'} onClick={() => { setVista('docente'); setElegido(''); }}>Por docente</button>
        </div>
        <div className="adm-barra-acciones">
          <select className="form-select" value={actual} onChange={e => setElegido(e.target.value)} aria-label={vista === 'curso' ? 'Curso' : 'Docente'}>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}{o.n ? ` (${o.n})` : ' · sin clases'}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {bloques === null ? <p className="text-secondary">Cargando…</p> : (
          <>
            {visibles.length > 0 && <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-3)' }}>{visibles.length} clase{visibles.length !== 1 ? 's' : ''} · {horaTexto(horas)} h por semana</p>}
            <HorarioSemanal
              bloques={visibles}
              etiqueta={b => vista === 'curso'
                ? { titulo: b.subjectName, detalle: nombreDocente(b.teacherId) }
                : { titulo: b.subjectName, detalle: b.courseName }}
              hoy={hoyIndice() ?? undefined}
              vacio={<p className="text-secondary" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                {bloques.length === 0
                  ? 'Todavía no hay horario cargado. Se arma en Mi escuela → Horario, curso por curso.'
                  : 'No tiene clases cargadas.'}
              </p>}
            />
          </>
        )}
      </div>
    </div>
  );
}
