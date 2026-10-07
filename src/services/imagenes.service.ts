/**
 * Fotos reales con licencia libre para las diapositivas.
 *
 * Se busca en Openverse (Wikimedia Commons, Flickr y otros acervos con
 * licencias Creative Commons), directo desde el navegador del docente: así
 * cada docente usa su propio cupo del buscador y no el de un servidor
 * compartido. Se piden solo licencias que permiten adaptar la obra (la
 * portada recorta la foto para llenar la lámina) y nunca contenido adulto.
 *
 * Al elegir una, el servidor (función guardar-imagen) guarda una copia en la
 * carpeta del docente con su crédito: la clase anda sin internet y el
 * PowerPoint la lleva adentro.
 */

import { supabase } from './_helpers';
import type { Credito } from '../lib/diapositivas';

const OPENVERSE = 'https://api.openverse.org/v1/images/';

export interface FotoEncontrada {
  id: string;
  titulo: string;
  autor: string;
  /** Miniatura servida por Openverse (liviana, para elegir) */
  miniatura: string;
  ancho: number;
  alto: number;
  proveedor: string;
}

export interface FotoGuardada {
  ruta: string;
  alt: string;
  credito: Credito;
}

/** Busca fotos. Tira Error con mensaje para mostrar. */
export async function buscarFotos(consulta: string, pagina = 1): Promise<{ fotos: FotoEncontrada[]; hayMas: boolean }> {
  const q = consulta.trim();
  if (!q) return { fotos: [], hayMas: false };
  const params = new URLSearchParams({
    q,
    page: String(pagina),
    page_size: '20',
    // Que se puedan recortar (portada) y usar en clase
    license_type: 'modification',
    mature: 'false',
    filter_dead: 'true',
  });
  let resp: Response;
  try {
    resp = await fetch(`${OPENVERSE}?${params}`);
  } catch {
    throw new Error('No se pudo conectar con el buscador de imágenes. Revisá la conexión.');
  }
  if (resp.status === 429) throw new Error('El buscador de imágenes está saturado. Esperá un minuto y probá de nuevo.');
  if (!resp.ok) throw new Error('El buscador de imágenes no respondió. Probá de nuevo.');
  const data = await resp.json() as {
    result_count?: number; page_count?: number;
    results?: { id: string; title?: string; creator?: string; thumbnail?: string; width?: number; height?: number; provider?: string; mature?: boolean }[];
  };
  const fotos = (data.results ?? [])
    .filter(r => r.id && r.thumbnail && !r.mature)
    .map(r => ({
      id: r.id,
      titulo: r.title ?? '',
      autor: r.creator ?? '',
      miniatura: r.thumbnail!,
      ancho: r.width ?? 0,
      alto: r.height ?? 0,
      proveedor: r.provider ?? '',
    }));
  return { fotos, hayMas: pagina < (data.page_count ?? 1) };
}

/** Guarda la foto elegida en la carpeta del docente, con su crédito. */
export async function guardarFoto(id: string): Promise<FotoGuardada> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guardar-imagen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.message || 'No se pudo guardar la imagen. Probá con otra.');
  return json as FotoGuardada;
}
