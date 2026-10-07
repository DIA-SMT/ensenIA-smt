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
  Rocket, BookMarked, Scale, Sparkles, Compass, Zap, Sun, Radio, Boxes, Activity, Building2, CalendarClock, Wand2, Library,
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
  /** Avatar propio para asistentes con identidad visual. */
  imagen?: string;
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

// Lo del día a día arriba; crear es UNA entrada que pregunta qué armar
// (antes eran cuatro: Armar módulo, Laboratorio IA, Actividad rápida y el
// botón de la barra). Agenda vive en "Mis clases".
const DOCENTE: ItemNav[] = [
  { ruta: '/hoy', etiqueta: 'Hoy', titulo: 'Mi día', icono: Sun, grupo: 'Mi día', enBarra: true, claves: 'inicio panel resumen hoy clases' },
  { ruta: '/clase-en-vivo', etiqueta: 'Clase en vivo', icono: Radio, grupo: 'Mi día', enBarra: true, claves: 'qr proyectar sala preguntas presencia' },
  { ruta: '/mis-clases', etiqueta: 'Mis clases', icono: Calendar, grupo: 'Mi día', claves: 'horario clases semana calendario agenda clima aula repasar entendieron temas difíciles comprensión' },
  { ruta: '/crear', etiqueta: 'Crear', titulo: '¿Qué querés crear?', icono: Wand2, grupo: 'Aula', ia: true, claves: 'nueva actividad módulo placas diapositivas evaluación resumen laboratorio ia generar' },
  { ruta: '/actividades', etiqueta: 'Actividades', icono: ClipboardList, grupo: 'Aula', enBarra: true, claves: 'tareas entregas consignas resultados corregir' },
  { ruta: '/libreta', etiqueta: 'Libreta', icono: BookMarked, grupo: 'Aula', enBarra: true, claves: 'notas calificaciones trimestre boletín informes' },
  { ruta: '/students', etiqueta: 'Estudiantes', icono: Users, grupo: 'Aula', claves: 'alumnos chicos ficha curso' },
  { ruta: '/biblioteca', etiqueta: 'Mis materiales', titulo: 'Biblioteca docente', icono: BookOpen, grupo: 'Aula', claves: 'material documentos archivos apuntes' },
  { ruta: '/familias', etiqueta: 'Citaciones', titulo: 'Citaciones a familias', icono: HeartHandshake, grupo: 'Escuela', claves: 'familias padres citar citación tutores reunión' },
  { ruta: '/alerts', etiqueta: 'Alertas', icono: Bell, grupo: 'Escuela', claves: 'riesgo bienestar señales seguimiento hablar avisar dirección' },
  { ruta: '/comunicados', etiqueta: 'Comunicados', titulo: 'Comunicados de dirección', icono: Megaphone, grupo: 'Escuela', claves: 'avisos dirección mensajes reunión' },
  { ruta: '/normativa', etiqueta: 'Normativa', icono: Scale, grupo: 'Escuela', claves: 'protocolos reglamento convivencia' },
  { ruta: '/settings', etiqueta: 'Ajustes', titulo: 'Ajustes', icono: Settings, grupo: 'Cuenta', claves: 'configuración accesibilidad letra contraste datos' },
];

const DIRECTOR: ItemNav[] = [
  { ruta: '/panel', etiqueta: 'Qué está pasando', icono: Activity, grupo: 'Escuela', enBarra: true, claves: 'inicio hoy clima aula asistencia' },
  { ruta: '/dashboard', etiqueta: 'Tablero', titulo: 'Tablero de dirección', icono: LayoutDashboard, grupo: 'Escuela', claves: 'panel indicadores riesgo mapa' },
  { ruta: '/docentes', etiqueta: 'Docentes', titulo: 'Equipo docente', icono: Users, grupo: 'Escuela', enBarra: true, claves: 'profesores equipo adopción' },
  { ruta: '/horario', etiqueta: 'Horario', titulo: 'Horario de la escuela', icono: CalendarClock, grupo: 'Escuela', claves: 'agenda clases semana cursos aulas' },
  { ruta: '/alerts', etiqueta: 'Alertas', icono: Bell, grupo: 'Escuela', enBarra: true, claves: 'riesgo bienestar señales escaladas' },
  { ruta: '/comunicaciones', etiqueta: 'Comunicaciones', icono: MessageSquare, grupo: 'Comunidad', enBarra: true, claves: 'comunicados avisos mensajes' },
  { ruta: '/familias', etiqueta: 'Familias', icono: HeartHandshake, grupo: 'Comunidad', claves: 'padres citaciones tutores' },
  { ruta: '/normativa', etiqueta: 'Normativa', icono: Scale, grupo: 'Comunidad', claves: 'protocolos reglamento cargar' },
  { ruta: '/mi-escuela', etiqueta: 'Mi escuela', titulo: 'Gestión de la escuela', icono: Building2, grupo: 'Cuenta', claves: 'usuarios cuentas docentes alumnos cursos materias alta clave dni' },
  { ruta: '/settings', etiqueta: 'Ajustes', icono: Settings, grupo: 'Cuenta', claves: 'configuración umbrales accesibilidad letra contraste datos' },
];

// El superadmin administra escuelas y cuentas: no usa la app como aula.
const SUPERADMIN: ItemNav[] = [
  { ruta: '/admin', etiqueta: 'Escuelas', icono: Building2, grupo: 'Administración', enBarra: true, claves: 'escuelas directores usuarios cuentas alta' },
  { ruta: '/admin/consumo-ia', etiqueta: 'Consumo de IA', icono: Activity, grupo: 'Administración', enBarra: true, claves: 'gasto costo tokens uso inteligencia artificial dólares' },
  { ruta: '/admin/referencias', etiqueta: 'Biblioteca de referencia', icono: Library, grupo: 'Administración', claves: 'normativa leyes resoluciones nap esi núcleos aprendizajes prioritarios técnicas pedagógicas cargar' },
  { ruta: '/settings', etiqueta: 'Ajustes', icono: Settings, grupo: 'Cuenta', enBarra: true, claves: 'configuración accesibilidad letra contraste datos' },
];

const ESTUDIANTE: ItemNav[] = [
  { ruta: '/mis-actividades', etiqueta: 'Mi escuela', titulo: 'Mi escuela', icono: ClipboardList, grupo: 'Escuela', enBarra: true, claves: 'tareas entregas notas temario' },
  { ruta: '/estudiar', etiqueta: 'Estudiar', icono: Rocket, grupo: 'Escuela', ia: true, enBarra: true, claves: 'practicar quiz repaso racha' },
  { ruta: '/mi-biblioteca', etiqueta: 'Mis materiales', icono: BookOpen, grupo: 'Escuela', enBarra: true, claves: 'biblioteca material apuntes documentos' },
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
  superadmin: SUPERADMIN,
};

export const ACCIONES_POR_ROL: Record<UserRole, AccionRapida[]> = {
  // Siguen a mano desde el buscador aunque ya no estén sueltas en el menú
  docente: [
    { ruta: '/actividad-rapida', etiqueta: 'Nueva actividad rápida', icono: Zap, claves: 'crear publicar consigna' },
    { ruta: '/modulo', etiqueta: 'Armar la clase (diapositivas, juego y tarea)', icono: Boxes, claves: 'módulo clase armada material planificar armar placas diapositivas juego crucigrama diagrama tarea enviar' },
    { ruta: '/ia-lab', etiqueta: 'Laboratorio IA', icono: FlaskConical, claves: 'generar evaluación planificación resumen presentación chat' },
    { ruta: '/agenda', etiqueta: 'Mi horario de la semana', icono: Calendar, claves: 'agenda horario semana calendario' },
  ],
  director: [],
  estudiante: [],
  padre: [],
  superadmin: [],
};

export const ETIQUETA_ROL: Record<UserRole, string> = {
  director: 'Dirección',
  docente: 'Docente',
  estudiante: 'Estudiante',
  padre: 'Familia',
  superadmin: 'Superadmin',
};

/**
 * Inicio de cada rol. Tiene que ser una ruta que ese rol PUEDA abrir:
 * ProtectedRoute rebota a quien entra donde no le toca... hacia inicioDe().
 * Si el inicio no le está permitido, rebota contra sí mismo para siempre
 * (le pasó al docente con /dashboard, que es solo de dirección).
 */
export function inicioDe(rol: UserRole | undefined): RutaPantalla {
  if (rol === 'estudiante') return '/mis-actividades';
  if (rol === 'padre') return '/comunicados-familia';
  if (rol === 'docente') return '/hoy';
  if (rol === 'superadmin') return '/admin';
  // Dirección arranca en "Qué está pasando", el primer ítem de su menú
  return '/panel';
}

/** Título de la pantalla actual, incluidas las de detalle. */
export function tituloDe(rol: UserRole | undefined, pathname: string): string {
  const items = rol ? NAV_POR_ROL[rol] : [];
  const item = items.find(i => i.ruta === pathname);
  if (item) return item.titulo ?? item.etiqueta;
  if (pathname === '/actividad-rapida') return 'Actividad rápida';
  if (pathname === '/modulo') return 'Armar la clase';
  if (pathname === '/ia-lab') return 'Laboratorio IA';
  if (pathname === '/agenda') return 'Mi horario';
  if (pathname === '/migue') return 'Migue';
  if (pathname.startsWith('/actividades/')) return 'Resultados de la actividad';
  if (pathname.startsWith('/mis-actividades/')) return 'Actividad';
  if (pathname.startsWith('/materia/')) return 'Mi materia';
  if (pathname.startsWith('/cursos/')) return 'Ficha del curso';
  if (pathname.startsWith('/admin/escuelas/')) return 'Gestión de la escuela';
  return 'SMT EstudIA';
}

/** A qué ítem del menú pertenece una ruta de detalle. */
export function itemActivo(rol: UserRole | undefined, pathname: string): RutaPantalla | null {
  const items = rol ? NAV_POR_ROL[rol] : [];
  const exacto = items.find(i => i.ruta === pathname);
  if (exacto) return exacto.ruta;
  if (pathname.startsWith('/actividades/')) return '/actividades';
  // Lo que se abre desde "Crear" se marca en "Crear"
  if (['/actividad-rapida', '/modulo', '/ia-lab'].includes(pathname)) return rol === 'docente' ? '/crear' : null;
  if (pathname === '/agenda') return '/mis-clases';
  if (pathname.startsWith('/mis-actividades/') || pathname.startsWith('/materia/')) return '/mis-actividades';
  if (pathname.startsWith('/cursos/')) return rol === 'director' ? '/panel' : '/students';
  if (pathname.startsWith('/admin/escuelas/')) return '/admin';
  return null;
}
