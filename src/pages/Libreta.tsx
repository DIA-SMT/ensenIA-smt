/**
 * SMT EstudIA — Libreta digital (docente)
 *
 * La tarea administrativa real: cargar las notas del trimestre. Una
 * grilla que se llena con el teclado (Enter baja al siguiente), guarda
 * sola al salir del campo y muestra al lado lo que ya está cargado de
 * los otros trimestres, el promedio y el estado anual según el régimen
 * de Tucumán (1-10, se aprueba con 6, diciembre y febrero de apoyo).
 * De acá también salen la libreta del curso y el informe de actividad
 * de cada estudiante, en PDF.
 */

import { useState, useEffect, useMemo } from 'react';
import {
    NotebookText, Download, Check, Loader2, FileText, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import {
    getGradesForCourse, upsertGrade, yearSummary, getAbsencesByTermForCourse,
    CONDUCT_META, TERM_LABELS, type Conduct, type ReportGrade,
} from '../services/libreta.service';
import { getStudentTrace, TRACE_META } from '../services/informes.service';
import { libretaToPdf, informeToPdf, type LibretaRow } from '../lib/pdf';
import type { Subject, Student } from '../types';
import './Libreta.css';

const YEAR = new Date().getFullYear();
const TERMS: number[] = [1, 2, 3, 4, 5];

type Draft = { grade: string; conduct: Conduct | null; comment: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const keyOf = (studentId: string, term: number) => `${studentId}:${term}`;

export default function Libreta() {
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
        getSubjects().then(list => {
            const map: Record<string, Subject> = {};
            list.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, []);

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
