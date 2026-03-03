/* ═══════════════════════════════════════════════
   ENSEÑIA SMT — Data Layer (re-exports + helpers)
   ═══════════════════════════════════════════════ */

// Re-exports
export { school } from './mockSchool';
export { users, loginCredentials, getUserById, getTeacherUsers } from './mockUsers';
export { subjects, courses, getSubjectById, getCourseById } from './mockSubjects';
export { students, getStudentsByCourse, getStudentsByTeacher, getStudentById } from './mockStudents';
export { scheduleBlocks, getScheduleByTeacher, getTodaySchedule, getNextClass } from './mockSchedule';
export { alerts, getAlertsByTeacher, getAlertsBySchool, getUnreadAlertCount } from './mockAlerts';
export { notifications, getNotificationsForUser, getUnreadNotificationCount, getAllSentNotifications } from './mockNotifications';
export { libraryMaterials, getMaterialsByTeacher, getMaterialsBySubject, searchMaterials } from './mockLibrary';
export { planningUnits, getPlanningByTeacher, getPlanningBySubjectAndCourse } from './mockPlanning';
export { communications, getCommunicationsBySchool } from './mockCommunications';

// ── Computed helpers ──

import type { TeacherStats, DirectorStats, User } from '../types';
import { getScheduleByTeacher, getTodaySchedule } from './mockSchedule';
import { students } from './mockStudents';
import { alerts } from './mockAlerts';
import { getTeacherUsers } from './mockUsers';

export function getTeacherStats(user: User, todayDayIndex: number): TeacherStats {
  const courseIds = user.subjects?.map(s => s.courseId) ?? [];
  const uniqueCourseIds = [...new Set(courseIds)];
  const myStudents = students.filter(s => uniqueCourseIds.includes(s.courseId));
  const todayClasses = getTodaySchedule(user.id, todayDayIndex);

  return {
    totalStudents: myStudents.length,
    classesToday: todayClasses.length,
    pendingEvaluations: Math.floor(Math.random() * 5) + 2, // mock
    avgAttendance: myStudents.length > 0
      ? parseFloat((myStudents.reduce((sum, s) => sum + s.attendance, 0) / myStudents.length).toFixed(1))
      : 0,
  };
}

export function getDirectorStats(): DirectorStats {
  const teachers = getTeacherUsers();
  const allSchedule = teachers.flatMap(t => getScheduleByTeacher(t.id));
  const todayIndex = new Date().getDay() - 1; // Mon=0
  const todayClasses = allSchedule.filter(b => b.dayIndex === todayIndex);

  return {
    totalTeachers: teachers.length,
    activeClasses: todayClasses.length,
    totalAlerts: alerts.filter(a => !a.isRead).length,
    avgAttendance: students.length > 0
      ? parseFloat((students.reduce((sum, s) => sum + s.attendance, 0) / students.length).toFixed(1))
      : 0,
    totalStudents: students.length,
  };
}

// Sparkline data (synthetic for dashboard)
export const sparklineData = {
  students: [120, 125, 130, 128, 135, 138, 142],
  classes: [4, 3, 5, 4, 4, 3, 4],
  evaluations: [12, 10, 8, 9, 11, 8, 7],
  attendance: [88, 89, 90, 89, 91, 90, 91.4],
};

export const statsTrends = {
  students: { value: 3.2, up: true },
  classes: { value: 0, up: true },
  evaluations: { value: 22, up: false },
  attendance: { value: 1.2, up: true },
};

// Weekly calendar (for dashboard widget)
export function getWeeklyCalendar(teacherId: string) {
  const days = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE'];
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  return days.map((day, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() + mondayOffset + idx);
    const classes = getTodaySchedule(teacherId, idx);
    return {
      day,
      date: date.getDate(),
      active: idx === (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
      classes: classes.length,
    };
  });
}
