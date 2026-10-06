/**
 * SMT EstudIA — Visor del mazo estructurado
 *
 * Dibuja las seis formas de lámina. El visor anterior solo sabía hacer
 * título + viñetas, así que una presentación entera salía con la misma
 * forma doce veces: por eso se veía básica, más allá del tema de color.
 *
 * La misma lámina se usa para ver y para editar. Es a propósito: si el
 * editor tuviera su propio dibujo, el docente corregiría una cosa y se
 * proyectaría otra, y los dos se irían separando con cada cambio.
 *
 * Los colores salen de lib/disenos, los mismos que usa el PowerPoint.
 *
 * Es un componente nuevo y no reemplaza a PresentationViewer: ese sigue
 * sirviendo los mazos en formato viejo mientras migramos.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, StickyNote, Plus, X } from 'lucide-react';
import { disenoDe, varsDiseno, DISENO_PREDETERMINADO } from '../lib/disenos';
import { getSignedUrl } from '../services/documents.service';
import type { Mazo, Diapositiva, Columna } from '../lib/diapositivas';
import './MazoVisor.css';

/** No navegar con las flechas mientras alguien escribe. */
function enCampoDeTexto(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

/** Cambiar una diapositiva. Si no está, la lámina es de solo lectura. */
type AlCambiar = ((d: Diapositiva) => void) | undefined;

/**
 * La imagen vive en el bucket privado, así que hay que pedir una URL
 * firmada. Se guarda la ruta y no la URL a propósito: una URL firmada
 * caduca en una hora, y un mazo guardado en marzo se abre en agosto.
 */
function ImagenDeLamina({ ruta, alt }: { ruta: string; alt: string }) {
  // El estado guarda de qué ruta es: así cambiar de imagen no necesita
  // limpiarlo a mano antes de pedir la nueva (eso encadena renders), se
  // deduce comparando.
  const [estado, setEstado] = useState<{ ruta: string; url: string | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    getSignedUrl(ruta)
      .then(u => { if (vivo) setEstado({ ruta, url: u }); })
      .catch(() => { if (vivo) setEstado({ ruta, url: null }); });
    return () => { vivo = false; };
  }, [ruta]);

  const actual = estado?.ruta === ruta ? estado : null;
  if (!actual) return <span className="mv-img-cargando" aria-hidden="true" />;
  if (!actual.url) return <span className="mv-img-falla">No se pudo cargar la imagen.</span>;
  return <img src={actual.url} alt={alt} className="mv-img" />;
}

/**
 * Texto que se vuelve campo cuando hay edición.
 *
 * Usa textarea y no contentEditable: contentEditable pega HTML del
 * portapapeles, se lleva estilos de Word y rompe el deshacer del navegador.
 */
function Campo({ valor, alEscribir, placeholder, className }: {
  valor: string;
  alEscribir?: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Crece con el contenido: en una lámina no hay lugar para una barra
  // de scroll dentro de un campo.
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // Mientras está oculto —dentro de un <dialog> que todavía no se abrió—
    // scrollHeight da 0. Si eso se escribe como alto, el campo queda en 0px
    // para siempre y la lámina se ve vacía aunque tenga texto.
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(ajustar, [valor, ajustar]);

  // Volver a medir cuando el campo recibe tamaño (se abre el diálogo, cambia
  // el ancho de la lámina). Observa al padre y no a sí mismo: observarse
  // mientras se cambia el alto es un bucle.
  useEffect(() => {
    const padre = ref.current?.parentElement;
    if (!padre) return;
    const ro = new ResizeObserver(ajustar);
    ro.observe(padre);
    return () => ro.disconnect();
  }, [ajustar]);

  if (!alEscribir) return <>{valor}</>;

  return (
    <textarea
      ref={ref}
      className={`mv-campo ${className ?? ''}`}
      value={valor}
      placeholder={placeholder}
      rows={1}
      onChange={e => { alEscribir(e.target.value); ajustar(); }}
    />
  );
}

/** Lista editable de líneas (viñetas, opciones, puntos de una columna). */
function Lineas({ items, alCambiar, claseLista, claseItem, placeholder, render }: {
  items: string[];
  alCambiar?: (v: string[]) => void;
  claseLista: string;
  claseItem?: string;
  placeholder?: string;
  render?: (i: number) => React.ReactNode;
}) {
  const cambiar = (i: number, v: string) => alCambiar?.(items.map((x, j) => j === i ? v : x));
  const quitar = (i: number) => alCambiar?.(items.filter((_, j) => j !== i));

  return (
    <ul className={claseLista}>
      {items.map((it, i) => (
        <li key={i} className={claseItem}>
          {render?.(i)}
          <Campo valor={it} alEscribir={alCambiar ? v => cambiar(i, v) : undefined} placeholder={placeholder} />
          {alCambiar && items.length > 1 && (
            <button className="mv-quitar" onClick={() => quitar(i)} aria-label="Quitar" title="Quitar">
              <X size={13} />
            </button>
          )}
        </li>
      ))}
      {alCambiar && (
        <li className="mv-agregar-li">
          <button className="mv-agregar" onClick={() => alCambiar([...items, ''])}>
            <Plus size={13} /> Agregar
          </button>
        </li>
      )}
    </ul>
  );
}

export function Lamina({ dia, pie, alCambiar }: {
  dia: Diapositiva;
  pie?: string;
  /** Si está, la lámina se edita en el lugar. */
  alCambiar?: AlCambiar;
}) {
  const ed = !!alCambiar;
  const set = (parche: Partial<Diapositiva>) => alCambiar?.({ ...dia, ...parche });
  const setCol = (lado: 'izquierda' | 'derecha', parche: Partial<Columna>) => {
    const base: Columna = dia[lado] ?? { titulo: '', puntos: [''] };
    set({ [lado]: { ...base, ...parche } } as Partial<Diapositiva>);
  };

  return (
    <div className={`mv-lamina mv-${dia.tipo} ${ed ? 'mv-editando' : ''}`}>
      {dia.tipo === 'portada' ? (
        <>
          <h1 className="mv-portada-titulo">
            <Campo valor={dia.titulo} alEscribir={ed ? v => set({ titulo: v }) : undefined} placeholder="Tema de la clase" />
          </h1>
          {(dia.puntos.length > 0 || ed) && (
            <p className="mv-portada-bajada">
              <Campo
                valor={dia.puntos.join(' · ')}
                alEscribir={ed ? v => set({ puntos: v ? [v] : [] }) : undefined}
                placeholder="Materia · curso"
              />
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="mv-titulo">
            <Campo valor={dia.titulo} alEscribir={ed ? v => set({ titulo: v }) : undefined} placeholder="Título de la lámina" />
          </h2>

          {dia.tipo === 'destacado' && (
            <blockquote className="mv-cita">
              <Campo
                valor={dia.destacado ?? ''}
                alEscribir={ed ? v => set({ destacado: v }) : undefined}
                placeholder="La idea que ocupa la lámina"
              />
            </blockquote>
          )}

          {dia.tipo === 'dos-columnas' && (
            <div className="mv-columnas">
              {(['izquierda', 'derecha'] as const).map(lado => {
                const col = dia[lado];
                if (!col && !ed) return null;
                const c = col ?? { titulo: '', puntos: [''] };
                return (
                  <div className="mv-columna" key={lado}>
                    <h3>
                      <Campo
                        valor={c.titulo}
                        alEscribir={ed ? v => setCol(lado, { titulo: v }) : undefined}
                        placeholder={lado === 'izquierda' ? 'Primera' : 'Segunda'}
                      />
                    </h3>
                    <Lineas
                      items={c.puntos.length || !ed ? c.puntos : ['']}
                      alCambiar={ed ? v => setCol(lado, { puntos: v }) : undefined}
                      claseLista=""
                      placeholder="Punto"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {dia.tipo === 'pregunta' && (
            <>
              {/* El estímulo va arriba de las opciones: sin esto la pregunta
                  no se entiende proyectada. */}
              {(dia.puntos.length > 0 || ed) && (
                <p className="mv-estimulo">
                  <Campo
                    valor={dia.puntos.join(' ')}
                    alEscribir={ed ? v => set({ puntos: v ? [v] : [] }) : undefined}
                    placeholder="El verso, la frase o el caso a analizar (opcional)"
                  />
                </p>
              )}
              <Lineas
                items={dia.opciones ?? []}
                alCambiar={ed ? v => set({ opciones: v }) : undefined}
                claseLista="mv-opciones"
                placeholder="Opción"
                render={i => (
                  ed ? (
                    <button
                      className={`mv-letra mv-letra-btn ${i === dia.correcta ? 'ok' : ''}`}
                      onClick={() => set({ correcta: i === dia.correcta ? null : i })}
                      title={i === dia.correcta ? 'Es la correcta — tocá para desmarcar' : 'Marcar como correcta'}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                  ) : (
                    <span className="mv-letra">{String.fromCharCode(65 + i)}</span>
                  )
                )}
              />
            </>
          )}

          {dia.tipo === 'imagen' && dia.imagen && (
            <figure className="mv-figura">
              <ImagenDeLamina ruta={dia.imagen.ruta} alt={dia.imagen.alt} />
              {(dia.puntos.length > 0 || ed) && (
                <figcaption>
                  <Campo
                    valor={dia.puntos.join(' ')}
                    alEscribir={ed ? v => set({ puntos: v ? [v] : [] }) : undefined}
                    placeholder="Epígrafe (opcional)"
                  />
                </figcaption>
              )}
            </figure>
          )}

          {/* Puntos con imagen al costado: la diapositiva más común de una
              clase. La imagen no reemplaza al contenido, lo acompaña. */}
          {(dia.tipo === 'puntos' || dia.tipo === 'cierre') && (() => {
            const lista = (
              <Lineas
                items={dia.puntos.length || !ed ? dia.puntos : ['']}
                alCambiar={ed ? v => set({ puntos: v }) : undefined}
                claseLista="mv-puntos"
                placeholder="Una línea"
              />
            );
            if (!dia.imagen) return lista;
            return (
              <div className="mv-con-imagen">
                {lista}
                <ImagenDeLamina ruta={dia.imagen.ruta} alt={dia.imagen.alt} />
              </div>
            );
          })()}
        </>
      )}

      {pie && dia.tipo !== 'portada' && <span className="mv-pie">{pie}</span>}
    </div>
  );
}

export default function MazoVisor({ mazo, notas = false, grande = false, pie }: {
  mazo: Mazo;
  /** Ofrecer las notas del docente. Nunca para estudiantes ni en el proyector. */
  notas?: boolean;
  /** Letra más grande, para proyectar. */
  grande?: boolean;
  pie?: string;
}) {
  const [i, setI] = useState(0);
  const [verNotas, setVerNotas] = useState(false);
  const total = mazo.diapositivas.length;
  const dia = mazo.diapositivas[Math.min(i, total - 1)];

  const ir = useCallback((d: number) => setI(x => Math.max(0, Math.min(total - 1, x + d))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enCampoDeTexto(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); ir(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ir]);

  if (!dia) return null;

  const d = disenoDe(mazo.diseno ?? DISENO_PREDETERMINADO);
  const estilo = varsDiseno(d, dia.tipo === 'pregunta');

  return (
    <div className={`mv ${grande ? 'mv-grande' : ''}`} style={estilo}>
      <Lamina dia={dia} pie={pie} />

      <div className="mv-barra">
        <button className="mv-nav" onClick={() => ir(-1)} disabled={i === 0} aria-label="Anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="mv-contador">{i + 1} / {total}</span>
        <button className="mv-nav" onClick={() => ir(1)} disabled={i >= total - 1} aria-label="Siguiente">
          <ChevronRight size={18} />
        </button>

        {notas && dia.nota && (
          <button
            className={`mv-notas-btn ${verNotas ? 'on' : ''}`}
            onClick={() => setVerNotas(v => !v)}
          >
            <StickyNote size={15} /> {verNotas ? 'Ocultar nota' : 'Nota'}
          </button>
        )}
      </div>

      {notas && verNotas && dia.nota && (
        <p className="mv-nota" role="note">{dia.nota}</p>
      )}
    </div>
  );
}
