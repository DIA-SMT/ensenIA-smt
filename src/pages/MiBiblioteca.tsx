import { useState, useEffect } from 'react';
import { BookOpen, Download, FileText, Sparkles, X, Layers } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { getSignedUrl } from '../services/documents.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import type { LibraryMaterial } from '../types';
import './StudentPortal.css';
import '../components/Modals.css';

export default function MiBiblioteca() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);

  useEffect(() => {
    if (!user) return;
    getSharedMaterialsForStudent()
      .then(setMaterials)
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
              {mat.storagePath && (
                <button className="btn btn-outline btn-sm" onClick={() => handleDownload(mat)}>
                  <Download size={14} /> Descargar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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
