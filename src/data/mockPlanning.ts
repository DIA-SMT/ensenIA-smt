import type { PlanningUnit } from '../types';

export const planningUnits: PlanningUnit[] = [
  {
    id: 'pu-1', title: 'Unidad 1: Células', subjectId: 'sub-bio', courseId: 'c-4-2',
    teacherId: 'user-marco', order: 1,
    classes: [
      { id: 'pc-1', unitId: 'pu-1', title: 'Estructura Celular', order: 1, objectives: ['Identificar organelas principales', 'Comprender la función del núcleo'], content: 'La célula es la unidad fundamental de la vida. Existen dos tipos principales: eucariotas y procariotas. Durante esta clase abordaremos la estructura interna de las células eucariotas...', isComplete: true },
      { id: 'pc-2', unitId: 'pu-1', title: 'Mitosis y Meiosis', order: 2, objectives: ['Diferenciar mitosis de meiosis', 'Identificar fases de división celular'], content: '', isComplete: false },
    ],
  },
  {
    id: 'pu-2', title: 'Unidad 2: Genética', subjectId: 'sub-bio', courseId: 'c-4-2',
    teacherId: 'user-marco', order: 2,
    classes: [
      { id: 'pc-3', unitId: 'pu-2', title: 'Leyes de Mendel', order: 1, objectives: ['Comprender herencia dominante y recesiva'], content: '', isComplete: false },
      { id: 'pc-4', unitId: 'pu-2', title: 'ADN y ARN', order: 2, objectives: ['Describir la estructura del ADN'], content: '', isComplete: false },
    ],
  },
  {
    id: 'pu-3', title: 'Unidad 1: Mecánica', subjectId: 'sub-fis', courseId: 'c-5-1',
    teacherId: 'user-marco', order: 1,
    classes: [
      { id: 'pc-5', unitId: 'pu-3', title: 'Leyes de Newton', order: 1, objectives: ['Aplicar las tres leyes de Newton'], content: 'Las leyes de Newton son los fundamentos de la mecánica clásica...', isComplete: true },
      { id: 'pc-6', unitId: 'pu-3', title: 'Trabajo y Energía', order: 2, objectives: ['Calcular trabajo mecánico', 'Diferenciar energía cinética y potencial'], content: '', isComplete: false },
    ],
  },
  {
    id: 'pu-4', title: 'Unidad 1: Álgebra', subjectId: 'sub-mat', courseId: 'c-3-1',
    teacherId: 'user-laura', order: 1,
    classes: [
      { id: 'pc-7', unitId: 'pu-4', title: 'Ecuaciones Lineales', order: 1, objectives: ['Resolver ecuaciones de primer grado'], content: '', isComplete: true },
      { id: 'pc-8', unitId: 'pu-4', title: 'Sistemas de Ecuaciones', order: 2, objectives: ['Resolver sistemas 2x2'], content: '', isComplete: false },
    ],
  },
  {
    id: 'pu-5', title: 'Unidad 1: Argentina Colonial', subjectId: 'sub-his', courseId: 'c-3-1',
    teacherId: 'user-carlos', order: 1,
    classes: [
      { id: 'pc-9', unitId: 'pu-5', title: 'El Virreinato del Río de la Plata', order: 1, objectives: ['Comprender la organización colonial'], content: '', isComplete: true },
      { id: 'pc-10', unitId: 'pu-5', title: 'Revolución de Mayo', order: 2, objectives: ['Analizar las causas de la revolución'], content: '', isComplete: false },
    ],
  },
];

export function getPlanningByTeacher(teacherId: string): PlanningUnit[] {
  return planningUnits.filter(p => p.teacherId === teacherId);
}

export function getPlanningBySubjectAndCourse(subjectId: string, courseId: string, teacherId: string): PlanningUnit[] {
  return planningUnits.filter(p => p.subjectId === subjectId && p.courseId === courseId && p.teacherId === teacherId);
}
