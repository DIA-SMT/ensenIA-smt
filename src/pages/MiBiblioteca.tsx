import { useState, useEffect } from 'react';
import { BookOpen, Download, FileText, Sparkles, X, Layers, Play, GraduationCap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { getSignedUrl, generatePracticeQuiz, generateStudyGuide } from '../services/documents.service';
import { getStudentByUserId } from '../services/activities.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PracticeQuizPlayer from '../components/PracticeQuizPlayer';
import StudyGuideModal from '../components/StudyGuideModal';
import type { LibraryMaterial, PracticeQuestion, Student } from '../types';
import './StudentPortal.css';
import '../components/Modals.css';

export default function MiBiblioteca() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [quizFor, setQuizFor] = useState<{ material: LibraryMaterial; questions: PracticeQuestion[] } | null>(null);
  const [guideFor, setGuideFor] = useState<{ title: string; guide: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getSharedMaterialsForStudent(),
      getStudentByUserId(user.id),
    ])
      .then(([mats, st]) => { setMaterials(mats); setStudent(st); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const handleDownload = async (mat: LibraryMaterial) => {
    if (!mat.storagePath) return;
    try {
      const url = await getSignedUrl(mat.storagePath);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

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

  return (
    <div className="sp-container animate-in">
      <h3 className="sp-section-title"><BookOpen size={17} /> Material de mis materias</h3>
      <p className="text-secondary text-sm" style={{ marginTop: -8 }}>
        Acá aparece el material que tus docentes comparten con el curso.
      </p>

      {loading && <p className="text-secondary">Cargando material...</p>}
      {genError && <div className="sp-notice">{genError}</div>}

      {!loading && materials.length === 0 && (
        <div className="card acts-empty">
          <BookOpen size={32} className="text-secondary" />
          <p className="text-secondary">Todavía no hay material compartido.</p>
        </div>
      )}

      <div className="sp-activity-list">
        {materials.map(mat => {
          const hasSource = Boolean(mat.extractedText || mat.aiSummary || (mat.studyCards?.length ?? 0) > 0);
          return (
            <div key={mat.id} className="card sp-activity-card">
              <div className="sp-activity-main">
                <h4 className="flex items-center gap-2"><FileText size={16} className="text-cyan" /> {mat.title}</h4>
                {mat.description && <p className="text-sm text-secondary">{mat.description}</p>}
                <div className="sp-activity-meta">
                  <span className="badge badge-cyan">{mat.subjectName}</span>
                  <span className="text-xs text-subtle">{mat.fileSize}</span>
                </div>
              </div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {student && hasSource && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openQuiz(mat)}
                    disabled={generating !== null}
                    title="Quiz de práctica con explicaciones"
                  >
                    <Play size={14} /> {generating === mat.id ? 'Preparando…' : 'Practicar'}
                  </button>
                )}
                {student && hasSource && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openGuide(mat)}
                    disabled={generating !== null}
                    title="Guía para estudiar este material"
                  >
                    <GraduationCap size={14} /> Guía
                  </button>
                )}
                {mat.studyCards && mat.studyCards.length > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setCardsFor(mat)} title="Repasá con tarjetas visuales">
                    <Layers size={14} /> Placas
                  </button>
                )}
                {mat.aiSummary && (
                  <button className="btn btn-outline btn-sm" onClick={() => setSummaryFor(mat)}>
                    <Sparkles size={14} /> Resumen
                  </button>
                )}
                {mat.storagePath && (
                  <button className="btn btn-outline btn-sm" onClick={() => handleDownload(mat)}>
                    <Download size={14} /> Descargar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {quizFor && student && (
        <PracticeQuizPlayer
          questions={quizFor.questions}
          materialTitle={quizFor.material.title}
          subjectName={quizFor.material.subjectName}
          studentId={student.id}
          materialId={quizFor.material.id}
          onClose={() => setQuizFor(null)}
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

      {summaryFor && (
        <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSummaryFor(null); }}>
          <div className="em-modal em-modal-lg">
            <div className="em-modal-header">
              <h3><Sparkles size={17} className="text-ia-accent" /> Resumen — {summaryFor.title}</h3>
              <button className="btn-icon" onClick={() => setSummaryFor(null)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              <div className="summary-markdown">
                <MarkdownRenderer content={summaryFor.aiSummary ?? ''} />
              </div>
            </div>
            <div className="em-modal-footer">
              <button className="btn btn-primary btn-sm" onClick={() => setSummaryFor(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
