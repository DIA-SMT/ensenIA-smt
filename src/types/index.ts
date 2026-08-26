/* ═══════════════════════════════════════════════
   ENSEÑIA SMT — Domain Types (Supabase-ready)
   ═══════════════════════════════════════════════ */

// ── Enums ──
export type UserRole = 'director' | 'docente' | 'estudiante' | 'padre';
export type AlertLevel = 'danger' | 'warning' | 'info' | 'success';
export type AlertCategory = 'academic' | 'attendance' | 'conduct' | 'system';
export type StudentStatus = 'excellent' | 'good' | 'warning' | 'critical';
export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
export type NotificationPriority = 'high' | 'medium' | 'low';
export type FileType = 'pdf' | 'doc' | 'image' | 'link';

// ── IA Chat ──
export type ChatRole = 'user' | 'assistant' | 'system';
export type IAToolType = 'act' | 'eval' | 'sum' | 'pres' | 'oral' | 'free';
export type IAModel = 'haiku' | 'sonnet';

// ── School ──
export interface School {
  id: string;
  name: string;
  shortName: string;
  address: string;
  district: string;
}

// ── User ──
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolId: string;
  avatarInitials: string;
  subjects?: SubjectAssignment[];
  createdAt: string;
}

export interface SubjectAssignment {
  subjectId: string;
  courseId: string;
  courseName: string;
}

// ── Subject & Course ──
export interface Subject {
  id: string;
  name: string;
  color: string;
}

export interface Course {
  id: string;
  name: string;
  year: number;
  division: string;
  studentCount: number;
  schoolId: string;
}

// ── Student ──
export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarInitials: string;
  courseId: string;
  courseName: string;
  status: StudentStatus;
  alerts: number;
  progress: number;
  attendance: number;
  average: number;
  schoolId: string;
  userId?: string | null;
  email?: string | null;
}

// ── Enrollment (inscripción por materia, con ID visible) ──
export interface Enrollment {
  id: string;
  studentId: string;
  subjectId: string;
  courseId: string;
  enrollmentCode: string;
  schoolId: string;
  subjectName?: string;
  courseName?: string;
}

// ── Activities ──
export type ActivityStatus = 'draft' | 'published' | 'closed';
export type SubmissionStatus = 'pending' | 'in_progress' | 'submitted' | 'graded';
export type ActivityQuestionType = 'multiple_choice' | 'open';

export interface ActivityQuestion {
  id: string;
  type: ActivityQuestionType;
  prompt: string;
  options?: string[];
  correct_index?: number;
}

export interface Activity {
  id: string;
  title: string;
  description?: string;
  contentMd: string;
  questions: ActivityQuestion[];
  subjectId: string;
  courseId: string;
  teacherId: string;
  schoolId: string;
  unitId?: string | null;
  classId?: string | null;
  sourceTool?: IAToolType | null;
  status: ActivityStatus;
  dueDate?: string | null;
  points?: number | null;
  createdAt: string;
  subjectName?: string;
  courseName?: string;
}

export interface ActivityAnswer {
  answer: string | number;
  correct?: boolean;
}

export interface ActivitySubmission {
  id: string;
  activityId: string;
  studentId: string;
  status: SubmissionStatus;
  answers: Record<string, ActivityAnswer>;
  responseText?: string | null;
  autoScore?: number | null;
  score?: number | null;
  feedback?: string | null;
  feedbackReaction?: string | null;
  timeSpentSeconds: number;
  startedAt?: string | null;
  submittedAt?: string | null;
  gradedAt?: string | null;
}

// ── Bienestar: check-in emocional ──
export type CheckinMoment = 'inicio' | 'fin';
export type CheckinFeeling = 'genial' | 'bien' | 'neutral' | 'confundido' | 'frustrado';

export interface StudentCheckin {
  id: string;
  studentId: string;
  activityId?: string | null;
  moment: CheckinMoment;
  feeling: CheckinFeeling;
  comment?: string | null;
  createdAt: string;
}

export const FEELING_META: Record<CheckinFeeling, { emoji: string; label: string; value: number }> = {
  genial: { emoji: '😄', label: 'Genial', value: 5 },
  bien: { emoji: '🙂', label: 'Bien', value: 4 },
  neutral: { emoji: '😐', label: 'Más o menos', value: 3 },
  confundido: { emoji: '😕', label: 'Confundido/a', value: 2 },
  frustrado: { emoji: '😣', label: 'Frustrado/a', value: 1 },
};

// ── Observaciones del docente ──
export type ObservationCategory = 'logro' | 'dificultad' | 'participacion' | 'conducta' | 'familia' | 'otro';

export interface StudentObservation {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId?: string | null;
  category: ObservationCategory;
  note: string;
  createdAt: string;
  teacherName?: string;
}

export const OBSERVATION_META: Record<ObservationCategory, { emoji: string; label: string }> = {
  logro: { emoji: '⭐', label: 'Logro' },
  dificultad: { emoji: '🧗', label: 'Dificultad' },
  participacion: { emoji: '🙋', label: 'Participación' },
  conducta: { emoji: '⚖️', label: 'Conducta' },
  familia: { emoji: '👨‍👩‍👧', label: 'Familia' },
  otro: { emoji: '📝', label: 'Otro' },
};

// ── Familias ──
export interface GuardianLink {
  id: string;
  studentId: string;
  guardianUserId: string;
  relationship: string;
  guardianName?: string;
  guardianEmail?: string;
}

export type NoticeType = 'comunicado' | 'citacion';
export type NoticeResponse = 'asistire' | 'no_puedo';

export interface GuardianNotice {
  id: string;
  schoolId: string;
  studentId?: string | null;
  fromUserId: string;
  fromName?: string;
  type: NoticeType;
  title: string;
  body: string;
  meetingAt?: string | null;
  meetingPlace?: string | null;
  createdAt: string;
  studentName?: string;
  /** estado del tutor logueado */
  readAt?: string | null;
  response?: NoticeResponse | null;
}

export interface NoticeReceipt {
  guardianUserId: string;
  guardianName?: string;
  readAt?: string | null;
  response?: NoticeResponse | null;
  respondedAt?: string | null;
}

export type ActivityEventType =
  | 'viewed' | 'started' | 'answer_changed' | 'submitted'
  | 'reopened' | 'focus_lost' | 'focus_gained';

export interface ActivityEvent {
  id: string;
  activityId: string;
  studentId: string;
  eventType: ActivityEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── Schedule ──
export interface ScheduleBlock {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  dayIndex: number;
  startHour: number;
  duration: number;
  room: string;
  colorClass: string;
  studentCount: number;
}

// ── Alert ──
export interface Alert {
  id: string;
  type: AlertLevel;
  category: AlertCategory;
  title: string;
  message: string;
  date: string;
  studentIds?: string[];
  teacherId?: string;
  schoolId: string;
  isRead: boolean;
  createdAt: string;
}

// ── Notification (Director → Teacher) ──
export interface Notification {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string | 'all';
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  schoolId: string;
  createdAt: string;
}

// ── Biblioteca Docente ──
export interface LibraryMaterial {
  id: string;
  title: string;
  description: string;
  fileType: FileType;
  fileName: string;
  fileSize: string;
  subjectId: string;
  subjectName: string;
  unitName?: string;
  teacherId: string;
  schoolId: string;
  tags: string[];
  uploadedAt: string;
  storagePath?: string | null;
  fileSizeBytes?: number | null;
  extractedText?: string | null;
  aiSummary?: string | null;
  isSharedWithStudents: boolean;
  studyCards?: StudyCard[] | null;
  practiceQuiz?: PracticeQuestion[] | null;
  studyGuide?: string | null;
}

// ── Placas de estudio ──
export interface StudyCard {
  emoji: string;
  title: string;
  body: string;
}

// ── Modo Estudio (práctica gamificada del estudiante) ──
export interface PracticeQuestion {
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  hint?: string;
}

export interface PracticeAttempt {
  id: string;
  studentId: string;
  materialId: string | null;
  score: number;
  total: number;
  xpEarned: number;
  createdAt: string;
}

export interface StudentProgress {
  studentId: string;
  xp: number;
  streakDays: number;
  bestStreak: number;
  lastPracticeDate: string | null;
  totalAttempts: number;
  perfectCount: number;
}

export type BadgeCode = 'primer_quiz' | 'quiz_perfecto' | 'racha_5' | 'diez_practicas';

export interface StudentBadge {
  /** Código del catálogo BADGE_META, o dinámico 'crack:<subjectId>' (medalla de materia). */
  code: string;
  earnedAt: string;
}

export const BADGE_META: Record<BadgeCode, { emoji: string; label: string; description: string }> = {
  primer_quiz: { emoji: '🎯', label: 'Primer quiz', description: 'Completaste tu primera práctica' },
  quiz_perfecto: { emoji: '💯', label: 'Quiz perfecto', description: 'Respondiste todo bien en una práctica' },
  racha_5: { emoji: '🔥', label: 'Racha de 5 días', description: 'Practicaste 5 días seguidos' },
  diez_practicas: { emoji: '🏅', label: '10 prácticas', description: 'Completaste 10 prácticas' },
};

// ── Niveles (derivados del XP, sin tabla) ──
export interface Level {
  n: number;
  name: string;
  minXp: number;
}

export const LEVELS: Level[] = [
  { n: 1, name: 'Recién llegado/a', minXp: 0 },
  { n: 2, name: 'En marcha', minXp: 100 },
  { n: 3, name: 'Estudioso/a', minXp: 250 },
  { n: 4, name: 'Capo/a', minXp: 450 },
  { n: 5, name: 'Crack', minXp: 700 },
  { n: 6, name: 'Ídolo/a', minXp: 1000 },
  { n: 7, name: 'Leyenda', minXp: 1400 },
  { n: 8, name: 'Aura máxima', minXp: 1900 },
];

/** Nivel actual + progreso hacia el próximo (0..1; 1 si es el último). */
export function levelForXp(xp: number): { level: Level; next: Level | null; progress: number } {
  let level = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) level = l;
  const next = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
  const progress = next ? Math.min(1, (xp - level.minXp) / (next.minXp - level.minXp)) : 1;
  return { level, next, progress };
}

// ── Medallas otorgadas por personas ──

/** Medalla de docente a estudiante. */
export interface StudentAward {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId: string | null;
  badgeCode: string;
  message: string | null;
  createdAt: string;
  teacherName?: string;
  subjectName?: string;
}

/** Medalla de directivo a docente. */
export interface TeacherAward {
  id: string;
  teacherId: string;
  directorId: string;
  badgeCode: string;
  message: string | null;
  createdAt: string;
  directorName?: string;
  teacherName?: string;
}

/** Catálogo de medallas docente → estudiante (mitad clásicas, mitad bien argentas). */
export const AWARD_META: Record<string, { emoji: string; label: string; description: string }> = {
  crack: { emoji: '🌟', label: '¡Crack!', description: 'Te la re bancaste' },
  aura: { emoji: '✨', label: 'Aura +1', description: 'Subiste tu aura con esta' },
  genio: { emoji: '🧠', label: '¡Qué genio!', description: 'Una respuesta brillante' },
  esfuerzo: { emoji: '💪', label: 'Esfuerzo total', description: 'Se nota cuánto le pusiste' },
  imparable: { emoji: '📈', label: 'Imparable', description: 'Mejoraste un montón' },
  companerismo: { emoji: '🤝', label: 'Gran compañero/a', description: 'Ayudaste a otros a aprender' },
  participacion: { emoji: '🙋', label: 'Siempre presente', description: 'Participación destacada en clase' },
  creatividad: { emoji: '🎨', label: 'Idea grosa', description: 'Creatividad fuera de serie' },
};

/** Catálogo de medallas directivo → docente. */
export const TEACHER_AWARD_META: Record<string, { emoji: string; label: string; description: string }> = {
  presente_total: { emoji: '🗓️', label: 'Presente total', description: 'Por no faltar nunca' },
  fabrica_actividades: { emoji: '🏭', label: 'Fábrica de actividades', description: 'Por crear actividades en la plataforma' },
  siempre_ahi: { emoji: '💬', label: 'Siempre ahí', description: 'Por comunicarse con los chicos en la plataforma' },
  crack_docente: { emoji: '🌟', label: '¡Crack!', description: 'Reconocimiento de la dirección' },
  aura_docente: { emoji: '✨', label: 'Aura +1', description: 'Subiste el aura de la escuela' },
  innovacion: { emoji: '🚀', label: 'Innovador/a', description: 'Por animarse a probar cosas nuevas' },
};

/** Etiqueta de la medalla automática de materia: 'crack:<subjectId>' → frase lunfarda. */
export function subjectBadgeLabel(subjectName: string): string {
  const templates = [
    `El crack de ${subjectName}`,
    `${subjectName} es lo mío`,
    `Yo sé de ${subjectName}`,
  ];
  return templates[subjectName.length % templates.length];
}

export interface StudentNote {
  id: string;
  studentId: string;
  text: string;
  isDone: boolean;
  isPinned: boolean;
  createdAt: string;
}

// ── Programa importado (respuesta de process-document) ──
export interface ImportedProgram {
  subject_name: string;
  course_name: string;
  school_year: string;
  teacher_name: string;
  units: { title: string; classes: { title: string; objectives: string[] }[] }[];
}

// ── Planning ──
export interface PlanningUnit {
  id: string;
  title: string;
  subjectId: string;
  courseId: string;
  teacherId: string;
  order: number;
  classes: PlanningClass[];
}

export interface PlanningClass {
  id: string;
  unitId: string;
  title: string;
  order: number;
  objectives?: string[];
  content?: string;
  isComplete: boolean;
}

// ── Insights directivos (tablero de gestión) ──

export interface RiskSignals {
  overdueUnsubmitted: boolean;   // actividad vencida sin entregar
  lowRecentScore: boolean;       // <40% en las últimas 2 entregas
  negativeCheckins: boolean;     // 2+ check-ins negativos en 7 días
  noRecentEvents: boolean;       // sin huella digital en 14 días
  openAlert: boolean;            // alerta sin leer
}

export interface AtRiskStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  courseId: string;
  courseName: string;
  signalCount: number;
  signals: RiskSignals;
}

export interface RiskIndexKpi {
  pct: number;
  atRiskCount: number;
  totalStudents: number;
  atRiskStudents: AtRiskStudent[]; // orden desc por signalCount
}

/** Celda genérica de mapa de calor: numerator/denominator ya resueltos a pct. */
export interface HeatmapCell {
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
  pct: number | null; // null = sin datos
  numerator: number;
  denominator: number;
}

export type HeatmapMetric = 'riesgo' | 'cobertura' | 'entregas';

export interface CurriculumCoverageKpi {
  pct: number | null;
  bySubjectCourse: HeatmapCell[];
}

export interface WellbeingByCourse {
  courseId: string;
  courseName: string;
  positivePct: number;
  totalCheckins: number;
}

export interface WellbeingPulseKpi {
  pct: number | null;
  totalCheckins: number;
  byCourse: WellbeingByCourse[];
}

export interface InactiveTeacher {
  teacherId: string;
  firstName: string;
  lastName: string;
  lastActiveAt: string | null;
}

export interface TeacherAdoptionKpi {
  pct: number;
  activeCount: number;
  totalTeachers: number;
  inactiveTeachers: InactiveTeacher[]; // orden: nunca publicó primero, luego más antiguo
}

export interface NoticeResponseRow {
  noticeId: string;
  title: string;
  type: 'comunicado' | 'citacion';
  createdAt: string;
  audienceSize: number;
  readCount: number;
  readPct: number | null;
  citationConfirmedInTime?: boolean;
}

export interface FamilyResponseKpi {
  readPct: number | null;
  citationConfirmedPct: number | null;
  totalCitations: number;
  recentNotices: NoticeResponseRow[]; // peor % de lectura primero
}

export interface PendingFeedbackRow {
  submissionId: string;
  studentName: string;
  activityTitle: string;
  subjectName: string;
  courseId: string;
  hoursWaiting: number;
}

export interface FeedbackLatencyKpi {
  medianHours: number | null;
  sampleSize: number;
  pendingReview: PendingFeedbackRow[]; // más tiempo esperando primero
}

export interface CourseAssignmentInfo {
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
}

export interface DirectorInsights {
  riskIndex: RiskIndexKpi;
  curriculumCoverage: CurriculumCoverageKpi;
  wellbeingPulse: WellbeingPulseKpi;
  teacherAdoption: TeacherAdoptionKpi;
  familyResponse: FamilyResponseKpi;
  feedbackLatency: FeedbackLatencyKpi;
  heatmap: Record<HeatmapMetric, HeatmapCell[]>;
  courseAssignments: Record<string, CourseAssignmentInfo[]>; // por courseId
  courses: Course[];
}

// ── Stats ──
export interface TeacherStats {
  totalStudents: number;
  classesToday: number;
  pendingEvaluations: number;
  avgAttendance: number;
}

export interface DirectorStats {
  totalTeachers: number;
  activeClasses: number;
  totalAlerts: number;
  avgAttendance: number;
  totalStudents: number;
}

// ── Communication (Director) ──
export interface Communication {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserIds: string[] | 'all';
  toNames: string[];
  subject: string;
  body: string;
  priority: NotificationPriority;
  schoolId: string;
  sentAt: string;
  readBy: string[];
}

// ── Activity ──
export interface RecentActivity {
  id: string;
  action: string;
  subject: string;
  time: string;
  type: 'ia' | 'eval' | 'material' | 'alert' | 'communication';
  userId: string;
}

// ── IA Chat Session ──
export interface ChatSession {
  id: string;
  teacherId: string;
  classId: string | null;
  subjectId: string | null;
  courseId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  toolUsed: IAToolType | null;
  modelUsed: IAModel | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface IAUsage {
  id: string;
  teacherId: string;
  usageDate: string;
  messageCount: number;
  tokenCountIn: number;
  tokenCountOut: number;
}

export interface IAChatContext {
  subjectName: string;
  courseName: string;
  unitTitle?: string;
  classTitle?: string;
  classObjectives?: string[];
  classContent?: string;
  difficulty?: number;
  educationLevel?: string;
  documentTitle?: string;
  documentText?: string;
}

// ── Quick Note / Reminder ──
export interface QuickNote {
  id: string;
  text: string;
  teacherId: string;
  createdAt: string;
  isPinned: boolean;
}
