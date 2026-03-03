import type { Alert } from '../types';

export const alerts: Alert[] = [
  {
    id: 'alert-1', type: 'danger', category: 'attendance',
    title: 'Inasistencias consecutivas',
    message: 'Juan Pérez tiene 5 inasistencias consecutivas.',
    date: 'Hoy', studentIds: ['st-2'], teacherId: 'user-marco',
    schoolId: 'school-1', isRead: false, createdAt: '2026-03-02',
  },
  {
    id: 'alert-2', type: 'warning', category: 'academic',
    title: 'Bajo rendimiento',
    message: 'Bajo rendimiento en Matemática - 3er Año.',
    date: 'Ayer', studentIds: ['st-15'], teacherId: 'user-laura',
    schoolId: 'school-1', isRead: false, createdAt: '2026-03-01',
  },
  {
    id: 'alert-3', type: 'success', category: 'academic',
    title: 'Evaluación completada',
    message: 'Evaluación de Historia completada por el 95% del curso.',
    date: 'Hace 3 días', teacherId: 'user-carlos',
    schoolId: 'school-1', isRead: true, createdAt: '2026-02-27',
  },
  {
    id: 'alert-4', type: 'danger', category: 'academic',
    title: 'Riesgo de repitencia',
    message: 'María López (5to 1ra) tiene 3 materias previas y bajo rendimiento actual.',
    date: 'Hoy', studentIds: ['st-11'], teacherId: 'user-marco',
    schoolId: 'school-1', isRead: false, createdAt: '2026-03-02',
  },
  {
    id: 'alert-5', type: 'warning', category: 'attendance',
    title: 'Límite de faltas',
    message: 'Sebastián Castro se acerca al límite de 15 inasistencias.',
    date: 'Ayer', studentIds: ['st-18'], teacherId: 'user-carlos',
    schoolId: 'school-1', isRead: false, createdAt: '2026-03-01',
  },
  {
    id: 'alert-6', type: 'warning', category: 'conduct',
    title: 'Llamado de atención',
    message: 'Mateo Díaz recibió un reporte disciplinario reciente.',
    date: 'Hace 2 días', studentIds: ['st-8'], teacherId: 'user-marco',
    schoolId: 'school-1', isRead: true, createdAt: '2026-02-28',
  },
];

export function getAlertsByTeacher(teacherId: string): Alert[] {
  return alerts.filter(a => a.teacherId === teacherId);
}

export function getAlertsBySchool(schoolId: string): Alert[] {
  return alerts.filter(a => a.schoolId === schoolId);
}

export function getUnreadAlertCount(teacherId: string): number {
  return alerts.filter(a => a.teacherId === teacherId && !a.isRead).length;
}
