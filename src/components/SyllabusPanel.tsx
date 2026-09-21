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
import { BookOpen, ClipboardCheck, ChevronRight, Video, ExternalLink } from 'lucide-react';
import { getSyllabusForTerm } from '../services/syllabus.service';
import { getPublishedRecordings, embedUrl, PROVIDER_LABELS } from '../services/recordings.service';
import type { AcademicTerm, RecordedClass, SyllabusSubject } from '../types';

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
  const [grabadas, setGrabadas] = useState<RecordedClass[]>([]);
  const [fallo, setFallo] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [verVideo, setVerVideo] = useState<RecordedClass | null>(null);

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
    setVerVideo(null);

    // Las grabaciones son de la materia, no del trimestre: si fallan, el
    // temario se muestra igual.
    getPublishedRecordings(courseId)
      .then(r => { if (!cancelled) setGrabadas(r); })
      .catch(err => { console.error(err); if (!cancelled) setGrabadas([]); });

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
                    <>
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
                      <Grabaciones
                        lista={grabadas.filter(g => g.unitId === u.id)}
                        onVer={setVerVideo}
                      />
                    </>
                  )}
                </div>
              );
            })}

            {/* Grabaciones de la materia que no quedaron colgadas de
                ninguna unidad: si no se mostraran acá, se perderían. */}
            <Grabaciones
              lista={grabadas.filter(g => g.subjectId === s.subjectId && !g.unitId
                && (g.termId === null || g.termId === termId))}
              onVer={setVerVideo}
              titulo="Clases grabadas de la materia"
            />

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
      {verVideo && <VisorVideo rec={verVideo} onCerrar={() => setVerVideo(null)} />}
    </div>
  );
}

/** Listado de grabaciones dentro de una unidad o de una materia. */
function Grabaciones({ lista, onVer, titulo }: {
  lista: RecordedClass[];
  onVer: (r: RecordedClass) => void;
  titulo?: string;
}) {
  if (lista.length === 0) return null;
  return (
    <div className="syllabus-grabadas">
      {titulo && <span className="syllabus-grabadas-titulo"><Video size={12} /> {titulo}</span>}
      {lista.map(r => (
        <button key={r.id} className="syllabus-grabada" onClick={() => onVer(r)}>
          <Video size={13} />
          <span className="syllabus-grabada-titulo">{r.title}</span>
          <span className="text-xs text-subtle">
            {r.durationMin ? `${r.durationMin} min` : PROVIDER_LABELS[r.provider]}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Visor de la grabación. Si el proveedor no se puede embeber, lo dice y
 * ofrece abrirla afuera, en vez de mostrar un recuadro en blanco.
 */
function VisorVideo({ rec, onCerrar }: { rec: RecordedClass; onCerrar: () => void }) {
  const src = embedUrl(rec);
  return (
    <div className="em-modal-overlay" onClick={onCerrar}>
      <div className="em-modal visor-modal" onClick={e => e.stopPropagation()}>
        <div className="em-modal-header">
          <h3><Video size={17} /> {rec.title}</h3>
          <button className="btn btn-ghost" onClick={onCerrar}>✕</button>
        </div>
        <div className="em-modal-body">
          {rec.description && <p className="text-secondary text-sm">{rec.description}</p>}
          {src ? (
            <div className="visor-video">
              <iframe
                src={src}
                title={rec.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="visor-externo">
              <p className="text-secondary text-sm">
                Esta grabación está en {PROVIDER_LABELS[rec.provider]} y no se puede
                ver acá adentro.
              </p>
              <a className="btn btn-primary btn-sm" href={rec.url}
                 target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> Abrir la grabación
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
