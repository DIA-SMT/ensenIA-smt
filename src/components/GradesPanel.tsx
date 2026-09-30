/**
 * Notas publicadas de un estudiante, agrupadas por trimestre.
 * Lo comparten el portal del estudiante y el de la familia: la misma
 * información, sin interpretaciones distintas según quién mire.
 */

import { useEffect, useState } from 'react';
import { BookMarked, AlertTriangle } from 'lucide-react';
import { getPublishedGradesByStudent } from '../services/gradebook.service';
import { formatoNota } from '../lib/resumenNotas';
import type { TermGrade, AlertThresholds } from '../types';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import '../pages/Libreta.css';

interface GradesPanelProps {
  studentId: string;
  thresholds: Pick<AlertThresholds, 'gradeRiskMax' | 'gradeFailMax'>;
  /** El estudiante se ve a sí mismo; la familia mira a su hijo/a. */
  voice: 'propia' | 'familia';
  /** Para quien quiera resumir las mismas notas sin volver a pedirlas. */
  alCargar?: (notas: TermGrade[]) => void;
}

export default function GradesPanel({ studentId, thresholds, voice, alCargar }: GradesPanelProps) {
  const [grades, setGrades] = useState<TermGrade[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFallo(false);
    getPublishedGradesByStudent(studentId)
      .then(g => { if (!cancelled) { setGrades(g); alCargar?.(g); } })
      .catch(err => { console.error(err); if (!cancelled) { setGrades([]); setFallo(true); } });
    return () => { cancelled = true; };
    // alCargar puede cambiar de identidad en cada render del padre: no
    // debe volver a pedir las notas por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (grades === null) return <p className="text-secondary text-sm" role="status">Cargando notas…</p>;

  // Un error no es "no hay notas": decirlo así haría creer que no hay nada
  // que ver cuando en realidad no se pudo consultar.
  if (fallo) {
    return <p className="text-sm text-danger" role="alert">No se pudieron traer las notas. Revisá la conexión y volvé a entrar.</p>;
  }

  if (grades.length === 0) {
    return (
      <p className="text-secondary text-sm">
        {voice === 'propia'
          ? 'Todavía no hay notas publicadas.'
          : 'Todavía no hay notas publicadas. Aparecen acá cuando sus docentes las cargan en la libreta.'}
      </p>
    );
  }

  const gradeClass = (g: number) => {
    if (g <= thresholds.gradeFailMax) return 'grade-fail';
    if (g <= thresholds.gradeRiskMax) return 'grade-risk';
    return 'grade-ok';
  };

  // Agrupar por termId, no por nombre: "2° Trimestre" de 2026 y de 2027
  // se llaman igual y no pueden caer en el mismo bloque.
  const byTerm = new Map<string, { name: string; items: TermGrade[] }>();
  for (const g of grades) {
    const entry = byTerm.get(g.termId) ?? { name: g.termName ?? 'Trimestre', items: [] };
    entry.items.push(g);
    byTerm.set(g.termId, entry);
  }

  return (
    <div className="grades-list">
      {[...byTerm.entries()].map(([termId, { name: termName, items }]) => (
        <div key={termId}>
          <p className="text-xs text-subtle" style={{ margin: '4px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <BookMarked size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            {termName}
          </p>
          <div className="grades-list">
            {items.map(g => (
              <div key={g.id} className="grade-row">
                <div className="grade-row-main">
                  <span className="grade-row-subject">{g.subjectName ?? 'Materia'}</span>
                  {g.carriesToDecember && (
                    <span className="grade-row-term text-danger">
                      <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                      Se lleva la materia a diciembre
                    </span>
                  )}
                  {g.teacherNote && <span className="grade-row-term">{g.teacherNote}</span>}
                </div>
                {g.grade !== null && (
                  <span className={`grade-pill ${gradeClass(g.grade)}`}>
                    {formatoNota(g.grade)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
