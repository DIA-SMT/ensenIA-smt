import { useState, useEffect } from 'react';
import {
    Search, MoreHorizontal, AlertTriangle, X, HeartPulse, PencilLine,
    Users as UsersIcon, CalendarPlus, CheckCircle, Sparkles, Copy, Medal, Flame,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentsByTeacher } from '../services/students.service';
import { logAccess } from '../services/audit.service';
import { getCheckinsByStudent, getObservationsByStudent, addObservation } from '../services/wellbeing.service';
import { getGuardiansOfStudent, createNotice } from '../services/guardians.service';
import { summarizeStudent } from '../services/documents.service';
import { getStudentProgress } from '../services/practice.service';
import { getStudentAwards, giveStudentAward } from '../services/awards.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import AwardPickerModal from '../components/AwardPickerModal';
import {
    FEELING_META, OBSERVATION_META, AWARD_META, levelForXp,
    type Student, type StudentCheckin, type StudentObservation,
    type GuardianLink, type ObservationCategory, type StudentAward, type StudentProgress,
} from '../types';
import './Students.css';
import '../components/Modals.css';

export default function Students() {
    const { user } = useAuth();
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [search, setSearch] = useState('');

    // Datos del panel
    const [checkins, setCheckins] = useState<StudentCheckin[]>([]);
    const [observations, setObservations] = useState<StudentObservation[]>([]);
    const [guardians, setGuardians] = useState<GuardianLink[]>([]);
    const [awards, setAwards] = useState<StudentAward[]>([]);
    const [studentProgress, setStudentProgress] = useState<StudentProgress | null>(null);
    const [showAwardModal, setShowAwardModal] = useState(false);

    // Observación rápida
    const [obsCategory, setObsCategory] = useState<ObservationCategory>('dificultad');
    const [obsNote, setObsNote] = useState('');

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

    useEffect(() => {
        if (!selectedStudent) return;
        setCheckins([]);
        setObservations([]);
        setGuardians([]);
        setAwards([]);
        setStudentProgress(null);
        getCheckinsByStudent(selectedStudent.id, 8).then(setCheckins).catch(console.error);
        getObservationsByStudent(selectedStudent.id).then(setObservations).catch(console.error);
        getGuardiansOfStudent(selectedStudent.id).then(setGuardians).catch(console.error);
        getStudentAwards(selectedStudent.id).then(setAwards).catch(console.error);
        getStudentProgress(selectedStudent.id).then(setStudentProgress).catch(console.error);
        // Bitácora: queda registrado cada acceso a la ficha del estudiante.
        if (user) {
            logAccess({
                userId: user.id,
                userLabel: `${user.firstName} ${user.lastName} (${user.role})`,
                schoolId: user.schoolId,
                action: 'view_student_profile',
                entityType: 'student',
                entityId: selectedStudent.id,
            });
        }
    }, [selectedStudent?.id]);

    if (!user) return null;

    const filteredStudents = search.trim()
        ? allStudents.filter(s =>
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
            s.courseName.toLowerCase().includes(search.toLowerCase())
        )
        : allStudents;

    const getStatusBadge = (status: Student['status']) => {
        switch (status) {
            case 'excellent': return <span className="badge badge-success">Excelente</span>;
            case 'good': return <span className="badge badge-success" style={{ opacity: 0.8 }}>Bueno</span>;
            case 'warning': return <span className="badge badge-warning">En Observación</span>;
            case 'critical': return <span className="badge badge-danger">Riesgo</span>;
        }
    };

    const handleAddObservation = async () => {
        if (!selectedStudent || !obsNote.trim()) return;
        await addObservation({
            studentId: selectedStudent.id,
            teacherId: user.id,
            category: obsCategory,
            note: obsNote,
        });
        setObsNote('');
        getObservationsByStudent(selectedStudent.id).then(setObservations).catch(console.error);
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

                <div className="table-responsive">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Estudiante</th>
                                <th>Curso</th>
                                <th>Estado</th>
                                <th>Alertas</th>
                                <th>Progreso</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
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
                                        <button className="btn-icon"><MoreHorizontal size={18} /></button>
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
                                {studentProgress && (
                                    <>
                                        <div className="metric-box">
                                            <span className="metric-label">Nivel de estudio</span>
                                            <span className="metric-val">
                                                {levelForXp(studentProgress.xp).level.n} · {levelForXp(studentProgress.xp).level.name}
                                            </span>
                                        </div>
                                        <div className="metric-box">
                                            <span className="metric-label">Racha</span>
                                            <span className="metric-val"><Flame size={14} className="text-warning inline" /> {studentProgress.streakDays} días</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ── Medallas / reconocimientos ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><Medal size={14} className="text-warning inline ml-1" /> Medallas</h4>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowAwardModal(true)} title="Reconocé el esfuerzo: la medalla aparece en el perfil del estudiante y suma XP">
                                    <Medal size={13} /> Dar medalla
                                </button>
                            </div>
                            {awards.length === 0
                                ? <p className="text-sm text-secondary italic">Todavía sin medallas. ¡Un "¡Crack!" a tiempo motiva un montón!</p>
                                : awards.slice(0, 5).map(a => {
                                    const meta = AWARD_META[a.badgeCode] ?? { emoji: '🏅', label: a.badgeCode };
                                    return (
                                        <div key={a.id} className="acts-obs-item">
                                            <p className="acts-obs-note">{meta.emoji} <strong>{meta.label}</strong>{a.message ? ` — "${a.message}"` : ''}</p>
                                            <span className="acts-obs-meta">
                                                {a.teacherName ?? 'Docente'} · {new Date(a.createdAt).toLocaleDateString('es-AR')}
                                            </span>
                                        </div>
                                    );
                                })}
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
                                <button className="btn btn-secondary btn-sm" onClick={handleAddObservation} disabled={!obsNote.trim()}>
                                    Guardar observación
                                </button>
                            </div>
                            {observations.length === 0
                                ? <p className="text-sm text-secondary italic">Sin observaciones todavía.</p>
                                : observations.slice(0, 6).map(o => (
                                    <div key={o.id} className="acts-obs-item">
                                        <p className="acts-obs-note">
                                            {OBSERVATION_META[o.category].emoji} {o.note}
                                        </p>
                                        <span className="acts-obs-meta">
                                            {o.teacherName ?? 'Docente'} · {new Date(o.createdAt).toLocaleDateString('es-AR')}
                                        </span>
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

            {/* ── Modal dar medalla ── */}
            {showAwardModal && selectedStudent && (
                <AwardPickerModal
                    title="Dar medalla"
                    recipientName={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                    catalog={AWARD_META}
                    onClose={() => setShowAwardModal(false)}
                    onGive={async (badgeCode, message) => {
                        const subjectId = user.subjects?.find(s => s.courseId === selectedStudent.courseId)?.subjectId ?? null;
                        await giveStudentAward({
                            studentId: selectedStudent.id,
                            teacherId: user.id,
                            subjectId,
                            badgeCode,
                            message,
                        });
                        getStudentAwards(selectedStudent.id).then(setAwards).catch(console.error);
                    }}
                />
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
