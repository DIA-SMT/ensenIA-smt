/**
 * SMT EstudIA — Navegación por rol
 *
 * Una sola fuente para la barra lateral (escritorio), la barra inferior
 * (celular), el buscador de la barra superior y el título de cada pantalla.
 * Antes eran cuatro listas sueltas que ya no coincidían entre sí.
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Calendar, FlaskConical, Users, BookOpen, Bell, Settings,
  MessageSquare, ClipboardList, HeartHandshake, GraduationCap, Megaphone,
  Rocket, BookMarked, Scale, Sparkles, Compass, Zap,
} from 'lucide-react';
import type { UserRole } from '../types';
import type { RutaPantalla } from './pantallas';

export interface ItemNav {
  ruta: RutaPantalla;
  /** Como se lee en el menú: corto, sin abreviaturas. */
  etiqueta: string;
  /** Título de la pantalla, cuando no es igual a la etiqueta. */
  titulo?: string;
  icono: LucideIcon;
  grupo: string;
  /** Lleva la marca de IA en el menú. */
  ia?: boolean;
  /** Aparece en la barra inferior del celular (hasta cuatro por rol). */
  enBarra?: boolean;
  /** Palabras con las que alguien lo buscaría sin saber cómo se llama. */
  claves?: string;
}

export interface AccionRapida {
  ruta: RutaPantalla;
  etiqueta: string;
  icono: LucideIcon;
  claves?: string;
}

const DOCENTE: ItemNav[] = [
  { ruta: '/dashboard', etiqueta: 'Inicio', titulo: 'Mi día', icono: LayoutDashboard, grupo: 'Mi día', enBarra: true, claves: 'panel tablero resumen hoy' },
  { ruta: '/agenda', etiqueta: 'Agenda', icono: Calendar, grupo: 'Mi día', claves: 'horario clases semana calendario' },
  { ruta: '/actividades', etiqueta: 'Actividades', icono: ClipboardList, grupo: 'Aula', enBarra: true, claves: 'tareas entregas corregir consignas' },
  { ruta: '/libreta', etiqueta: 'Libreta', icono: BookMarked, grupo: 'Aula', enBarra: true, claves: 'notas calificaciones trimestre boletín' },
  { ruta: '/students', etiqueta: 'Estudiantes', icono: Users, grupo: 'Aula', claves: 'alumnos chicos ficha curso' },
  { ruta: '/biblioteca', etiqueta: 'Biblioteca', titulo: 'Biblioteca docente', icono: BookOpen, grupo: 'Aula', claves: 'material documentos archivos apuntes' },
  { ruta: '/ia-lab', etiqueta: 'Laboratorio IA', icono: FlaskConical, grupo: 'Herramientas', ia: true, claves: 'generar evaluación planificación resumen presentación' },
  { ruta: '/migue', etiqueta: 'Migue', icono: Sparkles, grupo: 'Herramientas', ia: true, claves: 'asistente preguntar protocolo' },
  { ruta: '/familias', etiqueta: 'Familias', icono: HeartHandshake, grupo: 'Escuela', claves: 'padres citación tutores' },
  { ruta: '/alerts', etiqueta: 'Alertas', icono: Bell, grupo: 'Escuela', enBarra: true, claves: 'riesgo bienestar señales seguimiento' },
  { ruta: '/normativa', etiqueta: 'Normativa', icono: Scale, grupo: 'Escuela', claves: 'protocolos reglamento convivencia' },
  { ruta: '/settings', etiqueta: 'Ajustes', titulo: 'Ajustes', icono: Settings, grupo: 'Cuenta', claves: 'configuración accesibilidad letra contraste datos' },
];

const DIRECTOR: ItemNav[] = [
  { ruta: '/dashboard', etiqueta: 'Inicio', titulo: 'Tablero de dirección', icono: LayoutDashboard, grupo: 'Escuela', enBarra: true, claves: 'panel indicadores riesgo mapa' },
  { ruta: '/docentes', etiqueta: 'Docentes', titulo: 'Equipo docente', icono: Users, grupo: 'Escuela', enBarra: true, claves: 'profesores equipo adopción' },
  { ruta: '/alerts', etiqueta: 'Alertas', icono: Bell, grupo: 'Escuela', enBarra: true, claves: 'riesgo bienestar señales escaladas' },
  { ruta: '/comunicaciones', etiqueta: 'Comunicaciones', icono: MessageSquare, grupo: 'Comunidad', enBarra: true, claves: 'comunicados avisos mensajes' },
  { ruta: '/familias', etiqueta: 'Familias', icono: HeartHandshake, grupo: 'Comunidad', claves: 'padres citaciones tutores' },
  { ruta: '/normativa', etiqueta: 'Normativa', icono: Scale, grupo: 'Comunidad', claves: 'protocolos reglamento cargar' },
  { ruta: '/migue', etiqueta: 'Migue', icono: Sparkles, grupo: 'Herramientas', ia: true, claves: 'asistente preguntar protocolo' },
  { ruta: '/settings', etiqueta: 'Ajustes', icono: Settings, grupo: 'Cuenta', claves: 'configuración umbrales accesibilidad letra contraste datos' },
];

const ESTUDIANTE: ItemNav[] = [
  { ruta: '/mis-actividades', etiqueta: 'Actividades', titulo: 'Mis actividades', icono: ClipboardList, grupo: 'Escuela', enBarra: true, claves: 'tareas entregas notas temario' },
  { ruta: '/estudiar', etiqueta: 'Estudiar', icono: Rocket, grupo: 'Escuela', ia: true, enBarra: true, claves: 'practicar quiz repaso racha' },
  { ruta: '/mi-biblioteca', etiqueta: 'Biblioteca', icono: BookOpen, grupo: 'Escuela', enBarra: true, claves: 'material apuntes documentos' },
  { ruta: '/migue', etiqueta: 'Migue', icono: Sparkles, grupo: 'Escuela', ia: true, enBarra: true, claves: 'asistente ayuda hablar' },
  { ruta: '/vocacional', etiqueta: 'Vocacional', titulo: 'Orientación vocacional', icono: Compass, grupo: 'Mi futuro', claves: 'carrera orientación intereses' },
  { ruta: '/settings', etiqueta: 'Ajustes', icono: Settings, grupo: 'Cuenta', claves: 'configuración accesibilidad letra contraste datos' },
];

const FAMILIA: ItemNav[] = [
  { ruta: '/comunicados-familia', etiqueta: 'Comunicados', icono: Megaphone, grupo: 'Escuela', enBarra: true, claves: 'avisos citaciones mensajes' },
  { ruta: '/mis-hijos', etiqueta: 'Mis hijos', icono: GraduationCap, grupo: 'Escuela', enBarra: true, claves: 'notas temario hijo hija' },
  { ruta: '/migue', etiqueta: 'Migue', icono: Sparkles, grupo: 'Escuela', ia: true, enBarra: true, claves: 'asistente preguntar convivencia' },
  { ruta: '/settings', etiqueta: 'Ajustes', icono: Settings, grupo: 'Cuenta', enBarra: true, claves: 'configuración accesibilidad letra contraste datos' },
];

export const NAV_POR_ROL: Record<UserRole, ItemNav[]> = {
  docente: DOCENTE,
  director: DIRECTOR,
  estudiante: ESTUDIANTE,
  padre: FAMILIA,
};

export const ACCIONES_POR_ROL: Record<UserRole, AccionRapida[]> = {
  docente: [
    { ruta: '/actividad-rapida', etiqueta: 'Nueva actividad rápida', icono: Zap, claves: 'crear publicar consigna' },
  ],
  director: [],
  estudiante: [],
  padre: [],
};

export const ETIQUETA_ROL: Record<UserRole, string> = {
  director: 'Dirección',
  docente: 'Docente',
  estudiante: 'Estudiante',
  padre: 'Familia',
};

export function inicioDe(rol: UserRole | undefined): RutaPantalla {
  if (rol === 'estudiante') return '/mis-actividades';
  if (rol === 'padre') return '/comunicados-familia';
  return '/dashboard';
}

/** Título de la pantalla actual, incluidas las de detalle. */
export function tituloDe(rol: UserRole | undefined, pathname: string): string {
  const items = rol ? NAV_POR_ROL[rol] : [];
  const item = items.find(i => i.ruta === pathname);
  if (item) return item.titulo ?? item.etiqueta;
  if (pathname === '/actividad-rapida') return 'Actividad rápida';
  if (pathname.startsWith('/actividades/')) return 'Resultados de la actividad';
  if (pathname.startsWith('/mis-actividades/')) return 'Actividad';
  if (pathname.startsWith('/cursos/')) return 'Ficha del curso';
  return 'SMT EstudIA';
}

/** A qué ítem del menú pertenece una ruta de detalle. */
export function itemActivo(rol: UserRole | undefined, pathname: string): RutaPantalla | null {
  const items = rol ? NAV_POR_ROL[rol] : [];
  const exacto = items.find(i => i.ruta === pathname);
  if (exacto) return exacto.ruta;
  if (pathname.startsWith('/actividades/') || pathname === '/actividad-rapida') return '/actividades';
  if (pathname.startsWith('/mis-actividades/')) return '/mis-actividades';
  if (pathname.startsWith('/cursos/')) return '/dashboard';
  return null;
}
