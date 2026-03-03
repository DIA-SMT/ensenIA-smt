import type { Student } from '../types';

export const students: Student[] = [
  // 4to 2da (Marco - Biología)
  { id: 'st-1', firstName: 'Martina', lastName: 'Silva', avatarInitials: 'MS', courseId: 'c-4-2', courseName: '4to 2da', status: 'excellent', alerts: 0, progress: 95, attendance: 97, average: 9.2, schoolId: 'school-1' },
  { id: 'st-2', firstName: 'Juan', lastName: 'Pérez', avatarInitials: 'JP', courseId: 'c-4-2', courseName: '4to 2da', status: 'critical', alerts: 3, progress: 45, attendance: 62, average: 4.8, schoolId: 'school-1' },
  { id: 'st-3', firstName: 'Lucía', lastName: 'Gómez', avatarInitials: 'LG', courseId: 'c-4-2', courseName: '4to 2da', status: 'good', alerts: 0, progress: 80, attendance: 88, average: 7.5, schoolId: 'school-1' },
  { id: 'st-4', firstName: 'Tomás', lastName: 'Rodríguez', avatarInitials: 'TR', courseId: 'c-4-2', courseName: '4to 2da', status: 'warning', alerts: 1, progress: 65, attendance: 75, average: 6.1, schoolId: 'school-1' },
  { id: 'st-5', firstName: 'Valentina', lastName: 'López', avatarInitials: 'VL', courseId: 'c-4-2', courseName: '4to 2da', status: 'excellent', alerts: 0, progress: 92, attendance: 95, average: 8.8, schoolId: 'school-1' },

  // 4to 1ra (Marco - Biología)
  { id: 'st-6', firstName: 'Agustín', lastName: 'Fernández', avatarInitials: 'AF', courseId: 'c-4-1', courseName: '4to 1ra', status: 'good', alerts: 0, progress: 78, attendance: 90, average: 7.2, schoolId: 'school-1' },
  { id: 'st-7', firstName: 'Camila', lastName: 'Torres', avatarInitials: 'CT', courseId: 'c-4-1', courseName: '4to 1ra', status: 'excellent', alerts: 0, progress: 91, attendance: 96, average: 9.0, schoolId: 'school-1' },
  { id: 'st-8', firstName: 'Mateo', lastName: 'Díaz', avatarInitials: 'MD', courseId: 'c-4-1', courseName: '4to 1ra', status: 'warning', alerts: 2, progress: 55, attendance: 70, average: 5.5, schoolId: 'school-1' },

  // 5to 1ra (Marco - Física)
  { id: 'st-9', firstName: 'Sofía', lastName: 'Ramírez', avatarInitials: 'SR', courseId: 'c-5-1', courseName: '5to 1ra', status: 'excellent', alerts: 0, progress: 94, attendance: 98, average: 9.5, schoolId: 'school-1' },
  { id: 'st-10', firstName: 'Nicolás', lastName: 'Moreno', avatarInitials: 'NM', courseId: 'c-5-1', courseName: '5to 1ra', status: 'good', alerts: 0, progress: 82, attendance: 85, average: 7.8, schoolId: 'school-1' },
  { id: 'st-11', firstName: 'María', lastName: 'López', avatarInitials: 'ML', courseId: 'c-5-1', courseName: '5to 1ra', status: 'critical', alerts: 2, progress: 40, attendance: 58, average: 4.2, schoolId: 'school-1' },

  // 5to 2da (Marco - Química)
  { id: 'st-12', firstName: 'Diego', lastName: 'Álvarez', avatarInitials: 'DA', courseId: 'c-5-2', courseName: '5to 2da', status: 'good', alerts: 0, progress: 76, attendance: 87, average: 7.0, schoolId: 'school-1' },
  { id: 'st-13', firstName: 'Carolina', lastName: 'Benítez', avatarInitials: 'CB', courseId: 'c-5-2', courseName: '5to 2da', status: 'excellent', alerts: 0, progress: 89, attendance: 93, average: 8.5, schoolId: 'school-1' },

  // 3er 1ra (Laura - Matemática, Carlos - Historia)
  { id: 'st-14', firstName: 'Facundo', lastName: 'Giménez', avatarInitials: 'FG', courseId: 'c-3-1', courseName: '3er 1ra', status: 'good', alerts: 0, progress: 74, attendance: 82, average: 7.1, schoolId: 'school-1' },
  { id: 'st-15', firstName: 'Abril', lastName: 'Sosa', avatarInitials: 'AS', courseId: 'c-3-1', courseName: '3er 1ra', status: 'warning', alerts: 1, progress: 60, attendance: 72, average: 5.8, schoolId: 'school-1' },
  { id: 'st-16', firstName: 'Lautaro', lastName: 'Medina', avatarInitials: 'LM', courseId: 'c-3-1', courseName: '3er 1ra', status: 'excellent', alerts: 0, progress: 88, attendance: 94, average: 8.6, schoolId: 'school-1' },

  // 3er 3ra (Carlos - Historia)
  { id: 'st-17', firstName: 'Julieta', lastName: 'Herrera', avatarInitials: 'JH', courseId: 'c-3-3', courseName: '3er 3ra', status: 'good', alerts: 0, progress: 79, attendance: 88, average: 7.4, schoolId: 'school-1' },
  { id: 'st-18', firstName: 'Sebastián', lastName: 'Castro', avatarInitials: 'SC', courseId: 'c-3-3', courseName: '3er 3ra', status: 'critical', alerts: 3, progress: 38, attendance: 55, average: 3.9, schoolId: 'school-1' },

  // 6to 1ra (Carlos - Lengua)
  { id: 'st-19', firstName: 'Renata', lastName: 'Núñez', avatarInitials: 'RN', courseId: 'c-6-1', courseName: '6to 1ra', status: 'excellent', alerts: 0, progress: 96, attendance: 99, average: 9.7, schoolId: 'school-1' },
  { id: 'st-20', firstName: 'Ignacio', lastName: 'Vera', avatarInitials: 'IV', courseId: 'c-6-1', courseName: '6to 1ra', status: 'good', alerts: 0, progress: 81, attendance: 86, average: 7.6, schoolId: 'school-1' },
];

export function getStudentsByCourse(courseId: string): Student[] {
  return students.filter(s => s.courseId === courseId);
}

export function getStudentsByTeacher(teacherCourseIds: string[]): Student[] {
  return students.filter(s => teacherCourseIds.includes(s.courseId));
}

export function getStudentById(id: string): Student | undefined {
  return students.find(s => s.id === id);
}
