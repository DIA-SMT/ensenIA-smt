/**
 * Crucigrama y criptograma en PDF, para imprimir o mandar por WhatsApp.
 * Fondo blanco y tinta negra: se fotocopia en la escuela.
 * Con `conSolucion`, una segunda página con las respuestas (para el docente).
 */

import { jsPDF } from 'jspdf';
import type { Crucigrama, Criptograma, JuegoPalabras } from './juegos';

const MARGEN = 40;
const TINTA: [number, number, number] = [20, 20, 20];
const GRIS: [number, number, number] = [110, 110, 110];

const sinEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();

function encabezado(doc: jsPDF, titulo: string, sub: string, conNombre = true) {
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(sinEmoji(titulo), MARGEN, MARGEN + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text(sub, MARGEN, MARGEN + 28);
  if (!conNombre) return MARGEN + 50;
  doc.text('Nombre: ______________________________   Fecha: ___/___/___', MARGEN, MARGEN + 44);
  return MARGEN + 66;
}

function pie(doc: jsPDF, materia?: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`SMT EstudIA${materia ? ` · ${materia}` : ''}`, w / 2, h - 20, { align: 'center' });
}

function grillaCrucigrama(doc: jsPDF, j: Crucigrama, y: number, conLetras: boolean): number {
  const w = doc.internal.pageSize.getWidth() - MARGEN * 2;
  const lado = Math.min(w / j.columnas, 380 / j.filas, 26);
  const x0 = MARGEN + (w - lado * j.columnas) / 2;
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.8);
  j.celdas.forEach((fila, f) => fila.forEach((celda, c) => {
    if (!celda) return;
    const x = x0 + c * lado;
    const yy = y + f * lado;
    doc.rect(x, yy, lado, lado);
    if (celda.numero) {
      doc.setFontSize(Math.max(5, lado * 0.28));
      doc.setTextColor(...TINTA);
      doc.text(String(celda.numero), x + 1.5, yy + lado * 0.3);
    }
    if (conLetras) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(lado * 0.55);
      doc.text(celda.letra, x + lado / 2, yy + lado * 0.72, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
  }));
  return y + lado * j.filas + 24;
}

function pistasCrucigrama(doc: jsPDF, j: Crucigrama, y: number) {
  const h = doc.internal.pageSize.getHeight();
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2;
  for (const [dir, nombre] of [['horizontal', 'Horizontales'], ['vertical', 'Verticales']] as const) {
    const lista = j.palabras.filter(p => p.direccion === dir);
    if (!lista.length) continue;
    if (y > h - 80) { doc.addPage(); y = MARGEN; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TINTA);
    doc.text(nombre, MARGEN, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    for (const p of lista) {
      const lineas = doc.splitTextToSize(`${p.numero}. ${sinEmoji(p.pista)} (${p.respuesta.length})`, ancho);
      if (y + lineas.length * 13 > h - 40) { doc.addPage(); y = MARGEN; }
      doc.text(lineas, MARGEN, y);
      y += lineas.length * 13 + 3;
    }
    y += 10;
  }
}

function frase(doc: jsPDF, j: Criptograma, y: number, conLetras: boolean): number {
  const ancho = doc.internal.pageSize.getWidth() - MARGEN * 2;
  const lado = 22;
  const separacion = 4;
  let x = MARGEN;
  doc.setDrawColor(...TINTA);
  for (const palabra of j.frase.split(' ')) {
    const largo = [...palabra].length * (lado + separacion);
    if (x + largo > MARGEN + ancho) { x = MARGEN; y += lado + 34; }
    for (const ch of palabra) {
      const n = j.clave[ch];
      if (!n) {
        doc.setFontSize(14);
        doc.text(ch, x + 4, y + lado - 5);
        x += lado * 0.6;
        continue;
      }
      doc.setLineWidth(1.2);
      doc.line(x, y + lado, x + lado, y + lado);
      if (conLetras || j.reveladas.includes(ch)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...TINTA);
        doc.text(ch, x + lado / 2, y + lado - 5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(String(n), x + lado / 2, y + lado + 11, { align: 'center' });
      doc.setTextColor(...TINTA);
      x += lado + separacion;
    }
    x += lado * 0.8;
  }
  return y + lado + 40;
}

/** Baja el PDF del juego. */
export function juegoAPdf(j: JuegoPalabras, opciones: { materia?: string; conSolucion?: boolean } = {}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const nombre = j.tipo === 'crucigrama' ? 'Crucigrama' : 'Criptograma';
  const instruccion = j.tipo === 'crucigrama'
    ? 'Completá el crucigrama con las palabras del tema.'
    : 'Cada número es siempre la misma letra. Descubrí la frase.';
  let y = encabezado(doc, `${nombre}: ${j.titulo}`, instruccion);

  if (j.tipo === 'crucigrama') {
    y = grillaCrucigrama(doc, j, y, false);
    pistasCrucigrama(doc, j, y);
  } else {
    if (j.pista) {
      doc.setFontSize(11);
      doc.setTextColor(...TINTA);
      doc.text(doc.splitTextToSize(`Pista: ${sinEmoji(j.pista)}`, doc.internal.pageSize.getWidth() - MARGEN * 2), MARGEN, y);
      y += 30;
    }
    frase(doc, j, y, false);
  }
  pie(doc, opciones.materia);

  if (opciones.conSolucion) {
    doc.addPage();
    let ys = encabezado(doc, `Solución — ${nombre}: ${j.titulo}`, 'Para el docente.', false);
    if (j.tipo === 'crucigrama') grillaCrucigrama(doc, j, ys, true);
    else ys = frase(doc, j, ys, true);
    pie(doc, opciones.materia);
  }

  const archivo = `${nombre} - ${j.titulo}`.normalize('NFKD').replace(/[^\w\- ]/g, '').trim().slice(0, 60) || nombre;
  doc.save(`${archivo}.pdf`);
}
