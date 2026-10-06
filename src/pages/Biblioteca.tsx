import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Upload, FileText, Link2, Image, BookOpen, X, Sparkles,
  Download, Trash2, Share2, FlaskConical, AlertCircle, FileUp, Loader2, Layers, PencilLine, Youtube, Captions,
  Headphones, ScanText, Eye, Radio, Check, Play, Presentation, Wand2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMaterialsByTeacher, searchMaterials, createMaterial, deleteMaterial, renameMaterial, guardarTextoDeck } from '../services/library.service';
import { getSubjects } from '../services/subjects.service';
import {
  uploadFile, getSignedUrl, removeFile, fileToBase64, leerTextoDeArchivo,
  summarizeDocument, updateMaterial, formatFileSize,
  generateStudyCards, generatePodcast,
} from '../services/documents.service';
import { parseYouTubeId, youTubeThumbnail } from '../lib/youtube';
import { transcribeYouTube } from '../services/documents.service';
import VideoModal from '../components/VideoModal';
import MaterialViewer from '../components/MaterialViewer';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PlacasEditor from '../components/PlacasEditor';
import PresentationViewer from '../components/PresentationViewer';
import { marcarDiseno } from '../lib/disenos';
import AdaptarMaterial from '../components/AdaptarMaterial';
import { deckDe, type ParsedPresentation } from '../lib/presentation';
import PodcastPlayer from '../components/PodcastPlayer';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
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
  // Hasta que llega la primera lista no se dice "no hay materiales"
  const [cargado, setCargado] = useState(false);

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

  // Procesamiento de texto en curso (por material) y por qué falló
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [textErrors, setTextErrors] = useState<Record<string, string>>({});

  // La lectura de un escaneo corre en esta pestaña: si se va, se corta
  useEffect(() => {
    if (processingIds.size === 0) return;
    const frenar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', frenar);
    return () => window.removeEventListener('beforeunload', frenar);
  }, [processingIds]);

  // Resumen IA
  const [summaryFor, setSummaryFor] = useState<LibraryMaterial | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  // Dentro del diálogo, "Copiado" en el mismo botón: un aviso quedaría detrás del fondo
  const [resumenCopiado, setResumenCopiado] = useState(false);

  // Placas de estudio
  const [cardsFor, setCardsFor] = useState<LibraryMaterial | null>(null);
  const [placasEditando, setPlacasEditando] = useState<LibraryMaterial | null>(null);
  const [cardsGeneratingId, setCardsGeneratingId] = useState<string | null>(null);

  // Podcast
  const [podcastFor, setPodcastFor] = useState<LibraryMaterial | null>(null);
  const [podcastGeneratingId, setPodcastGeneratingId] = useState<string | null>(null);

  const refresh = () => {
    if (!user) return;
    getMaterialsByTeacher(user.id)
      .then(setAllMaterials)
      .catch(console.error)
      .finally(() => setCargado(true));
  };

  useEffect(() => {
    if (!user) return;
    refresh();
    getSubjects(user.schoolId).then(subjects => {
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

  // Videos de YouTube
  const [showVideo, setShowVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [videoSubjectId, setVideoSubjectId] = useState('');
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [playing, setPlaying] = useState<LibraryMaterial | null>(null);
  const [viendo, setViendo] = useState<LibraryMaterial | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

  // Renombrar
  const [editFor, setEditFor] = useState<LibraryMaterial | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Diapositivas guardadas desde el Laboratorio: se presentan en vez de leerse
  const [presentando, setPresentando] = useState<{ deck: ParsedPresentation; mat: LibraryMaterial } | null>(null);
  // Adaptar un material (lectura fácil, paso a paso…)
  const [adaptando, setAdaptando] = useState<LibraryMaterial | null>(null);

  // Qué materiales son diapositivas (se calcula una vez por lista, no en cada tecla)
  const decks = useMemo(() => {
    const map = new Map<string, ParsedPresentation>();
    for (const m of [...allMaterials, ...(searchResults ?? [])]) {
      if (map.has(m.id)) continue;
      const deck = deckDe(m);
      if (deck) map.set(m.id, deck);
    }
    return map;
  }, [allMaterials, searchResults]);

  // Todos los hooks van antes de este return: al cerrar sesión user pasa
  // a null, y si quedaba alguno abajo React rompía la pantalla con
  // "Rendered fewer hooks than expected".
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

  const openVideo = () => {
    setShowVideo(true);
    setVideoError('');
    setVideoSubjectId(mySubjects[0]?.id ?? '');
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
        isSharedWithStudents: uplShare,
      });

      setShowUpload(false);
      refresh();
      avisar.exito('Material subido', uplShare ? 'Ya lo ven tus estudiantes de la materia.' : undefined);

      // Word y PDF: leer el texto para que la IA pueda usarlo
      void leerTexto({ ...material, storagePath }, uplFile);
    } catch (err) {
      setUplError(err instanceof Error ? err.message : 'Error subiendo el material.');
    } finally {
      setUploading(false);
    }
  };

  /** Lee el texto de un Word o PDF: al subirlo, o con "Leer texto" si quedó sin. */
  const leerTexto = async (mat: Pick<LibraryMaterial, 'id' | 'title' | 'fileType' | 'storagePath'>, file?: Blob) => {
    const tipo = mat.fileType;
    if (tipo !== 'pdf' && tipo !== 'doc') return;
    if (!file && !mat.storagePath) return;
    setProcessingIds(prev => new Set(prev).add(mat.id));
    setTextErrors(prev => { const n = { ...prev }; delete n[mat.id]; return n; });
    try {
      let blob = file;
      if (!blob) {
        const resp = await fetch(await getSignedUrl(mat.storagePath!));
        if (!resp.ok) throw new Error('No se pudo bajar el archivo para leerlo. Probá de nuevo.');
        blob = await resp.blob();
      }
      const text = await leerTextoDeArchivo(blob, tipo, mat.title);
      await updateMaterial(mat.id, { extractedText: text });
    } catch (err) {
      console.error('No se pudo leer el texto:', err);
      setTextErrors(prev => ({ ...prev, [mat.id]: err instanceof Error ? err.message : 'No se pudo leer el texto.' }));
    } finally {
      setProcessingIds(prev => { const n = new Set(prev); n.delete(mat.id); return n; });
      refresh();
    }
  };

  // ── Card actions ──

  const handleDownload = async (mat: LibraryMaterial) => {
    if (!mat.storagePath) return;
    try {
      const a = document.createElement('a');
      a.href = await getSignedUrl(mat.storagePath, mat.fileName || mat.title);
      a.click();
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo descargar el archivo.', 'Probá de nuevo en un rato.');
    }
  };

  const handleDelete = async (mat: LibraryMaterial) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${mat.title}"?`,
      mensaje: 'Se borra de tu biblioteca junto con sus placas y su podcast, y tus estudiantes dejan de verlo. No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      if (mat.storagePath) await removeFile(mat.storagePath);
      // El podcast vive aparte del archivo original: si no se borra acá,
      // el MP3 queda huérfano en Storage para siempre.
      if (mat.podcastPath) await removeFile(mat.podcastPath).catch(console.error);
      await deleteMaterial(mat.id);
      refresh();
      avisar.exito('Material eliminado');
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo eliminar el material.', 'Probá de nuevo.');
    }
  };

  // ── Videos de YouTube: el disparador con el que arranca la clase ──
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
      avisar.exito('Video agregado', 'Ahora se transcribe solo, si tiene subtítulos.');
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
      avisar.error('No se pudo transcribir el video.', err instanceof Error ? err.message : undefined);
    } finally {
      setTranscribingId(null);
    }
  };

  // ── Renombrar: lo que creaste es tuyo y lo podés corregir ──
  const openEdit = (mat: LibraryMaterial) => {
    setEditFor(mat);
    setEditTitle(mat.title);
    setEditDesc(mat.description ?? '');
    setEditError('');
  };

  const handleRename = async () => {
    if (!editFor || !editTitle.trim() || editSaving) return;
    setEditSaving(true);
    setEditError('');
    try {
      await renameMaterial(editFor.id, editTitle.trim(), editDesc.trim());
      setAllMaterials(prev => prev.map(m => m.id === editFor.id
        ? { ...m, title: editTitle.trim(), description: editDesc.trim() }
        : m));
      setEditFor(null);
      avisar.exito('Cambios guardados');
    } catch (err) {
      console.error(err);
      // Con el diálogo abierto, el error va adentro: ahí está mirando
      setEditError('No se pudo guardar el cambio. Probá de nuevo.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleShare = async (mat: LibraryMaterial) => {
    try {
      await updateMaterial(mat.id, { isSharedWithStudents: !mat.isSharedWithStudents });
      refresh();
      if (mat.isSharedWithStudents) avisar.exito('Dejaste de compartirlo');
      else avisar.exito('Compartido con tus estudiantes', `Lo ven en ${mat.subjectName}.`);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo cambiar si se comparte.', 'Probá de nuevo.');
    }
  };

  const handleStudyCards = async (mat: LibraryMaterial) => {
    if (mat.studyCards?.length) {
      setCardsFor(mat);
      return;
    }
    if (!mat.extractedText) return;
    setCardsGeneratingId(mat.id);
    avisar.info('Armando las placas…', 'Tarda cerca de un minuto. Quedan guardadas en el material: no hace falta volver a generarlas.');
    try {
      const cards = await generateStudyCards(mat.extractedText, mat.title);
      if (!cards.length) throw new Error('La IA no generó placas para este material.');
      await updateMaterial(mat.id, { studyCards: cards });
      setCardsFor({ ...mat, studyCards: cards });
      refresh();
    } catch (err) {
      avisar.error('No se pudieron generar las placas.', err instanceof Error ? err.message : 'Probá de nuevo.');
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
      avisar.error('No se pudo generar el podcast.', err instanceof Error ? err.message : 'Probá de nuevo.');
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
          <h3 aria-level={2}>Biblioteca Docente</h3>
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
            onClick={openVideo}
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
              aria-label="Buscar en la biblioteca"
              placeholder="Buscar por título, tag o contenido..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="biblioteca-count">
          <span className="text-secondary text-sm">{filtered.length} material{filtered.length !== 1 ? 'es' : ''}</span>
        </div>

        {!cargado && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando tus materiales…" />}

        {cargado && filtered.length === 0 && (
          query.trim() ? (
            <EstadoVacio
              icono={Search}
              titulo="Ningún material coincide"
              texto={`Nada coincide con "${query.trim()}". Probá con otra palabra o buscá en todas las materias.`}
              accion={{ etiqueta: 'Ver todos los materiales', alTocar: () => { setQuery(''); setActiveSubject(null); } }}
            />
          ) : activeSubject ? (
            <EstadoVacio
              icono={BookOpen}
              titulo="Todavía no hay materiales de esta materia"
              texto="Subí un apunte, una guía o un video para tenerlo a mano y usarlo con la IA."
              accion={{ etiqueta: 'Subir material', alTocar: openUpload, icono: Upload }}
              accionSecundaria={{ etiqueta: 'Ver todas las materias', alTocar: () => setActiveSubject(null) }}
            />
          ) : (
            <EstadoVacio
              icono={BookOpen}
              titulo="Tu biblioteca está vacía"
              texto="Subí tu primer material: un programa, un apunte, una guía. La IA lee el texto y arma placas, podcast y actividades."
              accion={{ etiqueta: 'Subir material', alTocar: openUpload, icono: Upload }}
              accionSecundaria={{ etiqueta: 'Agregar video', alTocar: openVideo, icono: Youtube }}
            />
          )
        )}

        <div className="biblioteca-grid">
          {filtered.map(mat => {
            const deck = decks.get(mat.id) ?? null;
            const Icon = deck ? Presentation : fileIcons[mat.fileType] || FileText;
            // Material que es solo texto (armado con IA, adaptado): se lee acá adentro
            const soloTexto = !mat.storagePath && !mat.videoUrl && !!mat.extractedText && mat.fileType !== 'link';
            const processing = processingIds.has(mat.id);
            // Word o PDF subido que quedó sin texto: se puede volver a leer
            const sinTexto = !mat.extractedText && !!mat.storagePath && (mat.fileType === 'pdf' || mat.fileType === 'doc');
            const textError = textErrors[mat.id];
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
                  <h4 className="mat-title" aria-level={3}>{mat.title}</h4>
                  {mat.description && <p className="mat-desc">{mat.description}</p>}
                  <div className="mat-meta">
                    {deck && (
                      <span className="badge badge-ia" title={`${deck.slides.length} diapositivas, listas para presentar`}>
                        <Presentation size={11} aria-hidden="true" /> Diapositivas
                      </span>
                    )}
                    <span className="badge badge-cyan">{mat.subjectName}</span>
                    {mat.unitName && <span className="badge badge-neutral">{mat.unitName}</span>}
                    <span className="mat-size">{mat.fileSize}</span>
                    {processing && (
                      <span className="badge badge-ia" title="No cierres ni cambies de pantalla hasta que termine">
                        <Loader2 size={11} className="spin" /> Leyendo texto...
                      </span>
                    )}
                    {!processing && mat.extractedText && (
                      <span className="badge badge-success" title="La IA puede usar este documento">Texto listo</span>
                    )}
                    {!processing && sinTexto && (
                      <span className={`badge ${textError ? 'badge-danger' : 'badge-neutral'}`}
                        title="Sin texto, la IA no puede hacer placas, podcast ni usarlo en IA Lab">
                        {textError ? 'No se pudo leer' : 'Sin texto'}
                      </span>
                    )}
                    {mat.isSharedWithStudents && (
                      <span className="badge badge-warning" title="Visible para estudiantes de la materia">Compartido</span>
                    )}
                  </div>
                  {!processing && sinTexto && textError && (
                    <p className="mat-text-error" role="alert">{textError}</p>
                  )}
                  <div className="mat-tags">
                    {mat.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="mat-tag">{tag}</span>
                    ))}
                  </div>
                  <div className="mat-actions">
                    {deck && (
                      <button
                        className="mat-action-btn"
                        title="Pasar las diapositivas en pantalla completa y bajarlas como PowerPoint"
                        onClick={() => setPresentando({ deck, mat })}
                      >
                        <Play size={14} /> Presentar
                      </button>
                    )}
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
                    {(mat.storagePath || (soloTexto && !deck)) && (
                      <button className="mat-action-btn" title="Verlo acá, sin descargar" onClick={() => setViendo(mat)}>
                        <Eye size={14} /> Ver
                      </button>
                    )}
                    {sinTexto && (
                      <button
                        className="mat-action-btn"
                        title="Lee el texto del archivo para que la IA pueda hacer placas, podcast y usarlo en IA Lab"
                        onClick={() => leerTexto(mat)}
                        disabled={processing}
                      >
                        {processing
                          ? <><Loader2 size={14} className="spin" /> Leyendo...</>
                          : <><ScanText size={14} /> {textError ? 'Reintentar' : 'Leer texto'}</>}
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
                          ? <><Loader2 size={14} className="spin" /> Armando placas…</>
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
                    {mat.extractedText && !deck && (
                      <button
                        className="mat-action-btn"
                        title="Hacer una versión en lectura fácil, paso a paso, con glosario o más corta. El original no cambia."
                        onClick={() => setAdaptando(mat)}
                      >
                        <Wand2 size={14} /> Adaptar
                      </button>
                    )}
                    {(mat.storagePath || mat.extractedText || mat.videoUrl) && (
                      <button
                        className="mat-action-btn"
                        title="Trabajarlo en la clase en vivo: proyectarlo, mostrarlo en los celulares y sacar preguntas"
                        onClick={() => navigate(`/clase-en-vivo?material=${mat.id}`)}
                      >
                        <Radio size={14} /> En vivo
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
        </div>
      </main>

      {/* ── Modal: ver el material acá adentro ── */}
      {viendo && (
        <MaterialViewer material={viendo} onClose={() => setViendo(null)} onDescargar={() => handleDownload(viendo)} verNotas />
      )}

      {/* ── Diapositivas guardadas: presentarlas ── */}
      {presentando && (
        <PresentationViewer
          presentation={presentando.deck}
          subjectName={presentando.mat.subjectName || undefined}
          teacherName={`${user.firstName} ${user.lastName}`}
          onClose={() => setPresentando(null)}
          alCambiarDiseno={async id => {
            const { mat } = presentando;
            try {
              await guardarTextoDeck(mat.id, marcarDiseno(mat.extractedText ?? '', id));
              refresh();
            } catch (err) {
              console.error(err);
              avisar.error('No se pudo guardar el diseño', 'Se ve así ahora, pero la próxima vez vuelve al anterior.');
            }
          }}
        />
      )}

      {/* ── Adaptar un material: versión nueva, el original no cambia ── */}
      {adaptando && (
        <AdaptarMaterial
          material={adaptando}
          teacherId={user.id}
          courseName={user.subjects?.find(s => s.subjectId === adaptando.subjectId)?.courseName}
          alCerrar={() => setAdaptando(null)}
          alGuardar={nuevo => setAllMaterials(prev => [nuevo, ...prev])}
        />
      )}

      {/* ── Modal: ver video ── */}
      {playing?.videoUrl && (
        <VideoModal url={playing.videoUrl} title={playing.title} onClose={() => setPlaying(null)} />
      )}

      {/* ── Modal: agregar video de YouTube ── */}
      <Dialogo abierto={showVideo} alCerrar={() => setShowVideo(false)} etiquetadoPor="bib-video-titulo" className="dialogo-em">
        <div className="em-modal">
          <div className="em-modal-header">
            <h3 id="bib-video-titulo"><Youtube size={17} className="text-cyan" /> Agregar video de YouTube</h3>
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
                data-inicial=""
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
      </Dialogo>

      {/* ── Modal: renombrar material ── */}
      <Dialogo abierto={editFor !== null} alCerrar={() => setEditFor(null)} etiquetadoPor="bib-editar-titulo" className="dialogo-em">
        <div className="em-modal">
          <div className="em-modal-header">
            <h3 id="bib-editar-titulo"><PencilLine size={17} className="text-cyan" /> Editar material</h3>
            <button className="btn-icon" aria-label="Cerrar" onClick={() => setEditFor(null)}><X size={18} /></button>
          </div>
          <div className="em-modal-body">
            {editError && <div className="em-error" role="alert"><AlertCircle size={15} /> {editError}</div>}
            <div className="em-field">
              <label>Nombre</label>
              <input
                type="text"
                value={editTitle}
                maxLength={120}
                data-inicial=""
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
      </Dialogo>

      {/* ── Modal: subir material ── */}
      <Dialogo abierto={showUpload} alCerrar={() => setShowUpload(false)} etiquetadoPor="bib-subir-titulo" className="dialogo-em">
        <div className="em-modal">
          <div className="em-modal-header">
            <h3 id="bib-subir-titulo"><Upload size={17} className="text-cyan" /> Subir material</h3>
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
      </Dialogo>

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
          onEditar={() => { setPlacasEditando(cardsFor); setCardsFor(null); }}
        />
      )}

      {/* ── Editor de placas: corregir sin volver a generar ── */}
      {placasEditando?.studyCards && (
        <PlacasEditor
          placas={placasEditando.studyCards}
          titulo={placasEditando.title}
          alCerrar={() => setPlacasEditando(null)}
          alGuardar={async placas => {
            await updateMaterial(placasEditando.id, { studyCards: placas });
            refresh();
          }}
          alRehacer={placasEditando.extractedText
            ? () => generateStudyCards(placasEditando.extractedText!, placasEditando.title)
            : undefined}
        />
      )}

      {/* ── Modal: resumen IA ── */}
      <Dialogo abierto={summaryFor !== null} alCerrar={() => setSummaryFor(null)} etiquetadoPor="bib-resumen-titulo" className="dialogo-em">
        {summaryFor && (
          <div className="em-modal em-modal-lg">
            <div className="em-modal-header">
              <h3 id="bib-resumen-titulo"><Sparkles size={17} className="text-ia-accent" /> Resumen IA — {summaryFor.title}</h3>
              <button className="btn-icon" aria-label="Cerrar" onClick={() => setSummaryFor(null)}><X size={18} /></button>
            </div>
            <div className="em-modal-body">
              {summaryLoading && (
                <div className="em-processing" role="status">
                  <div className="em-spinner" aria-hidden="true" />
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
                    onClick={async () => { const { textToPdf } = await import('../lib/pdf'); textToPdf(summaryFor.aiSummary ?? '', summaryFor.title, summaryFor.subjectName); }}
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(summaryFor.aiSummary ?? '')
                        .then(() => { setResumenCopiado(true); setTimeout(() => setResumenCopiado(false), 2000); })
                        .catch(() => setSummaryError('No se pudo copiar. Seleccioná el texto y copialo a mano.'));
                    }}
                  >
                    {resumenCopiado ? <><Check size={14} /> Copiado</> : 'Copiar'}
                  </button>
                </>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setSummaryFor(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </Dialogo>
    </div>
  );
}
