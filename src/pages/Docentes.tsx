import { useState } from 'react';
import { Search, X, Calendar, BookOpen, Users, Activity } from 'lucide-react';
import { getTeacherUsers } from '../data/mockUsers';
import { getScheduleByTeacher, getTodaySchedule } from '../data/mockSchedule';
import { subjects } from '../data/mockSubjects';
import { students } from '../data/mockStudents';
import type { User } from '../types';
import './Docentes.css';

export default function Docentes() {
  const [selectedTeacher, setSelectedTeacher] = useState<User | null>(null);
  const teachers = getTeacherUsers();
  const todayIndex = new Date().getDay() === 0 ? 4 : new Date().getDay() - 1;

  function getTeacherSubjectNames(teacher: User): string {
    if (!teacher.subjects) return '-';
    const subjectIds = [...new Set(teacher.subjects.map(s => s.subjectId))];
    return subjectIds.map(id => subjects.find(s => s.id === id)?.name || id).join(', ');
  }

  function getTeacherStudentCount(teacher: User): number {
    if (!teacher.subjects) return 0;
    const courseIds = [...new Set(teacher.subjects.map(s => s.courseId))];
    return students.filter(s => courseIds.includes(s.courseId)).length;
  }

  return (
    <div className="docentes-container">
      <div className={`docentes-main ${selectedTeacher ? 'with-panel' : ''}`}>
        <div className="card">
          <div className="docentes-header">
            <h2>Equipo Docente</h2>
            <div className="search-bar" style={{ width: 280 }}>
              <Search size={16} className="search-icon" />
              <input className="search-input" placeholder="Buscar docente..." />
            </div>
          </div>

          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Materias</th>
                  <th>Clases Hoy</th>
                  <th>Alumnos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t => {
                  const todayClasses = getTodaySchedule(t.id, todayIndex);
                  const studentCount = getTeacherStudentCount(t);
                  return (
                    <tr
                      key={t.id}
                      className={selectedTeacher?.id === t.id ? 'selected-row' : ''}
                      onClick={() => setSelectedTeacher(t)}
                    >
                      <td>
                        <div className="student-cell">
                          <div className="student-avatar">{t.avatarInitials}</div>
                          <div>
                            <span className="font-medium">{t.firstName} {t.lastName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-secondary">{getTeacherSubjectNames(t)}</td>
                      <td>
                        <span className="badge badge-cyan">{todayClasses.length}</span>
                      </td>
                      <td>{studentCount}</td>
                      <td><span className="badge badge-success">Activo</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTeacher && (
        <aside className="card student-profile-panel animate-slide-in">
          <div className="profile-header">
            <div className="profile-title-row">
              <h3>Perfil Docente</h3>
              <button className="btn-icon" onClick={() => setSelectedTeacher(null)}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="profile-body">
            <div className="profile-hero">
              <div className="profile-avatar-large">{selectedTeacher.avatarInitials}</div>
              <p className="profile-name">{selectedTeacher.firstName} {selectedTeacher.lastName}</p>
              <p className="profile-course">{selectedTeacher.email}</p>
            </div>

            <div className="profile-section">
              <h4><BookOpen size={14} style={{ marginRight: 6 }} /> Materias</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {selectedTeacher.subjects?.map((sa, i) => (
                  <span key={i} className="badge badge-cyan">
                    {subjects.find(s => s.id === sa.subjectId)?.name} — {sa.courseName}
                  </span>
                ))}
              </div>
            </div>

            <div className="profile-section">
              <h4><Calendar size={14} style={{ marginRight: 6 }} /> Horario Hoy</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {getTodaySchedule(selectedTeacher.id, todayIndex).map(block => (
                  <div key={block.id} className="metric-box" style={{ alignItems: 'flex-start' }}>
                    <span className="text-sm font-semibold">{Math.floor(block.startHour)}:{block.startHour % 1 ? '30' : '00'} — {block.subjectName}</span>
                    <span className="text-secondary text-xs">{block.courseName} · {block.room}</span>
                  </div>
                ))}
                {getTodaySchedule(selectedTeacher.id, todayIndex).length === 0 && (
                  <p className="text-secondary text-sm">Sin clases hoy</p>
                )}
              </div>
            </div>

            <div className="profile-section">
              <h4><Users size={14} style={{ marginRight: 6 }} /> Métricas</h4>
              <div className="metrics-grid">
                <div className="metric-box">
                  <span className="metric-label">Alumnos</span>
                  <span className="metric-val">{getTeacherStudentCount(selectedTeacher)}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Clases/sem</span>
                  <span className="metric-val">{getScheduleByTeacher(selectedTeacher.id).length}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h4><Activity size={14} style={{ marginRight: 6 }} /> Actividad Reciente</h4>
              <p className="text-secondary text-sm">Generó actividad con IA · Hace 2 horas</p>
              <p className="text-secondary text-sm">Subió material a Biblioteca · Ayer</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
