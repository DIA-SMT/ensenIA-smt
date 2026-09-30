/**
 * SMT EstudIA — Ficha de Curso
 *
 * La unidad de gestión del directivo: nómina con semáforo, avance del
 * programa, entregas pendientes de corregir, pulso de bienestar,
 * docentes a cargo y alertas abiertas — todo scopeado a un curso.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, BookOpen, HeartPulse, Clock, AlertTriangle, Info, CheckCircle, BookMarked,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCourseById } from '../services/subjects.service';
import { getStudentsByCourse } from '../services/students.service';
import { getDirectorInsights } from '../services/director-insights.service';
import { getAlertsBySchool } from '../services/alerts.service';
import { getTerms, pickCurrentTerm, getPublishedGradesBySchool } from '../services/gradebook.service';
import { formatLatencyHours } from '../lib/format';
import { promedioDe, formatoNota } from '../lib/resumenNotas';
import type {
  Course, Student, DirectorInsights, Alert as AlertType, TermGrade, AcademicTerm,
} from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Dashboard.css';
import './Actividades.css';
import './Students.css';
import './Alerts.css';
import './CourseDetail.css';
import './Libreta.css';

/**
 * El estado sale de las señales reales (las mismas del indicador "En
 * riesgo" del tablero), no de la columna students.status, que solo llenaba
 * el seed de demo.
 */
function estadoPorSenales(n: number): { label: string; cls: string } {
  if (n >= 2) return { label: 'En riesgo', cls: 'badge-danger' };
  if (n === 1) return { label: 'Una señal', cls: 'badge-warning' };
  return { label: 'Sin señales', cls: 'badge-neutral' };
}

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null | undefined>(undefined); // undefined = cargando
  const [roster, setRoster] = useState<Student[]>([]);
  const [insights, setInsights] = useState<DirectorInsights | null>(null);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [termGrades, setTermGrades] = useState<TermGrade[]>([]);
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    Promise.all([
      getCourseById(id),
      getStudentsByCourse(id),
      getDirectorInsights(user.schoolId),
      getAlertsBySchool(user.schoolId),
      getTerms(user.schoolId, new Date().getFullYear()),
    ]).then(async ([c, students, ins, al, terms]) => {
      setCourse(c ?? null);
      setRoster(students);
      setInsights(ins);
      setAlerts(al);
      const term = pickCurrentTerm(terms);
      setCurrentTerm(term);
      if (term) {
        setTermGrades(await getPublishedGradesBySchool(user.schoolId, term.id));
      }
    }).catch(console.error);
  }, [user, id]);

  if (course === undefined || !insights) {
    return <div className="dashboard-container"><p className="text-secondary">Cargando ficha de curso…</p></div>;
  }

  if (!course) {
    return (
      <div className="dashboard-container">
        <button className="btn btn-ghost text-sm mb-4" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="card acts-empty">
          <p className="text-secondary">No se encontró el curso, o no pertenece a tu escuela.</p>
        </div>
      </div>
    );
  }

  const rosterIds = new Set(roster.map(s => s.id));
  const signalsByStudent = new Map(
    insights.riskIndex.atRiskStudents
      .filter(s => s.courseId === course.id)
      .map(s => [s.studentId, s.signalCount])
  );
  const coverage = insights.curriculumCoverage.bySubjectCourse.filter(c => c.courseId === course.id);
  const wellbeing = insights.wellbeingPulse.byCourse.find(c => c.courseId === course.id);
  const pending = insights.feedbackLatency.pendingReview.filter(p => p.courseId === course.id);
  const assignments = insights.courseAssignments[course.id] ?? [];
  const openAlerts = alerts.filter(a => !a.isRead && (a.studentIds ?? []).some(sid => rosterIds.has(sid)));
  const atRiskInCourse = [...signalsByStudent.values()].filter(n => n >= 2).length;

  // Notas publicadas del trimestre en curso, solo de este curso.
  const gradesHere = termGrades.filter(g => g.courseId === course.id);
  const aDiciembre = gradesHere.filter(g => g.carriesToDecember);
  const studentsById = new Map(roster.map(s => [s.id, s]));

  return (
    <div className="dashboard-container">
      <button className="btn btn-ghost text-sm mb-4" onClick={() => navigate('/dashboard')}>
        <ArrowLeft size={14} /> Volver al tablero
      </button>

      <header className="course-detail-header">
        <div>
          <h2 className="page-title">{course.name}</h2>
          <p className="text-secondary mt-1">
            {roster.length} estudiantes
            {assignments.length > 0 && ` · ${assignments.map(a => `${a.subjectName} (${a.teacherName})`).join(' · ')}`}
          </p>
        </div>
      </header>

      <div className="course-kpi-strip">
        <div className="card course-kpi">
          <Users size={18} className="text-danger" />
          <span className="course-kpi-value">{atRiskInCourse}</span>
          <span className="course-kpi-label">en riesgo</span>
        </div>
        <div className="card course-kpi">
          <BookOpen size={18} className="text-primary" />
          <span className="course-kpi-value">
            {coverage.length > 0
              ? `${Math.round(coverage.reduce((s, c) => s + c.numerator, 0) / Math.max(1, coverage.reduce((s, c) => s + c.denominator, 0)) * 100)}%`
              : '—'}
          </span>
          <span className="course-kpi-label">cobertura</span>
        </div>
        <div className="card course-kpi">
          <HeartPulse size={18} className="text-success" />
          <span className="course-kpi-value">{wellbeing ? `${wellbeing.positivePct}%` : '—'}</span>
          <span className="course-kpi-label">bienestar</span>
        </div>
        <div className="card course-kpi">
          <Clock size={18} className="text-subtle" />
          <span className="course-kpi-value">{pending.length}</span>
          <span className="course-kpi-label">sin corregir</span>
        </div>
      </div>

      <div className="course-detail-grid">
        <div className="course-detail-col-left">
          {/* Nómina con semáforo */}
          <section className="card widget">
            <div className="widget-header">
              <h3 className="widget-title">Nómina</h3>
              <span className="badge badge-neutral">{roster.length}</span>
            </div>
            <div className="table-responsive">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th scope="col">Estudiante</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Promedio{currentTerm ? ` · ${currentTerm.name}` : ''}</th>
                    <th scope="col">Señales</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(s => {
                    const signals = signalsByStudent.get(s.id) ?? 0;
                    const meta = estadoPorSenales(signals);
                    const promedio = promedioDe(gradesHere.filter(g => g.studentId === s.id));
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="student-cell">
                            <div className="student-avatar">{s.avatarInitials}</div>
                            <span className="font-medium">{s.firstName} {s.lastName}</span>
                          </div>
                        </td>
                        <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                        <td>{promedio === null ? <span className="text-subtle" title="Sin notas publicadas">—</span> : formatoNota(promedio)}</td>
                        <td>{signals > 0 ? <span className="badge badge-danger">{signals}</span> : <span className="text-subtle">—</span>}</td>
                      </tr>
                    );
                  })}
                  {roster.length === 0 && (
                    <tr><td colSpan={4} className="text-secondary text-sm">Sin estudiantes inscriptos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cobertura por materia */}
          <section className="card widget">
            <div className="widget-header">
              <h3 className="widget-title">Avance del Programa</h3>
            </div>
            {coverage.length === 0 ? (
              <p className="text-secondary text-sm">Sin planificación cargada para este curso.</p>
            ) : (
              <div className="coverage-list">
                {coverage.map(c => (
                  <div key={c.subjectId} className="coverage-row">
                    <span className="coverage-subject">{c.subjectName}</span>
                    <div className="coverage-track">
                      <div className="coverage-fill" style={{ width: `${c.pct ?? 0}%` }} />
                    </div>
                    <span className="coverage-value">{c.numerator}/{c.denominator}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="course-detail-col-right">
          {/* Libreta del trimestre (solo lo publicado) */}
          <section className="card widget">
            <div className="widget-header">
              <h3 className="widget-title">
                <BookMarked size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Notas del trimestre
              </h3>
              {aDiciembre.length > 0 && (
                <span className="badge badge-danger">{aDiciembre.length} a diciembre</span>
              )}
            </div>
            {!currentTerm && <p className="text-secondary text-sm">Sin trimestres cargados para este año.</p>}
            {currentTerm && gradesHere.length === 0 && (
              <p className="text-secondary text-sm">
                Todavía no hay notas publicadas del {currentTerm.name}.
              </p>
            )}
            {gradesHere.length > 0 && (
              <div className="grades-list">
                {gradesHere.map(g => {
                  const st = studentsById.get(g.studentId);
                  return (
                    <div key={g.id} className="grade-row">
                      <div className="grade-row-main">
                        <span className="grade-row-subject">
                          {st ? `${st.firstName} ${st.lastName}` : 'Estudiante'}
                        </span>
                        <span className="grade-row-term">
                          {g.subjectName ?? 'Materia'}
                          {g.carriesToDecember && ' · se lleva a diciembre'}
                        </span>
                      </div>
                      {g.grade !== null && (
                        <span className={`grade-pill ${g.carriesToDecember ? 'grade-fail' : 'grade-ok'}`}>
                          {Number.isInteger(g.grade) ? g.grade : g.grade.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Entregas sin corregir */}
          <section className="card widget">
            <div className="widget-header">
              <h3 className="widget-title">Sin Corregir</h3>
              <span className="badge badge-neutral">{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <p className="text-secondary text-sm">Todo al día.</p>
            ) : (
              <div className="alerts-list">
                {pending.map(p => (
                  <div key={p.submissionId} className="alert-item alert-warning">
                    <div className="alert-icon-wrap"><Clock size={16} /></div>
                    <div className="alert-content">
                      <p className="alert-msg">{p.studentName} · {p.activityTitle}</p>
                      <span className="alert-date">{p.subjectName} · esperando {formatLatencyHours(p.hoursWaiting)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Alertas abiertas */}
          <section className="card widget">
            <div className="widget-header">
              <h3 className="widget-title">Alertas Abiertas</h3>
              <span className="badge badge-danger">{openAlerts.length}</span>
            </div>
            {openAlerts.length === 0 ? (
              <p className="text-secondary text-sm">Sin alertas pendientes en este curso.</p>
            ) : (
              <div className="alerts-list">
                {openAlerts.map(a => (
                  <div key={a.id} className={`alert-item alert-${a.type}`}>
                    <div className="alert-icon-wrap">
                      {a.type === 'danger' && <AlertTriangle size={16} />}
                      {a.type === 'warning' && <Info size={16} />}
                      {a.type === 'success' && <CheckCircle size={16} />}
                    </div>
                    <div className="alert-content">
                      <p className="alert-msg">{a.message}</p>
                      <span className="alert-date">{a.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
