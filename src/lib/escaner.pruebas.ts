/**
 * Prueba de lib/escaner con fotos armadas a mano: una hoja con renglones de
 * texto sobre una mesa, torcida, en perspectiva y con la sombra del celular.
 * Se sabe dónde están las esquinas de verdad, así que se puede medir cuánto
 * le erra la detección, y qué deja cada filtro en el papel y en la tinta.
 *
 *   npm run pruebas:escaner
 */

import {
  detectarHoja, enderezar, aplicarFiltro, homografia, aplicarHomografia, medidasDeSalida,
  girar, ordenarEsquinas, esquinasCreibles, esquinasDelCuadro, escalarEsquinas, ampliarEsquinas,
  type Imagen, type Esquinas, type Punto,
} from './escaner';

let ok = 0, fallo = 0;
const comprobar = (nombre: string, condicion: boolean, detalle?: unknown) => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallo++; console.log(`  ✗ ${nombre}`, detalle ?? ''); }
};

// Azar con semilla: las pruebas dan siempre lo mismo
const semilla = (s: number) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

interface Escena {
  ancho: number; alto: number;
  hoja: Esquinas;
  mesa: [number, number, number];
  papel?: [number, number, number];
  /** Cuánto oscurece la sombra el lado derecho de la hoja (0 = nada) */
  sombra?: number;
  /** La sombra cae también sobre la mesa (la del celular, de costado) */
  sombraMesa?: boolean;
  /** Mesa con luz de costado: de este gris a la izquierda al otro a la derecha */
  mesaGradiente?: [number, number];
}

/** La "foto": mesa con ruido, hoja con renglones de texto y sombra */
function fotografiar(e: Escena): Imagen {
  const { ancho: w, alto: h } = e;
  const data = new Uint8ClampedArray(w * h * 4);
  const azar = semilla(7);
  // De la foto a la hoja (u, v entre 0 y 1)
  const H = homografia(e.hoja, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  const papel = e.papel ?? [236, 233, 226];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const { x: u, y: v } = aplicarHomografia(H, { x, y });
      let rgb: number[];
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        // Renglones: 14 líneas de "texto" entre los márgenes
        const renglon = v > 0.1 && v < 0.9 && u > 0.1 && u < 0.85 && ((v - 0.1) * 14) % 1 < 0.3;
        const luz = 1 - (e.sombra ?? 0) * u;
        rgb = (renglon ? [45, 45, 60] : papel).map(c => c * luz);
      } else {
        const luz = e.sombraMesa ? 1 - (e.sombra ?? 0) * (x / w) : 1;
        rgb = e.mesaGradiente
          ? [0, 0, 0].map(() => e.mesaGradiente![0] + (e.mesaGradiente![1] - e.mesaGradiente![0]) * (x / w))
          : e.mesa.map(c => c * luz);
      }
      const ruido = (azar() - 0.5) * 16;
      data[i] = rgb[0] + ruido; data[i + 1] = rgb[1] + ruido; data[i + 2] = rgb[2] + ruido; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const errorEsquinas = (a: Esquinas, b: Esquinas) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
const madera: [number, number, number] = [120, 82, 50];
const gris: [number, number, number] = [70, 72, 78];
const p = (x: number, y: number): Punto => ({ x, y });

console.log('\nEncontrar la hoja (foto de 300 × 400, como un cuadro de la cámara)');
const escenas: [string, Escena][] = [
  ['derecha, sobre madera', { ancho: 300, alto: 400, hoja: [p(50, 40), p(250, 40), p(250, 360), p(50, 360)], mesa: madera }],
  ['torcida 12°', { ancho: 300, alto: 400, hoja: [p(80, 30), p(262, 68), p(220, 370), p(38, 332)], mesa: madera }],
  ['en perspectiva (celular inclinado)', { ancho: 300, alto: 400, hoja: [p(90, 60), p(210, 60), p(270, 370), p(30, 370)], mesa: gris }],
  ['con la sombra del celular', { ancho: 300, alto: 400, hoja: [p(45, 50), p(255, 35), p(265, 365), p(40, 375)], mesa: gris, sombra: 0.4 }],
  ['apaisada', { ancho: 400, alto: 300, hoja: [p(40, 50), p(360, 40), p(365, 255), p(35, 262)], mesa: madera }],
  // Madera clara: se ve casi tan clara como el papel, pero tiene color
  ['sobre madera clara', { ancho: 300, alto: 400, hoja: [p(60, 45), p(245, 60), p(240, 355), p(55, 345)], mesa: [205, 170, 125] }],
  ['sombra fuerte solo en la hoja (60% más oscura de un lado)', { ancho: 300, alto: 400, hoja: [p(50, 40), p(250, 40), p(250, 360), p(50, 360)], mesa: gris, sombra: 0.6 }],
  ['sombra fuerte sobre la hoja y la mesa', { ancho: 300, alto: 400, hoja: [p(55, 50), p(245, 40), p(255, 350), p(45, 360)], mesa: madera, sombra: 0.6, sombraMesa: true }],
];
for (const [nombre, escena] of escenas) {
  const encontrada = detectarHoja(fotografiar(escena));
  const diag = Math.hypot(escena.ancho, escena.alto);
  const error = encontrada ? errorEsquinas(encontrada, escena.hoja) : Infinity;
  comprobar(`${nombre}: esquinas a menos del 2,5% (erró ${(error / diag * 100).toFixed(1)}%)`, error < diag * 0.025, encontrada);
}

{
  const vacia: Imagen = fotografiar({ ancho: 300, alto: 400, hoja: [p(-10, -10), p(-9, -10), p(-9, -9), p(-10, -9)], mesa: madera });
  comprobar('sin hoja: no inventa una', detectarHoja(vacia) === null);
  const blancaSobreBlanco = fotografiar({ ancho: 300, alto: 400, hoja: [p(50, 40), p(250, 40), p(250, 360), p(50, 360)], mesa: [232, 230, 224] });
  comprobar('hoja sobre una mesa igual de blanca: no inventa bordes', detectarHoja(blancaSobreBlanco) === null);
  const chica = fotografiar({ ancho: 300, alto: 400, hoja: [p(130, 180), p(170, 180), p(170, 220), p(130, 220)], mesa: madera });
  comprobar('un papelito chico no cuenta como hoja', detectarHoja(chica) === null);
  // Mesa gris clara con luz de costado: del lado claro casi no se distingue
  // del papel. O encuentra la hoja de verdad, o no adivina (nunca media mesa)
  const clara: Escena = { ancho: 320, alto: 240, hoja: [p(70, 30), p(240, 40), p(255, 215), p(55, 205)], mesa: gris, papel: [225, 225, 225], mesaGradiente: [160, 205] };
  const enClara = detectarHoja(fotografiar(clara));
  const errorClara = enClara ? errorEsquinas(enClara, clara.hoja) / Math.hypot(320, 240) : 0;
  comprobar('mesa clara con luz de costado: no devuelve media mesa', errorClara < 0.025, enClara);
  const fuera = enClara?.some(q => q.x < 0 || q.y < 0 || q.x > 319 || q.y > 239);
  comprobar('nunca devuelve esquinas fuera del cuadro', !fuera, enClara);
}

console.log('\nGeometría');
{
  const desde: Esquinas = [p(10, 20), p(300, 5), p(320, 410), p(0, 380)];
  const hasta = esquinasDelCuadro(210, 297);
  const H = homografia(desde, hasta);
  const err = Math.max(...desde.map((q, i) => Math.hypot(aplicarHomografia(H, q).x - hasta[i].x, aplicarHomografia(H, q).y - hasta[i].y)));
  comprobar('la homografía lleva cada esquina a su lugar', err < 1e-6, err);
  const mezcladas = ordenarEsquinas([p(300, 5), p(0, 380), p(10, 20), p(320, 410)]);
  comprobar('ordena las esquinas aunque vengan mezcladas', errorEsquinas(mezcladas, desde) === 0, mezcladas);
  comprobar('A4 medida con perspectiva: se ajusta a A4', (() => {
    const { ancho, alto } = medidasDeSalida([p(0, 0), p(1000, 0), p(1000, 1450), p(0, 1450)]);
    return Math.abs(alto / ancho - Math.SQRT2) < 0.002 && alto === 1450;
  })());
  comprobar('apaisada: queda más ancha que alta', (() => {
    const { ancho, alto } = medidasDeSalida([p(0, 0), p(1500, 0), p(1500, 1000), p(0, 1000)]);
    return ancho > alto;
  })());
  comprobar('foto chica: no baja de 1100 px de lado largo', medidasDeSalida([p(0, 0), p(300, 0), p(300, 420), p(0, 420)]).alto === 1100);
  comprobar('foto enorme: no pasa de 1754 px (A4 a 150 ppp)', medidasDeSalida([p(0, 0), p(3000, 0), p(3000, 4200), p(0, 4200)]).alto === 1754);
  comprobar('un triángulo aplastado no es una hoja', !esquinasCreibles([p(0, 0), p(300, 0), p(150, 2), p(0, 400)], 300, 400));
  const img: Imagen = { data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255]), width: 3, height: 2 };
  const vuelta = girar(girar(img, 90), 270);
  comprobar('girar 90° cambia ancho por alto', girar(img, 90).width === 2 && girar(img, 90).height === 3);
  comprobar('girar 90° y 270° la deja igual', vuelta.data.every((v, i) => v === img.data[i]));
  comprobar('girar 90° (agujas del reloj): lo de abajo a la izquierda queda arriba a la izquierda', girar(img, 90).data[0] === 4);
}

console.log('\nEnderezar y limpiar (foto de 900 × 1200, con sombra)');
{
  const escena: Escena = {
    ancho: 900, alto: 1200, mesa: gris, sombra: 0.45,
    hoja: [p(160, 110), p(760, 150), p(820, 1100), p(90, 1060)],
  };
  const foto = fotografiar(escena);
  const chica = escalarEsquinas(escena.hoja, 1 / 3);
  // La detección en chico, llevada a la foto grande
  const fotoChica = fotografiar({ ...escena, ancho: 300, alto: 400, hoja: chica });
  const det = detectarHoja(fotoChica);
  comprobar('detecta en el cuadro chico', det !== null);
  const esquinas = det ? ampliarEsquinas(det, 3) : escena.hoja;
  const { ancho, alto } = medidasDeSalida(esquinas);
  const derecha = enderezar(foto, esquinas, ancho, alto);
  comprobar('la página enderezada tiene proporción de A4', Math.abs(alto / ancho - Math.SQRT2) < 0.01, { ancho, alto });

  const L = (img: Imagen, u: number, v: number) => {
    const i = (Math.round(v * (img.height - 1)) * img.width + Math.round(u * (img.width - 1))) * 4;
    return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
  };
  // Un renglón (v en la parte oscura del primer renglón) y el margen
  const vTexto = 0.1 + 0.15 / 14, vBlanco = 0.1 + 0.65 / 14;
  comprobar('sin la mesa en las orillas: todo es hoja', L(derecha, 0.02, 0.02) > 150 && L(derecha, 0.98, 0.98) > 90, [L(derecha, 0.02, 0.02), L(derecha, 0.98, 0.98)]);
  comprobar('los renglones quedan horizontales', [0.2, 0.5, 0.8].every(u => L(derecha, u, vTexto) < 110), [0.2, 0.5, 0.8].map(u => L(derecha, u, vTexto)));

  const doc = aplicarFiltro(derecha, 'documento');
  const papelIzq = L(doc, 0.05, vBlanco), papelDer = L(doc, 0.93, vBlanco);
  comprobar(`documento: papel blanco de punta a punta pese a la sombra (${papelIzq.toFixed(0)} y ${papelDer.toFixed(0)})`, papelIzq > 235 && papelDer > 235);
  comprobar('documento: la tinta sigue oscura', L(doc, 0.5, vTexto) < 90, L(doc, 0.5, vTexto));
  comprobar('documento: la tinta del lado con sombra también', L(doc, 0.8, vTexto) < 90, L(doc, 0.8, vTexto));

  const byn = aplicarFiltro(derecha, 'byn');
  comprobar('blanco y negro: solo blanco o negro', byn.data.every((v, i) => i % 4 === 3 || v === 0 || v === 255));
  comprobar('blanco y negro: la sombra no se vuelve negra', L(byn, 0.93, vBlanco) === 255);
  comprobar('blanco y negro: los renglones sí', L(byn, 0.3, vTexto) === 0 && L(byn, 0.8, vTexto) === 0);

  const color = aplicarFiltro(derecha, 'color');
  comprobar('color: estira los niveles sin inventar colores', color.width === derecha.width && L(color, 0.05, vBlanco) >= L(derecha, 0.05, vBlanco));
}

console.log(`\n${ok} bien, ${fallo} mal\n`);
if (fallo) process.exit(1);
