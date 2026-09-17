/**
 * SMT EstudIA — Clase en vivo (panel del docente)
 *
 * Pensado para el aula real: la clase arranca tradicional y, cuando el
 * docente quiere, lanza una actividad desde el celu, la tablet o la compu.
 * Mientras no hay actividad activa, los celulares de los estudiantes
 * quedan en un lobby tranquilo. La botonera de emojis se prende y apaga
 * (no siempre suma). Todo responsive: mismo panel en cualquier pantalla.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Radio, Square, Plus, Eye, Lock, CheckCircle, Users,
    Smile, Trash2, ChevronLeft, Loader2, QrCode, UserPlus, MonitorPlay,
    UsersRound, Target, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import { getGroupsByCourse, type CourseGroup } from '../services/groups.service';
import GruposModal from '../components/GruposModal';
import {
    getMyLiveSession, startLiveSession, endLiveSession, setReactionsEnabled,
    getSessionState, launchActivity, setActivityStatus, getLiveResults,
    getRecentReactions, setGuestsEnabled, getConnectedGuests, getOnlineStudentIds,
    LIVE_KIND_META,
    type LiveSession, type LiveActivity, type LiveActivityKind,
    type LiveResults, type LiveOption,
} from '../services/live.service';
import QRCode from 'qrcode';
import QrModal from '../components/QrModal';
import ProyectarVivo from '../components/ProyectarVivo';
import { FEELING_META, type Subject, type CheckinFeeling, type Student } from '../types';
import './ClaseEnVivo.css';

const POLL_MS = 2500;


export default function ClaseEnVivo() {
    const { user } = useAuth();

    const [session, setSession] = useState<LiveSession | null | undefined>(undefined);
    const [activity, setActivity] = useState<LiveActivity | null>(null);
    const [results, setResults] = useState<LiveResults | null>(null);
    const [reactions, setReactions] = useState<{ emoji: string; createdAt: string }[]>([]);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});

    // Inicio de sesión
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState('');

    // Lanzador de actividades
    const [pickedKind, setPickedKind] = useState<LiveActivityKind | null>(null);
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<LiveOption[]>([
        { id: 'a', label: '' }, { id: 'b', label: '' },
    ]);
    const [correctId, setCorrectId] = useState<string>('');
    const [launching, setLaunching] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [projecting, setProjecting] = useState(false);
    const [connected, setConnected] = useState(0);
    const [joinQr, setJoinQr] = useState('');

    // Quiénes están: la lista del curso + los que laten ahora
    const [students, setStudents] = useState<Student[]>([]);
    const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
    const [groups, setGroups] = useState<CourseGroup[]>([]);
    const [showGroups, setShowGroups] = useState(false);
    /** Pregunta dirigida: si está, lo que se lance va solo a este estudiante. */
    const [targetStudent, setTargetStudent] = useState<Student | null>(null);
    const [groupMode, setGroupMode] = useState(false);

    const pollRef = useRef<number | null>(null);

    const assignments = user?.subjects ?? [];

    useEffect(() => {
        getSubjects().then(subjects => {
            const map: Record<string, Subject> = {};
            subjects.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, []);

    // Sesión viva existente (si recarga la página, la retoma)
    useEffect(() => {
        if (!user) return;
        getMyLiveSession(user.id).then(setSession).catch(() => setSession(null));
    }, [user]);

    // Con la clase viva, carga el curso (para nombres) y sus grupos
    useEffect(() => {
        if (!session || session.status !== 'live') return;
        getEnrolledStudents(session.subjectId, session.courseId).then(setStudents).catch(console.error);
        getGroupsByCourse(session.courseId).then(setGroups).catch(console.error);
    }, [session?.id, session?.status]);

    // ── Poll del estado + resultados + reacciones ──
    const poll = useCallback(async () => {
        if (!session) return;
        try {
            const state = await getSessionState(session.id);
            if (!state) return;
            setSession(state.session);
            setActivity(state.activity);
            if (state.activity && state.activity.status !== 'closed') {
                getLiveResults(state.activity.id).then(setResults).catch(console.error);
            }
            if (state.session.reactionsEnabled) {
                const since = new Date(Date.now() - 60_000).toISOString();
                getRecentReactions(session.id, since).then(setReactions).catch(console.error);
            }
            if (state.session.guestsEnabled) {
                getConnectedGuests(session.id).then(setConnected).catch(console.error);
            }
            getOnlineStudentIds(session.id).then(setOnlineIds).catch(console.error);
        } catch (err) {
            console.error('poll error:', err);
        }
    }, [session?.id, session?.reactionsEnabled]);

    useEffect(() => {
        if (!session || session.status !== 'live') return;
        poll();
        pollRef.current = window.setInterval(poll, POLL_MS);
        return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    }, [session?.id, session?.status, poll]);

    // El QR vive en el panel, no en un modal: con la notebook espejada al
    // proyector, esta pantalla es la que ve la sala. Un modal que hay que
    // abrir y cerrar tapa justo los resultados que la gente está mirando.
    const joinCode = session && session !== undefined ? session.joinCode : null;
    useEffect(() => {
        if (!joinCode) { setJoinQr(''); return; }
        QRCode.toDataURL(`${window.location.origin}/vivo/${joinCode}`, {
            width: 600,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0F1419', light: '#FFFFFF' },
        }).then(setJoinQr).catch(() => setJoinQr(''));
    }, [joinCode]);

    if (!user) return null;

    const subjectName = (id: string) => subjectsMap[id]?.name ?? 'Materia';

    // ── Handlers ──

    const handleStart = async () => {
        const a = assignments[assignmentIdx];
        if (!a || starting) return;
        setStarting(true);
        setStartError('');
        try {
            const s = await startLiveSession({
                teacherId: user.id,
                schoolId: user.schoolId,
                subjectId: a.subjectId,
                courseId: a.courseId,
                title: `${subjectName(a.subjectId)} · ${a.courseName}`,
            });
            setSession(s);
        } catch (err) {
            setStartError(err instanceof Error ? err.message : 'No se pudo iniciar la clase.');
        } finally {
            setStarting(false);
        }
    };

    const handleEnd = async () => {
        if (!session) return;
        if (!window.confirm('¿Terminar la clase en vivo? Los estudiantes vuelven a su pantalla normal.')) return;
        try {
            await endLiveSession(session.id);
            setSession(null);
            setActivity(null);
            setResults(null);
        } catch (err) { console.error(err); }
    };

    const handleToggleReactions = async () => {
        if (!session) return;
        const next = !session.reactionsEnabled;
        setSession({ ...session, reactionsEnabled: next }); // optimista
        try {
            await setReactionsEnabled(session.id, next);
        } catch (err) {
            console.error(err);
            setSession({ ...session, reactionsEnabled: !next });
        }
    };

    /**
     * Abre la sala a gente sin cuenta. Apagado por default: en una clase
     * normal participan los estudiantes del curso y nadie más. Se prende
     * para una presentación, una jornada o una visita al aula.
     */
    const handleToggleGuests = async () => {
        if (!session) return;
        const next = !session.guestsEnabled;
        setSession({ ...session, guestsEnabled: next });
        try {
            await setGuestsEnabled(session.id, next);
        } catch (err) {
            console.error(err);
            setSession({ ...session, guestsEnabled: !next });
        }
    };

    const resetLauncher = () => {
        setPickedKind(null);
        setQuestion('');
        setOptions([{ id: 'a', label: '' }, { id: 'b', label: '' }]);
        setCorrectId('');
    };

    const needsOptions = pickedKind === 'quiz' || pickedKind === 'encuesta' || pickedKind === 'chips';
    const validOptions = options.filter(o => o.label.trim());
    const canLaunch = pickedKind === 'checkin'
        || (pickedKind === 'nube' && question.trim())
        || (pickedKind === 'texto' && question.trim())
        || (needsOptions && question.trim() && validOptions.length >= 2 && (pickedKind !== 'quiz' || correctId));

    const handleLaunch = async () => {
        if (!session || !pickedKind || !canLaunch || launching) return;
        setLaunching(true);
        try {
            const base = pickedKind === 'checkin'
                ? { question: '¿Cómo venís con la clase de hoy?' }
                : needsOptions
                    ? { question: question.trim(), options: validOptions, ...(pickedKind === 'quiz' ? { correctId } : {}) }
                    : { question: question.trim() };
            // Dirigida a uno o una respuesta por grupo: nunca las dos a la vez
            const config = groupMode && !targetStudent ? { ...base, groupMode: true } : base;
            const act = await launchActivity(session.id, pickedKind, config, targetStudent?.id ?? null);
            setActivity(act);
            setResults(null);
            resetLauncher();
            setTargetStudent(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'No se pudo lanzar la actividad.');
        } finally {
            setLaunching(false);
        }
    };

    const handleReveal = async () => {
        if (!activity) return;
        await setActivityStatus(activity.id, 'revealed').catch(console.error);
        setActivity({ ...activity, status: 'revealed' });
    };

    const handleCloseActivity = async () => {
        if (!activity) return;
        await setActivityStatus(activity.id, 'closed').catch(console.error);
        setActivity({ ...activity, status: 'closed' });
    };

    // ── Render: cargando ──
    if (session === undefined) {
        return <div className="cv-container"><p className="text-secondary">Cargando...</p></div>;
    }

    // ── Render: sin clase en vivo → iniciar ──
    if (!session || session.status !== 'live') {
        return (
            <div className="cv-container cv-start animate-in">
                <div className="card cv-start-card">
                    <div className="cv-start-icon"><Radio size={26} /></div>
                    <h2>Clase en vivo</h2>
                    <p className="text-secondary">
                        Dictás tu clase como siempre y, cuando lo necesitás, lanzás una actividad:
                        los celulares de tus estudiantes se convierten en su forma de participar.
                        Vos ves los resultados crecer en vivo, desde cualquier dispositivo.
                    </p>
                    <div className="cv-start-form">
                        <label className="text-sm text-secondary">¿Para qué curso?</label>
                        <select
                            className="form-select"
                            value={assignmentIdx}
                            onChange={e => setAssignmentIdx(Number(e.target.value))}
                        >
                            {assignments.map((a, i) => (
                                <option key={i} value={i}>
                                    {subjectName(a.subjectId)} — {a.courseName}
                                </option>
                            ))}
                        </select>
                        <button className="btn btn-primary w-full" onClick={handleStart} disabled={starting || assignments.length === 0}>
                            {starting ? <Loader2 size={16} className="spin" /> : <Radio size={16} />}
                            {starting ? 'Iniciando...' : 'Iniciar clase en vivo'}
                        </button>
                        {startError && <p className="text-sm text-danger">{startError}</p>}
                        <p className="text-xs text-subtle">
                            Tus estudiantes van a ver un aviso en su pantalla para entrar. Sin códigos, sin instalar nada.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Render: clase en vivo activa ──
    const alertCounts = reactions.reduce<Record<string, number>>((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
        return acc;
    }, {});

    /** Hay algo en pantalla de los estudiantes ahora mismo. */
    const hayActiva = !!activity && activity.status !== 'closed';

    const studentName = (id: string) => {
        const s = students.find(x => x.id === id);
        return s ? `${s.firstName} ${s.lastName}` : 'un estudiante';
    };
    const onlineCount = students.filter(s => onlineIds.has(s.id)).length;
    /** Grupos con al menos alguien conectado (para el modo grupal). */
    const groupsOnline = groups.filter(g => g.memberIds.some(id => onlineIds.has(id))).length;

    return (
        <div className="cv-container animate-in">
            {/* Header de sesión */}
            <div className="card cv-header">
                <div className="cv-header-info">
                    <span className="cv-live-dot" />
                    <div>
                        <h3>{session.title}</h3>
                        <p className="text-xs text-subtle">
                            {session.guestsEnabled
                                ? `Sala abierta · entran con el QR o el código ${session.joinCode ?? ''}`
                                : 'Los estudiantes participan desde su celular'}
                        </p>
                    </div>
                </div>
                <div className="cv-header-actions">
                    <button
                        className={`cv-toggle ${session.guestsEnabled ? 'on' : ''}`}
                        onClick={handleToggleGuests}
                        title={session.guestsEnabled
                            ? 'Cualquiera con el QR puede participar. Tocá para cerrar la sala.'
                            : 'Sala cerrada: solo los estudiantes del curso. Tocá para abrirla con QR.'}
                    >
                        <UserPlus size={15} />
                        <span>Invitados</span>
                        <span className={`cv-toggle-pill ${session.guestsEnabled ? 'on' : ''}`} />
                    </button>
                    {session.guestsEnabled && session.joinCode && (
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setShowQr(true)}
                            title="QR y código para proyectar"
                        >
                            <QrCode size={13} /> {session.joinCode}
                        </button>
                    )}
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setProjecting(true)}
                        title="Pantalla completa para el proyector"
                    >
                        <MonitorPlay size={13} /> Proyectar
                    </button>
                    <button
                        className={`cv-toggle ${session.reactionsEnabled ? 'on' : ''}`}
                        onClick={handleToggleReactions}
                        title={session.reactionsEnabled
                            ? 'Los estudiantes pueden mandar emojis. Tocá para apagar la botonera.'
                            : 'Botonera de emojis apagada. Tocá para prenderla.'}
                    >
                        <Smile size={15} />
                        <span>Emojis</span>
                        <span className={`cv-toggle-pill ${session.reactionsEnabled ? 'on' : ''}`} />
                    </button>
                    <button className="btn btn-outline btn-sm cv-end-btn" onClick={handleEnd}>
                        <Square size={13} /> Terminar
                    </button>
                </div>
            </div>

            {/* Puerta de entrada. Grande mientras no hay actividad —que es
                cuando la gente está entrando— y compacta cuando sí la hay,
                para no competir con los resultados pero que el que llega
                tarde siga teniendo por dónde entrar. */}
            {session.guestsEnabled && session.joinCode && (
                <div className={`card cv-join ${activity && activity.status !== 'closed' ? 'compact' : ''}`}>
                    {joinQr && (
                        <img
                            className="cv-join-qr"
                            src={joinQr}
                            alt={`Código QR para entrar a la sala ${session.joinCode}`}
                            onClick={() => setShowQr(true)}
                            title="Ampliar"
                        />
                    )}
                    <div className="cv-join-info">
                        <p className="cv-join-kicker">Escaneá para entrar</p>
                        <p className="cv-join-code">{session.joinCode}</p>
                        <p className="cv-join-meta">
                            {connected > 0
                                ? `${connected} ${connected === 1 ? 'conectado' : 'conectados'}`
                                : 'Sin cuenta, sin instalar nada'}
                        </p>
                    </div>
                </div>
            )}

            {/* Quiénes están: presencia real, no un contador. Tocás a un
                conectado y le mandás una pregunta directa. */}
            <div className="card cv-people">
                <div className="cv-people-head">
                    <h4><UsersRound size={15} /> En la sala</h4>
                    <span className="cv-people-count">
                        <span className="cv-online-dot" /> {onlineCount}/{students.length} conectados
                    </span>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowGroups(true)}>
                        👥 Grupos{groups.length > 0 ? ` (${groups.length})` : ''}
                    </button>
                </div>
                <div className="cv-people-chips">
                    {students.map(s => {
                        const online = onlineIds.has(s.id);
                        return (
                            <button
                                key={s.id}
                                className={`cv-person ${online ? 'online' : ''} ${targetStudent?.id === s.id ? 'targeted' : ''}`}
                                disabled={!online}
                                title={online
                                    ? `${s.firstName} está conectado — tocá para mandarle una pregunta directa`
                                    : `${s.firstName} no está conectado ahora`}
                                onClick={() => setTargetStudent(t => (t?.id === s.id ? null : s))}
                            >
                                <span className={`cv-person-dot ${online ? 'on' : ''}`} />
                                {s.firstName} {s.lastName[0]}.
                                {online && <Target size={12} className="cv-person-target" />}
                            </button>
                        );
                    })}
                    {students.length === 0 && (
                        <p className="text-xs text-subtle">Cargando el curso...</p>
                    )}
                </div>
            </div>

            {/* Reacciones entrantes */}
            {session.reactionsEnabled && reactions.length > 0 && (
                <div className="cv-reactions-strip card">
                    <div className="cv-reactions-flow">
                        {reactions.slice(0, 24).map((r, i) => (
                            <span key={`${r.createdAt}-${i}`} className="cv-reaction-float">{r.emoji}</span>
                        ))}
                    </div>
                    {(alertCounts['🐢'] || alertCounts['❓']) && (
                        <div className="cv-reaction-alerts">
                            {alertCounts['🐢'] > 0 && <span className="cv-alert-chip">🐢 {alertCounts['🐢']} piden ir más despacio</span>}
                            {alertCounts['❓'] > 0 && <span className="cv-alert-chip">❓ {alertCounts['❓']} no están entendiendo</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Actividad activa + resultados */}
            {activity && activity.status !== 'closed' ? (
                <div className="card cv-activity">
                    <div className="cv-activity-head">
                        <span className="badge badge-ia">
                            {LIVE_KIND_META[activity.kind].emoji} {LIVE_KIND_META[activity.kind].label}
                        </span>
                        {activity.targetStudentId && (
                            <span className="badge badge-warning" title="Solo este estudiante la ve en su celular">
                                🎯 Para {studentName(activity.targetStudentId)}
                            </span>
                        )}
                        {activity.config.groupMode && (
                            <span className="badge badge-cyan" title="Una respuesta por grupo">👥 En grupos</span>
                        )}
                        {results && (
                            <span className="cv-responded" title={activity.config.groupMode ? 'Respuestas / grupos con alguien conectado' : 'Respondieron / total del curso'}>
                                <Users size={13} /> {results.responded}/{activity.targetStudentId ? 1 : activity.config.groupMode ? Math.max(groupsOnline, 1) : results.courseTotal}
                            </span>
                        )}
                    </div>
                    {activity.config.question && <h3 className="cv-question">{activity.config.question}</h3>}

                    <LiveResultsView activity={activity} results={results} isTeacher />

                    <div className="cv-activity-actions">
                        {activity.kind === 'quiz' && activity.status === 'active' && (
                            <button className="btn btn-primary btn-sm" onClick={handleReveal}>
                                <Eye size={14} /> Revelar respuesta
                            </button>
                        )}
                        <button className="btn btn-outline btn-sm" onClick={handleCloseActivity}>
                            <Lock size={14} /> Cerrar actividad
                        </button>
                    </div>
                </div>
            ) : (
                <div className="card cv-idle">
                    <p className="text-secondary">
                        {activity ? 'Actividad cerrada. ' : ''}Seguí con tu clase tranquilo —
                        los celulares están en pausa. Lanzá una actividad cuando quieras.
                    </p>
                </div>
            )}

            {/* Lanzador */}
            <div className="card cv-launcher">
                {targetStudent && (
                    <div className="cv-target-banner" role="status">
                        <Target size={15} />
                        <span>Pregunta directa para <strong>{targetStudent.firstName} {targetStudent.lastName}</strong> — solo su celular la recibe</span>
                        <button className="btn-icon" aria-label="Quitar destinatario" onClick={() => setTargetStudent(null)}>
                            <X size={14} />
                        </button>
                    </div>
                )}
                {!pickedKind ? (
                    <>
                        <h4 className="cv-launcher-title">
                            <Plus size={15} />
                            {targetStudent
                                ? `Elegí qué mandarle a ${targetStudent.firstName}`
                                : hayActiva ? 'Lanzar la siguiente' : 'Lanzar actividad'}
                        </h4>
                        {/* Con una actividad en pantalla, "Cerrar actividad" se lee
                            como la única salida y no queda claro que la forma de
                            avanzar es elegir otra de acá abajo. */}
                        {hayActiva && !targetStudent && (
                            <p className="cv-launcher-hint">
                                Elegí la próxima y la actual se cierra sola. No hace falta cerrarla antes.
                            </p>
                        )}
                        <div className="cv-kinds">
                            {(Object.entries(LIVE_KIND_META) as [LiveActivityKind, typeof LIVE_KIND_META[LiveActivityKind]][]).map(([kind, meta]) => (
                                <button key={kind} className="cv-kind-card" onClick={() => setPickedKind(kind)}>
                                    <span className="cv-kind-emoji">{meta.emoji}</span>
                                    <span className="cv-kind-label">{meta.label}</span>
                                    <span className="cv-kind-desc">{meta.desc}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="cv-config">
                        <div className="cv-config-head">
                            <button className="btn-icon" onClick={resetLauncher} title="Volver">
                                <ChevronLeft size={16} />
                            </button>
                            <h4>{LIVE_KIND_META[pickedKind].emoji} {LIVE_KIND_META[pickedKind].label}</h4>
                        </div>

                        {pickedKind === 'checkin' ? (
                            <p className="text-sm text-secondary">
                                Cada estudiante marca cómo viene ({Object.values(FEELING_META).map(f => f.emoji).join(' ')}).
                                Vos ves el clima del aula en vivo y queda en sus señales de bienestar.
                            </p>
                        ) : (
                            <input
                                className="cv-input"
                                autoFocus
                                placeholder={pickedKind === 'nube' ? 'Ej: ¿Con qué palabra resumís lo de hoy?' : 'Escribí la pregunta...'}
                                value={question}
                                maxLength={200}
                                onChange={e => setQuestion(e.target.value)}
                            />
                        )}

                        {needsOptions && (
                            <div className="cv-options-builder">
                                {options.map((opt, i) => (
                                    <div key={opt.id} className="cv-option-row">
                                        {pickedKind === 'quiz' && (
                                            <button
                                                className={`cv-correct-pick ${correctId === opt.id ? 'on' : ''}`}
                                                title="Marcar como correcta"
                                                onClick={() => setCorrectId(opt.id)}
                                            >
                                                <CheckCircle size={15} />
                                            </button>
                                        )}
                                        <input
                                            className="cv-input"
                                            placeholder={`Opción ${String.fromCharCode(65 + i)}`}
                                            value={opt.label}
                                            maxLength={80}
                                            onChange={e => setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                                        />
                                        {options.length > 2 && (
                                            <button className="btn-icon" onClick={() => setOptions(prev => prev.filter(o => o.id !== opt.id))}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {options.length < 6 && (
                                    <button
                                        className="cv-add-option"
                                        onClick={() => setOptions(prev => [...prev, { id: `${Date.now()}`, label: '' }])}
                                    >
                                        <Plus size={13} /> Agregar opción
                                    </button>
                                )}
                                {pickedKind === 'quiz' && !correctId && (
                                    <p className="text-xs text-subtle">Tocá el círculo de la opción correcta.</p>
                                )}
                            </div>
                        )}

                        {groups.length > 0 && !targetStudent && (
                            <label className="cv-groupmode" title="Para cuando no alcanzan los celulares o la consigna es grupal">
                                <input type="checkbox" checked={groupMode} onChange={e => setGroupMode(e.target.checked)} />
                                👥 Una respuesta por grupo ({groups.length} grupos)
                            </label>
                        )}

                        <button className="btn btn-primary w-full" onClick={handleLaunch} disabled={!canLaunch || launching}>
                            {launching ? <Loader2 size={15} className="spin" /> : targetStudent ? <Target size={15} /> : <Radio size={15} />}
                            {launching ? 'Lanzando...'
                                : targetStudent ? `Mandársela a ${targetStudent.firstName}`
                                : groupMode ? 'Lanzar a los grupos'
                                : 'Lanzar al curso'}
                        </button>
                    </div>
                )}
            </div>

            {projecting && (
                <ProyectarVivo
                    session={session}
                    activity={activity}
                    results={results}
                    connected={connected}
                    onClose={() => setProjecting(false)}
                />
            )}

            {showGroups && (
                <GruposModal
                    courseId={session.courseId}
                    teacherId={user.id}
                    courseName={session.title}
                    students={students}
                    onClose={() => setShowGroups(false)}
                    onSaved={setGroups}
                />
            )}

            {showQr && session.joinCode && (
                <QrModal
                    path={`/vivo/${session.joinCode}`}
                    title={`Sala ${session.joinCode}`}
                    subtitle="Proyectalo: escanean, ponen su nombre y participan desde el celular. No hace falta cuenta. El código también se puede tipear a mano."
                    onClose={() => setShowQr(false)}
                />
            )}
        </div>
    );
}

/* ── Resultados en vivo (compartido docente/estudiante) ── */
export function LiveResultsView({ activity, results, isTeacher = false }: {
    /* Solo necesita la forma de la actividad: así la reusa también la
       pantalla de invitados, que recibe una versión recortada. */
    activity: Pick<LiveActivity, 'kind' | 'config' | 'status'>;
    results: LiveResults | null;
    isTeacher?: boolean;
}) {
    if (!results || results.responded === 0) {
        return <p className="cv-waiting">Esperando respuestas<span className="cv-ellipsis" />​</p>;
    }

    const revealed = activity.status === 'revealed';

    // Barras para opciones / checkin
    if (activity.kind === 'quiz' || activity.kind === 'encuesta' || activity.kind === 'chips' || activity.kind === 'checkin') {
        const entries: { id: string; label: string; n: number; correct?: boolean }[] =
            activity.kind === 'checkin'
                ? (Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][]).map(([key, meta]) => ({
                    id: key, label: `${meta.emoji} ${meta.label}`, n: results.counts[key] ?? 0,
                }))
                : (activity.config.options ?? []).map(o => ({
                    id: o.id, label: o.label, n: results.counts[o.id] ?? 0,
                    correct: activity.config.correctId === o.id,
                }));

        const max = Math.max(1, ...entries.map(e => e.n));
        return (
            <div className="cv-bars">
                {entries.map(e => (
                    <div key={e.id} className={`cv-bar-row ${revealed && e.correct ? 'correct' : ''} ${revealed && activity.kind === 'quiz' && !e.correct ? 'dim' : ''}`}>
                        <span className="cv-bar-label">
                            {e.label} {revealed && e.correct && '✅'}
                        </span>
                        <div className="cv-bar-track">
                            <div className="cv-bar-fill" style={{ width: `${(e.n / max) * 100}%` }} />
                            <span className="cv-bar-n">{e.n}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (activity.kind === 'nube') {
        const maxN = Math.max(1, ...results.words.map(w => w.n));
        return (
            <div className="cv-cloud">
                {results.words.map(w => (
                    <span
                        key={w.word}
                        className="cv-cloud-word"
                        style={{ fontSize: `${13 + (w.n / maxN) * 17}px`, opacity: 0.55 + (w.n / maxN) * 0.45 }}
                    >
                        {w.word}
                    </span>
                ))}
            </div>
        );
    }

    // texto libre
    return (
        <div className="cv-texts">
            {results.texts.slice(-30).map((t, i) => (
                <div key={i} className="cv-text-item">
                    {isTeacher && t.name && <span className="cv-text-name">{t.name}</span>}
                    <p>{t.text}</p>
                </div>
            ))}
        </div>
    );
}
