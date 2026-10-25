/**
 * "Acompañamiento" en Mi perfil (081): las observaciones de clase que la
 * dirección compartió con el docente. Las ve completas, marca "Me notifiqué"
 * y puede responder. Los borradores no llegan (la base no los devuelve).
 * Sin observaciones, la sección no aparece.
 */

import { useEffect, useState } from 'react';
import { ClipboardCheck, CheckCircle2, Loader2, MessageSquareReply } from 'lucide-react';
import {
  DIMENSIONES, ETIQUETA_VALOR, fechaLarga, getMisObservaciones, notificarme, responderObservacion, type Observacion,
} from '../services/acompanamiento.service';
import { avisar } from './ui/avisar';
import { useSinGuardar } from '../lib/sinGuardar';
import './MisAcompanamientos.css';

function UnaObservacion({ o, alCambiar }: { o: Observacion; alCambiar: (o: Observacion) => void }) {
  const [respuesta, setRespuesta] = useState(o.respuestaDocente ?? '');
  const [respondiendo, setRespondiendo] = useState(!o.respuestaDocente);
  const [enviando, setEnviando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  // Abierta de entrada si es nueva; notificarse no la cierra en la cara
  const [abierta, setAbierta] = useState(!o.notificadoAt);
  useSinGuardar(`acompanamiento-${o.id}`, respondiendo && respuesta.trim() !== (o.respuestaDocente ?? '').trim() && respuesta.trim() !== '');

  const marcar = async () => {
    setMarcando(true);
    try {
      await notificarme(o.id);
      alCambiar({ ...o, notificadoAt: new Date().toISOString() });
    } catch (err) {
      avisar.error('No se pudo marcar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setMarcando(false);
    }
  };

  const enviar = async () => {
    const texto = respuesta.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      await responderObservacion(o.id, texto);
      const ahora = new Date().toISOString();
      alCambiar({ ...o, respuestaDocente: texto, respondidaAt: ahora, notificadoAt: o.notificadoAt ?? ahora });
      setRespondiendo(false);
      avisar.exito('Respuesta enviada', 'La dirección la ve junto a la observación.');
    } catch (err) {
      avisar.error('No se pudo enviar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const marcadas = DIMENSIONES.filter(d => o.pauta[d.clave]?.valor || o.pauta[d.clave]?.nota);

  return (
    <details className="macomp-item" open={abierta} onToggle={e => setAbierta(e.currentTarget.open)}>
      <summary>
        <span className="macomp-titulo">
          <strong>Clase del {fechaLarga(o.fecha)}</strong>
          <small>
            {[o.materia && o.curso ? `${o.materia} — ${o.curso}` : null, o.observadorNombre ? `Observó ${o.observadorNombre}` : null].filter(Boolean).join(' · ')}
          </small>
        </span>
        <span className={`macomp-estado ${o.notificadoAt ? 'visto' : ''}`}>{o.notificadoAt ? 'Te notificaste' : 'Nueva'}</span>
      </summary>

      <div className="macomp-cuerpo">
        {marcadas.length > 0 && (
          <div className="macomp-bloque">
            <h4>Lo que se observó</h4>
            <ul className="macomp-pauta">
              {marcadas.map(d => {
                const it = o.pauta[d.clave];
                return (
                  <li key={d.clave}>
                    <span className="macomp-dim">{d.titulo}</span>
                    {it.valor && <span className={`macomp-valor ${it.valor}`}>{ETIQUETA_VALOR[it.valor]}</span>}
                    {it.nota && <p>{it.nota}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {o.fortalezas && (
          <div className="macomp-bloque">
            <h4>Fortalezas</h4>
            <p className="macomp-texto">{o.fortalezas}</p>
          </div>
        )}
        {o.sugerencias && (
          <div className="macomp-bloque">
            <h4>Sugerencias</h4>
            <p className="macomp-texto">{o.sugerencias}</p>
          </div>
        )}
        {o.acuerdos.length > 0 && (
          <div className="macomp-bloque">
            <h4>Acuerdos</h4>
            <ul className="macomp-acuerdos">
              {o.acuerdos.map((a, i) => (
                <li key={i} className={a.cumplido ? 'cumplido' : ''}>
                  {a.cumplido && <CheckCircle2 size={15} aria-hidden="true" />}
                  <span>{a.texto}</span>
                  <small>{a.cumplido ? 'Cumplido' : 'Pendiente'}</small>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Lo del docente ── */}
        <div className="macomp-bloque macomp-tuyo">
          {!o.notificadoAt && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void marcar()} disabled={marcando}>
              {marcando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />} Me notifiqué
            </button>
          )}
          {o.notificadoAt && <p className="macomp-nota">Te notificaste el {fechaLarga(o.notificadoAt)}.</p>}

          {respondiendo ? (
            <div className="macomp-campo">
              <label htmlFor={`macomp-resp-${o.id}`}><MessageSquareReply size={15} aria-hidden="true" /> Tu respuesta (opcional)</label>
              <textarea id={`macomp-resp-${o.id}`} className="form-textarea" rows={3} maxLength={3000} value={respuesta}
                placeholder="Lo que quieras decir: cómo lo ves, qué necesitás, qué vas a probar"
                onChange={e => setRespuesta(e.target.value)} />
              <div className="macomp-acciones">
                {o.respuestaDocente && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRespuesta(o.respuestaDocente ?? ''); setRespondiendo(false); }}>
                    Cancelar
                  </button>
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void enviar()} disabled={enviando || !respuesta.trim()}>
                  {enviando ? 'Enviando…' : 'Enviar respuesta'}
                </button>
              </div>
            </div>
          ) : o.respuestaDocente && (
            <div className="macomp-respuesta">
              <h4>Tu respuesta</h4>
              <p className="macomp-texto">{o.respuestaDocente}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRespondiendo(true)}>Cambiar mi respuesta</button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export default function MisAcompanamientos({ docenteId }: { docenteId: string }) {
  const [lista, setLista] = useState<Observacion[] | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    getMisObservaciones(docenteId)
      .then(l => { if (vigente) { setLista(l); setError(false); } })
      .catch(err => { console.error(err); if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [docenteId, intento]);

  // Llegó desde el aviso ("Mi perfil" → "Acompañamiento"): se lleva a la vista
  useEffect(() => {
    if (lista?.length && window.location.hash === '#acompanamiento') {
      document.getElementById('acompanamiento')?.scrollIntoView({ block: 'start' });
    }
  }, [lista]);

  if (error) {
    return (
      <section className="card pd-seccion" id="acompanamiento" aria-labelledby="pd-acomp">
        <h3 id="pd-acomp"><ClipboardCheck size={17} aria-hidden="true" /> Acompañamiento</h3>
        <p className="pd-vacio">No se pudieron cargar las devoluciones de la dirección (puede ser la señal).{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(false); setIntento(n => n + 1); }}>Reintentar</button>
        </p>
      </section>
    );
  }
  if (!lista?.length) return null;

  const nuevas = lista.filter(o => !o.notificadoAt).length;
  return (
    <section className="card pd-seccion" id="acompanamiento" aria-labelledby="pd-acomp">
      <div className="pd-seccion-cabecera">
        <h3 id="pd-acomp"><ClipboardCheck size={17} aria-hidden="true" /> Acompañamiento</h3>
        {nuevas > 0 && <span className="pd-total">{nuevas} {nuevas === 1 ? 'nueva' : 'nuevas'}</span>}
      </div>
      <p className="pd-vacio">
        Lo que la dirección observó en tus clases, para conversar y acordar próximos pasos. No es una nota.
      </p>
      <div className="macomp-lista">
        {lista.map(o => (
          <UnaObservacion key={o.id} o={o} alCambiar={nueva => setLista(l => l?.map(x => (x.id === nueva.id ? nueva : x)) ?? l)} />
        ))}
      </div>
    </section>
  );
}
