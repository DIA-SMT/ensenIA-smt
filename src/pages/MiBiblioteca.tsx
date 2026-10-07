import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, FileText, Sparkles, X, Layers, Play, GraduationCap, ThumbsUp, ThumbsDown, Wand2, Headphones, Youtube } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { generatePracticeQuiz, generateStudyGuide } from '../services/documents.service';
import { getStudentByUserId } from '../services/activities.service';
import { getMyMaterialReactions, setMaterialReaction } from '../services/gamification.service';
import { getClasesEnviadas, type ClaseEnviada } from '../services/clases.service';
import ClasesEnviadas from '../components/ClasesEnviadas';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PracticeQuizPlayer from '../components/PracticeQuizPlayer';
import StudyGuideModal from '../components/StudyGuideModal';
import MaterialViewer from '../components/MaterialViewer';
import PodcastPlayer from '../components/PodcastPlayer';
import VideoModal from '../components/VideoModal';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar } from '../components/ui/avisar';
import type { LibraryMaterial, MaterialReactionType, PracticeQuestion, Student } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import './Biblioteca.css';
import './StudentPortal.css';
import '../components/shell/shell.css';
import '../components/Modals.css';

export default function MiBiblioteca() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [reactions, setReactions] = useState<Record<string, MaterialReactionType>>({});
  const [podcastFor, setPodcastFor] = useState<LibraryMaterial | null>(null);
  const [videoFor, setVideoFor] = useState<LibraryMaterial | null>(null);
  const [quizFor, setQuizFor] = useState<{ material: LibraryMaterial; questions: PracticeQuestion[] } | null>(null);
  const [guideFor, setGuideFor] = useState<{ title: string; guide: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<LibraryMaterial | null>(null);
  const [clases, setClases] = useState<ClaseEnviada[]>([]);

  useEffect(() => {
    if (!user) return;
    // Las clases agrupadas son un extra: si fallan, el material se ve igual
    getClasesEnviadas(10).then(setClases).catch(console.error);
    Promise.all([
      getSharedMaterialsForStudent(),
      getStudentByUserId(user.id),
    ])
      .then(([mats, st]) => {
        setMaterials(mats);
        setStudent(st);
        if (st) getMyMaterialReactions(st.id).then(setReactions).catch(console.error);
      })
      .catch(err => {
        console.error(err);
        avisar.error('No pudimos traer el material.', 'Revisá la conexión y volvé a entrar.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const handleReaction = async (mat: LibraryMaterial, reaction: MaterialReactionType) => {
    if (!student) return;
    const current = reactions[mat.id];
    const next = current === reaction ? null : reaction;
    // Optimista: se ve al toque
    setReactions(prev => {
      const copy = { ...prev };
      if (next === null) delete copy[mat.id];
      else copy[mat.id] = next;
      return copy;
    });
    try {
      await setMaterialReaction(mat.id, student.id, next);
    } catch (err) {
      console.error('Error guardando reacción:', err);
      avisar.error('No se pudo guardar tu opinión. Probá de nuevo.');
      setReactions(prev => {
        const copy = { ...prev };
        if (current) copy[mat.id] = current;
        else delete copy[mat.id];
        return copy;
      });
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
      {/* Lo último que mandaron los docentes, cada clase con sus partes juntas */}
      {!loading && <ClasesEnviadas clases={clases} materiales={materials} userId={user.id} alAbrir={setViendo} />}

      <h3 className="sp-section-title" aria-level={2}><BookOpen size={17} aria-hidden="true" /> Material de mis materias</h3>
      <p className="text-secondary text-sm" style={{ marginTop: -8 }}>
        Acá aparece el material que tus docentes comparten con el curso.
      </p>

      {loading && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando material…" />}
      {genError && <div className="sp-notice">{genError}</div>}

      {!loading && materials.length === 0 && (
        <EstadoVacio
          icono={BookOpen}
          titulo="Todavía no hay material compartido"
          texto="Cuando tus docentes compartan apuntes, videos o PDFs con el curso, aparecen acá."
        />
      )}

      <div className="sp-activity-list">
        {materials.map(mat => {
          const hasSource = Boolean(mat.extractedText || mat.aiSummary || (mat.studyCards?.length ?? 0) > 0);
          return (
            <div key={mat.id} className="card sp-activity-card">
              <div className="sp-activity-main">
                <h4 className="flex items-center gap-2" aria-level={3}><FileText size={16} className="text-cyan" aria-hidden="true" /> {mat.title}</h4>
                {mat.description && <p className="text-sm text-secondary">{mat.description}</p>}
                <div className="sp-activity-meta">
                  <span className="badge badge-cyan">{mat.subjectName}</span>
                  <span className="text-xs text-subtle">{mat.fileSize}</span>
                </div>
              </div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {mat.videoUrl && (
                  <button className="btn btn-primary btn-sm" onClick={() => setVideoFor(mat)} title="Miralo acá, junto a la consigna">
                    <Youtube size={14} /> Ver video
                  </button>
                )}
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
                {mat.podcastStatus === 'ready' && mat.podcastPath && (
                  <button className="btn btn-outline btn-sm" onClick={() => setPodcastFor(mat)} title="Escuchá el resumen en audio">
                    <Headphones size={14} /> Podcast
                  </button>
                )}
                {mat.extractedText && (
                  <Link to={`/mi-guia?doc=${mat.id}`} className="btn btn-secondary btn-sm" title="La IA te lo explica con palabras simples">
                    <Wand2 size={14} /> Explicámelo fácil
                  </Link>
                )}
                {/* Las escuelas pidieron que el estudiante no tenga que
                    descargar: el material se lee acá adentro. */}
                <button className="btn btn-outline btn-sm" onClick={() => setViendo(mat)}>
                  <Eye size={14} /> Ver
                </button>
                {student && (
                  <div className="sp-reaction-group" title="¿Te sirvió este material? Tu docente lo ve.">
                    <button
                      className={`sp-reaction-btn ${reactions[mat.id] === 'like' ? 'active-like' : ''}`}
                      onClick={() => handleReaction(mat, 'like')}
                      aria-label="Me sirvió"
                    >
                      <ThumbsUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      className={`sp-reaction-btn ${reactions[mat.id] === 'dislike' ? 'active-dislike' : ''}`}
                      onClick={() => handleReaction(mat, 'dislike')}
                      aria-label="No me sirvió"
                    >
                      <ThumbsDown size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {videoFor?.videoUrl && (
        <VideoModal url={videoFor.videoUrl} title={videoFor.title} onClose={() => setVideoFor(null)} />
      )}

      {podcastFor?.podcastPath && (
        <PodcastPlayer path={podcastFor.podcastPath} title={podcastFor.title} onClose={() => setPodcastFor(null)} />
      )}

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

      {viendo && <MaterialViewer material={viendo} onClose={() => setViendo(null)} />}

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
        <Dialogo abierto alCerrar={() => setSummaryFor(null)} etiquetadoPor="mb-resumen-titulo" className="dialogo-em">
          <div className="em-modal em-modal-lg">
            <div className="em-modal-header">
              <h3 id="mb-resumen-titulo"><Sparkles size={17} className="text-ia-accent" aria-hidden="true" /> Resumen — {summaryFor.title}</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setSummaryFor(null)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              <div className="summary-markdown">
                <MarkdownRenderer content={summaryFor.aiSummary ?? ''} />
              </div>
            </div>
            <div className="em-modal-footer">
              <button className="btn btn-primary btn-sm" onClick={() => setSummaryFor(null)} data-inicial>Cerrar</button>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
