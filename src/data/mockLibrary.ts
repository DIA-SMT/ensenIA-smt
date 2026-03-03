import type { LibraryMaterial } from '../types';

export const libraryMaterials: LibraryMaterial[] = [
  {
    id: 'mat-1', title: 'Guía de Biología Celular', description: 'Material teórico sobre estructura celular, organelas y funciones.',
    fileType: 'pdf', fileName: 'biologia-celular-guia.pdf', fileSize: '2.4 MB',
    subjectId: 'sub-bio', subjectName: 'Biología', unitName: 'Unidad 1: Células',
    teacherId: 'user-marco', schoolId: 'school-1',
    tags: ['célula', 'organelas', 'membrana', 'núcleo'],
    uploadedAt: '2026-02-15',
  },
  {
    id: 'mat-2', title: 'Ejercicios de Mitosis y Meiosis', description: 'Actividades prácticas con diagramas de división celular.',
    fileType: 'pdf', fileName: 'mitosis-meiosis-ejercicios.pdf', fileSize: '1.8 MB',
    subjectId: 'sub-bio', subjectName: 'Biología', unitName: 'Unidad 1: Células',
    teacherId: 'user-marco', schoolId: 'school-1',
    tags: ['mitosis', 'meiosis', 'división celular', 'ejercicios'],
    uploadedAt: '2026-02-20',
  },
  {
    id: 'mat-3', title: 'Leyes de Newton - Resumen', description: 'Síntesis de las tres leyes de Newton con ejemplos cotidianos.',
    fileType: 'pdf', fileName: 'newton-resumen.pdf', fileSize: '980 KB',
    subjectId: 'sub-fis', subjectName: 'Física',
    teacherId: 'user-marco', schoolId: 'school-1',
    tags: ['Newton', 'fuerza', 'movimiento', 'inercia'],
    uploadedAt: '2026-02-10',
  },
  {
    id: 'mat-4', title: 'Tabla Periódica Interactiva', description: 'Enlace a recurso interactivo de la tabla periódica.',
    fileType: 'link', fileName: 'https://ptable.com', fileSize: '-',
    subjectId: 'sub-qui', subjectName: 'Química',
    teacherId: 'user-marco', schoolId: 'school-1',
    tags: ['tabla periódica', 'elementos', 'recurso online'],
    uploadedAt: '2026-01-25',
  },
  {
    id: 'mat-5', title: 'Problemas de Álgebra - Nivel Intermedio', description: 'Ejercitación de ecuaciones y sistemas para 3er y 4to año.',
    fileType: 'pdf', fileName: 'algebra-problemas.pdf', fileSize: '1.5 MB',
    subjectId: 'sub-mat', subjectName: 'Matemática',
    teacherId: 'user-laura', schoolId: 'school-1',
    tags: ['álgebra', 'ecuaciones', 'sistemas', 'ejercicios'],
    uploadedAt: '2026-02-18',
  },
  {
    id: 'mat-6', title: 'Análisis Matemático - Funciones', description: 'Introducción a funciones lineales y cuadráticas.',
    fileType: 'pdf', fileName: 'funciones-intro.pdf', fileSize: '3.1 MB',
    subjectId: 'sub-mat', subjectName: 'Matemática',
    teacherId: 'user-laura', schoolId: 'school-1',
    tags: ['funciones', 'lineal', 'cuadrática', 'gráficos'],
    uploadedAt: '2026-02-22',
  },
  {
    id: 'mat-7', title: 'Revolución de Mayo - Fuentes Primarias', description: 'Documentos históricos de la Revolución de Mayo.',
    fileType: 'pdf', fileName: 'rev-mayo-fuentes.pdf', fileSize: '4.2 MB',
    subjectId: 'sub-his', subjectName: 'Historia', unitName: 'Unidad 2: Independencia',
    teacherId: 'user-carlos', schoolId: 'school-1',
    tags: ['revolución', 'mayo', 'independencia', 'fuentes'],
    uploadedAt: '2026-02-08',
  },
  {
    id: 'mat-8', title: 'Análisis Literario - Cuentos de Borges', description: 'Guía de análisis para "El Aleph" y "La Biblioteca de Babel".',
    fileType: 'doc', fileName: 'borges-analisis.docx', fileSize: '890 KB',
    subjectId: 'sub-len', subjectName: 'Lengua y Literatura',
    teacherId: 'user-carlos', schoolId: 'school-1',
    tags: ['Borges', 'análisis literario', 'cuento', 'narrativa'],
    uploadedAt: '2026-02-25',
  },
];

export function getMaterialsByTeacher(teacherId: string): LibraryMaterial[] {
  return libraryMaterials.filter(m => m.teacherId === teacherId);
}

export function getMaterialsBySubject(subjectId: string): LibraryMaterial[] {
  return libraryMaterials.filter(m => m.subjectId === subjectId);
}

export function searchMaterials(query: string, teacherId?: string): LibraryMaterial[] {
  const lower = query.toLowerCase();
  return libraryMaterials.filter(m => {
    if (teacherId && m.teacherId !== teacherId) return false;
    return (
      m.title.toLowerCase().includes(lower) ||
      m.description.toLowerCase().includes(lower) ||
      m.tags.some(t => t.toLowerCase().includes(lower)) ||
      m.subjectName.toLowerCase().includes(lower)
    );
  });
}
