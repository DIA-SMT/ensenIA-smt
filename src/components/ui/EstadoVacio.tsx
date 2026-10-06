/**
 * Lo que se ve cuando todavía no hay nada: qué es este lugar, por qué está
 * vacío y qué hacer. Siempre con una salida (salvo que de verdad no haya
 * nada que hacer, como un estudiante sin actividades pendientes).
 *
 *   <EstadoVacio
 *     icono={ClipboardList}
 *     titulo="Todavía no publicaste actividades"
 *     texto="Escribí el tema y la app arma la consigna."
 *     accion={{ etiqueta: 'Crear actividad', a: '/actividad-rapida' }}
 *   />
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import './ui.css';

interface Accion {
  etiqueta: string;
  /** Ruta a la que lleva (un Link) o... */
  a?: string;
  /** ...lo que hace al tocarla (un botón). */
  alTocar?: () => void;
  icono?: LucideIcon;
}

interface Props {
  icono?: LucideIcon;
  titulo: string;
  texto?: ReactNode;
  accion?: Accion;
  /** Una segunda salida, menos destacada. */
  accionSecundaria?: Accion;
  /** Más chico, para adentro de una tarjeta o una lista. */
  compacto?: boolean;
  className?: string;
}

function BotonAccion({ accion, primaria }: { accion: Accion; primaria: boolean }) {
  const clase = `btn ${primaria ? 'btn-primary' : 'btn-outline'}`;
  const Icono = accion.icono;
  const contenido = <>{Icono && <Icono size={17} aria-hidden="true" />}<span>{accion.etiqueta}</span></>;
  if (accion.a) return <Link to={accion.a} className={clase}>{contenido}</Link>;
  return <button type="button" className={clase} onClick={accion.alTocar}>{contenido}</button>;
}

export default function EstadoVacio({ icono: Icono, titulo, texto, accion, accionSecundaria, compacto, className = '' }: Props) {
  return (
    <div className={`vacio${compacto ? ' vacio-compacto' : ''} ${className}`}>
      {Icono && <span className="vacio-icono" aria-hidden="true"><Icono size={compacto ? 22 : 28} /></span>}
      <p className="vacio-titulo">{titulo}</p>
      {texto && <p className="vacio-texto">{texto}</p>}
      {(accion || accionSecundaria) && (
        <div className="vacio-acciones">
          {accion && <BotonAccion accion={accion} primaria />}
          {accionSecundaria && <BotonAccion accion={accionSecundaria} primaria={false} />}
        </div>
      )}
    </div>
  );
}
