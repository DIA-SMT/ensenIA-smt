/**
 * SMT EstudIA — Cómo se usa la app, para que Migue lo pueda explicar.
 *
 * Migue sabía de pedagogía y de normativa, pero no de EstudIA: a "¿cómo armo
 * un multiple choice?" contestaba con buenas prácticas y no con los pasos en
 * la app. Esta guía va en la parte fija del prompt (se cachea) y le dice,
 * por rol, qué hay en cada pantalla y cómo se hace lo más común.
 *
 * MANTENERLA AL DÍA: los nombres entre comillas son los textos que se ven en
 * la app (menú en src/lib/navegacion.ts, botones en cada pantalla). Si una
 * pantalla cambia un botón o se mueve de lugar, se cambia acá en el mismo
 * commit: un paso a paso con un botón que no existe es peor que no contestar.
 * Armada el 19/10/2026 leyendo las pantallas.
 */

export type RolGuia = 'docente' | 'director' | 'estudiante' | 'padre';

// ── En qué pantalla está la persona ──────────────────────────────────────
//
// El globito de Migue (src/components/FloatingMigue.tsx) manda la ruta en la
// que está la persona. Solo se aceptan rutas de esta lista y el nombre sale
// de acá: lo que llega del navegador nunca entra tal cual al prompt.

interface Pantalla {
  ruta: RegExp;
  /** Nombre como se ve en la app, y dónde está */
  docente?: string;
  director?: string;
}

const PANTALLAS: Pantalla[] = [
  { ruta: /^\/hoy$/, docente: '"Hoy" (título "Mi día"), en el menú, grupo "Mi día"' },
  { ruta: /^\/planificacion$/, docente: '"Planificación" (título "Mi planificación"), en el menú, grupo "Mi día"' },
  { ruta: /^\/mis-clases$/, docente: '"Mis clases", en el menú, grupo "Mi día"' },
  { ruta: /^\/agenda$/, docente: '"Mi horario" (se llega desde "Mis clases" o el buscador: "Mi horario de la semana")' },
  { ruta: /^\/crear$/, docente: '"Crear" (título "¿Qué querés crear?": primero "¿Para qué tema?", abajo "Algo suelto, sin tema"), en el menú, grupo "Aula"' },
  { ruta: /^\/actividades$/, docente: '"Actividades" (la lista de sus actividades), en el menú, grupo "Aula"' },
  { ruta: /^\/actividades\/nueva$/, docente: '"Armar actividad, TP o evaluación" (armando una actividad nueva)' },
  { ruta: /^\/actividades\/[^/]+\/editar$/, docente: '"Editar la actividad" (editando una actividad que ya existe)' },
  { ruta: /^\/actividades\/[^/]+$/, docente: '"Resultados de la actividad" (una actividad puntual, con las entregas)' },
  { ruta: /^\/actividad-rapida$/, docente: '"Actividad rápida" (se llega desde "Crear" o el buscador)' },
  { ruta: /^\/modulo$/, docente: '"Armar la clase completa" (diapositivas, juego y tarea)' },
  { ruta: /^\/ia-lab$/, docente: '"Preparar con la IA" (en el buscador: "Preparar con la IA")' },
  { ruta: /^\/tema\/[^/]+$/, docente: '"Preparar la clase" (un tema de su planificación)' },
  { ruta: /^\/libreta$/, docente: '"Libreta" (notas), en el menú, grupo "Aula"' },
  { ruta: /^\/asistencia$/, docente: '"Asistencia de hoy" (pasar lista; se llega desde "Hoy" → "Pasar lista")' },
  { ruta: /^\/corregir$/, docente: '"Para corregir" (todas las entregas sin nota; se llega desde "Hoy")' },
  { ruta: /^\/students$/, docente: '"Estudiantes", en el menú, grupo "Aula"' },
  { ruta: /^\/biblioteca$/, docente: '"Mis materiales", en el menú, grupo "Aula"' },
  { ruta: /^\/clase-en-vivo$/, docente: '"Clase en vivo", en el menú, grupo "Aula"', director: '"Sala en vivo", en el menú, grupo "Comunidad"' },
  { ruta: /^\/seguimiento$/, docente: '"Seguimiento" (consultas, entregas y quién viene atrasado), en el menú, grupo "Aula"' },
  { ruta: /^\/perfil$/, docente: '"Mi perfil" (título "Mi perfil docente"), en el menú, grupo "Cuenta"', director: '"Mi perfil", en el menú, grupo "Cuenta"' },
  { ruta: /^\/cursos\/[^/]+$/, docente: '"Ficha del curso"', director: '"Ficha del curso"' },
  { ruta: /^\/mensajes$/, docente: '"Mensajes", en el menú, grupo "Escuela"', director: '"Mensajes", en el menú, grupo "Comunidad"' },
  { ruta: /^\/familias$/, docente: '"Citaciones" (título "Citaciones a familias"), en el menú, grupo "Escuela"', director: '"Familias", en el menú, grupo "Comunidad"' },
  { ruta: /^\/alerts$/, docente: '"Alertas", en el menú, grupo "Escuela"', director: '"Alertas", en el menú, grupo "Escuela"' },
  { ruta: /^\/comunicados$/, docente: '"Comunicados" (título "Comunicados de dirección"), en el menú, grupo "Escuela"' },
  { ruta: /^\/normativa$/, docente: '"Normativa", en el menú, grupo "Escuela"', director: '"Normativa", en el menú, grupo "Comunidad"' },
  { ruta: /^\/panel$/, director: '"Qué está pasando", en el menú, grupo "Escuela"' },
  { ruta: /^\/dashboard$/, director: '"Tablero" (título "Tablero de dirección"), en el menú, grupo "Escuela"' },
  { ruta: /^\/docentes$/, director: '"Docentes" (título "Equipo docente"), en el menú, grupo "Escuela"' },
  { ruta: /^\/horario$/, director: '"Horario" (título "Horario de la escuela"), en el menú, grupo "Escuela"' },
  { ruta: /^\/comunicaciones$/, director: '"Comunicaciones", en el menú, grupo "Comunidad"' },
  { ruta: /^\/memoria-estudio$/, director: '"Memoria de estudio", en el menú, grupo "Comunidad"' },
  { ruta: /^\/mi-escuela$/, director: '"Mi escuela" (título "Gestión de la escuela"), en el menú, grupo "Cuenta"' },
  { ruta: /^\/settings$/, docente: '"Ajustes", en el menú, grupo "Cuenta"', director: '"Ajustes", en el menú, grupo "Cuenta"' },
];

/**
 * La pantalla desde la que escribe la persona, ya como texto para el prompt,
 * o '' si no vino o no es una ruta conocida para su rol.
 */
export function pantallaActual(rol: string, ruta: unknown): string {
  if (rol !== 'docente' && rol !== 'director') return '';
  if (typeof ruta !== 'string' || ruta.length > 120) return '';
  const limpia = ruta.split(/[?#]/)[0];
  const p = PANTALLAS.find(x => x.ruta.test(limpia));
  const nombre = p?.[rol];
  if (!nombre) return '';
  return `\n\n## Dónde está ahora
Te escribe desde la pantalla ${nombre}. Si pregunta cómo hacer algo, empezá desde ahí
("en esta pantalla, tocá…") y, si lo que busca está en otra, decile cómo llegar.`;
}

// ── La guía de cada rol ──────────────────────────────────────────────────

const REGLAS = `## Cómo se usa EstudIA (la app)
Cuando te pregunten cómo hacer algo EN LA APP ("¿cómo armo un multiple choice?", "¿dónde
cargo las notas?"), contestá con los pasos de esta guía, numerados y con los nombres de
botones y pantallas entre comillas, tal como aparecen. Primero los pasos; si suma, después
un consejo pedagógico corto.
- Usá **solo** lo que dice esta guía. Si algo no está, decí "eso no lo tengo en mi guía
  de la app" y sugerí buscarlo con el buscador de arriba o preguntarle a la dirección. No
  inventes botones, menús ni pasos: alguien los va a buscar y no los va a encontrar.
- Si la pregunta mezcla las dos cosas ("armame un multiple choice de fracciones"), podés
  proponer las preguntas Y explicar dónde cargarlas.

Para moverse por la app:
- En la computadora, el menú está a la izquierda. En el celular, lo principal está en la
  barra de abajo y el resto en "Más".
- Arriba está el buscador "Buscar o ir a…" (en la computadora también con Ctrl+K): lleva a
  cualquier pantalla escribiendo cómo se llama o para qué sirve.
- El botón "?" de arriba abre la guía rápida "¿Qué querés hacer?", con accesos a lo más
  común.`;

// Entrar y la cuenta: igual para todos
const CUENTA = `### Entrar y la cuenta
- Entrar: en "Email o DNI" va el usuario (el DNI, con o sin puntos, o el email) y en
  "Contraseña" la clave; después "Entrar". Si el equipo es propio, conviene marcar "Es mi
  equipo" (en una compu compartida, no).
- También se puede entrar con "Ingresar con CiDiTuc", con el CUIL y la clave de CiDiTuc
  (la cuenta ciudadana de la Municipalidad). Si dice "No encontramos tu cuenta en
  EstudIA", la dirección tiene que darle de alta con su DNI.
- La primera vez con la clave que le dieron, la app pide "Elegí tu clave": "Clave nueva"
  (8 caracteres o más, distinta de la que le dieron), "Repetila" y "Guardar y entrar".
- No hay "olvidé mi contraseña" ni forma de cambiarla después desde la app: si se la
  olvidó, la dirección le genera una nueva.
- "Ajustes": "Tamaño de letra", "Contraste alto", "Reducir movimiento", "Ahorro de datos"
  y "Cerrar sesión" (al cerrar sesión se borra lo guardado para usar sin señal).
- Instalar la app en el teléfono: en "Ajustes" → "Instalar la app" (y en el celular, la
  tarjeta "Instalá EstudIA en tu teléfono"). En Android se instala con "Instalar"; en iPhone,
  "Compartir" (el cuadrado con la flecha) → "Agregar a pantalla de inicio" → "Agregar".`;

// Mensajes: igual para docentes y dirección
const MENSAJES_EQUIPO = `### Mensajes
1. En "Mensajes" (o el ícono de mensajes de la barra de arriba), tocá "Nuevo".
2. En "Para", buscá con "Buscá por nombre, materia o curso…" y tocá a cada persona.
3. Completá "Asunto" y "Mensaje" y tocá "Enviar".
Pestañas "Bandeja" y "Archivadas"; en una conversación, "Archivar". Docentes y directivos
se escriben entre sí sin restricción; el docente les escribe a los estudiantes de sus
materias y a sus familias; la dirección, a cualquiera de la escuela. Si en la conversación
hay un estudiante, la dirección la puede leer y no se borra (la app lo avisa). Los
comunicados de dirección también llegan a la Bandeja, con "Responder a …".`;

const NORMATIVA_LEER = `### Normativa
Pestañas "De la escuela" y "Nacional, provincial y municipal": se busca, se filtra por
categoría y se toca una norma para leerla.`;

const SESION_EQUIPO = `Para el personal: si no se marca "Es mi equipo", la sesión se cierra sola a las 12 h.
Quien no tiene email entra con su DNI. Quien trabaja en más de una escuela la cambia
desde la barra de arriba.`;

const GUIA: Record<RolGuia, string> = {
  docente: `## Guía de la app para docentes
Menú: grupo "Mi día": "Hoy" (el inicio), "Planificación", "Mis clases"; grupo "Aula":
"Crear", "Actividades", "Libreta", "Estudiantes", "Mis materiales", "Clase en vivo";
grupo "Escuela": "Mensajes", "Citaciones", "Alertas", "Comunicados", "Normativa"; grupo
"Cuenta": "Ajustes". No están en el menú (se llega con el buscador o desde otra pantalla):
"Nueva actividad rápida", "Armar la clase completa (diapositivas, juego y tarea)",
"Preparar con la IA", "Migue, tu asistente", "Mi horario de la semana", la asistencia (desde "Hoy"
→ "Pasar lista") y "Para corregir" (desde "Hoy").
Sin materias asignadas, la app dice "Todavía no tenés cursos asignados": se las asigna la
dirección. Lo que se arma con IA (presentaciones, actividades, resúmenes, tarjetas, juegos)
tiene 15 usos por día ("Te quedan N usos de IA hoy"); las charlas con Migue van aparte.

### Armar un TP, una evaluación o una actividad con preguntas (opción múltiple o desarrollo)
Lo mejor es desde el tema (así queda con él): "Crear" → "¿Para qué tema?" → "Prepararlo",
o desde la planificación: en un tema, "Preparar ▾" → "Trabajo
práctico" o "Evaluación" (así ya queda con su tema).
1. "Para": materia y curso (aparece solo si tiene más de un curso).
2. "Tema de la planificación" (opcional) y "Qué es": "💻 Actividad", "📂 TP" o
   "📝 Evaluación".
3. Opcional, con IA: en "Armar con IA desde «tema»" se escribe lo que se quiere (por
   ejemplo "10 preguntas de opción múltiple") y "Armar con IA": arma la consigna y las
   partes con puntos. Hay que revisarla antes de guardar, sobre todo la opción correcta.
4. "Título" y "Consigna para los estudiantes".
5. "Partes": "+ Parte de opción múltiple" o "+ Parte de desarrollo". Son los dos únicos
   tipos: no hay verdadero/falso (se arma como opción múltiple con dos opciones,
   "Verdadero" y "Falso").
6. Opción múltiple: se escribe la pregunta y las opciones (A, B, C…; "+ Opción" agrega
   hasta 6, mínimo 2) y se marca la correcta con el botón redondo a la izquierda de esa
   opción. El estudiante no la ve hasta entregar. Se corrige sola.
7. Puntos: cada parte tiene sus "pts"; "Repartir 10" reparte 10 puntos (el doble a las de
   desarrollo). Un TP o una evaluación tiene que tener puntaje. Las flechas ordenan las
   partes y el tacho las quita.
8. "Fecha de entrega (opcional)": vence ese día a las 23:59.
9. "Guardar borrador" (los estudiantes no la ven) o "Publicar a {curso}" (la ven en su
   "Mi escuela", también sin señal). Si falta algo, la app dice qué (por ejemplo "En la
   parte 2, marcá la opción correcta.").
Con entregas ya hechas se pueden cambiar textos, la opción correcta y los puntos (la
opción múltiple se recorrige sola), pero no agregar ni quitar partes: para eso,
"duplicala como borrador".

### Actividad rápida
"Crear" → "Actividad rápida" (o el buscador: "Nueva actividad rápida"): "¿Para qué curso?"
→ "¿Sobre qué tema?" y "Generar con IA" (o "…o escribila vos") → revisarla en "Así la ven
tus estudiantes" ("Editar") → opcional "Generar preguntas con IA" (cuestionario que se
corrige solo; las preguntas se quitan o se regeneran, no se editan de a una) → fecha
("Sin fecha", "Para mañana", "En la semana") y "Puntos" → "Publicar a {curso}": se
publica directo, sin borrador. Después: "Mostrar QR para el aula", "Ver resultados" o
"Crear otra". Para editar cada pregunta, conviene "Trabajo práctico o evaluación".

### Actividades, resultados y corrección
- "Actividades": la lista, con filtro de curso, buscador y "Todas" / "Abiertas" / "Con
  entregas" / "Cerradas". En cada una: el QR para el aula, el candado ("Cerrar entregas"
  / "Reabrir"), "Copiar a otro curso", "Eliminar" (no se deshace) y "Seguir armando" o
  "Resultados".
- "Resultados": cuántos entregaron, "Qué les costó" (aciertos por pregunta) y la tabla
  por estudiante. Para corregir se toca la fila: respuestas con ✓/✗, "Devolución rápida"
  (👏 👍 💪 🤝), puntaje por parte, "Nota final", "Devolución (opcional)", "Sugerir
  devolución" (con IA) y "Guardar calificación". Si lo entregó en papel: "Lo entregó en
  papel" → nota → "Guardar"; o "No lo entregó".
- "Para corregir" (desde "Hoy": "N entregas esperando tu nota"): todas las entregas sin
  nota, una tras otra, con "Guardar y seguir".
- Cada actividad publicada con puntaje (y todo TP o evaluación) aparece sola como columna
  en la "Libreta", pasada a la escala de 1 a 10.

### Planificación del año
1. "Planificación": elegir materia·curso y año.
2. "Subir el programa" (PDF o Word) → "Analizar con IA" → destildar lo que no va → "Crear
   N unidades · M clases". O "Armarla a mano": "+ Unidad" y el "+" de cada unidad para
   sumar temas.
3. Las fechas salen del horario: si no está cargado, "Cargar mi horario". "Reacomodar
   fechas" o "Repartir fechas" reparte los temas que faltan dar.
4. En cada tema: "Preparar ▾" ("Todo lo del tema", "La clase completa", "Presentación",
   "Trabajo práctico", "Evaluación", "Preguntale a Migue", "Arranca el", "Cambiar el
   nombre") y el ✓ "Marcar como dada".

### Preparar la clase de un tema
"Preparar ▾" → "Todo lo del tema": "Para dar la clase" (sus materiales, "Armar la clase
completa", "Presentación con IA", "Sumar de la biblioteca") y "Para los chicos"
("Trabajo práctico", "Evaluación", "Actividad") y "Dar esta clase en vivo".

### Armar la clase completa (diapositivas, juego y tarea)
"¿Para qué curso?" → "¿De dónde sale el contenido?" (un tema de la planificación, un
material de la biblioteca o "De un tema nuevo") → "Armar la clase completa" → elegir las piezas
(Diapositivas, Tarea, Crucigrama, Diagrama, Tarjetas de repaso, Podcast, "Pregunta para la
clase en vivo") → "Generar N cosas" → "Revisá tu clase" (cada parte con su casilla
"Enviar") → "Enviar al curso" o "Dejarla guardada sin enviar". Los chicos la ven en "Mis
materiales"; la tarea se crea al enviar.

### Migue (vos) y "Preparar con la IA"
Vos sos el asistente del docente: el globito con tu cara, abajo a la derecha, y el botón
"Preguntale a Migue" en el tema, en cada actividad, en los materiales de "Mis materiales"
y en "Crear". Sabés lo que está mirando (te llega en "Lo que está mirando ahora"). Debajo de
cada respuesta tuya hay "Usar esto" (revisarla y "Insertar en clase", "Guardar como
material" o "Publicar actividad"), "Copiar" y los botones que propongas.
"Preparar con la IA" (en el buscador) son las herramientas que arman cosas: "Crear una
actividad", "Armar una evaluación", "Resumir un texto", "Preparar diapositivas", "Evaluar
exposiciones", "Hacer un diagrama", "Armar un crucigrama". Con cada resultado: "Revisar y
usar" → "Insertar en clase", "Guardar como material" o "Publicar actividad".

### Clase en vivo
1. "Clase en vivo" (o en "Hoy", "Dar en vivo") → "¿Para qué curso?" → opcional "Material
   de la clase" → "Iniciar clase en vivo". Los alumnos del curso la ven en su pantalla,
   sin código. Para gente sin cuenta, activar "Invitados" (QR y código).
2. "Lanzar actividad": "Check-in emocional", "Pregunta rápida", "Encuesta",
   "Multi-selección", "Nube de palabras" o "Respuesta libre" → la pregunta y las opciones
   (en "Pregunta rápida", tocar el círculo de la correcta) → "Lanzar al curso". Después:
   "Revelar respuesta", "Premiar a los que acertaron", "Cerrar actividad".
3. "Proyectar" (arriba) muestra la pregunta, los resultados y el QR en pantalla completa.
   "Proyectar" en "Material de la clase" muestra el material: si se lanza una pregunta
   (también desde el celular) pasa sola a la pregunta, y al cerrarla vuelve al material en
   la misma lámina. Se cambia a mano con "Pregunta y QR" y "Material".
4. "Terminar" → "Terminar clase" abre el "Resumen de la clase". En "Qué sigue": "Pasar
   asistencia de hoy", el repaso y "Marcar «tema» como dado" (lo tilda en la planificación).

### Libreta (notas)
Elegir "Materia y curso" y "Trimestre". Pestañas:
- "Notas": "Cargar notas de una evaluación" → "Título", "Tipo", "Fecha", "Cómo se
  registra" ("Con nota (1 a 10)" o sin nota: completo, incompleto o no lo entregó), la de
  cada alumno (o "Ausente") → "Guardar notas" (alumnos y familias las ven al guardar). Las
  actividades de la app aparecen solas. Para cerrar el trimestre: "Nota del trimestre"
  ("Usar el promedio donde falta" la completa) → "Guardar borrador" o "Publicar trimestre".
- "Temario y criterios": cada unidad en su trimestre, y "Publicar criterios".
- "Boletín y informes": conducta, observaciones, informes y "Libreta (PDF)".

### Asistencia
En "Hoy", en la clase, "Pasar lista" (o en el horario, la clase → "Pasar lista"). Todos
arrancan presentes: se toca a cada uno para cambiarlo (ausente, "Llegó tarde",
justificado) o "Todos presentes" / "Todos ausentes" → "Guardar asistencia". Sin señal se
guarda y se manda sola.

### Horario
"Mis clases" → "Mi horario" (o el buscador: "Mi horario de la semana") → "Agregar clase"
→ "Materia y curso", "Días", "Empieza", "Dura", "Aula (opcional)" → "Guardar".

### Estudiantes
"Estudiantes": buscar y tocar a alguien abre su perfil: notas, "Dar logro", "Dar
medalla", "Observaciones" ("Guardar observación"), "Familia" ("Escribirle a …", "Citar a
la familia") y "Avisar a dirección".

### Mis materiales (biblioteca)
"Subir" → el archivo (PDF, Word o imagen), "Título", "Materia y curso" y la casilla
"Compartir con los estudiantes de …" → "Subir a la biblioteca". "Video" suma un link de
YouTube. Cada material tiene, según el tipo: "Resumen IA", "Crear tarjetas", "Crear
podcast", "Preguntale a Migue", "Adaptar", "Diagrama", "Crucigrama", "Juegos", "En vivo", "Compartir".

### Citaciones, alertas y comunicados
- Citar a una familia: "Citaciones" → "Familia de" (el estudiante) → "Título", "Mensaje"
  y, si se quiere, "Fecha", "Hora", "Lugar" → "Enviar la citación". Ahí se ve quién la
  leyó y quién asistirá.
- "Alertas": "Tomar en seguimiento" → "Registrar intervención"; "Cerrar con resultado";
  "Avisar a dirección"; "Ver ficha". Si nadie interviene, se escala sola a dirección.
- "Comunicados": los de dirección; "Responder" contesta por Mensajes.

${MENSAJES_EQUIPO}

${NORMATIVA_LEER}

### Sin señal
En "Hoy", "Preparar para el aula" → "Preparar" (con señal): baja cursos, listas, libretas,
temario y fichas. Sin señal, la asistencia, las notas en borrador y las observaciones se
guardan y se mandan solas; publicar notas necesita señal.

### Ajustes
Además de lo de todos, "Lo que la IA recuerda de cómo trabajás" (se prende, se apaga y se
borra).

${CUENTA}
${SESION_EQUIPO}`,

  director: `## Guía de la app para dirección
Menú: grupo "Escuela": "Qué está pasando" (el inicio), "Tablero", "Docentes", "Horario",
"Alertas"; grupo "Comunidad": "Mensajes", "Comunicaciones", "Familias", "Normativa",
"Memoria de estudio"; grupo "Cuenta": "Mi escuela" y "Ajustes".

### Mi escuela (armar la escuela y las cuentas)
Pestañas "Cursos y materias", "Personal", "Horario", "Calendario", "Estudiantes",
"Familias" y "Datos". Mientras falte algo aparece "Armá la escuela" con el paso que sigue.
- **Cursos y materias**: curso = año (1° a 7°) + "División (A, B...)" y "Agregar";
  materia = nombre y "Agregar". Una materia "se dicta" en un curso cuando se le asigna a
  un docente. El tacho aparece solo si el curso no tiene estudiantes o la materia no tiene
  docente.
- **Sumar un docente**: "Personal" → "Sumar persona" → "Nombre", "Apellido", "DNI" (es
  obligatorio) y "Email (opcional)" → "Crear cuenta". Aparece "Cuenta creada" con el
  usuario y la clave inicial ("Copiar" / "Imprimir"): la clave se ve una sola vez. Con
  email entra con el email; sin email, con el DNI. Dirección suma docentes, no directores.
- **Asignarle materias**: en la fila del docente, "Asignar materia" → "Materia..." y
  "Curso..." → "Asignar". Para sacarla, la ✕ del chip y "Quitar materia". Al asignar, los
  estudiantes del curso quedan inscriptos solos en esa materia.
- **Estudiantes de a uno**: "Estudiantes" → "Cargar estudiantes" → "Curso", "Nombre",
  "Apellido", "DNI" → "Crear" (queda abierto para el siguiente); al final "Imprimir N" o
  "Terminar". Entran con su DNI.
- **Estudiantes con planilla**: "Estudiantes" → "Desde planilla" → elegir el Excel (.xlsx)
  o CSV (hay "Descargar la plantilla vacía") → revisar → "Cargar N estudiantes" → al final
  "Descargar claves" o "Imprimir". La planilla puede traer la familia; la familia sin DNI
  no se carga (se suma después en "Familias").
- **Cambiar de curso** a un estudiante: la lista de curso en su fila. Los estudiantes no se
  quitan desde acá.
- **Familias**: "Familias" → "Sumar familia" → "Estudiante", "Parentesco", nombre,
  apellido, DNI (obligatorio) y email opcional → "Crear cuenta". Otro hijo: "Vincular
  otro" → "Vincular". Desvincular: la ✕ del chip.
- **Nueva clave** (si alguien se la olvidó): en su fila, "Nueva clave" → "Generar clave".
  La anterior deja de andar y la nueva se ve una vez; la persona elige la suya al entrar.
- **Cargar DNI** (para entrar con CiDiTuc): en las cuentas que entran con email y tienen
  la marca "sin DNI", "Cargar DNI" → "Guardar DNI" (si ya tiene, el ícono "Corregir DNI").
- **Quitar a alguien** del personal o de familias: el ícono "Quitar de la escuela". La
  cuenta sigue existiendo.
- **Horario**: elegir el curso → "Agregar clase" → "Materia y docente", "Día", "Desde",
  "Hasta", "Aula (opcional)" → "Guardar". Tocando una clase se edita o se borra.
- **Calendario**: "Crear los trimestres de {año}" (o editar fechas y "Guardar"); "Cargar
  los feriados nacionales de {año}" o cargar días sin clase con "Agregar".
- **Datos**: nombre, nombre corto, dirección, barrio → "Guardar cambios".

### Comunicar
- **Comunicado** ("Comunicaciones"): "Nuevo" → en "Para", "Docentes", "Estudiantes" y/o
  "Familias" (o "Toda la comunidad") → "¿A quiénes?": "Toda la escuela" o "Un curso" →
  "Asunto", "Prioridad" si va a docentes o estudiantes, "Mensaje" → "Enviar comunicado".
  Tocando uno se ve "Leído por X de N".
- **Citar a una familia** ("Familias"): "Citación" → "Destinatario": "Familia de
  {estudiante}" → completar → "Enviar a las familias". Un aviso a todas las familias:
  "Comunicado" con "📢 Todas las familias de la escuela".
- **Normativa**: "Cargar norma" → "Título", "Categoría", "Vigente desde", "Quién la puede
  leer" ("Equipo docente y dirección" o "Toda la comunidad"), "En una frase", "Texto de la
  norma" → "Guardar borrador" o "Publicar". Abriendo una: "Editar" o "Eliminar". Migue
  responde con las normas publicadas.

${MENSAJES_EQUIPO}

### Seguir la escuela
- **Qué está pasando**: período ("Última semana", "Último mes", "Trimestre"), "Para
  atender ahora", "Aulas en vivo en este momento", "Cómo viene cada curso", "Qué hizo cada
  docente".
- **Tablero**: "Parte del día" (con "Redactar con IA"), "En riesgo", "Cobertura
  curricular", "Pulso de bienestar", "Adopción docente", "Respuesta de familias" y el
  "Mapa institucional" (tocando un curso se abre su ficha).
- **Docentes**: tocar la fila abre el "Perfil docente", con "Escribirle" y "Dar medalla".
- **Horario**: solo para ver, "Por curso" o "Por docente"; se cambia con "Editar en Mi
  escuela".
- **Alertas**: cada alerta va de Abierta → En seguimiento → Cerrada. "Tomar en
  seguimiento" (escribir qué se hizo → "Registrar intervención"), "Cerrar con resultado"
  ("Resuelta", "Derivada…", "Cerrada sin cambios" → "Cerrar alerta"). Si nadie interviene,
  se escala sola a dirección (72 h por defecto); se cambia en "Configurar Umbrales" →
  "Guardar umbrales".
- **Memoria de estudio**: autorizaciones de familias y estudiantes. "Texto para las
  familias"; "Papel" para registrar un papel firmado ("Registrar autorización" o
  "Registrar retiro"); "Revisar" pide un motivo y queda en el registro.

${CUENTA}
${SESION_EQUIPO}`,

  estudiante: `## Guía de la app para estudiantes
Menú: "Mi escuela" (el inicio), "Estudiar", "Mis materiales", "Migue", y en "Más":
"Mensajes", "Avisos", "Vocacional" y "Ajustes".

### Mi escuela
Arriba dice cuántas actividades le quedan y "La que sigue" la abre directo. Más abajo:
"Mis materias" (cada una abre su materia), "¿Cómo venís hoy?", "Quiero hablar con un
docente", "Mis logros", "Mi guía IA", "Mis actividades", "Mis notas" y "Temario". Si hay
clase en vivo aparece arriba "¡… está en vivo!".

### Hacer y entregar una actividad
1. Abrila desde "Mis actividades", "La que sigue" o la materia.
2. Tocá "Comenzar actividad" (si dice que está cerrada, ya no acepta entregas).
3. Opción múltiple: tocá una opción (A, B, C…). Pregunta abierta: escribí en "Escribí tu
   respuesta...".
4. No hay que guardar: se guarda solo ("se guarda automáticamente"; sin señal, en el
   celular, y se manda sola cuando vuelve).
5. Tocá "Entregar". Si falta algo pregunta "¿Entregar igual?".
6. Después ves la nota ("autocorrección" o "nota final"), cada pregunta con ✓ o ✗ y, si
   el docente escribió algo, "Tu docente te dejó una devolución".
Estados en la lista: "Nueva", "Empezada", "Entregada", "Calificada", "Se manda cuando
haya conexión".

### Notas
En "Mis notas" (Mi escuela) o "Notas" (en cada materia): tabla con 1°, 2°, 3° y Final;
tocando una materia se ve cada nota. "Dic." es que se lleva la materia a diciembre.

### Mi materia
Secciones "Lo que viene", "Clases", "Tareas hechas", "Material", "Notas" y "Temario". En
cada clase: "Diapositivas", "Apunte", "Tarea" y "Guardar para usar sin señal".

### Estudiar y repasar
- "Estudiar": "Mi semana" (lo que vence en 7 días, con "Practicar"), "Practicá con tu
  material" (cada material con "Practicar": el quiz, los juegos y las tarjetas de repaso), la racha,
  los XP y "Mis medallas".
- "Mis materiales": lo que subieron sus docentes, con "Ver", "Practicar", "Resumen",
  "Podcast" o "Explicámelo fácil", según el material.
- "Mi guía IA" (desde Mi escuela): "Guía de estudio" o "Explicámelo fácil", con un
  material o escribiendo el tema. No hace la tarea.

### Hablar con alguien
- "Quiero hablar con un docente" (en Mi escuela): elegí con quién en "¿Con quién?", si
  querés contá de qué, y "Avisar". Lo ven el docente y la dirección.
- "Mensajes": "Nuevo", buscá a la persona en "Para", escribí "Asunto" y "Mensaje" y
  "Enviar". Se les puede escribir a sus docentes y a la dirección (no a compañeros).
  La dirección puede leer esas conversaciones.
- "¿Cómo venís hoy?": una carita por día ("Genial", "Bien", "Más o menos",
  "Confundido/a", "Frustrado/a"); lo ven sus docentes y la dirección, no es una nota.

### Clase en vivo
Cuando el docente la arranca, en Mi escuela aparece "¡… está en vivo!": se toca y se
responde lo que lanza el docente. No hace falta código.

### Sin señal
Con señal, en Mi escuela o Mis materiales: "Bajar ahora" / "Bajar todo". Después se
pueden hacer y entregar actividades sin señal y se mandan solas. La primera vez hay que
entrar con conexión.

### Otros
"Avisos": los comunicados de la escuela ("Responder" abre Mensajes). "Vocacional": un
cuestionario de intereses que se puede guardar "solo para mí" o compartir con la escuela.

${CUENTA}`,

  padre: `## Guía de la app para familias
Menú: "Mensajes", "Comunicados" (el inicio), "Mis hijos", "Migue" y "Ajustes".

### Comunicados y citaciones
1. En "Comunicados" están los avisos y las citaciones ("📅 Citación" o "📢 Comunicado");
   al abrirlos, la escuela ve que los leyó.
2. En una citación, en "¿Vas a poder asistir?": "Asistiré" o "No puedo".
3. Para contestar por escrito: "Escribirle a …", que abre Mensajes.

### Mis hijos
Una tarjeta por hijo, una debajo de la otra, con: el promedio, "Para reforzar", "A
diciembre", "Notas del año" (1°, 2°, 3° y Final; tocando una materia se ve el detalle),
"Temario", "Lo que logró" y "Sus faltas" (solo si tiene). Si dice "No hay estudiantes
vinculados a tu cuenta", hay que pedirlo en la escuela.

### Mensajes
"Nuevo", buscar a la persona en "Para", "Asunto", "Mensaje" y "Enviar". Se les puede
escribir a los docentes de sus hijos y a la dirección. En la "Bandeja" también llegan los
comunicados y las citaciones.

${CUENTA}`,
};

/** La guía de uso para el rol de quien pregunta, o '' si no hay. */
export function guiaDeUso(rol: string): string {
  const g = GUIA[rol as RolGuia];
  return g ? `${REGLAS}\n\n${g}` : '';
}
