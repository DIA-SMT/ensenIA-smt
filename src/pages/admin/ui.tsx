/**
 * Piezas chicas que comparten las pantallas de gestión. Todo arriba de lo
 * que ya trae el front v4 (Dialogo, .form-input, .btn, .card), para que
 * estas pantallas se vean como el resto de la app y no como un agregado.
 */

import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import Dialogo from '../../components/shell/Dialogo';

/** Etiqueta + control + ayuda opcional. */
export function Campo({ label, htmlFor, ayuda, children }: {
  label: string;
  htmlFor: string;
  ayuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="adm-campo">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {ayuda && <span className="adm-ayuda">{ayuda}</span>}
    </div>
  );
}

/** Diálogo con título, cuerpo con scroll y pie de acciones fijo. */
export function DialogoForm({ abierto, alCerrar, titulo, bajada, id, children, pie }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  bajada?: string;
  /** id del título (nombre accesible del diálogo) */
  id: string;
  children: ReactNode;
  pie: ReactNode;
}) {
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor={id} className="adm-dialogo">
      <div className="dialogo-encabezado">
        <h2 id={id}>{titulo}</h2>
        <button type="button" className="btn-icon" onClick={alCerrar} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {bajada && <p className="dialogo-bajada">{bajada}</p>}
      <div className="adm-dialogo-contenido">{children}</div>
      <div className="adm-dialogo-pie">{pie}</div>
    </Dialogo>
  );
}

/** Lo que se ve cuando una lista está vacía: qué es y qué hacer. */
export function Vacio({ icono: Icono, titulo, texto, accion }: {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  accion?: ReactNode;
}) {
  return (
    <div className="adm-vacio">
      <span className="adm-vacio-icono" aria-hidden="true"><Icono size={22} /></span>
      <strong>{titulo}</strong>
      <p>{texto}</p>
      {accion}
    </div>
  );
}

/** Círculo con iniciales, como el resto de la app. */
export function Iniciales({ nombre, apellido }: { nombre: string; apellido: string }) {
  const txt = `${nombre.trim()[0] ?? ''}${apellido.trim()[0] ?? ''}`.toUpperCase() || '?';
  return <span className="adm-avatar" aria-hidden="true">{txt}</span>;
}

/**
 * Encabezado de pestaña: qué hay acá y el botón para agregar. Sin título:
 * el nombre ya está en la pestaña, justo arriba.
 */
export function Barra({ titulo, detalle, children }: { titulo?: string; detalle?: string; children?: ReactNode }) {
  return (
    <div className="adm-barra">
      <div>
        {titulo && <h3>{titulo}</h3>}
        {detalle && <p>{detalle}</p>}
      </div>
      {children && <div className="adm-barra-acciones">{children}</div>}
    </div>
  );
}
