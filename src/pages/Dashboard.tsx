import { useState, useEffect, useRef } from 'react';
import {
    Clock, AlertTriangle, CheckCircle, Info, Users, BookOpen,
    Activity, TrendingUp, TrendingDown, ArrowRight, Sparkles,
    GraduationCap, ClipboardCheck, CalendarCheck, Bell, MessageSquare,
    StickyNote, Pin, AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getTeacherStats, getDirectorStats, getWeeklyCalendar,
    sparklineData, statsTrends,
    getTodaySchedule, getNextClass, getAlertsByTeacher, getAlertsBySchool,
    getTeacherUsers, getScheduleByTeacher, getCommunicationsBySchool
} from '../data';
import { getNotificationsForUser } from '../data/mockNotifications';
import type { ScheduleBlock, Alert as AlertType, Notification as NotifType } from '../types';
import './Dashboard.css';

/* ── Shared hooks / components ── */

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

function Sparkline({ data, color, className = '' }: { data: number[]; color: string; className?: string }) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 100;
    const h = 32;
    const pad = 2;

    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x},${y}`;
    });

    const areaPoints = [...points, `${pad + w - pad * 2},${h}`, `${pad},${h}`].join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={`sparkline-svg ${className}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={areaPoints} fill={`url(#grad-${color})`} />
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="2.5" fill={color} />
        </svg>
    );
}

function TrendBadge({ value, up }: { value: number; up: boolean }) {
    if (value === 0) return <span className="trend-badge trend-neutral">Estable</span>;
    return (
        <span className={`trend-badge ${up ? 'trend-up' : 'trend-down'}`}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(value)}%
        </span>
    );
}

/* ── Color helpers ── */
const colorMap: Record<string, string> = { green: 'teal', blue: 'teal', orange: 'amber', amber: 'amber', purple: 'violet', teal: 'teal' };

function formatHour(h: number): string {
    const hh = Math.floor(h);
    const mm = h % 1 ? '30' : '00';
    return `${hh}:${mm}`;
}

/* ═══════════════════════════════════════
   TEACHER DASHBOARD
   ═══════════════════════════════════════ */

function TeacherDashboardContent() {
    const { user } = useAuth();
    if (!user) return null;

    const todayIndex = new Date().getDay() === 0 ? 4 : new Date().getDay() - 1;
    const currentHour = new Date().getHours() + new Date().getMinutes() / 60;

    const teacherStats = getTeacherStats(user, todayIndex);
    const todayClasses = getTodaySchedule(user.id, todayIndex);
    const nextClass = getNextClass(user.id, todayIndex, currentHour) || todayClasses[0];
    const weekCalendar = getWeeklyCalendar(user.id);
    const myAlerts = getAlertsByTeacher(user.id).slice(0, 3);
    const myNotifs = getNotificationsForUser(user.id).slice(0, 3);

    const studentsCount = useCounter(teacherStats.totalStudents);
    const classesCount = useCounter(teacherStats.classesToday, 800);
    const evalsCount = useCounter(teacherStats.pendingEvaluations, 900);
    const attendanceCount = useCounter(teacherStats.avgAttendance, 1400, 1);

    // Mock quick notes
    const [notes] = useState([
        { id: '1', text: 'Preparar examen parcial Biología para el viernes', isPinned: true },
        { id: '2', text: 'Revisar trabajos prácticos de Química — 5to 2da', isPinned: false },
        { id: '3', text: 'Coordinar con Lab IA actividad interactiva', isPinned: false },
    ]);

    // Mock recent activity
    const recentActivity = [
        { id: 1, action: 'Generó actividad con IA', subject: 'Biología Celular', time: 'Hace 2 horas', type: 'ia' },
        { id: 2, action: 'Calificó evaluaciones', subject: 'Física', time: 'Ayer, 18:30', type: 'eval' },
        { id: 3, action: 'Subió material', subject: 'Química Orgánica', time: 'Lunes, 09:15', type: 'material' },
    ];

    return (
        <div className="dashboard-container">
            {/* Stats Row */}
            <div className="stats-grid">
                <div className="card stat-card animate-in stagger-1">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-teal"><GraduationCap size={20} /></div>
                        <TrendBadge {...statsTrends.students} />
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{studentsCount}</span>
                        <span className="stat-label">Estudiantes</span>
                    </div>
                    <Sparkline data={sparklineData.students} color="#00A8FF" />
                </div>

                <div className="card stat-card animate-in stagger-2">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-amber"><CalendarCheck size={20} /></div>
                        <TrendBadge {...statsTrends.classes} />
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{classesCount}</span>
                        <span className="stat-label">Clases Hoy</span>
                    </div>
                    <Sparkline data={sparklineData.classes} color="#FBBF24" />
                </div>

                <div className="card stat-card animate-in stagger-3">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-violet"><ClipboardCheck size={20} /></div>
                        <TrendBadge {...statsTrends.evaluations} />
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{evalsCount}</span>
                        <span className="stat-label">Evals. Pendientes</span>
                    </div>
                    <Sparkline data={sparklineData.evaluations} color="#818CF8" />
                </div>

                <div className="card stat-card animate-in stagger-4">
                    <div className="stat-header">
                        <div className="stat-icon-wrap icon-emerald"><Users size={20} /></div>
                        <TrendBadge {...statsTrends.attendance} />
                    </div>
                    <div className="stat-body">
                        <span className="stat-value">{attendanceCount}%</span>
                        <span className="stat-label">Asistencia Prom.</span>
                    </div>
                    <Sparkline data={sparklineData.attendance} color="#10D981" />
                </div>
            </div>

            <div className="dashboard-main-grid">
                {/* Left Column */}
                <div className="dashboard-col-left">
                    {/* Next Class */}
                    {nextClass && (
                        <section className="next-class-card animate-in stagger-5">
                            <div className="next-class-header">
                                <div className="next-class-badge">
                                    <Clock size={14} />
                                    <span>Próxima clase</span>
                                </div>
                                <span className="next-class-time">
                                    {formatHour(nextClass.startHour)} - {formatHour(nextClass.startHour + nextClass.duration)}
                                </span>
                            </div>
                            <div className="next-class-body">
                                <h3 className="next-class-subject">{nextClass.subjectName}</h3>
                                <div className="next-class-meta">
                                    <span>{nextClass.courseName}</span>
                                    <span className="meta-dot">·</span>
                                    <span>{nextClass.room}</span>
                                    <span className="meta-dot">·</span>
                                    <span>{nextClass.studentCount} est.</span>
                                </div>
                            </div>
                            <div className="next-class-actions">
                                <button className="btn btn-primary">
                                    <Sparkles size={16} />
                                    Preparar con IA
                                </button>
                                <button className="btn btn-outline btn-light">
                                    Tomar asistencia
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </section>
                    )}

                    {/* Weekly Calendar */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h3 className="widget-title">Semana</h3>
                            <button className="btn btn-ghost text-sm">Ver agenda <ArrowRight size={14} /></button>
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
                                        <button className="btn btn-ghost text-sm">
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

                    {/* Activity */}
                    <section className="card widget animate-in stagger-8">
                        <div className="widget-header">
                            <h3 className="widget-title">Actividad</h3>
                        </div>
                        <div className="activity-list">
                            {recentActivity.map(act => (
                                <div key={act.id} className="activity-item">
                                    <div className={`activity-dot dot-${act.type}`}>
                                        {act.type === 'ia' && <Sparkles size={12} />}
                                        {act.type === 'eval' && <BookOpen size={12} />}
                                        {act.type === 'material' && <Activity size={12} />}
                                    </div>
                                    <div className="activity-content">
                                        <p className="activity-action">{act.action}</p>
                                        <p className="activity-subject">{act.subject}</p>
                                        <span className="activity-time">{act.time}</span>
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

/* ═══════════════════════════════════════
   DIRECTOR DASHBOARD
   ═══════════════════════════════════════ */

function DirectorDashboardContent() {
    const dirStats = getDirectorStats();
    const teachers = getTeacherUsers();
    const schoolAlerts = getAlertsBySchool('school-1').filter(a => !a.isRead).slice(0, 4);
    const recentComms = getCommunicationsBySchool('school-1').slice(0, 3);

    const teachersCount = useCounter(dirStats.totalTeachers, 800);
    const classesCount = useCounter(dirStats.activeClasses, 900);
    const alertsCount = useCounter(dirStats.totalAlerts, 1000);
    const attendanceCount = useCounter(dirStats.avgAttendance, 1400, 1);

    // Compute teacher engagement (classes per week)
    const teacherActivity = teachers.map(t => {
        const weeklyClasses = getScheduleByTeacher(t.id).length;
        return { name: `${t.firstName} ${t.lastName.charAt(0)}.`, classes: weeklyClasses, max: 10 };
    });

    return (
        <div className="dashboard-container">
            {/* KPI Row */}
            <div className="kpi-grid">
                <div className="card kpi-card border-left-primary animate-in stagger-1">
                    <div className="kpi-header">
                        <span className="kpi-title">Docentes Activos</span>
                        <Users size={20} className="text-primary" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{teachersCount}</h3>
                        <span className="kpi-trend text-success"><TrendingUp size={14} /> Activos</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-success animate-in stagger-2">
                    <div className="kpi-header">
                        <span className="kpi-title">Clases Hoy</span>
                        <BookOpen size={20} className="text-success" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">{classesCount}</h3>
                        <span className="kpi-trend text-secondary">En curso</span>
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
                        <span className="kpi-trend text-success"><TrendingUp size={14} /> +1.2%</span>
                    </div>
                </div>
            </div>

            <div className="director-main-grid">
                {/* Left: Teacher Activity */}
                <div className="card padding-xl animate-in stagger-5">
                    <h3 className="mb-4 text-lg font-semibold">Actividad por Docente</h3>
                    <p className="text-sm text-secondary mb-6">Clases programadas por semana por cada docente.</p>

                    <div className="chart-wrapper">
                        {teacherActivity.map(ta => (
                            <div key={ta.name} className="bar-group">
                                <span className="bar-label">{ta.name}</span>
                                <div className="bar-track">
                                    <div
                                        className="bar-fill bg-primary"
                                        style={{ width: `${Math.min((ta.classes / ta.max) * 100, 100)}%` }}
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
                            <button className="btn btn-ghost text-sm">Ver todos <ArrowRight size={14} /></button>
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

/* ═══════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════ */

export default function Dashboard() {
    const { isDirector } = useAuth();
    return isDirector ? <DirectorDashboardContent /> : <TeacherDashboardContent />;
}
