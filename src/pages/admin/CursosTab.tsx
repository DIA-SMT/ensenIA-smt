/**
 * Cursos y materias. Acá el alta va en línea y no en un diálogo: se cargan
 * varios seguidos (1° A, 1° B, 2° A...) y abrir y cerrar un diálogo por
 * cada uno sería un trámite.
 */

import { useState } from 'react';
import { Plus, Trash2, BookOpen, Layers } from 'lucide-react';
import { createCourse, deleteCourse, createSubject, deleteSubject, type AdminCourse, type AdminSubject } from '../../services/admin.service';
import { avisar, confirmar } from '../../components/ui/avisar';
import { Barra, Vacio } from './ui';
import type { TabProps } from './GestionEscuela';

export default function CursosTab({ data, run }: TabProps) {
  const borrarCurso = async (c: AdminCourse) => {
    const si = await confirmar({
      titulo: `¿Eliminar el curso ${c.name}?`,
      mensaje: 'Desaparece de la escuela. Si ya tiene actividades, clases o planificación cargadas, no se va a poder eliminar.',
      accion: 'Eliminar curso',
      peligro: true,
    });
    if (si && await run(() => deleteCourse(c.id))) avisar.exito(`Se eliminó el curso ${c.name}`);
  };

  const borrarMateria = async (s: AdminSubject) => {
    const si = await confirmar({
      titulo: `¿Eliminar la materia ${s.name}?`,
      mensaje: 'Desaparece de la lista de materias de la escuela. Si ya tiene actividades, materiales o notas, no se va a poder eliminar.',
      accion: 'Eliminar materia',
      peligro: true,
    });
    if (si && await run(() => deleteSubject(s.id))) avisar.exito(`Se eliminó la materia ${s.name}`);
  };

  const [year, setYear] = useState('1');
  const [division, setDivision] = useState('');
  const [subject, setSubject] = useState('');

  const addCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!division.trim()) return;
    if (await run(() => createCourse(data.school.id, Number(year), division))) setDivision('');
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    if (await run(() => createSubject(data.school.id, subject))) setSubject('');
  };

  // En qué cursos se dicta cada materia (según las asignaciones docentes)
  const cursosDe = (subjectId: string) =>
    [...new Set(data.assignments.filter(a => a.subjectId === subjectId).map(a => a.courseName))].sort();

  return (
    <div className="adm-seccion">
      <Barra
        detalle="Una materia se dicta en un curso cuando se la asignás a un docente (en Personal). Los estudiantes del curso quedan inscriptos solos." />

      <div className="adm-dos">
        <section className="card adm-tarjeta" aria-labelledby="t-cursos">
          <h4 id="t-cursos" className="adm-subtitulo"><Layers size={16} aria-hidden="true" /> Cursos</h4>
          <form className="adm-alta" onSubmit={addCourse}>
            <select className="form-select adm-alta-anio" value={year} onChange={e => setYear(e.target.value)} aria-label="Año">
              {[1, 2, 3, 4, 5, 6, 7].map(y => <option key={y} value={y}>{y}°</option>)}
            </select>
            <input className="form-input" value={division} onChange={e => setDivision(e.target.value)}
              placeholder="División (A, B...)" aria-label="División" maxLength={3} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!division.trim()}>
              <Plus size={15} aria-hidden="true" /> Agregar
            </button>
          </form>
          {data.courses.length === 0 ? (
            <Vacio icono={Layers} titulo="Sin cursos" texto="Empezá por acá: los docentes y los estudiantes se cargan en un curso." />
          ) : (
            <ul className="adm-lista">
              {data.courses.map(c => (
                <li key={c.id}>
                  <span className="adm-lista-principal">{c.name}</span>
                  <span className="adm-lista-meta">{c.studentCount} estudiante{c.studentCount !== 1 ? 's' : ''}</span>
                  {c.studentCount === 0 ? (
                    <button type="button" className="btn-icon" aria-label={`Eliminar ${c.name}`}
                      onClick={() => borrarCurso(c)}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  ) : <span className="adm-lista-hueco" aria-hidden="true" />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card adm-tarjeta" aria-labelledby="t-materias">
          <h4 id="t-materias" className="adm-subtitulo"><BookOpen size={16} aria-hidden="true" /> Materias</h4>
          <form className="adm-alta" onSubmit={addSubject}>
            <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="Ej: Matemática" aria-label="Materia" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!subject.trim()}>
              <Plus size={15} aria-hidden="true" /> Agregar
            </button>
          </form>
          {data.subjects.length === 0 ? (
            <Vacio icono={BookOpen} titulo="Sin materias" texto="Cargá las materias de la escuela; después se asignan a cada docente por curso." />
          ) : (
            <ul className="adm-lista">
              {data.subjects.map(s => {
                const cursos = cursosDe(s.id);
                return (
                  <li key={s.id}>
                    <span className="adm-lista-principal">{s.name}</span>
                    <span className="adm-lista-meta">{cursos.length ? cursos.join(' · ') : 'sin docente asignado'}</span>
                    {cursos.length === 0 ? (
                      <button type="button" className="btn-icon" aria-label={`Eliminar ${s.name}`}
                        onClick={() => borrarMateria(s)}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    ) : <span className="adm-lista-hueco" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
