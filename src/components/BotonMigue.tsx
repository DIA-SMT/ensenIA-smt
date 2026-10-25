/**
 * "Preguntale a Migue sobre esto" (UX docente): abre a Migue con lo que el
 * docente está mirando ya cargado, y si hace falta, con un pedido escrito
 * (lo puede cambiar antes de mandarlo). Sin Migue (otros roles), no aparece.
 */

import { useMigue, type ContextoMigue } from '../contexts/MigueContext';
import './BotonMigue.css';

interface Props {
    contexto: ContextoMigue | null;
    /** Lo que queda escrito en el compositor (no se manda solo) */
    borrador?: string;
    texto?: string;
    /** chip: un botón chico con la cara de Migue · enlace: una línea de texto */
    variante?: 'chip' | 'enlace';
    className?: string;
}

export default function BotonMigue({ contexto, borrador, texto = 'Preguntale a Migue', variante = 'chip', className = '' }: Props) {
    const migue = useMigue();
    if (!migue) return null;
    return (
        <button type="button" className={`boton-migue ${variante} ${className}`}
            onClick={() => migue.abrir({ contexto, borrador })}>
            <span className="boton-migue-cara" aria-hidden="true"><img src="/migue-docente.jpeg" alt="" /></span>
            <span>{texto}</span>
        </button>
    );
}
