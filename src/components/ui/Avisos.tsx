/**
 * Dibuja los avisos (abajo, sin tapar la barra del celular) y el diálogo de
 * confirmación. Se monta una sola vez, en App, para que también anden en
 * el login y fuera del armazón.
 *
 * El lector de pantalla se entera por dos regiones vivas fijas: una cortés
 * para lo que salió bien y otra que interrumpe para los errores. Las
 * regiones existen desde el principio; si se crearan junto con el aviso,
 * varios lectores no lo anunciarían.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import Dialogo from '../shell/Dialogo';
import {
  suscribir, leerEstado, quitarAviso, duracionDe, type Aviso,
} from './avisar';
import './ui.css';

const ICONO = { exito: CheckCircle2, error: AlertCircle, info: Info };

function TarjetaAviso({ aviso }: { aviso: Aviso }) {
  const [pausado, setPausado] = useState(false);
  const restante = useRef(duracionDe(aviso.tipo));
  const inicio = useRef(Date.now());

  useEffect(() => {
    if (pausado) return;
    inicio.current = Date.now();
    const t = window.setTimeout(() => quitarAviso(aviso.id), restante.current);
    return () => {
      window.clearTimeout(t);
      restante.current -= Date.now() - inicio.current;
    };
  }, [pausado, aviso.id]);

  const Icono = ICONO[aviso.tipo];
  return (
    <li
      className={`aviso aviso-${aviso.tipo}`}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <Icono size={20} className="aviso-icono" aria-hidden="true" />
      <div className="aviso-textos">
        <p className="aviso-texto">{aviso.texto}</p>
        {aviso.detalle && <p className="aviso-detalle">{aviso.detalle}</p>}
      </div>
      <button type="button" className="aviso-cerrar" onClick={() => quitarAviso(aviso.id)} aria-label="Cerrar aviso">
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Dónde se dibujan los avisos. Un <dialog> abierto con showModal() va por
 * encima de todo y deja inerte el resto de la página: un aviso afuera no se
 * vería ni se anunciaría (justo el error de un formulario en un diálogo).
 * Por eso van adentro del diálogo modal de más arriba, si hay uno abierto.
 */
function capaDeArriba(): HTMLElement {
  const abiertos = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  const modales = abiertos.filter(d => {
    try { return d.matches(':modal'); } catch { return true; } // navegadores sin :modal
  });
  return modales[modales.length - 1] ?? document.body;
}

/** Un número fijo por capa, para montar sus regiones de cero al cambiar */
const numeroDeCapa = new WeakMap<HTMLElement, number>();
let ultimaCapa = 0;
function claveDe(capa: HTMLElement): number {
  let n = numeroDeCapa.get(capa);
  if (n === undefined) { n = ++ultimaCapa; numeroDeCapa.set(capa, n); }
  return n;
}

function useCapa(): HTMLElement {
  const [capa, setCapa] = useState<HTMLElement>(() => document.body);
  useEffect(() => {
    const actualizar = () => setCapa(capaDeArriba());
    const obs = new MutationObserver(actualizar);
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    actualizar();
    return () => obs.disconnect();
  }, []);
  return capa;
}

/**
 * Las regiones vivas de una capa. Se montan cuando aparece la capa (al
 * abrirse el diálogo), antes de cualquier aviso: así el lector las conoce.
 */
function Regiones({ avisos }: { avisos: Aviso[] }) {
  const cortes = useRef<HTMLDivElement>(null);
  const urgente = useRef<HTMLDivElement>(null);
  const anunciados = useRef(new Set<number>(avisos.map(a => a.id)));

  // Cada aviso nuevo se anuncia una sola vez
  useEffect(() => {
    for (const a of avisos) {
      if (anunciados.current.has(a.id)) continue;
      anunciados.current.add(a.id);
      const region = a.tipo === 'error' ? urgente.current : cortes.current;
      if (region) region.textContent = a.detalle ? `${a.texto}. ${a.detalle}` : a.texto;
    }
  }, [avisos]);

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" ref={cortes} />
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" ref={urgente} />
    </>
  );
}

export default function Avisos() {
  const { avisos, pedido } = useSyncExternalStore(suscribir, leerEstado);
  const capa = useCapa();

  // Responder una sola vez: el botón y el cierre del <dialog> llegan los dos
  const respondido = useRef<number | null>(null);
  const responder = (si: boolean) => {
    if (!pedido || respondido.current === pedido.id) return;
    respondido.current = pedido.id;
    pedido.responder(si);
  };

  return (
    <>
      {createPortal(
        <>
          {/* key: cada capa nueva monta sus regiones de cero */}
          <Regiones key={claveDe(capa)} avisos={avisos} />
          {avisos.length > 0 && (
            <section className="avisos" aria-label="Avisos">
              <ol>
                {avisos.map(a => <TarjetaAviso key={a.id} aviso={a} />)}
              </ol>
            </section>
          )}
        </>,
        capa,
      )}

      <Dialogo
        abierto={pedido !== null}
        alCerrar={() => responder(false)}
        etiquetadoPor="confirmar-titulo"
        className="dialogo-confirmar"
      >
        {pedido && (
          <div className="confirmar" aria-describedby={pedido.mensaje ? 'confirmar-mensaje' : undefined}>
            <h2 id="confirmar-titulo" className="confirmar-titulo">{pedido.titulo}</h2>
            {pedido.mensaje && <p id="confirmar-mensaje" className="confirmar-mensaje">{pedido.mensaje}</p>}
            <div className="confirmar-botones">
              {/* Cancelar recibe el foco primero: Enter por accidente no borra nada */}
              <button type="button" className="btn btn-secondary" onClick={() => responder(false)} data-inicial="">
                {pedido.cancelar ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className={`btn ${pedido.peligro ? 'btn-peligro' : 'btn-primary'}`}
                onClick={() => responder(true)}
              >
                {pedido.accion ?? 'Aceptar'}
              </button>
            </div>
          </div>
        )}
      </Dialogo>
    </>
  );
}
