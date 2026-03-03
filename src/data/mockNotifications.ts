import type { Notification } from '../types';

export const notifications: Notification[] = [
  {
    id: 'notif-1',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserId: 'all',
    title: 'Reunión de personal',
    message: 'Recordatorio: reunión de personal este viernes 7/3 a las 17:00 en Sala de Profesores.',
    priority: 'high',
    isRead: false,
    schoolId: 'school-1',
    createdAt: '2026-03-02T09:00:00',
  },
  {
    id: 'notif-2',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserId: 'user-marco',
    title: 'Planificación trimestral',
    message: 'Marco, necesito que envíes la planificación trimestral de Biología antes del viernes. Gracias.',
    priority: 'medium',
    isRead: false,
    schoolId: 'school-1',
    createdAt: '2026-03-01T14:30:00',
  },
  {
    id: 'notif-3',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserId: 'all',
    title: 'Jornada de capacitación IA',
    message: 'El próximo miércoles 5/3 habrá una jornada de capacitación sobre herramientas IA para docentes. Asistencia obligatoria.',
    priority: 'high',
    isRead: true,
    schoolId: 'school-1',
    createdAt: '2026-02-28T10:00:00',
  },
  {
    id: 'notif-4',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserId: 'user-laura',
    title: 'Material de evaluación',
    message: 'Laura, favor enviar los resultados de las evaluaciones de Matemática de 3er año.',
    priority: 'low',
    isRead: true,
    schoolId: 'school-1',
    createdAt: '2026-02-27T11:00:00',
  },
  {
    id: 'notif-5',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserId: 'user-carlos',
    title: 'Acto escolar',
    message: 'Carlos, ¿podrías preparar una actividad de Historia para el acto del 24 de marzo? Coordinemos.',
    priority: 'medium',
    isRead: false,
    schoolId: 'school-1',
    createdAt: '2026-03-01T16:00:00',
  },
];

export function getNotificationsForUser(userId: string): Notification[] {
  return notifications
    .filter(n => n.toUserId === userId || n.toUserId === 'all')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getUnreadNotificationCount(userId: string): number {
  return notifications.filter(
    n => (n.toUserId === userId || n.toUserId === 'all') && !n.isRead
  ).length;
}

export function getAllSentNotifications(): Notification[] {
  return [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
