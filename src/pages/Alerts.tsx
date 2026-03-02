import { CheckCircle2, TrendingDown, BookX, Activity } from 'lucide-react';
import './Alerts.css';

const earlyWarnings = [
    {
        id: 'w1', title: 'Riesgo Académico Crítico', count: 3, level: 'danger', icon: TrendingDown,
        description: 'Estudiantes con 3 o más materias previas y bajo rendimiento actual.',
        students: ['Juan Pérez (4to 2da)', 'María López (5to 1ra)', 'Diego Díaz (3er 1ra)']
    },
    {
        id: 'w2', title: 'Inasistencias Reiteradas', count: 8, level: 'warning', icon: BookX,
        description: 'Estudiantes acercándose al límite de faltas (más de 15 ausencias).',
        students: ['Tomás Rodríguez (5to 1ra) + 7 más']
    },
    {
        id: 'w3', title: 'Alertas de Conducta', count: 12, level: 'warning', icon: Activity,
        description: 'Reportes disciplinarios recientes o llamados de atención.',
        students: ['Varios cursos involucrados']
    },
    {
        id: 'w4', title: 'Estudiantes en Seguimiento Normal', count: 119, level: 'success', icon: CheckCircle2,
        description: 'Trayectoria educativa estable y sin alertas activas.',
        students: ['85% de la matrícula total']
    }
];

export default function Alerts() {
    return (
        <div className="alerts-container">
            <header className="alerts-header">
                <div>
                    <h2 className="page-title">Sistema de Alertas Tempranas</h2>
                    <p className="text-secondary mt-1">Monitoreo en tiempo real de trayectorias educativas</p>
                </div>
                <div className="alerts-actions">
                    <button className="btn btn-outline text-sm">Exportar Reporte</button>
                    <button className="btn btn-primary text-sm">Configurar Umbrales</button>
                </div>
            </header>

            <div className="warnings-grid">
                {earlyWarnings.map(warning => (
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
                                <span className="text-xs text-secondary font-medium">AFECTA A:</span>
                                <ul className="affected-list">
                                    {warning.students.map((student, idx) => (
                                        <li key={idx}>{student}</li>
                                    ))}
                                </ul>
                                <button className={`btn-ghost text-sm mt-3 text-${warning.level} font-medium`}>
                                    Ver detalle completo →
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Visual Analytics Placeholder */}
            <div className="card mt-6 padding-lg">
                <h3 className="mb-4 text-lg font-semibold">Tendencia de Alertas (Últimos 30 días)</h3>
                <div className="chart-placeholder">
                    <div className="chart-bar h-60 bg-danger opacity-80 title-tooltip" title="Riesgo Académico"></div>
                    <div className="chart-bar h-80 bg-warning opacity-80 title-tooltip" title="Conducta"></div>
                    <div className="chart-bar h-40 bg-warning opacity-80 title-tooltip" title="Inasistencias"></div>
                    <div className="chart-bar h-90 bg-success opacity-80 title-tooltip" title="Normal"></div>
                    <div className="chart-bar h-30 bg-danger opacity-80 title-tooltip" title="Riesgo Académico"></div>
                    <div className="chart-bar h-50 bg-warning opacity-80 title-tooltip" title="Conducta"></div>
                </div>
            </div>
        </div>
    );
}
