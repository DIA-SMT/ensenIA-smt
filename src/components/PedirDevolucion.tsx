/**
 * "¿Te sirvió?": la devolución anónima del estudiante sobre una tarea o una
 * clase (058). Tres caras y, si quiere, un comentario.
 *
 * Es anónima de verdad: el docente y la dirección ven totales y comentarios
 * sin nombre, y solo con 5 respuestas o más. Lo que se le promete al chico
 * acá es exactamente eso, ni más ni menos.
 *
 * Si el comentario suena a que la está pasando mal, la base no lo guarda
 * entre los anónimos: avisa a la escuela (sin nombre) y acá se le ofrece
 * hablar con alguien.
 */

import { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { darDevolucion, yaDioDevolucion, type OrigenDevolucion } from '../services/devolucion.service';
import HablarConDocente from './HablarConDocente';
import './PedirDevolucion.css';

const CARAS: { valor: 1 | 2 | 3; emoji: string; texto: string }[] = [
  { valor: 1, emoji: '😕', texto: 'No me sirvió' },
  { valor: 2, emoji: '🙂', texto: 'Más o menos' },
  { valor: 3, emoji: '😃', texto: 'Me sirvió mucho' },
];

export default function PedirDevolucion({ origen, refId, pregunta }: {
  origen: OrigenDevolucion;
  refId: string;
  /** "¿Te sirvió esta tarea?", "¿Te sirvió la clase?" */
  pregunta: string;
}) {
  const [estado, setEstado] = useState<'cargando' | 'pidiendo' | 'gracias' | 'riesgo' | 'ya'>('cargando');
  const [valor, setValor] = useState<1 | 2 | 3 | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    yaDioDevolucion(origen, refId)
      .then(ya => { if (vivo) setEstado(ya ? 'ya' : 'pidiendo'); })
      .catch(() => { if (vivo) setEstado('pidiendo'); });
    return () => { vivo = false; };
  }, [origen, refId]);

  const enviar = async (conComentario: boolean) => {
    if (!valor || enviando) return;
    setEnviando(true);
    setError('');
    try {
      const { riesgo } = await darDevolucion(origen, refId, valor, conComentario ? comentario : undefined);
      setEstado(riesgo ? 'riesgo' : 'gracias');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar tu respuesta.');
    } finally {
      setEnviando(false);
    }
  };

  if (estado === 'cargando' || estado === 'ya') return null;

  if (estado === 'gracias') {
    return <p className="card pd pd-gracias" role="status">¡Gracias! Tu opinión ayuda a que las clases sean mejores. 💙</p>;
  }

  if (estado === 'riesgo') {
    return (
      <div className="card pd pd-riesgo" role="status">
        <p>
          <strong>Lo que escribiste suena a que la estás pasando mal.</strong> Le avisamos a la escuela, sin tu
          nombre, que alguien del curso puede necesitar ayuda. Pero como es anónimo, nadie sabe que fuiste vos:
          si querés que te ayuden a vos, contale a alguien de la escuela.
        </p>
        <HablarConDocente />
      </div>
    );
  }

  return (
    <div className="card pd">
      <p className="pd-pregunta">{pregunta}</p>
      <div className="pd-caras" role="group" aria-label={pregunta}>
        {CARAS.map(c => (
          <button
            key={c.valor}
            className={`pd-cara ${valor === c.valor ? 'elegida' : ''}`}
            aria-pressed={valor === c.valor}
            onClick={() => setValor(c.valor)}
            disabled={enviando}
          >
            <span className="pd-emoji" aria-hidden="true">{c.emoji}</span>
            <span>{c.texto}</span>
          </button>
        ))}
      </div>

      {valor && (
        <div className="pd-comentario">
          <label htmlFor={`pd-${refId}`}>¿Querés contar algo más? (opcional)</label>
          <textarea
            id={`pd-${refId}`}
            rows={2}
            maxLength={300}
            value={comentario}
            placeholder={valor === 3 ? 'Qué estuvo bueno…' : 'Qué cambiarías, qué no se entendió…'}
            onChange={e => setComentario(e.target.value)}
          />
          <div className="pd-acciones">
            <button className="btn btn-primary btn-sm" onClick={() => enviar(true)} disabled={enviando}>
              {enviando && <Loader2 size={14} className="girando" />} Enviar
            </button>
          </div>
          {error && <p className="pd-error" role="alert">{error}</p>}
        </div>
      )}

      <p className="pd-anonimo">
        <Lock size={12} aria-hidden="true" /> Es anónimo: tu docente y la escuela ven el total de respuestas y los
        comentarios, nunca tu nombre.
      </p>
    </div>
  );
}
