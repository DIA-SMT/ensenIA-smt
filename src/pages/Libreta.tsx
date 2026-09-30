/**
 * SMT EstudIA — Libreta (docente)
 *
 * Dos herramientas en una pantalla:
 *  - "Notas" y "Temario y criterios": la libreta de calificaciones por
 *    trimestre. La plataforma sugiere, el docente decide; al publicar corre
 *    la regla 5/4 en el servidor (aviso a la familia y señal a dirección).
 *  - "Boletín y informes": el boletín con conducta, observación e
 *    inasistencias (grilla que se llena con el teclado, guarda sola), la
 *    libreta del curso y el informe de actividad de cada estudiante en PDF.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  BookMarked, Sparkles, Send, Save, AlertTriangle, Info, CheckCircle, BookOpen,
  NotebookText, Download, Check, Loader2, FileText, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import { getTerms, ensureTerms, pickCurrentTerm, getGradebook, saveGrades } from '../services/gradebook.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import {
  getGradesForCourse, upsertGrade, yearSummary, getAbsencesByTermForCourse,
  CONDUCT_META, TERM_LABELS, type Conduct, type ReportGrade,
} from '../services/libreta.service';
import { getStudentTrace, TRACE_META } from '../services/informes.service';
import { libretaToPdf, informeToPdf, type LibretaRow } from '../lib/pdf';
import type {
  AcademicTerm, GradebookRow, Subject, SubjectAssignment, AlertThresholds, Student,
} from '../types';
import TemarioEditor from '../components/TemarioEditor';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import '../components/Modals.css';
import './Students.css';
import './Libreta.css';

const YEAR = new Date().getFullYear();
const TERMS: number[] = [1, 2, 3, 4, 5];

type Draft = { grade: string; conduct: Conduct | null; comment: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const keyOf = (studentId: string, term: number) => `${studentId}:${term}`;

/** Boletín por trimestre (1-3 + diciembre/febrero): grilla con teclado, conducta, observación,
 *  inasistencias, libreta del curso e informes de actividad en PDF. Guarda en report_grades. */
function BoletinTeclado() {
    const { user } = useAuth();
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [term, setTerm] = useState(1);
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<ReportGrade[]>([]);
    const [absences, setAbsences] = useState<Record<string, [number, number, number]>>({});
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
    const [loading, setLoading] = useState(true);
    const [informeFor, setInformeFor] = useState<string | null>(null);

    const assignments = user?.subjects ?? [];
    const assignment = assignments[assignmentIdx];

    useEffect(() => {
        if (!user) return;
        getSubjects(user.schoolId).then(list => {
            const map: Record<string, Subject> = {};
            list.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, [user?.schoolId]);

    // Curso + notas + inasistencias de la materia elegida
    useEffect(() => {
        if (!assignment) return;
        setLoading(true);
        Promise.all([
            getEnrolledStudents(assignment.subjectId, assignment.courseId),
            getGradesForCourse(assignment.subjectId, assignment.courseId, YEAR),
            getAbsencesByTermForCourse(assignment.courseId, YEAR),
        ]).then(([studs, gs, abs]) => {
            setStudents(studs);
            setGrades(gs);
            setAbsences(abs);
            // Los borradores arrancan con lo guardado
            const d: Record<string, Draft> = {};
            for (const g of gs) {
                d[keyOf(g.studentId, g.term)] = {
                    grade: g.grade != null ? String(g.grade) : '',
                    conduct: g.conduct,
                    comment: g.comment ?? '',
                };
            }
            setDrafts(d);
            setSaveStates({});
        }).catch(console.error).finally(() => setLoading(false));
    }, [assignment?.subjectId, assignment?.courseId]);

    const gradesByStudent = useMemo(() => {
        const map = new Map<string, ReportGrade[]>();
        for (const g of grades) {
            const arr = map.get(g.studentId) ?? [];
            arr.push(g);
            map.set(g.studentId, arr);
        }
        return map;
    }, [grades]);

    if (!user) return null;

    const subjectName = assignment ? (subjectsMap[assignment.subjectId]?.name ?? 'Materia') : '';
    const isApoyo = term >= 4; // diciembre/febrero: solo nota

    const draftFor = (studentId: string): Draft =>
        drafts[keyOf(studentId, term)] ?? { grade: '', conduct: null, comment: '' };

    const setDraft = (studentId: string, patch: Partial<Draft>) => {
        const k = keyOf(studentId, term);
        setDrafts(prev => ({ ...prev, [k]: { ...draftFor(studentId), ...patch } }));
    };

    /** Guarda la fila al salir del campo. Vacío = borra la nota. */
    const saveRow = async (studentId: string, patch: Partial<Draft> = {}) => {
        if (!assignment) return;
        const d = { ...draftFor(studentId), ...patch };
        const k = keyOf(studentId, term);

        const grade = d.grade.trim() === '' ? null : Number(d.grade.replace(',', '.'));
        if (grade !== null && (Number.isNaN(grade) || grade < 1 || grade > 10)) {
            setSaveStates(prev => ({ ...prev, [k]: 'error' }));
            return;
        }
        setSaveStates(prev => ({ ...prev, [k]: 'saving' }));
        try {
            await upsertGrade({
                studentId,
                subjectId: assignment.subjectId,
                courseId: assignment.courseId,
                teacherId: user.id,
                schoolYear: YEAR,
                term,
                grade,
                conduct: d.conduct,
                comment: d.comment.trim() || null,
            });
            setGrades(prev => {
                const rest = prev.filter(g => !(g.studentId === studentId && g.term === term));
                return [...rest, {
                    id: k, studentId, subjectId: assignment.subjectId, courseId: assignment.courseId,
                    schoolYear: YEAR, term, grade, conduct: d.conduct, comment: d.comment.trim() || null,
                }];
            });
            setSaveStates(prev => ({ ...prev, [k]: 'saved' }));
            setTimeout(() => setSaveStates(prev => (prev[k] === 'saved' ? { ...prev, [k]: 'idle' } : prev)), 1800);
        } catch (err) {
            console.error(err);
            setSaveStates(prev => ({ ...prev, [k]: 'error' }));
        }
    };

    const handleConduct = (studentId: string, c: Conduct) => {
        const current = draftFor(studentId).conduct;
        const next = current === c ? null : c;
        setDraft(studentId, { conduct: next });
        saveRow(studentId, { conduct: next });
    };

    /** Enter en la nota → guarda y salta a la nota de la fila siguiente. */
    const handleGradeKey = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
        if (e.key !== 'Enter') return;
        (e.target as HTMLInputElement).blur();
        const next = document.querySelector<HTMLInputElement>(`input[data-grade-idx="${idx + 1}"]`);
        next?.focus();
    };

    const handleDownloadLibreta = () => {
        if (!assignment) return;
        const rows: LibretaRow[] = students.map(st => {
            const gs = gradesByStudent.get(st.id) ?? [];
            const byTerm = new Map(gs.map(g => [g.term, g]));
            const abs = absences[st.id] ?? [0, 0, 0];
            const sum = yearSummary(gs);
            const cell = (t: 1 | 2 | 3) => {
                const g = byTerm.get(t);
                return {
                    nota: g?.grade != null ? String(g.grade) : '—',
                    cond: g?.conduct ? CONDUCT_META[g.conduct].short : '—',
                    inas: String(abs[t - 1] ?? 0),
                };
            };
            const [c1, c2, c3] = [cell(1), cell(2), cell(3)];
            const estado = sum.status === 'aprobado' ? 'Aprobado'
                : sum.status === 'diciembre' ? 'A diciembre'
                : sum.status === 'febrero' ? 'A febrero'
                : sum.status === 'pendiente' ? 'Pendiente'
                : 'Incompleto';
            return {
                student: `${st.lastName}, ${st.firstName}`,
                t1: c1.nota, c1: c1.cond, a1: c1.inas,
                t2: c2.nota, c2: c2.cond, a2: c2.inas,
                t3: c3.nota, c3: c3.cond, a3: c3.inas,
                promedio: sum.average != null ? String(sum.average) : '—',
                estado,
            };
        });
        libretaToPdf(rows, {
            subjectName,
            courseName: assignment.courseName,
            year: YEAR,
            teacherName: `${user.firstName} ${user.lastName}`,
        });
    };

    /** Informe de actividad de un estudiante en esta materia (PDF). */
    const handleInforme = async (st: Student, global: boolean) => {
        if (!assignment || informeFor) return;
        setInformeFor(st.id);
        try {
            const trace = await getStudentTrace(st.id, global ? undefined : assignment.subjectId);
            const stats = [
                { label: 'Entregas', value: String(trace.stats.entregas) },
                { label: 'Calificadas', value: String(trace.stats.calificadas) },
                { label: 'Respuestas en vivo', value: String(trace.stats.respuestasVivo) },
                { label: 'Conexiones en vivo', value: String(trace.stats.conexionesVivo) },
                ...(global ? [
                    { label: 'Check-ins', value: String(trace.stats.checkins) },
                    { label: 'Logros', value: String(trace.stats.logros) },
                    { label: 'Inasistencias', value: String(trace.stats.inasistencias) },
                ] : []),
            ];
            informeToPdf(
                `${st.firstName} ${st.lastName}`,
                global ? `Global · ${st.courseName}` : `${subjectName} · ${st.courseName}`,
                stats,
                trace.events.slice(0, 80),
            );
        } catch (err) {
            console.error(err);
            alert('No se pudo generar el informe. Probá de nuevo.');
        } finally {
            setInformeFor(null);
        }
    };

    return (
        <div className="lib-container animate-in">
            <div className="card lib-header">
                <div className="lib-header-text">
                    <h3><NotebookText size={17} className="text-cyan" /> Libreta digital {YEAR}</h3>
                    <p className="text-sm text-secondary">
                        Escala 1-10, se aprueba con 6. Se guarda solo al salir de cada campo.
                    </p>
                </div>
                <div className="lib-header-controls">
                    <select
                        className="form-select"
                        value={assignmentIdx}
                        onChange={e => setAssignmentIdx(Number(e.target.value))}
                        aria-label="Materia y curso"
                    >
                        {assignments.map((a, i) => (
                            <option key={i} value={i}>
                                {subjectsMap[a.subjectId]?.name ?? 'Materia'} — {a.courseName}
                            </option>
                        ))}
                    </select>
                    <button className="btn btn-outline btn-sm" onClick={handleDownloadLibreta} disabled={students.length === 0}>
                        <Download size={14} /> Libreta (PDF)
                    </button>
                </div>
            </div>

            <div className="lib-terms" role="tablist" aria-label="Trimestre">
                {TERMS.map(t => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={term === t}
                        className={`lib-term ${term === t ? 'active' : ''} ${t >= 4 ? 'apoyo' : ''}`}
                        onClick={() => setTerm(t)}
                    >
                        {TERM_LABELS[t]}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-secondary p-6">Cargando el curso...</p>
            ) : students.length === 0 ? (
                <div className="card p-6"><p className="text-secondary">No hay estudiantes en este curso.</p></div>
            ) : (
                <div className="card lib-table-card">
                    <table className="lib-table">
                        <thead>
                            <tr>
                                <th>Estudiante</th>
                                <th className="lib-th-nota">Nota</th>
                                {!isApoyo && <th>Conducta</th>}
                                {!isApoyo && <th className="lib-th-obs">Observación (opcional)</th>}
                                {!isApoyo && <th title="Inasistencias del trimestre (de Pasar lista)">Inas.</th>}
                                <th>Año</th>
                                <th title="Informe de actividad">Informe</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((st, idx) => {
                                const d = draftFor(st.id);
                                const k = keyOf(st.id, term);
                                const state = saveStates[k] ?? 'idle';
                                const gs = gradesByStudent.get(st.id) ?? [];
                                const byTerm = new Map(gs.map(g => [g.term, g.grade]));
                                const sum = yearSummary(gs);
                                const abs = absences[st.id] ?? [0, 0, 0];
                                return (
                                    <tr key={st.id}>
                                        <td className="lib-student">
                                            {st.lastName}, {st.firstName}
                                            {state === 'saving' && <Loader2 size={12} className="spin lib-state" />}
                                            {state === 'saved' && <Check size={13} className="lib-state text-success" />}
                                            {state === 'error' && <AlertCircle size={13} className="lib-state text-danger" />}
                                        </td>
                                        <td>
                                            <input
                                                className={`lib-grade ${d.grade && (Number(d.grade.replace(',', '.')) < 6) ? 'low' : ''}`}
                                                inputMode="decimal"
                                                placeholder="—"
                                                maxLength={5}
                                                value={d.grade}
                                                data-grade-idx={idx}
                                                aria-label={`Nota de ${st.firstName} ${st.lastName}`}
                                                onChange={e => setDraft(st.id, { grade: e.target.value })}
                                                onBlur={() => saveRow(st.id)}
                                                onKeyDown={e => handleGradeKey(e, idx)}
                                            />
                                        </td>
                                        {!isApoyo && (
                                            <td>
                                                <div className="lib-conduct" role="group" aria-label="Conducta">
                                                    {(Object.entries(CONDUCT_META) as [Conduct, typeof CONDUCT_META[Conduct]][]).map(([c, meta]) => (
                                                        <button
                                                            key={c}
                                                            className={`lib-conduct-btn ${d.conduct === c ? 'on' : ''}`}
                                                            title={meta.label}
                                                            onClick={() => handleConduct(st.id, c)}
                                                        >
                                                            {meta.short}
                                                        </button>
                                                    ))}
                                                </div>
                                            </td>
                                        )}
                                        {!isApoyo && (
                                            <td>
                                                <input
                                                    className="lib-comment"
                                                    placeholder="..."
                                                    maxLength={200}
                                                    value={d.comment}
                                                    aria-label={`Observación de ${st.firstName} ${st.lastName}`}
                                                    onChange={e => setDraft(st.id, { comment: e.target.value })}
                                                    onBlur={() => saveRow(st.id)}
                                                />
                                            </td>
                                        )}
                                        {!isApoyo && (
                                            <td className="lib-abs">{term <= 3 ? (abs[term - 1] ?? 0) : ''}</td>
                                        )}
                                        <td className="lib-year">
                                            <span className="lib-year-terms" title="Notas de los tres trimestres">
                                                {[1, 2, 3].map(t => (
                                                    <em key={t} className={t === term ? 'now' : ''}>{byTerm.get(t) ?? '·'}</em>
                                                ))}
                                            </span>
                                            {sum.average != null && (
                                                <span
                                                    className={`badge ${sum.status === 'aprobado' ? 'badge-success' : 'badge-warning'}`}
                                                    title={`Promedio ${sum.average}`}
                                                >
                                                    {sum.status === 'aprobado' ? `✓ ${sum.average}`
                                                        : sum.status === 'diciembre' ? `${sum.average} → Dic`
                                                        : sum.status === 'febrero' ? `${sum.average} → Feb`
                                                        : sum.average}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="lib-informe">
                                                <button
                                                    className="btn-icon"
                                                    title={`Informe de ${st.firstName} en ${subjectName} (PDF)`}
                                                    aria-label={`Informe de ${st.firstName} por materia`}
                                                    disabled={informeFor !== null}
                                                    onClick={() => handleInforme(st, false)}
                                                >
                                                    {informeFor === st.id ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
                                                </button>
                                                <button
                                                    className="lib-informe-global"
                                                    title={`Informe global de ${st.firstName}: actividades, clase en vivo, check-ins, logros y asistencia (PDF)`}
                                                    disabled={informeFor !== null}
                                                    onClick={() => handleInforme(st, true)}
                                                >
                                                    global
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="lib-hint text-xs text-subtle">
                        {isApoyo
                            ? `${TERM_LABELS[term]}: solo va la nota de la instancia de apoyo (quien no llegó a 6 de promedio).`
                            : <>Enter salta al siguiente estudiante. Conducta: {Object.values(CONDUCT_META).map(m => `${m.short} = ${m.label}`).join(' · ')}. Las inasistencias salen solas de Pasar lista. {TRACE_META.entrega.emoji} El informe junta todo lo trazado: entregas, clase en vivo, conexiones y más.</>}
                    </p>
                </div>
            )}
        </div>
    );
}

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
  const [tab, setTab] = useState<'notas' | 'temario' | 'boletin'>('notas');

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
          {tab !== 'boletin' && (
          <div className="card libreta-toolbar">
            <div className="libreta-field">
              <label htmlFor="libreta-materia">Materia y curso</label>
              <select
                id="libreta-materia"
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
              <label htmlFor="libreta-trimestre">Trimestre</label>
              <select id="libreta-trimestre" className="form-select" value={termId} onChange={e => setTermId(e.target.value)}>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {/* Contadores de notas: en la pestaña Temario no dicen nada
                sobre lo que el docente está mirando. */}
            {tab === 'notas' && (
              <div className="libreta-counters">
                <span className="badge badge-neutral">{conNota}/{rows.length} con nota</span>
                {publicadas > 0 && <span className="badge badge-success"><CheckCircle size={11} /> {publicadas} publicadas</span>}
                {aDiciembre > 0 && <span className="badge badge-danger">{aDiciembre} a diciembre</span>}
              </div>
            )}
          </div>
          )}

          <div className="libreta-tabs">
            <button
              className={`libreta-tab ${tab === 'notas' ? 'active' : ''}`}
              onClick={() => setTab('notas')}
            >
              <BookMarked size={14} /> Notas
            </button>
            <button
              className={`libreta-tab ${tab === 'temario' ? 'active' : ''}`}
              onClick={() => setTab('temario')}
            >
              <BookOpen size={14} /> Temario y criterios
            </button>
            <button
              className={`libreta-tab ${tab === 'boletin' ? 'active' : ''}`}
              onClick={() => setTab('boletin')}
            >
              <NotebookText size={14} /> Boletín y informes
            </button>
          </div>

          {tab === 'boletin' && <BoletinTeclado />}

          {tab === 'temario' && assignment && term && (
            <TemarioEditor
              teacherId={user.id}
              schoolId={user.schoolId}
              subjectId={assignment.subjectId}
              courseId={assignment.courseId}
              term={term}
              terms={terms}
            />
          )}

          {tab !== 'boletin' && error && <div className="em-error">{error}</div>}
          {tab !== 'boletin' && okMsg && <div className="libreta-ok"><CheckCircle size={14} /> {okMsg}</div>}

          {tab === 'notas' && loading && <p className="text-secondary p-6">Cargando libreta…</p>}

          {tab === 'notas' && !loading && rows.length === 0 && (
            <div className="card acts-empty">
              <p className="text-secondary">Este curso todavía no tiene estudiantes.</p>
            </div>
          )}

          {tab === 'notas' && !loading && rows.length > 0 && (
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
                            aria-label={`Nota del trimestre de ${r.firstName} ${r.lastName}`}
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
