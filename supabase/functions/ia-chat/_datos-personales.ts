/**
 * SMT EstudIA — Datos personales que no salen al proveedor de IA.
 *
 * Los modelos corren fuera del país (Claude, vía OpenRouter). Antes de
 * mandar algo que escribió alguien de la escuela:
 *  - Los datos de contacto (mails, teléfonos, DNI, usuarios de redes) se
 *    tapan y no vuelven: no hacen falta para estudiar ni para escuchar.
 *  - Los nombres del padrón de la escuela (estudiantes, equipo, familias) se
 *    cambian por marcas [N1], [N2]… y en lo que responde el modelo las marcas
 *    vuelven a ser el nombre: el chico lee "Juan", el proveedor nunca lo vio.
 *
 * Es minimización, no garantía: un nombre que no está en el padrón (una tía,
 * un vecino) pasa igual. Por eso el consentimiento dice "minimizamos", no
 * "nunca".
 *
 * COPIA IDÉNTICA en migue/ e ia-chat/ (cada función se publica con sus
 * propios archivos): si cambiás una, cambiá la otra.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Ruteo de OpenRouter para todo lo que sale de la app: solo endpoints con
 * retención cero (Zero Data Retention). Para Claude son Amazon Bedrock y
 * Google Vertex, al mismo precio; la API propia de Anthropic queda afuera
 * porque guarda los pedidos 30 días. Si hiciera falta volver atrás sin
 * publicar de nuevo: secreto OPENROUTER_SOLO_ZDR=no.
 */
export function proveedorPrivado(): { zdr: true } | undefined {
  return Deno.env.get('OPENROUTER_SOLO_ZDR') === 'no' ? undefined : { zdr: true };
}

/** Minúsculas y sin tildes, para comparar. */
export function plegar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Nombres y apellidos que también son palabras de todos los días. En
 * minúscula se dejan ("las flores", "la guerra", "el mercado"); con
 * mayúscula se tapan igual.
 */
export const COMUNES = new Set([
  'luz', 'paz', 'sol', 'mar', 'flor', 'flores', 'rosa', 'rosas', 'rosario', 'blanca', 'blanco',
  'victoria', 'pilar', 'cruz', 'leon', 'angel', 'angeles', 'esperanza', 'gracia', 'nieves',
  'estrella', 'milagros', 'consuelo', 'aurora', 'celeste', 'margarita', 'violeta', 'luna',
  'cielo', 'abril', 'mayo', 'julio', 'agosto', 'domingo', 'alba', 'azul', 'candela', 'lucero',
  'paloma', 'perla', 'salvador', 'soledad', 'trinidad', 'clara', 'alegria', 'dulce', 'iris',
  'rey', 'reina', 'reyes', 'campos', 'rios', 'torres', 'romero', 'castillo', 'guerra', 'moreno',
  'delgado', 'rubio', 'calvo', 'bravo', 'prieto', 'vega', 'roca', 'pena', 'montes', 'lagos',
  'villa', 'iglesias', 'molina', 'santos', 'lobo', 'cordero', 'toro', 'pastor', 'mesa',
  'sierra', 'costa', 'puerto', 'ramos', 'nieto', 'caballero', 'cano', 'franco', 'hidalgo',
  'manso', 'pardo', 'rojas', 'valle', 'fuentes', 'cortes', 'mora', 'palacios', 'prado', 'rico',
  'sala', 'salas', 'salinas', 'plaza', 'paredes', 'barrios', 'bustos', 'coronel', 'correa',
  'mercado', 'robles', 'arce', 'cejas', 'frias', 'rosales', 'sarmiento', 'oliva', 'bueno',
  'medina', 'mendoza', 'cordoba', 'toledo', 'santiago', 'miranda', 'vera', 'leal', 'justo',
  'clemente', 'modesto', 'severo', 'serena', 'constancia', 'primavera', 'cuevas', 'parra',
  'crespo', 'herrero', 'sosa', 'marques', 'gallardo',
  // Formas verbales y palabras que coinciden con nombres ("¿tomás el valor?")
  'tomas', 'alma', 'rocio', 'dolores', 'mercedes', 'plata', 'rueda', 'fuente', 'valle', 'gloria',
  'felicidad', 'concepcion', 'asuncion', 'belen', 'amparo', 'socorro', 'remedios',
  'fe', 'casas', 'iglesia', 'puente', 'castro',
]);

/**
 * Pedazos de nombres compuestos que no son nombres ("María del Valle", "De
 * los Santos"): no entran al padrón, o se taparía "del" o "los" en cualquier
 * texto.
 */
const NUNCA_NOMBRE = new Set([
  'del', 'los', 'las', 'san', 'santa', 'santo', 'dios', 'don', 'dona', 'van', 'von', 'der',
  'die', 'mac', 'para', 'por', 'con', 'que', 'una', 'uno', 'jr', 'sr', 'sra',
]);

// ── Datos de contacto ──

const MAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu;
const RED_SOCIAL = /\b(?:https?:\/\/)?(?:www\.)?(?:instagram|facebook|fb|tiktok|twitter|x|snapchat|youtube|twitch)\.com\/[^\s)]+/gi;
const USUARIO = /(^|[\s(])@[\p{L}\d._]{3,}/gu;
// "+54 9 381 …": el "+" pegado al código de país (en "2x + 3 - 4 - 1" el
// "+" lleva espacio). Celulares argentinos: característica 11, 2xx o 3xx,
// con o sin 15, y al menos 10 dígitos en total ("0381 15 555-1234",
// "3815551234"); una cifra de física ("299792458") tiene menos.
const TEL_INTERNACIONAL = /\+\d{1,3}(?:[\s.-]?\(?\d+\)?){3,}/g;
const TEL_LOCAL = /\b0?(?:11|[23]\d{1,3})[\s-]?(?:15[\s-]?)?\d{3,4}[\s-]?\d{4}\b/g;
const DIGITOS_TELEFONO = 10;
// Un número después de "dni", "cel", "whatsapp"… ("número" no: es de matemática)
const NUMERO_CON_ETIQUETA = /\b(dni|d\.n\.i\.?|documento|cuil|cuit|cel(?:ular)?|tel(?:[eé]fono)?|whats?app|wsp|wpp|llam[aá]me|escrib[ií]me)(\s*(?:es|:|al|nro\.?)?\s*)[\d][\d\s.-]{5,}\d/giu;

/** Tapa mails, teléfonos, DNI y usuarios de redes. No vuelven. */
export function taparContacto(texto: string): string {
  return texto
    .replace(MAIL, '[correo]')
    .replace(RED_SOCIAL, '[red social]')
    .replace(USUARIO, '$1[usuario]')
    .replace(NUMERO_CON_ETIQUETA, (_m, etiqueta: string, sep: string) =>
      `${etiqueta}${sep}${/dni|d\.n\.i|documento|cuil|cuit/i.test(etiqueta) ? '[número]' : '[teléfono]'}`)
    .replace(TEL_INTERNACIONAL, (m) => (m.replace(/\D/g, '').length >= DIGITOS_TELEFONO ? '[teléfono]' : m))
    .replace(TEL_LOCAL, (m) => (m.replace(/\D/g, '').length >= DIGITOS_TELEFONO ? '[teléfono]' : m));
}

/** ¿Quedó algún dato de contacto o marca? (para no guardarlo en la memoria) */
export function tieneDatoPersonal(texto: string): boolean {
  if (/\[(?:N\d+|correo|tel[eé]fono|usuario|n[uú]mero|red social)\]/i.test(texto)) return true;
  if (/@|https?:\/\/|\d{6,}/.test(texto)) return true;
  return taparContacto(texto) !== texto;
}

// ── Padrón de la escuela ──

const CACHE_MS = 10 * 60 * 1000;
const cachePadron = new Map<string, { hasta: number; nombres: Set<string> }>();

function agregarNombres(destino: Set<string>, ...valores: (string | null | undefined)[]) {
  for (const v of valores) {
    for (const parte of (v ?? '').split(/[\s-]+/)) {
      const p = plegar(parte.replace(/[^\p{L}]/gu, ''));
      if (p.length >= 3 && !NUNCA_NOMBRE.has(p)) destino.add(p);
    }
  }
}

/**
 * Nombres y apellidos de quienes están en la escuela: estudiantes y todas las
 * cuentas (equipo y familias). Se guarda 10 minutos en memoria de la función.
 * Si la consulta falla devuelve vacío y lo deja en el log: se sigue
 * respondiendo, solo que sin tapar nombres.
 */
export async function padronDeEscuela(db: SupabaseClient, schoolId: string | null | undefined): Promise<Set<string>> {
  if (!schoolId) return new Set();
  const enCache = cachePadron.get(schoolId);
  if (enCache && enCache.hasta > Date.now()) return enCache.nombres;

  const nombres = new Set<string>();
  try {
    for (const tabla of ['students', 'profiles']) {
      // De a 1000: PostgREST corta ahí aunque se pida más
      for (let desde = 0; desde < 10_000; desde += 1000) {
        const { data, error } = await db.from(tabla).select('first_name, last_name')
          .eq('school_id', schoolId).order('id').range(desde, desde + 999);
        if (error) throw new Error(`${tabla}: ${error.message}`);
        for (const f of (data ?? []) as { first_name?: string; last_name?: string }[]) {
          agregarNombres(nombres, f.first_name, f.last_name);
        }
        if (!data || data.length < 1000) break;
      }
    }
  } catch (e) {
    console.error('padrón de la escuela:', String(e).slice(0, 200));
    return new Set();
  }
  cachePadron.set(schoolId, { hasta: Date.now() + CACHE_MS, nombres });
  return nombres;
}

/** ¿El texto nombra a alguien del padrón? (palabra completa) */
export function nombraAlguien(texto: string, nombres: Set<string>): boolean {
  for (const palabra of texto.match(/\p{L}+/gu) ?? []) {
    const p = plegar(palabra);
    if (p.length < 3 || !nombres.has(p)) continue;
    const mayuscula = palabra[0] !== palabra[0].toLowerCase();
    if (mayuscula || !COMUNES.has(p)) return true;
  }
  return false;
}

/**
 * Cambia nombres del padrón por marcas y las vuelve a cambiar en la
 * respuesta. Una instancia por pedido: la misma persona tiene la misma marca
 * en todo lo que se manda (historial incluido).
 */
export class Seudonimos {
  private aMarca = new Map<string, string>();
  private aNombre = new Map<string, string>();

  constructor(private nombres: Set<string>) {}

  /** Contacto tapado y nombres del padrón cambiados por marcas. */
  tapar(texto: string): string {
    const sinContacto = taparContacto(texto);
    if (this.nombres.size === 0) return sinContacto;
    return sinContacto.replace(/\p{L}+/gu, (palabra) => {
      const p = plegar(palabra);
      if (p.length < 3 || !this.nombres.has(p)) return palabra;
      const mayuscula = palabra[0] !== palabra[0].toLowerCase();
      if (!mayuscula && COMUNES.has(p)) return palabra;
      let marca = this.aMarca.get(p);
      if (!marca) {
        marca = `[N${this.aMarca.size + 1}]`;
        this.aMarca.set(p, marca);
        this.aNombre.set(marca, palabra);
      }
      return marca;
    });
  }

  /** Las marcas vuelven a ser los nombres. */
  destapar(texto: string): string {
    if (this.aNombre.size === 0) return texto;
    return texto.replace(/\[N\d+\]/g, (m) => this.aNombre.get(m) ?? m);
  }

  /**
   * Para destapar mientras llega el stream: una marca puede venir partida
   * entre dos fragmentos ("[N" y "1]"), así que se retiene la cola que
   * todavía podría ser una marca.
   */
  flujo(): { empujar: (delta: string) => string; cerrar: () => string } {
    let cola = '';
    return {
      empujar: (delta: string) => {
        if (this.aNombre.size === 0) return delta;
        cola += delta;
        const corte = cola.search(/\[N?\d*$/);
        const listo = corte >= 0 ? cola.slice(0, corte) : cola;
        cola = corte >= 0 ? cola.slice(corte) : '';
        return this.destapar(listo);
      },
      cerrar: () => {
        const resto = this.destapar(cola);
        cola = '';
        return resto;
      },
    };
  }
}
