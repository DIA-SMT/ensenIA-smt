import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, CheckCircle, Info, Users, BookOpen,
    MessageSquare, AlertCircle, TrendingUp, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDirectorStats } from '../services/stats.service';
import { getAlertsBySchool } from '../services/alerts.service';
import { getTeacherUsers } from '../services/profiles.service';
import { getCommunicationsBySchool } from '../services/communications.service';
import { getScheduleByTeacher } from '../services/schedule.service';
import type { DirectorStats, Alert as AlertType, Communication, User as UserType } from '../types';
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
            getTeacherUsers(),
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
        max: 10,
    }));

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
                            <button className="btn btn-ghost text-sm" onClick={() => navigate('/alerts')}>Ver todos <ArrowRight size={14} /></button>
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

/** El dashboard es la vista de dirección. Los docentes tienen "Hoy". */
export default function Dashboard() {
    return <DirectorDashboardContent />;
}
