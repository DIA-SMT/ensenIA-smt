import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createCourse, deleteCourse, createSubject, deleteSubject } from '../../services/admin.service';
import type { TabProps } from './GestionEscuela';

export default function CursosTab({ data, run }: TabProps) {
  const [year, setYear] = useState('1');
  const [division, setDivision] = useState('');
  const [subject, setSubject] = useState('');

  const addCourse = async () => {
    if (!division.trim()) return;
    if (await run(() => createCourse(data.school.id, Number(year), division))) setDivision('');
  };

  const addSubject = async () => {
    if (!subject.trim()) return;
    if (await run(() => createSubject(data.school.id, subject))) setSubject('');
  };

  const teachersOf = (subjectId: string) => new Set(data.assignments.filter(a => a.subjectId === subjectId).map(a => a.teacherId)).size;

  return (
    <div className="adm-grid">
      <div className="card adm-form">
        <h3 className="adm-card-title">Cursos</h3>
        <div className="adm-inline">
          <select className="form-select" value={year} onChange={e => setYear(e.target.value)} aria-label="Año">
            {[1, 2, 3, 4, 5, 6, 7].map(y => <option key={y} value={y}>{y}°</option>)}
          </select>
          <input value={division} onChange={e => setDivision(e.target.value)} placeholder="División (A, B...)"
            aria-label="División" maxLength={3} onKeyDown={e => { if (e.key === 'Enter') addCourse(); }} />
          <button className="btn btn-primary btn-sm" onClick={addCourse} disabled={!division.trim()}><Plus size={14} /> Agregar</button>
        </div>
        {data.courses.length === 0 && <p className="text-secondary text-sm">Todavía no hay cursos.</p>}
        <ul className="adm-list">
          {data.courses.map(c => (
            <li key={c.id}>
              <span>{c.name}</span>
              <span className="text-subtle text-xs">{c.studentCount} estudiante{c.studentCount !== 1 ? 's' : ''}</span>
              {c.studentCount === 0 && (
                <button className="btn-icon" title="Eliminar curso"
                  onClick={() => window.confirm(`¿Eliminar ${c.name}?`) && run(() => deleteCourse(c.id))}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="card adm-form">
        <h3 className="adm-card-title">Materias</h3>
        <div className="adm-inline">
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ej: Matemática"
            aria-label="Materia" onKeyDown={e => { if (e.key === 'Enter') addSubject(); }} />
          <button className="btn btn-primary btn-sm" onClick={addSubject} disabled={!subject.trim()}><Plus size={14} /> Agregar</button>
        </div>
        {data.subjects.length === 0 && <p className="text-secondary text-sm">Todavía no hay materias.</p>}
        <ul className="adm-list">
          {data.subjects.map(s => {
            const n = teachersOf(s.id);
            return (
              <li key={s.id}>
                <span>{s.name}</span>
                <span className="text-subtle text-xs">{n ? `${n} docente${n !== 1 ? 's' : ''}` : 'sin docente'}</span>
                {n === 0 && (
                  <button className="btn-icon" title="Eliminar materia"
                    onClick={() => window.confirm(`¿Eliminar ${s.name}?`) && run(() => deleteSubject(s.id))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="em-hint">
          Una materia se dicta en un curso cuando se le asigna a un docente (en Personal). Los estudiantes
          del curso quedan inscriptos solos.
        </p>
      </div>
    </div>
  );
}
