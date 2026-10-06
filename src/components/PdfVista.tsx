/**
 * Las páginas de un PDF dibujadas con pdf.js, una debajo de la otra.
 *
 * Reemplaza al <iframe> con el visor del navegador: en el celular (Android)
 * ese visor no muestra nada y baja el archivo, que es justo lo que las
 * escuelas no querían. Dibujado acá se ve igual en cualquier pantalla.
 */

import { useEffect, useRef, useState } from 'react';
import { cargarPdfjs } from '../services/documents.service';
import { Cargando } from './ui/Esqueleto';

export default function PdfVista({ url, titulo, onError }: {
  url: string;
  titulo: string;
  onError: () => void;
}) {
  const contRef = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState<{ hechas: number; total: number } | null>(null);

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    let cancelado = false;
    let destruir: (() => void) | undefined;

    (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        const doc = await pdfjs.getDocument({ url }).promise;
        destruir = () => { void doc.destroy(); };
        if (cancelado) return destruir();
        setPaginas({ hechas: 0, total: doc.numPages });

        // Al ancho del visor, con más resolución en pantallas que la tienen
        const ancho = cont.clientWidth || 800;
        const nitidez = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && !cancelado; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: (ancho / page.getViewport({ scale: 1 }).width) * nitidez });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'mv-pdf-pagina';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${titulo}, página ${i} de ${doc.numPages}`);
          cont.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (!cancelado) setPaginas({ hechas: i, total: doc.numPages });
        }
      } catch (err) {
        console.error('No se pudo mostrar el PDF:', err);
        if (!cancelado) onError();
      }
    })();

    return () => {
      cancelado = true;
      destruir?.();
      cont.replaceChildren();
    };
  }, [url, titulo, onError]);

  return (
    <>
      {/* Las páginas las agrega pdf.js: React no toca lo de adentro */}
      <div ref={contRef} className="mv-pdf-paginas" />
      {(!paginas || paginas.hechas < paginas.total) && (
        <Cargando
          className="mv-cargando"
          texto={paginas ? `Mostrando página ${paginas.hechas + 1} de ${paginas.total}…` : 'Abriendo el PDF…'}
        />
      )}
    </>
  );
}
