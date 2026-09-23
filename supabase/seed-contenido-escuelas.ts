/**
 * SMT EstudIA — Contenido real de las dos escuelas municipales.
 *
 * Fuente (documentos entregados por las escuelas, septiembre 2026):
 *  · E.M. Alfonsina Storni · 2°A
 *      - Físico-Química — Prof. María Eugenia Jiménez
 *        "Desarrollo de la unidad didáctica: Transformaciones físicas y
 *         químicas" + "Tabla periódica de los elementos"
 *      - Matemáticas — Prof. Giuliana González
 *        "Sistema sexagesimal"
 *      - Lengua — "Unidad Didáctica: Persuasión y Palabra Poética"
 *        (publicidad, propaganda y poesía, con actividades de IA en cada clase)
 *  · E.M. Gabriela Mistral · 3°A
 *      - Matemáticas — Prof. Nehemías Francisco Martínez
 *        "Propuesta de clase: Lenguaje coloquial y simbólico. Expresiones
 *         algebraicas" (4 clases + trabajo práctico evaluativo)
 *      - Lengua — "Secuencia Didáctica: Realismo Mágico" (5 clases)
 *
 * Correr DESPUÉS del seed principal:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed-contenido-escuelas.ts
 */

import {
  getSchool, ensureSubject, ensureCourse, ensureTeacher, ensureAssignment,
  ensureStudent, ensureEnrollment, getTerm, ensureUnit, ensureCriteria,
  type ClaseSeed,
} from './seed-material-real';

// Nombres de prueba: los cursos reales todavía no tienen nómina cargada.
const ALUMNOS_2A = [
  ['Ailén', 'Carrizo', 'AC'], ['Benjamín', 'Ovejero', 'BO'], ['Delfina', 'Juárez', 'DJ'],
  ['Emiliano', 'Barrionuevo', 'EB'], ['Guadalupe', 'Nieva', 'GN'], ['Ramiro', 'Acosta', 'RA'],
];
const ALUMNOS_3A = [
  ['Aitana', 'Robles', 'AR'], ['Ciro', 'Maidana', 'CM'], ['Josefina', 'Brizuela', 'JB'],
  ['Lisandro', 'Paz', 'LP'], ['Morena', 'Coronel', 'MC'], ['Santino', 'Agüero', 'SA'],
];

// ════════════════════════════════════════════════════════════
//  STORNI 2°A — FÍSICO-QUÍMICA (Prof. María Eugenia Jiménez)
// ════════════════════════════════════════════════════════════

const FQ_TRANSFORMACIONES: ClaseSeed[] = [
  {
    title: 'Transformaciones físicas y químicas',
    objectives: [
      'Distinguir un fenómeno físico de uno químico según si cambia la identidad química de la sustancia',
      'Reconocer ejemplos cotidianos de cada tipo de transformación',
    ],
    content: [
      'Las transformaciones de la materia se dividen en dos grandes grupos, según si cambia o no la identidad química de las sustancias: transformaciones físicas y transformaciones químicas.',
      '',
      '**¿Qué es un fenómeno físico?** Un cambio que experimenta un cuerpo o una sustancia sin que se transforme en una sustancia nueva. Puede cambiar su forma, tamaño, estado o aspecto, pero su composición sigue siendo la misma.',
      'Ejemplos: el hielo se derrite y se transforma en agua · cortar una hoja de papel · romper un vaso.',
      '',
      '**¿Qué es un fenómeno químico?** Un cambio en el que se forman una o más sustancias nuevas, con propiedades diferentes a las originales.',
      'Ejemplos: quemar un papel · oxidación del hierro · la digestión de los alimentos.',
    ].join('\n'),
  },
  {
    title: 'Procesos reversibles e irreversibles',
    objectives: [
      'Clasificar procesos según puedan o no volver a su estado inicial',
    ],
    content: [
      '**Procesos reversibles:** cambios que pueden volver a su estado inicial.',
      'Ejemplos: hielo → agua → hielo · estirar un resorte y dejarlo volver a su forma.',
      '',
      '**Procesos irreversibles:** no pueden volver fácilmente al estado inicial.',
      'Ejemplos: quemar madera · descomposición de una fruta.',
      '',
      '**Actividades**',
      '1) Realizar un cuadro comparativo con las características principales de las transformaciones físicas y químicas.',
      '2) Indicar si cada situación corresponde a un fenómeno físico (FF) o químico (FQ): derretimiento de un cubito de hielo · combustión de una vela · cortar una manzana · cocinar una torta · congelar agua · quemar un papel.',
    ].join('\n'),
  },
];

const FQ_TABLA: ClaseSeed[] = [
  {
    title: 'La tabla periódica: historia y evolución',
    objectives: [
      'Reconocer la tabla periódica como una organización de los elementos según sus propiedades y su número atómico',
      'Ubicar históricamente los aportes de Mendeléiev, Moseley y Werner',
    ],
    content: [
      'La tabla periódica de los elementos es un cuadro que organiza todos los elementos químicos conocidos según sus propiedades físicas y su número atómico.',
      '',
      'En 1869 **Dimitri Mendeléiev** organizó la clasificación de los 60 elementos conocidos y dejó huecos para elementos que todavía no se habían descubierto. Los ordenó en cinco filas horizontales llamadas "periodos" y ocho columnas llamadas "grupos". Su clasificación tenía un problema: ordenaba los elementos por masas atómicas crecientes.',
      '',
      'En 1890 se descubrió una familia de gases que no reaccionaban con ningún otro elemento: los **gases nobles**.',
      '',
      'En 1910 **Moseley** observó que las propiedades de los elementos varían periódicamente según su número atómico. Por eso **Werner** reorganizó la tabla según el número atómico creciente. Actualmente tiene 7 periodos y 18 grupos.',
    ].join('\n'),
  },
  {
    title: 'Características y clasificación de los elementos',
    objectives: [
      'Identificar nombre, símbolo, número atómico y número de masa de un elemento',
      'Calcular neutrones a partir de N = A − Z',
      'Distinguir metales, no metales, gases nobles y metaloides por su ubicación y propiedades',
    ],
    content: [
      '**Características de un elemento químico**',
      '· Nombre: carbono, cloro, etc.',
      '· Símbolo: corresponde a la inicial del nombre en latín o griego (hidrógeno = H, oxígeno = O). Algunos no parecen tener relación con su nombre (plata = Ag, potasio = K).',
      '· **Número atómico (Z):** cantidad de protones y número de orden en la tabla.',
      '· **Número de masa (A):** masa total de protones y neutrones. A = Z + N, y por lo tanto N = A − Z.',
      '',
      '**Distribución en la tabla**',
      '· Metales: zona izquierda y central, la gran mayoría de la tabla.',
      '· No metales: zona superior derecha, por encima de la línea escalonada.',
      '· Gases nobles: última columna a la derecha, grupo 18.',
      '· Metaloides o semimetales: sobre la línea en zigzag entre metales y no metales.',
      '',
      '**Propiedades**',
      '· Metales: buenos conductores del calor y la electricidad, se oxidan, brillo intenso, maleables y dúctiles, sólidos salvo el mercurio.',
      '· No metales: malos conductores, se reducen, electronegativos, la mayoría sólidos.',
      '· Gases nobles: grupo 18, 8 electrones de valencia, no se combinan con ningún otro elemento salvo en condiciones exigentes.',
      '',
      '**Actividad:** completar el cuadro de análisis de elementos (Z, P, e, A, N, nombre, símbolo, periodo, grupo y clasificación) para Z = 3, Z = 47, Z = 18 y el Zn.',
    ].join('\n'),
  },
];

// ════════════════════════════════════════════════════════════
//  STORNI 2°A — MATEMÁTICAS (Prof. Giuliana González)
// ════════════════════════════════════════════════════════════

const MATE_SEXAGESIMAL: ClaseSeed[] = [
  {
    title: 'El sistema sexagesimal y sus equivalencias',
    objectives: [
      'Identificar y diferenciar grados, minutos y segundos',
      'Comprender las equivalencias fundamentales',
    ],
    content: [
      'El sistema sexagesimal es un sistema de medición cuya base es 60. Se utiliza principalmente para medir la amplitud de los ángulos y también el tiempo.',
      '',
      'En la medida de ángulos, la unidad fundamental es el **grado sexagesimal (°)**.',
      '',
      '**Equivalencias fundamentales**',
      '· 1° = 60′',
      '· 1′ = 60″',
      '· 1° = 3600″ (60 × 60)',
    ].join('\n'),
  },
  {
    title: 'Suma y resta de grados, minutos y segundos',
    objectives: [
      'Aplicar correctamente las conversiones al sumar y restar medidas sexagesimales',
    ],
    content: [
      '**Suma**',
      '· Se suman por columnas.',
      '· Si los segundos son mayores o iguales a 60, se pasan a minutos.',
      '· Si los minutos son mayores o iguales a 60, se pasan a grados.',
      'Ejemplo: 25° 35′ 40″ + 17° 50′ 30″ = 43° 26′ 10″',
      '',
      '**Resta**',
      '· Si no alcanza, se pide prestado a la unidad de orden superior.',
      'Ejemplo: 48° 20′ 15″ − 16° 35′ 40″ = 31° 44′ 35″',
    ].join('\n'),
  },
  {
    title: 'Multiplicación y división en el sistema sexagesimal',
    objectives: [
      'Multiplicar y dividir medidas sexagesimales aplicando las equivalencias',
    ],
    content: [
      '**Multiplicación**',
      '· Multiplicar por separado los grados, minutos y segundos.',
      '· Recordar las equivalencias para reagrupar.',
      'Ejemplo: 15° 25′ 32″ × 3 = 46° 16′ 36″',
      '',
      '**División**',
      '· Dividir primero los grados por el número indicado.',
      '· Si queda resto de grados, convertirlo a minutos; si queda resto de minutos, convertirlo a segundos.',
      'Ejemplo: 46° 16′ 36″ : 3 = 15° 25′ 32″',
      '',
      '**Actividad**',
      'Dados α = 12° 24′ 35″ · β = 15° 34′ 45″ · γ = 23° 45′ 55″ · λ = 58° 22′ 45″',
      'Hallar: α + β · λ − α · 4 · γ · λ : 3',
    ].join('\n'),
  },
];

// ════════════════════════════════════════════════════════════
//  STORNI 2°A — LENGUA: Persuasión y Palabra Poética
// ════════════════════════════════════════════════════════════

const LENGUA_PERSUASION: ClaseSeed[] = [
  {
    title: 'Publicidad y propaganda: ¿qué nos quieren convencer?',
    objectives: ['Distinguir publicidad y propaganda por su finalidad, emisor y destinatario'],
    content: [
      'Conceptos: finalidad, emisor, target, tipos de avisos.',
      '',
      '**Inicio** · Actividad con IA: "Escribí 3 ejemplos de frases o imágenes que ves en publicidades y 3 en propagandas. Luego pedile a la IA que te explique: ¿en qué se diferencian por su objetivo?". Puesta en común y construcción del cuadro en el pizarrón.',
      '',
      '**Desarrollo** · Lectura del texto base: definiciones y el target (destinatario). Actividad con IA — análisis de destinatario: "Imaginá este aviso: jóvenes en una fiesta de disfraces, música, frases sobre diversión. Pedile a la IA que identifique el target y justifique su respuesta". Debate: ¿coincidimos con lo que dice la IA? ¿Qué otros destinatarios podría tener?',
      '',
      '**Cierre** · Registro: cuadro comparativo publicidad ↔ propaganda. Tarea: pensar un producto o una causa para la próxima clase.',
    ].join('\n'),
  },
  {
    title: 'Recursos persuasivos: ¿cómo nos convencen?',
    objectives: ['Reconocer recursos persuasivos y usarlos en producciones propias'],
    content: [
      'Recursos: imágenes, imperativos, preguntas retóricas, eslóganes, exageraciones.',
      '',
      '**Desarrollo** · Actividad con IA en tres partes. Reconocer: "Pegá este eslogan: \'Para un planeta vivo, cuidá el agua\'. Pedile a la IA que identifique qué recursos usa y qué efecto busca". Crear: "Elegí un producto o una causa social. Pedile a la IA que te proponga 3 eslóganes usando al menos 2 recursos persuasivos distintos". Seleccionar y justificar: elegí el mejor y explicá por qué te parece el más efectivo.',
      '',
      '**Cierre** · Reflexión: ¿todos los eslóganes que generó la IA te parecieron buenos? ¿Por qué elegiste ese y no los otros? **La IA propone, vos decidís.**',
    ].join('\n'),
  },
  {
    title: '¿Qué es la poesía? Palabras que cantan',
    objectives: ['Reconocer la función estética, la rima consonante y asonante y el verso libre'],
    content: [
      'Poema: "Viaje", de Alfonsina Storni.',
      '',
      '**Inicio** · Pregunta disparadora: ¿en qué se diferencia un aviso de un poema? ¿Para qué se escriben?',
      '',
      '**Desarrollo** · Lectura en voz alta de "Viaje". Actividades con IA: qué sentimientos transmite y qué imágenes sensoriales reconoce · diferencia entre rima consonante, asonante y verso libre con ejemplos · ¿qué tienen en común un eslogan y un poema, por qué ambos usan rima y frases breves? Debate sobre coincidencias y diferencias entre la lectura propia y la respuesta de la IA.',
      '',
      '**Cierre** · Cuaderno: 3 ideas sobre la poesía y la diferencia entre rima consonante y asonante.',
    ].join('\n'),
  },
  {
    title: 'Recursos semánticos: el sentido de las palabras',
    objectives: ['Identificar personificación, comparación, metáfora e imágenes sensoriales'],
    content: [
      'Poema: "Gato negro", de María Cristina Ramos.',
      '',
      '**Desarrollo** · Buscar en el poema al menos 2 ejemplos de personificación, comparación, metáfora e imágenes sensoriales, con ayuda de la IA para explicarlos. Analizar "brasas que te asedian, su mirada dura": ¿es una metáfora?, ¿qué compara? Escribir una oración con personificación y otra con metáfora, y pedirle a la IA una devolución. Puesta en común: mural digital con los hallazgos.',
      '',
      '**Cierre** · Reflexión: ¿por qué la poesía usa estos recursos? ¿Qué pasaría si los quitáramos y dijéramos las cosas de forma directa?',
    ].join('\n'),
  },
  {
    title: 'Miradas al crepúsculo: Neruda y Fernández Moreno',
    objectives: ['Comparar dos poemas identificando rima, recursos y sentimiento predominante'],
    content: [
      'Poemas: "Crepúsculo" de Fernández Moreno y "Poema X" de Neruda.',
      '',
      '**Inicio** · "El crepúsculo: ese momento entre el día y la noche. Cada poeta lo mira diferente. ¿Cómo lo describirías vos?"',
      '',
      '**Desarrollo** · Lectura de ambos poemas y análisis comparativo con IA: ¿cuál tiene rima y cuál es verso libre? ¿Qué recursos semánticos hay en cada uno? ¿Qué sentimiento predomina? ¿En qué se parecen y en qué se diferencian? Actividad individual: elegir el poema preferido y escribir 3 líneas explicando por qué.',
      '',
      '**Cierre** · "La IA te ayuda a analizar, pero tu opinión y tu gusto son únicos."',
    ].join('\n'),
  },
  {
    title: '¡Creamos con IA!',
    objectives: [
      'Producir un aviso persuasivo o un poema breve usando la IA como apoyo',
      'Valorar críticamente lo que la IA produce',
    ],
    content: [
      '**Desarrollo** · Elegir UNA propuesta.',
      '',
      '*Crear un aviso persuasivo:* definir objetivo y target con ayuda de la IA · pedir 3 opciones de eslogan con al menos 2 recursos persuasivos · escribir el texto completo (título, eslogan, texto breve) incluyendo un imperativo o una pregunta retórica · revisión personal: modificá lo que no te guste.',
      '',
      '*Escribir un poema breve:* pensar imágenes sensoriales sobre un tema elegido · pedir 4 versos con al menos dos recursos · ajustar el poema a lo que uno siente, cambiando palabras y versos.',
      '',
      '**Cierre — reflexión sobre el uso de IA** · ¿Qué te aportó la IA en tu proceso de creación? ¿Cambiarías algo de lo que te propuso? ¿La IA puede reemplazar tu voz y tu forma de ver el mundo?',
    ].join('\n'),
  },
];

// ════════════════════════════════════════════════════════════
//  MISTRAL 3°A — MATEMÁTICA (Prof. Nehemías Francisco Martínez)
// ════════════════════════════════════════════════════════════

const MATE_ALGEBRAICAS: ClaseSeed[] = [
  {
    title: 'Lenguaje coloquial y simbólico',
    objectives: ['Interpretar situaciones en lenguaje coloquial y expresarlas en lenguaje simbólico'],
    content: [
      '**Inicio** · Se recuperan conocimientos previos a partir de expresiones de uso cotidiano: "el doble de un número", "la mitad de un número", "el triple del cuadrado de un número", "la diferencia entre cuatro y el triple del cuadrado de un número". Se pregunta: ¿cómo podríamos representar estas expresiones usando números y letras?',
      '',
      '**Desarrollo** · Se usan expresiones algebraicas para indicar relaciones numéricas, combinando letras y números. Los números se denominan **coeficientes** y las letras con sus exponentes son la **parte literal**.',
      '',
      '**Cierre** · Actividades de aplicación para resolver en clase y copiar en la carpeta.',
    ].join('\n'),
  },
  {
    title: 'Valor numérico de una expresión algebraica',
    objectives: ['Calcular el valor numérico de expresiones algebraicas reemplazando las variables'],
    content: [
      '**Inicio** · Repaso de la clase anterior. Se escribe 4a² y se plantea: si a = 3, ¿qué valor tiene la expresión? Se observan las estrategias de los estudiantes.',
      '',
      '**Desarrollo** · El valor numérico de una expresión algebraica es el valor que se obtiene al reemplazar la parte literal por un determinado número. Los estudiantes reemplazan el valor de la variable y resuelven respetando el orden de las operaciones.',
      '',
      '**Cierre** · Cálculo individual del valor numérico de varias expresiones.',
    ].join('\n'),
  },
  {
    title: 'Operaciones con expresiones algebraicas',
    objectives: ['Resolver sumas, restas, multiplicaciones y divisiones de expresiones algebraicas'],
    content: [
      '**Inicio** · Se presentan dos expresiones y se pregunta: ¿podemos sumar todos los términos? ¿Qué diferencia existe entre ambas?',
      '',
      '**Sumas y restas** · Dos monomios son semejantes cuando tienen la misma parte literal, es decir, la misma letra elevada al mismo exponente. Para sumarlos o restarlos se suman o restan sus coeficientes y se agrega la misma parte literal. Para sumar o restar polinomios se agrupan los términos semejantes; una manera fácil es disponerlos en forma vertical respetando los exponentes.',
      '',
      '**Productos y cocientes** · Repaso previo de tres propiedades de la potencia: producto de potencias de igual base, cociente de potencias de igual base y potencia de otra potencia. Para multiplicar o dividir dos monomios, se multiplican o dividen sus coeficientes y su parte literal.',
      '',
      '**Cierre** · Actividades de ejercitación.',
    ].join('\n'),
  },
  {
    title: 'Propiedad distributiva',
    objectives: ['Aplicar la propiedad distributiva en expresiones algebraicas'],
    content: [
      '**Inicio** · Repaso de la propiedad distributiva en los números reales: multiplicar un número por una suma (o resta) da el mismo resultado que multiplicarlo por cada término por separado y luego sumar (o restar). Se escribe 3(x + 4) y se pregunta: ¿cómo podemos resolver esta expresión?',
      '',
      '**Desarrollo** · Se formaliza la propiedad distributiva de la multiplicación respecto de la suma, y también respecto de la resta. Como en la multiplicación no importa el orden de los factores, también puede distribuirse al revés. La división puede distribuirse con la suma y la resta solo cuando el divisor es un monomio.',
      '',
      '**Cierre** · Trabajo práctico evaluativo de cierre de unidad: escribir en lenguaje simbólico y coloquial, completar cuadros de valor numérico, resolver operaciones y expresar el área de una figura aplicando la propiedad distributiva.',
    ].join('\n'),
  },
];

// ════════════════════════════════════════════════════════════
//  MISTRAL 3°A — LENGUA: Realismo Mágico
// ════════════════════════════════════════════════════════════

const LENGUA_REALISMO: ClaseSeed[] = [
  {
    title: 'El rumor y la superstición en García Márquez',
    objectives: ['Reconocer cómo un comentario sin fundamento se transforma en algo que todos creen real'],
    content: [
      'Texto: "Algo muy grave va a suceder en este pueblo", de Gabriel García Márquez (págs. 79-81 del cuadernillo).',
      '',
      '**Inicio** · Conversación disparadora sobre cómo un comentario sin fundamento o una superstición se puede transformar en algo que todos creen real.',
      '',
      '**Desarrollo** · Lectura compartida en voz alta mientras los alumnos siguen con el cuadernillo. Análisis oral sobre la cadena del rumor y cómo situaciones comunes (el calor de la tarde, un pajarito en la plaza) son interpretadas como señales trágicas.',
      '',
      '**Cierre** · Trabajo breve en carpeta: tres preguntas puntuales de opción múltiple o respuesta muy corta, para facilitar la corrección de la ortografía y el trazo.',
    ].join('\n'),
  },
  {
    title: 'La normalización de lo imposible en "El leve Pedro"',
    objectives: ['Identificar la falta de asombro de los personajes ante lo sobrenatural'],
    content: [
      'Textos: "El leve Pedro", de Enrique Anderson Imbert (págs. 82-84) y el concepto de Realismo Mágico (pág. 18).',
      '',
      '**Inicio** · Presentación de la característica central del género: los hechos extraordinarios no asombran ni aterrorizan a los personajes, sino que son percibidos como parte de la cotidianeidad.',
      '',
      '**Desarrollo** · Lectura en voz alta del cuento sobre la enfermedad de Pedro y su pérdida de gravedad. Rastreo de reacciones: la actitud de Hebe, que en lugar de asustarse cuando su marido flota hasta el techo lo reta acusándolo de hacer "piruetas".',
      '',
      '**Cierre** · Copia guiada desde la pizarra de un cuadro de dos columnas: hecho insólito / reacción de los personajes.',
    ].join('\n'),
  },
  {
    title: 'La desmesura y el exceso en "Cándida Eréndira" (I)',
    objectives: ['Analizar la hipérbole y la desmesura como recursos del realismo mágico'],
    content: [
      'Texto: fragmento inicial de "La triste historia de la Cándida Eréndira y su abuela desalmada".',
      '',
      '**Inicio** · Conversación sobre la palabra "exageración" (hipérbole): ¿qué diferencia hay entre contar algo como ocurrió y agrandarlo al extremo?',
      '',
      '**Desarrollo** · Lectura compartida del inicio de la obra: la caracterización de la abuela, la enormidad de la casa, la acumulación de tareas imposibles que realiza Eréndira y el incendio accidental. Análisis guiado: cómo García Márquez transforma el sufrimiento y la servidumbre en una historia desmesurada, casi de cuento de hadas pero en un desierto real y duro.',
      '',
      '**Cierre** · Dibujo o esquema en la carpeta que represente a la abuela y la lista de sus mandados insólitos, con frases breves descriptivas.',
    ].join('\n'),
  },
  {
    title: 'Los objetos y acontecimientos mágicos en "Cándida Eréndira" (II)',
    objectives: ['Registrar los recursos del realismo mágico presentes en la obra'],
    content: [
      'Texto: fragmentos seleccionados de "La triste historia de la Cándida Eréndira y su abuela desalmada".',
      '',
      '**Inicio** · Indagación oral sobre los elementos más extraños del relato: el chal de la abuela, los animales, el desierto, la carta de amor en vidrio.',
      '',
      '**Desarrollo** · Lectura compartida del encuentro con Ulises y el viaje por el desierto. Registro colectivo en la pizarra de los recursos del realismo mágico: la mezcla de miseria real con belleza fantástica, lo sensorial (colores, olores del desierto) y la falta de asombro ante la magia.',
      '',
      '**Cierre** · Redacción en parejas de una ficha de personaje (Eréndira, la Abuela o Ulises) completando campos fijos: nombre, rasgo físico y elemento fantástico que lo rodea.',
    ].join('\n'),
  },
  {
    title: 'Taller de escritura de un microrrelato realista mágico',
    objectives: [
      'Escribir un microrrelato aplicando la técnica de borrador y revisión guiada',
      'Ejercitar legibilidad, puntuación y ortografía en producciones acotadas',
    ],
    content: [
      '**Inicio** · Explicación de la consigna: una historia muy breve (4 a 6 renglones) sobre un acontecimiento insólito ocurrido en el barrio o en la escuela que los personajes traten con total normalidad.',
      '',
      '**Desarrollo** · Producción de un borrador en lápiz. Acompañamiento banco por banco corrigiendo la legibilidad del trazo, la separación de palabras y la acentuación directamente en el borrador, antes de pasarlo en limpio.',
      '',
      '**Cierre** · Lectura voluntaria de algunas producciones y entrega de los textos corregidos para la evaluación procesual.',
    ].join('\n'),
  },
];

// ════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 Cargando el material real de las escuelas...\n');

  // ── E.M. Alfonsina Storni · 2°A ──
  console.log('📍 E.M. Alfonsina Storni — 2° A');
  const storni = await getSchool('E.M. Alfonsina Storni');
  const t2Storni = await getTerm(storni, 2);
  const curso2A = await ensureCourse(storni, '2° A', 2, 'A');

  const fq = await ensureSubject(storni, 'Físico-Química', 'green');
  const mateS = await ensureSubject(storni, 'Matemática', 'purple');
  const lenguaS = await ensureSubject(storni, 'Lengua', 'amber');

  const jimenez = await ensureTeacher(storni, 'María Eugenia', 'Jiménez', 'MJ');
  const gonzalez = await ensureTeacher(storni, 'Giuliana', 'González', 'GG');
  // El documento de Lengua no nombra docente: queda a cargo del docente de
  // la escuela hasta que la dirección indique quién la dicta.
  const { data: leiva } = await import('./seed-material-real').then(m =>
    m.db.from('profiles').select('id').eq('email', 'pablo.leiva@ensenia.edu.ar').single());
  const lenguaDocente = leiva!.id as string;

  await ensureAssignment(jimenez, fq, curso2A);
  await ensureAssignment(gonzalez, mateS, curso2A);
  await ensureAssignment(lenguaDocente, lenguaS, curso2A);

  let n = 0;
  for (const [first, last, ini] of ALUMNOS_2A) {
    const st = await ensureStudent(storni, curso2A, first, last, ini);
    n++;
    const suf = String(n).padStart(2, '0');
    await ensureEnrollment(st, fq, curso2A, storni, 'FQ2A-' + suf);
    await ensureEnrollment(st, mateS, curso2A, storni, 'MAT2A-' + suf);
    await ensureEnrollment(st, lenguaS, curso2A, storni, 'LEN2A-' + suf);
  }
  console.log('  ✓ ' + ALUMNOS_2A.length + ' estudiantes inscriptos en las 3 materias');

  await ensureUnit({
    title: 'Transformaciones físicas y químicas', subjectId: fq, courseId: curso2A,
    teacherId: jimenez, termId: t2Storni, order: 1, clases: FQ_TRANSFORMACIONES,
  });
  await ensureUnit({
    title: 'Tabla periódica de los elementos', subjectId: fq, courseId: curso2A,
    teacherId: jimenez, termId: t2Storni, order: 2, clases: FQ_TABLA,
  });
  await ensureCriteria(storni, fq, curso2A, t2Storni, [
    '· Distingue fenómenos físicos de químicos y los justifica con ejemplos propios.',
    '· Clasifica procesos en reversibles e irreversibles.',
    '· Lee la tabla periódica: ubica un elemento por su número atómico y calcula sus neutrones (N = A − Z).',
    '· Presenta en tiempo y forma el cuadro comparativo y el cuadro de análisis de elementos.',
  ].join('\n'));

  await ensureUnit({
    title: 'Sistema sexagesimal', subjectId: mateS, courseId: curso2A,
    teacherId: gonzalez, termId: t2Storni, order: 1, clases: MATE_SEXAGESIMAL,
  });
  await ensureCriteria(storni, mateS, curso2A, t2Storni, [
    '· Diferencia grados, minutos y segundos y aplica las equivalencias (1° = 60′, 1′ = 60″).',
    '· Resuelve sumas y restas reagrupando correctamente cuando corresponde.',
    '· Resuelve multiplicaciones y divisiones convirtiendo los restos.',
    '· Presenta el procedimiento completo, no solo el resultado.',
  ].join('\n'));

  await ensureUnit({
    title: 'Persuasión y Palabra Poética', subjectId: lenguaS, courseId: curso2A,
    teacherId: lenguaDocente, termId: t2Storni, order: 1, clases: LENGUA_PERSUASION,
  });
  await ensureCriteria(storni, lenguaS, curso2A, t2Storni, [
    '· Distingue publicidad de propaganda por finalidad, emisor y destinatario.',
    '· Reconoce recursos persuasivos y semánticos en textos e imágenes.',
    '· Produce un aviso o un poema propio aplicando al menos dos recursos.',
    '· Valora críticamente lo que la IA propone: elige, corrige y justifica su decisión.',
  ].join('\n'));

  // ── E.M. Gabriela Mistral · 3°A ──
  console.log('\n📍 E.M. Gabriela Mistral — 3° A');
  const mistral = await getSchool('E.M. Gabriela Mistral');
  const t2Mistral = await getTerm(mistral, 2);
  const curso3A = await ensureCourse(mistral, '3° A', 3, 'A');

  const mateM = await ensureSubject(mistral, 'Matemática', 'purple');
  const lenguaM = await ensureSubject(mistral, 'Lengua', 'amber');

  const martinez = await ensureTeacher(mistral, 'Nehemías Francisco', 'Martínez', 'NM');
  await ensureAssignment(martinez, mateM, curso3A);

  // Lengua 3°A ya está asignada en la base; se respeta a quien la tenga.
  const { data: lenguaAsig } = await import('./seed-material-real').then(m =>
    m.db.from('teacher_assignments').select('teacher_id')
      .eq('subject_id', lenguaM).eq('course_id', curso3A).limit(1).maybeSingle());
  const lenguaMDocente = (lenguaAsig?.teacher_id as string) ?? martinez;

  n = 0;
  for (const [first, last, ini] of ALUMNOS_3A) {
    const st = await ensureStudent(mistral, curso3A, first, last, ini);
    n++;
    const suf = String(n).padStart(2, '0');
    await ensureEnrollment(st, mateM, curso3A, mistral, 'MAT3A-' + suf);
    await ensureEnrollment(st, lenguaM, curso3A, mistral, 'LEN3A-' + suf);
  }
  console.log('  ✓ ' + ALUMNOS_3A.length + ' estudiantes inscriptos en las 2 materias');

  await ensureUnit({
    title: 'Lenguaje coloquial y simbólico. Expresiones algebraicas', subjectId: mateM,
    courseId: curso3A, teacherId: martinez, termId: t2Mistral, order: 1, clases: MATE_ALGEBRAICAS,
  });
  await ensureCriteria(mistral, mateM, curso3A, t2Mistral, [
    '· Traduce del lenguaje coloquial al simbólico y a la inversa.',
    '· Calcula el valor numérico respetando el orden de las operaciones.',
    '· Opera con monomios y polinomios agrupando términos semejantes.',
    '· Aplica la propiedad distributiva y resuelve el trabajo práctico evaluativo de cierre.',
  ].join('\n'));

  await ensureUnit({
    title: 'Realismo Mágico', subjectId: lenguaM, courseId: curso3A,
    teacherId: lenguaMDocente, termId: t2Mistral, order: 1, clases: LENGUA_REALISMO,
  });
  await ensureCriteria(mistral, lenguaM, curso3A, t2Mistral, [
    '· Reconoce las características del realismo mágico en los cuentos leídos.',
    '· Identifica la desmesura, la hipérbole y la normalización de lo insólito.',
    '· Escribe un microrrelato aplicando borrador y revisión guiada.',
    '· Cuida legibilidad, puntuación y ortografía en las producciones acotadas.',
  ].join('\n'));

  console.log('\n✅ Material real cargado.');
  console.log('── Docentes nuevos (password: demo123) ──');
  console.log('  mariaeugenia.jimenez@ensenia.edu.ar  · Físico-Química 2°A (Storni)');
  console.log('  giuliana.gonzalez@ensenia.edu.ar     · Matemática 2°A (Storni)');
  console.log('  nehemiasfrancisco.martinez@ensenia.edu.ar · Matemática 3°A (Mistral)');
  console.log('\n⚠ Lengua 2°A (Storni) quedó a cargo de Pablo Leiva: el documento no');
  console.log('  nombra docente. Reasignar cuando la dirección lo indique.');
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
