import { useState, useEffect, useMemo } from 'react';
import { Search, X, Calendar, BookOpen, Users, Activity, Medal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherUsers } from '../services/profiles.service';
import { getScheduleByTeacher, getTodaySchedule } from '../services/schedule.service';
import { getSubjects } from '../services/subjects.service';
import { getAllStudents } from '../services/students.service';
import { getSchoolActivitiesLight, type SchoolActivityLight } from '../services/activities.service';
import { getTeacherAwards, giveTeacherAward } from '../services/awards.service';
import { logAccess } from '../services/audit.service';
import { getUsoDocentes, type UsoDeUnDocente } from '../services/devolucion.service';
import { coincideBusqueda } from '../services/busqueda.service';
import FichaDocente from '../components/FichaDocente';
import { formatRelative, daysSince } from '../lib/format';
import AwardPickerModal from '../components/AwardPickerModal';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import { TEACHER_AWARD_META, type TeacherAward, type User, type Subject, type Student, type ScheduleBlock } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Students.css';
import './Actividades.css';
import './Docentes.css';

/** Chip honesto: cuándo hizo algo en la app (publicar, enviar, tomar lista, corregir…). */
function LastActivityBadge({ lastAt }: { lastAt: string | null | undefined }) {
  if (!lastAt) return <span className="badge badge-neutral">Sin uso todavía</span>;
  const days = daysSince(lastAt);
  const cls = days <= 7 ? 'badge-success' : days <= 21 ? 'badge-warning' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{formatRelative(lastAt)}</span>;
}

export default function Docentes() {
  const { user } = useAuth();
  const [selectedTeacher, setSelectedTeacher] = useState<User | null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [schoolActivities, setSchoolActivities] = useState<SchoolActivityLight[]>([]);
  const [teacherTodayClasses, setTeacherTodayClasses] = useState<Record<string, ScheduleBlock[]>>({});
  const [teacherWeeklyClasses, setTeacherWeeklyClasses] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [teacherAwards, setTeacherAwards] = useState<TeacherAward[]>([]);
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [cargando, setCargando] = useState(true);
  // Uso de la app de cada docente (058): una sola definición para toda la app
  const [uso, setUso] = useState<Record<string, UsoDeUnDocente>>({});
  // Lunes = 0 … viernes = 4. Sábado y domingo no hay clases (antes el
  // domingo mostraba las del viernes).
  const diaSemana = new Date().getDay();
  const todayIndex = diaSemana >= 1 && diaSemana <= 5 ? diaSemana - 1 : -1;

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getTeacherUsers(user.schoolId),
      getSubjects(user.schoolId),
      getAllStudents(user.schoolId),
      getSchoolActivitiesLight(user.schoolId),
    ]).then(([t, s, st, acts]) => {
      setTeachers(t);
      setSubjectsList(s);
      setStudentsList(st);
      setSchoolActivities(acts);

      // Load today's classes for each teacher
      if (todayIndex >= 0) Promise.all(t.map(teacher =>
        getTodaySchedule(teacher.id, todayIndex).then(classes => ({ id: teacher.id, classes }))
      )).then(results => {
        const map: Record<string, ScheduleBlock[]> = {};
        results.forEach(r => { map[r.id] = r.classes; });
        setTeacherTodayClasses(map);
      });

      // Load weekly schedule counts
      Promise.all(t.map(teacher =>
        getScheduleByTeacher(teacher.id).then(blocks => ({ id: teacher.id, count: blocks.length }))
      )).then(results => {
        const map: Record<string, number> = {};
        results.forEach(r => { map[r.id] = r.count; });
        setTeacherWeeklyClasses(map);
      });
    }).catch(console.error).finally(() => setCargando(false));

    getUsoDocentes(30)
      .then(lista => setUso(Object.fromEntries(lista.map(u => [u.teacherId, u]))))
      .catch(console.error);
  }, [user]);

  // Bitácora: queda registrado cada acceso al perfil de un docente.
  // Deps primitivas: la identidad del objeto user cambia en cada refresh
  // de sesión y duplicaría filas.
  useEffect(() => {
    if (!selectedTeacher) return;
    setTeacherAwards([]);
    getTeacherAwards(selectedTeacher.id).then(setTeacherAwards).catch(console.error);
  }, [selectedTeacher?.id]);

  useEffect(() => {
    if (!user || !selectedTeacher) return;
    logAccess({
      userId: user.id,
      userLabel: `${user.firstName} ${user.lastName} (${user.role})`,
      schoolId: user.schoolId,
      action: 'view_teacher_profile',
      entityType: 'teacher',
      entityId: selectedTeacher.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedTeacher?.id]);

  // La actividad viene ordenada desc por fecha: el primer match es la última publicación.
  const lastActivityByTeacher = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of schoolActivities) {
      if (!map[a.teacherId]) map[a.teacherId] = a.createdAt;
    }
    return map;
  }, [schoolActivities]);

  const recentActivitiesOf = (teacherId: string) =>
    schoolActivities.filter(a => a.teacherId === teacherId).slice(0, 3);

  function getTeacherSubjectNames(teacher: User): string {
    if (!teacher.subjects) return '-';
    const subjectIds = [...new Set(teacher.subjects.map(s => s.subjectId))];
    return subjectIds.map(id => subjectsList.find(s => s.id === id)?.name || id).join(', ');
  }

  function getTeacherStudentCount(teacher: User): number {
    if (!teacher.subjects) return 0;
    const courseIds = [...new Set(teacher.subjects.map(s => s.courseId))];
    return studentsList.filter(s => courseIds.includes(s.courseId)).length;
  }

  const todayClassesForTeacher = (teacherId: string) => teacherTodayClasses[teacherId] ?? [];

  // Sin tildes y en cualquier orden, como el resto de los buscadores
  const filteredTeachers = search.trim()
    ? teachers.filter(t => coincideBusqueda(`${t.firstName} ${t.lastName} ${t.email} ${getTeacherSubjectNames(t)}`, search))
    : teachers;

  if (!user) return null;

  return (
    <div className="docentes-container">
      <div className={`docentes-main ${selectedTeacher ? 'with-panel' : ''}`}>
        <div className="card">
          <div className="docentes-header">
            <h2>Equipo docente</h2>
            <div className="search-bar" style={{ width: 280 }}>
              <Search size={16} className="search-icon" />
              <input
                className="search-input"
                aria-label="Buscar docente por nombre"
                placeholder="Buscar docente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {cargando ? (
            <Esqueleto tipo="tabla" cantidad={5} etiqueta="Cargando el equipo docente…" />
          ) : teachers.length === 0 ? (
            <EstadoVacio icono={Users} titulo="Todavía no hay docentes en la escuela"
              texto="Cuando los sumes desde Mi escuela, acá vas a ver sus materias, sus clases de hoy y su última actividad."
              accion={{ etiqueta: 'Ir a Mi escuela', a: '/mi-escuela' }} />
          ) : filteredTeachers.length === 0 ? (
            <EstadoVacio compacto icono={Search} titulo={`Ningún docente coincide con «${search.trim()}»`}
              texto="Probá con otra parte del nombre, el email o una materia."
              accion={{ etiqueta: 'Ver a todos', alTocar: () => setSearch('') }} />
          ) : (
          <div className="table-responsive">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Materias</th>
                  <th>Clases hoy</th>
                  <th>Alumnos</th>
                  <th title="Actividades y clases armadas enviadas, últimos 30 días">Publicó (30 d)</th>
                  <th>Sin corregir</th>
                  <th title="Lo que responden los estudiantes, anónimo (con 5 respuestas o más)">Devolución</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map(t => {
                  const todayClasses = todayClassesForTeacher(t.id);
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
                      <td>{uso[t.id] ? uso[t.id].actividades + uso[t.id].clasesEnviadas : '—'}</td>
                      <td>{uso[t.id] ? <span className={uso[t.id].sinCorregir > 10 ? 'text-warning font-semibold' : ''}>{uso[t.id].sinCorregir}</span> : '—'}</td>
                      <td>
                        {uso[t.id]?.devolucion.promedio != null
                          ? <span title={`${uso[t.id].devolucion.total} respuestas, de 1 a 3`}>{uso[t.id].devolucion.promedio! >= 2.5 ? '😃' : uso[t.id].devolucion.promedio! >= 1.8 ? '🙂' : '😕'} {uso[t.id].devolucion.promedio!.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span>
                          : <span className="text-subtle text-xs">{uso[t.id]?.devolucion.total ? `${uso[t.id].devolucion.total} resp.` : '—'}</span>}
                      </td>
                      <td><LastActivityBadge lastAt={uso[t.id]?.ultimaActividad ?? lastActivityByTeacher[t.id]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTeacher && (
        <aside className="card student-profile-panel animate-slide-in">
          <div className="profile-header">
            <div className="profile-title-row">
              <h3>Perfil docente</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setSelectedTeacher(null)}>
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
                    {subjectsList.find(s => s.id === sa.subjectId)?.name} — {sa.courseName}
                  </span>
                ))}
              </div>
            </div>

            <div className="profile-section">
              <h4><Calendar size={14} style={{ marginRight: 6 }} /> Horario de hoy</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {todayClassesForTeacher(selectedTeacher.id).map(block => (
                  <div key={block.id} className="metric-box" style={{ alignItems: 'flex-start' }}>
                    <span className="text-sm font-semibold">{Math.floor(block.startHour)}:{block.startHour % 1 ? '30' : '00'} — {block.subjectName}</span>
                    <span className="text-secondary text-xs">{block.courseName} · {block.room}</span>
                  </div>
                ))}
                {todayClassesForTeacher(selectedTeacher.id).length === 0 && (
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
                  <span className="metric-val">{teacherWeeklyClasses[selectedTeacher.id] ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <h4><Activity size={14} style={{ marginRight: 6 }} /> Actividad reciente</h4>
              {recentActivitiesOf(selectedTeacher.id).length === 0 && (
                <p className="text-secondary text-sm">Sin actividades publicadas todavía.</p>
              )}
              {recentActivitiesOf(selectedTeacher.id).map((a, i) => (
                <p key={i} className="text-secondary text-sm">
                  Publicó «{a.title}» · {formatRelative(a.createdAt)}
                </p>
              ))}
            </div>

            {/* ── Uso de la app y devolución de los estudiantes (el docente ve lo mismo) ── */}
            <div className="profile-section">
              <FichaDocente key={selectedTeacher.id} teacherId={selectedTeacher.id} voz="direccion" />
              <p className="text-subtle text-xs" style={{ marginTop: 8 }}>
                {selectedTeacher.firstName} ve esta misma ficha en Mis clases. La devolución de los estudiantes es anónima.
              </p>
            </div>

            {/* ── Reconocimientos de la dirección ── */}
            <div className="profile-section">
              <div className="flex items-center justify-between">
                <h4><Medal size={14} style={{ marginRight: 6 }} className="text-warning" /> Reconocimientos</h4>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAwardModal(true)}
                  title="El reconocimiento aparece en el panel del docente"
                >
                  <Medal size={13} /> Dar medalla
                </button>
              </div>
              {teacherAwards.length === 0
                ? <p className="text-secondary text-sm italic">Todavía sin reconocimientos. ¡Un "Presente total" motiva!</p>
                : teacherAwards.slice(0, 5).map(a => {
                    const meta = TEACHER_AWARD_META[a.badgeCode] ?? { emoji: '🏅', label: a.badgeCode };
                    return (
                      <p key={a.id} className="text-secondary text-sm">
                        {meta.emoji} <strong>{meta.label}</strong>{a.message ? ` — "${a.message}"` : ''} · {formatRelative(a.createdAt)}
                      </p>
                    );
                  })}
            </div>
          </div>
        </aside>
      )}

      {/* ── Modal dar medalla a docente ── */}
      {showAwardModal && selectedTeacher && (
        <AwardPickerModal
          title="Reconocer al docente"
          recipientName={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`}
          catalog={TEACHER_AWARD_META}
          onClose={() => setShowAwardModal(false)}
          onGive={async (badgeCode, message) => {
            await giveTeacherAward({
              teacherId: selectedTeacher.id,
              directorId: user.id,
              badgeCode,
              message,
            });
            getTeacherAwards(selectedTeacher.id).then(setTeacherAwards).catch(console.error);
          }}
        />
      )}
    </div>
  );
}
