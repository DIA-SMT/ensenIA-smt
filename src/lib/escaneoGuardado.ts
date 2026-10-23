/**
 * El escaneo en curso de la Biblioteca, guardado en el equipo (IndexedDB)
 * página por página: si la pestaña se muere, se puede seguir.
 *
 * Pasa más de lo que parece: en Android abrir la cámara del celular (el
 * input con `capture`) puede hacer que el sistema mate la pestaña para
 * liberar memoria; en Chrome viejo «Atrás» sale de la página; y una recarga
 * también se lo lleva. Se guarda la foto de cada página con sus bordes,
 * filtro y giro, en el orden de la pila; lo procesado se rehace al seguir.
 *
 * Son fotos que pueden mostrar trabajos de chicos: tienen dueño y se borran
 * al subir el escaneo, al descartarlo, al cerrar sesión y cuando entra otra
 * persona en el equipo (AuthContext, con el resto de los datos locales). Si
 * igual quedara uno de otra cuenta, al leerlo se borra sin mostrarlo.
 *
 * Todo con try/catch: sin IndexedDB (navegador viejo, modo privado) el
 * escáner anda igual que antes, solo que sin esta red.
 */

import type { Esquinas, Filtro, Giro } from './escaner';

const BASE = 'estudia-escaneo';
const FOTOS = 'fotos';
const ESTADO = 'estado';
const CLAVE = 'actual';
/** Lo que pueden ocupar las fotos de un escaneo: cada una pesa 1 o 2 MB, así que entran unas 40 páginas */
export const MAXIMO_GUARDADO = 60 * 1024 * 1024;
/** Un escaneo abandonado no queda para siempre en el equipo */
const VENCE_MS = 7 * 24 * 60 * 60 * 1000;
/** Si la base no contesta en este tiempo, el escáner arranca sin ella */
const ESPERA_MS = 3000;

export interface PaginaGuardada {
  id: string;
  foto: Blob;
  ancho: number;
  alto: number;
  esquinas: Esquinas;
  filtro: Filtro;
  giro: Giro;
}

export interface EscaneoGuardado {
  paginas: PaginaGuardada[];
  /** Alguna página no entró en el equipo: hay que sacarla de nuevo */
  incompleto: boolean;
  /** Cuándo cambió por última vez (ms) */
  actualizado: number;
}

/** 'no-entra': alguna página quedó sin guardar por falta de lugar. 'apagado': este escaneo no se guarda. */
export type ResultadoGuardar = 'ok' | 'no-entra' | 'error' | 'apagado';

interface Estado {
  duenio: string;
  orden: string[];
  datos: Record<string, Omit<PaginaGuardada, 'id' | 'foto'>>;
  incompleto: boolean;
  actualizado: number;
}

// ── La base ──

let base: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!base) {
    base = new Promise<IDBDatabase>((resolver, rechazar) => {
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(FOTOS)) db.createObjectStore(FOTOS);
        if (!db.objectStoreNames.contains(ESTADO)) db.createObjectStore(ESTADO);
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Otra pestaña con una versión más nueva de la app: se suelta para no trabarla
        db.onversionchange = () => { db.close(); base = null; };
        resolver(db);
      };
      pedido.onerror = () => rechazar(pedido.error);
      pedido.onblocked = () => rechazar(new Error('La base del escaneo está bloqueada por otra pestaña.'));
    });
    base.catch(() => { base = null; });
  }
  return base;
}

/**
 * Una transacción sobre las dos tablas. `hacer` arma los pedidos y devuelve
 * cómo leer el resultado cuando termina (antes no está). Todo o nada: si
 * algo falla, no queda nada a medias.
 */
async function transaccion<T>(modo: IDBTransactionMode, hacer: (fotos: IDBObjectStore, estado: IDBObjectStore) => () => T): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolver, rechazar) => {
    const tx = db.transaction([FOTOS, ESTADO], modo);
    let resultado: () => T;
    try {
      resultado = hacer(tx.objectStore(FOTOS), tx.objectStore(ESTADO));
    } catch (err) {
      // Un dato que la base no acepta (put tira en el momento): que no quede lo de antes a medias
      try { tx.abort(); } catch { /* ya terminó */ }
      rechazar(err);
      return;
    }
    tx.oncomplete = () => resolver(resultado());
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error ?? new Error('Se canceló la transacción.'));
  });
}

const vaciar = () => transaccion('readwrite', (fotos, estado) => { fotos.clear(); estado.clear(); return () => undefined; });

const esLugarLleno = (err: unknown) => err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

// De a una operación por vez, en el orden en que se pidieron: un guardado
// viejo no puede llegar después de un borrado
let cola: Promise<unknown> = Promise.resolve();
function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const r = cola.then(tarea, tarea);
  cola = r.catch(() => undefined);
  return r;
}

// Lo que ya está en la base en esta pestaña (id → bytes), para no volver a
// escribir cada foto en cada cambio
let guardadas = new Map<string, number>();
// No se pudo leer lo guardado: no se escribe encima de algo que no se mostró
let apagado = false;

// ── Leer ──

/** El escaneo sin terminar de esta persona, si hay. Uno de otra cuenta o vencido se borra. */
export function leerEscaneo(duenio: string): Promise<EscaneoGuardado | null> {
  const lectura = enCola(async () => {
    apagado = false;
    guardadas = new Map();
    try {
      const { estado, fotos, claves } = await transaccion('readonly', (tFotos, tEstado) => {
        let estado: Estado | undefined;
        let claves: IDBValidKey[] = [];
        const fotos = new Map<string, Blob>();
        const pedido = tEstado.get(CLAVE);
        pedido.onsuccess = () => {
          estado = pedido.result as Estado | undefined;
          for (const id of estado?.orden ?? []) {
            const f = tFotos.get(id);
            f.onsuccess = () => { if (f.result instanceof Blob) fotos.set(id, f.result); };
          }
        };
        const todas = tFotos.getAllKeys();
        todas.onsuccess = () => { claves = todas.result; };
        return () => ({ estado, fotos, claves });
      });
      const vigente = estado && estado.duenio === duenio && Date.now() - estado.actualizado < VENCE_MS;
      const paginas = vigente
        ? estado.orden.filter(id => fotos.has(id) && estado.datos[id]).map(id => ({ id, foto: fotos.get(id)!, ...estado.datos[id] }))
        : [];
      if (!paginas.length) {
        if (estado || claves.length) await vaciar();
        return null;
      }
      // Fotos que no son de ninguna página (quedaron de otra pestaña): afuera
      const sueltas = claves.filter(k => !estado!.orden.includes(String(k)));
      if (sueltas.length) await transaccion('readwrite', f => { sueltas.forEach(k => f.delete(k)); return () => undefined; }).catch(() => undefined);
      paginas.forEach(p => guardadas.set(p.id, p.foto.size));
      return { paginas, incompleto: estado!.incompleto || paginas.length < estado!.orden.length, actualizado: estado!.actualizado };
    } catch (err) {
      console.warn('No se pudo leer el escaneo guardado:', err);
      // Lo que no se puede leer no sirve: se borra para empezar limpio, y si
      // ni eso se puede, este escaneo no se guarda
      await vaciar().catch(() => { apagado = true; });
      return null;
    }
  });
  // Una base que no contesta no frena el escáner: arranca sin ella (y sin
  // guardar, para no pisar lo que no se llegó a leer)
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const espera = new Promise<null>(r => { reloj = setTimeout(() => { apagado = true; r(null); }, ESPERA_MS); });
  return Promise.race([lectura.catch(() => null).finally(() => clearTimeout(reloj)), espera]);
}

// ── Guardar ──

let pendiente: { duenio: string; paginas: PaginaGuardada[]; avisar: ((r: ResultadoGuardar) => void)[] } | null = null;

/**
 * Deja guardado el escaneo tal como está: las fotos nuevas, el orden y los
 * datos de cada página (y saca las que se borraron). Si se juntan varios
 * pedidos mientras se escribe, se guarda solo el último: es el estado
 * completo del momento.
 */
export function guardarEscaneo(duenio: string, paginas: PaginaGuardada[]): Promise<ResultadoGuardar> {
  return new Promise(resolver => {
    if (pendiente) {
      pendiente.duenio = duenio;
      pendiente.paginas = paginas;
      pendiente.avisar.push(resolver);
      return;
    }
    const este = { duenio, paginas, avisar: [resolver] };
    pendiente = este;
    void enCola(async () => {
      if (pendiente === este) pendiente = null;
      const r = await escribir(este.duenio, este.paginas).catch((err): ResultadoGuardar => {
        console.warn('No se pudo guardar el escaneo en el equipo:', err);
        return 'error';
      });
      este.avisar.forEach(f => f(r));
    });
  });
}

async function escribir(duenio: string, paginas: PaginaGuardada[]): Promise<ResultadoGuardar> {
  if (apagado) return 'apagado';
  if (!paginas.length) {
    await vaciar();
    guardadas = new Map();
    return 'ok';
  }
  const quedan = new Set(paginas.map(p => p.id));
  const sobran = [...guardadas.keys()].filter(id => !quedan.has(id));
  let ocupado = paginas.reduce((n, p) => n + (guardadas.get(p.id) ?? 0), 0);
  const nuevas: PaginaGuardada[] = [];
  let noEntran = false;
  for (const p of paginas) {
    if (guardadas.has(p.id)) continue;
    if (ocupado + p.foto.size > MAXIMO_GUARDADO) { noEntran = true; continue; }
    ocupado += p.foto.size;
    nuevas.push(p);
  }

  const intentar = async (conNuevas: PaginaGuardada[], incompleto: boolean) => {
    const enBase = paginas.filter(p => guardadas.has(p.id) || conNuevas.includes(p));
    const estado: Estado = {
      duenio,
      orden: enBase.map(p => p.id),
      datos: Object.fromEntries(enBase.map(p => [p.id, { ancho: p.ancho, alto: p.alto, esquinas: p.esquinas, filtro: p.filtro, giro: p.giro }])),
      incompleto,
      actualizado: Date.now(),
    };
    await transaccion('readwrite', (fotos, tEstado) => {
      conNuevas.forEach(p => fotos.put(p.foto, p.id));
      sobran.forEach(id => fotos.delete(id));
      tEstado.put(estado, CLAVE);
      return () => undefined;
    });
    conNuevas.forEach(p => guardadas.set(p.id, p.foto.size));
    sobran.forEach(id => guardadas.delete(id));
  };

  try {
    await intentar(nuevas, noEntran);
    return noEntran ? 'no-entra' : 'ok';
  } catch (err) {
    // El equipo no tiene más lugar: queda lo que ya estaba (con el orden y los cambios de hoy)
    if (!esLugarLleno(err) || !nuevas.length) throw err;
    await intentar([], true).catch(() => undefined);
    return 'no-entra';
  }
}

// ── Borrar ──

/** Al subir, al descartar, al cerrar sesión o cuando entra otra persona. Nunca falla. */
export function borrarEscaneo(): Promise<void> {
  // Lo que se pida guardar de acá en más va después del borrado, no junto con lo de antes
  pendiente = null;
  return enCola(async () => {
    guardadas = new Map();
    try { await vaciar(); } catch (err) { console.warn('No se pudo borrar el escaneo guardado:', err); }
  });
}
