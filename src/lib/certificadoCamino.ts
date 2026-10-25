/**
 * El certificado del Camino Docente Tech (082): una hoja A4 apaisada con el
 * nivel alcanzado, las medallas y lo que hizo en el año, para sumar a sus
 * antecedentes. Lo arma el navegador (jsPDF, como el CV); nada sale del equipo.
 * Sin emojis: la letra del PDF no los tiene.
 */

import { GRADOS, NIVELES, medallasDe, nivelInfo, trofeosDe, type NumerosCamino } from './caminoDocente';

export interface DatosCertificado {
  nombre: string;
  escuela?: string;
  nivel: number;
  numeros: NumerosCamino;
}

export async function descargarCertificado(d: DatosCertificado): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const centro = W / 2;
  const nivel = nivelInfo(d.nivel);

  // Marco
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(1.2);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(0.3);
  doc.rect(13, 13, W - 26, H - 26);

  const linea = (t: string, y: number, tam: number, estilo: 'normal' | 'bold' | 'italic' = 'normal', color: [number, number, number] = [30, 30, 30]) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...color);
    const partes = doc.splitTextToSize(t, W - 60) as string[];
    partes.forEach((p, i) => doc.text(p, centro, y + i * tam * 0.45, { align: 'center' }));
    return y + partes.length * tam * 0.45;
  };

  let y = 42;
  y = linea(`CAMINO DOCENTE TECH ${d.numeros.anio}`, y, 13, 'bold', [30, 64, 175]);
  y = linea('Certificado de reconocimiento', y + 4, 26, 'bold', [20, 20, 20]);
  y = linea('Se reconoce a', y + 6, 12, 'normal', [90, 90, 90]);
  y = linea(d.nombre, y + 4, 24, 'bold', [20, 20, 20]);
  if (d.escuela) y = linea(d.escuela, y + 1, 12, 'normal', [90, 90, 90]);
  y = linea(
    `por alcanzar el nivel «${nivel.nombre}» (${Math.min(d.nivel, NIVELES.length)} de ${NIVELES.length}) en el uso pedagógico de la plataforma SMT EstudIA: tecnología al servicio de la clase, sin perder de vista a cada estudiante.`,
    y + 6, 12, 'normal', [40, 40, 40],
  );
  y = linea(`«${nivel.lema}»`, y + 3, 11, 'italic', [90, 90, 90]);

  // Medallas y trofeos
  const medallas = medallasDe(d.numeros).filter(m => m.grado > 0);
  const trofeos = trofeosDe(d.numeros, d.nivel).filter(t => t.logrado);
  if (medallas.length) {
    y = linea('Medallas', y + 8, 11, 'bold', [30, 64, 175]);
    y = linea(medallas.map(m => `${m.pilar.medalla} (${GRADOS[m.grado]})`).join('  ·  '), y + 1, 10.5);
  }
  if (trofeos.length) {
    y = linea('Trofeos', y + 4, 11, 'bold', [30, 64, 175]);
    y = linea(trofeos.map(t => t.nombre).join('  ·  '), y + 1, 10.5);
  }

  // Lo que hizo, en números
  const n = d.numeros;
  const hechos = [
    n.materiales && `${n.materiales} materiales`,
    n.actividades && `${n.actividades} actividades`,
    n.enVivo && `${n.enVivo} clases en vivo`,
    n.devoluciones && `${n.devoluciones} devoluciones escritas`,
    n.listas && `${n.listas} listas tomadas`,
    n.semanas && `${n.semanas} semanas con actividad`,
  ].filter(Boolean).join(' · ');
  if (hechos) linea(`En ${n.anio}: ${hechos}.`, y + 6, 10, 'normal', [70, 70, 70]);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    `Emitido por SMT EstudIA el ${new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}, a partir del uso registrado en la plataforma. No reemplaza certificaciones oficiales.`,
    centro, H - 20, { align: 'center' },
  );

  const archivo = `Certificado Docente Tech ${n.anio} ${d.nombre}`.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  doc.save(`${archivo}.pdf`);
}
