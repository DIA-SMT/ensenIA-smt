/**
 * Notas publicadas de un estudiante, agrupadas por trimestre.
 * Lo comparten el portal del estudiante y el de la familia: la misma
 * información, sin interpretaciones distintas según quién mire.
 */

import { useEffect, useState } from 'react';
import { BookMarked, AlertTriangle } from 'lucide-react';
import { getPublishedGradesByStudent } from '../services/gradebook.service';
import type { TermGrade, AlertThresholds } from '../types';

interface GradesPanelProps {
  studentId: string;
  thresholds: Pick<AlertThresholds, 'gradeRiskMax' | 'gradeFailMax'>;
  /** El estudiante se ve a sí mismo; la familia mira a su hijo/a. */
  voice: 'propia' | 'familia';
}

export default function GradesPanel({ studentId, thresholds, voice }: GradesPanelProps) {
  const [grades, setGrades] = useState<TermGrade[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublishedGradesByStudent(studentId)
      .then(g => { if (!cancelled) setGrades(g); })
      .catch(err => { console.error(err); if (!cancelled) setGrades([]); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (grades === null) return <p className="text-secondary text-sm">Cargando notas…</p>;

  if (grades.length === 0) {
    return (
      <p className="text-secondary text-sm">
        {voice === 'propia'
          ? 'Todavía no hay notas publicadas.'
          : 'Todavía no hay notas publicadas para este trimestre.'}
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
                    {Number.isInteger(g.grade) ? g.grade : g.grade.toFixed(1)}
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
