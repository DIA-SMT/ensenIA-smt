import type { ScheduleBlock } from '../types';

export const scheduleBlocks: ScheduleBlock[] = [
  // ── Marco Rossi ──
  { id: 'sch-1', teacherId: 'user-marco', subjectId: 'sub-bio', subjectName: 'Biología Celular', courseId: 'c-4-2', courseName: '4to 2da', dayOfWeek: 'lunes', dayIndex: 0, startHour: 8, duration: 1.5, room: 'Aula 12', colorClass: 'green', studentCount: 28 },
  { id: 'sch-2', teacherId: 'user-marco', subjectId: 'sub-fis', subjectName: 'Física', courseId: 'c-5-1', courseName: '5to 1ra', dayOfWeek: 'lunes', dayIndex: 0, startHour: 10, duration: 1.5, room: 'Laboratorio', colorClass: 'blue', studentCount: 26 },
  { id: 'sch-3', teacherId: 'user-marco', subjectId: 'sub-qui', subjectName: 'Química Orgánica', courseId: 'c-5-2', courseName: '5to 2da', dayOfWeek: 'martes', dayIndex: 1, startHour: 9, duration: 1.5, room: 'Laboratorio', colorClass: 'purple', studentCount: 24 },
  { id: 'sch-4', teacherId: 'user-marco', subjectId: 'sub-bio', subjectName: 'Biología Celular', courseId: 'c-4-1', courseName: '4to 1ra', dayOfWeek: 'miercoles', dayIndex: 2, startHour: 8, duration: 1.5, room: 'Aula 11', colorClass: 'green', studentCount: 30 },
  { id: 'sch-5', teacherId: 'user-marco', subjectId: 'sub-fis', subjectName: 'Física', courseId: 'c-5-1', courseName: '5to 1ra', dayOfWeek: 'miercoles', dayIndex: 2, startHour: 10, duration: 1.5, room: 'Aula 14', colorClass: 'blue', studentCount: 26 },
  { id: 'sch-6', teacherId: 'user-marco', subjectId: 'sub-bio', subjectName: 'Biología Celular', courseId: 'c-4-2', courseName: '4to 2da', dayOfWeek: 'miercoles', dayIndex: 2, startHour: 14, duration: 1.5, room: 'Aula 12', colorClass: 'green', studentCount: 28 },
  { id: 'sch-7', teacherId: 'user-marco', subjectId: 'sub-qui', subjectName: 'Química Orgánica', courseId: 'c-5-2', courseName: '5to 2da', dayOfWeek: 'jueves', dayIndex: 3, startHour: 8, duration: 1.5, room: 'Laboratorio', colorClass: 'purple', studentCount: 24 },
  { id: 'sch-8', teacherId: 'user-marco', subjectId: 'sub-bio', subjectName: 'Anatomía', courseId: 'c-5-1', courseName: '5to 1ra', dayOfWeek: 'viernes', dayIndex: 4, startHour: 13, duration: 1.5, room: 'Aula 9', colorClass: 'green', studentCount: 26 },

  // ── Laura García ──
  { id: 'sch-9', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-3-1', courseName: '3er 1ra', dayOfWeek: 'lunes', dayIndex: 0, startHour: 8, duration: 1.5, room: 'Aula 5', colorClass: 'orange', studentCount: 28 },
  { id: 'sch-10', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-4-2', courseName: '4to 2da', dayOfWeek: 'lunes', dayIndex: 0, startHour: 10, duration: 1.5, room: 'Aula 12', colorClass: 'orange', studentCount: 28 },
  { id: 'sch-11', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-5-1', courseName: '5to 1ra', dayOfWeek: 'martes', dayIndex: 1, startHour: 8, duration: 1.5, room: 'Aula 14', colorClass: 'orange', studentCount: 26 },
  { id: 'sch-12', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-3-1', courseName: '3er 1ra', dayOfWeek: 'miercoles', dayIndex: 2, startHour: 10, duration: 1.5, room: 'Aula 5', colorClass: 'orange', studentCount: 28 },
  { id: 'sch-13', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-4-2', courseName: '4to 2da', dayOfWeek: 'jueves', dayIndex: 3, startHour: 10, duration: 1.5, room: 'Aula 12', colorClass: 'orange', studentCount: 28 },
  { id: 'sch-14', teacherId: 'user-laura', subjectId: 'sub-mat', subjectName: 'Matemática', courseId: 'c-5-1', courseName: '5to 1ra', dayOfWeek: 'viernes', dayIndex: 4, startHour: 8, duration: 1.5, room: 'Aula 14', colorClass: 'orange', studentCount: 26 },

  // ── Carlos Méndez ──
  { id: 'sch-15', teacherId: 'user-carlos', subjectId: 'sub-his', subjectName: 'Historia', courseId: 'c-3-1', courseName: '3er 1ra', dayOfWeek: 'lunes', dayIndex: 0, startHour: 13, duration: 1.5, room: 'Aula 3', colorClass: 'amber', studentCount: 28 },
  { id: 'sch-16', teacherId: 'user-carlos', subjectId: 'sub-his', subjectName: 'Historia', courseId: 'c-3-3', courseName: '3er 3ra', dayOfWeek: 'martes', dayIndex: 1, startHour: 10, duration: 1.5, room: 'Aula 7', colorClass: 'amber', studentCount: 25 },
  { id: 'sch-17', teacherId: 'user-carlos', subjectId: 'sub-len', subjectName: 'Lengua y Literatura', courseId: 'c-4-1', courseName: '4to 1ra', dayOfWeek: 'martes', dayIndex: 1, startHour: 13, duration: 1.5, room: 'Aula 11', colorClass: 'teal', studentCount: 30 },
  { id: 'sch-18', teacherId: 'user-carlos', subjectId: 'sub-len', subjectName: 'Lengua y Literatura', courseId: 'c-6-1', courseName: '6to 1ra', dayOfWeek: 'miercoles', dayIndex: 2, startHour: 8, duration: 1.5, room: 'Aula 2', colorClass: 'teal', studentCount: 22 },
  { id: 'sch-19', teacherId: 'user-carlos', subjectId: 'sub-his', subjectName: 'Historia', courseId: 'c-3-1', courseName: '3er 1ra', dayOfWeek: 'jueves', dayIndex: 3, startHour: 8, duration: 1.5, room: 'Aula 3', colorClass: 'amber', studentCount: 28 },
  { id: 'sch-20', teacherId: 'user-carlos', subjectId: 'sub-len', subjectName: 'Lengua y Literatura', courseId: 'c-4-1', courseName: '4to 1ra', dayOfWeek: 'viernes', dayIndex: 4, startHour: 10, duration: 1.5, room: 'Aula 11', colorClass: 'teal', studentCount: 30 },
];

export function getScheduleByTeacher(teacherId: string): ScheduleBlock[] {
  return scheduleBlocks.filter(b => b.teacherId === teacherId);
}

export function getTodaySchedule(teacherId: string, dayIndex: number): ScheduleBlock[] {
  return scheduleBlocks
    .filter(b => b.teacherId === teacherId && b.dayIndex === dayIndex)
    .sort((a, b) => a.startHour - b.startHour);
}

export function getNextClass(teacherId: string, dayIndex: number, currentHour: number): ScheduleBlock | undefined {
  return getTodaySchedule(teacherId, dayIndex)
    .find(b => b.startHour >= currentHour);
}
