import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Clock, AlertTriangle, CheckCircle, Info, Users, BookOpen,
    Activity, ArrowRight, Sparkles,
    GraduationCap, ClipboardCheck, CalendarCheck, Bell, MessageSquare,
    StickyNote, Pin, AlertCircle, HeartPulse, Megaphone, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherStats } from '../services/stats.service';
import { getTodaySchedule, getNextClass, getScheduleByTeacher } from '../services/schedule.service';
import { getAlertsByTeacher, getAlertsBySchool } from '../services/alerts.service';
import { getNotificationsForUser } from '../services/notifications.service';
import { getCommunicationsBySchool } from '../services/communications.service';
import { getQuickNotes } from '../services/quick-notes.service';
import { getActivitiesByTeacher } from '../services/activities.service';
import { getTeacherAwards } from '../services/awards.service';
import { getDirectorInsights } from '../services/director-insights.service';
import { formatRelative, formatLatencyHours } from '../lib/format';
import CourseHeatmap from '../components/CourseHeatmap';
import {
    TEACHER_AWARD_META, type TeacherAward, type TeacherStats, type ScheduleBlock,
    type Alert as AlertType, type Notification as NotifType, type Communication,
    type QuickNote, type Activity as ActivityType, type DirectorInsights,
} from '../types';
import './Dashboard.css';

/* -- Shared hooks / components -- */

function useCounter(target: number, duration = 1200, decimals = 0) {
    const [count, setCount] = useState(0);
    const ref = useRef<number>(0);

    useEffect(() => {
        const startTime = performance.now();
        const step = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = eased * target;
            setCount(decimals > 0 ? parseFloat(value.toFixed(decimals)) : Math.round(value));
            if (progress < 1) ref.current = requestAnimationFrame(step);
        };
        ref.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(ref.current);
    }, [target, duration, decimals]);

    return count;
}

/* -- Color helpers -- */
const colorMap: Record<string, string> = { green: 'teal', blue: 'teal', orange: 'amber', amber: 'amber', purple: 'violet', teal: 'teal' };

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

function TeacherDashboardContent() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [teacherStats, setTeacherStats] = useState<TeacherStats>({ totalStudents: 0, classesToday: 0, pendingEvaluations: 0, avgAttendance: 0 });
    const [todayClasses, setTodayClasses] = useState<ScheduleBlock[]>([]);
    const [nextClassBlock, setNextClassBlock] = useState<ScheduleBlock | null>(null);
    const [weekSchedule, setWeekSchedule] = useState<ScheduleBlock[]>([]);
    const [myAlerts, setMyAlerts] = useState<AlertType[]>([]);
    const [myNotifs, setMyNotifs] = useState<NotifType[]>([]);
    const [notes, setNotes] = useState<QuickNote[]>([]);
    const [recentActivities, setRecentActivities] = useState<ActivityType[]>([]);
    const [myAwards, setMyAwards] = useState<TeacherAward[]>([]);

    useEffect(() => {
        if (!user) return;
        const todayIndex = new Date().getDay() === 0 ? 4 : new Date().getDay() - 1;
        const currentHour = new Date().getHours() + new Date().getMinutes() / 60;

        Promise.all([
            getTeacherStats(user.id, todayIndex),
            getTodaySchedule(user.id, todayIndex),
            getNextClass(user.id, todayIndex, currentHour),
            getScheduleByTeacher(user.id),
            getAlertsByTeacher(user.id),
            getNotificationsForUser(user.id),
            getQuickNotes(user.id),
            getActivitiesByTeacher(user.id),
            getTeacherAwards(user.id).catch(() => [] as TeacherAward[]),
        ]).then(([stats, today, next, week, alerts, notifs, qn, acts, awds]) => {
            setTeacherStats(stats);
            setTodayClasses(today);
            setNextClassBlock(next ?? today[0] ?? null);
            setWeekSchedule(week);
            setMyAlerts(alerts.slice(0, 3));
            setMyNotifs(notifs.slice(0, 3));
            setNotes(qn);
            setRecentActivities(acts.slice(0, 3));
            setMyAwards(awds.slice(0, 4));
        }).catch(console.error);
    }, [user]);

    const studentsCount = useCounter(teacherStats.totalStudents);
    const classesCount = useCounter(teacherStats.classesToday, 800);
    const evalsCount = useCounter(teacherStats.pendingEvaluations, 900);
    const attendanceCount = useCounter(teacherStats.avgAttendance, 1400, 1);

    if (!user) return null;

    const weekCalendar = getWeeklyCalendar(weekSchedule);

    return (
        <div className="dashboard-container">
            {/* Stats Row */}
            <div className="stats-grid">
                <div className="card stat-card animate-in stagger-1">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-teal"><GraduationCap size={20} /></div>
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{studentsCount}</span>
                        <span className="stat-label">Estudiantes</span>
                    </div>
                </div>

                <div className="card stat-card animate-in stagger-2">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-amber"><CalendarCheck size={20} /></div>
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{classesCount}</span>
                        <span className="stat-label">Clases Hoy</span>
                    </div>
                </div>

                <div className="card stat-card animate-in stagger-3">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-violet"><ClipboardCheck size={20} /></div>
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{evalsCount}</span>
                        <span className="stat-label">Evals. Pendientes</span>
                    </div>
                </div>

                <div className="card stat-card animate-in stagger-4">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-emerald"><Users size={20} /></div>
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{attendanceCount}%</span>
                        <span className="stat-label">Asistencia Prom.</span>
                    </div>
                </div>
            </div>

            <div className="dashboard-main-grid">
                {/* Left Column */}
                <div className="dashboard-col-left">
                    {/* Next Class */}
                    {nextClassBlock && (
                        <section className="next-class-card animate-in stagger-5">
                            <div className="next-class-header">
                                <div className="next-class-badge">
                                    <Clock size={14} />
                                    <span>Próxima clase</span>
                                </div>
                                <span className="next-class-time">
                                    {formatHour(nextClassBlock.startHour)} - {formatHour(nextClassBlock.startHour + nextClassBlock.duration)}
                                </span>
                            </div>
                            <div className="next-class-body">
                                <h3 className="next-class-subject">{nextClassBlock.subjectName}</h3>
                                <div className="next-class-meta">
                                    <span>{nextClassBlock.courseName}</span>
                                    <span className="meta-dot">·</span>
                                    <span>{nextClassBlock.room}</span>
                                    <span className="meta-dot">·</span>
                                    <span>{nextClassBlock.studentCount} est.</span>
                                </div>
                            </div>
                            <div className="next-class-actions">
                                <button className="btn btn-primary" onClick={() => navigate('/ia-lab')}>
                                    <Sparkles size={16} />
                                    Preparar con IA
                                </button>
                                <button className="btn btn-outline btn-light" onClick={() => navigate('/actividad-rapida')}>
                                    Actividad rápida
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </section>
                    )}

                    {/* Weekly Calendar */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h3 className="widget-title">Semana</h3>
                            <button className="btn btn-ghost text-sm" onClick={() => navigate('/agenda')}>
                                Ver agenda <ArrowRight size={14} />
                            </button>
                        </div>
                        <div className="weekly-calendar">
                            {weekCalendar.map((day, idx) => (
                                <div key={idx} className={`calendar-day ${day.active ? 'active' : ''}`}>
                                    <span className="cal-day-name">{day.day}</span>
                                    <span className="cal-day-number">{day.date}</span>
                                    <span className="cal-day-classes">{day.classes} clases</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Today's Classes */}
                    {todayClasses.length > 0 && (
                        <section className="card widget animate-in stagger-7">
                            <div className="widget-header">
                                <h3 className="widget-title">Hoy</h3>
                                <span className="badge badge-neutral">{todayClasses.length} clases</span>
                            </div>
                            <div className="classes-list">
                                {todayClasses.map(cls => (
                                    <div key={cls.id} className="class-item">
                                        <div className={`class-time-pill color-${colorMap[cls.colorClass] || 'teal'}`}>
                                            <span className="class-time-text">{formatHour(cls.startHour)}</span>
                                        </div>
                                        <div className="class-info">
                                            <h4>{cls.subjectName}</h4>
                                            <p>{cls.courseName} · {cls.room}</p>
                                        </div>
                                        <button className="btn btn-ghost text-sm" onClick={() => navigate('/agenda')}>
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right Column */}
                <div className="dashboard-col-right">
                    {/* Reconocimientos de la dirección */}
                    {myAwards.length > 0 && (
                        <section className="card widget animate-in stagger-4 awards-widget">
                            <div className="widget-header">
                                <h3 className="widget-title">🏅 Tus reconocimientos</h3>
                            </div>
                            <div className="awards-widget-list">
                                {myAwards.map(a => {
                                    const meta = TEACHER_AWARD_META[a.badgeCode] ?? { emoji: '🏅', label: a.badgeCode, description: '' };
                                    return (
                                        <div key={a.id} className="awards-widget-item">
                                            <span className="awards-widget-emoji">{meta.emoji}</span>
                                            <div>
                                                <span className="text-sm font-medium">{meta.label}</span>
                                                {a.message && <p className="text-xs text-secondary italic">"{a.message}"</p>}
                                                <span className="text-xs text-subtle">
                                                    {a.directorName ? `De ${a.directorName} · ` : ''}{formatRelative(a.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Notifications from Director */}
                    {myNotifs.length > 0 && (
                        <section className="card widget animate-in stagger-5">
                            <div className="widget-header">
                                <h3 className="widget-title">
                                    <Bell size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                    Notificaciones
                                </h3>
                                <span className="badge badge-cyan">{myNotifs.filter(n => !n.isRead).length} nuevas</span>
                            </div>
                            <div className="notif-widget-list">
                                {myNotifs.map(n => (
                                    <div key={n.id} className={`notif-widget-item ${!n.isRead ? 'unread' : ''}`}>
                                        <div className="notif-widget-dot" />
                                        <div className="notif-widget-body">
                                            <span className="notif-widget-title">{n.title}</span>
                                            <span className="notif-widget-from">{n.fromName}</span>
                                        </div>
                                        <span className={`badge badge-${n.priority === 'high' ? 'danger' : n.priority === 'medium' ? 'warning' : 'neutral'}`}>
                                            {n.priority === 'high' ? 'Alta' : n.priority === 'medium' ? 'Media' : 'Baja'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Alerts */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h3 className="widget-title">Alertas</h3>
                            <span className="badge badge-danger">{myAlerts.length}</span>
                        </div>
                        <div className="alerts-list">
                            {myAlerts.map(alert => (
                                <div key={alert.id} className={`alert-item alert-${alert.type}`}>
                                    <div className="alert-icon-wrap">
                                        {alert.type === 'danger' && <AlertTriangle size={16} />}
                                        {alert.type === 'warning' && <Info size={16} />}
                                        {alert.type === 'success' && <CheckCircle size={16} />}
                                    </div>
                                    <div className="alert-content">
                                        <p className="alert-msg">{alert.message}</p>
                                        <span className="alert-date">{alert.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Quick Notes */}
                    <section className="card widget animate-in stagger-7">
                        <div className="widget-header">
                            <h3 className="widget-title">
                                <StickyNote size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                Notas Rápidas
                            </h3>
                        </div>
                        <div className="notes-list">
                            {notes.map(note => (
                                <div key={note.id} className={`note-item ${note.isPinned ? 'pinned' : ''}`}>
                                    {note.isPinned && <Pin size={12} className="note-pin-icon" />}
                                    <span className="note-text">{note.text}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Actividad reciente (real: últimas actividades publicadas) */}
                    <section className="card widget animate-in stagger-8">
                        <div className="widget-header">
                            <h3 className="widget-title">Actividad</h3>
                            {recentActivities.length > 0 && (
                                <button className="btn btn-ghost text-sm" onClick={() => navigate('/actividades')}>
                                    Ver todas <ArrowRight size={14} />
                                </button>
                            )}
                        </div>
                        <div className="activity-list">
                            {recentActivities.length === 0 && (
                                <p className="text-secondary text-sm">Todavía no publicaste actividades.</p>
                            )}
                            {recentActivities.map(act => (
                                <div key={act.id} className="activity-item">
                                    <div className={`activity-dot dot-${act.sourceTool ? 'ia' : 'material'}`}>
                                        {act.sourceTool ? <Sparkles size={12} /> : <Activity size={12} />}
                                    </div>
                                    <div className="activity-content">
                                        <p className="activity-action">Publicó actividad</p>
                                        <p className="activity-subject">{act.title}</p>
                                        <span className="activity-time">
                                            {act.subjectName ? `${act.subjectName} · ` : ''}{formatRelative(act.createdAt)}
                                        </span>
                                    </div>
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
   DIRECTOR DASHBOARD
   ======================================== */

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

    return (
        <div className={`card kpi-card ${borderClass}`}>
            <div className="kpi-header">
                <span className="kpi-title">{title}</span>
                {icon}
            </div>
            <div className="kpi-value-row">
                <h3 className="kpi-value">{value}</h3>
            </div>
            <span className="kpi-caption">{caption}</span>
            {children && (
                <>
                    <button className="kpi-drilldown-toggle" onClick={() => setOpen(o => !o)}>
                        {open ? 'Ocultar' : (drilldownLabel ?? 'Ver detalle')}
                        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {open && <div className="kpi-drilldown">{children}</div>}
                </>
            )}
        </div>
    );
}

function DirectorDashboardContent() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [insights, setInsights] = useState<DirectorInsights | null>(null);
    const [schoolAlerts, setSchoolAlerts] = useState<AlertType[]>([]);
    const [recentComms, setRecentComms] = useState<Communication[]>([]);

    useEffect(() => {
        if (!user) return;
        const schoolId = user.schoolId;

        Promise.all([
            getDirectorInsights(schoolId),
            getAlertsBySchool(schoolId),
            getCommunicationsBySchool(schoolId),
        ]).then(([ins, alerts, comms]) => {
            setInsights(ins);
            setSchoolAlerts(alerts.filter(a => !a.isRead).slice(0, 4));
            setRecentComms(comms.slice(0, 3));
        }).catch(console.error);
    }, [user]);

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
                    value={wellbeingPulse.pct !== null ? `${wellbeingPulse.pct}%` : '—'}
                    caption={`${wellbeingPulse.totalCheckins} check-ins esta semana`}
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
                    icon={<Megaphone size={20} style={{ color: '#818CF8' }} />}
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
                    <h3 className="mb-1 text-lg font-semibold">Mapa Institucional</h3>
                    <p className="text-sm text-secondary mb-6">Curso × materia. Un clic en una celda o en el curso abre su ficha.</p>
                    <CourseHeatmap cellsByMetric={heatmap} />
                </div>

                {/* Right: Alerts Summary + Recent Comms */}
                <div className="director-right-col">
                    {/* Alerts Summary */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h3 className="widget-title">Alertas Pendientes</h3>
                            <span className="badge badge-danger">{schoolAlerts.length}</span>
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
                                        <p className="alert-msg">{alert.message}</p>
                                        <span className="alert-date">{alert.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Recent Communications */}
                    <section className="card widget animate-in stagger-7">
                        <div className="widget-header">
                            <h3 className="widget-title">
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
