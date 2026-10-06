/**
 * Carga de estudiantes (y sus familias) desde una planilla.
 *
 * Las escuelas tienen las listas en Excel, cada una con sus columnas: acá
 * se reconocen por el nombre ("Apellido y nombre", "Documento", "Curso"...)
 * y se valida fila por fila antes de crear nada. Lee .xlsx y .csv (con
 * coma, punto y coma o tabulador, que es como lo guarda Excel en español).
 */

export interface FilaPlanilla {
  /** número de fila en la planilla (la del encabezado es la 1) */
  fila: number;
  apellido: string;
  nombre: string;
  dni: string;
  cursoTexto: string;
  /** año y división leídos del texto del curso ("2° A", "2do A", "2A"...) */
  curso: { year: number; division: string } | null;
  tutor: {
    apellido: string;
    nombre: string;
    dni: string;
    email: string;
    parentesco: string;
  } | null;
}

export interface LecturaPlanilla {
  filas: FilaPlanilla[];
  /** columnas que no se reconocieron (para avisar, no frena) */
  ignoradas: string[];
  /** si falta algo imprescindible, la lectura no sirve */
  error?: string;
}

export const PARENTESCOS = ['madre', 'padre', 'tutor', 'tutora', 'abuela', 'abuelo', 'otro'];

/** El encabezado de la plantilla que se descarga */
export const COLUMNAS_PLANTILLA = ['Curso', 'Apellido', 'Nombre', 'DNI', 'Apellido tutor', 'Nombre tutor', 'DNI tutor', 'Email tutor', 'Parentesco'];

/** Marca de inicio que Excel pone en los CSV (y que necesita para leer bien las tildes) */
const BOM = 0xfeff;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s: string) => sinTildes(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type Campo = 'curso' | 'apellido' | 'nombre' | 'apellidoNombre' | 'dni'
  | 'tApellido' | 'tNombre' | 'tApellidoNombre' | 'tDni' | 'tEmail' | 'parentesco';

/** Qué columna es cada cosa. Primero las del tutor: "dni tutor" no tiene que caer en "dni". */
function campoDe(encabezado: string): Campo | null {
  const k = clave(encabezado);
  if (!k) return null;
  // "D.N.I." queda "d n i": para el DNI se mira sin espacios
  const esDni = /dni|documento|^doc$|nrodoc/.test(k.replace(/ /g, ''));
  const esTutor = /\b(tutor|tutora|familia|familiar|responsable|madre|padre|adulto)\b/.test(k) && !/^parentesco|vinculo|relacion/.test(k);
  if (/^(parentesco|vinculo|relacion)/.test(k)) return 'parentesco';
  if (esTutor) {
    if (/mail|correo/.test(k)) return 'tEmail';
    if (esDni) return 'tDni';
    if (/apellido/.test(k) && /nombre/.test(k)) return 'tApellidoNombre';
    if (/apellido/.test(k)) return 'tApellido';
    if (/nombre/.test(k)) return 'tNombre';
    return null;
  }
  if (/^(curso|ano y division|anio y division|division|grado|ano|anio)\b/.test(k) || k === 'curso') return 'curso';
  if (esDni) return 'dni';
  if (/apellido/.test(k) && /nombre/.test(k)) return 'apellidoNombre';
  if (/apellido/.test(k)) return 'apellido';
  if (/^nombre|nombres/.test(k)) return 'nombre';
  if (/^(estudiante|alumno|alumna)$/.test(k)) return 'apellidoNombre';
  return null;
}

/** "2° A", "2do A", "2A", "2 A", "Segundo A", "2° año A" → { 2, 'A' } */
export function leerCurso(texto: string): { year: number; division: string } | null {
  const t = sinTildes(String(texto ?? '')).toUpperCase().trim();
  if (!t) return null;
  const ordinales: Record<string, number> = { PRIMERO: 1, PRIMER: 1, SEGUNDO: 2, TERCERO: 3, TERCER: 3, CUARTO: 4, QUINTO: 5, SEXTO: 6, SEPTIMO: 7 };
  let year: number | null = null;
  let resto = t;
  const num = t.match(/^(\d)\s*(?:°|º|O|RO|DO|ER|TO|MO|VO|NO)?\.?\s*(?:ANO|ANIO)?\s*/);
  if (num) { year = Number(num[1]); resto = t.slice(num[0].length); }
  else {
    const pal = Object.keys(ordinales).find(o => t.startsWith(o));
    if (pal) { year = ordinales[pal]; resto = t.slice(pal.length).replace(/^\s*(ANO|ANIO)?\s*/, ''); }
  }
  if (!year || year < 1 || year > 7) return null;
  const div = resto.replace(/^[\s\-"'°º]+/, '').match(/^([A-Z]{1,3}|\d{1,2})\b/);
  if (!div) return null;
  return { year, division: div[1] };
}

const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const limpio = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** "Pérez, Juan" o "PEREZ Juan Ignacio" → apellido y nombre */
function partirApellidoNombre(s: string): { apellido: string; nombre: string } {
  const t = limpio(s);
  if (t.includes(',')) {
    const [a, ...n] = t.split(',');
    return { apellido: limpio(a), nombre: limpio(n.join(' ')) };
  }
  const [a, ...n] = t.split(' ');
  return { apellido: a ?? '', nombre: n.join(' ') };
}
/** Las listas suelen venir en mayúsculas: se pasan a nombre propio */
export function nombrePropio(s: string): string {
  const t = limpio(s);
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());
}

/** CSV con separador detectado (coma, punto y coma o tabulador) y comillas */
export function leerCsv(texto: string): string[][] {
  const limpio = (texto.charCodeAt(0) === BOM ? texto.slice(1) : texto);
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

/** De la grilla de celdas a filas validables. El encabezado puede no estar en la primera fila. */
export function interpretar(grilla: unknown[][]): LecturaPlanilla {
  const filasTexto = grilla.map(f => f.map(c => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '').trim())));
  // El encabezado es la primera fila (de las 10 primeras) donde se reconocen al menos dos columnas
  let iEnc = -1;
  let campos: (Campo | null)[] = [];
  for (let i = 0; i < Math.min(10, filasTexto.length); i++) {
    const cs = filasTexto[i].map(campoDe);
    if (cs.filter(Boolean).length >= 2) { iEnc = i; campos = cs; break; }
  }
  if (iEnc < 0) return { filas: [], ignoradas: [], error: 'No encontré el encabezado. La primera fila tiene que decir, por ejemplo: Curso, Apellido, Nombre, DNI.' };

  const tiene = (c: Campo) => campos.includes(c);
  const faltan: string[] = [];
  if (!tiene('dni')) faltan.push('DNI');
  if (!tiene('apellidoNombre') && !(tiene('apellido') && tiene('nombre'))) faltan.push('Apellido y Nombre');
  if (faltan.length) return { filas: [], ignoradas: [], error: `Falta la columna ${faltan.join(' y ')}.` };

  const ignoradas = filasTexto[iEnc].filter((h, j) => h && !campos[j]);
  const filas: FilaPlanilla[] = [];
  for (let i = iEnc + 1; i < filasTexto.length; i++) {
    const r = filasTexto[i];
    if (!r.some(c => c)) continue; // fila vacía
    const v: Partial<Record<Campo, string>> = {};
    campos.forEach((c, j) => { if (c && !v[c]) v[c] = r[j] ?? ''; });

    let { apellido = '', nombre = '' } = v;
    if (v.apellidoNombre && (!apellido || !nombre)) ({ apellido, nombre } = partirApellidoNombre(v.apellidoNombre));
    let tApellido = v.tApellido ?? '', tNombre = v.tNombre ?? '';
    if (v.tApellidoNombre && (!tApellido || !tNombre)) ({ apellido: tApellido, nombre: tNombre } = partirApellidoNombre(v.tApellidoNombre));
    const tDni = soloDigitos(v.tDni);
    const tEmail = limpio(v.tEmail).toLowerCase();
    const hayTutor = Boolean(tDni || tEmail || tApellido || tNombre);
    const par = clave(v.parentesco ?? '');

    filas.push({
      fila: i + 1,
      apellido: nombrePropio(apellido),
      nombre: nombrePropio(nombre),
      dni: soloDigitos(v.dni),
      cursoTexto: limpio(v.curso),
      curso: leerCurso(v.curso ?? ''),
      tutor: hayTutor ? {
        apellido: nombrePropio(tApellido),
        nombre: nombrePropio(tNombre),
        dni: tDni,
        email: tEmail,
        parentesco: PARENTESCOS.includes(par) ? par : 'tutor',
      } : null,
    });
  }
  return { filas, ignoradas };
}

export type EstadoFila =
  | { tipo: 'ok'; cursoNuevo: boolean }
  | { tipo: 'existe' }
  | { tipo: 'error'; motivo: string };

/** Qué va a pasar con cada fila, antes de crear nada */
export function validar(
  filas: FilaPlanilla[],
  ctx: {
    cursos: { year: number; division: string }[];
    dnisExistentes: Set<string>;
    crearCursos: boolean;
    /** si la planilla no trae curso, se usa este */
    cursoFijo: { year: number; division: string } | null;
  },
): EstadoFila[] {
  const vistos = new Set<string>();
  const existeCurso = (c: { year: number; division: string }) => ctx.cursos.some(x => x.year === c.year && x.division.toUpperCase() === c.division);
  return filas.map(f => {
    if (!f.apellido || !f.nombre) return { tipo: 'error', motivo: 'Falta apellido o nombre' };
    if (f.dni.length < 6 || f.dni.length > 9) return { tipo: 'error', motivo: f.dni ? 'DNI inválido' : 'Falta el DNI' };
    if (vistos.has(f.dni)) return { tipo: 'error', motivo: 'DNI repetido en la planilla' };
    vistos.add(f.dni);
    if (ctx.dnisExistentes.has(f.dni)) return { tipo: 'existe' };
    const curso = f.curso ?? (f.cursoTexto ? null : ctx.cursoFijo);
    if (!curso) return { tipo: 'error', motivo: f.cursoTexto ? `No entiendo el curso "${f.cursoTexto}"` : 'Falta el curso' };
    const nuevo = !existeCurso(curso);
    if (nuevo && !ctx.crearCursos) return { tipo: 'error', motivo: `No existe el curso ${curso.year}° ${curso.division}` };
    if (f.tutor && (!f.tutor.apellido || !f.tutor.nombre || (!f.tutor.dni && !f.tutor.email))) {
      return { tipo: 'error', motivo: 'Datos del tutor incompletos (apellido, nombre y DNI o email)' };
    }
    if (f.tutor?.dni && (f.tutor.dni.length < 6 || f.tutor.dni.length > 9)) return { tipo: 'error', motivo: 'DNI del tutor inválido' };
    return { tipo: 'ok', cursoNuevo: nuevo };
  });
}

/** La plantilla vacía, para abrir con Excel (punto y coma y BOM: así la lee bien en español) */
export function plantillaCsv(): string {
  return String.fromCharCode(BOM) + COLUMNAS_PLANTILLA.join(';') + '\r\n';
}

/** Lo cargado, con usuarios y claves, para guardar o reenviar */
export function credencialesCsv(filas: { tipo: string; nombre: string; curso: string; usuario: string; clave: string }[]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return String.fromCharCode(BOM) + ['Tipo;Nombre;Curso;Usuario;Clave inicial', ...filas.map(f => [f.tipo, f.nombre, f.curso, f.usuario, f.clave].map(esc).join(';'))].join('\r\n') + '\r\n';
}
