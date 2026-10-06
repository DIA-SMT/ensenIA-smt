/**
 * "Material de la clase" en el panel de la clase en vivo (docente).
 *
 * Lo que hace el docente con el material mientras da la clase: elegir uno
 * o varios (049) y pasar de uno a otro con un toque; el que está en
 * pantalla se proyecta, se muestra en los celulares (solo mientras dure la
 * clase) y de él salen las preguntas con IA para lanzarlas con un toque.
 */

import { useEffect, useState } from 'react';
import {
  BookOpen, MonitorPlay, Smartphone, Sparkles, Loader2, Send, ListPlus, Check,
} from 'lucide-react';
import {
  getLiveClassMaterial, setLiveMaterial, setMaterialVisible, textoDeMaterial, materialParaVisor,
  getMaterialesDeClase, sincronizarMaterialesDeClase, idEnLista,
  type LiveSession, type LiveActivityKind, type LiveActivityConfig, type MaterialDeClase,
  type MaterialEnLista, type EleccionMaterial,
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
  // Los materiales de la clase, en orden (049). Vacía si la clase tiene uno solo de antes.
  const [lista, setLista] = useState<MaterialEnLista[]>([]);
  const [cambiando, setCambiando] = useState(false);

  /** El que está en pantalla ahora */
  const elegido = session.materialId ?? session.classId;

  const recargarLista = () => getMaterialesDeClase(session.id).then(setLista).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void recargarLista(); }, [session.id, elegido]);

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

  /** Lo que la clase tiene, como lo espera el selector (si es de antes de la 049, el único). */
  const elegidos: EleccionMaterial[] = lista.length > 0
    ? lista.map(m => (m.materialId ? { materialId: m.materialId, titulo: m.titulo } : { classId: m.classId!, titulo: m.titulo }))
    : elegido && material
      ? [session.materialId ? { materialId: session.materialId, titulo: material.titulo } : { classId: session.classId!, titulo: material.titulo }]
      : [];

  const ponerEnPantalla = (e: EleccionMaterial | null) => {
    onSession({
      ...session,
      materialId: e && 'materialId' in e ? e.materialId : null,
      classId: e && 'classId' in e ? e.classId : null,
      materialVisible: e ? session.materialVisible : false,
    });
    setPreguntas(null);
    setLanzadas(new Set());
  };

  /** Lo que eligió en el selector: la lista nueva, con su orden. */
  const confirmarLista = async (deseados: EleccionMaterial[]) => {
    setEligiendo(false);
    setError('');
    try {
      const enPantalla = await sincronizarMaterialesDeClase(session.id, deseados, elegido);
      const idNuevo = enPantalla ? ('materialId' in enPantalla ? enPantalla.materialId : enPantalla.classId) : null;
      if (idNuevo !== elegido) ponerEnPantalla(enPantalla);
      await recargarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el material.');
    }
  };

  /** Un toque en la lista: ese pasa a estar en pantalla. */
  const cambiarA = async (m: MaterialEnLista) => {
    if (idEnLista(m) === elegido || cambiando) return;
    setCambiando(true);
    setError('');
    try {
      const e: EleccionMaterial = m.materialId ? { materialId: m.materialId, titulo: m.titulo } : { classId: m.classId!, titulo: m.titulo };
      await setLiveMaterial(session.id, m.materialId ? { materialId: m.materialId } : { classId: m.classId! });
      ponerEnPantalla(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el material.');
    } finally {
      setCambiando(false);
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
        <h4 id="mev-titulo"><BookOpen size={16} aria-hidden="true" /> {lista.length > 1 ? 'Materiales de la clase' : 'Material de la clase'}</h4>
        {elegido && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEligiendo(true)}>
            <ListPlus size={14} aria-hidden="true" /> Agregar o quitar
          </button>
        )}
      </div>

      {/* Varios: un toque y pasa a estar en pantalla */}
      {lista.length > 1 && (
        <div className="mev-lista" role="group" aria-label="Elegí cuál está en pantalla">
          {lista.map((m, i) => {
            const on = idEnLista(m) === elegido;
            return (
              <button key={m.id} type="button" className={`mev-item ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => cambiarA(m)} disabled={cambiando && !on}
                title={on ? 'Es el que está en pantalla' : 'Ponerlo en pantalla'}>
                <span className="mev-item-n" aria-hidden="true">{i + 1}</span>
                <span className="mev-item-texto">
                  <strong>{m.titulo}</strong>
                  <span>{on ? 'En pantalla' : m.detalle}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!elegido && (
        <EstadoVacio
          compacto
          icono={BookOpen}
          titulo="Todavía no elegiste material"
          texto="Elegí uno o varios temas de tu temario o materiales de tu biblioteca: los proyectás, los ven en los celulares y la IA saca preguntas para lanzar."
          accion={{ etiqueta: 'Elegir materiales', alTocar: () => setEligiendo(true), icono: BookOpen }}
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
        elegidos={elegidos}
        alConfirmar={confirmarLista}
      />

      {proyectando && material && (
        <MaterialViewer material={materialParaVisor(material)} onClose={() => setProyectando(false)} proyectar />
      )}
    </section>
  );
}
