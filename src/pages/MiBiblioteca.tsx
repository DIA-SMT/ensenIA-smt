import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Download, FileText, Sparkles, X, Layers, ThumbsUp, ThumbsDown, Wand2, Headphones } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { getStudentByUserId } from '../services/activities.service';
import { getMyMaterialReactions, setMaterialReaction } from '../services/gamification.service';
import { getSignedUrl } from '../services/documents.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PodcastPlayer from '../components/PodcastPlayer';
import type { LibraryMaterial, MaterialReactionType, Student } from '../types';
import './StudentPortal.css';
import '../components/Modals.css';

export default function MiBiblioteca() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [reactions, setReactions] = useState<Record<string, MaterialReactionType>>({});
  const [podcastFor, setPodcastFor] = useState<LibraryMaterial | null>(null);

  useEffect(() => {
    if (!user) return;
    getSharedMaterialsForStudent()
      .then(setMaterials)
      .catch(console.error)
      .finally(() => setLoading(false));
    getStudentByUserId(user.id).then(st => {
      setStudent(st);
      if (st) getMyMaterialReactions(st.id).then(setReactions).catch(console.error);
    }).catch(console.error);
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
      setReactions(prev => {
        const copy = { ...prev };
        if (current) copy[mat.id] = current;
        else delete copy[mat.id];
        return copy;
      });
    }
  };

  const handleDownload = async (mat: LibraryMaterial) => {
    if (!mat.storagePath) return;
    try {
      const url = await getSignedUrl(mat.storagePath);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="sp-container animate-in">
      <h3 className="sp-section-title"><BookOpen size={17} /> Material de mis materias</h3>
      <p className="text-secondary text-sm" style={{ marginTop: -8 }}>
        Acá aparece el material que tus docentes comparten con el curso.
      </p>

      {loading && <p className="text-secondary">Cargando material...</p>}

      {!loading && materials.length === 0 && (
        <div className="card acts-empty">
          <BookOpen size={32} className="text-secondary" />
          <p className="text-secondary">Todavía no hay material compartido.</p>
        </div>
      )}

      <div className="sp-activity-list">
        {materials.map(mat => (
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
              {mat.studyCards && mat.studyCards.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={() => setCardsFor(mat)} title="Repasá con tarjetas visuales">
                  <Layers size={14} /> Placas
                </button>
              )}
              {mat.aiSummary && (
                <button className="btn btn-secondary btn-sm" onClick={() => setSummaryFor(mat)}>
                  <Sparkles size={14} /> Resumen
                </button>
              )}
              {mat.podcastStatus === 'ready' && mat.podcastPath && (
                <button className="btn btn-primary btn-sm" onClick={() => setPodcastFor(mat)} title="Escuchá el resumen en audio">
                  <Headphones size={14} /> Podcast
                </button>
              )}
              {mat.extractedText && (
                <Link to={`/mi-guia?doc=${mat.id}`} className="btn btn-secondary btn-sm" title="La IA te lo explica con palabras simples">
                  <Wand2 size={14} /> Explicámelo fácil
                </Link>
              )}
              {mat.storagePath && (
                <button className="btn btn-outline btn-sm" onClick={() => handleDownload(mat)}>
                  <Download size={14} /> Descargar
                </button>
              )}
              {student && (
                <div className="sp-reaction-group" title="¿Te sirvió este material? Tu docente lo ve.">
                  <button
                    className={`sp-reaction-btn ${reactions[mat.id] === 'like' ? 'active-like' : ''}`}
                    onClick={() => handleReaction(mat, 'like')}
                    aria-label="Me sirvió"
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    className={`sp-reaction-btn ${reactions[mat.id] === 'dislike' ? 'active-dislike' : ''}`}
                    onClick={() => handleReaction(mat, 'dislike')}
                    aria-label="No me sirvió"
                  >
                    <ThumbsDown size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {podcastFor?.podcastPath && (
        <PodcastPlayer path={podcastFor.podcastPath} title={podcastFor.title} onClose={() => setPodcastFor(null)} />
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
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setSummaryFor(null)}><X size={18} /></button>
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
