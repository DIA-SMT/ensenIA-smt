/**
 * Las preguntas preparadas en el panel de la clase en vivo (068): las de los
 * temas de esta clase (el que está en pantalla y los de la lista de
 * materiales), listas para lanzar con un toque. Abajo, plegadas, las que
 * salen de las actividades del tema.
 */

import { useEffect, useState } from 'react';
import { ListChecks, Send, Check } from 'lucide-react';
import {
  getPreguntasDeTemas, marcarLanzada, sugerenciasDeActividades,
  type PreguntaEnVivo, type PreguntaSugerida,
} from '../services/preguntas-en-vivo.service';
import { getMaterialesDeClase, LIVE_KIND_META, type LiveActivityConfig, type LiveActivityKind, type LiveSession } from '../services/live.service';
import { getActivitiesByClass } from '../services/activities.service';
import './PreguntasPreparadasVivo.css';

interface Props {
  session: Pick<LiveSession, 'id' | 'classId' | 'createdAt'>;
  /** Lanza la pregunta (con el destinatario o los grupos que estén elegidos en el panel) */
  lanzar: (kind: LiveActivityKind, config: LiveActivityConfig, classId: string) => Promise<void>;
  ocupado: boolean;
}

export default function PreguntasPreparadasVivo({ session, lanzar, ocupado }: Props) {
  const [temas, setTemas] = useState<string[]>([]);
  const [preguntas, setPreguntas] = useState<PreguntaEnVivo[]>([]);
  const [sugeridas, setSugeridas] = useState<PreguntaSugerida[]>([]);
  const [lanzando, setLanzando] = useState<string | null>(null);

  // Los temas de la clase: el que está en pantalla y los de la lista
  useEffect(() => {
    let vivo = true;
    getMaterialesDeClase(session.id)
      .catch(() => [])
      .then(lista => {
        if (!vivo) return;
        const ids = [...new Set([session.classId, ...lista.map(m => m.classId)].filter((x): x is string => !!x))];
        setTemas(prev => (prev.join() === ids.join() ? prev : ids));
      });
    return () => { vivo = false; };
  }, [session.id, session.classId]);

  useEffect(() => {
    if (temas.length === 0) { setPreguntas([]); setSugeridas([]); return; }
    let vivo = true;
    getPreguntasDeTemas(temas).then(l => { if (vivo) setPreguntas(l); }).catch(console.error);
    Promise.all(temas.map(id => getActivitiesByClass(id).then(a => sugerenciasDeActividades(a, id)).catch(() => [])))
      .then(l => { if (vivo) setSugeridas(l.flat()); });
    return () => { vivo = false; };
  }, [temas]);

  if (temas.length === 0 || (preguntas.length === 0 && sugeridas.length === 0)) return null;

  const yaEnEstaClase = (p: PreguntaEnVivo) => !!p.lanzadaAt && p.lanzadaAt >= session.createdAt;
  // Las sugeridas que ya están guardadas como preparadas no se repiten
  const guardadas = new Set(preguntas.map(p => (p.config.question ?? '').trim().toLowerCase()));
  const otras = sugeridas.filter(s => !guardadas.has((s.config.question ?? '').trim().toLowerCase()));

  const disparar = async (clave: string, kind: LiveActivityKind, config: LiveActivityConfig, classId: string, pregunta?: PreguntaEnVivo) => {
    if (lanzando || ocupado) return;
    setLanzando(clave);
    try {
      await lanzar(kind, config, classId);
      if (pregunta) {
        const ahora = new Date().toISOString();
        setPreguntas(prev => prev.map(p => (p.id === pregunta.id ? { ...p, lanzadaAt: ahora } : p)));
        void marcarLanzada(pregunta.id);
      }
    } finally {
      setLanzando(null);
    }
  };

  const fila = (clave: string, kind: LiveActivityKind, config: LiveActivityConfig, classId: string, extra: { lanzada?: boolean; origen?: string; pregunta?: PreguntaEnVivo }) => (
    <li key={clave} className={extra.lanzada ? 'lanzada' : ''}>
      <span className="ppv-tipo" title={LIVE_KIND_META[kind].label} aria-label={LIVE_KIND_META[kind].label}>{LIVE_KIND_META[kind].emoji}</span>
      <span className="ppv-texto">
        <strong>{config.question}</strong>
        {extra.origen && <small>{extra.origen}</small>}
        {extra.lanzada && <small className="ppv-ya"><Check size={12} aria-hidden="true" /> Ya la lanzaste</small>}
      </span>
      <button type="button" className={`btn btn-sm ${extra.lanzada ? 'btn-outline' : 'btn-primary'}`}
        disabled={ocupado || lanzando !== null}
        onClick={() => disparar(clave, kind, config, classId, extra.pregunta)}>
        <Send size={13} aria-hidden="true" /> {lanzando === clave ? 'Lanzando…' : extra.lanzada ? 'Otra vez' : 'Lanzar'}
      </button>
    </li>
  );

  return (
    <section className="card ppv" aria-labelledby="ppv-titulo">
      <h4 id="ppv-titulo"><ListChecks size={15} aria-hidden="true" /> Preguntas preparadas</h4>
      {preguntas.length > 0 && (
        <ol className="ppv-lista">
          {preguntas.map(p => fila(p.id, p.kind, p.config, p.classId, { lanzada: yaEnEstaClase(p), pregunta: p }))}
        </ol>
      )}
      {otras.length > 0 && (
        <details className="ppv-mas" open={preguntas.length === 0}>
          <summary>De las actividades del tema ({otras.length})</summary>
          <ol className="ppv-lista">
            {otras.map(s => fila(s.clave, s.kind, s.config, s.classId, { origen: s.origen }))}
          </ol>
        </details>
      )}
    </section>
  );
}
