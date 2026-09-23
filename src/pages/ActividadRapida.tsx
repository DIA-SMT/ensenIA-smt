/**
 * ⚡ Actividad Rápida — pensada para el celular del docente.
 *
 * Un solo recorrido: curso → tema → la IA genera (o escribís) →
 * cuestionario opcional → publicar. Sin árbol de planificación: lo mínimo
 * para crear una actividad buena en un minuto. Para la planificación
 * profunda está el Laboratorio IA.
 *
 * v4: en escritorio, a la derecha se ve la actividad como la van a ver los
 * estudiantes (antes la pantalla era una columna angosta en medio de un
 * espacio vacío), y el tema se puede elegir del programa del curso: lo que
 * sigue sin dar aparece primero.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Sparkles, Send, Trash2, PenLine, Square, CheckCircle, AlertCircle, ListChecks, QrCode,
  Check, Eye, BookOpen, Smartphone,
} from 'lucide-react';
import QrModal from '../components/QrModal';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getTemasDelPrograma, type TemaDelPrograma } from '../services/planning.service';
import { getOrCreateSession, saveUserMessage } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { extractQuestions } from '../services/documents.service';
import { createActivity } from '../services/activities.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { Subject, ActivityQuestion, SubjectAssignment } from '../types';
import './ActividadRapida.css';
import '../components/Modals.css';

type DueOption = 'none' | 'tomorrow' | 'week';
type EstadoPaso = 'hecho' | 'actual' | 'pendiente';

const MAX_SUGERENCIAS = 5;

export default function ActividadRapida() {
  const { user } = useAuth();
  const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
  const [assignmentIdx, setAssignmentIdx] = useState(0);

  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [temas, setTemas] = useState<{ clave: string; lista: TemaDelPrograma[] } | null>(null);

  const [questions, setQuestions] = useState<ActivityQuestion[]>([]);
  const [extracting, setExtracting] = useState(false);

  const [due, setDue] = useState<DueOption>('week');
  const [points, setPoints] = useState('10');
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedTitle, setPublishedTitle] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getSubjects(user.schoolId).then(subjects => {
      const map: Record<string, Subject> = {};
      subjects.forEach(s => { map[s.id] = s; });
      setSubjectsMap(map);
    }).catch(console.error);
  }, [user]);

  // Abort SOLO al desmontar: si estuviera en el efecto de arriba, un cambio
  // de identidad de `user` (refresh de sesión) cortaría la generación en curso.
  useEffect(() => () => abortRef.current?.abort(), []);

  const assignments = user?.subjects ?? [];
  const assignment: SubjectAssignment | undefined = assignments[assignmentIdx];
  const claveCurso = assignment ? `${assignment.subjectId}:${assignment.courseId}` : '';

  // Temas del programa del curso elegido (solo títulos).
  useEffect(() => {
    if (!user || !assignment) return;
    let vigente = true;
    getTemasDelPrograma(assignment.subjectId, assignment.courseId, user.id)
      .then(lista => { if (vigente) setTemas({ clave: claveCurso, lista }); })
      .catch(() => { if (vigente) setTemas({ clave: claveCurso, lista: [] }); });
    return () => { vigente = false; };
    // claveCurso resume assignment: no hace falta el objeto entero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, claveCurso]);

  if (!user) return null;

  const subjectName = assignment ? (subjectsMap[assignment.subjectId]?.name ?? '') : '';
  const cursoLegible = assignment ? `${subjectName || 'Materia'} · ${assignment.courseName}` : '';

  // Sugerencias: lo que sigue sin dar primero; si ya se dio todo, lo último.
  const listaTemas = temas?.clave === claveCurso ? temas.lista : [];
  const pendientes = listaTemas.filter(t => !t.dada);
  const sugerencias = (pendientes.length ? pendientes : [...listaTemas].reverse()).slice(0, MAX_SUGERENCIAS);

  // ── Generar con IA (streaming) ──
  const handleGenerate = async () => {
    if (!topic.trim() || !assignment || generating) return;
    setGenerating(true);
    setError('');
    setContent('');
    setEditing(false);
    setQuestions([]);

    try {
      const session = await getOrCreateSession(user.id, null, {
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        title: 'Actividad rápida',
      });
      const prompt = `Generá una actividad BREVE y lista para usar sobre: "${topic.trim()}". `
        + `Formato: un título atractivo, una introducción de 2-3 líneas para los estudiantes, y 3-4 consignas concretas. `
        + `Que se pueda resolver en 20-30 minutos. Directo al grano, sin secciones de materiales ni criterios.`;
      saveUserMessage(session.id, prompt, 'act').catch(() => {});

      const controller = new AbortController();
      abortRef.current = controller;
      let full = '';
      await streamChat(
        [{ role: 'user', content: prompt }],
        {
          subjectName,
          courseName: assignment.courseName,
          educationLevel: undefined,
        },
        { sessionId: session.id, tool: 'act' },
        {
          onToken: t => { full += t; setContent(full); },
          onDone: () => { setGenerating(false); abortRef.current = null; },
          onError: e => { setError(e.message); setGenerating(false); abortRef.current = null; },
        },
        controller.signal,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando la actividad.');
      setGenerating(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setGenerating(false);
  };

  // ── Cuestionario ──
  const handleQuestions = async () => {
    if (!content.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const qs = await extractQuestions(content);
      setQuestions(qs);
      if (!qs.length) setError('La IA no generó preguntas para este contenido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando preguntas.');
    } finally {
      setExtracting(false);
    }
  };

  // ── Publicar ──
  const dueDateIso = (): string | null => {
    if (due === 'none') return null;
    const d = new Date();
    d.setDate(d.getDate() + (due === 'tomorrow' ? 1 : 7));
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };

  const handlePublish = async () => {
    if (!assignment || !content.trim()) return;
    setPublishing(true);
    setError('');
    try {
      const firstLine = content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      const activity = await createActivity({
        title: (topic.trim() || firstLine || 'Actividad rápida').slice(0, 120),
        contentMd: content,
        questions,
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        teacherId: user.id,
        schoolId: user.schoolId,
        sourceTool: 'act',
        dueDate: dueDateIso(),
        points: points ? Number(points) : null,
      });
      setPublishedId(activity.id);
      setPublishedTitle(activity.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publicando.');
    } finally {
      setPublishing(false);
    }
  };

  const crearOtra = () => { setPublishedId(null); setTopic(''); setContent(''); setQuestions([]); setEditing(false); };

  // ── Publicada ──
  if (publishedId) {
    return (
      <div className="ar-v4">
        <section className="ar-hero ar-hero-listo" aria-labelledby="ar-listo">
          <CheckCircle size={40} aria-hidden="true" />
          <h2 id="ar-listo" className="ar-hero-titulo">¡Actividad publicada!</h2>
          <p className="ar-hero-bajada">
            Los estudiantes de <strong>{assignment?.courseName}</strong> ya la ven en su portal.
          </p>
          <div className="ar-done-actions">
            <button type="button" className="btn ar-btn-blanco" onClick={() => setShowQr(true)}>
              <QrCode size={16} aria-hidden="true" /> Mostrar QR para el aula
            </button>
            <Link to={`/actividades/${publishedId}`} className="btn ar-btn-borde">Ver resultados</Link>
            <button type="button" className="btn ar-btn-borde" onClick={crearOtra}>Crear otra</button>
          </div>
        </section>
        {showQr && (
          <QrModal
            path={`/mis-actividades/${publishedId}`}
            title={publishedTitle || 'Actividad'}
            onClose={() => setShowQr(false)}
          />
        )}
      </div>
    );
  }

  const hayContenido = !!content.trim();
  const pasos: { n: number; etiqueta: string; estado: EstadoPaso }[] = [
    { n: 1, etiqueta: 'Curso', estado: assignment ? 'hecho' : 'actual' },
    { n: 2, etiqueta: 'Tema', estado: hayContenido && !generating ? 'hecho' : 'actual' },
    { n: 3, etiqueta: 'Preguntas', estado: questions.length ? 'hecho' : hayContenido && !generating ? 'actual' : 'pendiente' },
    { n: 4, etiqueta: 'Publicar', estado: hayContenido && !generating ? 'actual' : 'pendiente' },
  ];

  return (
    <div className="ar-v4">
      {/* ── Encabezado con los pasos ── */}
      <section className="ar-hero" aria-labelledby="ar-titulo">
        <p className="ar-hero-eyebrow"><Zap size={15} aria-hidden="true" /> Lista en un minuto</p>
        <h2 id="ar-titulo" className="ar-hero-titulo">
          {assignment ? <>¿Qué van a trabajar en <span className="ar-hero-curso">{cursoLegible}</span>?</> : 'Actividad rápida'}
        </h2>
        <ol className="ar-pasos-linea" aria-label="Pasos">
          {pasos.map(p => (
            <li key={p.n} className={`ar-paso-${p.estado}`} aria-current={p.estado === 'actual' && p.n === pasos.find(x => x.estado === 'actual')?.n ? 'step' : undefined}>
              <span className="ar-paso-marca" aria-hidden="true">{p.estado === 'hecho' ? <Check size={13} /> : p.n}</span>
              <span>{p.etiqueta}{p.n === 3 && <span className="ar-paso-opcional"> (opcional)</span>}</span>
              <span className="sr-only">{p.estado === 'hecho' ? ', listo' : p.estado === 'actual' ? ', en curso' : ', falta'}</span>
            </li>
          ))}
        </ol>
        <p className="ar-hero-bajada">
          Para planificar en profundidad, usá el <Link to="/ia-lab">Laboratorio IA</Link>.
        </p>
      </section>

      {error && <div className="em-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

      <div className="ar-cuerpo">
        {/* 1. Curso */}
        <section className="ar-step card ar-area-1" aria-labelledby="ar-curso">
          <h3 id="ar-curso"><span className="ar-step-num" aria-hidden="true">1</span> ¿Para qué curso?</h3>
          {assignments.length === 0 ? (
            <p className="text-secondary text-sm">
              Todavía no tenés materias asignadas. Pedile a dirección que te asigne tus cursos.
            </p>
          ) : (
            <div className="ar-chips" role="group" aria-labelledby="ar-curso">
              {assignments.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ar-chip ${assignmentIdx === i ? 'selected' : ''}`}
                  aria-pressed={assignmentIdx === i}
                  onClick={() => setAssignmentIdx(i)}
                >
                  {subjectsMap[a.subjectId]?.name ?? 'Materia'} · {a.courseName}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 2. Tema + generación */}
        <section className="ar-step card ar-area-2" aria-labelledby="ar-tema">
          <h3 id="ar-tema"><span className="ar-step-num" aria-hidden="true">2</span> ¿Sobre qué tema?</h3>
          <input
            aria-labelledby="ar-tema"
            aria-describedby={sugerencias.length ? 'ar-sugerencias-titulo' : undefined}
            className="ar-topic-input"
            type="text"
            placeholder='Ej: "suma de vectores con ejemplos de la vida real"'
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
          />

          {sugerencias.length > 0 && (
            <div className="ar-sugerencias">
              <p className="ar-sugerencias-titulo" id="ar-sugerencias-titulo">
                <BookOpen size={13} aria-hidden="true" />
                {pendientes.length ? 'Lo que sigue en tu programa' : 'De tu programa'}
              </p>
              <div className="ar-sugerencias-lista">
                {sugerencias.map(t => (
                  <button
                    key={`${t.unidad}-${t.clase}`}
                    type="button"
                    className={`ar-sugerencia${topic === t.clase ? ' elegida' : ''}`}
                    aria-pressed={topic === t.clase}
                    onClick={() => setTopic(t.clase)}
                    title={t.unidad}
                  >
                    {t.clase}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ar-gen-actions">
            {generating ? (
              <button type="button" className="btn btn-outline w-full" onClick={handleStop}>
                <Square size={15} aria-hidden="true" /> Detener
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={handleGenerate}
                disabled={!topic.trim() || !assignment}
                aria-describedby={!topic.trim() ? 'ar-gen-ayuda' : undefined}
              >
                <Sparkles size={16} aria-hidden="true" /> {content ? 'Regenerar con IA' : 'Generar con IA'}
              </button>
            )}
            {!topic.trim() && !generating && (
              <p className="ar-gen-ayuda" id="ar-gen-ayuda">Escribí o elegí un tema para que la IA la arme.</p>
            )}
          </div>

          {!content && !generating && (
            <button type="button" className="ar-manual-link" onClick={() => { setEditing(true); setContent(`## ${topic || 'Actividad'}\n\n`); }}>
              …o escribila vos
            </button>
          )}
        </section>

        {/* Vista previa: a la derecha en escritorio, acá en el celular */}
        <aside className="ar-vista ar-area-vista" aria-labelledby="ar-vista-titulo" aria-busy={generating}>
          <div className="ar-vista-cabeza">
            <h3 id="ar-vista-titulo"><Eye size={16} aria-hidden="true" /> Así la ven tus estudiantes</h3>
            {hayContenido && !generating && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(v => !v)} aria-pressed={editing}>
                <PenLine size={13} aria-hidden="true" /> {editing ? 'Ver cómo queda' : 'Editar'}
              </button>
            )}
          </div>

          {(content || generating) ? (
            editing ? (
              <textarea
                className="form-textarea ar-vista-editor"
                rows={14}
                aria-label="Texto de la actividad"
                value={content}
                onChange={e => setContent(e.target.value)}
              />
            ) : (
              <div className="ar-vista-md">
                {generating && !content && <p className="text-secondary text-sm" role="status">La IA está escribiendo…</p>}
                <MarkdownRenderer content={content} />
              </div>
            )
          ) : (
            <div className="ar-vista-vacia">
              <div className="ar-vista-celu" aria-hidden="true">
                <Smartphone size={22} />
                <span className="ar-linea ar-linea-titulo" />
                <span className="ar-linea" />
                <span className="ar-linea ar-linea-corta" />
                <span className="ar-linea" />
              </div>
              <p>Acá aparece la actividad tal como les llega a los chicos, antes de publicarla.</p>
              <ul className="ar-consejos">
                <li>Un tema concreto funciona mejor que uno general: <em>"fuerzas en un plano inclinado"</em> antes que <em>"fuerzas"</em>.</li>
                <li>Después de generarla la podés editar, y sumarle un cuestionario que se corrige solo.</li>
              </ul>
            </div>
          )}
        </aside>

        {/* 3. Cuestionario opcional */}
        {hayContenido && !generating && (
          <section className="ar-step card ar-area-3" aria-labelledby="ar-preguntas">
            <h3 id="ar-preguntas"><span className="ar-step-num" aria-hidden="true">3</span> ¿Cuestionario autocorregible? <span className="text-xs text-subtle">(opcional)</span></h3>
            {questions.length === 0 ? (
              <button type="button" className="btn btn-secondary w-full" onClick={handleQuestions} disabled={extracting}>
                <ListChecks size={15} aria-hidden="true" /> {extracting ? 'Generando preguntas…' : 'Generar preguntas con IA'}
              </button>
            ) : (
              <>
                {questions.map((q, qi) => (
                  <div key={q.id} className="em-question">
                    <div className="em-q-body">
                      <div className="em-q-prompt">{q.prompt}</div>
                      {q.type === 'multiple_choice' && q.options && (
                        <div className="em-q-options">
                          {q.options.map((opt, i) => (
                            <span key={i} className={`em-q-option ${i === q.correct_index ? 'correct' : ''}`}>
                              {String.fromCharCode(65 + i)}. {opt} {i === q.correct_index ? <><span aria-hidden="true">✓</span><span className="sr-only">(correcta)</span></> : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {q.type === 'open' && <span className="text-xs text-subtle">Respuesta abierta</span>}
                    </div>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setQuestions(prev => prev.filter(x => x.id !== q.id))}
                      aria-label={`Quitar la pregunta ${qi + 1}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm" onClick={handleQuestions} disabled={extracting}>
                  {extracting ? 'Regenerando…' : 'Regenerar preguntas'}
                </button>
              </>
            )}
          </section>
        )}

        {/* 4. Publicar */}
        {hayContenido && !generating && (
          <section className="ar-step card ar-area-4" aria-labelledby="ar-publicar">
            <h3 id="ar-publicar"><span className="ar-step-num" aria-hidden="true">4</span> Publicar</h3>
            <div className="ar-publish-row">
              <div className="ar-chips" role="group" aria-label="Fecha de entrega">
                <button type="button" className={`ar-chip ${due === 'none' ? 'selected' : ''}`} aria-pressed={due === 'none'} onClick={() => setDue('none')}>Sin fecha</button>
                <button type="button" className={`ar-chip ${due === 'tomorrow' ? 'selected' : ''}`} aria-pressed={due === 'tomorrow'} onClick={() => setDue('tomorrow')}>Para mañana</button>
                <button type="button" className={`ar-chip ${due === 'week' ? 'selected' : ''}`} aria-pressed={due === 'week'} onClick={() => setDue('week')}>En la semana</button>
              </div>
              <label className="ar-points">
                Puntos
                <input type="number" min="1" max="100" value={points} onChange={e => setPoints(e.target.value)} />
              </label>
            </div>
            <button type="button" className="btn btn-primary w-full ar-publish-btn" onClick={handlePublish} disabled={publishing} aria-busy={publishing}>
              <Send size={16} aria-hidden="true" /> {publishing ? 'Publicando…' : `Publicar a ${assignment?.courseName ?? 'curso'}`}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
