/**
 * Dibuja un Diagrama con Mermaid y lo pasa a PNG.
 *
 * Mermaid pesa (~150 KB comprimido): se baja recién cuando el docente arma o
 * edita un diagrama, nunca en la pantalla del estudiante, que ve el PNG.
 *
 * htmlLabels: false a propósito. Con etiquetas HTML, Mermaid mete
 * <foreignObject> en el SVG, que no se puede pasar a PNG en todos los
 * navegadores (Safari, por ejemplo, deja el canvas en blanco).
 */

import { aMermaid, type Diagrama } from './diagramas';

type Mermaid = typeof import('mermaid').default;
let cargado: Promise<Mermaid> | null = null;

const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function cargarMermaid(): Promise<Mermaid> {
  cargado ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      theme: 'base',
      fontFamily: FUENTE,
      themeVariables: {
        fontFamily: FUENTE,
        fontSize: '16px',
        // Colores claros y con contraste: se proyecta en aulas con mucha luz
        primaryColor: '#E0F2FE',
        primaryBorderColor: '#0369A1',
        primaryTextColor: '#0F172A',
        secondaryColor: '#FEF3C7',
        tertiaryColor: '#DCFCE7',
        lineColor: '#334155',
        textColor: '#0F172A',
        edgeLabelBackground: '#FFFFFF',
      },
      flowchart: { curve: 'basis', useMaxWidth: false, padding: 12 },
      mindmap: { useMaxWidth: false },
      timeline: { useMaxWidth: false },
    });
    return mermaid;
  });
  return cargado;
}

let contador = 0;

/** SVG del diagrama. Tira Error si Mermaid no lo puede dibujar. */
export async function dibujarDiagrama(d: Diagrama): Promise<string> {
  const mermaid = await cargarMermaid();
  const codigo = aMermaid(d);
  await mermaid.parse(codigo); // tira con un mensaje si algo quedó mal
  const { svg } = await mermaid.render(`diag-${Date.now()}-${contador++}`, codigo);
  return svg;
}

/** El SVG como PNG con fondo blanco (para guardarlo, proyectarlo o pegarlo en PowerPoint). */
export async function svgAPng(svg: string, escala = 2): Promise<Blob> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const raiz = doc.documentElement;
  const vb = (raiz.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let ancho = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(raiz.getAttribute('width') ?? '') || 800;
  let alto = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(raiz.getAttribute('height') ?? '') || 600;
  // Tope de 1600 px: se lee bien proyectado y no pesa de más para los chicos (~150-200 KB)
  const factor = Math.min(escala, 1600 / ancho, 1600 / alto);
  raiz.setAttribute('width', String(ancho));
  raiz.setAttribute('height', String(alto));
  ancho = Math.round(ancho * factor);
  alto = Math.round(alto * factor);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(raiz)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo pasar el diagrama a imagen.'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = ancho + 48;
    canvas.height = alto + 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 24, 24, ancho, alto);
    return await new Promise<Blob>((ok, mal) =>
      canvas.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo pasar el diagrama a imagen.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
