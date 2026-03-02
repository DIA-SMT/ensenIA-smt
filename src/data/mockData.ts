export const alerts = [
    { id: 1, type: 'danger', message: 'Juan Pérez tiene 5 inasistencias consecutivas.', date: 'Hoy' },
    { id: 2, type: 'warning', message: 'Bajo rendimiento en Matemática - 3er Año.', date: 'Ayer' },
    { id: 3, type: 'success', message: 'Evaluación de Historia completada por el 95% del curso.', date: 'Hace 2 días' },
];

export const upcomingClasses = [
    { id: 1, subject: 'Biología', course: '4to 2da', time: '10:30 - 11:50', room: 'Aula 12' },
    { id: 2, subject: 'Física', course: '5to 1ra', time: '12:00 - 13:20', room: 'Laboratorio' },
    { id: 3, subject: 'Química', course: '3er 3ra', time: '14:00 - 15:20', room: 'Aula 8' },
];

export const weeklyCalendar = [
    { day: 'Lun', date: 15, active: false },
    { day: 'Mar', date: 16, active: false },
    { day: 'Mié', date: 17, active: true },
    { day: 'Jue', date: 18, active: false },
    { day: 'Vie', date: 19, active: false },
];

export const recentActivity = [
    { id: 1, action: 'Generó actividad con IA', subject: 'Biología Celular', time: 'Hace 2 horas' },
    { id: 2, action: 'Calificó evaluaciones', subject: 'Física Cuántica', time: 'Ayer, 18:30' },
    { id: 3, action: 'Subió material', subject: 'Química Orgánica', time: 'Lunes, 09:15' },
];

export const stats = {
    totalStudents: 142,
    classesToday: 4,
    pendingEvaluations: 2,
};
