/**
 * SMT EstudIA — Tomar asistencia
 *
 * Todos arrancan presentes: el docente solo toca a los que faltaron.
 * Si el curso tuvo clase en vivo hoy, quienes participaron desde el
 * celular ya vienen confirmados y se marca de dónde salió el dato.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    CheckSquare, Check, X, Clock, FileText, Save, Loader2,
    ArrowLeft, Radio, Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentsByCourse } from '../services/students.service';
import { getSubjects } from '../services/subjects.service';
import {
    getAttendanceSession, getLiveParticipants, saveAttendance, todayISO,
    ATTENDANCE_META, type AttendanceStatus,
} from '../services/attendance.service';
import type { Student, Subject } from '../types';
import './Asistencia.css';

const CYCLE: AttendanceStatus[] = ['presente', 'ausente', 'tarde', 'justificado'];

export default function Asistencia() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [students, setStudents] = useState<Student[]>([]);
    const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [fromLive, setFromLive] = useState(0);
    const [alreadyTaken, setAlreadyTaken] = useState(false);

    const assignments = user?.subjects ?? [];
    const current = assignments[assignmentIdx];
    const today = todayISO();

    useEffect(() => {
        getSubjects().then(subjects => {
            const map: Record<string, Subject> = {};
            subjects.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, []);

    // Si venís desde "Hoy" con ?curso=<id>, se posiciona en esa clase
    useEffect(() => {
        const courseId = searchParams.get('curso');
        const subjectId = searchParams.get('materia');
        if (!courseId || assignments.length === 0) return;
        const idx = assignments.findIndex(a =>
            a.courseId === courseId && (!subjectId || a.subjectId === subjectId));
        if (idx >= 0) setAssignmentIdx(idx);
    }, [searchParams, assignments.length]);

    const load = useCallback(async () => {
        if (!user || !current) return;
        setLoading(true);
        setSaved(false);
        setError('');
        try {
            const [studs, existing, liveIds] = await Promise.all([
                getStudentsByCourse(current.courseId),
                getAttendanceSession(user.id, current.courseId, current.subjectId, today),
                getLiveParticipants(current.courseId, today),
            ]);
            setStudents(studs);

            if (existing) {
                // Ya se tomó hoy: se edita lo que quedó guardado
                const map: Record<string, AttendanceStatus> = {};
                existing.entries.forEach(e => { map[e.studentId] = e.status; });
                studs.forEach(s => { map[s.id] ??= 'presente'; });
                setMarks(map);
                setAlreadyTaken(true);
                setFromLive(0);
            } else {
                // Todos presentes por defecto; la clase en vivo solo confirma
                const map: Record<string, AttendanceStatus> = {};
                studs.forEach(s => { map[s.id] = 'presente'; });
                setMarks(map);
                setAlreadyTaken(false);
                setFromLive(liveIds.filter(id => studs.some(s => s.id === id)).length);
            }
        } catch (err) {
            console.error(err);
            setError('No se pudo cargar la lista del curso.');
        } finally {
            setLoading(false);
        }
    }, [user, current?.courseId, current?.subjectId, today]);

    useEffect(() => { load(); }, [load]);

    if (!user) return null;

    const subjectName = (id: string) => subjectsMap[id]?.name ?? 'Materia';

    const cycleStatus = (studentId: string) => {
        setMarks(prev => {
            const currentStatus = prev[studentId] ?? 'presente';
            const next = CYCLE[(CYCLE.indexOf(currentStatus) + 1) % CYCLE.length];
            return { ...prev, [studentId]: next };
        });
        setSaved(false);
    };

    const setStatus = (studentId: string, status: AttendanceStatus) => {
        setMarks(prev => ({ ...prev, [studentId]: status }));
        setSaved(false);
    };

    const markAll = (status: AttendanceStatus) => {
        const map: Record<string, AttendanceStatus> = {};
        students.forEach(s => { map[s.id] = status; });
        setMarks(map);
        setSaved(false);
    };

    const handleSave = async () => {
        if (!current || saving) return;
        setSaving(true);
        setError('');
        try {
            await saveAttendance({
                teacherId: user.id,
                schoolId: user.schoolId,
                subjectId: current.subjectId,
                courseId: current.courseId,
                takenOn: today,
                entries: students.map(s => ({ studentId: s.id, status: marks[s.id] ?? 'presente' })),
            });
            setSaved(true);
            setAlreadyTaken(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error(err);
            setError('No se pudo guardar. Revisá tu conexión e intentá de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const counts = students.reduce(
        (acc, s) => {
            const st = marks[s.id] ?? 'presente';
            acc[st] = (acc[st] ?? 0) + 1;
            return acc;
        },
        {} as Record<AttendanceStatus, number>,
    );
    const absent = counts.ausente ?? 0;

    return (
        <div className="asis-container animate-in">
            <button className="asis-back" onClick={() => navigate('/hoy')}>
                <ArrowLeft size={15} /> Volver a Hoy
            </button>

            <div className="card asis-header">
                <div className="asis-header-main">
                    <div className="asis-icon"><CheckSquare size={22} /></div>
                    <div>
                        <h2>Asistencia de hoy</h2>
                        <p className="text-sm text-secondary">
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                </div>
                {assignments.length > 1 && (
                    <select
                        className="form-select asis-course-select"
                        value={assignmentIdx}
                        onChange={e => setAssignmentIdx(Number(e.target.value))}
                    >
                        {assignments.map((a, i) => (
                            <option key={i} value={i}>
                                {subjectName(a.subjectId)} — {a.courseName}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {alreadyTaken && !saved && (
                <div className="asis-notice asis-notice-info">
                    <Check size={15} /> Ya tomaste asistencia hoy en este curso. Podés corregir lo que haga falta.
                </div>
            )}
            {fromLive > 0 && !alreadyTaken && (
                <div className="asis-notice asis-notice-live">
                    <Radio size={15} />
                    {fromLive} estudiante{fromLive !== 1 ? 's' : ''} participaron desde el celular en la clase en vivo de hoy.
                    Están como presentes: marcá solo los que faltaron.
                </div>
            )}

            {loading ? (
                <p className="text-secondary p-6">Cargando el curso...</p>
            ) : students.length === 0 ? (
                <div className="card asis-empty">
                    <Users size={32} className="text-secondary" />
                    <p className="text-secondary">Este curso todavía no tiene estudiantes cargados.</p>
                </div>
            ) : (
                <>
                    <div className="asis-summary card">
                        <div className="asis-counts">
                            {(Object.keys(ATTENDANCE_META) as AttendanceStatus[]).map(st => (
                                <span key={st} className={`asis-count asis-count-${st}`}>
                                    {ATTENDANCE_META[st].emoji} {counts[st] ?? 0}
                                </span>
                            ))}
                        </div>
                        <div className="asis-bulk">
                            <button className="asis-bulk-btn" onClick={() => markAll('presente')}>Todos presentes</button>
                            <button className="asis-bulk-btn" onClick={() => markAll('ausente')}>Todos ausentes</button>
                        </div>
                    </div>

                    <div className="asis-list">
                        {students.map(s => {
                            const st = marks[s.id] ?? 'presente';
                            return (
                                <div key={s.id} className={`asis-row asis-row-${st}`}>
                                    <button className="asis-student" onClick={() => cycleStatus(s.id)} title="Tocar para cambiar">
                                        <span className="asis-avatar">{s.avatarInitials}</span>
                                        <span className="asis-name">{s.firstName} {s.lastName}</span>
                                        <span className="asis-current">{ATTENDANCE_META[st].emoji}</span>
                                    </button>
                                    <div className="asis-actions">
                                        <button
                                            className={`asis-action ${st === 'presente' ? 'on presente' : ''}`}
                                            title="Presente" onClick={() => setStatus(s.id, 'presente')}
                                        ><Check size={15} /></button>
                                        <button
                                            className={`asis-action ${st === 'ausente' ? 'on ausente' : ''}`}
                                            title="Ausente" onClick={() => setStatus(s.id, 'ausente')}
                                        ><X size={15} /></button>
                                        <button
                                            className={`asis-action ${st === 'tarde' ? 'on tarde' : ''}`}
                                            title="Llegó tarde" onClick={() => setStatus(s.id, 'tarde')}
                                        ><Clock size={15} /></button>
                                        <button
                                            className={`asis-action ${st === 'justificado' ? 'on justificado' : ''}`}
                                            title="Justificado" onClick={() => setStatus(s.id, 'justificado')}
                                        ><FileText size={15} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {error && <p className="text-sm text-danger">{error}</p>}

                    <div className="asis-save-bar">
                        <span className="text-sm text-secondary">
                            {absent === 0
                                ? '¡Están todos! 🎉'
                                : `${absent} ausente${absent !== 1 ? 's' : ''} de ${students.length}`}
                        </span>
                        <button
                            className={`btn btn-sm ${saved ? 'btn-outline' : 'btn-primary'}`}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving
                                ? <><Loader2 size={15} className="spin" /> Guardando...</>
                                : saved
                                    ? <><Check size={15} /> Guardada</>
                                    : <><Save size={15} /> Guardar asistencia</>}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
