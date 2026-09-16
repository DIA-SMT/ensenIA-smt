import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Search, ChevronRight, AlertTriangle, X, HeartPulse, PencilLine,
    Users as UsersIcon, CalendarPlus, CheckCircle, Sparkles, Copy,
    BookOpenCheck, FileDown, Trash2, ArrowUpDown, Award, Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentsByTeacher, getWorkByStudent, type StudentWork } from '../services/students.service';
import { getCheckinsByStudent, getObservationsByStudent, addObservation, deleteObservation } from '../services/wellbeing.service';
import { getGuardiansOfStudent, createNotice } from '../services/guardians.service';
import { getAchievementsByStudent, grantAchievement, revokeAchievement, totalPoints } from '../services/gamification.service';
import { getAbsencesByStudent, ATTENDANCE_META, type AttendanceStatus } from '../services/attendance.service';
import { summarizeStudent } from '../services/documents.service';
import { textToPdf } from '../lib/pdf';
import MarkdownRenderer from '../components/MarkdownRenderer';
import {
    FEELING_META, OBSERVATION_META, ACHIEVEMENT_PRESETS,
    type Student, type StudentCheckin, type StudentObservation,
    type GuardianLink, type ObservationCategory, type StudentAchievement,
} from '../types';
import './Students.css';
import '../components/Modals.css';

type StatusFilter = 'all' | 'ok' | 'warning' | 'critical';
type SortKey = 'name' | 'progress';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'ok', label: '🟢 Bien' },
    { key: 'warning', label: '🟡 En observación' },
    { key: 'critical', label: '🔴 Riesgo' },
];

const WORK_STATUS_META: Record<StudentWork['status'], { label: string; cls: string }> = {
    in_progress: { label: 'En curso', cls: 'badge-warning' },
    submitted: { label: 'Entregada', cls: 'badge-cyan' },
    graded: { label: 'Calificada', cls: 'badge-success' },
};

export default function Students() {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [search, setSearch] = useState('');

    // Filtros y orden de la lista
    const [courseFilter, setCourseFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortAsc, setSortAsc] = useState(true);

    // Datos del panel
    const [checkins, setCheckins] = useState<StudentCheckin[]>([]);
    const [observations, setObservations] = useState<StudentObservation[]>([]);
    const [guardians, setGuardians] = useState<GuardianLink[]>([]);
    const [work, setWork] = useState<StudentWork[]>([]);
    const [absences, setAbsences] = useState<{ date: string; status: AttendanceStatus }[]>([]);

    // Logros
    const [achievements, setAchievements] = useState<StudentAchievement[]>([]);
    const [showGrantForm, setShowGrantForm] = useState(false);
    const [customTitle, setCustomTitle] = useState('');
    const [customEmoji, setCustomEmoji] = useState('🏅');
    const [granting, setGranting] = useState(false);

    // Observación rápida
    const [obsCategory, setObsCategory] = useState<ObservationCategory>('dificultad');
    const [obsNote, setObsNote] = useState('');
    const [obsSaving, setObsSaving] = useState(false);
    const [obsSaved, setObsSaved] = useState(false);
    const [obsError, setObsError] = useState('');

    // Resumen IA
    const [showSummary, setShowSummary] = useState(false);
    const [summaryText, setSummaryText] = useState('');
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState('');
    const [summaryCopied, setSummaryCopied] = useState(false);

    // Citación
    const [showCite, setShowCite] = useState(false);
    const [citeTitle, setCiteTitle] = useState('');
    const [citeBody, setCiteBody] = useState('');
    const [citeDate, setCiteDate] = useState('');
    const [citeTime, setCiteTime] = useState('');
    const [citePlace, setCitePlace] = useState('');
    const [citeSending, setCiteSending] = useState(false);
    const [citeDone, setCiteDone] = useState(false);

    useEffect(() => {
        if (!user) return;
        const courseIds = user.subjects?.map(s => s.courseId) ?? [];
        getStudentsByTeacher(courseIds).then(setAllStudents).catch(console.error);
    }, [user]);

    // Llegado desde una alerta (/students?student=<id>): abre esa ficha sola
    useEffect(() => {
        const wanted = searchParams.get('student');
        if (!wanted || allStudents.length === 0) return;
        const found = allStudents.find(s => s.id === wanted);
        if (found) setSelectedStudent(found);
        searchParams.delete('student');
        setSearchParams(searchParams, { replace: true });
    }, [allStudents, searchParams, setSearchParams]);

    useEffect(() => {
        if (!selectedStudent) return;
        setCheckins([]);
        setObservations([]);
        setGuardians([]);
        setWork([]);
        setAbsences([]);
        setAchievements([]);
        setShowGrantForm(false);
        setCustomTitle('');
        setObsNote('');
        setObsError('');
        setObsSaved(false);
        getCheckinsByStudent(selectedStudent.id, 8).then(setCheckins).catch(console.error);
        getObservationsByStudent(selectedStudent.id).then(setObservations).catch(console.error);
        getGuardiansOfStudent(selectedStudent.id).then(setGuardians).catch(console.error);
        getWorkByStudent(selectedStudent.id).then(setWork).catch(console.error);
        getAbsencesByStudent(selectedStudent.id).then(setAbsences).catch(console.error);
        getAchievementsByStudent(selectedStudent.id).then(setAchievements).catch(console.error);
    }, [selectedStudent?.id]);

    const courseNames = useMemo(
        () => Array.from(new Set(allStudents.map(s => s.courseName))).sort(),
        [allStudents],
    );

    const filteredStudents = useMemo(() => {
        let list = allStudents;
        if (courseFilter !== 'all') list = list.filter(s => s.courseName === courseFilter);
        if (statusFilter === 'ok') list = list.filter(s => s.status === 'excellent' || s.status === 'good');
        else if (statusFilter !== 'all') list = list.filter(s => s.status === statusFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(s =>
                `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
                s.courseName.toLowerCase().includes(q)
            );
        }
        const dir = sortAsc ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sortKey === 'progress') return (a.progress - b.progress) * dir;
            return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir;
        });
    }, [allStudents, courseFilter, statusFilter, search, sortKey, sortAsc]);

    if (!user) return null;

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(v => !v);
        else { setSortKey(key); setSortAsc(true); }
    };

    const getStatusBadge = (status: Student['status']) => {
        switch (status) {
            case 'excellent': return <span className="badge badge-success">Excelente</span>;
            case 'good': return <span className="badge badge-success" style={{ opacity: 0.8 }}>Bueno</span>;
            case 'warning': return <span className="badge badge-warning">En Observación</span>;
            case 'critical': return <span className="badge badge-danger">Riesgo</span>;
        }
    };

    const handleAddObservation = async () => {
        if (!selectedStudent || !obsNote.trim() || obsSaving) return;
        setObsSaving(true);
        setObsError('');
        try {
            await addObservation({
                studentId: selectedStudent.id,
                teacherId: user.id,
                category: obsCategory,
                note: obsNote,
            });
            // Mostrar la huella al instante, sin esperar el refetch
            setObservations(prev => [{
                id: `local-${Date.now()}`,
                studentId: selectedStudent.id,
                teacherId: user.id,
                subjectId: null,
                category: obsCategory,
                note: obsNote.trim(),
                createdAt: new Date().toISOString(),
                teacherName: `${user.firstName} ${user.lastName}`,
            }, ...prev]);
            setObsNote('');
            setObsSaved(true);
            setTimeout(() => setObsSaved(false), 2500);
            getObservationsByStudent(selectedStudent.id).then(setObservations).catch(console.error);
        } catch (err) {
            console.error('Error guardando observación:', err);
            setObsError('No se pudo guardar. Revisá tu conexión e intentá de nuevo.');
        } finally {
            setObsSaving(false);
        }
    };

    const handleGrant = async (emoji: string, title: string, points: number) => {
        if (!selectedStudent || granting || !title.trim()) return;
        setGranting(true);
        try {
            await grantAchievement({
                studentId: selectedStudent.id,
                teacherId: user.id,
                emoji,
                title,
                points,
            });
            setCustomTitle('');
            setShowGrantForm(false);
            await getAchievementsByStudent(selectedStudent.id).then(setAchievements);
        } catch (err) {
            console.error('Error otorgando logro:', err);
            alert('No se pudo otorgar el logro. ¿Está aplicada la migración 007?');
        } finally {
            setGranting(false);
        }
    };

    const handleRevoke = async (a: StudentAchievement) => {
        if (a.grantedBy !== user.id) return;
        if (!window.confirm(`¿Quitar el logro "${a.title}"?`)) return;
        try {
            await revokeAchievement(a.id);
            setAchievements(prev => prev.filter(x => x.id !== a.id));
        } catch (err) {
            console.error('Error quitando logro:', err);
        }
    };

    const handleDeleteObservation = async (o: StudentObservation) => {
        if (o.teacherId !== user.id) return;
        if (!window.confirm('¿Borrar esta observación?')) return;
        try {
            await deleteObservation(o.id);
            setObservations(prev => prev.filter(x => x.id !== o.id));
        } catch (err) {
            console.error('Error borrando observación:', err);
        }
    };

    const handleDownloadFicha = () => {
        if (!selectedStudent) return;
        const s = selectedStudent;
        const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-AR');
        const statusLabel = { excellent: 'Excelente', good: 'Bueno', warning: 'En observación', critical: 'Riesgo' }[s.status];
        const md = [
            `Curso: ${s.courseName} — Estado general: ${statusLabel}`,
            `Generada el ${new Date().toLocaleDateString('es-AR')} por ${user.firstName} ${user.lastName}`,
            '',
            '## Métricas generales',
            `- Asistencia: ${s.attendance}%`,
            `- Promedio: ${s.average}`,
            `- Progreso en actividades: ${s.progress}%`,
            '',
            '## Señales recientes (check-ins emocionales)',
            ...(checkins.length
                ? checkins.slice(0, 8).map(c =>
                    `- ${FEELING_META[c.feeling].label} (${c.moment === 'inicio' ? 'al empezar' : 'al terminar'})${c.comment ? `: "${c.comment}"` : ''} — ${fmt(c.createdAt)}`)
                : ['- Sin check-ins registrados.']),
            '',
            '## Trabajo académico reciente',
            ...(work.length
                ? work.slice(0, 8).map(w => {
                    const nota = w.score ?? w.autoScore;
                    return `- ${w.activityTitle} (${w.subjectName}) — ${WORK_STATUS_META[w.status].label}${nota != null ? `, nota ${nota}${w.points ? `/${w.points}` : ''}` : ''} — ${fmt(w.updatedAt)}`;
                })
                : ['- Sin entregas registradas.']),
            '',
            '## Logros',
            ...(achievements.length
                ? [
                    `Total: ${totalPoints(achievements)} puntos.`,
                    ...achievements.slice(0, 10).map(a =>
                        `- ${a.title} (+${a.points} pts) — ${a.kind === 'auto' ? 'automático' : (a.grantedByName ?? 'docente')}, ${fmt(a.createdAt)}`),
                ]
                : ['- Sin logros todavía.']),
            '',
            '## Observaciones del equipo docente',
            ...(observations.length
                ? observations.slice(0, 10).map(o =>
                    `- [${OBSERVATION_META[o.category].label}] ${o.note} (${o.teacherName ?? 'Docente'}, ${fmt(o.createdAt)})`)
                : ['- Sin observaciones registradas.']),
        ].join('\n');
        textToPdf(md, `Ficha de ${s.firstName} ${s.lastName}`, s.courseName);
    };

    const openCite = () => {
        if (!selectedStudent) return;
        setCiteTitle(`Citación: reunión por ${selectedStudent.firstName}`);
        setCiteBody('');
        setCiteDate('');
        setCiteTime('');
        setCitePlace('');
        setCiteDone(false);
        setShowCite(true);
    };

    const handleSendCite = async () => {
        if (!selectedStudent || !citeTitle.trim() || !citeBody.trim()) return;
        setCiteSending(true);
        try {
            await createNotice({
                schoolId: user.schoolId,
                studentId: selectedStudent.id,
                fromUserId: user.id,
                type: 'citacion',
                title: citeTitle,
                body: citeBody,
                meetingAt: citeDate ? new Date(`${citeDate}T${citeTime || '08:00'}`).toISOString() : null,
                meetingPlace: citePlace,
            });
            setCiteDone(true);
        } catch (err) {
            console.error(err);
        } finally {
            setCiteSending(false);
        }
    };

    const avgFeeling = checkins.length
        ? checkins.reduce((acc, c) => acc + FEELING_META[c.feeling].value, 0) / checkins.length
        : null;

    const handleAiSummary = async () => {
        if (!selectedStudent) return;
        setShowSummary(true);
        setSummaryError('');
        setSummaryCopied(false);
        setSummaryLoading(true);
        try {
            const s = selectedStudent;
            const lines: string[] = [
                `ESTUDIANTE: ${s.firstName} ${s.lastName} — ${s.courseName}.`,
                `MÉTRICAS: asistencia ${s.attendance}%, promedio ${s.average}, progreso ${s.progress}%, estado general: ${s.status}.`,
                '',
                'CHECK-INS EMOCIONALES RECIENTES:',
                ...(checkins.length
                    ? checkins.slice(0, 10).map(c =>
                        `- ${FEELING_META[c.feeling].label} (${c.moment === 'inicio' ? 'al empezar' : 'al terminar'} una actividad)${c.comment ? `: "${c.comment}"` : ''} — ${new Date(c.createdAt).toLocaleDateString('es-AR')}`)
                    : ['(sin check-ins registrados)']),
                '',
                'OBSERVACIONES DEL EQUIPO DOCENTE:',
                ...(observations.length
                    ? observations.slice(0, 10).map(o =>
                        `- [${OBSERVATION_META[o.category].label}] ${o.note} (${o.teacherName ?? 'docente'}, ${new Date(o.createdAt).toLocaleDateString('es-AR')})`)
                    : ['(sin observaciones registradas)']),
            ];
            const summary = await summarizeStudent(lines.join('\n'), `${s.firstName} ${s.lastName}`);
            setSummaryText(summary);
        } catch (err) {
            setSummaryError(err instanceof Error ? err.message : 'No se pudo generar el resumen.');
        } finally {
            setSummaryLoading(false);
        }
    };

    return (
        <div className="students-container">
            <div className={`students-main card ${selectedStudent ? 'panel-open' : ''}`}>
                <div className="students-header border-bottom">
                    <h2>Lista de Estudiantes</h2>
                    <div className="students-actions">
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Buscar alumno..."
                                className="search-input"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Filtros por curso y estado */}
                <div className="stu-filters border-bottom">
                    <div className="stu-filter-group">
                        <button
                            className={`stu-filter-chip ${courseFilter === 'all' ? 'selected' : ''}`}
                            onClick={() => setCourseFilter('all')}
                        >
                            Todos los cursos
                        </button>
                        {courseNames.map(c => (
                            <button
                                key={c}
                                className={`stu-filter-chip ${courseFilter === c ? 'selected' : ''}`}
                                onClick={() => setCourseFilter(c)}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                    <div className="stu-filter-group">
                        {STATUS_FILTERS.map(f => (
                            <button
                                key={f.key}
                                className={`stu-filter-chip ${statusFilter === f.key ? 'selected' : ''}`}
                                onClick={() => setStatusFilter(f.key)}
                            >
                                {f.label}
                            </button>
                        ))}
                        <span className="stu-count">
                            {filteredStudents.length} estudiante{filteredStudents.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th className="th-sortable" onClick={() => toggleSort('name')} title="Ordenar por apellido">
                                    Estudiante {sortKey === 'name' && <ArrowUpDown size={11} className={sortAsc ? '' : 'flip'} />}
                                </th>
                                <th>Curso</th>
                                <th>Estado</th>
                                <th>Alertas</th>
                                <th className="th-sortable" onClick={() => toggleSort('progress')} title="Ordenar por progreso">
                                    Progreso {sortKey === 'progress' && <ArrowUpDown size={11} className={sortAsc ? '' : 'flip'} />}
                                </th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="stu-empty">
                                        No hay estudiantes que coincidan con la búsqueda o los filtros.
                                    </td>
                                </tr>
                            )}
                            {filteredStudents.map(student => (
                                <tr
                                    key={student.id}
                                    onClick={() => setSelectedStudent(student)}
                                    className={selectedStudent?.id === student.id ? 'selected-row' : ''}
                                >
                                    <td>
                                        <div className="student-cell">
                                            <div className="student-avatar">{student.avatarInitials}</div>
                                            <span className="font-medium">{student.firstName} {student.lastName}</span>
                                        </div>
                                    </td>
                                    <td className="text-secondary">{student.courseName}</td>
                                    <td>{getStatusBadge(student.status)}</td>
                                    <td>
                                        {student.alerts > 0
                                            ? <span className="alert-count text-danger"><AlertTriangle size={14} /> {student.alerts}</span>
                                            : <span className="text-secondary">-</span>}
                                    </td>
                                    <td>
                                        <div className="progress-cell">
                                            <div className="progress-bar-bg">
                                                <div
                                                    className={`progress-bar-fill pb-${student.status}`}
                                                    style={{ width: `${student.progress}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-sm font-medium">{student.progress}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <ChevronRight size={18} className="text-subtle" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Panel de perfil */}
            {selectedStudent && (
                <div className="student-profile-panel card animate-slide-in">
                    <div className="profile-header border-bottom">
                        <div className="profile-title-row">
                            <h3>Perfil del Estudiante</h3>
                            <button className="btn-icon" onClick={() => setSelectedStudent(null)}><X size={18} /></button>
                        </div>
                    </div>

                    <div className="profile-body">
                        <div className="profile-hero">
                            <div className="profile-avatar-large">{selectedStudent.avatarInitials}</div>
                            <h2 className="profile-name">{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                            <p className="profile-course">{selectedStudent.courseName}</p>
                            <div className="profile-status mt-2">{getStatusBadge(selectedStudent.status)}</div>
                            <button
                                className="btn btn-outline btn-sm mt-2"
                                onClick={handleDownloadFicha}
                                title="Descarga la ficha completa en PDF: métricas, señales, trabajo y observaciones. Ideal para reuniones."
                            >
                                <FileDown size={14} /> Descargar ficha (PDF)
                            </button>
                        </div>

                        <div className="profile-section">
                            <h4>Métricas Generales</h4>
                            <div className="metrics-grid">
                                <div className="metric-box">
                                    <span className="metric-label">Asistencia</span>
                                    <span className="metric-val">{selectedStudent.attendance}%</span>
                                </div>
                                <div className="metric-box">
                                    <span className="metric-label">Promedio</span>
                                    <span className="metric-val">{selectedStudent.average}</span>
                                </div>
                            </div>
                            {absences.length > 0 && (
                                <div className="stu-absences">
                                    <span className="text-xs text-subtle">Faltas recientes:</span>
                                    {absences.slice(0, 6).map((a, i) => (
                                        <span key={i} className="stu-absence-chip" title={ATTENDANCE_META[a.status].label}>
                                            {ATTENDANCE_META[a.status].emoji} {new Date(a.date + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Trabajo académico reciente ── */}
                        <div className="profile-section">
                            <h4><BookOpenCheck size={14} className="text-cyan inline ml-1" /> Trabajo académico</h4>
                            {work.length === 0 ? (
                                <p className="text-sm text-secondary italic">Sin entregas en tus actividades todavía.</p>
                            ) : (
                                <div className="stu-work-list">
                                    {work.slice(0, 6).map(w => {
                                        const nota = w.score ?? w.autoScore;
                                        return (
                                            <div key={w.id} className="stu-work-item">
                                                <div className="stu-work-main">
                                                    <span className="stu-work-title">{w.activityTitle}</span>
                                                    <span className="stu-work-meta">
                                                        {w.subjectName} · {new Date(w.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="stu-work-side">
                                                    <span className={`badge ${WORK_STATUS_META[w.status].cls}`}>
                                                        {WORK_STATUS_META[w.status].label}
                                                    </span>
                                                    {nota != null && (
                                                        <span className="stu-work-score">
                                                            {nota}{w.points ? `/${w.points}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── Logros (gamificación) ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><Award size={14} className="text-warning inline ml-1" /> Logros
                                    {achievements.length > 0 && (
                                        <span className="stu-points-badge">⭐ {totalPoints(achievements)} pts</span>
                                    )}
                                </h4>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowGrantForm(v => !v)}>
                                    <Plus size={13} /> Dar logro
                                </button>
                            </div>

                            {showGrantForm && (
                                <div className="stu-grant-form">
                                    <p className="text-xs text-subtle">Un toque y se lo lleva:</p>
                                    <div className="stu-preset-grid">
                                        {ACHIEVEMENT_PRESETS.map(p => (
                                            <button
                                                key={p.title}
                                                className="stu-preset-chip"
                                                disabled={granting}
                                                title={`${p.points} puntos`}
                                                onClick={() => handleGrant(p.emoji, p.title, p.points)}
                                            >
                                                {p.emoji} {p.title}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="stu-custom-grant">
                                        <input
                                            type="text"
                                            className="stu-custom-emoji"
                                            value={customEmoji}
                                            maxLength={4}
                                            onChange={e => setCustomEmoji(e.target.value)}
                                            aria-label="Emoji del logro"
                                        />
                                        <input
                                            type="text"
                                            className="stu-custom-title"
                                            placeholder="Logro personalizado..."
                                            value={customTitle}
                                            maxLength={40}
                                            onChange={e => setCustomTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleGrant(customEmoji || '🏅', customTitle, 10); }}
                                        />
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={!customTitle.trim() || granting}
                                            onClick={() => handleGrant(customEmoji || '🏅', customTitle, 10)}
                                        >
                                            Dar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {achievements.length === 0
                                ? <p className="text-sm text-secondary italic">Todavía no tiene logros. ¡Regalale el primero!</p>
                                : (
                                    <div className="stu-achievements">
                                        {achievements.slice(0, 8).map(a => (
                                            <div key={a.id} className="stu-achievement" title={a.reason ?? undefined}>
                                                <span className="stu-achievement-emoji">{a.emoji}</span>
                                                <div className="stu-achievement-body">
                                                    <span className="stu-achievement-title">{a.title}</span>
                                                    <span className="stu-achievement-meta">
                                                        +{a.points} pts · {a.kind === 'auto' ? 'automático' : (a.grantedByName ?? 'docente')} · {new Date(a.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                    </span>
                                                </div>
                                                {a.grantedBy === user.id && (
                                                    <button className="stu-obs-delete" title="Quitar logro" onClick={() => handleRevoke(a)}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </div>

                        {/* ── Señales: cómo se viene sintiendo ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><HeartPulse size={14} className="text-cyan inline ml-1" /> Señales recientes</h4>
                                <button className="btn btn-secondary btn-sm" onClick={handleAiSummary} title="Síntesis para reunión con la familia o boletín">
                                    <Sparkles size={13} /> Resumen IA
                                </button>
                            </div>
                            {checkins.length === 0 ? (
                                <p className="text-sm text-secondary italic">Todavía no hay check-ins emocionales.</p>
                            ) : (
                                <>
                                    {avgFeeling !== null && (
                                        <p className="text-sm text-secondary" style={{ marginBottom: 8 }}>
                                            Ánimo promedio: <strong className={avgFeeling >= 3.5 ? 'text-success' : avgFeeling >= 2.5 ? 'text-warning' : 'text-danger'}>
                                                {avgFeeling.toFixed(1)}/5
                                            </strong> en sus últimos {checkins.length} check-ins
                                        </p>
                                    )}
                                    <div className="signal-feed">
                                        {checkins.slice(0, 5).map(c => (
                                            <div key={c.id} className="signal-item">
                                                <span className="signal-emoji">{FEELING_META[c.feeling].emoji}</span>
                                                <div>
                                                    <span className="text-sm">{FEELING_META[c.feeling].label} · <span className="text-subtle">{c.moment === 'inicio' ? 'al empezar' : 'al terminar'}</span></span>
                                                    {c.comment && <p className="text-xs text-secondary italic">"{c.comment}"</p>}
                                                    <span className="text-xs text-subtle">{new Date(c.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Observaciones del equipo docente ── */}
                        <div className="profile-section">
                            <h4><PencilLine size={14} className="text-secondary inline ml-1" /> Observaciones</h4>
                            <div className="acts-obs-form" style={{ marginBottom: 12 }}>
                                <div className="acts-obs-cats">
                                    {(Object.entries(OBSERVATION_META) as [ObservationCategory, { emoji: string; label: string }][]).map(([key, meta]) => (
                                        <button
                                            key={key}
                                            className={`acts-obs-cat ${obsCategory === key ? 'selected' : ''}`}
                                            onClick={() => setObsCategory(key)}
                                        >
                                            {meta.emoji} {meta.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    className="form-textarea w-full"
                                    rows={2}
                                    placeholder="Lo que ves en clase y no queda registrado en ningún lado..."
                                    value={obsNote}
                                    onChange={e => setObsNote(e.target.value)}
                                />
                                <button
                                    className={`btn btn-sm ${obsSaved ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={handleAddObservation}
                                    disabled={!obsNote.trim() || obsSaving}
                                >
                                    {obsSaving ? 'Guardando...' : obsSaved ? '✓ Guardada' : 'Guardar observación'}
                                </button>
                                {obsError && (
                                    <p className="text-xs text-danger" style={{ marginTop: 4 }}>
                                        <AlertTriangle size={12} className="inline" /> {obsError}
                                    </p>
                                )}
                            </div>
                            {observations.length === 0
                                ? <p className="text-sm text-secondary italic">Sin observaciones todavía.</p>
                                : observations.slice(0, 6).map(o => (
                                    <div key={o.id} className="acts-obs-item stu-obs-item">
                                        <div className="stu-obs-body">
                                            <p className="acts-obs-note">
                                                {OBSERVATION_META[o.category].emoji} {o.note}
                                            </p>
                                            <span className="acts-obs-meta">
                                                {o.teacherName ?? 'Docente'} · {new Date(o.createdAt).toLocaleDateString('es-AR')}
                                            </span>
                                        </div>
                                        {o.teacherId === user.id && !o.id.startsWith('local-') && (
                                            <button
                                                className="stu-obs-delete"
                                                title="Borrar esta observación"
                                                onClick={() => handleDeleteObservation(o)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>

                        {/* ── Familia ── */}
                        <div className="profile-section">
                            <h4><UsersIcon size={14} className="text-secondary inline ml-1" /> Familia</h4>
                            {guardians.length === 0
                                ? <p className="text-sm text-secondary italic">Sin tutores vinculados.</p>
                                : guardians.map(g => (
                                    <p key={g.id} className="text-sm">
                                        {g.guardianName} <span className="text-subtle">({g.relationship})</span>
                                    </p>
                                ))}
                            <button className="btn btn-outline btn-sm mt-2 w-full" onClick={openCite}>
                                <CalendarPlus size={14} /> Citar a la familia
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal resumen IA ── */}
            {showSummary && selectedStudent && (
                <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !summaryLoading) setShowSummary(false); }}>
                    <div className="em-modal em-modal-lg">
                        <div className="em-modal-header">
                            <h3><Sparkles size={17} className="text-ia-accent" /> Resumen IA — {selectedStudent.firstName} {selectedStudent.lastName}</h3>
                            <button className="btn-icon" onClick={() => setShowSummary(false)}><X size={18} /></button>
                        </div>
                        <div className="em-modal-body">
                            {summaryLoading && (
                                <div className="em-processing">
                                    <div className="em-spinner" />
                                    <p>Sintetizando señales, observaciones y desempeño...</p>
                                </div>
                            )}
                            {summaryError && <div className="em-error"><AlertTriangle size={15} /> {summaryError}</div>}
                            {!summaryLoading && summaryText && (
                                <div className="summary-markdown">
                                    <MarkdownRenderer content={summaryText} />
                                </div>
                            )}
                            {!summaryLoading && summaryText && (
                                <p className="em-hint">
                                    Generado a partir de {checkins.length} check-in{checkins.length !== 1 ? 's' : ''} y {observations.length} observación{observations.length !== 1 ? 'es' : ''}.
                                    Revisalo antes de compartirlo: la IA ayuda, el criterio es tuyo.
                                </p>
                            )}
                        </div>
                        <div className="em-modal-footer">
                            {!summaryLoading && summaryText && (
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => { navigator.clipboard.writeText(summaryText); setSummaryCopied(true); setTimeout(() => setSummaryCopied(false), 2000); }}
                                >
                                    <Copy size={14} /> {summaryCopied ? '¡Copiado!' : 'Copiar'}
                                </button>
                            )}
                            <button className="btn btn-primary btn-sm" onClick={() => setShowSummary(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal citación ── */}
            {showCite && selectedStudent && (
                <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !citeSending) setShowCite(false); }}>
                    <div className="em-modal">
                        <div className="em-modal-header">
                            <h3><CalendarPlus size={17} className="text-cyan" /> Citar a la familia de {selectedStudent.firstName}</h3>
                            <button className="btn-icon" onClick={() => setShowCite(false)}><X size={18} /></button>
                        </div>
                        <div className="em-modal-body">
                            {citeDone ? (
                                <div className="em-processing">
                                    <CheckCircle size={38} className="text-success" />
                                    <p><strong>Citación enviada</strong></p>
                                    <p className="text-sm text-secondary">
                                        La familia la ve en su portal y puede confirmar asistencia. Seguí los acuses en la sección <strong>Familias</strong>.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {guardians.length === 0 && (
                                        <div className="em-error">Este estudiante no tiene tutores vinculados: la citación no la verá nadie todavía.</div>
                                    )}
                                    <div className="em-field">
                                        <label>Título</label>
                                        <input type="text" value={citeTitle} onChange={e => setCiteTitle(e.target.value)} />
                                    </div>
                                    <div className="em-field">
                                        <label>Motivo / mensaje para la familia</label>
                                        <textarea rows={3} value={citeBody} onChange={e => setCiteBody(e.target.value)} placeholder="Los convocamos a una reunión para..." />
                                    </div>
                                    <div className="em-row">
                                        <div className="em-field">
                                            <label>Fecha</label>
                                            <input type="date" value={citeDate} onChange={e => setCiteDate(e.target.value)} />
                                        </div>
                                        <div className="em-field">
                                            <label>Hora</label>
                                            <input type="text" placeholder="10:00" value={citeTime} onChange={e => setCiteTime(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="em-field">
                                        <label>Lugar</label>
                                        <input type="text" value={citePlace} onChange={e => setCitePlace(e.target.value)} placeholder="Dirección de la escuela" />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="em-modal-footer">
                            {citeDone ? (
                                <button className="btn btn-primary btn-sm" onClick={() => setShowCite(false)}>Listo</button>
                            ) : (
                                <>
                                    <button className="btn btn-outline btn-sm" onClick={() => setShowCite(false)}>Cancelar</button>
                                    <button className="btn btn-primary btn-sm" onClick={handleSendCite} disabled={citeSending || !citeTitle.trim() || !citeBody.trim()}>
                                        {citeSending ? 'Enviando...' : 'Enviar citación'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
