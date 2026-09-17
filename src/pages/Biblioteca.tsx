import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Upload, FileText, Link2, Image, BookOpen, X, Sparkles,
  Download, Trash2, Share2, FlaskConical, AlertCircle, FileUp, Loader2, Layers, PencilLine, Youtube, Captions,
  Headphones,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMaterialsByTeacher, searchMaterials, createMaterial, deleteMaterial, renameMaterial } from '../services/library.service';
import { getSubjects } from '../services/subjects.service';
import {
  uploadFile, getSignedUrl, removeFile, fileToBase64, extractDocxText,
  extractPdfText, summarizeDocument, updateMaterial, formatFileSize,
  generateStudyCards, generatePodcast,
} from '../services/documents.service';
import { textToPdf } from '../lib/pdf';
import { parseYouTubeId, youTubeThumbnail } from '../lib/youtube';
import { transcribeYouTube } from '../services/documents.service';
import VideoModal from '../components/VideoModal';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PodcastPlayer from '../components/PodcastPlayer';
import type { LibraryMaterial, Subject } from '../types';
import './Biblioteca.css';
import '../components/Modals.css';

const fileIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  link: Link2,
  image: Image,
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function Biblioteca() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [allMaterials, setAllMaterials] = useState<LibraryMaterial[]>([]);
  const [searchResults, setSearchResults] = useState<LibraryMaterial[] | null>(null);
  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uplFile, setUplFile] = useState<File | null>(null);
  const [uplTitle, setUplTitle] = useState('');
  const [uplSubjectId, setUplSubjectId] = useState('');
  const [uplTags, setUplTags] = useState('');
  const [uplShare, setUplShare] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uplError, setUplError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Procesamiento de texto en curso (por material)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Resumen IA
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Placas de estudio
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [cardsGeneratingId, setCardsGeneratingId] = useState<string | null>(null);

  // Podcast
  const [podcastFor, setPodcastFor] = useState<LibraryMaterial | null>(null);
  const [podcastGeneratingId, setPodcastGeneratingId] = useState<string | null>(null);

  const refresh = () => {
    if (!user) return;
    getMaterialsByTeacher(user.id).then(setAllMaterials).catch(console.error);
  };

  useEffect(() => {
    if (!user) return;
    refresh();
    getSubjects().then(subjects => {
      setSubjectsList(subjects);
    }).catch(console.error);
  }, [user]);

  useEffect(() => {
    if (!user || !query.trim()) {
      setSearchResults(null);
      return;
    }
    const timeout = setTimeout(() => {
      searchMaterials(query, user.id).then(setSearchResults).catch(console.error);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, user]);

  if (!user) return null;

  let filtered = searchResults ?? allMaterials;
  if (activeSubject) filtered = filtered.filter(m => m.subjectId === activeSubject);

  const mySubjectIds = new Set([
    ...allMaterials.map(m => m.subjectId),
    ...(user.subjects?.map(s => s.subjectId) ?? []),
  ]);
  const mySubjects = subjectsList.filter(s => mySubjectIds.has(s.id));

  // ── Upload flow ──

  const openUpload = () => {
    setUplFile(null);
    setUplTitle('');
    setUplSubjectId(user.subjects?.[0]?.subjectId ?? mySubjects[0]?.id ?? '');
    setUplTags('');
    setUplShare(false);
    setUplError('');
    setShowUpload(true);
  };

  const handlePickFile = (f: File | null) => {
    setUplError('');
    if (!f) return;
    const ok = f.type === 'application/pdf' || f.type === DOCX_MIME || f.type.startsWith('image/');
    if (!ok) { setUplError('Formato no soportado (PDF, Word .docx o imagen).'); return; }
    if (f.size > 11 * 1024 * 1024) { setUplError('Máximo 11 MB.'); return; }
    setUplFile(f);
    if (!uplTitle.trim()) setUplTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const handleUpload = async () => {
    if (!uplFile || !uplTitle.trim() || !uplSubjectId) {
      setUplError('Completá título, materia y archivo.');
      return;
    }
    setUploading(true);
    setUplError('');
    try {
      const subject = subjectsList.find(s => s.id === uplSubjectId);
      const { storagePath, fileSizeBytes } = await uploadFile(user.id, uplFile);

      // DOCX: el texto se extrae al instante en el navegador (gratis)
      let extractedText: string | undefined;
      if (uplFile.type === DOCX_MIME) {
        try { extractedText = await extractDocxText(uplFile); } catch { /* opcional */ }
      }

      const material = await createMaterial({
        title: uplTitle.trim(),
        description: '',
        fileType: uplFile.type === 'application/pdf' ? 'pdf' : uplFile.type === DOCX_MIME ? 'doc' : 'image',
        fileName: uplFile.name,
        fileSize: formatFileSize(fileSizeBytes),
        subjectId: uplSubjectId,
        subjectName: subject?.name ?? '',
        teacherId: user.id,
        schoolId: user.schoolId,
        tags: uplTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      await updateMaterial(material.id, {
        storagePath,
        fileSizeBytes,
        ...(extractedText ? { extractedText } : {}),
        isSharedWithStudents: uplShare,
      });

      setShowUpload(false);
      refresh();

      // PDF: extracción con IA en segundo plano (visión, sirve para escaneos)
      if (uplFile.type === 'application/pdf') {
        setProcessingIds(prev => new Set(prev).add(material.id));
        try {
          const base64 = await fileToBase64(uplFile);
          const text = await extractPdfText(base64, uplTitle.trim());
          await updateMaterial(material.id, { extractedText: text });
        } catch (err) {
          console.error('Extracción de texto falló:', err);
        } finally {
          setProcessingIds(prev => { const n = new Set(prev); n.delete(material.id); return n; });
          refresh();
        }
      }
    } catch (err) {
      setUplError(err instanceof Error ? err.message : 'Error subiendo el material.');
    } finally {
      setUploading(false);
    }
  };

  // ── Card actions ──

  const handleDownload = async (mat: LibraryMaterial) => {
    if (!mat.storagePath) return;
    try {
      const url = await getSignedUrl(mat.storagePath);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (mat: LibraryMaterial) => {
    if (!window.confirm(`¿Eliminar "${mat.title}" de la biblioteca?`)) return;
    try {
      if (mat.storagePath) await removeFile(mat.storagePath);
      // El podcast vive aparte del archivo original: si no se borra acá,
      // el MP3 queda huérfano en Storage para siempre.
      if (mat.podcastPath) await removeFile(mat.podcastPath).catch(console.error);
      await deleteMaterial(mat.id);
      refresh();
    } catch (err) {
      console.error(err);
    }
  };

  // ── Videos de YouTube: el disparador con el que arranca la clase ──
  const [showVideo, setShowVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [videoSubjectId, setVideoSubjectId] = useState('');
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [playing, setPlaying] = useState<LibraryMaterial | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

  const handleAddVideo = async () => {
    if (!user || videoSaving) return;
    const videoId = parseYouTubeId(videoUrl);
    if (!videoId) {
      setVideoError('Esa dirección no parece de YouTube. Pegá el link del video (youtube.com o youtu.be).');
      return;
    }
    const subject = subjectsList.find(x => x.id === videoSubjectId);
    if (!subject || !videoTitle.trim()) {
      setVideoError('Falta el título o la materia.');
      return;
    }
    setVideoSaving(true);
    setVideoError('');
    try {
      const mat = await createMaterial({
        title: videoTitle.trim(),
        description: videoDesc.trim(),
        fileType: 'video',
        fileName: '',
        fileSize: '—',
        subjectId: subject.id,
        subjectName: subject.name,
        teacherId: user.id,
        schoolId: user.schoolId,
        tags: ['video'],
        videoUrl: videoUrl.trim(),
      });
      setAllMaterials(prev => [mat, ...prev]);
      setShowVideo(false);
      setVideoUrl(''); setVideoTitle(''); setVideoDesc('');
      // La transcripción arranca sola: con ella el video alimenta a la IA
      handleTranscribe(mat);
    } catch (err) {
      console.error(err);
      setVideoError('No se pudo guardar el video. Probá de nuevo.');
    } finally {
      setVideoSaving(false);
    }
  };

  /** Transcribe los subtítulos del video: lo vuelve material real para la IA. */
  const handleTranscribe = async (mat: LibraryMaterial) => {
    if (!mat.videoUrl || transcribingId) return;
    setTranscribingId(mat.id);
    try {
      const text = await transcribeYouTube(mat.videoUrl);
      await updateMaterial(mat.id, { extractedText: text });
      setAllMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, extractedText: text } : m));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo transcribir el video.');
    } finally {
      setTranscribingId(null);
    }
  };

  // ── Renombrar: lo que creaste es tuyo y lo podés corregir ──
  const [editFor, setEditFor] = useState<LibraryMaterial | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (mat: LibraryMaterial) => {
    setEditFor(mat);
    setEditTitle(mat.title);
    setEditDesc(mat.description ?? '');
  };

  const handleRename = async () => {
    if (!editFor || !editTitle.trim() || editSaving) return;
    setEditSaving(true);
    try {
      await renameMaterial(editFor.id, editTitle.trim(), editDesc.trim());
      setAllMaterials(prev => prev.map(m => m.id === editFor.id
        ? { ...m, title: editTitle.trim(), description: editDesc.trim() }
        : m));
      setEditFor(null);
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el cambio. Probá de nuevo.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleShare = async (mat: LibraryMaterial) => {
    try {
      await updateMaterial(mat.id, { isSharedWithStudents: !mat.isSharedWithStudents });
      refresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStudyCards = async (mat: LibraryMaterial) => {
    if (mat.studyCards?.length) {
      setCardsFor(mat);
      return;
    }
    if (!mat.extractedText) return;
    setCardsGeneratingId(mat.id);
    try {
      const cards = await generateStudyCards(mat.extractedText, mat.title);
      if (!cards.length) throw new Error('La IA no generó placas para este material.');
      await updateMaterial(mat.id, { studyCards: cards });
      setCardsFor({ ...mat, studyCards: cards });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error generando las placas.');
    } finally {
      setCardsGeneratingId(null);
    }
  };

  const handlePodcast = async (mat: LibraryMaterial) => {
    if (mat.podcastStatus === 'ready' && mat.podcastPath) {
      setPodcastFor(mat);
      return;
    }
    if (!mat.extractedText) return;
    setPodcastGeneratingId(mat.id);
    try {
      await generatePodcast(mat.id);
      const updated = { ...mat, podcastPath: `podcasts/${mat.id}.mp3`, podcastStatus: 'ready' as const };
      setPodcastFor(updated);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error generando el podcast.');
      refresh();
    } finally {
      setPodcastGeneratingId(null);
    }
  };

  const handleSummary = async (mat: LibraryMaterial) => {
    setSummaryFor(mat);
    setSummaryError('');
    if (mat.aiSummary) return; // ya generado
    setSummaryLoading(true);
    try {
      let summary: string;
      if (mat.extractedText) {
        summary = await summarizeDocument({ text: mat.extractedText, title: mat.title });
      } else if (mat.storagePath && mat.fileType === 'pdf') {
        const url = await getSignedUrl(mat.storagePath);
        const blob = await (await fetch(url)).blob();
        const base64 = await fileToBase64(blob);
        summary = await summarizeDocument({ pdfBase64: base64, title: mat.title });
      } else {
        throw new Error('Este material no tiene texto para resumir.');
      }
      await updateMaterial(mat.id, { aiSummary: summary });
      setSummaryFor({ ...mat, aiSummary: summary });
      refresh();
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Error generando el resumen.');
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="biblioteca-container">
      {/* Left: Filters */}
      <aside className="card biblioteca-sidebar">
        <div className="biblioteca-sidebar-header">
          <BookOpen size={18} />
          <h3>Biblioteca Docente</h3>
        </div>

        <div className="biblioteca-filters">
          <p className="filter-label">Materias</p>
          <button
            className={`filter-chip ${!activeSubject ? 'active' : ''}`}
            onClick={() => setActiveSubject(null)}
          >
            Todas
          </button>
          {mySubjects.map(s => (
            <button
              key={s.id}
              className={`filter-chip ${activeSubject === s.id ? 'active' : ''}`}
              onClick={() => setActiveSubject(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="biblioteca-upload">
          <button className="btn btn-primary w-full" onClick={openUpload}>
            <Upload size={16} />
            Subir Material
          </button>
          <button
            className="btn btn-secondary w-full mt-2"
            onClick={() => { setShowVideo(true); setVideoError(''); setVideoSubjectId(mySubjects[0]?.id ?? ''); }}
          >
            <Youtube size={16} />
            Agregar video
          </button>
          <p className="text-xs text-subtle mt-2" style={{ textAlign: 'center' }}>
            PDF, Word, imagen o video de YouTube · la IA lee el texto y los subtítulos
          </p>
        </div>
      </aside>

      {/* Main: Grid */}
      <main className="biblioteca-main">
        <div className="biblioteca-main-header">
          <div className="search-bar biblioteca-search">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Buscar por título, tag o contenido..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="biblioteca-count">
          <span className="text-secondary text-sm">{filtered.length} material{filtered.length !== 1 ? 'es' : ''}</span>
        </div>

        <div className="biblioteca-grid">
          {filtered.map(mat => {
            const Icon = fileIcons[mat.fileType] || FileText;
            const processing = processingIds.has(mat.id);
            return (
              <div key={mat.id} className="card biblioteca-card">
                {mat.videoUrl && parseYouTubeId(mat.videoUrl) ? (
                  <button
                    className="mat-video-thumb"
                    title="Ver el video"
                    onClick={() => setPlaying(mat)}
                  >
                    <img src={youTubeThumbnail(parseYouTubeId(mat.videoUrl)!)} alt="" loading="lazy" />
                    <span className="mat-video-play">▶</span>
                  </button>
                ) : (
                  <div className="mat-icon-wrap">
                    <Icon size={24} />
                  </div>
                )}
                <div className="mat-info">
                  <h4 className="mat-title">{mat.title}</h4>
                  {mat.description && <p className="mat-desc">{mat.description}</p>}
                  <div className="mat-meta">
                    <span className="badge badge-cyan">{mat.subjectName}</span>
                    {mat.unitName && <span className="badge badge-neutral">{mat.unitName}</span>}
                    <span className="mat-size">{mat.fileSize}</span>
                    {processing && (
                      <span className="badge badge-ia"><Loader2 size={11} className="spin" /> Leyendo texto...</span>
                    )}
                    {!processing && mat.extractedText && (
                      <span className="badge badge-success" title="La IA puede usar este documento">Texto listo</span>
                    )}
                    {mat.isSharedWithStudents && (
                      <span className="badge badge-warning" title="Visible para estudiantes de la materia">Compartido</span>
                    )}
                  </div>
                  <div className="mat-tags">
                    {mat.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="mat-tag">{tag}</span>
                    ))}
                  </div>
                  <div className="mat-actions">
                    {mat.videoUrl && (
                      <button className="mat-action-btn" title="Ver el video acá" onClick={() => setPlaying(mat)}>
                        <Youtube size={14} /> Ver video
                      </button>
                    )}
                    {mat.videoUrl && !mat.extractedText && (
                      <button
                        className="mat-action-btn"
                        title="Lee los subtítulos del video: la IA puede resumirlo, hacer placas y responder sobre él"
                        onClick={() => handleTranscribe(mat)}
                        disabled={transcribingId === mat.id}
                      >
                        {transcribingId === mat.id
                          ? <><Loader2 size={14} className="spin" /> Transcribiendo...</>
                          : <><Captions size={14} /> Transcribir</>}
                      </button>
                    )}
                    {mat.storagePath && (
                      <button className="mat-action-btn" title="Ver / Descargar" onClick={() => handleDownload(mat)}>
                        <Download size={14} /> Ver
                      </button>
                    )}
                    <button
                      className="mat-action-btn"
                      title="Resumen pedagógico con IA"
                      onClick={() => handleSummary(mat)}
                      disabled={processing}
                    >
                      <Sparkles size={14} /> Resumen IA
                    </button>
                    {mat.extractedText && (
                      <button
                        className="mat-action-btn"
                        title="Tarjetas visuales para que los chicos repasen en el celu"
                        onClick={() => handleStudyCards(mat)}
                        disabled={cardsGeneratingId === mat.id}
                      >
                        {cardsGeneratingId === mat.id
                          ? <><Loader2 size={14} className="spin" /> Generando...</>
                          : <><Layers size={14} /> {mat.studyCards?.length ? 'Placas' : 'Crear placas'}</>}
                      </button>
                    )}
                    {mat.extractedText && (
                      <button
                        className="mat-action-btn"
                        title="Resumen en audio de 2-3 min para que repasen con auriculares"
                        onClick={() => handlePodcast(mat)}
                        disabled={podcastGeneratingId === mat.id || mat.podcastStatus === 'generating'}
                      >
                        {podcastGeneratingId === mat.id || mat.podcastStatus === 'generating'
                          ? <><Loader2 size={14} className="spin" /> Grabando...</>
                          : <><Headphones size={14} /> {mat.podcastStatus === 'ready' ? 'Podcast' : 'Crear podcast'}</>}
                      </button>
                    )}
                    {mat.extractedText && (
                      <button
                        className="mat-action-btn"
                        title="Usar como contexto en el Laboratorio IA"
                        onClick={() => navigate(`/ia-lab?doc=${mat.id}`)}
                      >
                        <FlaskConical size={14} /> Usar en IA Lab
                      </button>
                    )}
                    <button
                      className={`mat-action-btn ${mat.isSharedWithStudents ? 'active' : ''}`}
                      title={mat.isSharedWithStudents ? 'Dejar de compartir' : 'Compartir con estudiantes de la materia'}
                      onClick={() => handleToggleShare(mat)}
                    >
                      <Share2 size={14} /> {mat.isSharedWithStudents ? 'Compartido' : 'Compartir'}
                    </button>
                    <button className="mat-action-btn" title="Cambiar nombre o descripción" onClick={() => openEdit(mat)}>
                      <PencilLine size={14} />
                    </button>
                    <button className="mat-action-btn danger" title="Eliminar" onClick={() => handleDelete(mat)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="biblioteca-empty">
              <BookOpen size={40} />
              <p>No se encontraron materiales</p>
              <span className="text-secondary text-sm">Subí tu primer material: un programa, un apunte, una guía...</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Modal: ver video ── */}
      {playing?.videoUrl && (
        <VideoModal url={playing.videoUrl} title={playing.title} onClose={() => setPlaying(null)} />
      )}

      {/* ── Modal: agregar video de YouTube ── */}
      {showVideo && (
        <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !videoSaving) setShowVideo(false); }}>
          <div className="em-modal">
            <div className="em-modal-header">
              <h3><Youtube size={17} className="text-cyan" /> Agregar video de YouTube</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setShowVideo(false)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              {videoError && <div className="em-error"><AlertCircle size={15} /> {videoError}</div>}
              <div className="em-field">
                <label>Link del video</label>
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  autoFocus
                  onChange={e => setVideoUrl(e.target.value)}
                />
              </div>
              {parseYouTubeId(videoUrl) && (
                <img
                  className="em-video-preview"
                  src={youTubeThumbnail(parseYouTubeId(videoUrl)!)}
                  alt="Vista previa del video"
                />
              )}
              <div className="em-field">
                <label>Título (cómo lo van a ver tus estudiantes)</label>
                <input
                  type="text"
                  placeholder="Ej: ¿Qué es un vector? (5 min)"
                  value={videoTitle}
                  maxLength={120}
                  onChange={e => setVideoTitle(e.target.value)}
                />
              </div>
              <div className="em-field">
                <label>Consigna o descripción (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Miralo antes de la clase del jueves y anotá dos preguntas."
                  value={videoDesc}
                  maxLength={300}
                  onChange={e => setVideoDesc(e.target.value)}
                />
              </div>
              <div className="em-field">
                <label>Materia</label>
                <select className="form-select" value={videoSubjectId} onChange={e => setVideoSubjectId(e.target.value)}>
                  {mySubjects.map(sj => <option key={sj.id} value={sj.id}>{sj.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-subtle">
                Al guardarlo se transcribe solo (si el video tiene subtítulos): con eso la IA puede resumirlo, armar placas y responder preguntas sobre él. Acordate de Compartirlo para que lo vean tus estudiantes.
              </p>
            </div>
            <div className="em-modal-footer">
              <button className="btn btn-outline btn-sm" onClick={() => setShowVideo(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddVideo} disabled={videoSaving || !videoUrl.trim() || !videoTitle.trim()}>
                {videoSaving ? 'Guardando...' : 'Agregar video'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: renombrar material ── */}
      {editFor && (
        <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditFor(null); }}>
          <div className="em-modal">
            <div className="em-modal-header">
              <h3><PencilLine size={17} className="text-cyan" /> Editar material</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setEditFor(null)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              <div className="em-field">
                <label>Nombre</label>
                <input
                  type="text"
                  value={editTitle}
                  maxLength={120}
                  autoFocus
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
                />
              </div>
              <div className="em-field">
                <label>Descripción (opcional)</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  maxLength={300}
                  onChange={e => setEditDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="em-modal-footer">
              <button className="btn btn-outline btn-sm" onClick={() => setEditFor(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleRename} disabled={!editTitle.trim() || editSaving}>
                {editSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: subir material ── */}
      {showUpload && (
        <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !uploading) setShowUpload(false); }}>
          <div className="em-modal">
            <div className="em-modal-header">
              <h3><Upload size={17} className="text-cyan" /> Subir material</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setShowUpload(false)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              {uplError && <div className="em-error"><AlertCircle size={15} /> {uplError}</div>}
              <div
                className="em-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handlePickFile(e.dataTransfer.files[0] ?? null); }}
              >
                <FileUp size={26} />
                {uplFile
                  ? <span className="em-file-name">{uplFile.name} · {formatFileSize(uplFile.size)}</span>
                  : <span>Arrastrá el archivo acá o hacé clic para elegirlo</span>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.docx,image/*"
                  hidden
                  onChange={e => handlePickFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="em-field">
                <label>Título</label>
                <input type="text" value={uplTitle} onChange={e => setUplTitle(e.target.value)} placeholder="Ej: Guía de vectores — Unidad 2" />
              </div>
              <div className="em-row">
                <div className="em-field">
                  <label>Materia</label>
                  <select className="form-select" value={uplSubjectId} onChange={e => setUplSubjectId(e.target.value)}>
                    {mySubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="em-field">
                  <label>Tags (separados por coma)</label>
                  <input type="text" value={uplTags} onChange={e => setUplTags(e.target.value)} placeholder="guía, práctica..." />
                </div>
              </div>
              <label className="em-checkbox-row">
                <input type="checkbox" checked={uplShare} onChange={e => setUplShare(e.target.checked)} />
                Compartir con los estudiantes de la materia
              </label>
            </div>
            <div className="em-modal-footer">
              <button className="btn btn-outline btn-sm" onClick={() => setShowUpload(false)} disabled={uploading}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleUpload} disabled={uploading || !uplFile}>
                {uploading ? 'Subiendo...' : 'Subir a la biblioteca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visor de placas ── */}
      {podcastFor?.podcastPath && (
        <PodcastPlayer
          path={podcastFor.podcastPath}
          title={podcastFor.title}
          onClose={() => setPodcastFor(null)}
        />
      )}

      {cardsFor?.studyCards && (
        <StudyCardsViewer
          cards={cardsFor.studyCards}
          title={cardsFor.title}
          subjectName={cardsFor.subjectName}
          onClose={() => setCardsFor(null)}
        />
      )}

      {/* ── Modal: resumen IA ── */}
      {summaryFor && (
        <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSummaryFor(null); }}>
          <div className="em-modal em-modal-lg">
            <div className="em-modal-header">
              <h3><Sparkles size={17} className="text-ia-accent" /> Resumen IA — {summaryFor.title}</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setSummaryFor(null)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              {summaryLoading && (
                <div className="em-processing">
                  <div className="em-spinner" />
                  <p>Generando resumen pedagógico...</p>
                </div>
              )}
              {summaryError && <div className="em-error"><AlertCircle size={15} /> {summaryError}</div>}
              {!summaryLoading && summaryFor.aiSummary && (
                <div className="summary-markdown">
                  <MarkdownRenderer content={summaryFor.aiSummary} />
                </div>
              )}
            </div>
            <div className="em-modal-footer">
              {!summaryLoading && summaryFor.aiSummary && (
                <>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => textToPdf(summaryFor.aiSummary ?? '', summaryFor.title, summaryFor.subjectName)}
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { navigator.clipboard.writeText(summaryFor.aiSummary ?? ''); }}
                  >
                    Copiar
                  </button>
                </>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setSummaryFor(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
