/**
 * ENSEÑIA SMT — Práctica gamificada (Modo Estudio)
 *
 * El estudiante practica con quizzes pedagógicos y acumula XP, racha
 * y logros. El cliente SOLO registra el intento (score/total): el XP,
 * la racha y los logros los calculan triggers en Postgres, a prueba
 * de manipulación (migración 007).
 */

import { supabase, unwrap } from './_helpers';
import type { PracticeAttempt, StudentBadge, StudentProgress } from '../types';

// ── Mappers ──

function mapAttempt(row: any): PracticeAttempt {
  return {
    id: row.id,
    studentId: row.student_id,
    materialId: row.material_id ?? null,
    score: row.score,
    total: row.total,
    xpEarned: row.xp_earned,
    createdAt: row.created_at,
  };
}

function mapProgress(row: any): StudentProgress {
  return {
    studentId: row.student_id,
    xp: row.xp,
    streakDays: row.streak_days,
    bestStreak: row.best_streak,
    lastPracticeDate: row.last_practice_date ?? null,
    totalAttempts: row.total_attempts,
    perfectCount: row.perfect_count,
  };
}

function mapBadge(row: any): StudentBadge {
  return { code: row.badge_code, earnedAt: row.earned_at };
}

// ── API ──

/** Registra un intento; el XP real vuelve calculado por el trigger. */
export async function recordPracticeAttempt(input: {
  studentId: string;
  materialId: string;
  score: number;
  total: number;
}): Promise<PracticeAttempt> {
  const row = unwrap(
    await supabase
      .from('practice_attempts')
      .insert({
        student_id: input.studentId,
        material_id: input.materialId,
        score: input.score,
        total: input.total,
      })
      .select()
      .single()
  );
  return mapAttempt(row);
}

export async function getStudentProgress(studentId: string): Promise<StudentProgress | null> {
  const { data, error } = await supabase
    .from('student_progress')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProgress(data) : null;
}

export async function getStudentBadges(studentId: string): Promise<StudentBadge[]> {
  const data = unwrap(
    await supabase
      .from('student_badges')
      .select('*')
      .eq('student_id', studentId)
      .order('earned_at', { ascending: true })
  );
  return data.map(mapBadge);
}

export async function getPracticeAttempts(studentId: string): Promise<PracticeAttempt[]> {
  const data = unwrap(
    await supabase
      .from('practice_attempts')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
  );
  return data.map(mapAttempt);
}
