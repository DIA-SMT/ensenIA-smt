/**
 * La libreta del estudiante: lo comparten el portal del estudiante y el de
 * la familia (la misma información, sin interpretaciones distintas según
 * quién mire).
 *
 * Una fila por materia con la nota de cada trimestre y la final, como la
 * libreta de papel. Tocando una materia se ven las notas que explican cada
 * trimestre: las evaluaciones que cargó el docente (050) y las actividades
 * de la app ya corregidas (estas solo las ve el propio estudiante).
 * La nota del trimestre aparece recién cuando el docente la publica.
 */

import { useEffect, useMemo, useState } from 'react';
import { BookMarked, ChevronDown } from 'lucide-react';
import { getPublishedGradesByStudent } from '../services/gradebook.service';
import { getNotasDelAlumno, TIPOS_EVALUACION, type NotaDelAlumno } from '../services/evaluaciones.service';
import { formatoNota } from '../lib/resumenNotas';
import type { TermGrade, AlertThresholds } from '../types';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto } from './ui/Esqueleto';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import '../pages/Libreta.css';
import './GradesPanel.css';

interface GradesPanelProps {
  studentId: string;
  thresholds: Pick<AlertThresholds, 'gradeRiskMax'>;
  /** El estudiante se ve a sí mismo; la familia mira a su hijo/a. */
  voice: 'propia' | 'familia';
  /** Para quien quiera resumir las mismas notas sin volver a pedirlas. */
  alCargar?: (notas: TermGrade[]) => void;
}

interface Materia {
  subjectId: string;
  nombre: string;
  /** Nota publicada de cada trimestre (1, 2, 3) */
  trimestres: Record<number, TermGrade | undefined>;
  /** Las notas del año que la explican */
  notas: NotaDelAlumno[];
}

const diaMes = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;

export default function GradesPanel({ studentId, thresholds, voice, alCargar }: GradesPanelProps) {
  const [grades, setGrades] = useState<TermGrade[] | null>(null);
  const [notas, setNotas] = useState<NotaDelAlumno[]>([]);
  const [fallo, setFallo] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFallo(false);
    getPublishedGradesByStudent(studentId)
      .then(async g => {
        // El año de la libreta: el último con notas publicadas (en febrero
        // todavía es el del año pasado), o el actual
        const anio = Math.max(new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0), ...g.map(x => x.termYear ?? 0));
        const delAnio = g.filter(x => !x.termYear || x.termYear === anio);
        const n = await getNotasDelAlumno(studentId, anio).catch(err => { console.error(err); return [] as NotaDelAlumno[]; });
        if (cancelled) return;
        setGrades(delAnio);
        setNotas(n);
        alCargar?.(delAnio);
      })
      .catch(err => { console.error(err); if (!cancelled) { setGrades([]); setFallo(true); } });
    return () => { cancelled = true; };
    // alCargar puede cambiar de identidad en cada render del padre: no
    // debe volver a pedir las notas por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const materias = useMemo<Materia[]>(() => {
    const porId = new Map<string, Materia>();
    const de = (id: string, nombre?: string) => {
      let m = porId.get(id);
      if (!m) { m = { subjectId: id, nombre: nombre ?? 'Materia', trimestres: {}, notas: [] }; porId.set(id, m); }
      return m;
    };
    for (const g of grades ?? []) if (g.termNumber) de(g.subjectId, g.subjectName).trimestres[g.termNumber] = g;
    for (const n of notas) de(n.subjectId, n.subjectName).notas.push(n);
    return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [grades, notas]);

  if (grades === null) return <Esqueleto tipo="filas" cantidad={3} etiqueta="Cargando notas…" />;

  // Un error no es "no hay notas": decirlo así haría creer que no hay nada
  // que ver cuando en realidad no se pudo consultar.
  if (fallo) {
    return <p className="text-sm text-danger" role="alert">No se pudieron traer las notas. Revisá la conexión y volvé a entrar.</p>;
  }

  if (materias.length === 0) {
    return (
      <EstadoVacio
        compacto
        icono={BookMarked}
        titulo="Todavía no hay notas"
        texto={voice === 'propia'
          ? 'Aparecen acá cuando tus docentes cargan las notas de una evaluación o publican la del trimestre.'
          : 'Aparecen acá cuando sus docentes cargan las notas de una evaluación o publican la del trimestre.'}
      />
    );
  }

  const claseNota = (g: TermGrade) => {
    if (g.carriesToDecember) return 'grade-fail';
    if (g.grade !== null && g.grade <= thresholds.gradeRiskMax) return 'grade-risk';
    return 'grade-ok';
  };

  /** La final: el promedio de los tres trimestres publicados, y si aprueba o va a diciembre. */
  const final = (m: Materia) => {
    const t = [1, 2, 3].map(n => m.trimestres[n]);
    if (t.some(x => x?.carriesToDecember)) return { nota: null as number | null, estado: 'diciembre' as const };
    if (t.some(x => !x || x.grade === null)) return { nota: null, estado: 'en-curso' as const };
    const prom = Math.round(((t[0]!.grade! + t[1]!.grade! + t[2]!.grade!) / 3) * 100) / 100;
    return { nota: prom, estado: prom >= 6 ? 'aprobada' as const : 'diciembre' as const };
  };

  return (
    <div className="libreta-alumno">
      <table className="la-tabla">
        <caption className="sr-only">Libreta: nota de cada trimestre y final, por materia</caption>
        <thead>
          <tr>
            <th scope="col">Materia</th>
            <th scope="col" title="1er trimestre">1°</th>
            <th scope="col" title="2do trimestre">2°</th>
            <th scope="col" title="3er trimestre">3°</th>
            <th scope="col">Final</th>
          </tr>
        </thead>
        <tbody>
          {materias.map(m => {
            const f = final(m);
            const abiertaEsta = abierta === m.subjectId;
            const idDetalle = `la-detalle-${m.subjectId}`;
            return [
              <tr key={m.subjectId} className={abiertaEsta ? 'abierta' : undefined}>
                <th scope="row">
                  <button type="button" className="la-materia" aria-expanded={abiertaEsta} aria-controls={idDetalle}
                    onClick={() => setAbierta(abiertaEsta ? null : m.subjectId)}>
                    <ChevronDown size={14} aria-hidden="true" className="la-flecha" />
                    <span>{m.nombre}</span>
                    {m.notas.length > 0 && <span className="la-cuantas">{m.notas.length} nota{m.notas.length !== 1 ? 's' : ''}</span>}
                  </button>
                </th>
                {[1, 2, 3].map(n => {
                  const g = m.trimestres[n];
                  return (
                    <td key={n}>
                      {g && g.grade !== null
                        ? <span className={`la-nota ${claseNota(g)}`}>{formatoNota(g.grade)}</span>
                        : <span className="la-vacia" aria-label="sin nota">·</span>}
                    </td>
                  );
                })}
                <td>
                  {f.estado === 'aprobada' && <span className="la-final aprobada" title="Aprobada">{formatoNota(f.nota!)}</span>}
                  {f.estado === 'diciembre' && <span className="la-final diciembre" title="Se lleva la materia a diciembre">Dic.</span>}
                  {f.estado === 'en-curso' && <span className="la-vacia" title="Todavía no están las notas de los tres trimestres">—</span>}
                </td>
              </tr>,
              abiertaEsta && (
                <tr key={`${m.subjectId}-detalle`} className="la-fila-detalle">
                  <td colSpan={5} id={idDetalle}>
                    <DetalleMateria materia={m} />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
      <p className="la-ayuda">
        Tocá una materia para ver las notas de cada trimestre. La nota del trimestre aparece cuando {voice === 'propia' ? 'tu docente' : 'el docente'} la publica.
      </p>
    </div>
  );
}

function DetalleMateria({ materia }: { materia: Materia }) {
  const trimestres = [1, 2, 3, null]
    .map(n => ({
      n,
      grade: n ? materia.trimestres[n] : undefined,
      notas: materia.notas.filter(x => x.trimestre === n),
    }))
    .filter(t => t.grade || t.notas.length > 0);

  if (trimestres.length === 0) return <p className="la-ayuda">Todavía no hay notas de esta materia.</p>;

  return (
    <div className="la-detalle">
      {trimestres.map(t => (
        <section key={t.n ?? 'otro'} className="la-trimestre">
          <h4>
            {t.n ? `${t.n}° trimestre` : 'Fuera de los trimestres'}
            {t.grade && t.grade.grade !== null && <span>Nota del trimestre: <strong>{formatoNota(t.grade.grade)}</strong></span>}
          </h4>
          {t.grade?.carriesToDecember && <p className="la-aviso">Se lleva la materia a diciembre.</p>}
          {t.grade?.teacherNote && <p className="la-comentario">“{t.grade.teacherNote}”</p>}
          {t.notas.length > 0 ? (
            <ul>
              {t.notas.map(x => (
                <li key={x.id}>
                  <span aria-hidden="true">{x.tipo === 'actividad' ? '💻' : TIPOS_EVALUACION[x.tipo].emoji}</span>
                  <span className="la-item-texto">
                    <span>{x.titulo}</span>
                    <small>{x.tipo === 'actividad' ? 'Actividad de la app' : TIPOS_EVALUACION[x.tipo].label} · {diaMes(x.fecha)}</small>
                  </span>
                  <span className="la-item-nota">
                    {x.ausente ? 'Ausente'
                      : x.sinCorregir ? 'Sin corregir'
                        : x.nota !== null ? <strong className={x.nota < 6 ? 'baja' : undefined}>{formatoNota(x.nota)}</strong> : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="la-ayuda">Sin notas de evaluaciones en este trimestre.</p>
          )}
        </section>
      ))}
    </div>
  );
}
