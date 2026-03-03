import { CheckCircle2, TrendingDown, BookX, Activity, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAlertsByTeacher, getAlertsBySchool } from '../data/mockAlerts';
import { students } from '../data/mockStudents';
import type { Alert } from '../types';
import './Alerts.css';

function groupAlerts(alertsList: Alert[]) {
    const dangerAlerts = alertsList.filter(a => a.type === 'danger');
    const warningAlerts = alertsList.filter(a => a.type === 'warning');
    const successAlerts = alertsList.filter(a => a.type === 'success');

    // Build grouped warning cards
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
            count: students.length - dangerAlerts.length - warningAlerts.length,
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

    if (!user) return null;

    const alertsList = isDirector
        ? getAlertsBySchool('school-1')
        : getAlertsByTeacher(user.id);

    const warningGroups = groupAlerts(alertsList);
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
                <div className="alerts-actions">
                    <button className="btn btn-outline text-sm">Exportar Reporte</button>
                    {isDirector && (
                        <button className="btn btn-primary text-sm">Configurar Umbrales</button>
                    )}
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
                                <button className={`btn-ghost text-sm mt-3 text-${warning.level} font-medium`}>
                                    Ver detalle completo →
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Alerts Timeline */}
            <div className="card mt-6 padding-lg">
                <h3 className="mb-4 text-lg font-semibold">Alertas Recientes</h3>
                <div className="alerts-timeline">
                    {alertsList.map(alert => (
                        <div key={alert.id} className={`timeline-item timeline-${alert.type}`}>
                            <div className="timeline-dot">
                                <AlertTriangle size={12} />
                            </div>
                            <div className="timeline-content">
                                <p className="timeline-msg">{alert.message}</p>
                                <span className="timeline-date">{alert.date}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
