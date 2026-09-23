import { useState, useEffect, useRef, useId, lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Clock, AlertTriangle, CheckCircle, Info, Users, BookOpen,
    Activity, ArrowRight, Sparkles,
    GraduationCap, ClipboardCheck, CalendarCheck, Bell, MessageSquare,
    StickyNote, Pin, AlertCircle, HeartPulse, Megaphone, ChevronDown, ChevronUp,
    Sunrise, ArrowUpRight, Zap, MapPin,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherStats } from '../services/stats.service';
import { getScheduleByTeacher } from '../services/schedule.service';
import { getAlertsByTeacher, getAlertsBySchool } from '../services/alerts.service';
import { getNotificationsForUser } from '../services/notifications.service';
import { getCommunicationsBySchool } from '../services/communications.service';
import { getQuickNotes } from '../services/quick-notes.service';
import { getActivitiesByTeacher } from '../services/activities.service';
import { getTeacherAwards } from '../services/awards.service';
import { getDirectorInsights } from '../services/director-insights.service';
import { computeDailyBrief, briefToPrompt } from '../services/director-brief.service';
import { getOrCreateSession, getSessionsByTeacher } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { formatRelative, formatLatencyHours } from '../lib/format';
import CourseHeatmap from '../components/CourseHeatmap';
// El lector de Markdown pesa ~47 KB y solo se usa si dirección pide la
// redacción con IA del Parte del Día: se baja recién entonces.
const MarkdownRenderer = lazy(() => import('../components/MarkdownRenderer'));
import {
    TEACHER_AWARD_META, type TeacherAward, type TeacherStats, type ScheduleBlock,
    type Alert as AlertType, type Notification as NotifType, type Communication,
    type QuickNote, type Activity as ActivityType, type DirectorInsights, type DailyBrief,
} from '../types';
import './Dashboard.css';

/* -- Shared hooks / components -- */

function formatHour(h: number): string {
    const hh = Math.floor(h);
    const mm = h % 1 ? '30' : '00';
    return `${hh}:${mm}`;
}

function getWeeklyCalendar(schedule: ScheduleBlock[]) {
    const dayLabels = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE'];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    return dayLabels.map((day, idx) => {
        const date = new Date(today);
        date.setDate(today.getDate() + mondayOffset + idx);
        const classes = schedule.filter(b => b.dayIndex === idx);
        return {
            day,
            date: date.getDate(),
            active: idx === (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
            classes: classes.length,
        };
    });
}

/* ========================================
   TEACHER DASHBOARD
   ======================================== */

/* -- Mi día (docente) -- */

function plural(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

function enCuanto(min: number): string {
    if (min < 1) return 'ya';
    if (min < 60) return `en ${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `en ${h} h ${m} min` : `en ${h} h`;
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

type EstadoDelDia =
    | { tipo: 'ahora'; clase: ScheduleBlock; minutos: number }
    | { tipo: 'proxima'; clase: ScheduleBlock; minutos: number }
    | { tipo: 'terminadas' }
    | { tipo: 'libre' };

function estadoDelDia(hoy: ScheduleBlock[], ahora: number): EstadoDelDia {
    const enCurso = hoy.find(c => ahora >= c.startHour && ahora < c.startHour + c.duration);
    if (enCurso) return { tipo: 'ahora', clase: enCurso, minutos: Math.round((enCurso.startHour + enCurso.duration - ahora) * 60) };
    const proxima = hoy.filter(c => c.startHour > ahora).sort((a, b) => a.startHour - b.startHour)[0];
    if (proxima) return { tipo: 'proxima', clase: proxima, minutos: Math.round((proxima.startHour - ahora) * 60) };
    return hoy.length ? { tipo: 'terminadas' } : { tipo: 'libre' };
}

/** La primera clase de los días que siguen en la semana. */
function proximaEnSemana(semana: ScheduleBlock[], hoyIdx: number): ScheduleBlock | null {
    const siguientes = semana
        .filter(c => c.dayIndex > hoyIdx)
        .sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour);
    return siguientes[0] ?? null;
}

/** La hora del reloj, que se actualiza sola cada minuto. */
function useAhora(): Date {
    const [ahora, setAhora] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setAhora(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return ahora;
}

function TeacherDashboardContent() {
    const { user } = useAuth();
    const ahora = useAhora();
    const [stats, setStats] = useState<TeacherStats | null>(null);
    const [statsFallo, setStatsFallo] = useState(false);
    const [semana, setSemana] = useState<ScheduleBlock[]>([]);
    const [alertasAbiertas, setAlertasAbiertas] = useState<AlertType[]>([]);
    const [myNotifs, setMyNotifs] = useState<NotifType[]>([]);
    const [notes, setNotes] = useState<QuickNote[]>([]);
    const [recentActivities, setRecentActivities] = useState<ActivityType[]>([]);
    const [myAwards, setMyAwards] = useState<TeacherAward[]>([]);

    useEffect(() => {
        if (!user) return;
        // Un solo pedido del horario: de la semana salen el día de hoy, la
        // clase en curso y la próxima. Antes eran tres pedidos distintos.
        getScheduleByTeacher(user.id).then(setSemana).catch(console.error);
        getTeacherStats(user.id)
            .then(setStats)
            .catch(err => { console.error(err); setStatsFallo(true); });
        getAlertsByTeacher(user.id).then(a => setAlertasAbiertas(a.filter(x => x.status !== 'cerrada'))).catch(console.error);
        getNotificationsForUser(user.id).then(n => setMyNotifs(n.slice(0, 3))).catch(console.error);
        getQuickNotes(user.id).then(setNotes).catch(console.error);
        getActivitiesByTeacher(user.id).then(a => setRecentActivities(a.slice(0, 3))).catch(console.error);
        getTeacherAwards(user.id).then(a => setMyAwards(a.slice(0, 4))).catch(() => setMyAwards([]));
    }, [user]);

    if (!user) return null;

    const dia = ahora.getDay();
    const hoyIdx = dia === 0 || dia === 6 ? -1 : dia - 1;
    const horaDecimal = ahora.getHours() + ahora.getMinutes() / 60;
    const hoy = semana.filter(c => c.dayIndex === hoyIdx).sort((a, b) => a.startHour - b.startHour);
    const estado = estadoDelDia(hoy, horaDecimal);
    const siguiente = estado.tipo === 'terminadas' || estado.tipo === 'libre' ? proximaEnSemana(semana, hoyIdx) : null;
    const weekCalendar = getWeeklyCalendar(semana);

    const contador = (n: number | undefined) => (stats ? String(n) : statsFallo ? '—' : '·');

    return (
        <div className="dashboard-container midia">
            {/* ── Ahora ── */}
            <section className="midia-ahora" aria-labelledby="midia-ahora-titulo">
                <div className="midia-ahora-principal">
                    {(estado.tipo === 'ahora' || estado.tipo === 'proxima') ? (
                        <>
                            <p className="midia-eyebrow">
                                <span className={`midia-pulso${estado.tipo === 'ahora' ? ' en-curso' : ''}`} aria-hidden="true" />
                                {estado.tipo === 'ahora'
                                    ? `En clase ahora · termina ${enCuanto(estado.minutos)}`
                                    : `Próxima clase · ${enCuanto(estado.minutos)}`}
                            </p>
                            <h2 id="midia-ahora-titulo" className="midia-ahora-titulo">
                                {estado.clase.subjectName} <span className="midia-ahora-curso">{estado.clase.courseName}</span>
                            </h2>
                            <p className="midia-ahora-meta">
                                {estado.clase.room && <><MapPin size={14} aria-hidden="true" /> {estado.clase.room}<span aria-hidden="true"> · </span></>}
                                <Clock size={14} aria-hidden="true" /> {formatHour(estado.clase.startHour)} a {formatHour(estado.clase.startHour + estado.clase.duration)}
                                <span aria-hidden="true"> · </span>
                                <Users size={14} aria-hidden="true" /> {plural(estado.clase.studentCount, 'estudiante', 'estudiantes')}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="midia-eyebrow">
                                <span className="midia-pulso" aria-hidden="true" />
                                {estado.tipo === 'terminadas' ? 'Por hoy, listo' : hoyIdx === -1 ? 'Fin de semana' : 'Hoy no tenés clases'}
                            </p>
                            <h2 id="midia-ahora-titulo" className="midia-ahora-titulo">
                                {estado.tipo === 'terminadas' ? 'Terminaste las clases de hoy' : 'Día sin clases'}
                            </h2>
                            <p className="midia-ahora-meta">
                                {siguiente
                                    ? <>La próxima: <strong>{siguiente.subjectName}</strong> con {siguiente.courseName}, el {DIAS[siguiente.dayIndex]} a las {formatHour(siguiente.startHour)}.</>
                                    : 'No hay más clases cargadas en tu agenda esta semana.'}
                            </p>
                        </>
                    )}
                    <div className="midia-ahora-acciones">
                        <Link to="/ia-lab" className="btn btn-primary"><Sparkles size={16} aria-hidden="true" /> Preparar con IA</Link>
                        <Link to="/actividad-rapida" className="btn btn-outline"><Zap size={16} aria-hidden="true" /> Actividad rápida</Link>
                    </div>
                </div>

                {hoy.length > 0 && (
                    <ol className="midia-linea" aria-label="Tus clases de hoy">
                        {hoy.map(c => {
                            const fin = c.startHour + c.duration;
                            const cuando = horaDecimal >= fin ? 'pasada' : horaDecimal >= c.startHour ? 'actual' : 'futura';
                            return (
                                <li key={c.id} className={`midia-linea-item ${cuando}`} aria-current={cuando === 'actual' ? 'time' : undefined}>
                                    <span className="midia-linea-hora">{formatHour(c.startHour)}</span>
                                    <span className="midia-linea-texto">
                                        <span className="midia-linea-materia">{c.subjectName}</span>
                                        <span className="midia-linea-curso">{c.courseName}{c.room ? ` · ${c.room}` : ''}</span>
                                    </span>
                                    {cuando === 'pasada' && <span className="sr-only">(ya pasó)</span>}
                                    {cuando === 'actual' && <span className="midia-linea-ahora">Ahora</span>}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>

            {/* ── Para hacer: cada número lleva a donde se resuelve ── */}
            <ul className="midia-contadores" aria-label="Para hacer" aria-busy={!stats && !statsFallo}>
                <li>
                    <Link to="/actividades" className={`midia-contador${stats && stats.entregasParaCorregir > 0 ? ' pendiente' : ''}`}>
                        <span className="midia-contador-icono" aria-hidden="true"><ClipboardCheck size={20} /></span>
                        <span className="midia-contador-num">{contador(stats?.entregasParaCorregir)}</span>
                        <span className="midia-contador-et">{stats?.entregasParaCorregir === 1 ? 'entrega para corregir' : 'entregas para corregir'}</span>
                        <ArrowUpRight size={16} className="midia-contador-ir" aria-hidden="true" />
                    </Link>
                </li>
                <li>
                    <Link to="/alerts" className={`midia-contador${alertasAbiertas.length > 0 ? ' alerta' : ''}`}>
                        <span className="midia-contador-icono" aria-hidden="true"><Bell size={20} /></span>
                        <span className="midia-contador-num">{alertasAbiertas.length}</span>
                        <span className="midia-contador-et">{alertasAbiertas.length === 1 ? 'alerta abierta' : 'alertas abiertas'}</span>
                        <ArrowUpRight size={16} className="midia-contador-ir" aria-hidden="true" />
                    </Link>
                </li>
                <li>
                    <Link to="/students" className="midia-contador">
                        <span className="midia-contador-icono" aria-hidden="true"><GraduationCap size={20} /></span>
                        <span className="midia-contador-num">{contador(stats?.totalStudents)}</span>
                        <span className="midia-contador-et">{stats?.totalStudents === 1 ? 'estudiante en tus cursos' : 'estudiantes en tus cursos'}</span>
                        <ArrowUpRight size={16} className="midia-contador-ir" aria-hidden="true" />
                    </Link>
                </li>
                <li>
                    <Link to="/agenda" className="midia-contador">
                        <span className="midia-contador-icono" aria-hidden="true"><CalendarCheck size={20} /></span>
                        <span className="midia-contador-num">{semana.length}</span>
                        <span className="midia-contador-et">{semana.length === 1 ? 'clase esta semana' : 'clases esta semana'}</span>
                        <ArrowUpRight size={16} className="midia-contador-ir" aria-hidden="true" />
                    </Link>
                </li>
            </ul>

            <div className="dashboard-main-grid">
                <div className="dashboard-col-left">
                    <section className="card widget" aria-labelledby="midia-semana">
                        <div className="widget-header">
                            <h2 className="widget-title" id="midia-semana">Semana</h2>
                            <Link to="/agenda" className="btn btn-ghost btn-sm">Ver agenda <ArrowRight size={14} aria-hidden="true" /></Link>
                        </div>
                        <ol className="weekly-calendar">
                            {weekCalendar.map((day, idx) => (
                                <li key={idx} className={`calendar-day ${day.active ? 'active' : ''}`} aria-current={day.active ? 'date' : undefined}>
                                    <span className="cal-day-name"><span aria-hidden="true">{day.day}</span><span className="sr-only">{DIAS[idx]}</span></span>
                                    <span className="cal-day-number">{day.date}</span>
                                    <span className="cal-day-classes">{day.classes === 0 ? 'sin clases' : plural(day.classes, 'clase', 'clases')}</span>
                                </li>
                            ))}
                        </ol>
                    </section>

                    <section className="card widget" aria-labelledby="midia-actividad">
                        <div className="widget-header">
                            <h2 className="widget-title" id="midia-actividad">Tus últimas actividades</h2>
                            {recentActivities.length > 0 && (
                                <Link to="/actividades" className="btn btn-ghost btn-sm">Ver todas <ArrowRight size={14} aria-hidden="true" /></Link>
                            )}
                        </div>
                        <div className="activity-list">
                            {recentActivities.length === 0 && (
                                <p className="text-secondary text-sm">Todavía no publicaste actividades.</p>
                            )}
                            {recentActivities.map(act => (
                                <div key={act.id} className="activity-item">
                                    <div className={`activity-dot dot-${act.sourceTool ? 'ia' : 'material'}`} aria-hidden="true">
                                        {act.sourceTool ? <Sparkles size={12} /> : <Activity size={12} />}
                                    </div>
                                    <div className="activity-content">
                                        <Link to={`/actividades/${act.id}`} className="activity-subject">{act.title || "Actividad sin título"}</Link>
                                        <span className="activity-time">
                                            {act.subjectName ? `${act.subjectName} · ` : ''}{formatRelative(act.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="dashboard-col-right">
                    <section className="card widget" aria-labelledby="midia-alertas">
                        <div className="widget-header">
                            <h2 className="widget-title" id="midia-alertas">Alertas abiertas</h2>
                            {alertasAbiertas.length > 0 && <Link to="/alerts" className="btn btn-ghost btn-sm">Ver todas <ArrowRight size={14} aria-hidden="true" /></Link>}
                        </div>
                        {alertasAbiertas.length === 0 ? (
                            <p className="text-secondary text-sm">No hay alertas abiertas en tus cursos.</p>
                        ) : (
                            <ul className="alerts-list">
                                {alertasAbiertas.slice(0, 3).map(alert => (
                                    <li key={alert.id} className={`alert-item alert-${alert.type}`}>
                                        <div className="alert-icon-wrap" aria-hidden="true">
                                            {alert.type === 'danger' && <AlertTriangle size={16} />}
                                            {alert.type === 'warning' && <Info size={16} />}
                                            {alert.type === 'success' && <CheckCircle size={16} />}
                                            {alert.type === 'info' && <Info size={16} />}
                                        </div>
                                        <div className="alert-content">
                                            <p className="alert-msg">
                                                <span className="sr-only">{alert.type === 'danger' ? 'Urgente: ' : alert.type === 'warning' ? 'Atención: ' : ''}</span>
                                                {alert.message}
                                            </p>
                                            <span className="alert-date">{alert.date}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {myNotifs.length > 0 && (
                        <section className="card widget" aria-labelledby="midia-avisos">
                            <div className="widget-header">
                                <h2 className="widget-title" id="midia-avisos">Avisos de dirección</h2>
                                {myNotifs.some(n => !n.isRead) && (
                                    <span className="badge badge-cyan">{plural(myNotifs.filter(n => !n.isRead).length, 'nuevo', 'nuevos')}</span>
                                )}
                            </div>
                            <ul className="notif-widget-list">
                                {myNotifs.map(n => (
                                    <li key={n.id} className={`notif-widget-item ${!n.isRead ? 'unread' : ''}`}>
                                        <div className="notif-widget-dot" aria-hidden="true" />
                                        <div className="notif-widget-body">
                                            <span className="notif-widget-title">{!n.isRead && <span className="sr-only">Sin leer: </span>}{n.title}</span>
                                            <span className="notif-widget-from">{n.fromName}</span>
                                        </div>
                                        <span className={`badge badge-${n.priority === 'high' ? 'danger' : n.priority === 'medium' ? 'warning' : 'neutral'}`}>
                                            <span className="sr-only">Prioridad </span>{n.priority === 'high' ? 'Alta' : n.priority === 'medium' ? 'Media' : 'Baja'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {myAwards.length > 0 && (
                        <section className="card widget awards-widget" aria-labelledby="midia-reconocimientos">
                            <div className="widget-header">
                                <h2 className="widget-title" id="midia-reconocimientos"><span aria-hidden="true">🏅 </span>Tus reconocimientos</h2>
                            </div>
                            <ul className="awards-widget-list">
                                {myAwards.map(a => {
                                    const meta = TEACHER_AWARD_META[a.badgeCode] ?? { emoji: '🏅', label: a.badgeCode, description: '' };
                                    return (
                                        <li key={a.id} className="awards-widget-item">
                                            <span className="awards-widget-emoji" aria-hidden="true">{meta.emoji}</span>
                                            <div>
                                                <span className="text-sm font-medium">{meta.label}</span>
                                                {a.message && <p className="text-xs text-secondary italic">"{a.message}"</p>}
                                                <span className="text-xs text-subtle">
                                                    {a.directorName ? `De ${a.directorName} · ` : ''}{formatRelative(a.createdAt)}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {notes.length > 0 && (
                        <section className="card widget" aria-labelledby="midia-notas">
                            <div className="widget-header">
                                <h2 className="widget-title" id="midia-notas"><StickyNote size={16} aria-hidden="true" /> Notas rápidas</h2>
                            </div>
                            <ul className="notes-list">
                                {notes.map(note => (
                                    <li key={note.id} className={`note-item ${note.isPinned ? 'pinned' : ''}`}>
                                        {note.isPinned && <><Pin size={12} className="note-pin-icon" aria-hidden="true" /><span className="sr-only">Fijada: </span></>}
                                        <span className="note-text">{note.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ========================================
   DIRECTOR DASHBOARD
   ======================================== */

/**
 * Por debajo de esta cantidad de respuestas, un porcentaje engaña: un solo
 * check-in positivo daba "100 % de bienestar".
 */
const MUESTRA_MINIMA = 5;

/** Tarjeta KPI con drill-down opcional: un clic revela la lista de nombres detrás del número. */
function KpiCard({
    borderClass, icon, title, value, caption, drilldownLabel, children,
}: {
    borderClass: string;
    icon: ReactNode;
    title: string;
    value: string;
    caption: string;
    drilldownLabel?: string;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const idDetalle = useId();

    return (
        <section className={`card kpi-card ${borderClass}${open ? ' abierta' : ''}`} aria-label={title}>
            <div className="kpi-header">
                <h2 className="kpi-title">{title}</h2>
                <span aria-hidden="true">{icon}</span>
            </div>
            <div className="kpi-value-row">
                <p className="kpi-value">{value}</p>
            </div>
            <p className="kpi-caption">{caption}</p>
            {children && (
                <>
                    <button
                        type="button"
                        className="kpi-drilldown-toggle"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        aria-controls={open ? idDetalle : undefined}
                    >
                        {open ? 'Ocultar' : (drilldownLabel ?? 'Ver detalle')}
                        {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                    </button>
                    {open && <div className="kpi-drilldown" id={idDetalle}>{children}</div>}
                </>
            )}
        </section>
    );
}

/** Parte del Día: hechos de las últimas 24 h + redacción IA opcional. */
function DailyBriefWidget({ brief }: { brief: DailyBrief }) {
    const { user, school } = useAuth();
    const [aiText, setAiText] = useState('');
    const [aiStreaming, setAiStreaming] = useState(false);
    const [aiError, setAiError] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    // Una sola sesión de chat por directora: getOrCreateSession con
    // classId null siempre crea, así que la buscamos por título primero.
    const sessionIdRef = useRef<string | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const resolveSessionId = async (userId: string): Promise<string> => {
        if (sessionIdRef.current) return sessionIdRef.current;
        const existing = (await getSessionsByTeacher(userId)).find(s => s.title === 'Parte del día');
        const session = existing ?? await getOrCreateSession(userId, null, { title: 'Parte del día' });
        sessionIdRef.current = session.id;
        return session.id;
    };

    const handleRedact = async () => {
        if (!user || aiStreaming) return;
        // El controller nace ANTES del primer await: un desmonte temprano
        // también tiene que poder abortar la preparación del stream.
        const controller = new AbortController();
        abortRef.current = controller;
        setAiStreaming(true);
        setAiError('');
        setAiText('');
        try {
            const sessionId = await resolveSessionId(user.id);
            if (controller.signal.aborted) return;
            const prompt = briefToPrompt(brief, school?.name ?? 'la escuela');
            await streamChat(
                [{ role: 'user', content: prompt }],
                { subjectName: 'Gestión institucional', courseName: school?.shortName ?? '' },
                { sessionId },
                {
                    onToken: t => setAiText(prev => prev + t),
                    onDone: () => setAiStreaming(false),
                    onError: e => { setAiError(e.message); setAiStreaming(false); },
                },
                controller.signal,
            );
        } catch {
            setAiError('No se pudo generar el parte. Probá de nuevo.');
        } finally {
            // streamChat puede resolver sin emitir 'done' ni 'error' (stream
            // cortado limpio o abort): nunca dejar el botón clavado.
            setAiStreaming(false);
        }
    };

    const counts = [
        { n: brief.escalatedAlerts, label: 'escaladas' },
        { n: brief.newAlerts, label: 'alertas nuevas' },
        { n: brief.negativeCheckins, label: 'check-ins negativos' },
        { n: brief.pendingCitations, label: 'citaciones sin confirmar' },
        { n: brief.newSubmissions, label: 'entregas' },
        { n: brief.newActivities, label: 'actividades' },
    ];

    return (
        <section className="card widget brief-widget animate-in stagger-1">
            <div className="widget-header">
                <h3 className="widget-title" aria-level={2}>
                    <Sunrise size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Parte del Día
                </h3>
                <button className="btn btn-outline btn-sm" onClick={handleRedact} disabled={aiStreaming}>
                    <Sparkles size={14} />
                    {aiStreaming ? 'Redactando…' : 'Redactar con IA'}
                </button>
            </div>

            <div className="brief-counts">
                {counts.filter(c => c.n > 0).map(c => (
                    <span key={c.label} className="brief-count">
                        <b>{c.n}</b> {c.label}
                    </span>
                ))}
                {counts.every(c => c.n === 0) && (
                    <span className="brief-count quiet">Sin novedades en las últimas 24 horas.</span>
                )}
            </div>

            {brief.items.length > 0 && (
                <ul className="brief-items">
                    {brief.items.slice(0, 8).map((item, i) => (
                        <li key={i} className={`brief-item brief-${item.kind}`}>{item.text}</li>
                    ))}
                    {brief.items.length > 8 && (
                        <li className="brief-item quiet">+ {brief.items.length - 8} novedades más</li>
                    )}
                </ul>
            )}

            {(aiText || aiError) && (
                <div className="brief-ai">
                    {aiError
                        ? <p className="text-danger text-sm">{aiError}</p>
                        : <Suspense fallback={<p className="text-secondary text-sm">Preparando el texto…</p>}><MarkdownRenderer content={aiText} /></Suspense>}
                </div>
            )}
        </section>
    );
}

function DirectorDashboardContent() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [insights, setInsights] = useState<DirectorInsights | null>(null);
    const [brief, setBrief] = useState<DailyBrief | null>(null);
    const [schoolAlerts, setSchoolAlerts] = useState<AlertType[]>([]);
    const [openAlertCount, setOpenAlertCount] = useState(0);
    const [recentComms, setRecentComms] = useState<Communication[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!user) return;
        const schoolId = user.schoolId;
        setLoadError(false);

        Promise.all([
            getDirectorInsights(schoolId),
            computeDailyBrief(schoolId),
            getAlertsBySchool(schoolId),
            getCommunicationsBySchool(schoolId),
        ]).then(([ins, db, alerts, comms]) => {
            setInsights(ins);
            setBrief(db);
            const open = alerts.filter(a => a.status !== 'cerrada');
            setOpenAlertCount(open.length);
            setSchoolAlerts(open.slice(0, 4));
            setRecentComms(comms.slice(0, 3));
        }).catch(err => {
            console.error(err);
            setLoadError(true);
        });
    }, [user, reloadKey]);

    if (loadError) {
        return (
            <div className="dashboard-container">
                <div className="card padding-xl" style={{ textAlign: 'center' }}>
                    <p className="text-secondary" style={{ marginBottom: 12 }}>
                        No se pudo cargar el tablero. Revisá la conexión.
                    </p>
                    <button className="btn btn-primary" onClick={() => setReloadKey(k => k + 1)}>
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (!insights) {
        return (
            <div className="dashboard-container">
                <p className="text-secondary">Cargando tablero…</p>
            </div>
        );
    }

    const { riskIndex, curriculumCoverage, wellbeingPulse, teacherAdoption, familyResponse, feedbackLatency, heatmap } = insights;
    const worstCoverage = [...curriculumCoverage.bySubjectCourse].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

    return (
        <div className="dashboard-container">
            {/* Parte del Día */}
            {brief && <DailyBriefWidget brief={brief} />}

            {/* KPI Row */}
            <div className="kpi-grid">
                <KpiCard
                    borderClass="border-left-danger"
                    icon={<AlertCircle size={20} className="text-danger" />}
                    title="En Riesgo"
                    value={`${riskIndex.pct}%`}
                    caption={`${riskIndex.atRiskCount} de ${riskIndex.totalStudents} estudiantes con 2+ señales`}
                >
                    {riskIndex.atRiskStudents.length === 0
                        ? <p className="kpi-empty">Nadie con 2 o más señales activas.</p>
                        : riskIndex.atRiskStudents.slice(0, 8).map(s => (
                            <button key={s.studentId} className="kpi-row" onClick={() => navigate(`/cursos/${s.courseId}`)}>
                                <span>{s.firstName} {s.lastName}</span>
                                <span className="kpi-row-meta">{s.courseName} · {s.signalCount} señales</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-primary"
                    icon={<BookOpen size={20} className="text-primary" />}
                    title="Cobertura Curricular"
                    value={curriculumCoverage.pct !== null ? `${curriculumCoverage.pct}%` : '—'}
                    caption="clases dictadas del programa"
                >
                    {worstCoverage.length === 0
                        ? <p className="kpi-empty">Sin planificación cargada todavía.</p>
                        : worstCoverage.slice(0, 8).map(c => (
                            <button key={`${c.subjectId}-${c.courseId}`} className="kpi-row" onClick={() => navigate(`/cursos/${c.courseId}`)}>
                                <span>{c.subjectName} · {c.courseName}</span>
                                <span className="kpi-row-meta">{c.numerator}/{c.denominator} clases</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-success"
                    icon={<HeartPulse size={20} className="text-success" />}
                    title="Pulso de Bienestar"
                    value={wellbeingPulse.pct !== null && wellbeingPulse.totalCheckins >= MUESTRA_MINIMA ? `${wellbeingPulse.pct}%` : '—'}
                    caption={wellbeingPulse.totalCheckins >= MUESTRA_MINIMA
                        ? `positivos, sobre ${wellbeingPulse.totalCheckins} check-ins esta semana`
                        : wellbeingPulse.totalCheckins === 0
                            ? 'sin check-ins esta semana'
                            : `${wellbeingPulse.totalCheckins === 1 ? 'un check-in' : `${wellbeingPulse.totalCheckins} check-ins`} esta semana: pocos para sacar un porcentaje`}
                >
                    {wellbeingPulse.byCourse.length === 0
                        ? <p className="kpi-empty">Sin check-ins esta semana.</p>
                        : wellbeingPulse.byCourse.slice(0, 8).map(c => (
                            <button key={c.courseId} className="kpi-row" onClick={() => navigate(`/cursos/${c.courseId}`)}>
                                <span>{c.courseName}</span>
                                <span className="kpi-row-meta">{c.positivePct}% positivos · {c.totalCheckins}</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-warning"
                    icon={<Users size={20} className="text-warning" />}
                    title="Adopción Docente"
                    value={`${teacherAdoption.pct}%`}
                    caption={`${teacherAdoption.activeCount} de ${teacherAdoption.totalTeachers} activos (14 días)`}
                    drilldownLabel="Ver quién necesita acompañamiento"
                >
                    {teacherAdoption.inactiveTeachers.length === 0
                        ? <p className="kpi-empty">Todo el equipo activo.</p>
                        : teacherAdoption.inactiveTeachers.slice(0, 8).map(t => (
                            <div key={t.teacherId} className="kpi-row kpi-row-static">
                                <span>{t.firstName} {t.lastName}</span>
                                <span className="kpi-row-meta">{t.lastActiveAt ? formatRelative(t.lastActiveAt) : 'Nunca publicó'}</span>
                            </div>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-violet"
                    icon={<Megaphone size={20} style={{ color: 'var(--accent-ia)' }} />}
                    title="Respuesta de Familias"
                    value={familyResponse.readPct !== null ? `${familyResponse.readPct}%` : '—'}
                    caption={familyResponse.citationConfirmedPct !== null
                        ? `${familyResponse.citationConfirmedPct}% de citaciones respondidas a 72h`
                        : 'sin citaciones recientes'}
                >
                    {familyResponse.recentNotices.length === 0
                        ? <p className="kpi-empty">Sin comunicados recientes.</p>
                        : familyResponse.recentNotices.map(n => (
                            <div key={n.noticeId} className="kpi-row kpi-row-static">
                                <span>{n.title}</span>
                                <span className="kpi-row-meta">{n.readPct !== null ? `${n.readCount}/${n.audienceSize} leídos` : 'sin destinatarios'}</span>
                            </div>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-info"
                    icon={<Clock size={20} className="text-subtle" />}
                    title="Latencia de Devolución"
                    value={feedbackLatency.medianHours !== null ? formatLatencyHours(feedbackLatency.medianHours) : '—'}
                    caption={`mediana sobre ${feedbackLatency.sampleSize} entregas corregidas (30 días)`}
                >
                    {feedbackLatency.pendingReview.length === 0
                        ? <p className="kpi-empty">Nada esperando devolución.</p>
                        : feedbackLatency.pendingReview.map(p => (
                            <div key={p.submissionId} className="kpi-row kpi-row-static">
                                <span>{p.studentName} · {p.activityTitle}</span>
                                <span className="kpi-row-meta">{formatLatencyHours(p.hoursWaiting)} esperando</span>
                            </div>
                        ))}
                </KpiCard>
            </div>

            <div className="director-main-grid">
                {/* Left: Mapa institucional curso × materia */}
                <div className="card padding-xl animate-in stagger-5">
                    <h3 className="mb-1 text-lg font-semibold" aria-level={2}>Mapa Institucional</h3>
                    <p className="text-sm text-secondary mb-6">Curso × materia. Un clic en una celda o en el curso abre su ficha.</p>
                    <CourseHeatmap cellsByMetric={heatmap} />
                </div>

                {/* Right: Alerts Summary + Recent Comms */}
                <div className="director-right-col">
                    {/* Alerts Summary */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h3 className="widget-title" aria-level={2}>Alertas Pendientes</h3>
                            <span className="badge badge-danger">{openAlertCount}</span>
                        </div>
                        <div className="alerts-list">
                            {schoolAlerts.map(alert => (
                                <div key={alert.id} className={`alert-item alert-${alert.type}`}>
                                    <div className="alert-icon-wrap">
                                        {alert.type === 'danger' && <AlertTriangle size={16} />}
                                        {alert.type === 'warning' && <Info size={16} />}
                                        {alert.type === 'success' && <CheckCircle size={16} />}
                                    </div>
                                    <div className="alert-content">
                                        <p className="alert-msg">
                                            {alert.escalatedAt && (
                                                <span className="badge badge-escalada" style={{ marginRight: 6 }}>
                                                    <ArrowUpRight size={11} /> Escalada
                                                </span>
                                            )}
                                            {alert.message}
                                        </p>
                                        <span className="alert-date">{alert.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Recent Communications */}
                    <section className="card widget animate-in stagger-7">
                        <div className="widget-header">
                            <h3 className="widget-title" aria-level={2}>
                                <MessageSquare size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Últimos Comunicados
                            </h3>
                            <button className="btn btn-ghost text-sm" onClick={() => navigate('/comunicaciones')}>
                                Ver todos <ArrowRight size={14} />
                            </button>
                        </div>
                        <div className="comms-widget-list">
                            {recentComms.map(comm => (
                                <div key={comm.id} className="comms-widget-item">
                                    <div className="comms-widget-body">
                                        <span className="comms-widget-subject">{comm.subject}</span>
                                        <span className="comms-widget-to">Para: {comm.toNames.join(', ')}</span>
                                    </div>
                                    <span className="comms-widget-date">
                                        {new Date(comm.sentAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

/* ========================================
   MAIN EXPORT
   ======================================== */

export default function Dashboard() {
    const { isDirector } = useAuth();
    return isDirector ? <DirectorDashboardContent /> : <TeacherDashboardContent />;
}
