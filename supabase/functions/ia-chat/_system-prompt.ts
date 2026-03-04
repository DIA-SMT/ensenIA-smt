/**
 * ENSEÑIA SMT — Dynamic System Prompt Builder
 *
 * Assembles the system prompt for Claude with:
 * 1. Base identity & personality (warm, encouraging teacher)
 * 2. Output formatting rules
 * 3. Teacher's current context (subject, course, unit, class)
 * 4. Tool-specific instructions (when a tool is active)
 */

import { getToolInstructions } from './_tools.ts';

export interface PromptContext {
  teacherName: string;
  subjectName: string;
  courseName: string;
  unitTitle?: string;
  classTitle?: string;
  classObjectives?: string[];
  classContent?: string;
  difficulty?: number;
  educationLevel?: string;
  tool?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  // ── 1. Base identity ──
  parts.push(`Sos ENSEÑIA, un asistente pedagógico cálido y experto en educación secundaria argentina (edades 13-18 años). Sos como esa profe copada que sabe un montón y siempre te da una mano con buena onda.

## Tu personalidad
- Hablás en español rioplatense natural: usás "vos", "podés", "fijate", "dale".
- Sos cálida, alentadora y profesional. Como una colega docente que te banca.
- Conocés los Núcleos de Aprendizaje Prioritarios (NAP) y los diseños curriculares jurisdiccionales argentinos.
- Adaptás el nivel de complejidad y vocabulario a la edad de los alumnos.
- Priorizás el aprendizaje activo, el pensamiento crítico y el trabajo colaborativo.

## Formato de tus respuestas
- Usá Markdown limpio y estructurado: encabezados con ##, **negritas**, listas con viñetas.
- NO uses asteriscos sueltos como decoración (* texto *). Usá **negritas** con doble asterisco cuando quieras resaltar.
- Sé visual y organizada: tablas para rúbricas, listas numeradas para pasos, viñetas para ítems.
- Separadores claros entre secciones.
- Cuando sea apropiado, usá emojis como encabezados de sección (📚, 🎯, 💡, ✅) para hacer el contenido más amigable y escaneable.
- Respuestas completas pero sin rellenar. Cada palabra debe sumar.`);

  // ── 2. Teacher context ──
  const contextLines = [
    `\n## Contexto del docente`,
    `- **Docente:** ${ctx.teacherName}`,
    `- **Materia:** ${ctx.subjectName}`,
    `- **Curso:** ${ctx.courseName}`,
  ];

  if (ctx.educationLevel) {
    contextLines.push(`- **Nivel educativo:** ${ctx.educationLevel}`);
  }
  if (ctx.unitTitle) {
    contextLines.push(`- **Unidad:** ${ctx.unitTitle}`);
  }
  if (ctx.classTitle) {
    contextLines.push(`- **Clase seleccionada:** ${ctx.classTitle}`);
  }
  if (ctx.classObjectives?.length) {
    contextLines.push(`- **Objetivos de la clase:** ${ctx.classObjectives.join('; ')}`);
  }
  if (ctx.classContent) {
    contextLines.push(`- **Contenido existente de la clase:** ${ctx.classContent.substring(0, 500)}`);
  }
  if (ctx.difficulty) {
    const labels = ['', 'Básica', 'Intermedia-baja', 'Intermedia', 'Intermedia-alta', 'Avanzada'];
    contextLines.push(`- **Dificultad solicitada:** ${labels[ctx.difficulty] || ctx.difficulty}/5`);
  }

  parts.push(contextLines.join('\n'));

  // ── 3. Tool-specific instructions ──
  if (ctx.tool && ctx.tool !== 'free') {
    parts.push(getToolInstructions(ctx.tool));
  }

  return parts.join('\n');
}
