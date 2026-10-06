/**
 * Prueba de lib/juegos y lib/diagramas.
 *
 * Lo que manda la IA trae la FORMA (structured output), no el criterio: acá
 * se verifica que un crucigrama siempre cierre, que el criptograma tenga una
 * clave usable y que ningún texto rompa el código de Mermaid.
 *
 *   npm run pruebas:visuales
 */

import { normalizarLetras, soloLetras, esJuego, juegoATexto } from './juegos';
import { armarCrucigrama, armarCriptograma } from './armarJuegos';
import { normalizarDiagrama, aMermaid, diagramaATexto } from './diagramas';

let ok = 0, fallo = 0;
const comprobar = (nombre: string, condicion: boolean, detalle?: unknown) => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ ${nombre}`, detalle ?? ''); }
};

// Azar con semilla: las pruebas dan siempre lo mismo
const semilla = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

console.log('\nLetras');
comprobar('saca tildes y conserva la Ñ', normalizarLetras('Vacilación ñandú') === 'VACILACION ÑANDU', normalizarLetras('Vacilación ñandú'));
comprobar('soloLetras saca espacios y signos', soloLetras('¿Casa tomada?') === 'CASATOMADA');

console.log('\nCrucigrama');
const palabras = [
  ['Vacilación', 'Duda del lector ante lo extraño'],
  ['narrador', 'Quien cuenta la historia'],
  ['indicio', 'Detalle que anticipa lo que va a pasar'],
  ['Cortázar', 'Autor de "Casa tomada"'],
  ['fantástico', 'Género del cuento'],
  ['Borges', 'Escritor argentino de "El Aleph"'],
  ['grieta', 'Lo que tiene la realidad en estos cuentos'],
  ['Todorov', 'Teórico de la vacilación'],
  ['a', 'Muy corta: se descarta'],
  ['narrador', 'Repetida: se descarta'],
].map(([respuesta, pista]) => ({ respuesta, pista }));
const cruci = armarCrucigrama('El cuento fantástico', palabras, semilla(7));
comprobar('descarta cortas y repetidas', !cruci.palabras.some(p => p.respuesta === 'A') && cruci.palabras.filter(p => p.respuesta === 'NARRADOR').length <= 1);
comprobar('ubica al menos 6 de 8', cruci.palabras.length >= 6, cruci.palabras.length);
let cierra = true;
for (const p of cruci.palabras) {
  [...p.respuesta].forEach((letra, i) => {
    const f = p.direccion === 'horizontal' ? p.fila : p.fila + i;
    const c = p.direccion === 'horizontal' ? p.col + i : p.col;
    if (cruci.celdas[f]?.[c]?.letra !== letra) cierra = false;
  });
  if (cruci.celdas[p.fila][p.col]?.numero !== p.numero) cierra = false;
}
comprobar('cada palabra coincide con la grilla y su número', cierra);
const numeros = [...new Set(cruci.palabras.map(p => p.numero))].sort((a, b) => a - b);
comprobar('números correlativos desde 1', numeros.every((n, i) => n === i + 1), numeros);
comprobar('la grilla tiene el tamaño declarado', cruci.celdas.length === cruci.filas && cruci.celdas.every(f => f.length === cruci.columnas));
comprobar('es un juego válido', esJuego(cruci));
comprobar('el texto no trae respuestas', !cruci.palabras.some(p => juegoATexto(cruci).includes(p.respuesta)));
let tiro = false;
try { armarCrucigrama('x', palabras.slice(0, 3), semilla(1)); } catch { tiro = true; }
comprobar('con menos de 4 palabras avisa', tiro);

console.log('\nCriptograma');
const cripto = armarCriptograma('Cuento fantástico', 'La realidad puede tener grietas', 'Lo que descubre el lector', semilla(3));
comprobar('frase normalizada', cripto.frase === 'LA REALIDAD PUEDE TENER GRIETAS', cripto.frase);
const usados = Object.values(cripto.clave);
comprobar('27 letras con números distintos del 1 al 27', usados.length === 27 && new Set(usados).size === 27 && Math.min(...usados) === 1 && Math.max(...usados) === 27);
comprobar('revela 2 o 3 letras de la frase', cripto.reveladas.length >= 2 && cripto.reveladas.length <= 3 && cripto.reveladas.every(l => cripto.frase.includes(l)), cripto.reveladas);
comprobar('es un juego válido', esJuego(cripto));
comprobar('el texto no trae la frase', !juegoATexto(cripto).includes(cripto.frase));
tiro = false;
try { armarCriptograma('x', 'Hola', 'p'); } catch { tiro = true; }
comprobar('frase muy corta avisa', tiro);

console.log('\nDiagramas');
const flujo = normalizarDiagrama({
  variante: 'flujo', titulo: 'Cómo leer un cuento "fantástico"', descripcion: 'Pasos',
  nodos: [
    { id: 'a', texto: 'Empezar', forma: 'inicio' },
    { id: 'b', texto: '¿Hay algo raro? (sí/no)', forma: 'decision' },
    { id: 'c', texto: 'Buscar indicios [pistas]; anotar', forma: 'proceso' },
    { id: 'c', texto: 'Repetido', forma: 'proceso' },
    { id: 'd', texto: 'Fin', forma: 'raro' },
  ],
  conexiones: [
    { desde: 'a', hacia: 'b', etiqueta: '' },
    { desde: 'b', hacia: 'c', etiqueta: 'Sí "seguro"' },
    { desde: 'c', hacia: 'd', etiqueta: '' },
    { desde: 'c', hacia: 'zzz', etiqueta: 'a un nodo que no existe' },
    { desde: 'd', hacia: 'd', etiqueta: 'a sí mismo' },
  ],
  ramas: [], eventos: [],
});
comprobar('normaliza un flujo', !!flujo && flujo.nodos.length === 4 && flujo.conexiones.length === 3, flujo);
comprobar('forma desconocida pasa a proceso', flujo?.nodos.find(n => n.id === 'd')?.forma === 'proceso');
const codigo = flujo ? aMermaid(flujo) : '';
comprobar('Mermaid sin comillas rectas dentro de etiquetas', !/"[^"\n]*"[^"\n]*"[^|\]})\n]/.test(codigo.replace(/^flowchart.*$/m, '')), codigo);
comprobar('Mermaid usa ids propios', /n1\(\[/.test(codigo) && !/\ba\[/.test(codigo), codigo);
comprobar('decisión con rombo', /n2\{"/.test(codigo), codigo);
comprobar('sin punto y coma ni numerales en etiquetas', !/;|#/.test(codigo), codigo);

const mapa = normalizarDiagrama({
  variante: 'mapa_mental', titulo: 'Cuento (fantástico)', descripcion: '',
  ramas: [{ texto: 'Autores: Cortázar', hijos: ['Casa tomada', ''] }, { texto: 'Rasgos', hijos: ['Vacilación', 'Indicios'] }],
  nodos: [], conexiones: [], eventos: [],
});
const codigoMapa = mapa ? aMermaid(mapa) : '';
comprobar('mapa mental sin paréntesis ni dos puntos en los textos', !/\(.*\(|:/.test(codigoMapa.split('\n').slice(2).join('\n')) && codigoMapa.includes('root((Cuento fantástico))'), codigoMapa);
comprobar('mapa mental descarta hijos vacíos', mapa?.ramas[0].hijos.length === 1);

const linea = normalizarDiagrama({
  variante: 'linea_tiempo', titulo: 'Independencia', descripcion: '',
  eventos: [{ fecha: '1810', texto: 'Revolución de Mayo: primer gobierno' }, { fecha: '1816', texto: 'Congreso de Tucumán' }],
  nodos: [], conexiones: [], ramas: [],
});
const codigoLinea = linea ? aMermaid(linea) : '';
comprobar('línea de tiempo: un solo ":" por evento', codigoLinea.split('\n').slice(2).every(l => (l.match(/:/g) ?? []).length === 1), codigoLinea);
comprobar('texto del diagrama para lectores de pantalla', !!linea && diagramaATexto(linea).includes('1816: Congreso de Tucumán'));
comprobar('rechaza variante desconocida', normalizarDiagrama({ variante: 'torta', nodos: [] }) === null);
comprobar('rechaza flujo sin conexiones válidas', normalizarDiagrama({ variante: 'ciclo', nodos: [{ id: 'a', texto: 'x' }, { id: 'b', texto: 'y' }], conexiones: [] }) === null);

console.log(`\n${ok} bien, ${fallo} mal\n`);
if (fallo) process.exit(1);
