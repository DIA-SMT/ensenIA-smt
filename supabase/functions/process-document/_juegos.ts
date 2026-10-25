/**
 * El banco de los juegos para repasar (072): lo que arma la IA, limpio y
 * validado antes de guardarlo en el material. Lo que viene a medias o
 * ambiguo se descarta acá: un juego con una pieza rota no se puede ganar.
 */

export interface Banco {
  pares: { termino: string; definicion: string }[];
  secuencias: { titulo: string; pasos: string[] }[];
  clasificaciones: { titulo: string; grupos: { nombre: string; elementos: string[] }[] }[];
  completar: { frase: string; respuesta: string; distractores: string[] }[];
  verdadero_falso: { afirmacion: string; verdadera: boolean; explicacion: string }[];
}

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

/** Sin repetidos (por su clave) y hasta `max` */
function unicos<T>(items: T[], claveDe: (t: T) => string, max: number): T[] {
  const vistos = new Set<string>();
  return items.filter(t => {
    const k = claveDe(t);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, max);
}

export function limpiarBanco(crudo: unknown): Banco {
  const b = obj(crudo);

  // Unir: término y definición; ni términos ni definiciones repetidos
  const pares = unicos(
    lista(b.pares).map(obj)
      .map(p => ({ termino: texto(p.termino, 60), definicion: texto(p.definicion, 160) }))
      .filter(p => p.termino && p.definicion && clave(p.termino) !== clave(p.definicion)),
    p => clave(p.termino), 8,
  ).filter((p, i, todos) => todos.findIndex(q => clave(q.definicion) === clave(p.definicion)) === i);

  // Ordenar: 3 a 6 pasos distintos
  const secuencias = lista(b.secuencias).map(obj)
    .map(s => ({ titulo: texto(s.titulo, 100), pasos: unicos(lista(s.pasos).map(x => texto(x, 120)).filter(Boolean), clave, 6) }))
    .filter(s => s.titulo && s.pasos.length >= 3)
    .slice(0, 2);

  // Clasificar: 2 o 3 grupos, cada elemento en un solo grupo
  const clasificaciones = lista(b.clasificaciones).map(obj).map(c => {
    const usados = new Set<string>();
    const grupos = lista(c.grupos).map(obj).map(g => ({
      nombre: texto(g.nombre, 50),
      elementos: lista(g.elementos).map(x => texto(x, 80)).filter(e => {
        const k = clave(e);
        if (!k || usados.has(k)) return false;
        usados.add(k);
        return true;
      }).slice(0, 5),
    })).filter(g => g.nombre && g.elementos.length >= 2);
    return { titulo: texto(c.titulo, 100), grupos: unicos(grupos, g => clave(g.nombre), 3) };
  }).filter(c => c.titulo && c.grupos.length >= 2).slice(0, 2);

  // Completar: la frase con su hueco, la respuesta y 3 distractores distintos de ella
  const completar = unicos(
    lista(b.completar).map(obj).map(c => {
      const respuesta = texto(c.respuesta, 40);
      let frase = texto(c.frase, 200).replace(/_{2,}/g, '___');
      // Sin hueco pero con la respuesta escrita: se la tapa
      if (!frase.includes('___') && respuesta && frase.toLowerCase().includes(respuesta.toLowerCase())) {
        const i = frase.toLowerCase().indexOf(respuesta.toLowerCase());
        frase = `${frase.slice(0, i)}___${frase.slice(i + respuesta.length)}`;
      }
      const distractores = unicos(
        lista(c.distractores).map(x => texto(x, 40)).filter(d => d && clave(d) !== clave(respuesta)),
        clave, 3,
      );
      return { frase, respuesta, distractores };
    }).filter(c => c.respuesta && c.frase.split('___').length === 2 && c.distractores.length === 3),
    c => clave(c.frase), 6,
  );

  // Verdadero o falso: sin un "verdadera" que sea sí o no, no se puede corregir
  const verdadero_falso = unicos(
    lista(b.verdadero_falso).map(obj)
      .filter(v => typeof v.verdadera === 'boolean')
      .map(v => ({ afirmacion: texto(v.afirmacion, 200), verdadera: v.verdadera === true, explicacion: texto(v.explicacion, 220) }))
      .filter(v => v.afirmacion),
    v => clave(v.afirmacion), 12,
  );

  return { pares, secuencias, clasificaciones, completar, verdadero_falso };
}

/** ¿Alcanza para jugar? Al menos dos juegos con contenido. */
export function bancoAlcanza(b: Banco): boolean {
  const juegos = [
    b.pares.length >= 4,
    b.secuencias.length > 0,
    b.clasificaciones.length > 0,
    b.completar.length >= 3,
    b.verdadero_falso.length >= 6,
  ].filter(Boolean).length;
  return juegos >= 2;
}
