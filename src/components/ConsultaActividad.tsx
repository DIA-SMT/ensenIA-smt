/**
 * En la actividad del estudiante (fase 4): las aclaraciones que el docente
 * publicó para todo el curso y "¿Tenés una duda?" para consultarle.
 *
 * La consulta es una conversación de la mensajería (060): la ve su docente
 * en Mensajes y, como toda charla con un estudiante, la dirección también la
 * puede leer, y lo que se manda no se borra. Eso se dice acá, antes de
 * escribir. Sin señal, la consulta queda en el celular y sale cuando vuelve.
 * Si el servidor no la acepta, se sigue viendo acá con su texto y el motivo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Megaphone, Send, CloudUpload, MessagesSquare, AlertCircle, RotateCcw, X } from 'lucide-react';
import { useSenial } from '../lib/useSenial';
import { consultaDeActividad, getAclaraciones, type Aclaracion } from '../services/seguimiento.service';
import { verConversacion, type Mensaje } from '../services/mensajes.service';
import {
  consultarResiliente, consultasEnCola, consultasRechazadas, descartarNoGuardada, reintentarNoGuardada, subscribe,
} from '../services/offline-queue.service';
import { avisar, confirmar } from './ui/avisar';
import './ConsultaActividad.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function ConsultaActividad({ activityId, miUserId }: { activityId: string; miUserId: string }) {
  const senial = useSenial();
  const [aclaraciones, setAclaraciones] = useState<Aclaracion[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [enCola, setEnCola] = useState<string[]>(() => consultasEnCola(activityId));
  const [rechazadas, setRechazadas] = useState(() => consultasRechazadas(activityId));
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pedido = useRef(0);

  const cargarCharla = useCallback(async () => {
    const este = ++pedido.current;
    try {
      const conv = await consultaDeActividad(activityId);
      if (este !== pedido.current) return;
      setConversacionId(conv);
      if (conv) {
        const c = await verConversacion(conv);
        if (este === pedido.current) setMensajes(c?.mensajes ?? []);
      } else {
        setMensajes([]);
      }
    } catch {
      // Sin señal no se ve la charla (no se guarda para usar sin conexión);
      // lo que espera para salir se muestra igual
    }
  }, [activityId]);

  useEffect(() => {
    getAclaraciones(activityId).then(setAclaraciones).catch(() => setAclaraciones([]));
    void cargarCharla();
  }, [activityId, cargarCharla]);

  // Cuando la cola manda una consulta guardada sin señal, aparece en la charla
  const colaAntes = useRef(enCola.length);
  useEffect(() => subscribe(() => {
    const ahora = consultasEnCola(activityId);
    if (ahora.length < colaAntes.current) void cargarCharla();
    colaAntes.current = ahora.length;
    setEnCola(ahora);
    setRechazadas(consultasRechazadas(activityId));
  }), [activityId, cargarCharla]);

  const quitar = async (ts: number) => {
    const ok = await confirmar({
      titulo: '¿Quitar esta consulta?',
      mensaje: 'No le llegó a tu docente. Si la quitás, se borra de este celular.',
      accion: 'Quitar',
      peligro: true,
    });
    if (ok) descartarNoGuardada(ts);
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await consultarResiliente(activityId, t);
      setTexto('');
      if (r === 'pendiente') {
        setEnCola(consultasEnCola(activityId));
        avisar.exito('Quedó guardada en este celular', 'Le llega a tu docente cuando vuelva la señal, si seguís con tu sesión abierta acá.');
      } else {
        avisar.exito('Consulta enviada', 'Tu docente la ve en sus mensajes.');
        await cargarCharla();
      }
    } catch (err) {
      avisar.error('No se pudo mandar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const hayCharla = mensajes.length > 0 || enCola.length > 0 || rechazadas.length > 0;

  return (
    <div className="cact">
      {aclaraciones.length > 0 && (
        <section className="cact-aclaraciones" aria-labelledby={`acl-${activityId}`}>
          <h3 id={`acl-${activityId}`}><Megaphone size={16} aria-hidden="true" /> Aclaraciones de tu docente</h3>
          <ul>
            {aclaraciones.map(a => (
              <li key={a.id}>
                <p>{a.texto}</p>
                <small>{fecha(a.createdAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cact-consulta" aria-labelledby={`cons-${activityId}`}>
        <div className="cact-cabecera">
          <h3 id={`cons-${activityId}`}><HelpCircle size={16} aria-hidden="true" /> ¿Tenés una duda?</h3>
          {!abierta && !hayCharla && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierta(true)}>
              Preguntale a tu docente
            </button>
          )}
        </div>

        {hayCharla && (
          <ol className="cact-charla">
            {mensajes.map(m => (
              <li key={m.id} className={m.autorId === miUserId ? 'mio' : 'docente'}>
                <span className="cact-autor">{m.autorId === miUserId ? 'Vos' : m.autor}</span>
                <p>{m.cuerpo}</p>
                <small>{fecha(m.createdAt)}</small>
              </li>
            ))}
            {enCola.map((t, i) => (
              <li key={`cola-${i}`} className="mio pendiente">
                <span className="cact-autor">Vos</span>
                <p>{t}</p>
                <small><CloudUpload size={12} aria-hidden="true" /> Se manda cuando haya señal</small>
              </li>
            ))}
            {rechazadas.map(r => (
              <li key={`rech-${r.ts}`} className="mio rechazada">
                <span className="cact-autor">Vos · no le llegó</span>
                <p>{r.texto}</p>
                <small role="alert"><AlertCircle size={12} aria-hidden="true" /> {r.motivo}</small>
                <span className="cact-rech-acciones">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => reintentarNoGuardada(r.ts)}>
                    <RotateCcw size={13} aria-hidden="true" /> Probar de nuevo
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(r.ts)}>
                    <X size={13} aria-hidden="true" /> Quitar
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        {(abierta || hayCharla) && (
          <div className="cact-escribir">
            <label htmlFor={`cons-txt-${activityId}`} className="sr-only">Tu consulta</label>
            <textarea
              id={`cons-txt-${activityId}`}
              // Al tocar "Preguntale a tu docente" el botón desaparece: el foco va acá
              autoFocus={abierta && !hayCharla}
              rows={3}
              maxLength={2000}
              value={texto}
              placeholder={hayCharla ? 'Escribí otra consulta…' : 'Por ejemplo: no entiendo qué hay que hacer en la parte 2'}
              onChange={e => setTexto(e.target.value)}
            />
            <div className="cact-pie">
              <p className="cact-aviso">
                La ve tu docente en sus mensajes. Como toda charla con estudiantes, la dirección de la escuela también la puede leer, y lo que mandás no se puede borrar ni editar.
                {!senial && ' Sin señal: queda en este celular y sale cuando vuelva la señal.'}
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={enviar} disabled={!texto.trim() || enviando}>
                <Send size={14} aria-hidden="true" /> {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
            {conversacionId && (
              <Link to={`/mensajes?c=${conversacionId}`} className="cact-bandeja">
                <MessagesSquare size={14} aria-hidden="true" /> Ver en Mensajes
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
