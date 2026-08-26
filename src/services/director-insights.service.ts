/**
 * ENSEÑIA SMT — Director Insights Service
 *
 * Agrega en un solo objeto los 6 indicadores del tablero directivo,
 * el mapa de calor curso × materia y los datos de apoyo para la ficha
 * de curso. Todo se computa en el cliente a partir de datos que ya
 * pasan por la RLS del director (lectura acotada a su escuela — 001,
 * 003, 004, 008): no hay atajos que ignoren esa capa.
 *
 * Simplificación deliberada de "Cobertura Curricular": se usa
 * planning_classes.is_complete (ya existe) en vez de comparar contra
 * el calendario ("hasta hoy"). Mide "cuánto del programa se dio",
 * no "si van al día" — más simple y ya accionable.
 */

import { supabase, unwrap } from './_helpers';
import { getAllStudents } from './students.service';
import { getCourses, getSubjects } from './subjects.service';
import { getTeacherUsers } from './profiles.service';
import {
  getSchoolActivities, getSubmissionsByActivityIds, getStudentIdsWithRecentEvents,
} from './activities.service';
import { getAlertsBySchool } from './alerts.service';
import { getNoticesForStaff } from './guardians.service';
import { daysAgoIso, median } from '../lib/format';
import type {
  DirectorInsights, RiskIndexKpi, AtRiskStudent, RiskSignals, HeatmapCell, HeatmapMetric,
  CurriculumCoverageKpi, WellbeingPulseKpi, WellbeingByCourse, TeacherAdoptionKpi, InactiveTeacher,
  FamilyResponseKpi, NoticeResponseRow, FeedbackLatencyKpi, PendingFeedbackRow, CourseAssignmentInfo,
  Activity, ActivitySubmission,
} from '../types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Fetchers puntuales (sin service dedicado por ahora: uso único acá) ──

interface RawEnrollment { student_id: string; subject_id: string; course_id: string; }
async function fetchEnrollments(schoolId: string): Promise<RawEnrollment[]> {
  return unwrap(
    await supabase.from('enrollments').select('student_id, subject_id, course_id').eq('school_id', schoolId)
  ) as unknown as RawEnrollment[];
}

interface RawCheckin { student_id: string; feeling: string; created_at: string; }
async function fetchRecentCheckins(studentIds: string[], sinceIso: string): Promise<RawCheckin[]> {
  if (studentIds.length === 0) return [];
  return unwrap(
    await supabase.from('student_checkins').select('student_id, feeling, created_at')
      .in('student_id', studentIds).gte('created_at', sinceIso)
  ) as unknown as RawCheckin[];
}

interface RawPlanningClass { is_complete: boolean; }
interface RawPlanningUnit { subject_id: string; course_id: string; planning_classes: RawPlanningClass[]; }
async function fetchPlanning(teacherIds: string[]): Promise<RawPlanningUnit[]> {
  if (teacherIds.length === 0) return [];
  return unwrap(
    await supabase.from('planning_units')
      .select('subject_id, course_id, planning_classes(is_complete)')
      .in('teacher_id', teacherIds)
  ) as unknown as RawPlanningUnit[];
}

interface RawIaUsage { teacher_id: string; message_count: number; }
async function fetchRecentIaUsage(teacherIds: string[], sinceDateStr: string): Promise<RawIaUsage[]> {
  if (teacherIds.length === 0) return [];
  return unwrap(
    await supabase.from('ia_usage').select('teacher_id, message_count')
      .in('teacher_id', teacherIds).gte('usage_date', sinceDateStr)
  ) as unknown as RawIaUsage[];
}

interface RawMaterial { teacher_id: string; }
async function fetchRecentMaterials(schoolId: string, sinceIso: string): Promise<RawMaterial[]> {
  return unwrap(
    await supabase.from('library_materials').select('teacher_id')
      .eq('school_id', schoolId).gte('uploaded_at', sinceIso)
  ) as unknown as RawMaterial[];
}

interface RawAssignment { teacher_id: string; subject_id: string; course_id: string; }
async function fetchTeacherAssignments(teacherIds: string[]): Promise<RawAssignment[]> {
  if (teacherIds.length === 0) return [];
  return unwrap(
    await supabase.from('teacher_assignments').select('teacher_id, subject_id, course_id')
      .in('teacher_id', teacherIds)
  ) as unknown as RawAssignment[];
}

interface RawGuardianLink { student_id: string; guardian_user_id: string; }
async function fetchGuardianLinks(studentIds: string[]): Promise<RawGuardianLink[]> {
  if (studentIds.length === 0) return [];
  return unwrap(
    await supabase.from('student_guardians').select('student_id, guardian_user_id').in('student_id', studentIds)
  ) as unknown as RawGuardianLink[];
}

// ── Agregador principal ──

export async function getDirectorInsights(schoolId: string): Promise<DirectorInsights> {
  const since7d = daysAgoIso(7);
  const since14d = daysAgoIso(14);
  const since14dDateStr = since14d.slice(0, 10);
  const since30d = daysAgoIso(30);

  const [students, courses, subjects, teachers, activities, enrollments, notices] = await Promise.all([
    getAllStudents(schoolId),
    getCourses(schoolId),
    getSubjects(schoolId),
    getTeacherUsers(schoolId),
    getSchoolActivities(schoolId),
    fetchEnrollments(schoolId),
    getNoticesForStaff(),
  ]);

  const studentIds = students.map(s => s.id);
  const teacherIds = teachers.map(t => t.id);
  const activityIds = activities.map(a => a.id);

  const [
    submissions, recentEventStudentIds, recentCheckins, planning,
    recentIaUsage, recentMaterials, assignments, alerts, guardianLinksRaw,
  ] = await Promise.all([
    getSubmissionsByActivityIds(activityIds),
    getStudentIdsWithRecentEvents(activityIds, since14d),
    fetchRecentCheckins(studentIds, since7d),
    fetchPlanning(teacherIds),
    fetchRecentIaUsage(teacherIds, since14dDateStr),
    fetchRecentMaterials(schoolId, since14d),
    fetchTeacherAssignments(teacherIds),
    getAlertsBySchool(schoolId),
    fetchGuardianLinks(studentIds),
  ]);

  // ── Índices de búsqueda ──
  const studentsById = new Map(students.map(s => [s.id, s]));
  const activitiesById = new Map(activities.map(a => [a.id, a]));
  const subjectsById = new Map(subjects.map(s => [s.id, s]));
  const coursesById = new Map(courses.map(c => [c.id, c]));
  const teachersById = new Map(teachers.map(t => [t.id, t]));

  function cellLabel(subjectId: string, courseId: string) {
    return {
      subjectName: subjectsById.get(subjectId)?.name ?? '—',
      courseName: coursesById.get(courseId)?.name ?? '—',
    };
  }

  const enrollmentsByStudent = new Map<string, RawEnrollment[]>();
  for (const en of enrollments) {
    const arr = enrollmentsByStudent.get(en.student_id) ?? [];
    arr.push(en);
    enrollmentsByStudent.set(en.student_id, arr);
  }

  const activitiesBySubjectCourse = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = `${a.subjectId}|${a.courseId}`;
    const arr = activitiesBySubjectCourse.get(key) ?? [];
    arr.push(a);
    activitiesBySubjectCourse.set(key, arr);
  }

  const submissionsByStudent = new Map<string, ActivitySubmission[]>();
  const submissionsByActivity = new Map<string, ActivitySubmission[]>();
  for (const s of submissions) {
    const byStudent = submissionsByStudent.get(s.studentId) ?? [];
    byStudent.push(s);
    submissionsByStudent.set(s.studentId, byStudent);

    const byActivity = submissionsByActivity.get(s.activityId) ?? [];
    byActivity.push(s);
    submissionsByActivity.set(s.activityId, byActivity);
  }

  const negativeCheckinCountByStudent = new Map<string, number>();
  for (const c of recentCheckins) {
    if (c.feeling === 'frustrado' || c.feeling === 'confundido') {
      negativeCheckinCountByStudent.set(c.student_id, (negativeCheckinCountByStudent.get(c.student_id) ?? 0) + 1);
    }
  }

  const studentsWithOpenAlert = new Set<string>();
  for (const a of alerts) {
    if (!a.isRead) (a.studentIds ?? []).forEach(id => studentsWithOpenAlert.add(id));
  }

  // ── Señales (compartidas entre índice escolar y mapa de calor) ──

  function subjectCourseOverdueUnsubmitted(subjectId: string, courseId: string, studentId: string): boolean {
    const acts = activitiesBySubjectCourse.get(`${subjectId}|${courseId}`) ?? [];
    const now = Date.now();
    const submittedActivityIds = new Set(
      (submissionsByStudent.get(studentId) ?? [])
        .filter(s => s.status === 'submitted' || s.status === 'graded')
        .map(s => s.activityId)
    );
    return acts.some(a =>
      a.status !== 'draft' && a.dueDate && new Date(a.dueDate).getTime() < now && !submittedActivityIds.has(a.id)
    );
  }

  function subjectCourseLowRecentScore(subjectId: string, courseId: string, studentId: string): boolean {
    const actIds = new Set((activitiesBySubjectCourse.get(`${subjectId}|${courseId}`) ?? []).map(a => a.id));
    const lastTwo = (submissionsByStudent.get(studentId) ?? [])
      .filter(s => actIds.has(s.activityId) && (s.status === 'submitted' || s.status === 'graded') && s.submittedAt)
      .sort((x, y) => new Date(y.submittedAt!).getTime() - new Date(x.submittedAt!).getTime())
      .slice(0, 2);
    if (lastTwo.length < 2) return false;
    return lastTwo.every(s => {
      const act = activitiesById.get(s.activityId);
      const score = s.autoScore ?? s.score;
      if (!act?.points || score == null) return false;
      return score / act.points < 0.4;
    });
  }

  function studentOverdueUnsubmitted(studentId: string): boolean {
    return (enrollmentsByStudent.get(studentId) ?? [])
      .some(en => subjectCourseOverdueUnsubmitted(en.subject_id, en.course_id, studentId));
  }

  function studentLowRecentScore(studentId: string): boolean {
    const lastTwo = (submissionsByStudent.get(studentId) ?? [])
      .filter(s => (s.status === 'submitted' || s.status === 'graded') && s.submittedAt)
      .sort((x, y) => new Date(y.submittedAt!).getTime() - new Date(x.submittedAt!).getTime())
      .slice(0, 2);
    if (lastTwo.length < 2) return false;
    return lastTwo.every(s => {
      const act = activitiesById.get(s.activityId);
      const score = s.autoScore ?? s.score;
      if (!act?.points || score == null) return false;
      return score / act.points < 0.4;
    });
  }

  // ── 1. Índice de Trayectoria en Riesgo ──
  const atRiskStudents: AtRiskStudent[] = students
    .map(s => {
      const signals: RiskSignals = {
        overdueUnsubmitted: studentOverdueUnsubmitted(s.id),
        lowRecentScore: studentLowRecentScore(s.id),
        negativeCheckins: (negativeCheckinCountByStudent.get(s.id) ?? 0) >= 2,
        noRecentEvents: !recentEventStudentIds.has(s.id),
        openAlert: studentsWithOpenAlert.has(s.id),
      };
      const signalCount = Object.values(signals).filter(Boolean).length;
      return {
        studentId: s.id, firstName: s.firstName, lastName: s.lastName,
        courseId: s.courseId, courseName: s.courseName,
        signalCount, signals,
      };
    })
    .filter(a => a.signalCount >= 2)
    .sort((a, b) => b.signalCount - a.signalCount);

  const riskIndex: RiskIndexKpi = {
    pct: students.length > 0 ? round1((atRiskStudents.length / students.length) * 100) : 0,
    atRiskCount: atRiskStudents.length,
    totalStudents: students.length,
    atRiskStudents,
  };

  // ── Pares (materia, curso) con inscripción real, base del mapa de calor ──
  const subjectCoursePairs = new Map<string, { subjectId: string; courseId: string; studentIds: Set<string> }>();
  for (const en of enrollments) {
    const key = `${en.subject_id}|${en.course_id}`;
    const entry = subjectCoursePairs.get(key) ?? { subjectId: en.subject_id, courseId: en.course_id, studentIds: new Set<string>() };
    entry.studentIds.add(en.student_id);
    subjectCoursePairs.set(key, entry);
  }

  // ── 2a. Mapa de calor: riesgo académico (subject-scoped: solo entregas/puntaje) ──
  const riesgoCells: HeatmapCell[] = [...subjectCoursePairs.values()].map(({ subjectId, courseId, studentIds: ids }) => {
    const idList = [...ids];
    const atRisk = idList.filter(id =>
      subjectCourseOverdueUnsubmitted(subjectId, courseId, id) || subjectCourseLowRecentScore(subjectId, courseId, id)
    );
    const { subjectName, courseName } = cellLabel(subjectId, courseId);
    return {
      subjectId, subjectName, courseId, courseName,
      numerator: atRisk.length, denominator: idList.length,
      pct: idList.length > 0 ? round1((atRisk.length / idList.length) * 100) : null,
    };
  });

  // ── 2b. Cobertura curricular (planning_classes.is_complete) ──
  const coverageMap = new Map<string, { subjectId: string; courseId: string; total: number; completed: number }>();
  for (const unit of planning) {
    const key = `${unit.subject_id}|${unit.course_id}`;
    const entry = coverageMap.get(key) ?? { subjectId: unit.subject_id, courseId: unit.course_id, total: 0, completed: 0 };
    const classes = unit.planning_classes ?? [];
    entry.total += classes.length;
    entry.completed += classes.filter(c => c.is_complete).length;
    coverageMap.set(key, entry);
  }
  const coverageCells: HeatmapCell[] = [...coverageMap.values()].map(({ subjectId, courseId, total, completed }) => {
    const { subjectName, courseName } = cellLabel(subjectId, courseId);
    return {
      subjectId, subjectName, courseId, courseName,
      numerator: completed, denominator: total,
      pct: total > 0 ? round1((completed / total) * 100) : null,
    };
  });
  const totalPlanned = [...coverageMap.values()].reduce((sum, c) => sum + c.total, 0);
  const totalCompleted = [...coverageMap.values()].reduce((sum, c) => sum + c.completed, 0);
  const curriculumCoverage: CurriculumCoverageKpi = {
    pct: totalPlanned > 0 ? round1((totalCompleted / totalPlanned) * 100) : null,
    bySubjectCourse: coverageCells,
  };

  // ── 2c. Entregas (tasa de entrega esperada vs real) ──
  const entregasCells: HeatmapCell[] = [...subjectCoursePairs.values()].map(({ subjectId, courseId, studentIds: ids }) => {
    const acts = (activitiesBySubjectCourse.get(`${subjectId}|${courseId}`) ?? []).filter(a => a.status !== 'draft');
    const expected = acts.length * ids.size;
    let actual = 0;
    for (const a of acts) {
      actual += (submissionsByActivity.get(a.id) ?? [])
        .filter(s => ids.has(s.studentId) && (s.status === 'submitted' || s.status === 'graded')).length;
    }
    const { subjectName, courseName } = cellLabel(subjectId, courseId);
    return {
      subjectId, subjectName, courseId, courseName,
      numerator: actual, denominator: expected,
      pct: expected > 0 ? round1((actual / expected) * 100) : null,
    };
  });

  const heatmap: Record<HeatmapMetric, HeatmapCell[]> = {
    riesgo: riesgoCells,
    cobertura: coverageCells,
    entregas: entregasCells,
  };

  // ── 3. Pulso de bienestar (por curso, vía student → course) ──
  const checkinsByCourse = new Map<string, { positive: number; total: number }>();
  for (const c of recentCheckins) {
    const student = studentsById.get(c.student_id);
    if (!student) continue;
    const entry = checkinsByCourse.get(student.courseId) ?? { positive: 0, total: 0 };
    entry.total += 1;
    if (c.feeling === 'genial' || c.feeling === 'bien') entry.positive += 1;
    checkinsByCourse.set(student.courseId, entry);
  }
  const byCourse: WellbeingByCourse[] = [...checkinsByCourse.entries()]
    .map(([courseId, { positive, total }]) => ({
      courseId, courseName: coursesById.get(courseId)?.name ?? '—',
      positivePct: total > 0 ? round1((positive / total) * 100) : 0,
      totalCheckins: total,
    }))
    .sort((a, b) => a.positivePct - b.positivePct);
  const totalCheckins = recentCheckins.length;
  const totalPositive = recentCheckins.filter(c => c.feeling === 'genial' || c.feeling === 'bien').length;
  const wellbeingPulse: WellbeingPulseKpi = {
    pct: totalCheckins > 0 ? round1((totalPositive / totalCheckins) * 100) : null,
    totalCheckins,
    byCourse,
  };

  // ── 4. Adopción docente ──
  const activeTeacherIds = new Set<string>();
  const sinceMs = new Date(since14d).getTime();
  for (const a of activities) if (new Date(a.createdAt).getTime() >= sinceMs) activeTeacherIds.add(a.teacherId);
  for (const m of recentMaterials) activeTeacherIds.add(m.teacher_id);
  for (const u of recentIaUsage) if (u.message_count > 0) activeTeacherIds.add(u.teacher_id);

  const lastActivityByTeacher = new Map<string, string>();
  for (const a of activities) {
    const prev = lastActivityByTeacher.get(a.teacherId);
    if (!prev || new Date(a.createdAt) > new Date(prev)) lastActivityByTeacher.set(a.teacherId, a.createdAt);
  }

  const inactiveTeachers: InactiveTeacher[] = teachers
    .filter(t => !activeTeacherIds.has(t.id))
    .map(t => ({ teacherId: t.id, firstName: t.firstName, lastName: t.lastName, lastActiveAt: lastActivityByTeacher.get(t.id) ?? null }))
    .sort((a, b) => {
      if (!a.lastActiveAt) return -1;
      if (!b.lastActiveAt) return 1;
      return new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime();
    });

  const teacherAdoption: TeacherAdoptionKpi = {
    pct: teachers.length > 0 ? round1((activeTeacherIds.size / teachers.length) * 100) : 0,
    activeCount: activeTeacherIds.size,
    totalTeachers: teachers.length,
    inactiveTeachers,
  };

  // ── 5. Respuesta de familias ──
  const guardiansByStudent = new Map<string, Set<string>>();
  const allSchoolGuardianIds = new Set<string>();
  for (const link of guardianLinksRaw) {
    const set = guardiansByStudent.get(link.student_id) ?? new Set<string>();
    set.add(link.guardian_user_id);
    guardiansByStudent.set(link.student_id, set);
    allSchoolGuardianIds.add(link.guardian_user_id);
  }

  const noticeRows: NoticeResponseRow[] = [];
  let sumAudience = 0, sumRead = 0, totalCitations = 0, confirmedInTime = 0;
  for (const n of notices) {
    const audienceIds = n.studentId ? (guardiansByStudent.get(n.studentId) ?? new Set<string>()) : allSchoolGuardianIds;
    const audienceSize = audienceIds.size;
    const readCount = n.receipts.filter(r => r.readAt && audienceIds.has(r.guardianUserId)).length;
    sumAudience += audienceSize;
    sumRead += readCount;

    let citationConfirmedInTime: boolean | undefined;
    if (n.type === 'citacion') {
      totalCitations += 1;
      const respondedInTime = n.receipts.some(r => {
        if (r.response == null || !r.respondedAt) return false;
        const hours = (new Date(r.respondedAt).getTime() - new Date(n.createdAt).getTime()) / 3_600_000;
        return hours <= 72;
      });
      citationConfirmedInTime = respondedInTime;
      if (respondedInTime) confirmedInTime += 1;
    }

    noticeRows.push({
      noticeId: n.id, title: n.title, type: n.type, createdAt: n.createdAt,
      audienceSize, readCount,
      readPct: audienceSize > 0 ? round1((readCount / audienceSize) * 100) : null,
      citationConfirmedInTime,
    });
  }
  noticeRows.sort((a, b) => (a.readPct ?? 101) - (b.readPct ?? 101));

  const familyResponse: FamilyResponseKpi = {
    readPct: sumAudience > 0 ? round1((sumRead / sumAudience) * 100) : null,
    citationConfirmedPct: totalCitations > 0 ? round1((confirmedInTime / totalCitations) * 100) : null,
    totalCitations,
    recentNotices: noticeRows.slice(0, 8),
  };

  // ── 6. Latencia de devolución ──
  const since30dMs = new Date(since30d).getTime();
  const gradedRecentSubs = submissions.filter(s =>
    s.status === 'graded' && s.gradedAt && s.submittedAt && new Date(s.submittedAt).getTime() >= since30dMs
  );
  const hoursList = gradedRecentSubs.map(s =>
    (new Date(s.gradedAt!).getTime() - new Date(s.submittedAt!).getTime()) / 3_600_000
  );
  const medianHours = median(hoursList);

  const pendingReview: PendingFeedbackRow[] = submissions
    .filter(s => s.status === 'submitted' && s.submittedAt)
    .map(s => {
      const act = activitiesById.get(s.activityId);
      const student = studentsById.get(s.studentId);
      return {
        submissionId: s.id,
        studentName: student ? `${student.firstName} ${student.lastName}` : '—',
        activityTitle: act?.title ?? '—',
        subjectName: act?.subjectName ?? subjectsById.get(act?.subjectId ?? '')?.name ?? '—',
        courseId: act?.courseId ?? '',
        hoursWaiting: round1((Date.now() - new Date(s.submittedAt!).getTime()) / 3_600_000),
      };
    })
    .sort((a, b) => b.hoursWaiting - a.hoursWaiting)
    .slice(0, 8);

  const feedbackLatency: FeedbackLatencyKpi = {
    medianHours: medianHours !== null ? round1(medianHours) : null,
    sampleSize: gradedRecentSubs.length,
    pendingReview,
  };

  // ── Docentes a cargo por curso (ficha de curso) ──
  const courseAssignments: Record<string, CourseAssignmentInfo[]> = {};
  for (const asg of assignments) {
    const teacher = teachersById.get(asg.teacher_id);
    const subject = subjectsById.get(asg.subject_id);
    if (!teacher || !subject) continue;
    const arr = courseAssignments[asg.course_id] ?? [];
    arr.push({ teacherId: teacher.id, teacherName: `${teacher.firstName} ${teacher.lastName}`, subjectId: subject.id, subjectName: subject.name });
    courseAssignments[asg.course_id] = arr;
  }

  return {
    riskIndex, curriculumCoverage, wellbeingPulse, teacherAdoption, familyResponse, feedbackLatency,
    heatmap, courseAssignments, courses,
  };
}
