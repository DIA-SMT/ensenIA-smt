import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, TrendingDown, BookX, AlertTriangle, UserRound, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAlertsByTeacher, getAlertsBySchool, markAlertRead } from '../services/alerts.service';
import { getAllStudents } from '../services/students.service';
import type { Alert } from '../types';
import './Alerts.css';

function groupAlerts(alertsList: Alert[], totalStudents: number) {
    const dangerAlerts = alertsList.filter(a => a.type === 'danger');
    const warningAlerts = alertsList.filter(a => a.type === 'warning');

    const groups = [
        {
            id: 'g-danger',
            title: 'Riesgo Académico Crítico',
            count: dangerAlerts.length,
            level: 'danger' as const,
            icon: TrendingDown,
            description: 'Estudiantes con alertas de riesgo alto que requieren atención inmediata.',
            details: dangerAlerts.map(a => a.message),
        },
        {
            id: 'g-warning',
            title: 'Alertas de Atención',
            count: warningAlerts.length,
            level: 'warning' as const,
            icon: BookX,
            description: 'Situaciones que requieren seguimiento: inasistencias, bajo rendimiento, conducta.',
            details: warningAlerts.map(a => a.message),
        },
        {
            id: 'g-success',
            title: 'Estudiantes en Seguimiento Normal',
            count: Math.max(0, totalStudents - dangerAlerts.length - warningAlerts.length),
            level: 'success' as const,
            icon: CheckCircle2,
            description: 'Trayectoria educativa estable y sin alertas activas.',
            details: ['La mayoría de los estudiantes mantienen un rendimiento adecuado.'],
        },
    ];

    return groups;
}

export default function Alerts() {
    const { user, isDirector } = useAuth();
    const navigate = useNavigate();
    const [alertsList, setAlertsList] = useState<Alert[]>([]);
    const [totalStudents, setTotalStudents] = useState(0);

    useEffect(() => {
        if (!user) return;

        const loadAlerts = isDirector
            ? getAlertsBySchool(user.schoolId)
            : getAlertsByTeacher(user.id);

        loadAlerts.then(setAlertsList).catch(console.error);
        getAllStudents().then(s => setTotalStudents(s.length)).catch(console.error);
    }, [user, isDirector]);

    const handleMarkRead = async (id: string) => {
        setAlertsList(prev => prev.map(a => (a.id === id ? { ...a, isRead: true } : a)));
        try {
            await markAlertRead(id);
        } catch (err) {
            console.error('No se pudo marcar la alerta:', err);
        }
    };

    if (!user) return null;

    const warningGroups = groupAlerts(alertsList, totalStudents);
    const subtitle = isDirector
        ? 'Monitoreo de toda la institución'
        : 'Alertas de tus estudiantes y cursos';

    return (
        <div className="alerts-container">
            <header className="alerts-header">
                <div>
                    <h2 className="page-title">Sistema de Alertas Tempranas</h2>
                    <p className="text-secondary mt-1">{subtitle}</p>
                </div>

            </header>

            <div className="warnings-grid">
                {warningGroups.map(warning => (
                    <div key={warning.id} className={`card warning-card border-${warning.level}`}>
                        <div className={`warning-icon-wrapper bg-${warning.level}`}>
                            <warning.icon size={24} className={`text-${warning.level}`} />
                        </div>

                        <div className="warning-content">
                            <div className="warning-title-row">
                                <h3>{warning.title}</h3>
                                <span className={`warning-count text-${warning.level}`}>{warning.count}</span>
                            </div>
                            <p className="warning-description">{warning.description}</p>

                            <div className="warning-footer">
                                <span className="text-xs text-secondary font-medium">DETALLE:</span>
                                <ul className="affected-list">
                                    {warning.details.slice(0, 3).map((detail, idx) => (
                                        <li key={idx}>{detail}</li>
                                    ))}
                                    {warning.details.length > 3 && (
                                        <li className="text-subtle">+ {warning.details.length - 3} más</li>
                                    )}
                                </ul>

                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Alertas recientes: cada una lleva a hacer algo */}
            <div className="card mt-6 padding-lg">
                <h3 className="mb-4 text-lg font-semibold">Alertas Recientes</h3>
                {alertsList.length === 0 && (
                    <p className="text-secondary text-sm">No hay alertas activas. 🎉</p>
                )}
                <div className="alerts-timeline">
                    {alertsList.map(alert => (
                        <div key={alert.id} className={`timeline-item timeline-${alert.type} ${alert.isRead ? 'is-read' : ''}`}>
                            <div className="timeline-dot">
                                <AlertTriangle size={12} />
                            </div>
                            <div className="timeline-content">
                                <p className="timeline-msg">{alert.message}</p>
                                <span className="timeline-date">{alert.date}</span>
                                <div className="timeline-actions">
                                    {alert.studentIds?.length ? (
                                        <button
                                            className="timeline-action"
                                            onClick={() => navigate(`/students?student=${alert.studentIds![0]}`)}
                                            title="Abrir su ficha para registrar una observación o citar a la familia"
                                        >
                                            <UserRound size={13} /> Ver ficha
                                        </button>
                                    ) : null}
                                    {!alert.isRead && (
                                        <button
                                            className="timeline-action"
                                            onClick={() => handleMarkRead(alert.id)}
                                            title="Ya me ocupé de esto"
                                        >
                                            <Check size={13} /> Marcar atendida
                                        </button>
                                    )}
                                    {alert.isRead && <span className="timeline-done"><Check size={12} /> Atendida</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
