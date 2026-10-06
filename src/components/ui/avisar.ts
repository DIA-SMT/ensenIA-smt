/**
 * Avisos y confirmaciones de la app, en lugar de alert() y confirm().
 *
 * Los del navegador cortan todo con una ventana gris que no sigue el
 * diseño, no se lee bien en el celular y en algunos navegadores se pueden
 * bloquear para siempre con un tilde ("no mostrar más"): un confirm()
 * bloqueado devuelve false y la acción no pasa nunca, sin explicación.
 *
 * Se llaman desde cualquier lado, sin hooks:
 *   avisar.exito('Actividad publicada');
 *   avisar.error('No se pudo guardar. Probá de nuevo.');
 *   if (!(await confirmar({ titulo: '¿Borrar la actividad?', accion: 'Borrar', peligro: true }))) return;
 *
 * Los dibuja <Avisos />, montado una vez en App.
 */

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
  /** Detalle opcional, en una segunda línea. */
  detalle?: string;
}

export interface OpcionesConfirmar {
  titulo: string;
  /** Qué va a pasar, en una o dos oraciones. */
  mensaje?: string;
  /** Texto del botón que confirma: un verbo ("Borrar", "Publicar"). */
  accion?: string;
  /** Texto del botón que cancela. */
  cancelar?: string;
  /** La acción no se puede deshacer: el botón va en rojo. */
  peligro?: boolean;
}

export interface PedidoConfirmar extends OpcionesConfirmar {
  id: number;
  responder: (si: boolean) => void;
}

interface Estado {
  avisos: Aviso[];
  pedido: PedidoConfirmar | null;
}

let estado: Estado = { avisos: [], pedido: null };
const oyentes = new Set<() => void>();
let siguienteId = 1;
const cola: PedidoConfirmar[] = [];

function cambiar(nuevo: Partial<Estado>) {
  estado = { ...estado, ...nuevo };
  oyentes.forEach(o => o());
}

export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

export function leerEstado(): Estado {
  return estado;
}

/** Tiempo en pantalla: los errores se quedan más, para alcanzar a leerlos. */
const DURACION: Record<TipoAviso, number> = { exito: 4000, info: 5000, error: 8000 };
const MAXIMO = 3;

function mostrar(tipo: TipoAviso, texto: string, detalle?: string): number {
  const id = siguienteId++;
  // El mismo aviso dos veces seguidas (doble clic) no se apila
  const repetido = estado.avisos.find(a => a.texto === texto && a.tipo === tipo);
  if (repetido) quitarAviso(repetido.id);
  cambiar({ avisos: [...estado.avisos, { id, tipo, texto, detalle }].slice(-MAXIMO) });
  return id;
}

export function quitarAviso(id: number) {
  if (!estado.avisos.some(a => a.id === id)) return;
  cambiar({ avisos: estado.avisos.filter(a => a.id !== id) });
}

export function duracionDe(tipo: TipoAviso): number {
  return DURACION[tipo];
}

export const avisar = {
  exito: (texto: string, detalle?: string) => mostrar('exito', texto, detalle),
  error: (texto: string, detalle?: string) => mostrar('error', texto, detalle),
  info: (texto: string, detalle?: string) => mostrar('info', texto, detalle),
};

/** Pregunta antes de una acción. Resuelve true si la persona confirma. */
export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
  return new Promise(resolve => {
    const pedido: PedidoConfirmar = {
      ...opciones,
      id: siguienteId++,
      responder: si => {
        resolve(si);
        const proximo = cola.shift() ?? null;
        cambiar({ pedido: proximo });
      },
    };
    if (estado.pedido) cola.push(pedido);
    else cambiar({ pedido });
  });
}
