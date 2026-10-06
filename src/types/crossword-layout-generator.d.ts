declare module 'crossword-layout-generator' {
  export interface EntradaCrucigrama { answer: string; clue: string }
  export interface SalidaCrucigrama {
    rows: number;
    cols: number;
    table: string[][];
    table_string: string;
    /** startx/starty son 1-based; orientation 'none' = no se pudo ubicar. */
    result: (EntradaCrucigrama & { startx: number; starty: number; orientation: 'across' | 'down' | 'none'; position: number })[];
  }
  export function generateLayout(palabras: EntradaCrucigrama[]): SalidaCrucigrama;
}
