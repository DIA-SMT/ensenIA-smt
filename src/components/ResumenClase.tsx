/**
 * Resumen de una clase en vivo (docente): se abre al terminarla y desde
 * "Clases anteriores". Qué se vio, quiénes participaron, cómo le fue al
 * curso en cada pregunta, el ambiente y las medallas. Y un informe escrito
 * por la IA a partir de esos números, que queda guardado en la clase.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, Loader2, Copy, Check, Users, ClipboardList, Medal, Clock } from 'lucide-react';
import {
  getLiveSessionSummary, saveLiveSessionReport, LIVE_KIND_META, LIVE_REACTIONS, type ResumenClase as Datos,
} from '../services/live.service';
import { classReport } from '../services/documents.service';
import MarkdownRenderer from './MarkdownRenderer';
import { AWARD_META, FEELING_META, type CheckinFeeling } from '../types';
import './ResumenClase.css';

const pct = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) : 0);

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Los números de la clase en texto, para que la IA escriba el informe. */
function datosParaInforme(d: Datos): string {
  const t = d.totales;
  const l: string[] = [];
  l.push(`Clase: ${d.sesion.titulo}. Duración: ${d.sesion.minutos} minutos.`);
  if (d.material) l.push(`Material: ${d.material.titulo}${d.material.unidad ? ` (${d.material.unidad})` : ''}.`);
  l.push(`Estudiantes del curso: ${t.curso}. Se conectaron: ${t.conectados}. Participaron (respondieron algo): ${t.participaron}.`);
  if (t.invitados) l.push(`Invitados sin cuenta: ${t.invitados}.`);
  l.push('', 'Actividades:');
  if (d.actividades.length === 0) l.push('- No se lanzaron actividades.');
  for (const a of d.actividades) {
    const tipo = LIVE_KIND_META[a.tipo]?.label ?? a.tipo;
    let x = `- ${tipo}${a.pregunta ? `: "${a.pregunta}"` : ''}. Respondieron ${a.respondieron}.`;
    if (a.aciertos != null) x += ` Acertaron ${a.aciertos}${a.correcta ? ` (correcta: "${a.correcta}")` : ''}.`;
    if (a.dirigida) x += ' (pregunta para un solo estudiante)';
    if (a.grupal) x += ' (por grupos)';
    l.push(x);
  }
  l.push('', 'Por estudiante:');
  for (const s of d.alumnos) {
    l.push(`- ${s.nombre}: ${s.conectado ? 'conectado' : 'no se conectó'}, ${s.respuestas} respuestas` +
      (s.preguntas ? `, ${s.aciertos}/${s.preguntas} aciertos` : '') +
      (s.medallas ? `, ${s.medallas} medalla(s)` : '') + '.');
  }
  if (d.animo.length) {
    l.push('', `Check-in de ánimo: ${d.animo.map(a => `${FEELING_META[a.estado as CheckinFeeling]?.label ?? a.estado} ${a.n}`).join(', ')}.`);
  }
  if (d.reacciones.length) {
    l.push(`Emojis: ${d.reacciones.map(r => `${r.emoji} (${LIVE_REACTIONS.find(x => x.emoji === r.emoji)?.label ?? ''}) ${r.n}`).join(', ')}.`);
  }
  if (d.medallas.length) {
    l.push(`Medallas dadas: ${d.medallas.map(m => `${AWARD_META[m.medalla]?.label ?? m.medalla} ${m.n}`).join(', ')}.`);
  }
  return l.join('\n');
}

export default function ResumenClase({ sessionId, onVolver }: { sessionId: string; onVolver: () => void }) {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [informe, setInforme] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorInforme, setErrorInforme] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getLiveSessionSummary(sessionId)
      .then(d => { if (cancelado) return; setDatos(d); setInforme(d?.sesion.ai_summary ?? null); })
      .catch(err => { if (!cancelado) { setDatos(null); setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen.'); } });
    return () => { cancelado = true; };
  }, [sessionId]);

  const generar = async () => {
    if (!datos || generando) return;
    setGenerando(true);
    setErrorInforme('');
    try {
      const texto = await classReport(datosParaInforme(datos));
      setInforme(texto);
      await saveLiveSessionReport(sessionId, texto).catch(console.error);
    } catch (err) {
      setErrorInforme(err instanceof Error ? err.message : 'No se pudo escribir el informe.');
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    if (!informe) return;
    try {
      await navigator.clipboard.writeText(informe);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin portapapeles */ }
  };

  if (datos === undefined) {
    return <div className="cv-container"><p className="text-secondary">Armando el resumen…</p></div>;
  }
  if (!datos) {
    return (
      <div className="cv-container rc">
        <button type="button" className="btn btn-ghost btn-sm rc-volver" onClick={onVolver}><ArrowLeft size={15} /> Volver</button>
        <p className="text-danger text-sm">{error || 'No se encontró esa clase.'}</p>
      </div>
    );
  }

  const t = datos.totales;
  const noParticiparon = datos.alumnos.filter(a => a.respuestas === 0);

  return (
    <div className="cv-container rc">
      <button type="button" className="btn btn-ghost btn-sm rc-volver" onClick={onVolver}>
        <ArrowLeft size={15} aria-hidden="true" /> Volver a Clase en vivo
      </button>

      <header className="card rc-head">
        <span className="rc-etiqueta">Resumen de la clase</span>
        <h2>{datos.sesion.titulo}</h2>
        <p className="text-secondary text-sm">
          <Clock size={13} aria-hidden="true" /> {fecha(datos.sesion.inicio)} · {datos.sesion.minutos} min
        </p>
        {datos.material && (
          <p className="text-sm rc-material">
            📖 {datos.material.titulo}{datos.material.unidad ? ` · ${datos.material.unidad}` : ''}
          </p>
        )}
      </header>

      <section className="rc-tiles" aria-label="En números">
        <div className="card rc-tile">
          <span className="rc-tile-label"><Users size={14} aria-hidden="true" /> Participaron</span>
          <strong>{t.participaron}/{t.curso}</strong>
          <span className="rc-tile-sub">{pct(t.participaron, t.curso)}% del curso</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label">Se conectaron</span>
          <strong>{t.conectados}/{t.curso}</strong>
          <span className="rc-tile-sub">{t.invitados ? `+ ${t.invitados} invitado${t.invitados !== 1 ? 's' : ''}` : 'en sus celulares'}</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label"><ClipboardList size={14} aria-hidden="true" /> Actividades</span>
          <strong>{t.actividades}</strong>
          <span className="rc-tile-sub">lanzadas</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label"><Medal size={14} aria-hidden="true" /> Medallas</span>
          <strong>{t.medallas}</strong>
          <span className="rc-tile-sub">{datos.medallas.map(m => AWARD_META[m.medalla]?.emoji ?? '🏅').join(' ') || 'ninguna'}</span>
        </div>
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-informe">
        <div className="rc-bloque-head">
          <h3 id="rc-informe"><Sparkles size={16} aria-hidden="true" /> Informe de la clase</h3>
          <div className="rc-acciones">
            {informe && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}>
                {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={generar} disabled={generando}>
              {generando ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {generando ? 'Escribiendo…' : informe ? 'Volver a escribir' : 'Escribir con IA'}
            </button>
          </div>
        </div>
        {informe
          ? <div className="rc-informe"><MarkdownRenderer content={informe} /></div>
          : !generando && <p className="text-secondary text-sm">La IA arma un informe corto con lo que se vio, la participación, qué quedó claro y qué retomar, el ambiente y sugerencias para la próxima clase. Usa solo estos datos.</p>}
        {errorInforme && <p className="text-sm text-danger" role="alert">{errorInforme}</p>}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-ambiente">
        <h3 id="rc-ambiente">Ambiente</h3>
        {datos.animo.length === 0 && datos.reacciones.length === 0 && (
          <p className="text-secondary text-sm">No hubo check-in ni emojis en esta clase.</p>
        )}
        {datos.animo.length > 0 && (
          <div className="rc-chips" aria-label="Cómo venían (check-in)">
            {datos.animo.map(a => {
              const m = FEELING_META[a.estado as CheckinFeeling];
              return <span key={a.estado} className="rc-chip">{m?.emoji ?? '•'} {m?.label ?? a.estado} <strong>{a.n}</strong></span>;
            })}
          </div>
        )}
        {datos.reacciones.length > 0 && (
          <div className="rc-chips" aria-label="Emojis">
            {datos.reacciones.map(r => {
              const m = LIVE_REACTIONS.find(x => x.emoji === r.emoji);
              return <span key={r.emoji} className={`rc-chip ${m?.alert ? 'alerta' : ''}`}>{r.emoji} {m?.label ?? ''} <strong>{r.n}</strong></span>;
            })}
          </div>
        )}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-actividades">
        <h3 id="rc-actividades">Actividades</h3>
        {datos.actividades.length === 0 ? (
          <p className="text-secondary text-sm">No se lanzaron actividades.</p>
        ) : (
          <ol className="rc-actividades">
            {datos.actividades.map(a => (
              <li key={a.orden}>
                <span className="rc-act-tipo">{LIVE_KIND_META[a.tipo]?.emoji} {LIVE_KIND_META[a.tipo]?.label}</span>
                {a.pregunta && <span className="rc-act-pregunta">{a.pregunta}</span>}
                <span className="rc-act-datos">
                  {a.respondieron} respondi{a.respondieron === 1 ? 'ó' : 'eron'}
                  {a.aciertos != null && <> · <strong>{a.aciertos} acert{a.aciertos === 1 ? 'ó' : 'aron'}</strong> ({pct(a.aciertos, a.respondieron)}%)</>}
                  {a.correcta && <> · correcta: “{a.correcta}”</>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-alumnos">
        <h3 id="rc-alumnos">Estudiantes</h3>
        {noParticiparon.length > 0 && datos.alumnos.length > 0 && (
          <p className="rc-nota">
            <strong>No participaron ({noParticiparon.length}):</strong> {noParticiparon.map(a => a.nombre).join(', ')}.
          </p>
        )}
        {datos.alumnos.length === 0 ? (
          <p className="text-secondary text-sm">El curso todavía no tiene estudiantes.</p>
        ) : (
          <div className="rc-tabla-wrap">
            <table className="rc-tabla">
              <thead><tr><th>Estudiante</th><th>Conectado</th><th>Respuestas</th><th>Aciertos</th><th>Medallas</th></tr></thead>
              <tbody>
                {datos.alumnos.map(a => (
                  <tr key={a.id} className={a.respuestas === 0 ? 'rc-sin' : ''}>
                    <td>{a.nombre}</td>
                    <td>{a.conectado ? 'Sí' : 'No'}</td>
                    <td>{a.respuestas}</td>
                    <td>{a.preguntas ? `${a.aciertos}/${a.preguntas}` : '—'}</td>
                    <td>{a.medallas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
