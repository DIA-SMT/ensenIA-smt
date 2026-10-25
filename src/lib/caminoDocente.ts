/**
 * Camino Docente Tech (082): niveles, medallas y trofeos del docente.
 *
 * "Tecnología con corazón": hay medallas por usar la plataforma (planificar,
 * subir material, actividades, clases en vivo) y, con el mismo peso, por lo
 * humano (devoluciones con palabras, reconocer a los chicos, escuchar, tomar
 * lista). Sin ranking: nadie se compara con nadie.
 *
 * Los números y los puntos los calcula la base (mi_camino_docente); acá se
 * arman las medallas con esos números. Los nombres de los niveles tienen que
 * ser los mismos que camino_nombres() en la 082.
 */

export interface NumerosCamino {
  anio: number;
  materiales: number;
  unidades: number;
  temasConFecha: number;
  temasDados: number;
  actividades: number;
  corregidas: number;
  devoluciones: number;
  listas: number;
  enVivo: number;
  respuestasEnVivo: number;
  checkins: number;
  medallasDadas: number;
  conversaciones: number;
  medallasDireccion: number;
  semanas: number;
  racha: number;
  mejorRacha: number;
  ciclos: number;
}

export const NIVELES: { nombre: string; emoji: string; lema: string }[] = [
  { nombre: 'Chispa', emoji: '✨', lema: 'Encendiste la primera luz: todo camino empieza así.' },
  { nombre: 'Brújula', emoji: '🧭', lema: 'Ya sabés hacia dónde vas con tus clases.' },
  { nombre: 'Puente', emoji: '🌉', lema: 'Unís lo que enseñás con lo digital, sin soltar a nadie.' },
  { nombre: 'Docente Tech', emoji: '💡', lema: 'La tecnología trabaja para tu clase, y no al revés.' },
  { nombre: 'Referente', emoji: '🌟', lema: 'Lo que hacés inspira a tus colegas.' },
  { nombre: 'Faro', emoji: '🗼', lema: 'Iluminás el camino de tu escuela.' },
];

/** nivel va de 1 a 6 (como lo devuelve la base) */
export const nivelInfo = (nivel: number) => NIVELES[Math.min(Math.max(nivel, 1), NIVELES.length) - 1];

/** Cuánto avanzó dentro de su nivel (0-100) y cuántos puntos faltan para el siguiente */
export function progresoDe(c: { puntos: number; nivel: number; umbrales: number[] }): { pct: number; faltan: number | null } {
  const desde = c.umbrales[c.nivel - 1] ?? 0;
  const hasta = c.umbrales[c.nivel];
  if (hasta === undefined) return { pct: 100, faltan: null };
  return { pct: Math.max(0, Math.min(100, Math.round((100 * (c.puntos - desde)) / (hasta - desde)))), faltan: hasta - c.puntos };
}

export type Lado = 'tecnologia' | 'humanidad' | 'constancia';
export type Grado = 0 | 1 | 2 | 3;
export const GRADOS = ['Sin medalla', 'Bronce', 'Plata', 'Oro'] as const;
export const EMOJI_GRADO = ['', '🥉', '🥈', '🥇'] as const;

export interface Pilar {
  clave: string;
  lado: Lado;
  emoji: string;
  medalla: string;
  /** Qué se cuenta, en plural ("materiales subidos") */
  unidad: string;
  /** Bronce, plata y oro */
  umbrales: [number, number, number];
  valor: (n: NumerosCamino) => number;
  idea: string;
}

export const PILARES: Pilar[] = [
  // ── Tecnología ──
  { clave: 'planificar', lado: 'tecnologia', emoji: '🗺️', medalla: 'Mapa del año', unidad: 'temas con fecha',
    umbrales: [5, 20, 60], valor: n => n.temasConFecha, idea: 'Subí tu programa y poné fecha a los temas.' },
  { clave: 'material', lado: 'tecnologia', emoji: '📚', medalla: 'Biblioteca viva', unidad: 'materiales subidos',
    umbrales: [1, 10, 30], valor: n => n.materiales, idea: 'Subí tus apuntes, fotocopias escaneadas o videos.' },
  { clave: 'actividades', lado: 'tecnologia', emoji: '🧩', medalla: 'Manos a la obra', unidad: 'actividades publicadas',
    umbrales: [1, 8, 25], valor: n => n.actividades, idea: 'Dejales una actividad: la hacen en el celular, aunque no tengan señal.' },
  { clave: 'vivo', lado: 'tecnologia', emoji: '📡', medalla: 'Aula encendida', unidad: 'clases en vivo',
    umbrales: [1, 8, 25], valor: n => n.enVivo, idea: 'Proyectá y preguntá en vivo: participan desde el celular.' },
  // ── Humanidad ──
  { clave: 'devolver', lado: 'humanidad', emoji: '✍️', medalla: 'Palabra que acompaña', unidad: 'devoluciones con palabras',
    umbrales: [5, 30, 100], valor: n => n.devoluciones, idea: 'Además de la nota, escribiles qué hicieron bien y qué revisar.' },
  { clave: 'reconocer', lado: 'humanidad', emoji: '💛', medalla: 'Reconocer es enseñar', unidad: 'medallas a tus estudiantes',
    umbrales: [3, 15, 40], valor: n => n.medallasDadas, idea: 'Dale una medalla a quien se esforzó (Estudiantes → "Dar logro").' },
  { clave: 'escuchar', lado: 'humanidad', emoji: '🤝', medalla: 'Nadie queda afuera', unidad: 'charlas y check-ins de ánimo',
    umbrales: [3, 15, 40], valor: n => n.conversaciones + n.checkins, idea: 'Respondé sus consultas y preguntá cómo vienen al empezar la clase en vivo.' },
  { clave: 'presente', lado: 'humanidad', emoji: '🙋', medalla: 'Presente', unidad: 'listas tomadas',
    umbrales: [10, 40, 120], valor: n => n.listas, idea: 'Tomá lista en la app: se ve quién empieza a faltar.' },
  // ── Constancia ──
  { clave: 'constancia', lado: 'constancia', emoji: '🔥', medalla: 'Constancia', unidad: 'semanas con actividad',
    umbrales: [4, 12, 24], valor: n => n.semanas, idea: 'Una semana cuenta si hiciste algo: lista, material, corrección o clase.' },
];

export const LADOS: { lado: Lado; titulo: string; texto: string }[] = [
  { lado: 'tecnologia', titulo: 'Tecnología', texto: 'Lo que la plataforma te ayuda a hacer.' },
  { lado: 'humanidad', titulo: 'Humanidad', texto: 'Lo que ninguna máquina hace por vos.' },
  { lado: 'constancia', titulo: 'Constancia', texto: 'De a poco, todas las semanas.' },
];

export interface MedallaGanada {
  pilar: Pilar;
  valor: number;
  grado: Grado;
  /** Lo que falta para el grado que sigue (null si ya es oro) */
  siguiente: { grado: Grado; umbral: number } | null;
}

export function medallasDe(n: NumerosCamino): MedallaGanada[] {
  return PILARES.map(pilar => {
    const valor = pilar.valor(n);
    const umbrales: number[] = pilar.umbrales;
    const grado = umbrales.filter(u => valor >= u).length as Grado;
    const siguiente = grado < 3 ? { grado: (grado + 1) as Grado, umbral: umbrales[grado] } : null;
    return { pilar, valor, grado, siguiente };
  });
}

export interface Trofeo {
  clave: string;
  emoji: string;
  nombre: string;
  texto: string;
  logrado: boolean;
}

export function trofeosDe(n: NumerosCamino, nivel: number): Trofeo[] {
  const m = medallasDe(n);
  const plata = (lado: Lado) => m.some(x => x.pilar.lado === lado && x.grado >= 2);
  return [
    { clave: 'ciclo', emoji: '🏆', nombre: 'Ciclo completo', logrado: n.ciclos >= 1,
      texto: 'Un tema de punta a punta: con material, una actividad corregida y el tema dado.' },
    { clave: 'corazon', emoji: '💗', nombre: 'Tecnología con corazón', logrado: plata('tecnologia') && plata('humanidad'),
      texto: 'Plata en una medalla de tecnología y en una de humanidad.' },
    { clave: 'tech', emoji: '🎓', nombre: `Docente Tech ${n.anio}`, logrado: nivel >= 4,
      texto: 'Llegar al nivel Docente Tech en el año.' },
    { clave: 'manos', emoji: '🙌', nombre: 'Quinientas manos arriba', logrado: n.respuestasEnVivo >= 500,
      texto: '500 respuestas de tus estudiantes en clases en vivo.' },
    { clave: 'escuela', emoji: '🏅', nombre: 'Reconocimiento de la escuela', logrado: n.medallasDireccion >= 1,
      texto: 'La dirección te dio una medalla.' },
    { clave: 'racha', emoji: '☄️', nombre: 'Trimestre encendido', logrado: n.mejorRacha >= 10,
      texto: '10 semanas seguidas con actividad.' },
  ];
}

/** Para "Cómo se suman": el nombre de cada cosa que da puntos (las claves de camino_pesos()) */
export const QUE_SUMA: Record<string, string> = {
  materiales: 'Material subido',
  unidades: 'Unidad planificada',
  temasConFecha: 'Tema con fecha (hasta 120)',
  temasDados: 'Tema dado',
  actividades: 'Actividad publicada',
  corregidas: 'Entrega corregida',
  devoluciones: 'Devolución con palabras (además de corregir)',
  listas: 'Lista tomada',
  enVivo: 'Clase en vivo (5 minutos o más)',
  checkins: 'Check-in de ánimo en una clase en vivo',
  medallasDadas: 'Medalla a un estudiante',
  conversaciones: 'Charla con un estudiante',
  medallasDireccion: 'Medalla de la dirección',
  semanas: 'Semana con actividad',
  ciclos: 'Ciclo completo de un tema',
};

/** Las medallas ganadas como texto estable, para saber cuáles son nuevas */
export const clavesGanadas = (m: MedallaGanada[]) => m.filter(x => x.grado > 0).map(x => `${x.pilar.clave}:${x.grado}`);
