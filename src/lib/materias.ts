/**
 * El emoji de cada materia, para reconocerla de un vistazo (en el celular
 * se lee el dibujo antes que el nombre).
 *
 * Sale del nombre, sin tildes ni mayúsculas: cada escuela escribe las
 * materias a su manera ("Matemática", "MATEMATICA", "Prácticas del
 * Lenguaje"). El orden importa: "Educación Física" antes que "Física" y
 * "Físico-Química" antes que "Química".
 */

const plegar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGLAS: [RegExp, string][] = [
  [/educacion fisica|ed\.? fisica|deporte/, '⚽'],
  [/fisico.?quimic|fisicoquimic/, '⚗️'],
  [/quimic/, '🧪'],
  [/fisica/, '🧲'],
  [/matemat|algebra|geometr|aritmet|estadistic/, '🔢'],
  // Los idiomas antes que "lengua": "Lengua Extranjera: Inglés"
  [/ingles|frances|portugues|italiano|idioma|lengua extranjera/, '🔤'],
  [/lengua|literatura|lenguaje|castellano|espanol|comunicacion/, '📖'],
  [/biolog|ciencias naturales|naturales|ecolog/, '🌱'],
  [/historia/, '🏛️'],
  [/geograf/, '🌎'],
  [/ciencias sociales|sociales/, '🗺️'],
  [/music/, '🎵'],
  [/teatro/, '🎭'],
  [/\barte|artistic|plastica|visual|dibujo/, '🎨'],
  [/tecnolog|informatic|computacion|programacion|robotic|digital/, '💻'],
  [/ciudadan|etica|civica|formacion etica/, '🤝'],
  [/econom|contab|administracion|gestion/, '📊'],
  [/filosof/, '🤔'],
  [/psicolog/, '🧠'],
  [/salud|\besi\b|sexual/, '❤️'],
  [/religion|catequesis/, '🕊️'],
  [/orientacion|tutoria/, '🧭'],
];

export function emojiDeMateria(nombre: string | null | undefined): string {
  const n = plegar(nombre ?? '');
  return REGLAS.find(([re]) => re.test(n))?.[1] ?? '📘';
}
