/**
 * Temario del trimestre tal como lo ve quien cursa: qué se va a dar en
 * cada materia y con qué criterios se evalúa. Sin descargar nada.
 *
 * Las escuelas pidieron "temario de primer, segundo y tercer trimestre":
 * el panel arranca en el trimestre en curso pero deja moverse a los otros,
 * para volver sobre lo que ya se dio o mirar lo que viene.
 *
 * Lo comparten el portal del estudiante y el de la familia. La RLS (012)
 * decide qué materias entran: acá no hay filtrado por rol.
 */

import { useEffect, useState } from 'react';
import { BookOpen, ClipboardCheck, ChevronRight } from 'lucide-react';
import { getSyllabusForTerm } from '../services/syllabus.service';
import type { AcademicTerm, SyllabusSubject } from '../types';

interface SyllabusPanelProps {
  /** null = todavía cargando. [] = la escuela no tiene trimestres del año. */
  terms: AcademicTerm[] | null;
  /** Trimestre en curso: con qué abre el panel. */
  initialTermId: string | null;
  /** Quién lee: cambia a quién se le habla en los textos. */
  voice: 'propia' | 'familia';
  /** Una familia con hijos en cursos distintos no debe verlos mezclados. */
  courseId?: string;
}

export default function SyllabusPanel({ terms, initialTermId, voice, courseId }: SyllabusPanelProps) {
  const [termId, setTermId] = useState<string | null>(initialTermId);
  const [subjects, setSubjects] = useState<SyllabusSubject[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);

  // Los trimestres llegan asincrónicos: sin esto el panel queda en el
  // trimestre "null" con el que montó y no carga nunca.
  useEffect(() => {
    setTermId(prev => prev ?? initialTermId);
  }, [initialTermId]);

  useEffect(() => {
    if (!termId) { setSubjects([]); return; }
    let cancelled = false;
    setSubjects(null);
    setFallo(false);
    setOpenUnit(null);
    getSyllabusForTerm(termId)
      .then(s => {
        if (cancelled) return;
        setSubjects(courseId ? s.filter(x => x.courseId === courseId) : s);
      })
      .catch(err => {
        // Un error no es "todavía no publicaron": decirlo así esconde
        // fallas de permisos detrás de un estado vacío que parece normal.
        console.error(err);
        if (!cancelled) { setSubjects([]); setFallo(true); }
      });
    return () => { cancelled = true; };
  }, [termId, courseId]);

  const termName = terms?.find(t => t.id === termId)?.name;

  const selector = terms && terms.length > 1 && (
    <div className="syllabus-terms" role="tablist" aria-label="Trimestre">
      {terms.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === termId}
          className={`syllabus-term-chip ${t.id === termId ? 'active' : ''}`}
          onClick={() => setTermId(t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );

  let cuerpo;
  if (terms === null) {
    // Los trimestres siguen en vuelo: no es un error, es la carga normal.
    cuerpo = <p className="text-secondary text-sm">Cargando temario…</p>;
  } else if (!termId) {
    cuerpo = (
      <p className="text-secondary text-sm">
        La escuela todavía no cargó los trimestres de este año, así que no hay
        dónde ubicar el temario.
      </p>
    );
  } else if (subjects === null) {
    cuerpo = <p className="text-secondary text-sm">Cargando temario…</p>;
  } else if (fallo) {
    cuerpo = (
      <p className="text-secondary text-sm">
        No se pudo cargar el temario. Probá de nuevo en un rato; si sigue igual,
        avisale a la escuela.
      </p>
    );
  } else if (subjects.length === 0) {
    cuerpo = (
      <p className="text-secondary text-sm">
        {voice === 'propia' ? 'Tus docentes' : 'Sus docentes'} todavía no publicaron
        el temario{termName ? ` del ${termName}` : ''}.
      </p>
    );
  } else {
    cuerpo = (
      <div className="syllabus-list">
        {subjects.map(s => (
          <div key={`${s.subjectId}-${s.courseId}`} className="syllabus-subject">
            <h4 className="syllabus-subject-name">
              <BookOpen size={14} /> {s.subjectName}
            </h4>

            {s.units.map(u => {
              const abierta = openUnit === u.id;
              return (
                <div key={u.id} className="syllabus-unit">
                  <button
                    className="syllabus-unit-head"
                    onClick={() => setOpenUnit(abierta ? null : u.id)}
                    aria-expanded={abierta}
                  >
                    <ChevronRight size={14} className={`syllabus-chevron ${abierta ? 'open' : ''}`} />
                    <span>{u.title}</span>
                    <span className="text-xs text-subtle">
                      {u.classes.length} {u.classes.length === 1 ? 'clase' : 'clases'}
                    </span>
                  </button>

                  {abierta && (
                    <ol className="syllabus-classes">
                      {u.classes.map(c => (
                        <li key={c.id} className="syllabus-class">
                          <span className="syllabus-class-title">{c.title}</span>
                          {c.objectives && c.objectives.length > 0 && (
                            <ul className="syllabus-objectives">
                              {c.objectives.map((o, i) => <li key={i}>{o}</li>)}
                            </ul>
                          )}
                        </li>
                      ))}
                      {u.classes.length === 0 && (
                        <li className="text-subtle text-xs">Sin clases cargadas todavía.</li>
                      )}
                    </ol>
                  )}
                </div>
              );
            })}

            {s.criteria && (
              <div className="syllabus-criteria">
                <span className="syllabus-criteria-title">
                  <ClipboardCheck size={13} /> Cómo se evalúa
                </span>
                <p>{s.criteria}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="syllabus-panel">
      {selector}
      {cuerpo}
    </div>
  );
}
