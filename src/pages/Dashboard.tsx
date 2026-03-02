import { Clock, AlertTriangle, CheckCircle, Info, Calendar as CalendarIcon, Users, BookOpen, Activity } from 'lucide-react';
import { alerts, upcomingClasses, weeklyCalendar, recentActivity, stats } from '../data/mockData';
import './Dashboard.css';

export default function Dashboard() {
    return (
        <div className="dashboard-container">

            {/* Top Stats Row */}
            <div className="stats-grid">
                <div className="card stat-card">
                    <div className="stat-icon bg-blue-light"><Users className="text-primary" /></div>
                    <div className="stat-content">
                        <p className="stat-title">Estudiantes Totales</p>
                        <h3 className="stat-value">{stats.totalStudents}</h3>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon bg-green-light"><CalendarIcon className="text-success" /></div>
                    <div className="stat-content">
                        <p className="stat-title">Clases Hoy</p>
                        <h3 className="stat-value">{stats.classesToday}</h3>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon bg-warning-light"><BookOpen className="text-warning" /></div>
                    <div className="stat-content">
                        <p className="stat-title">Evals. Pendientes</p>
                        <h3 className="stat-value">{stats.pendingEvaluations}</h3>
                    </div>
                </div>
            </div>

            <div className="dashboard-main-grid">
                {/* Left Column: Calendar & Classes */}
                <div className="dashboard-col-left">

                    {/* Weekly Calendar Widget */}
                    <section className="card widget">
                        <div className="widget-header">
                            <h3 className="widget-title">Calendario Semanal</h3>
                            <button className="btn btn-ghost text-sm">Ver agenda</button>
                        </div>
                        <div className="weekly-calendar">
                            {weeklyCalendar.map((day, idx) => (
                                <div key={idx} className={`calendar-day ${day.active ? 'active' : ''}`}>
                                    <span className="day-name">{day.day}</span>
                                    <span className="day-number">{day.date}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Upcoming Classes */}
                    <section className="card widget">
                        <div className="widget-header">
                            <h3 className="widget-title">Próximas Clases</h3>
                        </div>
                        <div className="classes-list">
                            {upcomingClasses.map(cls => (
                                <div key={cls.id} className="class-item">
                                    <div className="class-time">
                                        <Clock size={16} />
                                        <span>{cls.time}</span>
                                    </div>
                                    <div className="class-info">
                                        <h4>{cls.subject}</h4>
                                        <p>{cls.course} • {cls.room}</p>
                                    </div>
                                    <button className="btn btn-outline text-xs">Iniciar</button>
                                </div>
                            ))}
                        </div>
                    </section>

                </div>

                {/* Right Column: Alerts & Activity */}
                <div className="dashboard-col-right">

                    {/* Alerts Widget */}
                    <section className="card widget">
                        <div className="widget-header">
                            <h3 className="widget-title">Alertas Activas</h3>
                            <span className="badge badge-danger">{alerts.length} nuevas</span>
                        </div>
                        <div className="alerts-list">
                            {alerts.map(alert => (
                                <div key={alert.id} className={`alert-item alert-${alert.type}`}>
                                    <div className="alert-icon">
                                        {alert.type === 'danger' && <AlertTriangle size={18} />}
                                        {alert.type === 'warning' && <Info size={18} />}
                                        {alert.type === 'success' && <CheckCircle size={18} />}
                                    </div>
                                    <div className="alert-content">
                                        <p>{alert.message}</p>
                                        <span className="alert-date">{alert.date}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Recent Activity Widget */}
                    <section className="card widget">
                        <div className="widget-header">
                            <h3 className="widget-title">Actividad Reciente</h3>
                        </div>
                        <div className="activity-list">
                            {recentActivity.map(act => (
                                <div key={act.id} className="activity-item">
                                    <div className="activity-dot bg-blue-light">
                                        <Activity size={14} className="text-primary" />
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
