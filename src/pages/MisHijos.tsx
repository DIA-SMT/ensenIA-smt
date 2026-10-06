import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, HeartPulse, BookMarked, BookOpen, AlertTriangle, CalendarX2, Award, CalendarX, MessageSquare, ChevronRight, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMyChildren, getChildSummary, type ChildSummary } from '../services/guardians.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import GradesPanel from '../components/GradesPanel';
import SyllabusPanel from '../components/SyllabusPanel';
import { getTerms, pickCurrentTerm } from '../services/gradebook.service';
import { resumirNotas, formatoNota, type ResumenNotas } from '../lib/resumenNotas';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import type { Student, AlertThresholds, AcademicTerm, TermGrade } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import './Familias.css';
import './StudentPortal.css';
import './Libreta.css';
import './MisHijos.css';

const ABSENCE_LABEL: Record<string, string> = {
  ausente: 'Faltó',
  tarde: 'Llegó tarde',
  justificado: 'Falta justificada',
};

/**
 * Mis hijos. Todo lo que se muestra acá sale de lo que la escuela publicó:
 * notas de la libreta y temario. Antes había tres números (asistencia,
 * promedio, progreso) y un "Excelente" que venían de datos de demo que
 * ninguna función de la app calcula.
 */
export default function MisHijos() {
  const { user, school } = useAuth();
  const [children, setChildren] = useState<(Student & { relationship: string })[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [currentTermId, setCurrentTermId] = useState<string | null>(null);
  // Logros y faltas que la escuela cargó (las notas salen del panel de notas).
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({});
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [notasPorHijo, setNotasPorHijo] = useState<Record<string, TermGrade[]>>({});

  useEffect(() => {
    if (!user) return;
    getMyChildren()
      .then(list => {
        setChildren(list);
        list.forEach(c => {
          getChildSummary(c.id)
            .then(sum => setSummaries(prev => ({ ...prev, [c.id]: sum })))
            .catch(console.error);
        });
      })
      .catch(err => { console.error(err); setFallo(true); })
      .finally(() => setLoading(false));
    // La familia lee los umbrales de su escuela (011): el color de la nota
    // tiene que coincidir con la regla del aviso que recibió, no con un
    // default nuestro. Si la escuela no configuró umbrales, getThresholds
    // ya devuelve los mismos defaults que aplica el servidor.
    getTerms(user.schoolId, new Date().getFullYear())
      .then(ts => { setTerms(ts); setCurrentTermId(pickCurrentTerm(ts)?.id ?? null); })
      .catch(err => { console.error(err); setTerms([]); });
    getThresholds(user.schoolId)
      .then(setThresholds)
      .catch(err => {
        console.error(err);
        setThresholds({ schoolId: user.schoolId, ...DEFAULT_THRESHOLDS });
      });
  }, [user]);

  const alCargarNotas = useCallback((id: string, notas: TermGrade[]) => {
    setNotasPorHijo(prev => ({ ...prev, [id]: notas }));
  }, []);

  if (!user) return null;
  const umbrales = thresholds ?? { schoolId: user.schoolId, ...DEFAULT_THRESHOLDS };

  return (
    <div className="sp-container fam-v4">
      {loading && <Esqueleto tipo="tarjetas" cantidad={2} etiqueta="Cargando los datos de tus hijos…" />}
      {!loading && fallo && (
        <div role="alert">
          <EstadoVacio
            icono={WifiOff}
            titulo="No pudimos traer los datos de tus hijos"
            texto="Revisá la conexión y volvé a entrar."
          />
        </div>
      )}
      {!loading && !fallo && children.length === 0 && (
        <EstadoVacio
          icono={GraduationCap}
          titulo="No hay estudiantes vinculados a tu cuenta"
          texto="Consultá en la escuela para que los vinculen."
        />
      )}

      {children.map(c => {
        const notas = notasPorHijo[c.id];
        const resumen = notas ? resumirNotas(notas, umbrales) : null;
        const sum = summaries[c.id];
        const idTitulo = `hijo-${c.id}`;
        return (
          <article key={c.id} className="card fam-child" aria-labelledby={idTitulo}>
            <header className="fam-child-head">
              <div className="fam-avatar" aria-hidden="true">{c.avatarInitials}</div>
              <div className="fam-child-nombre">
                <h2 id={idTitulo}>{c.firstName} {c.lastName}</h2>
                <p className="text-sm text-secondary">{c.courseName}{school ? ` · ${school.shortName}` : ''}</p>
              </div>
            </header>

            <ResumenHijo notas={notas} resumen={resumen} />

            <section className="fam-child-grades" aria-labelledby={`${idTitulo}-notas`}>
              <h3 id={`${idTitulo}-notas`} className="fam-subtitulo"><BookMarked size={15} aria-hidden="true" /> Notas del año</h3>
              <GradesPanel
                studentId={c.id}
                thresholds={umbrales}
                voice="familia"
                alCargar={n => alCargarNotas(c.id, n)}
              />
            </section>

            <section className="fam-child-grades" aria-labelledby={`${idTitulo}-temario`}>
              <h3 id={`${idTitulo}-temario`} className="fam-subtitulo"><BookOpen size={15} aria-hidden="true" /> Temario</h3>
              <SyllabusPanel terms={terms} initialTermId={currentTermId} voice="familia" courseId={c.courseId} />
            </section>

            {sum && sum.achievements.length > 0 && (
              <section className="mh-section" aria-labelledby={`${idTitulo}-logros`}>
                <h3 id={`${idTitulo}-logros`} className="fam-subtitulo"><Award size={15} aria-hidden="true" /> Lo que logró</h3>
                <div className="mh-awards">
                  {sum.achievements.slice(0, 8).map((a, i) => (
                    <div key={i} className="mh-award" title={`+${a.points} puntos`}>
                      <span className="mh-award-emoji" aria-hidden="true">{a.emoji}</span>
                      <span className="mh-award-title">{a.title}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sum && sum.absences.length > 0 && (
              <section className="mh-section" aria-labelledby={`${idTitulo}-faltas`}>
                <h3 id={`${idTitulo}-faltas`} className="fam-subtitulo"><CalendarX size={15} aria-hidden="true" /> Sus faltas</h3>
                <div className="mh-absences">
                  {sum.absences.map((a, i) => (
                    <span key={i} className="mh-absence">
                      {ABSENCE_LABEL[a.status] ?? a.status}
                      {a.date && ` · ${new Date(a.date + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <Link to="/comunicados-familia" className="mh-cta">
              <MessageSquare size={15} aria-hidden="true" />
              <span>Ver los comunicados de la escuela</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>

            <p className="fam-pie">
              <HeartPulse size={14} aria-hidden="true" /> Ante cualquier duda sobre su acompañamiento, respondé la citación o acercate a la escuela.
            </p>
          </article>
        );
      })}
    </div>
  );
}

/** Tres datos de la libreta, o una explicación honesta de por qué no hay. */
function ResumenHijo({ notas, resumen }: { notas: TermGrade[] | undefined; resumen: ResumenNotas | null }) {
  if (notas === undefined) return null;
  // Sin notas publicadas no hay nada que resumir: lo explica el panel de notas.
  if (!resumen) return null;
  return (
    <dl className="fam-resumen" aria-label={`Resumen del ${resumen.trimestre}`}>
      <div className="fam-dato">
        <dt>Promedio · {resumen.trimestre}</dt>
        <dd>{formatoNota(resumen.promedio)}<span className="fam-dato-de"> en {resumen.materias} {resumen.materias === 1 ? 'materia' : 'materias'}</span></dd>
      </div>
      <div className={`fam-dato${resumen.conAviso > 0 ? ' fam-dato-aviso' : ''}`}>
        <dt><AlertTriangle size={13} aria-hidden="true" /> Para reforzar</dt>
        <dd>{resumen.conAviso}<span className="fam-dato-de"> {resumen.conAviso === 1 ? 'materia' : 'materias'}</span></dd>
      </div>
      <div className={`fam-dato${resumen.aDiciembre > 0 ? ' fam-dato-riesgo' : ''}`}>
        <dt><CalendarX2 size={13} aria-hidden="true" /> A diciembre</dt>
        <dd>{resumen.aDiciembre}<span className="fam-dato-de"> {resumen.aDiciembre === 1 ? 'materia' : 'materias'}</span></dd>
      </div>
    </dl>
  );
}
