/**
 * Mientras llegan los datos de una pantalla ya abierta: la silueta de lo que
 * va a aparecer, para que nada salte cuando llega. Reemplaza el "Cargando…"
 * suelto. El brillo se apaga con "menos movimiento" y en ahorro de datos.
 *
 *   {cargando ? <Esqueleto filas={4} /> : <Lista ... />}
 *   {cargando ? <Esqueleto tipo="tarjetas" cantidad={3} /> : ...}
 *   <Cargando texto="Generando la actividad…" />   // espera corta, en línea
 */

import { Loader2 } from 'lucide-react';
import './ui.css';

interface EsqueletoProps {
  /** filas: lista de renglones · tarjetas: grilla de tarjetas · tabla: renglones con columnas */
  tipo?: 'filas' | 'tarjetas' | 'tabla';
  /** Cuántas filas o tarjetas. */
  cantidad?: number;
  /** Alias de cantidad para listas. */
  filas?: number;
  /** Lo que lee el lector de pantalla. */
  etiqueta?: string;
  className?: string;
}

export function Esqueleto({ tipo = 'filas', cantidad, filas, etiqueta = 'Cargando…', className = '' }: EsqueletoProps) {
  const n = cantidad ?? filas ?? (tipo === 'tarjetas' ? 3 : 4);
  return (
    <div className={`esq esq-${tipo} ${className}`} role="status" aria-live="polite">
      <span className="sr-only">{etiqueta}</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="esq-item" aria-hidden="true">
          {tipo === 'tarjetas' ? (
            <>
              <div className="esq-linea esq-linea-titulo" />
              <div className="esq-linea" />
              <div className="esq-linea esq-linea-corta" />
            </>
          ) : tipo === 'tabla' ? (
            <>
              <div className="esq-circulo" />
              <div className="esq-linea" />
              <div className="esq-linea esq-linea-corta" />
              <div className="esq-linea esq-linea-corta" />
            </>
          ) : (
            <>
              <div className="esq-circulo" />
              <div className="esq-lineas">
                <div className="esq-linea esq-linea-titulo" />
                <div className="esq-linea esq-linea-corta" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Espera corta en línea (un botón que genera, un panel chico). */
export function Cargando({ texto = 'Cargando…', className = '' }: { texto?: string; className?: string }) {
  return (
    <p className={`cargando-linea ${className}`} role="status" aria-live="polite">
      <Loader2 size={16} className="girando" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
}

export default Esqueleto;
