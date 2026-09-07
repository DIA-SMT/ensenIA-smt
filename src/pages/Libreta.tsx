/**
 * ENSEÑIA SMT — Libreta de calificaciones (docente)
 *
 * El trabajo del trimestre se traduce en nota: la plataforma sugiere,
 * el docente decide. Al publicar corre la regla 5/4 en el servidor —
 * la familia recibe el aviso y dirección ve la señal.
 */

import { useState, useEffect, useMemo } from 'react';
import { BookMarked, Sparkles, Send, Save, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import { getTerms, ensureTerms, pickCurrentTerm, getGradebook, saveGrades } from '../services/gradebook.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import type {
  AcademicTerm, GradebookRow, Subject, SubjectAssignment, AlertThresholds,
} from '../types';
import './Libreta.css';

export default function Libreta() {
  const { user } = useAuth();
  const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState<string>('');
  const [assignmentIdx, setAssignmentIdx] = useState(0);
  const [rows, setRows] = useState<GradebookRow[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const assignments: SubjectAssignment[] = useMemo(() => user?.subjects ?? [], [user]);
  const assignment = assignments[assignmentIdx];
  const term = terms.find(t => t.id === termId) ?? null;

  // Carga inicial: materias, trimestres y umbrales de la escuela.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const year = new Date().getFullYear();
    Promise.all([
      getSubjects(user.schoolId),
      // Si el año (o la escuela) todavía no tiene trimestres, se crean:
      // sin esto la libreta quedaría inutilizable cada 1° de enero.
      getTerms(user.schoolId, year).then(ts => ts.length > 0 ? ts : ensureTerms(user.schoolId, year)),
      getThresholds(user.schoolId).catch(() => ({ schoolId: user.schoolId, ...DEFAULT_THRESHOLDS })),
    ]).then(([subs, ts, th]) => {
      if (cancelled) return;
      const map: Record<string, Subject> = {};
      subs.forEach(s => { map[s.id] = s; });
      setSubjectsMap(map);
      setTerms(ts);
      setThresholds(th);
      // Los trimestres son de esta escuela: elegir siempre dentro de ts,
      // nunca conservar un id de una sesión anterior.
      setTermId(prev => (ts.some(t => t.id === prev) ? prev : pickCurrentTerm(ts)?.id ?? ''));
      if (ts.length === 0) {
        setError('La escuela no tiene trimestres cargados para este año. Pedile a dirección que los configure.');
        setLoading(false);
      }
    }).catch(err => {
      if (cancelled) return;
      console.error(err);
      setError('No se pudo cargar la libreta.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  // Libreta de la materia+curso+trimestre elegidos.
  useEffect(() => {
    if (!user) return;
    // Sin materia o sin trimestre no hay nada que cargar: apagar el
    // "Cargando…" en vez de dejar la página colgada para siempre.
    if (!assignment || !term) {
      setLoading(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOkMsg('');
    // La nómina son los INSCRIPTOS en esa materia+curso: es exactamente
    // el conjunto que la RLS deja calificar (enrollments), así que la
    // libreta no muestra a nadie que después no se pueda guardar.
    getEnrolledStudents(assignment.subjectId, assignment.courseId)
      .then(students => getGradebook({
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        term,
        students,
        teacherId: user.id,
      }))
      .then(r => { if (!cancelled) setRows(r); })
      .catch(err => { console.error(err); if (!cancelled) setError('No se pudo cargar la libreta.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, assignment?.subjectId, assignment?.courseId, term?.id]);

  if (!user) return null;

  const setGrade = (studentId: string, value: string) => {
    const n = value === '' ? null : Number(value);
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, grade: n } : r));
    setOkMsg('');
  };

  const applySuggestions = () => {
    setRows(prev => prev.map(r => r.grade === null && r.suggestedGrade !== null
      ? { ...r, grade: r.suggestedGrade }
      : r));
    setOkMsg('');
  };

  const gradeClass = (g: number | null): string => {
    if (g === null || !thresholds) return '';
    if (g <= thresholds.gradeFailMax) return 'grade-fail';
    if (g <= thresholds.gradeRiskMax) return 'grade-risk';
    return 'grade-ok';
  };

  const persist = async (status: 'borrador' | 'publicada') => {
    if (!assignment || !term) return;
    const invalid = rows.find(r => r.grade !== null && (r.grade < 1 || r.grade > 10));
    if (invalid) {
      setError(`La nota de ${invalid.firstName} ${invalid.lastName} debe estar entre 1 y 10.`);
      return;
    }
    const conNota = rows.filter(r => r.grade !== null);
    if (status === 'publicada' && conNota.length === 0) {
      setError('Cargá al menos una nota antes de publicar.');
      return;
    }
    if (status === 'publicada') {
      const enRiesgo = conNota.filter(r => thresholds && r.grade! <= thresholds.gradeRiskMax).length;
      const msg = enRiesgo > 0
        ? `Vas a publicar ${conNota.length} nota${conNota.length !== 1 ? 's' : ''}. ${enRiesgo} ${enRiesgo !== 1 ? 'están' : 'está'} en riesgo: se avisa automáticamente a esas familias. ¿Confirmás?`
        : `Vas a publicar ${conNota.length} nota${conNota.length !== 1 ? 's' : ''}. Las van a ver estudiantes y familias. ¿Confirmás?`;
      if (!window.confirm(msg)) return;
    }

    setBusy(true);
    setError('');
    try {
      // Se mandan las filas con nota Y las que ya existían pero quedaron
      // vacías: borrar una nota tiene que limpiarla en la base, no dejar
      // la vieja viva detrás de un input vacío.
      const aGuardar = rows.filter(r => r.grade !== null || r.gradeId !== null);
      await saveGrades({
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        termId: term.id,
        schoolId: user.schoolId,
        status,
        rows: aGuardar.map(r => ({
          gradeId: r.gradeId,
          studentId: r.studentId,
          grade: r.grade,
          suggestedGrade: r.suggestedGrade,
          suggestedFrom: r.suggestedFrom,
          teacherNote: r.teacherNote,
          currentStatus: r.status,
        })),
      });
      setOkMsg(status === 'publicada' ? 'Notas publicadas. Las familias en riesgo ya fueron avisadas.' : 'Borrador guardado.');
      // Releer para traer ids, estado y lo que selló el servidor.
      const students = await getEnrolledStudents(assignment.subjectId, assignment.courseId);
      setRows(await getGradebook({
        subjectId: assignment.subjectId, courseId: assignment.courseId,
        term, students, teacherId: user.id,
      }));
    } catch (err) {
      console.error(err);
      // El guardado no es atómico (un insert + N updates): puede haber
      // quedado a medias, así que no se promete que no se guardó nada.
      setError('Se cortó el guardado y puede haber quedado incompleto. Recargá la libreta para ver qué se guardó antes de reintentar.');
      // Releer para que la pantalla muestre el estado real, no el editado.
      try {
        const students = await getEnrolledStudents(assignment.subjectId, assignment.courseId);
        setRows(await getGradebook({
          subjectId: assignment.subjectId, courseId: assignment.courseId,
          term, students, teacherId: user.id,
        }));
      } catch { /* si tampoco se puede releer, queda el mensaje */ }
    } finally {
      setBusy(false);
    }
  };

  const conNota = rows.filter(r => r.grade !== null).length;
  const publicadas = rows.filter(r => r.status === 'publicada').length;
  const aDiciembre = rows.filter(r => r.carriesToDecember).length;

  return (
    <div className="libreta-container animate-in">
      <header className="libreta-header">
        <div>
          <h2 className="flex items-center gap-2"><BookMarked size={22} className="text-cyan" /> Libreta</h2>
          <p className="text-secondary text-sm">
            La plataforma sugiere una nota con el trabajo del trimestre. Vos decidís.
          </p>
        </div>
      </header>

      {assignments.length === 0 && (
        <div className="card acts-empty">
          <BookMarked size={32} className="text-secondary" />
          <p className="text-secondary">No tenés materias asignadas todavía.</p>
        </div>
      )}

      {assignments.length > 0 && (
        <>
          <div className="card libreta-toolbar">
            <div className="libreta-field">
              <label>Materia y curso</label>
              <select
                className="form-select"
                value={assignmentIdx}
                onChange={e => setAssignmentIdx(Number(e.target.value))}
              >
                {assignments.map((a, i) => (
                  <option key={`${a.subjectId}-${a.courseId}`} value={i}>
                    {subjectsMap[a.subjectId]?.name ?? 'Materia'} — {a.courseName}
                  </option>
                ))}
              </select>
            </div>
            <div className="libreta-field">
              <label>Trimestre</label>
              <select className="form-select" value={termId} onChange={e => setTermId(e.target.value)}>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="libreta-counters">
              <span className="badge badge-neutral">{conNota}/{rows.length} con nota</span>
              {publicadas > 0 && <span className="badge badge-success"><CheckCircle size={11} /> {publicadas} publicadas</span>}
              {aDiciembre > 0 && <span className="badge badge-danger">{aDiciembre} a diciembre</span>}
            </div>
          </div>

          {error && <div className="em-error">{error}</div>}
          {okMsg && <div className="libreta-ok"><CheckCircle size={14} /> {okMsg}</div>}

          {loading && <p className="text-secondary p-6">Cargando libreta…</p>}

          {!loading && rows.length === 0 && (
            <div className="card acts-empty">
              <p className="text-secondary">Este curso todavía no tiene estudiantes.</p>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="card">
              <div className="table-responsive">
                <table className="modern-table libreta-table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      <th title="Calculada con las entregas de tus actividades del trimestre">Sugerida</th>
                      <th>Nota del trimestre</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.studentId}>
                        <td>
                          <div className="student-cell">
                            <div className="student-avatar">{r.avatarInitials}</div>
                            <span className="font-medium">{r.firstName} {r.lastName}</span>
                          </div>
                        </td>
                        <td>
                          {r.suggestedGrade !== null ? (
                            <span
                              className="libreta-suggested"
                              title={`Promedio de ${r.suggestedFrom} entrega${r.suggestedFrom !== 1 ? 's' : ''} calificada${r.suggestedFrom !== 1 ? 's' : ''} de TUS actividades en este trimestre`}
                            >
                              <Sparkles size={12} /> {r.suggestedGrade.toFixed(1)}
                              <span className="text-subtle text-xs"> ({r.suggestedFrom})</span>
                            </span>
                          ) : (
                            <span className="text-subtle text-sm" title="No hay entregas calificadas de tus actividades en este trimestre">—</span>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`libreta-input ${gradeClass(r.grade)}`}
                            min={1}
                            max={10}
                            step={0.5}
                            value={r.grade ?? ''}
                            placeholder="—"
                            onChange={e => setGrade(r.studentId, e.target.value)}
                          />
                        </td>
                        <td>
                          {r.carriesToDecember && (
                            <span className="badge badge-danger" title="Se lleva la materia a diciembre">
                              <AlertTriangle size={11} /> A diciembre
                            </span>
                          )}
                          {!r.carriesToDecember && r.status === 'publicada' && (
                            <span className="badge badge-success">Publicada</span>
                          )}
                          {r.status === 'borrador' && r.gradeId && (
                            <span className="badge badge-neutral">Borrador</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="libreta-actions">
                <button className="btn btn-outline btn-sm" onClick={applySuggestions} disabled={busy}>
                  <Sparkles size={14} /> Usar sugeridas donde falta
                </button>
                <div className="libreta-actions-right">
                  <button className="btn btn-outline btn-sm" onClick={() => persist('borrador')} disabled={busy}>
                    <Save size={14} /> {busy ? 'Guardando…' : 'Guardar borrador'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => persist('publicada')} disabled={busy}>
                    <Send size={14} /> Publicar trimestre
                  </button>
                </div>
              </div>

              {thresholds && (
                <p className="libreta-rule">
                  <Info size={13} />
                  Al publicar: nota <b>{thresholds.gradeRiskMax}</b> o menos avisa a la familia;
                  <b> {thresholds.gradeFailMax}</b> o menos marca que la materia se lleva a diciembre.
                  Dirección puede ajustar estos valores en Alertas.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
