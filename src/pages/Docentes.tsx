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
import { formatRelative, daysSince } from '../lib/format';
import AwardPickerModal from '../components/AwardPickerModal';
import { TEACHER_AWARD_META, type TeacherAward, type User, type Subject, type Student, type ScheduleBlock } from '../types';
import './Docentes.css';

/** Chip honesto: cuándo fue la última actividad publicada por el docente. */
function LastActivityBadge({ lastAt }: { lastAt: string | undefined }) {
  if (!lastAt) return <span className="badge badge-neutral">Sin actividades</span>;
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
  const todayIndex = new Date().getDay() === 0 ? 4 : new Date().getDay() - 1;

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
      Promise.all(t.map(teacher =>
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
    }).catch(console.error);
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

  const filteredTeachers = search.trim()
    ? teachers.filter(t =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        getTeacherSubjectNames(t).toLowerCase().includes(search.toLowerCase())
      )
    : teachers;

  if (!user) return null;

  return (
    <div className="docentes-container">
      <div className={`docentes-main ${selectedTeacher ? 'with-panel' : ''}`}>
        <div className="card">
          <div className="docentes-header">
            <h2>Equipo Docente</h2>
            <div className="search-bar" style={{ width: 280 }}>
              <Search size={16} className="search-icon" />
              <input
                className="search-input"
                placeholder="Buscar docente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
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
                  <th>Última Actividad</th>
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
                      <td><LastActivityBadge lastAt={lastActivityByTeacher[t.id]} /></td>
                    </tr>
                  );
                })}
                {filteredTeachers.length === 0 && search.trim() !== '' && (
                  <tr>
                    <td colSpan={5} className="text-secondary text-sm">
                      No se encontraron docentes para «{search.trim()}».
                    </td>
                  </tr>
                )}
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
                    {subjectsList.find(s => s.id === sa.subjectId)?.name} — {sa.courseName}
                  </span>
                ))}
              </div>
            </div>

            <div className="profile-section">
              <h4><Calendar size={14} style={{ marginRight: 6 }} /> Horario Hoy</h4>
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
              <h4><Activity size={14} style={{ marginRight: 6 }} /> Actividad Reciente</h4>
              {recentActivitiesOf(selectedTeacher.id).length === 0 && (
                <p className="text-secondary text-sm">Sin actividades publicadas todavía.</p>
              )}
              {recentActivitiesOf(selectedTeacher.id).map((a, i) => (
                <p key={i} className="text-secondary text-sm">
                  Publicó «{a.title}» · {formatRelative(a.createdAt)}
                </p>
              ))}
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
