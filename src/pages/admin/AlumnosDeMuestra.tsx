/**
 * Alumnos de muestra (solo superadmin): para mostrar la app con el aula
 * llena. Por curso, 20 alumnos inventados con asistencia, notas, ánimo,
 * observaciones y medallas; se quitan con todo lo suyo. Lo hace la base
 * (migración 048); acá solo se elige el curso.
 */

import { useEffect, useState } from 'react';
import { FlaskConical, AlertCircle, Plus, Trash2, Loader2 } from 'lucide-react';
import { getDemoStudents, loadDemoStudents, removeDemoStudents } from '../../services/admin.service';
import { avisar, confirmar } from '../../components/ui/avisar';
import type { TabProps } from './GestionEscuela';

export default function AlumnosDeMuestra({ data, run }: Pick<TabProps, 'data' | 'run'>) {
  const [porCurso, setPorCurso] = useState<Record<string, number> | null>(null);
  const [falta, setFalta] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Se vuelve a leer cada vez que cambian los alumnos (después de cargar o quitar)
  useEffect(() => {
    let vigente = true;
    getDemoStudents(data.school.id)
      .then(r => { if (vigente) { setPorCurso(r); setFalta(''); } })
      .catch(err => {
        if (!vigente) return;
        const msg = err instanceof Error ? err.message : String(err?.message ?? '');
        setFalta(/demo_alumnos_estado|function|schema cache/i.test(msg)
          ? 'Falta correr la migración 048 en Supabase.'
          : msg || 'No se pudo leer.');
      });
    return () => { vigente = false; };
  }, [data.school.id, data.students.length]);

  const cargar = async (courseId: string, nombre: string) => {
    const si = await confirmar({
      titulo: `¿Cargar alumnos de muestra en ${nombre}?`,
      mensaje: 'Son 20 alumnos inventados, sin cuenta ni familia, con asistencia de las últimas semanas, notas del 1° y 2° trimestre, ánimo, observaciones y medallas. Sus docentes los ven como alumnos del curso y les llegan alertas por los que andan mal.',
      accion: 'Cargar',
    });
    if (!si) return;
    setOcupado(courseId);
    if (await run(async () => { await loadDemoStudents(courseId); })) {
      avisar.exito(`Alumnos de muestra cargados en ${nombre}`);
    }
    setOcupado(null);
  };

  const quitar = async (courseId: string, nombre: string, n: number) => {
    const si = await confirmar({
      titulo: `¿Quitar los ${n} alumnos de muestra de ${nombre}?`,
      mensaje: 'Se borran con su asistencia, notas, ánimo, medallas y las alertas que generaron. Los alumnos reales no se tocan.',
      accion: 'Quitar',
      peligro: true,
    });
    if (!si) return;
    setOcupado(courseId);
    if (await run(async () => { await removeDemoStudents(courseId); })) {
      avisar.exito(`Se quitaron los alumnos de muestra de ${nombre}`);
    }
    setOcupado(null);
  };

  return (
    <section className="card adm-tarjeta" aria-labelledby="t-muestra">
      <h4 id="t-muestra" className="adm-subtitulo"><FlaskConical size={16} aria-hidden="true" /> Alumnos de muestra</h4>
      <p className="adm-ayuda">
        Para mostrar la app con el aula llena. Solo lo ve el superadmin. Antes de que entren los alumnos reales, quitalos.
      </p>

      {falta ? (
        <p className="adm-aviso"><AlertCircle size={14} aria-hidden="true" /> {falta}</p>
      ) : data.courses.length === 0 ? (
        <p className="adm-ayuda">Primero creá los cursos.</p>
      ) : (
        <ul className="adm-muestra">
          {data.courses.map(c => {
            const n = porCurso?.[c.id] ?? 0;
            const conDocentes = data.assignments.some(a => a.courseId === c.id);
            const trabajando = ocupado === c.id;
            return (
              <li key={c.id}>
                <span className="adm-muestra-curso">
                  <strong>{c.name}</strong>
                  <span className="adm-ayuda">
                    {n > 0 ? `${n} de muestra` : conDocentes ? 'Sin alumnos de muestra' : 'Sin docentes con materias'}
                  </span>
                </span>
                {n > 0 ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado !== null}
                    onClick={() => quitar(c.id, c.name, n)}>
                    {trabajando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />} Quitar
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado !== null || !conDocentes || porCurso === null}
                    title={conDocentes ? undefined : 'Asigná al menos un docente con su materia en este curso'}
                    onClick={() => cargar(c.id, c.name)}>
                    {trabajando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} Cargar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
