/**
 * "Material de la clase" en el panel de la clase en vivo (docente).
 *
 * Lo que hace el docente con el material mientras da la clase: elegirlo o
 * cambiarlo, proyectarlo, mostrarlo en los celulares (solo mientras dure
 * la clase) y sacar preguntas con IA para lanzarlas con un toque.
 */

import { useEffect, useState } from 'react';
import {
  BookOpen, MonitorPlay, Smartphone, Sparkles, Loader2, Send, RefreshCw, Check,
} from 'lucide-react';
import {
  getLiveClassMaterial, setLiveMaterial, setMaterialVisible, textoDeMaterial, materialParaVisor,
  type LiveSession, type LiveActivityKind, type LiveActivityConfig, type MaterialDeClase,
} from '../services/live.service';
import { extractQuestions } from '../services/documents.service';
import { deckDe } from '../lib/presentation';
import ElegirMaterial from './ElegirMaterial';
import MaterialViewer from './MaterialViewer';
import EstadoVacio from './ui/EstadoVacio';
import { Cargando } from './ui/Esqueleto';
import type { ActivityQuestion } from '../types';
import './MaterialEnVivo.css';

/** Con menos que esto, la IA inventaría en vez de preguntar sobre el material. */
const MIN_TEXTO = 120;

export default function MaterialEnVivo({ session, onSession, lanzar }: {
  session: LiveSession;
  onSession: (s: LiveSession) => void;
  lanzar: (kind: LiveActivityKind, config: LiveActivityConfig) => Promise<void>;
}) {
  const [material, setMaterial] = useState<MaterialDeClase | null | undefined>(undefined);
  const [eligiendo, setEligiendo] = useState(false);
  const [proyectando, setProyectando] = useState(false);
  const [preguntas, setPreguntas] = useState<ActivityQuestion[] | null>(null);
  const [generando, setGenerando] = useState(false);
  const [lanzadas, setLanzadas] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const elegido = session.materialId ?? session.classId;

  useEffect(() => {
    let cancelado = false;
    if (!elegido) { setMaterial(null); return; }
    getLiveClassMaterial(session.id)
      .then(m => { if (!cancelado) setMaterial(m); })
      .catch(() => { if (!cancelado) setMaterial(null); });
    return () => { cancelado = true; };
  }, [session.id, elegido]);

  const texto = material ? textoDeMaterial(material) : '';
  // Diapositivas guardadas desde el Laboratorio: al proyectar se pasan una por una
  const deck = material?.tipo === 'material' ? deckDe({ tags: [], extractedText: material.texto }) : null;
  const puedePreguntar = texto.length >= MIN_TEXTO;

  const elegir = async (e: Parameters<Parameters<typeof ElegirMaterial>[0]['alElegir']>[0]) => {
    setEligiendo(false);
    setError('');
    try {
      await setLiveMaterial(session.id, e ? ('materialId' in e ? { materialId: e.materialId } : { classId: e.classId }) : null);
      onSession({
        ...session,
        materialId: e && 'materialId' in e ? e.materialId : null,
        classId: e && 'classId' in e ? e.classId : null,
        materialVisible: e ? session.materialVisible : false,
      });
      setPreguntas(null);
      setLanzadas(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el material.');
    }
  };

  const alternarVisible = async () => {
    const next = !session.materialVisible;
    onSession({ ...session, materialVisible: next }); // optimista
    try {
      await setMaterialVisible(session.id, next);
    } catch {
      onSession({ ...session, materialVisible: !next });
      setError('No se pudo cambiar lo que ven los celulares.');
    }
  };

  const generarPreguntas = async () => {
    if (!puedePreguntar || generando) return;
    setGenerando(true);
    setError('');
    try {
      const qs = await extractQuestions(texto);
      setPreguntas(qs);
      setLanzadas(new Set());
      if (qs.length === 0) setError('La IA no encontró preguntas para hacer con este material.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron armar las preguntas.');
    } finally {
      setGenerando(false);
    }
  };

  const lanzarPregunta = async (q: ActivityQuestion) => {
    const opciones = (q.options ?? []).map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
    try {
      if (q.type === 'multiple_choice' && opciones.length >= 2) {
        await lanzar('quiz', { question: q.prompt, options: opciones, correctId: opciones[q.correct_index ?? 0]?.id });
      } else {
        await lanzar('texto', { question: q.prompt });
      }
      setLanzadas(prev => new Set(prev).add(q.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo lanzar la pregunta.');
    }
  };

  return (
    <section className="card mev" aria-labelledby="mev-titulo">
      <div className="mev-head">
        <h4 id="mev-titulo"><BookOpen size={16} aria-hidden="true" /> Material de la clase</h4>
        {elegido && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEligiendo(true)}>
            <RefreshCw size={14} aria-hidden="true" /> Cambiar
          </button>
        )}
      </div>

      {!elegido && (
        <EstadoVacio
          compacto
          icono={BookOpen}
          titulo="Todavía no elegiste material"
          texto="Elegí un tema de tu temario o un material de tu biblioteca: lo proyectás, lo ven en los celulares y la IA saca preguntas para lanzar."
          accion={{ etiqueta: 'Elegir material', alTocar: () => setEligiendo(true), icono: BookOpen }}
        />
      )}

      {elegido && material === undefined && <Cargando texto="Cargando el material…" />}

      {elegido && material && (
        <>
          <div className="mev-material">
            <strong>{material.titulo}</strong>
            <span className="mev-sub">
              {material.tipo === 'tema'
                ? `Tema del temario · ${material.unidad}`
                : deck ? `Diapositivas de tu biblioteca · ${deck.slides.length}` : 'De tu biblioteca'}
            </span>
            {deck && (
              <span className="mev-sub">Al proyectarlas, pasalas con los botones o con las flechas del teclado.</span>
            )}
          </div>

          <div className="mev-acciones">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProyectando(true)}>
              <MonitorPlay size={14} aria-hidden="true" /> Proyectar
            </button>
            <button type="button" className={`btn btn-sm ${session.materialVisible ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={session.materialVisible} onClick={alternarVisible}
              title="Los estudiantes del curso lo pueden abrir en el celular mientras dure la clase">
              {session.materialVisible ? <Check size={14} aria-hidden="true" /> : <Smartphone size={14} aria-hidden="true" />}
              {session.materialVisible ? 'Lo ven en los celulares' : 'Mostrar en los celulares'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={generarPreguntas}
              disabled={!puedePreguntar || generando}
              title={puedePreguntar ? 'La IA arma preguntas sobre este material' : 'Este material no tiene texto suficiente para sacar preguntas'}>
              {generando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {generando ? 'Armando preguntas…' : preguntas ? 'Otras preguntas' : 'Preguntas con IA'}
            </button>
          </div>

          {!puedePreguntar && (
            <p className="mev-nota">
              {material.tipo === 'tema'
                ? 'Este tema tiene solo el título: para sacar preguntas hace falta el contenido de la clase.'
                : 'Este material no tiene texto: leelo primero en la Biblioteca con "Leer texto".'}
            </p>
          )}
          {session.materialVisible && (
            <p className="mev-nota">Los estudiantes lo ven solo mientras dure esta clase. Al terminarla, deja de estar disponible.</p>
          )}

          {preguntas && preguntas.length > 0 && (
            <ol className="mev-preguntas">
              {preguntas.map(q => (
                <li key={q.id} className="mev-pregunta">
                  <div className="mev-pregunta-texto">
                    <span>{q.prompt}</span>
                    {q.type === 'multiple_choice' && q.options && (
                      <ul className="mev-opciones">
                        {q.options.map((o, i) => (
                          <li key={i} className={i === (q.correct_index ?? -1) ? 'ok' : ''}>
                            {o}{i === (q.correct_index ?? -1) && <span className="sr-only"> (correcta)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => lanzarPregunta(q)}
                    aria-label={`Lanzar: ${q.prompt}`}>
                    {lanzadas.has(q.id) ? <Check size={14} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                    {lanzadas.has(q.id) ? 'Lanzada' : 'Lanzar'}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <ElegirMaterial
        abierto={eligiendo}
        alCerrar={() => setEligiendo(false)}
        teacherId={session.teacherId}
        subjectId={session.subjectId}
        courseId={session.courseId}
        actual={elegido}
        alElegir={elegir}
      />

      {proyectando && material && (
        <MaterialViewer material={materialParaVisor(material)} onClose={() => setProyectando(false)} proyectar />
      )}
    </section>
  );
}
