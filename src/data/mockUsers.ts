import type { User } from '../types';

export const users: User[] = [
  {
    id: 'user-director',
    email: 'ana.martinez@ensenia.edu.ar',
    firstName: 'Ana',
    lastName: 'Martínez',
    role: 'director',
    schoolId: 'school-1',
    avatarInitials: 'AM',
    createdAt: '2024-03-01',
  },
  {
    id: 'user-marco',
    email: 'marco.rossi@ensenia.edu.ar',
    firstName: 'Marco',
    lastName: 'Rossi',
    role: 'docente',
    schoolId: 'school-1',
    avatarInitials: 'MR',
    subjects: [
      { subjectId: 'sub-bio', courseId: 'c-4-2', courseName: '4to 2da' },
      { subjectId: 'sub-bio', courseId: 'c-4-1', courseName: '4to 1ra' },
      { subjectId: 'sub-fis', courseId: 'c-5-1', courseName: '5to 1ra' },
      { subjectId: 'sub-qui', courseId: 'c-5-2', courseName: '5to 2da' },
    ],
    createdAt: '2024-03-15',
  },
  {
    id: 'user-laura',
    email: 'laura.garcia@ensenia.edu.ar',
    firstName: 'Laura',
    lastName: 'García',
    role: 'docente',
    schoolId: 'school-1',
    avatarInitials: 'LG',
    subjects: [
      { subjectId: 'sub-mat', courseId: 'c-3-1', courseName: '3er 1ra' },
      { subjectId: 'sub-mat', courseId: 'c-4-2', courseName: '4to 2da' },
      { subjectId: 'sub-mat', courseId: 'c-5-1', courseName: '5to 1ra' },
    ],
    createdAt: '2024-04-01',
  },
  {
    id: 'user-carlos',
    email: 'carlos.mendez@ensenia.edu.ar',
    firstName: 'Carlos',
    lastName: 'Méndez',
    role: 'docente',
    schoolId: 'school-1',
    avatarInitials: 'CM',
    subjects: [
      { subjectId: 'sub-his', courseId: 'c-3-1', courseName: '3er 1ra' },
      { subjectId: 'sub-his', courseId: 'c-3-3', courseName: '3er 3ra' },
      { subjectId: 'sub-len', courseId: 'c-4-1', courseName: '4to 1ra' },
      { subjectId: 'sub-len', courseId: 'c-6-1', courseName: '6to 1ra' },
    ],
    createdAt: '2024-04-10',
  },
];

export const loginCredentials: Record<string, { password: string; userId: string }> = {
  'ana.martinez@ensenia.edu.ar': { password: 'demo123', userId: 'user-director' },
  'marco.rossi@ensenia.edu.ar': { password: 'demo123', userId: 'user-marco' },
  'laura.garcia@ensenia.edu.ar': { password: 'demo123', userId: 'user-laura' },
  'carlos.mendez@ensenia.edu.ar': { password: 'demo123', userId: 'user-carlos' },
};

export function getUserById(id: string): User | undefined {
  return users.find(u => u.id === id);
}

export function getTeacherUsers(): User[] {
  return users.filter(u => u.role === 'docente');
}
