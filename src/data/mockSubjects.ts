import type { Subject, Course } from '../types';

export const subjects: Subject[] = [
  { id: 'sub-bio', name: 'Biología', color: 'green' },
  { id: 'sub-fis', name: 'Física', color: 'blue' },
  { id: 'sub-qui', name: 'Química', color: 'purple' },
  { id: 'sub-mat', name: 'Matemática', color: 'orange' },
  { id: 'sub-his', name: 'Historia', color: 'amber' },
  { id: 'sub-len', name: 'Lengua y Literatura', color: 'teal' },
];

export const courses: Course[] = [
  { id: 'c-3-1', name: '3er 1ra', year: 3, division: '1ra', studentCount: 28, schoolId: 'school-1' },
  { id: 'c-3-3', name: '3er 3ra', year: 3, division: '3ra', studentCount: 25, schoolId: 'school-1' },
  { id: 'c-4-1', name: '4to 1ra', year: 4, division: '1ra', studentCount: 30, schoolId: 'school-1' },
  { id: 'c-4-2', name: '4to 2da', year: 4, division: '2da', studentCount: 28, schoolId: 'school-1' },
  { id: 'c-5-1', name: '5to 1ra', year: 5, division: '1ra', studentCount: 26, schoolId: 'school-1' },
  { id: 'c-5-2', name: '5to 2da', year: 5, division: '2da', studentCount: 24, schoolId: 'school-1' },
  { id: 'c-6-1', name: '6to 1ra', year: 6, division: '1ra', studentCount: 22, schoolId: 'school-1' },
];

export function getSubjectById(id: string): Subject | undefined {
  return subjects.find(s => s.id === id);
}

export function getCourseById(id: string): Course | undefined {
  return courses.find(c => c.id === id);
}
