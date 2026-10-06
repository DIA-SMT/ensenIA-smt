/**
 * Prueba del normalizador y los puentes de lib/diapositivas.
 *
 * El structured output garantiza la FORMA, no el CRITERIO: el modelo puede
 * decir "dos-columnas" y mandar una sola, o "pregunta" sin opciones. Acá se
 * verifica que nada de eso llegue roto a la pantalla.
 */

import {
  normalizarMazo, normalizarDiapositiva, desdeLegado, aTextoPlano, esMazo,
} from './diapositivas';

let ok = 0, fallo = 0;
const comprobar = (nombre: string, condicion: boolean, detalle?: unknown) => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
};

const lamina = (extra: Record<string, unknown>) => ({
  tipo: 'puntos', titulo: 'T', puntos: [], destacado: '', izquierda: { titulo: '', puntos: [] },
  derecha: { titulo: '', puntos: [] }, opciones: [], correcta: -1, nota: '', ...extra,
});

console.log('\n── Degradaciones: el tipo promete algo que el contenido no trae ──');

comprobar('dos-columnas sin columnas → puntos',
  normalizarDiapositiva(lamina({ tipo: 'dos-columnas', puntos: ['a'] }))?.tipo === 'puntos');

comprobar('dos-columnas con una sola columna → puntos',
  normalizarDiapositiva(lamina({
    tipo: 'dos-columnas', izquierda: { titulo: 'Antes', puntos: ['x'] },
  }))?.tipo === 'puntos');

comprobar('dos-columnas completa se respeta',
  normalizarDiapositiva(lamina({
    tipo: 'dos-columnas',
    izquierda: { titulo: 'Antes', puntos: ['x'] },
    derecha: { titulo: 'Después', puntos: ['y'] },
  }))?.tipo === 'dos-columnas');

comprobar('destacado vacío → puntos',
  normalizarDiapositiva(lamina({ tipo: 'destacado', puntos: ['a'] }))?.tipo === 'puntos');

comprobar('pregunta con 1 opción → puntos',
  normalizarDiapositiva(lamina({ tipo: 'pregunta', opciones: ['una'] }))?.tipo === 'puntos');

comprobar('tipo inventado → puntos',
  normalizarDiapositiva(lamina({ tipo: 'carrusel-3d', puntos: ['a'] }))?.tipo === 'puntos');

console.log('\n── Respuesta correcta de las preguntas ──');

const preg = normalizarDiapositiva(lamina({
  tipo: 'pregunta', opciones: ['A', 'B', 'C'], correcta: 1,
}));
comprobar('índice válido se conserva', preg?.correcta === 1, preg?.correcta);

comprobar('correcta -1 (de opinión) → null',
  normalizarDiapositiva(lamina({ tipo: 'pregunta', opciones: ['A', 'B'], correcta: -1 }))?.correcta === null);

comprobar('índice fuera de rango → null',
  normalizarDiapositiva(lamina({ tipo: 'pregunta', opciones: ['A', 'B'], correcta: 7 }))?.correcta === null);

console.log('\n── Basura ──');

comprobar('lámina vacía se descarta', normalizarDiapositiva(lamina({ titulo: '' })) === null);
comprobar('null se descarta', normalizarDiapositiva(null) === null);
comprobar('string se descarta', normalizarDiapositiva('hola') === null);
comprobar('puntos no-array → []', normalizarDiapositiva(lamina({ puntos: 'a,b', titulo: 'T' }))?.puntos.length === 0);
comprobar('números en puntos se filtran',
  normalizarDiapositiva(lamina({ puntos: ['ok', 42, null], titulo: 'T' }))?.puntos.length === 1);

comprobar('mazo sin diapositivas → null', normalizarMazo({ titulo: 'X', diapositivas: [] }) === null);
comprobar('mazo con solo basura → null',
  normalizarMazo({ titulo: 'X', diapositivas: [null, 'a', {}] }) === null);
comprobar('esMazo rechaza undefined', !esMazo(undefined));

console.log('\n── Campos que no aplican no se guardan ──');
const limpia = normalizarDiapositiva(lamina({ tipo: 'puntos', puntos: ['a'], destacado: 'sobra', opciones: ['x', 'y'] }));
comprobar('destacado no se guarda en "puntos"', limpia?.destacado === undefined, limpia);
comprobar('opciones no se guardan en "puntos"', limpia?.opciones === undefined, limpia);

console.log('\n── Lámina de imagen ──');

comprobar('imagen sin ruta → degrada a puntos',
  normalizarDiapositiva(lamina({ tipo: 'imagen', puntos: ['a'] }))?.tipo === 'puntos');

comprobar('imagen con ruta se respeta',
  normalizarDiapositiva(lamina({ tipo: 'imagen', imagen: { ruta: 'docente/foto.png', alt: 'Un afiche' } }))?.tipo === 'imagen');

comprobar('guarda la ruta, no una URL firmada (caduca en una hora)',
  normalizarDiapositiva(lamina({ tipo: 'imagen', imagen: { ruta: 'docente/foto.png', alt: 'x' } }))?.imagen?.ruta === 'docente/foto.png');

comprobar('una lámina solo con imagen no se descarta',
  normalizarDiapositiva(lamina({ tipo: 'imagen', titulo: '', imagen: { ruta: 'a/b.png', alt: '' } })) !== null);

comprobar('imagen sin ruta se ignora',
  normalizarDiapositiva(lamina({ tipo: 'imagen', imagen: { alt: 'sin ruta' }, puntos: ['x'] }))?.imagen === undefined);

comprobar('el alt entra en la búsqueda de la biblioteca',
  aTextoPlano({
    titulo: 'T',
    diapositivas: [normalizarDiapositiva(lamina({ tipo: 'imagen', imagen: { ruta: 'a.png', alt: 'Afiche de campaña vial' } }))!],
  }).includes('Afiche de campaña vial'));

console.log('\n── Puente desde el formato viejo (Markdown parseado) ──');

const legado = desdeLegado({
  title: 'Números racionales',
  subtitle: 'Matemática · 3° A',
  diseno: 'pizarra',
  slides: [
    { title: 'Números racionales', bullets: ['Matemática · 3° A'], portada: true },
    { title: 'Qué son', bullets: ['Se escriben como fracción', 'Incluyen a los enteros'], note: 'Arrancar preguntando' },
    { title: '🙋 Pregunta al grupo', bullets: ['¿Cuál NO es racional?', 'A) 1/2', 'B) 0,333...', 'C) π', 'D) -4'] },
  ],
});

comprobar('conserva el título', legado.titulo === 'Números racionales');
comprobar('conserva el diseño elegido', legado.diseno === 'pizarra');
comprobar('3 diapositivas', legado.diapositivas.length === 3);
comprobar('la primera queda como portada', legado.diapositivas[0].tipo === 'portada');
comprobar('la nota del docente sobrevive', legado.diapositivas[1].nota === 'Arrancar preguntando');
comprobar('detecta la pregunta por el título', legado.diapositivas[2].tipo === 'pregunta');
comprobar('extrae las 4 opciones sin la letra',
  legado.diapositivas[2].opciones?.length === 4 && legado.diapositivas[2].opciones?.[2] === 'π',
  legado.diapositivas[2].opciones);
comprobar('el enunciado no se come como opción',
  legado.diapositivas[2].puntos[0] === '¿Cuál NO es racional?');

console.log('\n── Texto plano para la búsqueda de la biblioteca ──');
const plano = aTextoPlano(legado);
for (const palabra of ['Números racionales', 'Matemática · 3° A', 'fracción', 'π']) {
  comprobar(`se puede buscar "${palabra}"`, plano.includes(palabra));
}
// El texto lo usan las herramientas de los chicos: la nota del docente no va
comprobar('la nota del docente no queda en el texto', !plano.includes('Arrancar preguntando'));

console.log(`\n${fallo === 0 ? '✅' : '❌'}  ${ok} bien, ${fallo} mal\n`);
process.exit(fallo === 0 ? 0 : 1);
