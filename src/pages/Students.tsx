import { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, TrendingUp, AlertTriangle, FileSignature, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentsByTeacher } from '../services/students.service';
import type { Student } from '../types';
import './Students.css';

export default function Students() {
    const { user } = useAuth();
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!user) return;
        const courseIds = user.subjects?.map(s => s.courseId) ?? [];
        getStudentsByTeacher(courseIds).then(setAllStudents).catch(console.error);
    }, [user]);

    if (!user) return null;

    const filteredStudents = search.trim()
        ? allStudents.filter(s =>
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
            s.courseName.toLowerCase().includes(search.toLowerCase())
        )
        : allStudents;

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
                            <input
                                type="text"
                                placeholder="Buscar alumno..."
                                className="search-input"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
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
                            {filteredStudents.map(student => (
                                <tr
                                    key={student.id}
                                    onClick={() => setSelectedStudent(student)}
                                    className={selectedStudent?.id === student.id ? 'selected-row' : ''}
                                >
                                    <td>
                                        <div className="student-cell">
                                            <div className="student-avatar">{student.avatarInitials}</div>
                                            <span className="font-medium">{student.firstName} {student.lastName}</span>
                                        </div>
                                    </td>
                                    <td className="text-secondary">{student.courseName}</td>
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
                            <div className="profile-avatar-large">{selectedStudent.avatarInitials}</div>
                            <h2 className="profile-name">{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                            <p className="profile-course">{selectedStudent.courseName}</p>
                            <div className="profile-status mt-2">{getStatusBadge(selectedStudent.status)}</div>
                        </div>

                        <div className="profile-section">
                            <h4>Métricas Generales</h4>
                            <div className="metrics-grid">
                                <div className="metric-box">
                                    <span className="metric-label">Asistencia</span>
                                    <span className="metric-val">{selectedStudent.attendance}%</span>
                                </div>
                                <div className="metric-box">
                                    <span className="metric-label">Promedio</span>
                                    <span className="metric-val">{selectedStudent.average}</span>
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
