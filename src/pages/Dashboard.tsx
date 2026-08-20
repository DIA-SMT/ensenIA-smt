import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Clock, AlertTriangle, CheckCircle, Info, Users, BookOpen,
    Activity, ArrowRight, Sparkles,
    GraduationCap, ClipboardCheck, CalendarCheck, Bell, MessageSquare,
    StickyNote, Pin, AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherStats, getDirectorStats } from '../services/stats.service';
import { getTodaySchedule, getNextClass, getScheduleByTeacher } from '../services/schedule.service';
import { getAlertsByTeacher, getAlertsBySchool } from '../services/alerts.service';
import { getNotificationsForUser } from '../services/notifications.service';
import { getTeacherUsers } from '../services/profiles.service';
import { getCommunicationsBySchool } from '../services/communications.service';
import { getQuickNotes } from '../services/quick-notes.service';
import { getActivitiesByTeacher } from '../services/activities.service';
import { formatRelative } from '../lib/format';
import type { TeacherStats, DirectorStats, ScheduleBlock, Alert as AlertType, Notification as NotifType, Communication, User as UserType, QuickNote, Activity as ActivityType } from '../types';
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
        ]).then(([stats, today, next, week, alerts, notifs, qn, acts]) => {
            setTeacherStats(stats);
            setTodayClasses(today);
            setNextClassBlock(next ?? today[0] ?? null);
            setWeekSchedule(week);
            setMyAlerts(alerts.slice(0, 3));
            setMyNotifs(notifs.slice(0, 3));
            setNotes(qn);
            setRecentActivities(acts.slice(0, 3));
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

function DirectorDashboardContent() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [dirStats, setDirStats] = useState<DirectorStats>({ totalTeachers: 0, activeClasses: 0, totalAlerts: 0, avgAttendance: 0, totalStudents: 0 });
    const [teachers, setTeachers] = useState<UserType[]>([]);
    const [schoolAlerts, setSchoolAlerts] = useState<AlertType[]>([]);
    const [recentComms, setRecentComms] = useState<Communication[]>([]);
    const [teacherWeeklyClasses, setTeacherWeeklyClasses] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!user) return;
        const schoolId = user.schoolId;

        Promise.all([
            getDirectorStats(schoolId),
            getTeacherUsers(schoolId),
            getAlertsBySchool(schoolId),
            getCommunicationsBySchool(schoolId),
        ]).then(([stats, t, alerts, comms]) => {
            setDirStats(stats);
            setTeachers(t);
            setSchoolAlerts(alerts.filter(a => !a.isRead).slice(0, 4));
            setRecentComms(comms.slice(0, 3));

            // Load weekly class counts per teacher
            Promise.all(t.map(teacher =>
                getScheduleByTeacher(teacher.id).then(blocks => ({ id: teacher.id, count: blocks.length }))
            )).then(results => {
                const map: Record<string, number> = {};
                results.forEach(r => { map[r.id] = r.count; });
                setTeacherWeeklyClasses(map);
            });
        }).catch(console.error);
    }, [user]);

    const teachersCount = useCounter(dirStats.totalTeachers, 800);
    const classesCount = useCounter(dirStats.activeClasses, 900);
    const alertsCount = useCounter(dirStats.totalAlerts, 1000);
    const attendanceCount = useCounter(dirStats.avgAttendance, 1400, 1);

    const teacherActivity = teachers.map(t => ({
        name: `${t.firstName} ${t.lastName.charAt(0)}.`,
        classes: teacherWeeklyClasses[t.id] ?? 0,
    }));
    const maxWeeklyClasses = Math.max(...teacherActivity.map(t => t.classes), 1);

    return (
        <div className="dashboard-container">
            {/* KPI Row */}
            <div className="kpi-grid">
                <div className="card kpi-card border-left-primary animate-in stagger-1">
                    <div className="kpi-header">
                        <span className="kpi-title">Docentes</span>
                        <Users size={20} className="text-primary" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{teachersCount}</h3>
                        <span className="kpi-trend text-secondary">En la escuela</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-success animate-in stagger-2">
                    <div className="kpi-header">
                        <span className="kpi-title">Clases Hoy</span>
                        <BookOpen size={20} className="text-success" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{classesCount}</h3>
                        <span className="kpi-trend text-secondary">Programadas</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-danger animate-in stagger-3">
                    <div className="kpi-header">
                        <span className="kpi-title">Alertas Activas</span>
                        <AlertCircle size={20} className="text-danger" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{alertsCount}</h3>
                        <span className="kpi-trend text-danger">Pendientes</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-warning animate-in stagger-4">
                    <div className="kpi-header">
                        <span className="kpi-title">Asistencia General</span>
                        <Users size={20} className="text-warning" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{attendanceCount}%</h3>
                        <span className="kpi-trend text-secondary">Según fichas</span>
                    </div>
                </div>
            </div>

            <div className="director-main-grid">
                {/* Left: Weekly teaching load (real: schedule_blocks per teacher) */}
                <div className="card padding-xl animate-in stagger-5">
                    <h3 className="mb-4 text-lg font-semibold">Carga Horaria Semanal</h3>
                    <p className="text-sm text-secondary mb-6">Bloques de clase programados por semana por cada docente.</p>

                    <div className="chart-wrapper">
                        {teacherActivity.map(ta => (
                            <div key={ta.name} className="bar-group">
                                <span className="bar-label">{ta.name}</span>
                                <div className="bar-track">
                                    <div
                                        className="bar-fill bg-primary"
                                        style={{ width: `${(ta.classes / maxWeeklyClasses) * 100}%` }}
                                    />
                                </div>
                                <span className="bar-value">{ta.classes}</span>
                            </div>
                        ))}
                    </div>
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
