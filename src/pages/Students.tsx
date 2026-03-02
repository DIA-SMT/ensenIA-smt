import { useState } from 'react';
import { Search, Filter, MoreHorizontal, TrendingUp, AlertTriangle, FileSignature, X } from 'lucide-react';
import './Students.css';

interface Student {
    id: string;
    name: string;
    course: string;
    status: 'excellent' | 'good' | 'warning' | 'critical';
    alerts: number;
    progress: number;
    avatar: string;
}

const mockStudents: Student[] = [
    { id: '1', name: 'Martina Silva', course: '4to 2da', status: 'excellent', alerts: 0, progress: 95, avatar: 'MS' },
    { id: '2', name: 'Juan Pérez', course: '4to 2da', status: 'critical', alerts: 3, progress: 45, avatar: 'JP' },
    { id: '3', name: 'Lucía Gómez', course: '5to 1ra', status: 'good', alerts: 0, progress: 80, avatar: 'LG' },
    { id: '4', name: 'Tomás Rodríguez', course: '5to 1ra', status: 'warning', alerts: 1, progress: 65, avatar: 'TR' },
    { id: '5', name: 'Valentina López', course: '3er 3ra', status: 'excellent', alerts: 0, progress: 92, avatar: 'VL' },
];

export default function Students() {
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

    const getStatusBadge = (status: Student['status']) => {
        switch (status) {
            case 'excellent': return <span className="badge badge-success">Excelente</span>;
            case 'good': return <span className="badge badge-success" style={{ opacity: 0.8 }}>Bueno</span>;
            case 'warning': return <span className="badge badge-warning">En Observación</span>;
            case 'critical': return <span className="badge badge-danger">Riesgo</span>;
        }
    };

    return (
        <div className="students-container">
            <div className={`students-main card ${selectedStudent ? 'panel-open' : ''}`}>
                <div className="students-header border-bottom">
                    <h2>Lista de Estudiantes</h2>
                    <div className="students-actions">
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input type="text" placeholder="Buscar alumno..." className="search-input" />
                        </div>
                        <button className="btn btn-outline"><Filter size={16} /> Filtros</button>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Estudiante</th>
                                <th>Curso</th>
                                <th>Estado</th>
                                <th>Alertas</th>
                                <th>Progreso</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockStudents.map(student => (
                                <tr
                                    key={student.id}
                                    onClick={() => setSelectedStudent(student)}
                                    className={selectedStudent?.id === student.id ? 'selected-row' : ''}
                                >
                                    <td>
                                        <div className="student-cell">
                                            <div className="student-avatar">{student.avatar}</div>
                                            <span className="font-medium">{student.name}</span>
                                        </div>
                                    </td>
                                    <td className="text-secondary">{student.course}</td>
                                    <td>{getStatusBadge(student.status)}</td>
                                    <td>
                                        {student.alerts > 0
                                            ? <span className="alert-count text-danger"><AlertTriangle size={14} /> {student.alerts}</span>
                                            : <span className="text-secondary">-</span>}
                                    </td>
                                    <td>
                                        <div className="progress-cell">
                                            <div className="progress-bar-bg">
                                                <div
                                                    className={`progress-bar-fill pb-${student.status}`}
                                                    style={{ width: `${student.progress}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-sm font-medium">{student.progress}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button className="btn-icon"><MoreHorizontal size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* R: Sliding Profile Panel */}
            {selectedStudent && (
                <div className="student-profile-panel card animate-slide-in">
                    <div className="profile-header border-bottom">
                        <div className="profile-title-row">
                            <h3>Perfil del Estudiante</h3>
                            <button className="btn-icon" onClick={() => setSelectedStudent(null)}><X size={18} /></button>
                        </div>
                    </div>

                    <div className="profile-body">
                        <div className="profile-hero">
                            <div className="profile-avatar-large">{selectedStudent.avatar}</div>
                            <h2 className="profile-name">{selectedStudent.name}</h2>
                            <p className="profile-course">{selectedStudent.course}</p>
                            <div className="profile-status mt-2">{getStatusBadge(selectedStudent.status)}</div>
                        </div>

                        <div className="profile-section">
                            <h4>Métricas Generales</h4>
                            <div className="metrics-grid">
                                <div className="metric-box">
                                    <span className="metric-label">Asistencia</span>
                                    <span className="metric-val">{selectedStudent.status === 'critical' ? '78%' : '96%'}</span>
                                </div>
                                <div className="metric-box">
                                    <span className="metric-label">Promedio</span>
                                    <span className="metric-val">{selectedStudent.status === 'critical' ? '5.5' : '8.9'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="profile-section">
                            <h4>Evolución <TrendingUp size={14} className="text-secondary inline ml-1" /></h4>
                            <div className="evolution-chart-placeholder">
                                <div className={`chart-line chart-${selectedStudent.status}`}></div>
                                <div className="chart-labels">
                                    <span>Mar</span><span>Abr</span><span>May</span><span>Jun</span>
                                </div>
                            </div>
                        </div>

                        <div className="profile-section">
                            <h4>Alertas Recientes <AlertTriangle size={14} className="text-warning inline ml-1" /></h4>
                            {selectedStudent.alerts > 0 ? (
                                <div className="profile-alerts">
                                    <div className="profile-alert-item pb-warning">
                                        <p className="font-medium text-sm">Ausencias reiteradas</p>
                                        <p className="text-xs text-secondary">Faltó 3 veces en la última semana.</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-secondary italic">Sin alertas recientes.</p>
                            )}
                        </div>

                        <div className="profile-section">
                            <h4>Últimas Evaluaciones <FileSignature size={14} className="text-secondary inline ml-1" /></h4>
                            <div className="profile-evals">
                                <div className="eval-item border-bottom">
                                    <div>
                                        <p className="font-medium text-sm">Prueba Biología</p>
                                        <p className="text-xs text-secondary">Hace 2 días</p>
                                    </div>
                                    <span className={`eval-score ${selectedStudent.status === 'critical' ? 'text-danger' : 'text-success'}`}>
                                        {selectedStudent.status === 'critical' ? '4.0' : '9.5'}
                                    </span>
                                </div>
                                <div className="eval-item">
                                    <div>
                                        <p className="font-medium text-sm">TP Genética</p>
                                        <p className="text-xs text-secondary">Hace 1 semana</p>
                                    </div>
                                    <span className="eval-score text-success">
                                        {selectedStudent.status === 'critical' ? '6.0' : '9.0'}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
