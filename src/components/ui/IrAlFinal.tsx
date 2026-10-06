/**
 * Botón flotante al pie de un chat: aparece cuando quien lee subió a mirar
 * algo mientras la IA escribe (o ya terminó). No se lo arrastra hacia abajo;
 * se le ofrece volver. Va justo antes del marcador del final del chat.
 */

import { ArrowDown } from 'lucide-react';
import './ui.css';

interface Props {
  visible: boolean;
  /** La IA sigue escribiendo: el botón invita a seguir la respuesta. */
  enCurso: boolean;
  alTocar: () => void;
}

export default function IrAlFinal({ visible, enCurso, alTocar }: Props) {
  if (!visible) return null;
  return (
    <button type="button" className="chat-ir-final" onClick={alTocar}>
      <ArrowDown size={15} aria-hidden="true" />
      {enCurso ? 'Seguir la respuesta' : 'Ir al final'}
    </button>
  );
}
