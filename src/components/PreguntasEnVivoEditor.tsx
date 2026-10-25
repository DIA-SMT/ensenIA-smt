/**
 * Preguntas para la clase en vivo (068), en "Preparar la clase": se arman
 * acá con tiempo y en el aula se lanzan con un toque. También se pueden
 * sumar las de las actividades del tema.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Radio, Pencil, Trash2, Check, X } from 'lucide-react';
import {
  borrarPregunta, crearPregunta, editarPregunta, getPreguntasDeTemas, sugerenciasDeActividades,
  type PreguntaEnVivo, type TipoPreparada,
} from '../services/preguntas-en-vivo.service';
import { LIVE_KIND_META, type LiveActivityConfig } from '../services/live.service';
import { useSenial } from '../lib/useSenial';
import { avisar, confirmar } from './ui/avisar';
import type { Activity } from '../types';
import './PreguntasEnVivoEditor.css';

const TIPOS: TipoPreparada[] = ['quiz', 'encuesta', 'nube', 'texto'];
const LETRAS = 'abcdef';
const conOpciones = (k: TipoPreparada) => k === 'quiz' || k === 'encuesta' || k === 'chips';

interface Borrador { id: string | null; kind: TipoPreparada; pregunta: string; opciones: string[]; correcta: number | null }

const vacio = (): Borrador => ({ id: null, kind: 'quiz', pregunta: '', opciones: ['', ''], correcta: null });

function aConfig(b: Borrador): LiveActivityConfig {
  if (!conOpciones(b.kind)) return { question: b.pregunta.trim() };
  const opciones = b.opciones.map(o => o.trim()).filter(Boolean).map((label, i) => ({ id: LETRAS[i], label }));
  return {
    question: b.pregunta.trim(),
    options: opciones,
    ...(b.kind === 'quiz' && b.correcta != null ? { correctId: LETRAS[b.correcta] } : {}),
  };
}

function desdePregunta(p: PreguntaEnVivo): Borrador {
  const opciones = (p.config.options ?? []).map(o => o.label);
  const i = (p.config.options ?? []).findIndex(o => o.id === p.config.correctId);
  return { id: p.id, kind: p.kind, pregunta: p.config.question ?? '', opciones: opciones.length ? opciones : ['', ''], correcta: i >= 0 ? i : null };
}

export default function PreguntasEnVivoEditor({ classId, actividades }: { classId: string; actividades: Activity[] }) {
  const senial = useSenial();
  const [lista, setLista] = useState<PreguntaEnVivo[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verSugeridas, setVerSugeridas] = useState(false);

  useEffect(() => {
    setFallo(false);
    getPreguntasDeTemas([classId]).then(setLista).catch(() => { setLista(null); setFallo(true); });
  }, [classId]);

  // Las de las actividades que todavía no se sumaron (misma pregunta)
  const sugeridas = useMemo(() => {
    const ya = new Set((lista ?? []).map(p => (p.config.question ?? '').trim().toLowerCase()));
    return sugerenciasDeActividades(actividades, classId).filter(s => !ya.has((s.config.question ?? '').trim().toLowerCase()));
  }, [actividades, classId, lista]);

  const opcionesValidas = borrador ? borrador.opciones.map(o => o.trim()).filter(Boolean) : [];
  const listo = !!borrador && borrador.pregunta.trim().length > 0 && borrador.pregunta.trim().length <= 200
    && (!conOpciones(borrador.kind) || (opcionesValidas.length >= 2
      && (borrador.kind !== 'quiz' || (borrador.correcta != null && !!borrador.opciones[borrador.correcta]?.trim()))));

  const guardar = async () => {
    if (!borrador || !listo || guardando) return;
    // La correcta, contando solo las opciones con texto
    const limpio = conOpciones(borrador.kind) && borrador.correcta != null
      ? { ...borrador, correcta: borrador.opciones.slice(0, borrador.correcta).filter(o => o.trim()).length }
      : borrador;
    setGuardando(true);
    try {
      const config = aConfig({ ...limpio, opciones: limpio.opciones.filter(o => o.trim()) });
      if (borrador.id) {
        await editarPregunta(borrador.id, borrador.kind, config);
        setLista(prev => (prev ?? []).map(p => (p.id === borrador.id ? { ...p, kind: borrador.kind, config } : p)));
      } else {
        const nueva = await crearPregunta(classId, borrador.kind, config, (lista?.length ?? 0) + 1);
        setLista(prev => [...(prev ?? []), nueva]);
      }
      setBorrador(null);
    } catch (err) {
      avisar.error('No se pudo guardar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const sumarSugerida = async (kind: TipoPreparada, config: LiveActivityConfig) => {
    try {
      const nueva = await crearPregunta(classId, kind, config, (lista?.length ?? 0) + 1);
      setLista(prev => [...(prev ?? []), nueva]);
    } catch (err) {
      avisar.error('No se pudo sumar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    }
  };

  const borrar = async (p: PreguntaEnVivo) => {
    if (!(await confirmar({ titulo: '¿Borrar esta pregunta?', mensaje: p.config.question, accion: 'Borrar', peligro: true }))) return;
    try {
      await borrarPregunta(p.id);
      setLista(prev => (prev ?? []).filter(x => x.id !== p.id));
    } catch (err) {
      avisar.error('No se pudo borrar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    }
  };

  return (
    <div className="pev">
      {fallo && <p className="tp-vacio" role="status">No se pudieron traer las preguntas{senial ? '. Probá de nuevo en un rato.' : ': hace falta señal.'}</p>}
      {lista !== null && lista.length === 0 && !borrador && (
        <p className="tp-vacio">Armalas ahora y en el aula las lanzás con un toque, sin escribir nada en el celular.</p>
      )}
      {lista !== null && lista.length > 0 && (
        <ol className="pev-lista">
          {lista.map(p => (
            <li key={p.id}>
              <span className="pev-tipo" title={LIVE_KIND_META[p.kind].label} aria-label={LIVE_KIND_META[p.kind].label}>{LIVE_KIND_META[p.kind].emoji}</span>
              <span className="pev-texto">
                <strong>{p.config.question}</strong>
                {p.config.options && (
                  <small>
                    {p.config.options.map(o => (o.id === p.config.correctId ? `✓ ${o.label}` : o.label)).join(' · ')}
                  </small>
                )}
              </span>
              <button type="button" className="btn-icon" aria-label="Editar la pregunta" onClick={() => setBorrador(desdePregunta(p))} disabled={!senial}><Pencil size={14} /></button>
              <button type="button" className="btn-icon" aria-label="Borrar la pregunta" onClick={() => borrar(p)} disabled={!senial}><Trash2 size={14} /></button>
            </li>
          ))}
        </ol>
      )}

      {borrador && (
        <div className="pev-form">
          <div className="pev-tipos" role="radiogroup" aria-label="Tipo de pregunta">
            {TIPOS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={borrador.kind === k}
                className={`pev-chip ${borrador.kind === k ? 'elegido' : ''}`}
                onClick={() => setBorrador({ ...borrador, kind: k, correcta: k === 'quiz' ? borrador.correcta : null })}>
                <span aria-hidden="true">{LIVE_KIND_META[k].emoji}</span> {LIVE_KIND_META[k].label}
              </button>
            ))}
          </div>
          <label className="pev-campo">
            <span>Pregunta</span>
            <input type="text" maxLength={200} value={borrador.pregunta} autoFocus
              onChange={e => setBorrador({ ...borrador, pregunta: e.target.value })}
              placeholder={borrador.kind === 'nube' ? 'Ej: Una palabra que asocies con fracción' : 'Ej: ¿Cuál es equivalente a 1/2?'} />
          </label>
          {conOpciones(borrador.kind) && (
            <fieldset className="pev-opciones">
              <legend>{borrador.kind === 'quiz' ? 'Opciones (tocá el círculo de la correcta)' : 'Opciones'}</legend>
              {borrador.opciones.map((o, i) => (
                <div key={i} className="pev-opcion">
                  {borrador.kind === 'quiz' && (
                    <button type="button" className={`pev-correcta ${borrador.correcta === i ? 'si' : ''}`}
                      aria-label={`Marcar la opción ${i + 1} como correcta`} aria-pressed={borrador.correcta === i}
                      onClick={() => setBorrador({ ...borrador, correcta: i })}>
                      {borrador.correcta === i && <Check size={13} aria-hidden="true" />}
                    </button>
                  )}
                  <input type="text" maxLength={80} value={o} aria-label={`Opción ${i + 1}`}
                    onChange={e => setBorrador({ ...borrador, opciones: borrador.opciones.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {borrador.opciones.length > 2 && (
                    <button type="button" className="btn-icon" aria-label={`Quitar la opción ${i + 1}`}
                      onClick={() => setBorrador({
                        ...borrador,
                        opciones: borrador.opciones.filter((_, j) => j !== i),
                        correcta: borrador.correcta === i ? null : borrador.correcta != null && borrador.correcta > i ? borrador.correcta - 1 : borrador.correcta,
                      })}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {borrador.opciones.length < 6 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrador({ ...borrador, opciones: [...borrador.opciones, ''] })}>
                  <Plus size={13} aria-hidden="true" /> Otra opción
                </button>
              )}
            </fieldset>
          )}
          <div className="pev-acciones">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setBorrador(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar} disabled={!listo || guardando || !senial}>
              {guardando ? 'Guardando…' : 'Guardar pregunta'}
            </button>
          </div>
        </div>
      )}

      {!borrador && (
        <div className="tp-acciones">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setBorrador(vacio())} disabled={!senial || lista === null}>
            <Plus size={14} aria-hidden="true" /> Nueva pregunta
          </button>
          {sugeridas.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerSugeridas(v => !v)} aria-expanded={verSugeridas}>
              Sumar de las actividades ({sugeridas.length})
            </button>
          )}
          <Link to={`/clase-en-vivo?tema=${classId}`} className="btn btn-primary btn-sm">
            <Radio size={14} aria-hidden="true" /> Dar esta clase en vivo
          </Link>
        </div>
      )}

      {verSugeridas && !borrador && sugeridas.length > 0 && (
        <ul className="pev-sugeridas">
          {sugeridas.map(s => (
            <li key={s.clave}>
              <span className="pev-tipo" aria-hidden="true">{LIVE_KIND_META[s.kind].emoji}</span>
              <span className="pev-texto">
                <strong>{s.config.question}</strong>
                <small>{s.origen}</small>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => sumarSugerida(s.kind, s.config)} disabled={!senial}>Sumar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
