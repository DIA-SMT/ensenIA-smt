/**
 * Estudiar — hub del Modo Estudio del estudiante.
 *
 * - Hero gamificado: XP, racha de días y logros (personal, sin ranking).
 * - "Mi semana": próximas entregas derivadas de sus actividades + sugerencia
 *   de práctica (material nunca practicado o el más olvidado).
 * - Materiales para practicar: quiz pedagógico IA (cacheado en el servidor,
 *   una generación por material), guía de estudio y placas.
 * - Notas personales: checklist simple para organizarse.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Rocket, Flame, Sparkles, Trophy, CalendarDays, Clock, BookOpen, Layers,
  GraduationCap, Play, StickyNote, Plus, Pin, Trash2, ChevronRight, Lightbulb,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentByUserId, getActivitiesForStudent, getMySubmissions } from '../services/activities.service';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { getStudentProgress, getStudentBadges, getPracticeAttempts } from '../services/practice.service';
import {
  getStudentNotes, createStudentNote, toggleNoteDone, toggleNotePin, deleteStudentNote,
} from '../services/student-notes.service';
import { generatePracticeQuiz, generateStudyGuide } from '../services/documents.service';
import PracticeQuizPlayer from '../components/PracticeQuizPlayer';
import StudyGuideModal from '../components/StudyGuideModal';
import StudyCardsViewer from '../components/StudyCardsViewer';
import {
  BADGE_META,
  type Activity, type ActivitySubmission, type BadgeCode, type LibraryMaterial,
  type PracticeAttempt, type PracticeQuestion, type Student, type StudentBadge,
  type StudentNote, type StudentProgress,
} from '../types';
import './StudentPortal.css';
import './Estudiar.css';

/** Fecha YYYY-MM-DD de hoy con corte de día en Argentina (igual que los triggers). */
function todayAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
function yesterdayAR(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export default function Estudiar() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [progress, setProgress] = useState<StudentProgress | null>(null);
  const [badges, setBadges] = useState<StudentBadge[]>([]);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [loading, setLoading] = useState(true);

  // interacción
  const [generating, setGenerating] = useState<string | null>(null); // materialId en generación
  const [quizFor, setQuizFor] = useState<{ material: LibraryMaterial; questions: PracticeQuestion[] } | null>(null);
  const [guideFor, setGuideFor] = useState<{ title: string; guide: string } | null>(null);
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');

  const refreshProgress = useCallback(async (studentId: string) => {
    try {
      const [prog, bdgs, atts] = await Promise.all([
        getStudentProgress(studentId),
        getStudentBadges(studentId),
        getPracticeAttempts(studentId),
      ]);
      setProgress(prog);
      setBadges(bdgs);
      setAttempts(atts);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const st = await getStudentByUserId(user.id);
        setStudent(st);
        if (st) {
          const [mats, acts, subs, nts] = await Promise.all([
            getSharedMaterialsForStudent(),
            getActivitiesForStudent(),
            getMySubmissions(st.id),
            getStudentNotes(st.id).catch(() => [] as StudentNote[]),
          ]);
          setMaterials(mats);
          setActivities(acts);
          setSubmissions(subs);
          setNotes(nts);
          await refreshProgress(st.id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, refreshProgress]);

  if (!user) return null;
  if (loading) return <p className="text-secondary p-6">Preparando tu espacio de estudio...</p>;

  if (!student) {
    return (
      <div className="sp-container">
        <div className="card acts-empty">
          <GraduationCap size={36} className="text-cyan" />
          <h3>Tu cuenta no está vinculada a un curso</h3>
          <p className="text-secondary text-sm">Pedile a tu docente que te agregue a la lista del curso.</p>
        </div>
      </div>
    );
  }

  // ── Derivados ──

  const streakActive = progress?.lastPracticeDate != null &&
    (progress.lastPracticeDate === todayAR() || progress.lastPracticeDate === yesterdayAR());
  const earnedCodes = badges.map(b => b.code);

  // Mi semana: entregas próximas (7 días) sin entregar
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = activities
    .filter(a => {
      const sub = submissions.find(s => s.activityId === a.id);
      const done = sub?.status === 'submitted' || sub?.status === 'graded';
      return !done && a.dueDate && new Date(a.dueDate) <= in7days;
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const dueChip = (dueDate: string) => {
    const days = Math.ceil((new Date(dueDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (days < 0) return <span className="badge badge-danger">¡Vencida!</span>;
    if (days === 0) return <span className="badge badge-danger">¡Vence hoy!</span>;
    if (days === 1) return <span className="badge badge-warning">¡Mañana!</span>;
    return <span className="badge badge-neutral">En {days} días</span>;
  };

  // Sugerencia: material practicable nunca practicado, o el practicado hace más tiempo
  const practicable = materials.filter(m => m.extractedText || m.aiSummary || (m.studyCards?.length ?? 0) > 0);
  const lastAttemptFor = (materialId: string) =>
    attempts.filter(a => a.materialId === materialId)
      .reduce<string | null>((max, a) => (max === null || a.createdAt > max ? a.createdAt : max), null);
  const suggestion = practicable.length > 0
    ? [...practicable].sort((a, b) => {
        const la = lastAttemptFor(a.id);
        const lb = lastAttemptFor(b.id);
        if (la === null && lb === null) return 0;
        if (la === null) return -1;
        if (lb === null) return 1;
        return la.localeCompare(lb);
      })[0]
    : null;

  // ── Acciones ──

  const openQuiz = async (mat: LibraryMaterial) => {
    setGenError(null);
    if (mat.practiceQuiz && mat.practiceQuiz.length > 0) {
      setQuizFor({ material: mat, questions: mat.practiceQuiz });
      return;
    }
    setGenerating(mat.id);
    try {
      const { questions } = await generatePracticeQuiz(mat.id);
      setMaterials(ms => ms.map(m => (m.id === mat.id ? { ...m, practiceQuiz: questions } : m)));
      setQuizFor({ material: mat, questions });
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'No se pudo preparar el quiz.');
    } finally {
      setGenerating(null);
    }
  };

  const openGuide = async (mat: LibraryMaterial) => {
    setGenError(null);
    if (mat.studyGuide) {
      setGuideFor({ title: mat.title, guide: mat.studyGuide });
      return;
    }
    setGenerating(mat.id);
    try {
      const { guide } = await generateStudyGuide(mat.id);
      setMaterials(ms => ms.map(m => (m.id === mat.id ? { ...m, studyGuide: guide } : m)));
      setGuideFor({ title: mat.title, guide });
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'No se pudo preparar la guía.');
    } finally {
      setGenerating(null);
    }
  };

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setNewNote('');
    try {
      const note = await createStudentNote(student.id, text);
      setNotes(ns => [note, ...ns]);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleDone = (note: StudentNote) => {
    setNotes(ns => ns.map(n => (n.id === note.id ? { ...n, isDone: !n.isDone } : n)));
    toggleNoteDone(note.id, !note.isDone).catch(console.error);
  };
  const togglePin = (note: StudentNote) => {
    setNotes(ns => ns.map(n => (n.id === note.id ? { ...n, isPinned: !n.isPinned } : n)));
    toggleNotePin(note.id, !note.isPinned).catch(console.error);
  };
  const removeNote = (note: StudentNote) => {
    setNotes(ns => ns.filter(n => n.id !== note.id));
    deleteStudentNote(note.id).catch(console.error);
  };

  const sortedNotes = [...notes].sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || Number(a.isDone) - Number(b.isDone));

  return (
    <div className="sp-container animate-in">
      {/* ── Hero gamificado ── */}
      <div className="sp-hero card">
        <div>
          <h2><Rocket size={20} className="text-ia-accent" /> Tu espacio de estudio</h2>
          <p className="text-secondary text-sm">
            {progress
              ? streakActive && progress.streakDays > 1
                ? `¡Llevás ${progress.streakDays} días seguidos estudiando! No cortes la racha 🔥`
                : 'Practicá un rato hoy y sumá a tu racha.'
              : 'Hacé tu primera práctica y empezá a sumar XP.'}
          </p>
          <div className="est-badge-row">
            {(Object.keys(BADGE_META) as BadgeCode[]).map(code => {
              const earned = earnedCodes.includes(code);
              return (
                <span
                  key={code}
                  className={`est-badge ${earned ? 'earned' : ''}`}
                  title={`${BADGE_META[code].label} — ${BADGE_META[code].description}${earned ? '' : ' (todavía no)'}`}
                >
                  {BADGE_META[code].emoji}
                </span>
              );
            })}
          </div>
        </div>
        <div className="sp-hero-stats">
          <div className="sp-hero-stat">
            <span className="sp-hero-num text-ia-accent"><Sparkles size={20} /> {progress?.xp ?? 0}</span>
            <span className="sp-hero-label">XP</span>
          </div>
          <div className="sp-hero-stat">
            <span className={`sp-hero-num ${streakActive ? 'est-streak-on' : 'est-streak-off'}`}>
              <Flame size={20} /> {progress?.streakDays ?? 0}
            </span>
            <span className="sp-hero-label">racha</span>
          </div>
          <div className="sp-hero-stat">
            <span className="sp-hero-num text-warning"><Trophy size={20} /> {badges.length}</span>
            <span className="sp-hero-label">logros</span>
          </div>
        </div>
      </div>

      {/* ── Mi semana ── */}
      <h3 className="sp-section-title"><CalendarDays size={17} /> Mi semana</h3>
      {upcoming.length === 0 && !suggestion && (
        <p className="text-secondary text-sm">No tenés entregas próximas. ¡Buen momento para repasar!</p>
      )}
      {upcoming.length > 0 && (
        <div className="sp-activity-list">
          {upcoming.map(a => (
            <Link key={a.id} to={`/mis-actividades/${a.id}`} className="card card-interactive sp-activity-card">
              <div className="sp-activity-main">
                <h4>{a.title}</h4>
                <div className="sp-activity-meta">
                  <span className="badge badge-cyan">{a.subjectName}</span>
                  {dueChip(a.dueDate!)}
                  <span className="text-xs text-subtle flex items-center gap-1">
                    <Clock size={12} /> {new Date(a.dueDate!).toLocaleDateString('es-AR')}
                  </span>
                </div>
              </div>
              <ChevronRight size={18} className="text-subtle" />
            </Link>
          ))}
        </div>
      )}
      {suggestion && (
        <div className="card est-suggestion">
          <Lightbulb size={18} className="text-warning" />
          <div className="est-suggestion-text">
            <strong>Para hoy:</strong>{' '}
            {lastAttemptFor(suggestion.id)
              ? <>hace rato que no repasás <em>{suggestion.title}</em>. ¡Dale una vuelta!</>
              : <>todavía no practicaste <em>{suggestion.title}</em>. ¡Arrancá por ahí!</>}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openQuiz(suggestion)}
            disabled={generating !== null}
          >
            <Play size={14} /> {generating === suggestion.id ? 'Preparando…' : 'Practicar'}
          </button>
        </div>
      )}

      {/* ── Materiales para practicar ── */}
      <h3 className="sp-section-title"><BookOpen size={17} /> Practicá con tu material</h3>
      {genError && <div className="sp-notice">{genError}</div>}
      {materials.length === 0 && (
        <div className="card acts-empty">
          <BookOpen size={32} className="text-secondary" />
          <p className="text-secondary">Todavía no hay material compartido para practicar.</p>
        </div>
      )}
      <div className="sp-activity-list">
        {materials.map(mat => {
          const hasSource = Boolean(mat.extractedText || mat.aiSummary || (mat.studyCards?.length ?? 0) > 0);
          const matAttempts = attempts.filter(a => a.materialId === mat.id);
          const best = matAttempts.reduce<number | null>((mx, a) =>
            (mx === null || a.score / a.total > mx ? a.score / a.total : mx), null);
          return (
            <div key={mat.id} className="card sp-activity-card">
              <div className="sp-activity-main">
                <h4>{mat.title}</h4>
                <div className="sp-activity-meta">
                  <span className="badge badge-cyan">{mat.subjectName}</span>
                  {matAttempts.length > 0 && (
                    <span className="badge badge-neutral">
                      {matAttempts.length} práctica{matAttempts.length !== 1 ? 's' : ''}
                      {best !== null ? ` · mejor ${Math.round(best * 100)}%` : ''}
                    </span>
                  )}
                  {!hasSource && (
                    <span className="text-xs text-subtle">Sin texto procesado: pedile a tu docente que lo procese.</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openQuiz(mat)}
                  disabled={!hasSource || generating !== null}
                  title="Quiz de práctica con explicaciones"
                >
                  <Play size={14} /> {generating === mat.id ? 'Preparando…' : 'Practicar'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => openGuide(mat)}
                  disabled={!hasSource || generating !== null}
                  title="Guía para estudiar este material"
                >
                  <GraduationCap size={14} /> Guía
                </button>
                {mat.studyCards && mat.studyCards.length > 0 && (
                  <button className="btn btn-outline btn-sm" onClick={() => setCardsFor(mat)}>
                    <Layers size={14} /> Placas
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mis notas ── */}
      <h3 className="sp-section-title"><StickyNote size={17} /> Mis notas</h3>
      <div className="card est-notes">
        <div className="est-note-input">
          <input
            className="form-input"
            type="text"
            placeholder="Anotá algo para no olvidarte (ej: repasar fotosíntesis)"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
            maxLength={300}
          />
          <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!newNote.trim()}>
            <Plus size={14} />
          </button>
        </div>
        {sortedNotes.length === 0 && (
          <p className="text-secondary text-sm">Sin notas por ahora. Usalas como checklist de estudio.</p>
        )}
        {sortedNotes.map(note => (
          <div key={note.id} className={`est-note ${note.isDone ? 'done' : ''}`}>
            <label className="est-note-check">
              <input type="checkbox" checked={note.isDone} onChange={() => toggleDone(note)} />
              <span>{note.text}</span>
            </label>
            <div className="est-note-actions">
              <button
                className={`btn-icon ${note.isPinned ? 'text-warning' : ''}`}
                onClick={() => togglePin(note)}
                title={note.isPinned ? 'Desfijar' : 'Fijar arriba'}
              >
                <Pin size={14} />
              </button>
              <button className="btn-icon" onClick={() => removeNote(note)} title="Borrar">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Overlays ── */}
      {quizFor && (
        <PracticeQuizPlayer
          questions={quizFor.questions}
          materialTitle={quizFor.material.title}
          subjectName={quizFor.material.subjectName}
          studentId={student.id}
          materialId={quizFor.material.id}
          onClose={() => setQuizFor(null)}
          onFinished={() => refreshProgress(student.id)}
        />
      )}
      {guideFor && (
        <StudyGuideModal title={guideFor.title} guide={guideFor.guide} onClose={() => setGuideFor(null)} />
      )}
      {cardsFor?.studyCards && (
        <StudyCardsViewer
          cards={cardsFor.studyCards}
          title={cardsFor.title}
          subjectName={cardsFor.subjectName}
          onClose={() => setCardsFor(null)}
        />
      )}
    </div>
  );
}
