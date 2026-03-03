import type { Communication } from '../types';

export const communications: Communication[] = [
  {
    id: 'comm-1',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserIds: 'all', toNames: ['Todos los docentes'],
    subject: 'Reunión de personal - Viernes 7/3',
    body: 'Estimados docentes,\n\nLes recuerdo que este viernes 7 de marzo a las 17:00 tendremos la reunión mensual de personal en la Sala de Profesores.\n\nAgenda:\n- Revisión de planificaciones trimestrales\n- Actualización sobre herramientas IA\n- Preparación acto 24 de marzo\n\nAsistencia obligatoria. Confirmar asistencia.\n\nSaludos cordiales,\nAna Martínez\nDirección',
    priority: 'high',
    schoolId: 'school-1',
    sentAt: '2026-03-02T09:00:00',
    readBy: ['user-laura'],
  },
  {
    id: 'comm-2',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserIds: ['user-marco'], toNames: ['Marco Rossi'],
    subject: 'Planificación trimestral de Biología',
    body: 'Hola Marco,\n\nNecesito que envíes la planificación trimestral de Biología para 4to y 5to año antes del viernes.\n\nRecordá incluir los objetivos de aprendizaje prioritarios y las actividades con IA que estás implementando.\n\nGracias,\nAna',
    priority: 'medium',
    schoolId: 'school-1',
    sentAt: '2026-03-01T14:30:00',
    readBy: [],
  },
  {
    id: 'comm-3',
    fromUserId: 'user-director', fromName: 'Ana Martínez',
    toUserIds: 'all', toNames: ['Todos los docentes'],
    subject: 'Jornada de capacitación IA - Miércoles 5/3',
    body: 'Estimados colegas,\n\nEl miércoles 5 de marzo realizaremos una jornada de capacitación sobre las nuevas herramientas de IA integradas en la plataforma ENSEÑIA SMT.\n\nHorario: 14:00 a 17:00\nLugar: Laboratorio de Informática\n\nLa asistencia es obligatoria. Traer notebook si tienen.\n\nDirección',
    priority: 'high',
    schoolId: 'school-1',
    sentAt: '2026-02-28T10:00:00',
    readBy: ['user-marco', 'user-laura', 'user-carlos'],
  },
];

export function getCommunicationsBySchool(schoolId: string): Communication[] {
  return communications
    .filter(c => c.schoolId === schoolId)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}
