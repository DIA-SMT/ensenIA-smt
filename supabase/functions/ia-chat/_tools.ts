/**
 * ENSEÑIA SMT — Tool-specific prompt instructions
 *
 * Each tool injects specialized formatting and content requirements
 * into the system prompt so Claude produces structured, pedagogically
 * sound output tailored to the teacher's request.
 */

const TOOL_INSTRUCTIONS: Record<string, string> = {
  act: `
## 🎯 Modo activo: GENERAR ACTIVIDAD

Generá una actividad didáctica completa y lista para usar en el aula. Estructurá así:

**Título de la actividad**

**Objetivos de aprendizaje** (2-4 objetivos claros)

**Materiales necesarios** (lista con viñetas)

**Duración estimada**

**Desarrollo de la actividad**
- **Inicio** (motivación, activación de saberes previos)
- **Desarrollo** (actividad central, paso a paso)
- **Cierre** (puesta en común, reflexión, síntesis)

**Criterios de evaluación** (qué se va a observar)

**Adaptaciones sugeridas** (para distintos ritmos de aprendizaje)

Hacé que sea una actividad creativa, que motive a los chicos. Pensá en lo que realmente funciona en un aula.`,

  eval: `
## 📝 Modo activo: GENERAR EVALUACIÓN

Generá una evaluación formal, prolija y lista para imprimir. Estructurá así:

**Encabezado**
| Materia | Curso | Fecha | Alumno/a |
|---------|-------|-------|----------|
| (completar) | (completar) | ___/___/___ | ________________ |

**Consignas** — Usá variedad:
- Opción múltiple (marcar con X)
- Verdadero / Falso (justificar los falsos)
- Completar / Relacionar
- Desarrollo breve
- Análisis o pensamiento crítico (al menos 2 preguntas de este tipo)

**Puntaje** — Indicá el valor de cada consigna y el total.

**Criterios de corrección / Rúbrica** — Tabla clara con niveles de desempeño.

Asegurate de que la evaluación sea justa, clara y que evalúe comprensión, no solo memoria.`,

  sum: `
## 📖 Modo activo: RESUMIR DOCUMENTO

Creá un resumen pedagógico claro y visual del contenido proporcionado. Estructurá así:

**Ideas principales** (viñetas, máximo 5-7)

**Conceptos clave** (en negrita, con definición breve)

**Glosario** de términos importantes (si aplica)

**Preguntas de comprensión** (3-5 preguntas para que los alumnos verifiquen que entendieron)

**Conexiones** con temas previos o posteriores del programa

Sé conciso pero completo. El resumen debe ser útil tanto para el docente como para los alumnos.`,

  pres: `
## 🎬 Modo activo: CREAR PRESENTACIÓN

Diseñá una presentación de clase en formato de diapositivas. Estructurá así:

Cada diapositiva como un bloque separado con:

**Diapositiva 1: (Título)**
- Contenido visual (3-5 puntos clave)
- *Nota para el docente: (qué decir, qué preguntar)*

Incluí:
- Diapositiva de **título** con tema y curso
- Diapositivas de **contenido** (máximo 10-12 en total)
- Al menos una diapositiva de **actividad participativa** (pregunta al grupo, dinámica)
- Diapositiva de **síntesis** con los puntos clave
- Diapositiva de **tarea o próximos pasos**

Cada diapositiva debe ser visualmente limpia: poco texto, ideas claras, que el docente pueda hablar sobre ellas.`,

  oral: `
## 🎤 Modo activo: EVALUAR EXPOSICIÓN ORAL

Generá una guía completa de evaluación oral. Estructurá así:

**Tema de la exposición**

**Tiempo estimado** por alumno/grupo

**Rúbrica de evaluación** — Tabla con:
| Dimensión | Excelente (5) | Muy bueno (4) | Bueno (3) | En desarrollo (2) | Inicial (1) |
|-----------|---------------|---------------|-----------|---------------------|-------------|
| Contenido | ... | ... | ... | ... | ... |
| Expresión oral | ... | ... | ... | ... | ... |
| Organización | ... | ... | ... | ... | ... |
| Uso de recursos | ... | ... | ... | ... | ... |

**Preguntas disparadoras** (3-5 preguntas para hacerle al alumno después de la exposición)

**Indicadores observables** por dimensión

**Modelos de retroalimentación** — Ejemplos de devolución para cada nivel de desempeño, siempre constructivos y alentadores.`,
};

export function getToolInstructions(tool: string): string {
  return TOOL_INSTRUCTIONS[tool] ?? '';
}
