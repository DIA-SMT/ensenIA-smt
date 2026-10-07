import { emojiDeMateria } from '../../lib/materias';

/**
 * El emoji de la materia, delante de su nombre. Oculto para el lector de
 * pantalla: si no, leería "libro abierto, Lengua".
 */
export default function EmojiMateria({ nombre }: { nombre: string | null | undefined }) {
  return <span className="emoji-materia" aria-hidden="true">{emojiDeMateria(nombre)}</span>;
}
