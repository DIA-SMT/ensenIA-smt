/**
 * El escáner de la Biblioteca: encontrar la hoja en una foto, enderezarla y
 * dejarla limpia, como un escáner de verdad. Todo en el teléfono del docente:
 * sin servidor, sin IA y sin librerías pesadas (OpenCV pesa ~8 MB).
 *
 * Son funciones puras sobre píxeles RGBA (como ImageData): las usa la
 * pantalla (components/Escaner.tsx) y se prueban solas (escaner.pruebas.ts).
 *
 * - detectarHoja: el papel es claro y sin color; una mesa, aunque sea clara,
 *   casi siempre tiene color o es más oscura. Se separa "lo más blanco" con
 *   Otsu, se toma la mancha más grande y su contorno se reduce a 4 esquinas.
 * - enderezar: homografía de la hoja torcida a un rectángulo.
 * - filtros: "documento" saca la sombra de la mano y del celular dividiendo
 *   por el fondo (el papel) y deja el papel blanco; "byn" umbraliza con el
 *   promedio de la zona (no con uno global), así una sombra no se vuelve negra.
 */

export interface Imagen {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Punto { x: number; y: number }
/** Arriba a la izquierda, arriba a la derecha, abajo a la derecha, abajo a la izquierda */
export type Esquinas = [Punto, Punto, Punto, Punto];
export type Filtro = 'documento' | 'color' | 'byn';
export type Giro = 0 | 90 | 180 | 270;

// ── Geometría ──

const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function areaPoligono(p: Punto[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** En el orden de Esquinas, sin importar cómo vengan */
export function ordenarEsquinas(p: Punto[]): Esquinas {
  const cx = p.reduce((s, q) => s + q.x, 0) / p.length;
  const cy = p.reduce((s, q) => s + q.y, 0) / p.length;
  // Con la y hacia abajo, el ángulo creciente da la vuelta como las agujas del reloj
  const orden = [...p].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let inicio = 0;
  for (let i = 1; i < orden.length; i++) {
    if (orden[i].x + orden[i].y < orden[inicio].x + orden[inicio].y) inicio = i;
  }
  return [0, 1, 2, 3].map(k => ({ ...orden[(inicio + k) % 4] })) as Esquinas;
}

/** Las esquinas de toda la imagen, un poco adentro (cuando no se encuentra la hoja) */
export function esquinasDelCuadro(width: number, height: number, margen = 0): Esquinas {
  const mx = width * margen, my = height * margen;
  return [
    { x: mx, y: my }, { x: width - 1 - mx, y: my },
    { x: width - 1 - mx, y: height - 1 - my }, { x: mx, y: height - 1 - my },
  ];
}

export function escalarEsquinas(e: Esquinas, fx: number, fy = fx): Esquinas {
  return e.map(p => ({ x: p.x * fx, y: p.y * fy })) as Esquinas;
}

/**
 * De la imagen chica (donde se buscó la hoja) a la grande. Un píxel chico
 * cubre k píxeles grandes: su centro no está en x·k sino en (x + ½)·k − ½.
 * Sin esto la hoja queda corrida medio píxel chico (varios grandes).
 */
export function ampliarEsquinas(e: Esquinas, fx: number, fy = fx): Esquinas {
  return e.map(p => ({ x: (p.x + 0.5) * fx - 0.5, y: (p.y + 0.5) * fy - 0.5 })) as Esquinas;
}

/** Cuánto se movió la hoja entre dos cuadros: la esquina que más se movió */
export function distanciaEsquinas(a: Esquinas, b: Esquinas): number {
  return Math.max(...a.map((p, i) => dist(p, b[i])));
}

/**
 * Una hoja creíble: convexa, que ocupe una parte razonable del cuadro, sin
 * ángulos imposibles. Evita "encontrar" un reflejo o el borde de la mesa.
 */
export function esquinasCreibles(e: Esquinas, width: number, height: number): boolean {
  const area = areaPoligono(e);
  if (area < 0.12 * width * height) return false;
  const lado = Math.min(width, height) * 0.18;
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = e[(i + 3) % 4], b = e[i], c = e[(i + 1) % 4];
    if (dist(b, c) < lado) return false;
    const z = cruz(b, c, a);
    if (z === 0 || (signo !== 0 && Math.sign(z) !== signo)) return false;
    signo = Math.sign(z);
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    const angulo = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    if (angulo < 35 || angulo > 145) return false;
  }
  return true;
}

// ── Encontrar la hoja ──

/** Umbral de Otsu, qué tan separadas quedan las dos partes y el gris de la oscura */
function otsu(v: Uint8Array): { umbral: number; contraste: number; oscuro: number } {
  const hist = new Uint32Array(256);
  for (let i = 0; i < v.length; i++) hist[v[i]]++;
  let suma = 0;
  for (let t = 0; t < 256; t++) suma += t * hist[t];
  let sumaB = 0, pesoB = 0, mejor = -1, umbral = 128, contraste = 0, oscuro = 0;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = v.length - pesoB;
    if (!pesoF) break;
    sumaB += t * hist[t];
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF;
    const entre = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (entre > mejor) { mejor = entre; umbral = t; contraste = mF - mB; oscuro = mB; }
  }
  return { umbral, contraste, oscuro };
}

/** Promedio en una ventana de (2r+1)² con la imagen integral (bordes recortados) */
function promedioCaja(v: ArrayLike<number>, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  const integral = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += v[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + fila;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Cierre convexo (cadena monótona) */
function cierreConvexo(p: Punto[]): Punto[] {
  const pts = [...p].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const abajo: Punto[] = [], arriba: Punto[] = [];
  for (const q of pts) {
    while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], q) <= 0) abajo.pop();
    abajo.push(q);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], q) <= 0) arriba.pop();
    arriba.push(q);
  }
  abajo.pop(); arriba.pop();
  return abajo.concat(arriba);
}

function interseccion(a1: Punto, a2: Punto, b1: Punto, b2: Punto): Punto | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/**
 * De un contorno convexo, las 4 esquinas: se van sacando los vértices que
 * menos área aportan (las esquinas redondeadas y el ruido de los bordes).
 * Después cada esquina se corrige cruzando los lados de verdad (el tramo más
 * largo del contorno en cada lado): una esquina doblada o redondeada no
 * achica la hoja.
 */
function cuatroEsquinas(cierre: Punto[]): Punto[] | null {
  if (cierre.length < 4) return null;
  const idx = cierre.map((_, i) => i);
  while (idx.length > 4) {
    let menor = Infinity, sacar = 0;
    for (let i = 0; i < idx.length; i++) {
      const a = cierre[idx[(i - 1 + idx.length) % idx.length]], b = cierre[idx[i]], c = cierre[idx[(i + 1) % idx.length]];
      const area = Math.abs(cruz(a, b, c));
      if (area < menor) { menor = area; sacar = i; }
    }
    idx.splice(sacar, 1);
  }
  const n = cierre.length;
  const lados = idx.map((desde, k) => {
    const hasta = idx[(k + 1) % 4];
    let mejor: [Punto, Punto] = [cierre[desde], cierre[hasta]], largo = -1;
    for (let i = desde; i !== hasta; i = (i + 1) % n) {
      const a = cierre[i], b = cierre[(i + 1) % n], l = dist(a, b);
      if (l > largo) { largo = l; mejor = [a, b]; }
    }
    return mejor;
  });
  const diagonal = dist(cierre[idx[0]], cierre[idx[2]]);
  return idx.map((i, k) => {
    const previo = lados[(k + 3) % 4], este = lados[k];
    const cruce = interseccion(previo[0], previo[1], este[0], este[1]);
    return cruce && dist(cruce, cierre[i]) < diagonal * 0.08 ? cruce : cierre[i];
  });
}

/**
 * Las esquinas de la hoja en una imagen chica (unos 300 px de lado: se usa en
 * cada cuadro de la cámara), o null si no hay una hoja creíble.
 */
export function detectarHoja(img: Imagen): Esquinas | null {
  const { width: w, height: h, data } = img;
  const n = w * h;
  // "Blancura": el canal más bajo. El papel blanco lo tiene alto; la madera,
  // un mantel o una mesa de color, bajo (aunque se vean claros).
  const blancura = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    blancura[i] = Math.min(data[j], data[j + 1], data[j + 2]);
  }
  // Suavizar: el texto y los renglones no parten la hoja en pedazos
  const suave = promedioCaja(blancura, w, h, Math.max(1, Math.round(Math.min(w, h) / 120)));
  const v = new Uint8Array(n);
  for (let i = 0; i < n; i++) v[i] = suave[i];
  const { umbral, contraste, oscuro } = otsu(v);
  if (contraste < 28) return null; // hoja sobre algo igual de claro: no se distingue

  // La mancha clara más grande (vecinos de a 4)
  const marca = new Int32Array(n);
  const cola = new Int32Array(n);
  let mejorTam = 0, mejorEtiqueta = 0, etiqueta = 0;
  for (let s = 0; s < n; s++) {
    if (marca[s] || v[s] <= umbral) continue;
    etiqueta++;
    let ini = 0, fin = 0;
    cola[fin++] = s; marca[s] = etiqueta;
    while (ini < fin) {
      const p = cola[ini++], x = p % w;
      if (x > 0 && !marca[p - 1] && v[p - 1] > umbral) { marca[p - 1] = etiqueta; cola[fin++] = p - 1; }
      if (x < w - 1 && !marca[p + 1] && v[p + 1] > umbral) { marca[p + 1] = etiqueta; cola[fin++] = p + 1; }
      if (p >= w && !marca[p - w] && v[p - w] > umbral) { marca[p - w] = etiqueta; cola[fin++] = p - w; }
      if (p + w < n && !marca[p + w] && v[p + w] > umbral) { marca[p + w] = etiqueta; cola[fin++] = p + w; }
    }
    if (fin > mejorTam) { mejorTam = fin; mejorEtiqueta = etiqueta; }
  }
  if (mejorTam < 0.12 * n) return null;

  // La parte de la hoja que quedó en sombra no pasa el umbral, pero se llega
  // a ella por zonas parejas: la sombra oscurece menos de un nivel por píxel
  // y el borde de la hoja contra la mesa, decenas. Se suma lo que se alcanza
  // sin cruzar un borde (el gradiente no depende de la dirección en que se
  // recorre: bajar "de a poco" a lo largo de un borde torcido no cuela).
  const borde = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = v[p + 1] - v[p - 1], gy = v[p + w] - v[p - w];
      borde[p] = Math.abs(gx) + Math.abs(gy) > 8 ? 1 : 0;
    }
  }
  let ini = 0, fin = 0;
  for (let p = 0; p < n; p++) if (marca[p] === mejorEtiqueta) cola[fin++] = p;
  const piso = oscuro + 4;
  while (ini < fin) {
    const p = cola[ini++], x = p % w;
    const vecinos = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p + w < n ? p + w : -1];
    for (const q of vecinos) {
      if (q < 0 || marca[q] === mejorEtiqueta || borde[q] || v[q] <= piso) continue;
      marca[q] = mejorEtiqueta;
      cola[fin++] = q;
    }
  }

  // El contorno alcanza con el primer y el último píxel de cada fila
  const extremos: Punto[] = [];
  for (let y = 0; y < h; y++) {
    let izq = -1, der = -1;
    for (let x = 0; x < w; x++) {
      if (marca[y * w + x] === mejorEtiqueta) { if (izq < 0) izq = x; der = x; }
    }
    if (izq >= 0) { extremos.push({ x: izq, y }, { x: der, y }); }
  }
  const esquinas = cuatroEsquinas(cierreConvexo(extremos));
  if (!esquinas) return null;
  const e = ordenarEsquinas(esquinas);
  // Si "la hoja" es todo el cuadro, en realidad no se encontró el borde
  if (areaPoligono(e) > 0.96 * n) return null;
  if (!esquinasCreibles(e, w, h)) return null;
  const fino = refinarLados(promedioCaja(blancura, w, h, 1), w, h, e);
  const final = esquinasCreibles(fino, w, h) ? fino : e;
  // Una "hoja" que se sale del cuadro o que apoya dos esquinas en el borde es
  // casi siempre la mesa (clara, con luz de costado) pegada al papel: mejor
  // no adivinar y dejar que la persona ajuste
  if (final.some(q => q.x < -1 || q.y < -1 || q.x > w || q.y > h)) return null;
  if (final.filter(q => Math.min(q.x, q.y, w - 1 - q.x, h - 1 - q.y) <= 2).length >= 2) return null;
  return adentro(final, 1);
}

/**
 * Para las esquinas que pone la persona a mano: que formen una hoja (convexa,
 * sin lados de largo cero ni cruzados). Más permisivo que la detección: una
 * boleta chica en una foto grande vale.
 */
export function formanHoja(e: Esquinas, width: number, height: number): boolean {
  if (areaPoligono(e) < 0.01 * width * height) return false;
  const lado = Math.max(width, height) * 0.02;
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = e[(i + 3) % 4], b = e[i], c = e[(i + 1) % 4];
    if (dist(b, c) < lado) return false;
    const z = cruz(b, c, a);
    if (z === 0 || (signo !== 0 && Math.sign(z) !== signo)) return false;
    signo = Math.sign(z);
  }
  return true;
}

/**
 * Corre cada esquina `px` píxeles hacia el centro. Al enderezar, la foto se
 * agranda: un error de un píxel en el cuadro chico deja un filo de mesa en
 * el borde de la página. Recortar apenas adentro no se nota (es margen).
 */
function adentro(e: Esquinas, px: number): Esquinas {
  const cx = e.reduce((s, q) => s + q.x, 0) / 4, cy = e.reduce((s, q) => s + q.y, 0) / 4;
  return e.map(q => {
    const d = Math.hypot(cx - q.x, cy - q.y) || 1;
    return { x: q.x + (cx - q.x) / d * px * Math.SQRT2, y: q.y + (cy - q.y) / d * px * Math.SQRT2 };
  }) as Esquinas;
}

function muestra(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x = Math.min(Math.max(x, 0), w - 1.001);
  y = Math.min(Math.max(y, 0), h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  const arriba = v[i] + (v[i + 1] - v[i]) * fx, abajo = v[i + w] + (v[i + w + 1] - v[i + w]) * fx;
  return arriba + (abajo - arriba) * fy;
}

/** Recta por mínimos cuadrados totales: pasa por el centro de los puntos, en su dirección principal */
function ajustarRecta(p: Punto[]): [Punto, Punto] {
  const cx = p.reduce((s, q) => s + q.x, 0) / p.length, cy = p.reduce((s, q) => s + q.y, 0) / p.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const q of p) { sxx += (q.x - cx) ** 2; syy += (q.y - cy) ** 2; sxy += (q.x - cx) * (q.y - cy); }
  const ang = Math.atan2(2 * sxy, sxx - syy) / 2;
  return [{ x: cx, y: cy }, { x: cx + Math.cos(ang), y: cy + Math.sin(ang) }];
}

const distanciaARecta = (q: Punto, [a, b]: [Punto, Punto]) =>
  Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);

/**
 * El borde de verdad de cada lado: donde la blancura cae más rápido al salir
 * de la hoja (no depende de cuánto contraste haya de cada lado, como un
 * umbral único: del lado iluminado el umbral deja el borde afuera). Se mide
 * en varios puntos a lo largo del lado, se ajusta una recta y las esquinas
 * son los cruces de las rectas.
 */
function refinarLados(v: Float32Array, w: number, h: number, e: Esquinas): Esquinas {
  const cx = e.reduce((s, q) => s + q.x, 0) / 4, cy = e.reduce((s, q) => s + q.y, 0) / 4;
  const alcance = Math.max(3, Math.round(Math.min(w, h) / 70));
  const lados: [Punto, Punto][] = [];
  for (let k = 0; k < 4; k++) {
    const a = e[k], b = e[(k + 1) % 4];
    const dx = b.x - a.x, dy = b.y - a.y, largo = Math.hypot(dx, dy);
    let nx = -dy / largo, ny = dx / largo;
    if ((cx - (a.x + b.x) / 2) * nx + (cy - (a.y + b.y) / 2) * ny > 0) { nx = -nx; ny = -ny; } // hacia afuera
    const puntos: Punto[] = [];
    for (let i = 2; i <= 22; i++) {
      const t = i / 24, px = a.x + dx * t, py = a.y + dy * t;
      let mejor = 0, donde = 0;
      for (let s = -alcance; s <= alcance; s += 0.25) {
        // Bajada de adentro (papel claro) hacia afuera (mesa)
        const caida = muestra(v, w, h, px + nx * (s - 0.5), py + ny * (s - 0.5)) - muestra(v, w, h, px + nx * (s + 0.5), py + ny * (s + 0.5));
        if (caida > mejor) { mejor = caida; donde = s; }
      }
      if (mejor > 8) puntos.push({ x: px + nx * donde, y: py + ny * donde });
    }
    if (puntos.length < 8) { lados.push([a, b]); continue; }
    // Una letra o una mancha cerca del borde: se descarta lo que se aparta y se ajusta de nuevo
    let recta = ajustarRecta(puntos);
    const cerca = puntos.filter(q => distanciaARecta(q, recta) < 1);
    if (cerca.length >= 6) recta = ajustarRecta(cerca);
    lados.push(recta);
  }
  const diagonal = Math.hypot(e[2].x - e[0].x, e[2].y - e[0].y);
  return e.map((q, k) => {
    const previo = lados[(k + 3) % 4], este = lados[k];
    const cruce = interseccion(previo[0], previo[1], este[0], este[1]);
    return cruce && dist(cruce, q) < diagonal * 0.04 ? cruce : q;
  }) as Esquinas;
}

// ── Enderezar ──

/** Matriz 3×3 (fila por fila, h8 = 1) que lleva cada punto de `desde` a `hasta` */
export function homografia(desde: Esquinas, hasta: Esquinas): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = desde[i], { x: X, y: Y } = hasta[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  // Eliminación de Gauss con pivoteo
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let f = c + 1; f < 8; f++) if (Math.abs(A[f][c]) > Math.abs(A[piv][c])) piv = f;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('Las esquinas no forman una hoja');
    for (let f = 0; f < 8; f++) {
      if (f === c) continue;
      const k = A[f][c] / A[c][c];
      for (let j = c; j < 9; j++) A[f][j] -= k * A[c][j];
    }
  }
  return [...A.map((fila, i) => fila[8] / fila[i]), 1];
}

export function aplicarHomografia(H: number[], p: Punto): Punto {
  const d = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

// Proporciones de las hojas de siempre (alto / ancho)
const PAPELES = [Math.SQRT2 /* A4 */, 330 / 216 /* oficio */, 279.4 / 215.9 /* carta */, 355.6 / 215.9 /* legal */];

/**
 * El tamaño de la página enderezada: la proporción medida (con perspectiva
 * no es exacta: si se parece a una hoja de siempre, se usa esa) y el lado
 * largo entre `minimo` y `maximo` px (~150 ppp en una A4 con 1754).
 */
export function medidasDeSalida(e: Esquinas, maximo = 1754, minimo = 1100): { ancho: number; alto: number } {
  const ancho0 = (dist(e[0], e[1]) + dist(e[3], e[2])) / 2;
  const alto0 = (dist(e[0], e[3]) + dist(e[1], e[2])) / 2;
  const vertical = alto0 >= ancho0;
  let prop = vertical ? alto0 / ancho0 : ancho0 / alto0;
  for (const p of PAPELES) if (Math.abs(prop / p - 1) < 0.06) { prop = p; break; }
  const largo = Math.round(Math.min(maximo, Math.max(minimo, Math.max(ancho0, alto0))));
  const corto = Math.max(1, Math.round(largo / prop));
  return vertical ? { ancho: corto, alto: largo } : { ancho: largo, alto: corto };
}

/** La hoja de `fuente` delimitada por `e`, derecha, en un rectángulo de ancho × alto */
export function enderezar(fuente: Imagen, e: Esquinas, ancho: number, alto: number): Imagen {
  const H = homografia(esquinasDelCuadro(ancho, alto), e);
  const { data: s, width: w, height: h } = fuente;
  const out = new Uint8ClampedArray(ancho * alto * 4);
  for (let v = 0; v < alto; v++) {
    for (let u = 0; u < ancho; u++) {
      const d = H[6] * u + H[7] * v + H[8];
      let x = (H[0] * u + H[1] * v + H[2]) / d;
      let y = (H[3] * u + H[4] * v + H[5]) / d;
      x = Math.min(Math.max(x, 0), w - 1.001);
      y = Math.min(Math.max(y, 0), h - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
      const o = (v * ancho + u) * 4;
      for (let c = 0; c < 3; c++) {
        const arriba = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const abajo = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        out[o + c] = arriba + (abajo - arriba) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ancho, height: alto };
}

export function girar(img: Imagen, giro: Giro): Imagen {
  if (giro === 0) return img;
  const { data: s, width: w, height: h } = img;
  const anchoNuevo = giro === 180 ? w : h, altoNuevo = giro === 180 ? h : w;
  const out = new Uint8ClampedArray(s.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A dónde va (x, y) girando en el sentido de las agujas del reloj
      const [nx, ny] = giro === 90 ? [h - 1 - y, x] : giro === 180 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
      const i = (y * w + x) * 4, o = (ny * anchoNuevo + nx) * 4;
      out[o] = s[i]; out[o + 1] = s[i + 1]; out[o + 2] = s[i + 2]; out[o + 3] = s[i + 3];
    }
  }
  return { data: out, width: anchoNuevo, height: altoNuevo };
}

// ── Limpiar ──

function luminancia(img: Imagen): Uint8Array {
  const { data, width, height } = img;
  const L = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    L[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  return L;
}

function percentil(hist: Uint32Array, total: number, p: number): number {
  let acum = 0;
  const meta = total * p;
  for (let t = 0; t < 256; t++) { acum += hist[t]; if (acum >= meta) return t; }
  return 255;
}

/**
 * La luz que le llega al papel en cada punto: por bloques, el gris del papel
 * (lo más claro de cada bloque), suavizado e interpolado. Lo oscuro grande
 * (una foto, un dibujo pintado) no se toma por sombra: hay un piso.
 */
function luzDelPapel(L: Uint8Array, w: number, h: number): Float32Array {
  const lado = Math.max(8, Math.round(Math.max(w, h) / 40));
  const gw = Math.ceil(w / lado), gh = Math.ceil(h / lado);
  const grilla = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  const histTotal = new Uint32Array(256);
  for (let i = 0; i < L.length; i++) histTotal[L[i]]++;
  const piso = percentil(histTotal, L.length, 0.9) * 0.55;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      let total = 0;
      for (let y = gy * lado; y < Math.min(h, (gy + 1) * lado); y++) {
        for (let x = gx * lado; x < Math.min(w, (gx + 1) * lado); x++) { hist[L[y * w + x]]++; total++; }
      }
      grilla[gy * gw + gx] = Math.max(piso, percentil(hist, total, 0.9));
    }
  }
  // Un bloque lleno de texto o con un dibujo chico queda más oscuro que sus
  // vecinos: el máximo de los vecinos lo corrige, y el promedio suaviza
  const maximo = new Float32Array(grilla.length);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = gy + dy, xx = gx + dx;
      if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) m = Math.max(m, grilla[yy * gw + xx]);
    }
    maximo[gy * gw + gx] = m;
  }
  const suave = promedioCaja(maximo, gw, gh, 1);
  // Interpolar entre los centros de los bloques
  const luz = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gyf = Math.min(Math.max((y + 0.5) / lado - 0.5, 0), gh - 1);
    const gy0 = Math.floor(gyf), gy1 = Math.min(gy0 + 1, gh - 1), fy = gyf - gy0;
    for (let x = 0; x < w; x++) {
      const gxf = Math.min(Math.max((x + 0.5) / lado - 0.5, 0), gw - 1);
      const gx0 = Math.floor(gxf), gx1 = Math.min(gx0 + 1, gw - 1), fx = gxf - gx0;
      const a = suave[gy0 * gw + gx0] + (suave[gy0 * gw + gx1] - suave[gy0 * gw + gx0]) * fx;
      const b = suave[gy1 * gw + gx0] + (suave[gy1 * gw + gx1] - suave[gy1 * gw + gx0]) * fx;
      luz[y * w + x] = Math.max(1, a + (b - a) * fy);
    }
  }
  return luz;
}

// Después de sacar la sombra: lo más oscuro se vuelve negro y el papel blanco
const NEGRO = 40, BLANCO = 235;

function sinSombra(img: Imagen): Imagen {
  const { data, width: w, height: h } = img;
  const luz = luzDelPapel(luminancia(img), w, h);
  const out = new Uint8ClampedArray(data.length);
  const k = 255 / (BLANCO - NEGRO);
  for (let i = 0, j = 0; i < luz.length; i++, j += 4) {
    const f = 255 / luz[i];
    for (let c = 0; c < 3; c++) out[j + c] = (data[j + c] * f - NEGRO) * k;
    out[j + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

function niveles(img: Imagen): Imagen {
  const L = luminancia(img);
  const hist = new Uint32Array(256);
  for (let i = 0; i < L.length; i++) hist[L[i]]++;
  const bajo = percentil(hist, L.length, 0.01), alto = percentil(hist, L.length, 0.99);
  if (alto - bajo < 40) return img;
  const k = 255 / (alto - bajo);
  const out = new Uint8ClampedArray(img.data.length);
  for (let j = 0; j < out.length; j += 4) {
    for (let c = 0; c < 3; c++) out[j + c] = (img.data[j + c] - bajo) * k;
    out[j + 3] = 255;
  }
  return { data: out, width: img.width, height: img.height };
}

function blancoYNegro(img: Imagen): Imagen {
  const limpia = sinSombra(img);
  const { width: w, height: h } = limpia;
  const L = luminancia(limpia);
  const media = promedioCaja(L, w, h, Math.max(4, Math.round(Math.max(w, h) / 40)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    // Más oscuro que la zona (Bradley), o directamente oscuro
    const tinta = L[i] < media[i] * 0.85 || L[i] < 70;
    const valor = tinta ? 0 : 255;
    out[j] = out[j + 1] = out[j + 2] = valor;
    out[j + 3] = 255;
  }
  return { data: out, width: w, height: h };
}

export function aplicarFiltro(img: Imagen, filtro: Filtro): Imagen {
  if (filtro === 'documento') return sinSombra(img);
  if (filtro === 'byn') return blancoYNegro(img);
  return niveles(img);
}
