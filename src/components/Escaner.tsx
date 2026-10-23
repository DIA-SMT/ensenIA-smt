/**
 * Escanear material desde la Biblioteca: el docente apunta el celular a la
 * hoja, la app encuentra los bordes, saca la foto sola cuando la hoja queda
 * quieta, la endereza y la limpia. Página por página, y al final un solo
 * PDF que entra a la Biblioteca como cualquier escaneo (la IA lo lee).
 *
 * Todo pasa en el equipo: nada sale hasta que el docente lo sube. Sin
 * cámara en vivo (permiso negado, navegador viejo) se usa la cámara del
 * celular o fotos de la galería, con el mismo procesado.
 *
 * Cada página queda guardada en el equipo mientras se escanea (lib/
 * escaneoGuardado): si la pestaña se muere, al volver se ofrece seguir.
 *
 * Las cuentas (bordes, enderezar, filtros) están en lib/escaner.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as PEvent } from 'react';
import {
  Camera, Images, X, Flashlight, FlashlightOff, Check, RotateCw, Crop, Trash2, ChevronLeft, ChevronRight,
  RefreshCw, ScanLine, Loader2, Sparkles, Maximize,
} from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { avisar, confirmar } from './ui/avisar';
import { detectarHoja, distanciaEsquinas, escalarEsquinas, ampliarEsquinas, esquinasDelCuadro, ordenarEsquinas, formanHoja, type Esquinas, type Filtro, type Giro, type Punto } from '../lib/escaner';
import { abrirImagen, pixeles, guardarFoto, buscarHoja, procesarPagina, armarPdf, LADO_DETECCION, SIN_MEMORIA, type PaginaLista } from '../lib/escanerNavegador';
import { leerEscaneo, guardarEscaneo, borrarEscaneo, type EscaneoGuardado } from '../lib/escaneoGuardado';

const esSinMemoria = (err: unknown) => err instanceof Error && err.message === SIN_MEMORIA;
import './Escaner.css';

interface Pagina {
  id: string;
  /** La foto, reducida (lib/escanerNavegador LADO_FOTO), y sus medidas */
  foto: Blob;
  ancho: number;
  alto: number;
  /** En píxeles de la foto */
  esquinas: Esquinas;
  filtro: Filtro;
  giro: Giro;
  /** Sube con cada cambio: un resultado viejo no pisa uno nuevo */
  version: number;
  lista?: PaginaLista;
  /** De qué versión es `lista` (mientras se rehace, se sigue mostrando la anterior) */
  listaVersion?: number;
  miniatura?: string;
  error?: string;
}

type Modo =
  | { tipo: 'buscando' } // si quedó un escaneo guardado
  | { tipo: 'recuperar'; escaneo: EscaneoGuardado }
  | { tipo: 'camara'; rehacer?: string }
  | { tipo: 'paginas' }
  | { tipo: 'pagina'; id: string }
  | { tipo: 'bordes'; id: string }
  | { tipo: 'armando' };

interface EscanerProps {
  /** Quién escanea: lo guardado en el equipo es suyo y solo se le ofrece a esa cuenta */
  duenio: string;
  /** Fotos para empezar (por ejemplo, la que se eligió en "Subir") */
  fotos?: File[];
  alListo: (pdf: File) => void;
  alCerrar: () => void;
}

const FILTROS: { valor: Filtro; nombre: string; ayuda: string }[] = [
  { valor: 'documento', nombre: 'Documento', ayuda: 'Papel blanco, sin sombras' },
  { valor: 'color', nombre: 'Color', ayuda: 'Para dibujos y fotos' },
  { valor: 'byn', nombre: 'Blanco y negro', ayuda: 'Lo más nítido para texto, y lo más liviano' },
];

// Cada cuánto se mira el cuadro de la cámara y cuántos cuadros quieto hacen falta
const CADA_MS = 120;
const QUIETOS = 9; // ~1 segundo
const QUIETO = 0.012; // lo que se puede mover una esquina (fracción del lado largo) y seguir "quieta"
const OTRA_HOJA = 0.12; // cuánto tiene que cambiar para que sea otra hoja (o la misma, movida)
const AUTO_CLAVE = 'estudia_escaner_auto';

function leerAuto(): boolean {
  try { return localStorage.getItem(AUTO_CLAVE) !== 'no'; } catch { return true; }
}

function motivoSinCamara(err: unknown): string {
  const nombre = err instanceof DOMException ? err.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'No hay permiso para usar la cámara desde la página. Podés darlo en los ajustes del navegador, o seguir con la cámara del celular.';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No encontramos una cámara en este equipo.';
  if (nombre === 'NotReadableError') return 'La cámara la está usando otra aplicación. Cerrala y probá de nuevo.';
  return 'No se pudo abrir la cámara desde la página.';
}

/** Una dirección para mostrar un archivo en memoria, que se suelta cuando cambia o se cierra */
function useUrlDe(archivo?: Blob): string | null {
  const url = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/** El título de cada vista recibe el foco al aparecer: el lector de pantalla dice dónde se está y el teclado no queda perdido */
function useTituloEnfocado() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return ref;
}

/** Para dibujar algo con proporción ancho:alto lo más grande posible dentro de un contenedor (sin su relleno) */
function useEncajar(ancho: number, alto: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ancho || !alto) return;
    const medir = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const k = Math.min(w / ancho, h / alto);
      setTam({ w: Math.floor(ancho * k), h: Math.floor(alto * k) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho, alto]);
  return { ref, estilo: tam ? { width: tam.w, height: tam.h } : { visibility: 'hidden' as const } };
}

export default function Escaner({ duenio, fotos, alListo, alCerrar }: EscanerProps) {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  // Las páginas al día también fuera del render (procesar y armar el PDF son asincrónicos)
  const paginasRef = useRef<Pagina[]>([]);
  const actualizar = useCallback((cambio: (prev: Pagina[]) => Pagina[]) => {
    paginasRef.current = cambio(paginasRef.current);
    setPaginas(paginasRef.current);
  }, []);
  const [modo, setModo] = useState<Modo>({ tipo: 'buscando' });
  // El filtro de las páginas que vienen (en una referencia: las fotos con las que se abrió se agregan desde una promesa)
  const filtroNuevas = useRef<Filtro>('documento');
  const [anuncio, setAnuncioTexto] = useState('');
  // Un lector de pantalla no repite un texto igual al anterior: se vacía y se vuelve a poner
  const setAnuncio = useCallback((texto: string) => {
    setAnuncioTexto('');
    window.setTimeout(() => setAnuncioTexto(texto), 60);
  }, []);
  const [abriendo, setAbriendo] = useState(0); // fotos de la galería que se están abriendo
  const abriendoRef = useRef(0);
  const armandoRef = useRef(false);
  const urls = useRef(new Set<string>());
  const cola = useRef<Promise<void>>(Promise.resolve());
  const galeriaRef = useRef<HTMLInputElement>(null);
  const camaraNativaRef = useRef<HTMLInputElement>(null);

  // Al cerrar: soltar las imágenes en memoria y cortar lo que quede por procesar
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    const set = urls.current;
    return () => { vivo.current = false; set.forEach(u => URL.revokeObjectURL(u)); set.clear(); };
  }, []);

  // ── Procesar (de a una página por vez: con muchas juntas no alcanza la memoria) ──

  const soltar = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  const procesar = useCallback((p: Pagina) => {
    cola.current = cola.current.then(async () => {
      // Cerrado, borrada o cambiada antes de que le toque: no vale la pena
      const hoy = paginasRef.current.find(x => x.id === p.id);
      if (!vivo.current || !hoy || hoy.version !== p.version) return;
      try {
        const lista = await procesarPagina(p.foto, p.esquinas, p.filtro, p.giro);
        const actual = paginasRef.current.find(x => x.id === p.id);
        if (!vivo.current || !actual || actual.version !== p.version) return;
        const mini = URL.createObjectURL(lista.miniatura);
        urls.current.add(mini);
        soltar(actual.miniatura);
        actualizar(prev => prev.map(x => (x.id === p.id ? { ...x, lista, listaVersion: p.version, miniatura: mini, error: undefined } : x)));
      } catch (err) {
        console.error('No se pudo procesar la página:', err);
        actualizar(prev => prev.map(x => (x.id === p.id && x.version === p.version
          ? { ...x, error: esSinMemoria(err) ? SIN_MEMORIA : 'No se pudo procesar esta página. Probá sacarla de nuevo.' } : x)));
      }
    });
  }, [actualizar]);

  const cambiar = useCallback((id: string, cambio: Partial<Pick<Pagina, 'esquinas' | 'filtro' | 'giro'>>) => {
    const actual = paginasRef.current.find(p => p.id === id);
    if (!actual) return;
    const nueva = { ...actual, ...cambio, version: actual.version + 1, error: undefined };
    actualizar(prev => prev.map(p => (p.id === id ? nueva : p)));
    procesar(nueva);
  }, [actualizar, procesar]);

  const agregar = useCallback((datos: Pick<Pagina, 'foto' | 'ancho' | 'alto' | 'esquinas'>, rehacer?: string) => {
    const vieja = rehacer ? paginasRef.current.find(x => x.id === rehacer) : undefined;
    // Al sacarla de nuevo conserva su filtro
    const p: Pagina = { id: crypto.randomUUID(), ...datos, filtro: vieja?.filtro ?? filtroNuevas.current, giro: 0, version: 0 };
    const n = vieja ? paginasRef.current.indexOf(vieja) + 1 : paginasRef.current.length + 1;
    if (vieja) soltar(vieja.miniatura);
    actualizar(prev => (vieja ? prev.map(x => (x.id === vieja.id ? p : x)) : [...prev, p]));
    procesar(p);
    setAnuncio(vieja ? `Página ${n} sacada de nuevo` : `Página ${n} guardada`);
    if (vieja) setModo({ tipo: 'pagina', id: p.id });
    return p;
  }, [actualizar, procesar, setAnuncio]);

  // Fotos de la galería o de la cámara del celular: mismo camino que la cámara en vivo
  const agregarFotos = useCallback(async (archivos: File[], rehacer?: string) => {
    if (!archivos.length) return;
    abriendoRef.current += archivos.length;
    setAbriendo(abriendoRef.current);
    for (const [i, archivo] of archivos.entries()) {
      if (!vivo.current) return;
      try {
        const img = await abrirImagen(archivo);
        const { blob, ancho, alto } = await guardarFoto(img, img.naturalWidth, img.naturalHeight);
        const { esquinas } = buscarHoja(img, img.naturalWidth, img.naturalHeight);
        const k = ancho / img.naturalWidth;
        agregar({ foto: blob, ancho, alto, esquinas: escalarEsquinas(esquinas, k) }, i === 0 ? rehacer : undefined);
      } catch (err) {
        avisar.error(`No se pudo abrir "${archivo.name}"`, err instanceof Error ? err.message : undefined);
      } finally {
        abriendoRef.current -= 1;
        setAbriendo(abriendoRef.current);
      }
    }
    // A la grilla solo desde la cámara: no sacar a nadie del editor ni del armado
    if (!rehacer) setModo(m => (m.tipo === 'camara' && !m.rehacer ? { tipo: 'paginas' } : m));
  }, [agregar]);

  // ── Lo guardado en el equipo ──

  // Recién se guarda cuando se decidió qué hacer con un escaneo anterior:
  // antes, la pila vacía borraría lo que quedó sin preguntar
  const guardando = useRef(false);
  const inicio = useRef(false);

  /** Arrancar: con las páginas de un escaneo anterior o de cero, y después las fotos con las que se abrió */
  const arrancar = useCallback((anterior?: EscaneoGuardado) => {
    // Una sola vez, aunque React monte dos veces en desarrollo
    if (inicio.current) return;
    inicio.current = true;
    if (anterior?.paginas.length) {
      const recuperadas: Pagina[] = anterior.paginas.map(p => ({ ...p, version: 0 }));
      actualizar(() => recuperadas);
      // Se rehacen desde la foto guardada, con sus bordes, filtro y giro
      recuperadas.forEach(procesar);
      filtroNuevas.current = recuperadas[recuperadas.length - 1].filtro;
      setAnuncio(`Se recuperaron ${recuperadas.length} ${recuperadas.length === 1 ? 'página' : 'páginas'}`);
    }
    guardando.current = true;
    setModo(anterior?.paginas.length || fotos?.length ? { tipo: 'paginas' } : { tipo: 'camara' });
    if (fotos?.length) void agregarFotos(fotos);
  }, [fotos, actualizar, procesar, setAnuncio, agregarFotos]);

  useEffect(() => {
    let vigente = true;
    void leerEscaneo(duenio).then(anterior => {
      if (!vigente || inicio.current) return;
      if (anterior) setModo({ tipo: 'recuperar', escaneo: anterior });
      else arrancar();
    });
    return () => { vigente = false; };
  }, [duenio, arrancar]);

  const empezarDeNuevo = async (anterior: EscaneoGuardado) => {
    const n = anterior.paginas.length;
    const ok = await confirmar({
      titulo: '¿Empezar de nuevo?',
      mensaje: `${n === 1 ? 'Se borra la página guardada' : `Se borran las ${n} páginas guardadas`}. No se subió nada.`,
      accion: 'Borrar y empezar',
      peligro: true,
    });
    if (!ok) return;
    void borrarEscaneo();
    arrancar();
  };

  // Cada cambio que importa (una página nueva, otro orden, bordes, filtro o
  // giro: lo que sube `version`) se guarda. Lo procesado no: se rehace.
  const firma = paginas.map(p => `${p.id}:${p.version}`).join(' ');
  const avisoSinLugar = useRef(false);
  useEffect(() => {
    if (!guardando.current) return;
    void guardarEscaneo(duenio, paginasRef.current).then(r => {
      if (r !== 'no-entra' || avisoSinLugar.current || !vivo.current) return;
      avisoSinLugar.current = true;
      avisar.info('No entran más páginas en el equipo', 'El escaneo sigue, pero si se cierra la pestaña antes de subirlo, las páginas nuevas se pierden.');
    });
  }, [firma, duenio]);

  const elegirFotos = (lista: FileList | null, rehacer?: string) => {
    const archivos = Array.from(lista ?? []);
    if (galeriaRef.current) galeriaRef.current.value = '';
    if (camaraNativaRef.current) camaraNativaRef.current.value = '';
    void agregarFotos(archivos, rehacer);
  };

  // ── Terminar ──

  const terminar = async () => {
    if (!paginasRef.current.length || armandoRef.current) return;
    if (abriendoRef.current > 0) { avisar.info('Todavía se están abriendo fotos', 'Esperá un momento y tocá «Listo» de nuevo.'); return; }
    armandoRef.current = true;
    setModo({ tipo: 'armando' });
    try {
      // Que termine lo que se está procesando
      let anterior: Promise<void> | null = null;
      while (anterior !== cola.current) { anterior = cola.current; await anterior; }
      const listas = paginasRef.current;
      // Sin procesar, con error o con un cambio que no se pudo aplicar: no va al PDF así
      const sinListo = listas.findIndex(p => !p.lista || p.error || p.listaVersion !== p.version);
      if (sinListo >= 0) {
        avisar.error(`La página ${sinListo + 1} no se pudo procesar`, 'Sacala de nuevo o borrala para seguir.');
        setModo({ tipo: 'pagina', id: listas[sinListo].id });
        return;
      }
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
      const titulo = `Escaneo ${fecha}`;
      const pdf = await armarPdf(listas.map(p => p.lista!), titulo);
      alListo(new File([pdf], `${titulo}.pdf`, { type: 'application/pdf' }));
    } catch (err) {
      console.error('No se pudo armar el PDF:', err);
      // Lo que falta bajar (jsPDF) no llega sin señal: las páginas no se pierden
      if (!navigator.onLine) avisar.error('No se pudo armar el PDF sin conexión', 'Las páginas siguen acá: probá de nuevo cuando vuelva la señal.');
      else avisar.error('No se pudo armar el PDF', esSinMemoria(err) ? SIN_MEMORIA : 'Probá de nuevo; si sigue, borrá alguna página.');
      setModo({ tipo: 'paginas' });
    } finally {
      armandoRef.current = false;
    }
  };

  const pedirCierre = async () => {
    if (modo.tipo === 'armando') return;
    // Escape o "atrás" en una vista de adentro vuelve un paso (no ofrece tirar todo)
    if (modo.tipo === 'bordes') { setModo({ tipo: 'pagina', id: modo.id }); return; }
    if (modo.tipo === 'pagina') { setModo({ tipo: 'paginas' }); return; }
    if (modo.tipo === 'camara' && modo.rehacer) { setModo({ tipo: 'pagina', id: modo.rehacer }); return; }
    await pedirDescartar();
  };

  // La X de arriba: cerrar el escáner (preguntando si hay páginas)
  const pedirDescartar = async () => {
    if (!paginasRef.current.length) { alCerrar(); return; }
    const n = paginasRef.current.length;
    const ok = await confirmar({
      titulo: '¿Descartar el escaneo?',
      mensaje: `${n === 1 ? 'Se pierde la página escaneada' : `Se pierden las ${n} páginas escaneadas`}. No se subió nada todavía.`,
      accion: 'Descartar',
      peligro: true,
    });
    if (!ok) return;
    void borrarEscaneo();
    alCerrar();
  };

  const pagina = (id: string) => paginas.find(p => p.id === id);
  const numero = (id: string) => paginas.findIndex(p => p.id === id) + 1;

  return (
    <Dialogo abierto alCerrar={alCerrar} alPedirCierre={() => void pedirCierre()} etiqueta="Escanear material" className="dialogo-escaner">
      <div className="esc">
        <p className="sr-only" aria-live="polite">{anuncio}</p>
        {/* Cámara del celular y galería: también sirven cuando la cámara en vivo no anda */}
        <input ref={galeriaRef} type="file" accept="image/*" multiple hidden
          onChange={e => elegirFotos(e.target.files, modo.tipo === 'camara' ? modo.rehacer : undefined)} />
        <input ref={camaraNativaRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => elegirFotos(e.target.files, modo.tipo === 'camara' ? modo.rehacer : undefined)} />

        {modo.tipo === 'buscando' && <div aria-busy="true" />}

        {modo.tipo === 'recuperar' && (
          <VistaRecuperar
            escaneo={modo.escaneo}
            fotos={fotos?.length ?? 0}
            alSeguir={() => arrancar(modo.escaneo)}
            alEmpezarDeNuevo={() => void empezarDeNuevo(modo.escaneo)}
            alCerrar={alCerrar}
          />
        )}

        {modo.tipo === 'camara' && (
          <VistaCamara
            rehacer={modo.rehacer ? numero(modo.rehacer) : undefined}
            paginas={paginas}
            abriendo={abriendo}
            alCapturar={(datos) => agregar(datos, modo.rehacer)}
            alGaleria={() => galeriaRef.current?.click()}
            alCamaraNativa={() => camaraNativaRef.current?.click()}
            alVerPaginas={() => setModo(modo.rehacer ? { tipo: 'pagina', id: modo.rehacer } : { tipo: 'paginas' })}
            alCerrar={() => void pedirDescartar()}
          />
        )}

        {modo.tipo === 'paginas' && (
          <VistaPaginas
            paginas={paginas}
            abriendo={abriendo}
            alAbrir={id => setModo({ tipo: 'pagina', id })}
            alAgregar={() => setModo({ tipo: 'camara' })}
            alGaleria={() => galeriaRef.current?.click()}
            alTerminar={() => void terminar()}
            alCerrar={() => void pedirDescartar()}
          />
        )}

        {modo.tipo === 'pagina' && pagina(modo.id) && (
          <VistaPagina
            pagina={pagina(modo.id)!}
            numero={numero(modo.id)}
            total={paginas.length}
            alVolver={() => setModo({ tipo: 'paginas' })}
            alFiltro={f => { cambiar(modo.id, { filtro: f }); filtroNuevas.current = f; }}
            alFiltroATodas={f => {
              paginasRef.current.filter(p => p.filtro !== f).forEach(p => cambiar(p.id, { filtro: f }));
              filtroNuevas.current = f;
              setAnuncio(`${FILTROS.find(x => x.valor === f)?.nombre} en todas las páginas`);
            }}
            alGirar={() => { const p = pagina(modo.id)!; cambiar(modo.id, { giro: ((p.giro + 90) % 360) as Giro }); }}
            alBordes={() => setModo({ tipo: 'bordes', id: modo.id })}
            alRehacer={() => setModo({ tipo: 'camara', rehacer: modo.id })}
            alMover={d => {
              const i = paginasRef.current.findIndex(p => p.id === modo.id), j = i + d;
              if (i < 0 || j < 0 || j >= paginasRef.current.length) return;
              actualizar(prev => {
                const copia = [...prev];
                [copia[i], copia[j]] = [copia[j], copia[i]];
                return copia;
              });
              setAnuncio(`Ahora es la página ${j + 1}`);
            }}
            alBorrar={() => {
              const i = paginasRef.current.findIndex(p => p.id === modo.id);
              soltar(paginasRef.current[i]?.miniatura);
              actualizar(prev => prev.filter(p => p.id !== modo.id));
              setAnuncio(`Página ${i + 1} borrada`);
              setModo(paginasRef.current.length ? { tipo: 'paginas' } : { tipo: 'camara' });
            }}
          />
        )}

        {modo.tipo === 'bordes' && pagina(modo.id) && (
          <EditorBordes
            pagina={pagina(modo.id)!}
            alAceptar={e => { cambiar(modo.id, { esquinas: e }); setModo({ tipo: 'pagina', id: modo.id }); }}
            alCancelar={() => setModo({ tipo: 'pagina', id: modo.id })}
          />
        )}

        {modo.tipo === 'armando' && (
          <div className="esc-armando" role="status">
            <Loader2 size={34} className="esc-gira" aria-hidden="true" />
            <p>Armando el PDF con {paginas.length} {paginas.length === 1 ? 'página' : 'páginas'}…</p>
          </div>
        )}
      </div>
    </Dialogo>
  );
}

// ── Un escaneo que quedó sin terminar ──

function cuandoFue(ms: number): string {
  const d = new Date(ms);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(new Date()) - dia(d)) / 86_400_000);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dias === 0) return `de hoy a las ${hora}`;
  if (dias === 1) return `de ayer a las ${hora}`;
  return `del ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })}`;
}

function VistaRecuperar({ escaneo, fotos, alSeguir, alEmpezarDeNuevo, alCerrar }: {
  escaneo: EscaneoGuardado;
  /** Fotos con las que se abrió el escáner: se suman al final */
  fotos: number;
  alSeguir: () => void;
  alEmpezarDeNuevo: () => void;
  alCerrar: () => void;
}) {
  const titulo = useTituloEnfocado();
  // La primera, como se sacó: alcanza para reconocerlo (todas juntas no entran en la memoria de un celular viejo)
  const url = useUrlDe(escaneo.paginas[0]?.foto);
  const n = escaneo.paginas.length;
  const paginasTexto = `${n} ${n === 1 ? 'página' : 'páginas'}`;
  return (
    <div className="esc-recuperar">
      <header className="esc-barra">
        <button type="button" className="esc-btn esc-btn-icono" aria-label="Cerrar el escáner" onClick={alCerrar}><X size={20} /></button>
        <h2 className="esc-titulo" tabIndex={-1} ref={titulo}>Escaneo sin terminar</h2>
        <span />
      </header>
      <div className="esc-escenario">
        <div className="esc-sin-camara">
          {url && <img src={url} alt="La primera página, como se sacó" className="esc-recuperar-foto" />}
          <p>Quedó guardado en este equipo un escaneo de {paginasTexto}, {cuandoFue(escaneo.actualizado)}. Todavía no se subió.</p>
          {escaneo.incompleto && <p className="esc-sub">Algunas páginas no entraron en el equipo: hay que sacarlas de nuevo.</p>}
          {fotos > 0 && <p className="esc-sub">{fotos === 1 ? 'La foto que elegiste se suma al final.' : 'Las fotos que elegiste se suman al final.'}</p>}
          <div className="esc-sin-camara-botones">
            <button type="button" className="esc-btn esc-btn-grande esc-btn-primario" onClick={alSeguir}>
              <Check size={18} /> Seguir con el escaneo de {paginasTexto}
            </button>
            <button type="button" className="esc-btn esc-btn-grande" onClick={alEmpezarDeNuevo}>
              <RefreshCw size={18} /> Empezar de nuevo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cámara en vivo ──

interface VistaCamaraProps {
  rehacer?: number;
  paginas: Pagina[];
  abriendo: number;
  alCapturar: (datos: Pick<Pagina, 'foto' | 'ancho' | 'alto' | 'esquinas'>) => void;
  alGaleria: () => void;
  alCamaraNativa: () => void;
  alVerPaginas: () => void;
  alCerrar: () => void;
}

type EstadoCamara = { estado: 'abriendo' } | { estado: 'lista'; ancho: number; alto: number } | { estado: 'sin'; motivo: string; reintentar?: boolean };

function VistaCamara({ rehacer, paginas, abriendo, alCapturar, alGaleria, alCamaraNativa, alVerPaginas, alCerrar }: VistaCamaraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  const [camara, setCamara] = useState<EstadoCamara>({ estado: 'abriendo' });
  const [linterna, setLinterna] = useState<'no' | 'apagada' | 'prendida'>('no');
  const [auto, setAuto] = useState(leerAuto);
  const [hoja, setHoja] = useState<Esquinas | null>(null);
  const [quietud, setQuietud] = useState(0);
  const [sinHojaHace, setSinHojaHace] = useState(0);
  const [flash, setFlash] = useState(0);
  const [intento, setIntento] = useState(0); // para volver a abrir la cámara si se cortó
  const capturando = useRef(false);
  const montada = useRef(true);
  useEffect(() => { montada.current = true; return () => { montada.current = false; }; }, []);
  const titulo = useTituloEnfocado();
  const reabrir = useCallback(() => { setCamara({ estado: 'abriendo' }); setIntento(n => n + 1); }, []);
  // La pantalla de arriba cambia la función en cada dibujo: con la de la
  // referencia, la búsqueda de la hoja no se reinicia (y no pierde la cuenta)
  const alCapturarRef = useRef(alCapturar);
  useEffect(() => { alCapturarRef.current = alCapturar; }, [alCapturar]);

  // Abrir la cámara de atrás, con la mayor resolución que dé
  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamara({ estado: 'sin', motivo: 'Este navegador no deja usar la cámara desde la página.' });
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (!vivo) { flujo.getTracks().forEach(t => t.stop()); return; }
        const v = videoRef.current!;
        v.srcObject = flujo;
        await v.play();
        const pista = flujo.getVideoTracks()[0];
        pistaRef.current = pista;
        const capacidades = (pista.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        if (capacidades.torch) setLinterna('apagada');
        if (vivo) setCamara({ estado: 'lista', ancho: v.videoWidth, alto: v.videoHeight });
        // Girar el teléfono cambia las medidas del video: el contorno tiene que seguirlo
        v.addEventListener('resize', () => {
          if (vivo && v.videoWidth) setCamara({ estado: 'lista', ancho: v.videoWidth, alto: v.videoHeight });
        });
        // El sistema corta la cámara al cambiar de aplicación o bloquear el celular
        pista.addEventListener('ended', () => {
          if (vivo) setCamara({ estado: 'sin', motivo: 'Se cortó la cámara (pasa al cambiar de aplicación o bloquear el celular).', reintentar: true });
        });
      } catch (err) {
        // Si se abrió pero no arrancó (play falló), que no quede la luz de la cámara prendida
        flujo?.getTracks().forEach(t => t.stop());
        if (vivo) setCamara({ estado: 'sin', motivo: motivoSinCamara(err) });
      }
    })();
    // Al volver a la página con la cámara cortada, se abre de nuevo sola
    const alVolver = () => {
      if (document.visibilityState === 'visible' && pistaRef.current?.readyState === 'ended') reabrir();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
      flujo?.getTracks().forEach(t => t.stop());
      pistaRef.current = null;
    };
  }, [intento, reabrir]);

  const capturar = useCallback(async (esq: Esquinas | null) => {
    const v = videoRef.current;
    if (!v || capturando.current || !v.videoWidth) return;
    capturando.current = true;
    setFlash(f => f + 1);
    try {
      // Un toquecito al sacar la foto (Chrome no deja vibrar si la persona todavía no tocó la página)
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(25);
      const vw = v.videoWidth, vh = v.videoHeight;
      const { blob, ancho, alto } = await guardarFoto(v, vw, vh);
      let esquinas: Esquinas;
      if (esq) esquinas = escalarEsquinas(esq, ancho / vw, alto / vh);
      else esquinas = buscarHoja(await abrirImagen(blob), ancho, alto).esquinas;
      // Si mientras se guardaba se tocó "Cancelar" (o se cerró), la foto no va
      if (montada.current) alCapturarRef.current({ foto: blob, ancho, alto, esquinas });
    } catch (err) {
      console.error('No se pudo sacar la foto:', err);
      avisar.error('No se pudo sacar la foto', 'Probá de nuevo.');
    } finally {
      capturando.current = false;
    }
  }, []);

  // Buscar la hoja en cada cuadro y, en automático, sacar la foto cuando se queda quieta
  const autoRef = useRef(auto);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => {
    if (camara.estado !== 'lista') return;
    const v = videoRef.current!;
    let previa: Esquinas | null = null;
    let quietos = 0;
    let armado = true; // lista para la próxima foto automática
    let ultima: Esquinas | null = null;
    let ultimaVez = 0;
    let vistaHace = Date.now();
    const lienzo = document.createElement('canvas');
    const id = window.setInterval(() => {
      if (capturando.current || v.readyState < 2 || !v.videoWidth) return;
      const vw = v.videoWidth, vh = v.videoHeight, lado = Math.max(vw, vh);
      const chico = pixeles(v, vw, vh, LADO_DETECCION, lienzo);
      const e0 = detectarHoja(chico);
      const e = e0 ? ampliarEsquinas(e0, vw / chico.width, vh / chico.height) : null;
      if (!e) {
        quietos = 0;
        previa = null;
        if (Date.now() - vistaHace > 600) armado = true; // sacaron la hoja: la próxima es otra
        setHoja(null);
        setQuietud(0);
        setSinHojaHace(Date.now() - vistaHace);
        return;
      }
      vistaHace = Date.now();
      setSinHojaHace(0);
      const mov = previa ? distanciaEsquinas(e, previa) / lado : 1;
      quietos = mov < QUIETO ? quietos + 1 : 0;
      // Suavizar el dibujo: si se movió poco, a mitad de camino
      const dibujo: Esquinas = previa && mov < 0.05
        ? e.map((q, i) => ({ x: (q.x + previa![i].x) / 2, y: (q.y + previa![i].y) / 2 })) as Esquinas
        : e;
      previa = e;
      if (!armado && ultima && distanciaEsquinas(e, ultima) / lado > OTRA_HOJA) armado = true;
      setHoja(dibujo);
      setQuietud(autoRef.current && armado ? Math.min(1, quietos / QUIETOS) : 0);
      if (autoRef.current && armado && quietos >= QUIETOS && Date.now() - ultimaVez > 1500) {
        armado = false;
        ultima = e;
        ultimaVez = Date.now();
        quietos = 0;
        setQuietud(0);
        void capturar(dibujo);
      }
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [camara.estado, capturar]);

  const alternarAuto = () => {
    setAuto(a => {
      try { localStorage.setItem(AUTO_CLAVE, a ? 'no' : 'si'); } catch { /* sin almacenamiento: solo por ahora */ }
      return !a;
    });
  };

  const alternarLinterna = async () => {
    const pista = pistaRef.current;
    if (!pista || linterna === 'no') return;
    const prender = linterna === 'apagada';
    try {
      await pista.applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] });
      setLinterna(prender ? 'prendida' : 'apagada');
    } catch {
      setLinterna('no');
    }
  };

  const lista = camara.estado === 'lista' ? camara : null;
  const { ref: escenarioRef, estilo } = useEncajar(lista?.ancho ?? 0, lista?.alto ?? 0);
  const ultima = paginas[paginas.length - 1];
  const mensaje = !lista ? ''
    : hoja ? (auto ? (quietud > 0 ? 'No te muevas…' : 'Hoja encontrada') : 'Tocá el botón para sacar la foto')
      : sinHojaHace > 4000 ? 'Poné la hoja sobre una mesa o algo más oscuro que el papel'
        : 'Buscando la hoja…';

  return (
    <div className="esc-camara">
      <header className="esc-barra">
        <button type="button" className="esc-btn esc-btn-icono" aria-label="Cerrar el escáner" onClick={alCerrar}><X size={20} /></button>
        <h2 className="esc-titulo" tabIndex={-1} ref={titulo}>{rehacer ? `Sacar de nuevo la página ${rehacer}` : 'Escanear'}</h2>
        <div className="esc-barra-acciones">
          {linterna !== 'no' && (
            <button type="button" className="esc-btn esc-btn-icono" aria-pressed={linterna === 'prendida'}
              aria-label="Linterna" onClick={() => void alternarLinterna()}>
              {linterna === 'prendida' ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
            </button>
          )}
          {lista && (
            <button type="button" className={`esc-btn ${auto ? 'on' : ''}`} aria-pressed={auto} onClick={alternarAuto}
              title="Saca la foto sola cuando la hoja se queda quieta">
              <Sparkles size={15} /> Automático
            </button>
          )}
        </div>
      </header>

      <div className="esc-escenario" ref={escenarioRef}>
        {camara.estado !== 'sin' && (
          <div className="esc-video" style={estilo}>
            <video ref={videoRef} playsInline muted autoPlay aria-label="Lo que ve la cámara" />
            {lista && hoja && (
              <svg className="esc-contorno" viewBox={`0 0 ${lista.ancho} ${lista.alto}`} preserveAspectRatio="none" aria-hidden="true">
                <polygon points={hoja.map(q => `${q.x},${q.y}`).join(' ')} className={quietud > 0 ? 'quieta' : ''} />
              </svg>
            )}
            {flash > 0 && <div key={flash} className="esc-flash" aria-hidden="true" />}
          </div>
        )}
        {camara.estado === 'abriendo' && (
          <div className="esc-aviso-centro" role="status"><Loader2 size={28} className="esc-gira" aria-hidden="true" /> Abriendo la cámara…</div>
        )}
        {camara.estado === 'sin' && (
          <div className="esc-sin-camara">
            <ScanLine size={40} aria-hidden="true" />
            <p>{camara.motivo}</p>
            <p className="esc-sub">Sacá las fotos con la cámara del celular: las enderezamos y limpiamos igual.</p>
            <div className="esc-sin-camara-botones">
              {camara.reintentar && (
                <button type="button" className="esc-btn esc-btn-grande esc-btn-primario" onClick={reabrir}><RefreshCw size={18} /> Abrir la cámara de nuevo</button>
              )}
              <button type="button" className={`esc-btn esc-btn-grande ${camara.reintentar ? '' : 'esc-btn-primario'}`} onClick={alCamaraNativa}><Camera size={18} /> Sacar foto</button>
              <button type="button" className="esc-btn esc-btn-grande" onClick={alGaleria}><Images size={18} /> Elegir fotos</button>
            </div>
          </div>
        )}
        {mensaje && <p className="esc-mensaje">{mensaje}</p>}
      </div>

      <footer className="esc-pie">
        <button type="button" className="esc-btn esc-btn-lateral" onClick={alGaleria} aria-label="Elegir fotos de la galería">
          <Images size={22} /><span>Fotos</span>
        </button>
        {lista ? (
          <button type="button" className="esc-disparador" onClick={() => void capturar(hoja)} aria-label="Sacar la foto"
            style={{ '--quietud': quietud } as CSSProperties}>
            <svg viewBox="0 0 80 80" aria-hidden="true">
              <circle cx="40" cy="40" r="36" className="esc-anillo-fondo" />
              <circle cx="40" cy="40" r="36" className="esc-anillo" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - quietud} />
            </svg>
          </button>
        ) : (
          <button type="button" className="esc-disparador esc-disparador-nativo" onClick={alCamaraNativa} aria-label="Sacar foto con la cámara del celular">
            <Camera size={28} />
          </button>
        )}
        <button type="button" className="esc-btn esc-btn-lateral esc-pila" onClick={alVerPaginas} disabled={!paginas.length && !abriendo}
          aria-label={paginas.length ? `${rehacer ? 'Cancelar' : 'Listo'}: ver las ${paginas.length} páginas` : `${rehacer ? 'Cancelar' : 'Listo'} (todavía no hay páginas)`}>
          {ultima?.miniatura ? <img src={ultima.miniatura} alt="" /> : <span className="esc-pila-vacia">{abriendo ? <Loader2 size={18} className="esc-gira" /> : null}</span>}
          {paginas.length > 0 && <span className="esc-cuenta">{paginas.length}</span>}
          <span>{rehacer ? 'Cancelar' : 'Listo'}</span>
        </button>
      </footer>
    </div>
  );
}

// ── Todas las páginas ──

function VistaPaginas({ paginas, abriendo, alAbrir, alAgregar, alGaleria, alTerminar, alCerrar }: {
  paginas: Pagina[];
  abriendo: number;
  alAbrir: (id: string) => void;
  alAgregar: () => void;
  alGaleria: () => void;
  alTerminar: () => void;
  alCerrar: () => void;
}) {
  const titulo = useTituloEnfocado();
  return (
    <div className="esc-paginas">
      <header className="esc-barra">
        <button type="button" className="esc-btn esc-btn-icono" aria-label="Cerrar el escáner" onClick={alCerrar}><X size={20} /></button>
        <h2 className="esc-titulo" tabIndex={-1} ref={titulo}>
          {paginas.length ? `${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'}` : 'Sin páginas todavía'}
        </h2>
        <span />
      </header>
      <div className="esc-grilla-zona">
        {paginas.length === 0 && !abriendo ? (
          <p className="esc-vacio">Sacá una foto o elegí fotos de la galería.</p>
        ) : (
          <ol className="esc-grilla">
            {paginas.map((p, i) => (
              <li key={p.id}>
                <button type="button" className="esc-miniatura" onClick={() => alAbrir(p.id)} aria-label={`Página ${i + 1}${p.error ? ': no se pudo procesar' : ''}. Abrir para retocar`}>
                  {p.miniatura ? <img src={p.miniatura} alt="" /> : <span className="esc-mini-cargando"><Loader2 size={22} className="esc-gira" /></span>}
                  {p.error && <span className="esc-mini-error">!</span>}
                  <span className="esc-mini-numero">{i + 1}</span>
                </button>
              </li>
            ))}
            {Array.from({ length: abriendo }, (_, i) => (
              <li key={`abriendo-${i}`}><span className="esc-miniatura"><span className="esc-mini-cargando"><Loader2 size={22} className="esc-gira" /></span></span></li>
            ))}
          </ol>
        )}
      </div>
      <footer className="esc-pie esc-pie-paginas">
        <button type="button" className="esc-btn esc-btn-grande" onClick={alAgregar}><Camera size={18} /> Agregar páginas</button>
        <button type="button" className="esc-btn esc-btn-grande" onClick={alGaleria}><Images size={18} /> Fotos</button>
        <button type="button" className="esc-btn esc-btn-grande esc-btn-primario" onClick={alTerminar} disabled={!paginas.length || abriendo > 0}>
          <Check size={18} /> Listo: armar el PDF
        </button>
      </footer>
    </div>
  );
}

// ── Una página: filtro, giro, bordes ──

function VistaPagina({ pagina, numero, total, alVolver, alFiltro, alFiltroATodas, alGirar, alBordes, alRehacer, alMover, alBorrar }: {
  pagina: Pagina;
  numero: number;
  total: number;
  alVolver: () => void;
  alFiltro: (f: Filtro) => void;
  alFiltroATodas: (f: Filtro) => void;
  alGirar: () => void;
  alBordes: () => void;
  alRehacer: () => void;
  alMover: (d: -1 | 1) => void;
  alBorrar: () => void;
}) {
  const url = useUrlDe(pagina.lista?.blob);
  // Se está rehaciendo (otro filtro, otros bordes): se ve la anterior, atenuada
  const procesando = !pagina.error && pagina.listaVersion !== pagina.version;
  const titulo = useTituloEnfocado();

  return (
    <div className="esc-pagina">
      <header className="esc-barra">
        <button type="button" className="esc-btn" onClick={alVolver}><ChevronLeft size={18} /> Páginas</button>
        <h2 className="esc-titulo" tabIndex={-1} ref={titulo}>Página {numero} de {total}</h2>
        <div className="esc-barra-acciones">
          <button type="button" className="esc-btn esc-btn-icono" aria-label="Mover antes" disabled={numero === 1} onClick={() => alMover(-1)}><ChevronLeft size={18} /></button>
          <button type="button" className="esc-btn esc-btn-icono" aria-label="Mover después" disabled={numero === total} onClick={() => alMover(1)}><ChevronRight size={18} /></button>
        </div>
      </header>
      <div className="esc-vista">
        {pagina.error ? (
          <p className="esc-vacio">{pagina.error}</p>
        ) : url ? (
          <img src={url} alt={`Página ${numero}, como va a quedar`} className={procesando ? 'esc-actualizando' : ''} />
        ) : (
          <div className="esc-aviso-centro" role="status"><Loader2 size={28} className="esc-gira" aria-hidden="true" /> Enderezando y limpiando…</div>
        )}
      </div>
      <div className="esc-herramientas">
        <div className="esc-filtros" role="group" aria-label="Cómo queda la página">
          {FILTROS.map(f => (
            <button key={f.valor} type="button" aria-pressed={pagina.filtro === f.valor}
              className={`esc-filtro ${pagina.filtro === f.valor ? 'on' : ''}`} onClick={() => alFiltro(f.valor)}>
              {f.nombre}
            </button>
          ))}
        </div>
        <p className="esc-ayuda">{FILTROS.find(f => f.valor === pagina.filtro)?.ayuda}</p>
        {total > 1 && (
          <button type="button" className="esc-enlace" onClick={() => alFiltroATodas(pagina.filtro)}>
            Usar «{FILTROS.find(f => f.valor === pagina.filtro)?.nombre}» en todas las páginas
          </button>
        )}
        <div className="esc-acciones">
          <button type="button" className="esc-btn" onClick={alBordes}><Crop size={16} /> Bordes</button>
          <button type="button" className="esc-btn" onClick={alGirar}><RotateCw size={16} /> Girar</button>
          <button type="button" className="esc-btn" onClick={alRehacer}><RefreshCw size={16} /> Sacar de nuevo</button>
          <button type="button" className="esc-btn esc-btn-peligro" onClick={alBorrar}><Trash2 size={16} /> Borrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Ajustar los bordes a mano ──

const NOMBRES_ESQUINA = ['de arriba a la izquierda', 'de arriba a la derecha', 'de abajo a la derecha', 'de abajo a la izquierda'];

function EditorBordes({ pagina, alAceptar, alCancelar }: { pagina: Pagina; alAceptar: (e: Esquinas) => void; alCancelar: () => void }) {
  const [esquinas, setEsquinas] = useState<Esquinas>(pagina.esquinas);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const url = useUrlDe(pagina.foto);
  const [buscando, setBuscando] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const { ref: escenarioRef, estilo } = useEncajar(pagina.ancho, pagina.alto);
  const titulo = useTituloEnfocado();
  const [aviso, setAviso] = useState('');

  const lado = Math.max(pagina.ancho, pagina.alto);
  const limitar = (q: Punto): Punto => ({
    x: Math.min(Math.max(q.x, 0), pagina.ancho - 1),
    y: Math.min(Math.max(q.y, 0), pagina.alto - 1),
  });
  const mover = (i: number, q: Punto) => setEsquinas(prev => prev.map((p, k) => (k === i ? limitar(q) : p)) as Esquinas);

  // La esquina que se arrastra, al instante (el estado llega en el próximo dibujo
  // y los primeros movimientos del dedo se perderían)
  const arrastrandoRef = useRef<number | null>(null);
  const soltarEsquina = () => { arrastrandoRef.current = null; setArrastrando(null); };
  const alPresionar = (i: number) => (e: PEvent<SVGCircleElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* el puntero ya no está */ }
    arrastrandoRef.current = i;
    setArrastrando(i);
  };
  const alMoverPuntero = (e: PEvent<SVGSVGElement>) => {
    const i = arrastrandoRef.current;
    if (i === null || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    mover(i, { x: (e.clientX - r.left) / r.width * pagina.ancho, y: (e.clientY - r.top) / r.height * pagina.alto });
  };
  const alTecla = (i: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const paso = (e.shiftKey ? 0.02 : 0.005) * lado;
    const d: Record<string, Punto> = { ArrowLeft: { x: -paso, y: 0 }, ArrowRight: { x: paso, y: 0 }, ArrowUp: { x: 0, y: -paso }, ArrowDown: { x: 0, y: paso } };
    if (!d[e.key]) return;
    e.preventDefault();
    const { x, y } = d[e.key];
    // Desde la posición más nueva: con la tecla apretada llegan varias juntas
    setEsquinas(prev => prev.map((p, k) => (k === i ? limitar({ x: p.x + x, y: p.y + y }) : p)) as Esquinas);
    const nueva = limitar({ x: esquinas[i].x + x, y: esquinas[i].y + y });
    setAviso(`${Math.round(nueva.x / pagina.ancho * 100)}% desde la izquierda, ${Math.round(nueva.y / pagina.alto * 100)}% desde arriba`);
  };

  const aplicar = () => {
    // Cruzadas, la página saldría espejada: se ordenan; juntas, no hay hoja
    const e = ordenarEsquinas(esquinas);
    if (!formanHoja(e, pagina.ancho, pagina.alto)) {
      avisar.info('Así las esquinas no forman una hoja', 'Separalas: cada una en una punta de la hoja.');
      return;
    }
    alAceptar(e);
  };

  const detectar = async () => {
    setBuscando(true);
    try {
      const img = await abrirImagen(pagina.foto);
      const { esquinas: e, encontrada } = buscarHoja(img, pagina.ancho, pagina.alto);
      setEsquinas(e);
      if (!encontrada) avisar.info('No encontramos los bordes', 'Movelos a mano: tocá y arrastrá cada esquina.');
    } finally {
      setBuscando(false);
    }
  };

  const r = lado * 0.022;
  const q = arrastrando !== null ? esquinas[arrastrando] : null;
  // La lupa: la zona de la esquina, 2,5 veces más grande, arriba del dedo (o
  // al costado, si arriba no entra: abajo la taparía el dedo)
  const lupa = q && url && svgRef.current ? (() => {
    const caja = svgRef.current.getBoundingClientRect();
    const zoom = 2.5, tam = 110, aparte = 30;
    const px = q.x / pagina.ancho * caja.width, py = q.y / pagina.alto * caja.height;
    let left = px - tam / 2, top = py - tam - aparte;
    if (top < 0) {
      top = Math.min(Math.max(py - tam / 2, 0), Math.max(0, caja.height - tam));
      left = px > caja.width / 2 ? px - tam - aparte : px + aparte;
    }
    left = Math.min(Math.max(left, 0), Math.max(0, caja.width - tam));
    return {
      left,
      top,
      width: tam,
      height: tam,
      backgroundImage: `url(${url})`,
      backgroundSize: `${caja.width * zoom}px ${caja.height * zoom}px`,
      backgroundPosition: `${tam / 2 - px * zoom}px ${tam / 2 - py * zoom}px`,
    } as CSSProperties;
  })() : null;

  return (
    <div className="esc-bordes">
      <header className="esc-barra">
        <button type="button" className="esc-btn" onClick={alCancelar}><X size={18} /> Cancelar</button>
        <h2 className="esc-titulo" tabIndex={-1} ref={titulo}>Bordes de la hoja</h2>
        <button type="button" className="esc-btn esc-btn-primario" onClick={aplicar}><Check size={18} /> Aplicar</button>
      </header>
      <p className="sr-only" aria-live="polite">{aviso}</p>
      <div className="esc-escenario esc-escenario-bordes" ref={escenarioRef}>
        <div className="esc-video" style={estilo}>
          {url && <img src={url} alt="La foto original" draggable={false} />}
          <svg ref={svgRef} className="esc-contorno esc-editable" viewBox={`0 0 ${pagina.ancho} ${pagina.alto}`} preserveAspectRatio="none"
            onPointerMove={alMoverPuntero} onPointerUp={soltarEsquina} onPointerCancel={soltarEsquina}>
            <polygon points={esquinas.map(p => `${p.x},${p.y}`).join(' ')} />
            {esquinas.map((p, i) => (
              <g key={i}>
                {/* Zona de toque más grande que el punto que se ve */}
                <circle cx={p.x} cy={p.y} r={r * 2.2} className="esc-toque" onPointerDown={alPresionar(i)} />
                <circle cx={p.x} cy={p.y} r={r} className={`esc-esquina ${arrastrando === i ? 'on' : ''}`}
                  tabIndex={0} role="button" aria-roledescription="esquina movible" aria-label={`Esquina ${NOMBRES_ESQUINA[i]}: arrastrala o movela con las flechas`}
                  onPointerDown={alPresionar(i)} onKeyDown={alTecla(i)} />
              </g>
            ))}
          </svg>
          {lupa && <div className="esc-lupa" style={lupa} aria-hidden="true"><span /></div>}
        </div>
        <p className="esc-mensaje">Arrastrá cada esquina hasta la punta de la hoja</p>
      </div>
      <footer className="esc-pie esc-pie-paginas">
        <button type="button" className="esc-btn esc-btn-grande" onClick={() => void detectar()} disabled={buscando}>
          {buscando ? <Loader2 size={18} className="esc-gira" /> : <ScanLine size={18} />} Detectar de nuevo
        </button>
        <button type="button" className="esc-btn esc-btn-grande" onClick={() => setEsquinas(esquinasDelCuadro(pagina.ancho, pagina.alto))}>
          <Maximize size={18} /> Toda la foto
        </button>
      </footer>
    </div>
  );
}
