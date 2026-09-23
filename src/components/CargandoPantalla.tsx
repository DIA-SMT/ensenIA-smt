/**
 * Mientras se baja una pantalla. Anuncia la espera a los lectores de
 * pantalla y dibuja la silueta del contenido para que nada salte al llegar.
 */
import './CargandoPantalla.css';

export default function CargandoPantalla({ completa = false }: { completa?: boolean }) {
  return (
    <div className={`cargando${completa ? ' cargando-completa' : ''}`} role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="cargando-silueta" aria-hidden="true">
        <div className="cargando-barra cargando-barra-titulo" />
        <div className="cargando-barra" />
        <div className="cargando-barra cargando-barra-corta" />
        <div className="cargando-bloques">
          <div className="cargando-bloque" />
          <div className="cargando-bloque" />
          <div className="cargando-bloque" />
        </div>
      </div>
    </div>
  );
}
