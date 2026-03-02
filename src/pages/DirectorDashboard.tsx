import { Users, BookOpen, AlertCircle, TrendingUp, MapPin, School } from 'lucide-react';
import './DirectorDashboard.css';

export default function DirectorDashboard() {
    return (
        <div className="director-container">
            <header className="director-header">
                <div>
                    <h2 className="page-title">Centro de Control Directivo</h2>
                    <p className="text-secondary mt-1">Visión general del distrito municipal</p>
                </div>
                <div className="director-actions">
                    <select className="form-select w-48">
                        <option>Todas las Instituciones</option>
                        <option>Escuela N°1 Manuel Belgrano</option>
                        <option>Escuela N°2 Domingo Sarmiento</option>
                    </select>
                </div>
            </header>

            {/* Main KPI Row */}
            <div className="kpi-grid">
                <div className="card kpi-card border-left-primary">
                    <div className="kpi-header">
                        <span className="kpi-title">Docentes Activos</span>
                        <Users size={20} className="text-primary" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">482</h3>
                        <span className="kpi-trend text-success"><TrendingUp size={14} /> +12%</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-success">
                    <div className="kpi-header">
                        <span className="kpi-title">Clases en Curso</span>
                        <BookOpen size={20} className="text-success" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">145</h3>
                        <span className="kpi-trend text-success"><TrendingUp size={14} /> +4%</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-danger">
                    <div className="kpi-header">
                        <span className="kpi-title">Alertas Activas Totales</span>
                        <AlertCircle size={20} className="text-danger" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">67</h3>
                        <span className="kpi-trend text-danger"><TrendingUp size={14} /> +8%</span>
                    </div>
                </div>

                <div className="card kpi-card border-left-warning">
                    <div className="kpi-header">
                        <span className="kpi-title">Asistencia General</span>
                        <Users size={20} className="text-warning" />
                    </div>
                    <div className="kpi-value-row">
                        <h3 className="kpi-value">91.4%</h3>
                        <span className="kpi-trend text-secondary">Estable</span>
                    </div>
                </div>
            </div>

            <div className="director-main-grid">
                {/* L: Chart Area */}
                <div className="card padding-xl">
                    <h3 className="mb-4 text-lg font-semibold">Actividad por Escuela</h3>
                    <p className="text-sm text-secondary mb-6">Comparativa de conexiones docentes y clases dictadas en las últimas 72hs.</p>

                    <div className="chart-wrapper">
                        <div className="bar-group">
                            <span className="bar-label">Esc. N°1</span>
                            <div className="bar-track">
                                <div className="bar-fill bg-primary" style={{ width: '95%' }}></div>
                            </div>
                            <span className="bar-value">95%</span>
                        </div>

                        <div className="bar-group">
                            <span className="bar-label">Esc. N°2</span>
                            <div className="bar-track">
                                <div className="bar-fill bg-primary" style={{ width: '88%' }}></div>
                            </div>
                            <span className="bar-value">88%</span>
                        </div>

                        <div className="bar-group">
                            <span className="bar-label">Esc. N°5</span>
                            <div className="bar-track">
                                <div className="bar-fill bg-primary opacity-80" style={{ width: '74%' }}></div>
                            </div>
                            <span className="bar-value">74%</span>
                        </div>

                        <div className="bar-group">
                            <span className="bar-label">Esc. N°12</span>
                            <div className="bar-track">
                                <div className="bar-fill bg-warning" style={{ width: '62%' }}></div>
                            </div>
                            <span className="bar-value">62%</span>
                        </div>
                    </div>
                </div>

                {/* R: Map / Distribution */}
                <div className="card map-panel">
                    <div className="map-header">
                        <h3 className="text-lg font-semibold">Distribución Territorial</h3>
                        <MapPin size={20} className="text-secondary" />
                    </div>

                    <div className="map-placeholder">
                        {/* Fake Map UI */}
                        <div className="map-bg"></div>

                        {/* Map Pins */}
                        <div className="map-pin pin-1" title="Escuela N°1 - Estado Bueno">
                            <div className="pin-pulse bg-success"></div>
                            <School size={16} className="text-white" />
                        </div>
                        <div className="map-pin pin-2" title="Escuela N°2 - Intervenido">
                            <div className="pin-pulse bg-warning"></div>
                            <School size={16} className="text-white" />
                        </div>
                        <div className="map-pin pin-3" title="Escuela N°12 - Alertas Críticas">
                            <div className="pin-pulse bg-danger"></div>
                            <School size={16} className="text-white" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
