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
  code: BadgeCode;
  earnedAt: string;
}

export const BADGE_META: Record<BadgeCode, { emoji: string; label: string; description: string }> = {
  primer_quiz: { emoji: '🎯', label: 'Primer quiz', description: 'Completaste tu primera práctica' },
  quiz_perfecto: { emoji: '💯', label: 'Quiz perfecto', description: 'Respondiste todo bien en una práctica' },
  racha_5: { emoji: '🔥', label: 'Racha de 5 días', description: 'Practicaste 5 días seguidos' },
  diez_practicas: { emoji: '🏅', label: '10 prácticas', description: 'Completaste 10 prácticas' },
};

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
