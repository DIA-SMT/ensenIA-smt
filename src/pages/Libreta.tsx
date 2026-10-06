/**
 * SMT EstudIA — Libreta (docente)
 *
 * Dos herramientas en una pantalla:
 *  - "Notas" y "Temario y criterios": la libreta de calificaciones por
 *    trimestre. La plataforma sugiere, el docente decide; al publicar corre
 *    en el servidor la regla de diciembre de la escuela (046) y el aviso a
 *    la familia y la señal a dirección.
 *  - "Boletín y informes": el boletín con conducta, observación e
 *    inasistencias (grilla que se llena con el teclado, guarda sola), la
 *    libreta del curso y el informe de actividad de cada estudiante en PDF.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  BookMarked, Sparkles, Send, Save, AlertTriangle, Info, CheckCircle, BookOpen,
  NotebookText, Download, Check, Loader2, FileText, AlertCircle, Users, CloudUpload, Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import {
  getTerms, ensureTerms, pickCurrentTerm, getGradebook, saveGrades, promedioDeNotas,
  type ColumnaLibreta, type LibretaTrimestre,
} from '../services/gradebook.service';
import { TIPOS_EVALUACION, type Evaluacion } from '../services/evaluaciones.service';
import EvaluacionEditor from '../components/EvaluacionEditor';
import { formatoNota } from '../lib/resumenNotas';
import {
  getThresholds, DEFAULT_THRESHOLDS, notaLlevaADiciembre, textoReglaDiciembre,
} from '../services/thresholds.service';
import {
  guardarBoletinResiliente, guardarNotasBorradorResiliente, pendientesDe, claveNotas, olvidarPendiente,
  subscribe as suscribirCola, type ResultadoGuardado,
} from '../services/offline-queue.service';
import { haySenial, esErrorDeRed } from '../lib/conexion';
import { useSinGuardar } from '../lib/sinGuardar';
import {
  getGradesForCourse, yearSummary, getAbsencesByTermForCourse,
  CONDUCT_META, TERM_LABELS, type Conduct, type ReportGrade,
} from '../services/libreta.service';
import { getStudentTrace, TRACE_META } from '../services/informes.service';
import { libretaToPdf, informeToPdf, type LibretaRow } from '../lib/pdf';
import type {
  AcademicTerm, GradebookRow, Subject, SubjectAssignment, AlertThresholds, Student,
} from '../types';
import TemarioEditor from '../components/TemarioEditor';
import { avisar, confirmar } from '../components/ui/avisar';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import '../components/Modals.css';
import './Students.css';
import '../components/ui/ui.css';
import './Libreta.css';

const YEAR = new Date().getFullYear();
const TERMS: number[] = [1, 2, 3, 4, 5];

type Draft = { grade: string; conduct: Conduct | null; comment: string };
/** 'pendiente': guardada en este equipo, se envía sola cuando haya señal. */
type SaveState = 'idle' | 'saving' | 'saved' | 'pendiente' | 'error';

const keyOf = (studentId: string, term: number) => `${studentId}:${term}`;

/** Boletín por trimestre (1-3 + diciembre/febrero): grilla con teclado, conducta, observación,
 *  inasistencias, libreta del curso e informes de actividad en PDF. Guarda en report_grades. */
function BoletinTeclado({ exigeTercero }: { exigeTercero: boolean }) {
    const { user } = useAuth();
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [term, setTerm] = useState(1);
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<ReportGrade[]>([]);
    const [absences, setAbsences] = useState<Record<string, [number, number, number]>>({});
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
    // Por qué no se pudo guardar cada fila en rojo
    const [errores, setErrores] = useState<Record<string, string>>({});
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
            // Lo cargado sin señal y todavía sin enviar manda sobre lo del servidor
            const enEspera = pendientesDe('boletin').filter(op =>
                op.fila.subjectId === assignment.subjectId && op.fila.courseId === assignment.courseId && op.fila.schoolYear === YEAR);
            const conPendientes = [
                ...gs.filter(g => !enEspera.some(op => op.fila.studentId === g.studentId && op.fila.term === g.term)),
                ...enEspera.map(({ fila: f }) => ({
                    id: keyOf(f.studentId, f.term), studentId: f.studentId, subjectId: f.subjectId, courseId: f.courseId,
                    schoolYear: f.schoolYear, term: f.term, grade: f.grade, conduct: f.conduct, comment: f.comment,
                })),
            ];
            setStudents(studs);
            setGrades(conPendientes);
            setAbsences(abs);
            // Los borradores arrancan con lo guardado
            const d: Record<string, Draft> = {};
            for (const g of conPendientes) {
                d[keyOf(g.studentId, g.term)] = {
                    grade: g.grade != null ? String(g.grade) : '',
                    conduct: g.conduct,
                    comment: g.comment ?? '',
                };
            }
            setDrafts(d);
            setSaveStates(Object.fromEntries(enEspera.map(op => [keyOf(op.fila.studentId, op.fila.term), 'pendiente' as SaveState])));
            setErrores({});
        }).catch(console.error).finally(() => setLoading(false));
    }, [assignment?.subjectId, assignment?.courseId]);

    // Cuando la cola manda una fila, deja de estar pendiente
    useEffect(() => suscribirCola(() => {
        const siguen = new Set(pendientesDe('boletin').map(op => keyOf(op.fila.studentId, op.fila.term)));
        setSaveStates(prev => {
            const enviadas = Object.entries(prev).filter(([k, s]) => s === 'pendiente' && !siguen.has(k));
            if (enviadas.length === 0) return prev;
            return { ...prev, ...Object.fromEntries(enviadas.map(([k]) => [k, 'idle' as SaveState])) };
        });
    }), []);

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
            setErrores(prev => ({ ...prev, [k]: 'La nota tiene que ser de 1 a 10.' }));
            return;
        }
        setSaveStates(prev => ({ ...prev, [k]: 'saving' }));
        setErrores(prev => {
            if (!(k in prev)) return prev;
            const resto = { ...prev };
            delete resto[k];
            return resto;
        });
        const st = students.find(s => s.id === studentId);
        try {
            const resultado = await guardarBoletinResiliente({
                studentId,
                subjectId: assignment.subjectId,
                courseId: assignment.courseId,
                teacherId: user.id,
                schoolYear: YEAR,
                term,
                grade,
                conduct: d.conduct,
                comment: d.comment.trim() || null,
            }, `Boletín de ${st ? `${st.firstName} ${st.lastName}` : 'un estudiante'} · ${subjectName} · ${TERM_LABELS[term]}`);
            setGrades(prev => {
                const rest = prev.filter(g => !(g.studentId === studentId && g.term === term));
                return [...rest, {
                    id: k, studentId, subjectId: assignment.subjectId, courseId: assignment.courseId,
                    schoolYear: YEAR, term, grade, conduct: d.conduct, comment: d.comment.trim() || null,
                }];
            });
            if (resultado === 'pendiente') {
                setSaveStates(prev => ({ ...prev, [k]: 'pendiente' }));
            } else {
                setSaveStates(prev => ({ ...prev, [k]: 'saved' }));
                setTimeout(() => setSaveStates(prev => (prev[k] === 'saved' ? { ...prev, [k]: 'idle' } : prev)), 1800);
            }
        } catch (err) {
            console.error(err);
            setSaveStates(prev => ({ ...prev, [k]: 'error' }));
            setErrores(prev => ({ ...prev, [k]: 'El servidor no la aceptó. Probá de nuevo.' }));
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
            const sum = yearSummary(gs, exigeTercero);
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
            avisar.error('No se pudo generar el informe', 'Probá de nuevo en un rato.');
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

            <div className="lib-terms fila-desplazable" role="tablist" aria-label="Trimestre">
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
                <Esqueleto tipo="tabla" cantidad={6} etiqueta="Cargando el curso…" />
            ) : students.length === 0 ? (
                <EstadoVacio
                    icono={Users}
                    titulo="Este curso todavía no tiene estudiantes"
                    texto="Cuando se inscriban en esta materia, aparecen acá para cargar el boletín."
                />
            ) : (
                <div className="card lib-table-card">
                    <table className="lib-table lib-table-boletin">
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
                                const sum = yearSummary(gs, exigeTercero);
                                const abs = absences[st.id] ?? [0, 0, 0];
                                return (
                                    <tr key={st.id}>
                                        <td className="lib-student">
                                            {st.lastName}, {st.firstName}
                                            {state === 'saving' && <Loader2 size={12} className="spin lib-state" />}
                                            {state === 'saved' && <Check size={13} className="lib-state text-success" />}
                                            {state === 'pendiente' && (
                                                <CloudUpload size={13} className="lib-state text-warning" role="img"
                                                    aria-label="Guardada en este equipo: se envía sola cuando haya señal">
                                                    <title>Guardada en este equipo: se envía sola cuando haya señal</title>
                                                </CloudUpload>
                                            )}
                                            {state === 'error' && (
                                                <AlertCircle size={13} className="lib-state text-danger" role="img" aria-label={errores[k] ?? 'No se pudo guardar'}>
                                                    <title>{errores[k] ?? 'No se pudo guardar'}</title>
                                                </AlertCircle>
                                            )}
                                        </td>
                                        <td data-label="Nota">
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
                                            <td data-label="Conducta">
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
                                            <td data-label="Observación">
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
                                            <td className="lib-abs" data-label="Inasistencias">{term <= 3 ? (abs[term - 1] ?? 0) : ''}</td>
                                        )}
                                        <td className="lib-year" data-label="Año">
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
                                        <td data-label="Informe">
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
                    {Object.keys(errores).length > 0 && (
                        <p className="text-sm text-danger lib-hint" role="alert">
                            <AlertCircle size={13} aria-hidden="true" /> {Object.keys(errores).length === 1 ? 'Una fila no se guardó' : `${Object.keys(errores).length} filas no se guardaron`} (en rojo): {[...new Set(Object.values(errores))].join(' ')} Tocá la nota de nuevo para reintentar.
                        </p>
                    )}
                    {Object.values(saveStates).some(s => s === 'pendiente') && (
                        <p className="text-sm text-warning lib-hint" role="status">
                            <CloudUpload size={13} aria-hidden="true" /> Las filas con la nube están guardadas en este equipo y se envían solas cuando haya señal.
                        </p>
                    )}
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

/**
 * La libreta con una evaluación puesta (nueva o corregida): su columna y la
 * nota de cada alumno, y el promedio recalculado.
 */
function conEvaluacion(lib: LibretaTrimestre, e: Evaluacion): LibretaTrimestre {
  const col: ColumnaLibreta = { id: e.id, origen: 'evaluacion', tipo: e.tipo, titulo: e.titulo, fecha: e.fecha, evaluacion: e };
  const columnas = [...lib.columnas.filter(c => c.id !== e.id), col].sort((x, y) => x.fecha.localeCompare(y.fecha));
  const filas = lib.filas.map(r => {
    const notas = { ...r.notas };
    delete notas[e.id];
    if (e.notas[r.studentId]) notas[e.id] = e.notas[r.studentId];
    const { suggested, from } = promedioDeNotas(notas);
    return { ...r, notas, suggestedGrade: suggested, suggestedFrom: from };
  });
  return { filas, columnas };
}

function sinEvaluacion(lib: LibretaTrimestre, id: string): LibretaTrimestre {
  return {
    columnas: lib.columnas.filter(c => c.id !== id),
    filas: lib.filas.map(r => {
      const notas = { ...r.notas };
      delete notas[id];
      const { suggested, from } = promedioDeNotas(notas);
      return { ...r, notas, suggestedGrade: suggested, suggestedFrom: from };
    }),
  };
}

/** "2026-10-05" → "5/10" */
const diaMes = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;

export default function Libreta() {
  const { user } = useAuth();
  const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState<string>('');
  const [assignmentIdx, setAssignmentIdx] = useState(0);
  const [rows, setRows] = useState<GradebookRow[]>([]);
  // Las evaluaciones y actividades del trimestre (una columna cada una, 050)
  const [columnas, setColumnas] = useState<ColumnaLibreta[]>([]);
  // La evaluación que se está cargando: 'nueva' o una existente
  const [editando, setEditando] = useState<Evaluacion | 'nueva' | null>(null);
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [tab, setTab] = useState<'notas' | 'temario' | 'boletin'>('notas');
  // Notas tipeadas y sin guardar: no se pierden por cambiar de materia ni por una actualización
  const [sucio, setSucio] = useState(false);
  useSinGuardar('libreta-notas', sucio);
  // Borrador guardado en este equipo, esperando señal
  const [pendiente, setPendiente] = useState(false);

  const assignments: SubjectAssignment[] = useMemo(() => user?.subjects ?? [], [user]);
  const assignment = assignments[assignmentIdx];
  const term = terms.find(t => t.id === termId) ?? null;
  const clave = assignment && term ? claveNotas(assignment.subjectId, assignment.courseId, term.id) : '';

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
      setColumnas([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setOkMsg('');
    setError('');
    setSucio(false);
    leerLibreta()
      .then(l => { if (!cancelled) { setRows(l.filas); setColumnas(l.columnas); } })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError(haySenial()
          ? 'No se pudo cargar la libreta.'
          : 'Sin conexión, y esta libreta no está guardada en este equipo. Con señal, tocá «Preparar para el aula» en Mi día y después funciona sin conexión.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, assignment?.subjectId, assignment?.courseId, term?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando la cola manda el borrador, se vuelve a leer lo que quedó en el servidor
  useEffect(() => suscribirCola(() => {
    if (!pendiente || pendientesDe('notas').some(op => op.clave === clave)) return;
    setPendiente(false);
    if (!sucio) leerLibreta().then(l => { setRows(l.filas); setColumnas(l.columnas); }).catch(console.error);
  }), [clave, pendiente, sucio]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * La libreta de la materia y el trimestre elegidos. La nómina son los
   * INSCRIPTOS en esa materia+curso: es exactamente el conjunto que la RLS
   * deja calificar (enrollments), así que no muestra a nadie que después no
   * se pueda guardar. Si hay un borrador guardado en el equipo sin enviar,
   * sus notas mandan sobre las del servidor.
   */
  async function leerLibreta(): Promise<LibretaTrimestre> {
    if (!user || !assignment || !term) return { filas: [], columnas: [] };
    const students = await getEnrolledStudents(assignment.subjectId, assignment.courseId);
    let libreta = await getGradebook({
      subjectId: assignment.subjectId, courseId: assignment.courseId, term, students, teacherId: user.id,
    });
    // Evaluaciones cargadas sin señal, todavía sin enviar: se ven igual
    for (const op of pendientesDe('evaluacion')) {
      const e = op.evaluacion;
      if (e.subjectId !== assignment.subjectId || e.courseId !== assignment.courseId || e.termId !== term.id) continue;
      libreta = conEvaluacion(libreta, {
        ...e, pendiente: true,
        notas: Object.fromEntries(e.notas.filter(n => n.ausente || n.nota !== null).map(n => [n.studentId, { nota: n.nota, ausente: n.ausente }])),
      });
    }
    const enEspera = pendientesDe('notas').find(op => op.clave === claveNotas(assignment.subjectId, assignment.courseId, term.id));
    setPendiente(!!enEspera);
    if (!enEspera) return libreta;
    const porAlumno = new Map(enEspera.rows.map(r => [r.studentId, r]));
    return {
      ...libreta,
      filas: libreta.filas.map(r => {
        const p = porAlumno.get(r.studentId);
        return p ? { ...r, grade: p.grade, teacherNote: p.teacherNote ?? r.teacherNote } : r;
      }),
    };
  }

  /** Lo que devolvió el editor: se pone en la libreta sin volver a leer (no pisa notas tipeadas). */
  const alGuardarEvaluacion = (e: Evaluacion, resultado: ResultadoGuardado) => {
    const l = conEvaluacion({ filas: rows, columnas }, e);
    setRows(l.filas);
    setColumnas(l.columnas);
    setEditando(null);
    setOkMsg(resultado === 'pendiente'
      ? `Notas de «${e.titulo}» guardadas en este equipo. Se envían solas cuando haya señal.`
      : `Notas de «${e.titulo}» guardadas. Ya las ven los alumnos y sus familias.`);
  };
  const alBorrarEvaluacion = (id: string) => {
    const l = sinEvaluacion({ filas: rows, columnas }, id);
    setRows(l.filas);
    setColumnas(l.columnas);
    setEditando(null);
    setOkMsg('Evaluación borrada.');
  };

  if (!user) return null;

  const setGrade = (studentId: string, value: string) => {
    const n = value === '' ? null : Number(value);
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, grade: n } : r));
    setOkMsg('');
    setSucio(true);
  };

  const applySuggestions = () => {
    setRows(prev => prev.map(r => r.grade === null && r.suggestedGrade !== null
      ? { ...r, grade: r.suggestedGrade }
      : r));
    setOkMsg('');
    setSucio(true);
  };

  /** Cambiar de materia o trimestre con notas sin guardar las perdería: se pregunta. */
  const cambiarSinPerder = async (cambio: () => void) => {
    if (sucio && !(await confirmar({
      titulo: 'Tenés notas sin guardar',
      mensaje: 'Si cambiás de materia o de trimestre, lo que tipeaste se pierde. Guardalo como borrador primero (funciona sin conexión).',
      accion: 'Cambiar igual',
    }))) return;
    cambio();
  };

  const gradeClass = (g: number | null): string => {
    if (g === null || !thresholds || !term) return '';
    if (notaLlevaADiciembre(g, term.number, thresholds)) return 'grade-fail';
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
    if (status === 'publicada' && !haySenial()) {
      setError('Para publicar hace falta señal: al publicar se les avisa a las familias. Guardalo como borrador (queda en este equipo) y publicalo cuando vuelva la conexión.');
      return;
    }
    if (status === 'publicada') {
      // Las que avisan a la familia: riesgo o diciembre (con la regla anual
      // el 3er trimestre avisa por debajo de 6, aunque supere la nota de riesgo)
      const enRiesgo = conNota.filter(r => thresholds && (
        r.grade! <= thresholds.gradeRiskMax || notaLlevaADiciembre(r.grade!, term.number, thresholds)
      )).length;
      const ok = await confirmar({
        titulo: `¿Publicar ${conNota.length} nota${conNota.length !== 1 ? 's' : ''} del trimestre?`,
        mensaje: enRiesgo > 0
          ? `Las van a ver estudiantes y familias. ${enRiesgo} ${enRiesgo !== 1 ? 'están' : 'está'} en riesgo: se avisa automáticamente a esas familias.`
          : 'Las van a ver estudiantes y familias.',
        accion: 'Publicar',
      });
      if (!ok) return;
    }

    setBusy(true);
    setError('');
    // Se mandan las filas con nota Y las que ya existían pero quedaron
    // vacías: borrar una nota tiene que limpiarla en la base, no dejar
    // la vieja viva detrás de un input vacío.
    const filas = rows.filter(r => r.grade !== null || r.gradeId !== null).map(r => ({
      studentId: r.studentId,
      grade: r.grade,
      suggestedGrade: r.suggestedGrade,
      suggestedFrom: r.suggestedFrom,
      teacherNote: r.teacherNote,
    }));
    try {
      if (status === 'borrador') {
        const resultado = await guardarNotasBorradorResiliente({
          subjectId: assignment.subjectId,
          courseId: assignment.courseId,
          termId: term.id,
          rows: filas,
          descripcion: `Notas en borrador · ${subjectsMap[assignment.subjectId]?.name ?? 'Materia'} ${assignment.courseName} · ${term.name}`,
        });
        setSucio(false);
        if (resultado === 'pendiente') {
          // Quedó en el equipo: la pantalla ya muestra lo guardado
          setPendiente(true);
          setOkMsg('Borrador guardado en este equipo. Se envía solo cuando haya señal; para publicar hace falta conexión.');
          return;
        }
        setOkMsg('Borrador guardado.');
      } else {
        // Publicar va siempre directo: les avisa a las familias
        await saveGrades({ subjectId: assignment.subjectId, courseId: assignment.courseId, termId: term.id, status, rows: filas });
        // Un borrador viejo esperando en el equipo ya no corresponde
        olvidarPendiente(claveNotas(assignment.subjectId, assignment.courseId, term.id));
        setPendiente(false);
        setSucio(false);
        setOkMsg('Notas publicadas. Las familias en riesgo ya fueron avisadas.');
      }
      // Releer para traer ids, estado y lo que selló el servidor.
      const l = await leerLibreta();
      setRows(l.filas);
      setColumnas(l.columnas);
    } catch (err) {
      console.error(err);
      // Se guarda todo junto o nada (047): lo tipeado sigue en pantalla, intacto.
      setError(esErrorDeRed(err)
        ? 'No se pudo publicar: se cortó la señal y no se guardó ninguna nota. Siguen acá: guardalas como borrador (quedan en este equipo) y publicá cuando vuelva la conexión.'
        : 'El servidor no aceptó las notas y no se guardó ninguna. Siguen acá: probá de nuevo; si sigue pasando, avisá a dirección.');
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
          {/* El título ("Libreta") ya está en la barra de arriba */}
          <p className="text-secondary">
            La plataforma sugiere una nota con el trabajo del trimestre. Vos decidís.
          </p>
        </div>
      </header>

      {assignments.length === 0 && (
        <EstadoVacio
          icono={BookMarked}
          titulo="No tenés materias asignadas todavía"
          texto="Cuando dirección te asigne una materia y un curso, la libreta aparece acá."
        />
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
                onChange={e => { const i = Number(e.target.value); void cambiarSinPerder(() => setAssignmentIdx(i)); }}
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
              <select id="libreta-trimestre" className="form-select" value={termId} onChange={e => { const id = e.target.value; void cambiarSinPerder(() => setTermId(id)); }}>
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

          <div className="libreta-tabs fila-desplazable">
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

          {tab === 'boletin' && <BoletinTeclado exigeTercero={thresholds?.decemberRule === 'anual'} />}

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
          {tab === 'notas' && pendiente && !okMsg && (
            <div className="libreta-pendiente" role="status">
              <CloudUpload size={14} aria-hidden="true" /> Hay un borrador guardado en este equipo que todavía no se envió: se manda solo cuando haya señal.
            </div>
          )}

          {tab === 'notas' && loading && <Esqueleto tipo="tabla" cantidad={6} etiqueta="Cargando libreta…" />}

          {tab === 'notas' && !loading && rows.length === 0 && (
            <EstadoVacio
              icono={Users}
              titulo="Este curso todavía no tiene estudiantes"
              texto="Cuando se inscriban en esta materia, aparecen acá para cargarles la nota."
            />
          )}

          {tab === 'notas' && !loading && rows.length > 0 && (
            <div className="card">
              <div className="libreta-evals">
                <span className="text-sm text-secondary">
                  {columnas.length === 0
                    ? 'Todavía no hay notas cargadas en este trimestre: cargá las de una prueba, un TP o un oral.'
                    : `${columnas.filter(c => c.origen === 'evaluacion').length} evaluaciones cargadas · ${columnas.filter(c => c.origen === 'actividad').length} actividades de la app`}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando('nueva')}>
                  <Plus size={14} aria-hidden="true" /> Cargar notas de una evaluación
                </button>
              </div>
              <div className="table-responsive">
                <table className="modern-table libreta-table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      {columnas.map(c => (
                        <th key={c.id} className="libreta-col" scope="col">
                          {c.origen === 'evaluacion' && c.evaluacion ? (
                            <button type="button" className="libreta-col-btn" onClick={() => setEditando(c.evaluacion!)}
                              title={`${TIPOS_EVALUACION[c.evaluacion.tipo].label} · ${diaMes(c.fecha)}. Tocá para corregir las notas.`}>
                              <span aria-hidden="true">{TIPOS_EVALUACION[c.evaluacion.tipo].emoji}</span>
                              <span className="libreta-col-titulo">{c.titulo}</span>
                              <span className="libreta-col-fecha">{diaMes(c.fecha)}{c.evaluacion.pendiente && <CloudUpload size={11} aria-label=" sin enviar" />}</span>
                            </button>
                          ) : (
                            <Link to={`/actividades/${c.id}`} className="libreta-col-btn" title={`Actividad de la app · ${diaMes(c.fecha)}`}>
                              <span aria-hidden="true">💻</span>
                              <span className="libreta-col-titulo">{c.titulo}</span>
                              <span className="libreta-col-fecha">{diaMes(c.fecha)}</span>
                            </Link>
                          )}
                        </th>
                      ))}
                      <th title="Promedio de las notas del trimestre: evaluaciones cargadas y actividades corregidas">Promedio</th>
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
                        {columnas.map(c => {
                          const n = r.notas[c.id];
                          return (
                            <td key={c.id} data-label={c.titulo} className="libreta-celda">
                              {!n ? <span className="text-subtle" aria-label="sin nota">·</span>
                                : n.ausente ? <span className="libreta-ausente" title="Ausente">A</span>
                                  : n.sinCorregir ? <span className="text-subtle" title="La entregó y falta corregirla">s/c</span>
                                    : <span className={n.nota !== null && n.nota < 6 ? 'libreta-baja' : undefined}>{formatoNota(n.nota as number)}</span>}
                            </td>
                          );
                        })}
                        <td data-label="Promedio">
                          {r.suggestedGrade !== null ? (
                            <span
                              className="libreta-suggested"
                              title={`Promedio de ${r.suggestedFrom} nota${r.suggestedFrom !== 1 ? 's' : ''} del trimestre`}
                            >
                              <Sparkles size={12} /> {formatoNota(r.suggestedGrade)}
                              <span className="text-subtle text-xs"> ({r.suggestedFrom})</span>
                            </span>
                          ) : (
                            <span className="text-subtle text-sm" title="Todavía no tiene notas en este trimestre">—</span>
                          )}
                        </td>
                        <td data-label="Nota del trimestre">
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
                        <td data-label="Estado" className="libreta-estado">
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
                  <Sparkles size={14} /> Usar el promedio donde falta
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

              {editando && assignment && term && (
                <EvaluacionEditor
                  contexto={{
                    subjectId: assignment.subjectId, courseId: assignment.courseId, termId: term.id,
                    subjectName: subjectsMap[assignment.subjectId]?.name ?? 'Materia', courseName: assignment.courseName,
                    termName: term.name, termStartsOn: term.startsOn, termEndsOn: term.endsOn,
                  }}
                  alumnos={[...rows].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))}
                  evaluacion={editando === 'nueva' ? null : editando}
                  alCerrar={() => setEditando(null)}
                  alGuardar={alGuardarEvaluacion}
                  alBorrar={alBorrarEvaluacion}
                />
              )}

              {thresholds && (
                <p className="libreta-rule">
                  <Info size={13} />
                  Al publicar: nota <b>{thresholds.gradeRiskMax}</b> o menos avisa a la familia;
                  {' '}{textoReglaDiciembre(thresholds)}.
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
