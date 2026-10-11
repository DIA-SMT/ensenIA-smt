# Datos de menores e inteligencia artificial en SMT EstudIA

Qué hace la app con los datos de los chicos cuando usa IA, qué cambió el 10/10/2026, qué
falta configurar y firmar, y cómo responder las críticas. Las fuentes se consultaron el
10/10/2026; lo marcado **[sin verificar]** no se pudo confirmar en una fuente primaria.

## 1. Qué sale de la app y adónde

La app usa modelos Claude (Anthropic) a través de **OpenRouter**. Desde este cambio, cada
pedido exige endpoints de **retención cero** (`provider.zdr`), que para Claude son
**Amazon Bedrock** y **Google Vertex**: no guardan lo que reciben y no entrenan con eso
([OpenRouter ZDR](https://openrouter.ai/docs/features/zdr),
[AWS Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)).
Antes, OpenRouter podía mandar los pedidos a la API propia de Anthropic, que los guarda
30 días ([Anthropic](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)).
El precio es el mismo.

| Función | Qué ve el proveedor de IA |
|---|---|
| **EstudIA (tutor de estudio)** | Las materias del chico, el material elegido, la charla en curso y, con autorización, su memoria de estudio. **Sin** su nombre, el de la escuela ni datos de contacto. Los nombres de compañeros o docentes que escriba sí pasan (taparlos rompería contenidos: próceres, autores, lugares con apellidos de la escuela). |
| **Clasificador de riesgo** (EstudIA y Migue) | El mensaje, con los nombres del padrón de la escuela y los datos de contacto tapados. |
| **Memoria de estudio** (consolidación) | La charla terminada, con nombres y contactos tapados. Lo que vuelve se filtra antes de guardar: sin nombres, contacto, familia, ánimo ni salud. |
| **Migue** (estudiantes, familias, equipo) | El mensaje y el historial, con los nombres del padrón y los contactos tapados; a estudiantes y familias el prompt ya no los nombra ni dice la escuela. Las marcas `[N1]` vuelven a ser nombres en la respuesta. |
| Laboratorio IA, resúmenes, podcast (docentes) | Material docente. También van con retención cero en `ia-chat`; `process-document` y `generate-podcast` todavía no (ver 3.B). |

## 2. Lo que ya está en el código (migración 061 y funciones `ia-chat` y `migue`)

- Retención cero en todos los pedidos de `ia-chat` y `migue`. Para volver atrás sin
  publicar código: secreto `OPENROUTER_SOLO_ZDR=no`.
- Sin nombre del estudiante ni de la escuela en los prompts de estudiantes y familias.
- Datos de contacto tapados antes de enviar; nombres del padrón tapados donde no rompen
  contenido.
- Memoria de estudio solo con autorización de la familia **y** del estudiante; revocar
  borra en el momento (con candado en la base para que una charla en proceso no la vuelva a
  llenar); vencimiento a 90 días y borrado al 1° de marzo.
- El docente no ve la memoria. La dirección la revisa solo con motivo, y queda registrado;
  el chico y la familia ven la fecha.
- Aviso de IA en Mi guía: "es una inteligencia artificial, no una persona". Lo exige la
  política de uso de Anthropic para productos con menores
  ([AUP](https://www.anthropic.com/legal/aup)).
- El clasificador de riesgo corre también en EstudIA; si no puede evaluar, deja una señal
  con el fragmento para revisión humana (no "no pasa nada").
- El historial del estudiante sale de la base: nadie puede fabricar turnos de la IA.

## 3. Lo que falta, ordenado por cobertura y esfuerzo

### A. Configuración de la cuenta de OpenRouter (la hace el responsable; horas)

1. **Guardrail de cuenta**: `enforce_zdr_anthropic` y proveedores permitidos
   `amazon-bedrock` y `google-vertex`. Así la retención cero no depende solo del código
   ([Guardrails](https://openrouter.ai/docs/guides/features/guardrails)).
2. Confirmar **apagados**: entrenamiento (modelos pagos y gratuitos), "OpenRouter Use of
   Inputs/Outputs" e "Input & Output Logging" (este último guarda prompts 3 meses o más)
   ([logging](https://openrouter.ai/docs/guides/features/input-output-logging),
   [data collection](https://openrouter.ai/docs/guides/privacy/data-collection)).
3. No activar el caché de respuestas (`X-OpenRouter-Cache`).
4. Una API key por función (estudiantes, docentes, documentos) con límite de gasto.

### B. Código (días)

1. Retención cero también en `process-document` y `generate-podcast`.
2. Probar el clasificador con **Haiku 5.5** (10 veces más barato) contra un set de casos
   reales anonimizados antes de cambiarlo; es un camino de protección.
3. Caché de prompts en el Laboratorio IA del docente: hoy su prompt cambia en cada pedido
   (referencias), así que no se activó (cachear sin leer cuesta 25% más).
4. Opcional: clasificador de riesgo local como **filtro adicional** (Qwen3Guard, Apache
   2.0) en una nube con región en Argentina o el país más cercano; no reemplaza al actual.

### C. Documentos y procesos

1. **Evaluación de impacto en protección de datos.** La recomienda la guía de IA
   responsable de la AAIP (versión preliminar, 2024) y la exigiría la ley provincial de IA
   en el Estado (ver 4), además de los estándares del Reino Unido para IA escolar
   ([AAIP](https://argentina.gob.ar/sites/default/files/aaip-argentina-guia_para_usar_la_ia_de_manera_responsable.pdf),
   [DfE](https://www.gov.uk/government/publications/generative-ai-product-safety-standards/generative-ai-product-safety-standards)).
2. **Página pública de transparencia**: qué se envía, a quién y a qué países, que no se
   retiene ni se entrena, cuánto se guarda, cómo ejercer los derechos, y el aviso de IA.
   Anthropic pide **declarar públicamente** el cumplimiento normativo cuando hay menores
   ([guía para organizaciones con menores](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)).
3. **Acto de creación de la base de datos** publicado en el Boletín Oficial, con finalidad,
   transferencias y órgano responsable (Ley 25.326, art. 22,
   [Infoleg](https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/texact.htm)).
4. **Ley provincial de IA en el Estado (Tucumán)**: según la prensa, alcanza a los
   municipios y pide evaluación de impacto, publicación y un Registro Público Provincial
   de Sistemas de IA ([Diario Judicial](https://www.diariojudicial.com/news-102384-estatales-con-ia-asunto-regulado)).
   **[sin verificar]** número y texto oficial: hay que conseguirlos. Es la norma más
   directamente aplicable. La Ley 9.890 crea el programa "Tucumán IA" en escuelas.
5. Consentimiento de la memoria: borrador en `consentimiento.md`.

### D. Contratos (con asesoría legal)

1. **Cláusulas modelo argentinas con OpenRouter** (Anexo II de la Disp. DNPDP 60-E/2016 o
   las de la Res. AAIP 198/2023). Su DPA solo trae las cláusulas de la UE
   ([DPA OpenRouter](https://openrouter.ai/data-processing-agreement),
   [Disp. 60-E/2016](https://www.argentina.gob.ar/normativa/nacional/267922/actualizacion)).
   Si se usa un contrato distinto al modelo, se presenta ante la autoridad dentro de 30
   días.
2. Lo mismo con **Supabase** (base de datos; también fuera del país)
   ([DPA Supabase](https://supabase.com/legal/customer-resources/data-processing-addendum)).
3. Evaluar **ruteo solo a la Unión Europea** (plan Enterprise de OpenRouter). La UE sí
   está entre los destinos adecuados para Argentina: es el mejor argumento legal
   disponible. **[sin verificar]** precio.
4. Términos de OpenRouter: exigen que el titular de la cuenta sea mayor de 18 y que la
   app cumpla las políticas de Anthropic ([Terms](https://openrouter.ai/terms)). La cuenta
   tiene que estar a nombre de la Municipalidad.

## 4. Marco legal (resumen)

- **Ley 25.326**: el tratamiento por funciones propias del Estado no requiere
  consentimiento (art. 5.2.b), pero la **transferencia a EE. UU.** sí necesita base: EE. UU.
  no es país adecuado (Disp. 60-E/2016, art. 3), y el Decreto 1558/2001 (art. 12) admite
  el consentimiento expreso o cláusulas contractuales. Los datos de salud son sensibles
  (art. 2 y 7): el resultado del clasificador de riesgo entra ahí.
- **Menores**: Ley 26.061 (interés superior, derecho a ser oído, vida privada) y Código
  Civil y Comercial, art. 25 y 26 (autonomía progresiva del adolescente).
- **Proyectos a seguir**: 3397-D-2026 (datos personales; consentimiento solo desde los 16),
  y los de IA por niveles de riesgo (2130-D-2025, 511-S-2025, 3330-D-2026).

## 5. Respuestas a las críticas más probables

**"Mandan los datos de los chicos a una empresa de Estados Unidos."**
Lo que viaja va sin el nombre del chico, sin la escuela y sin datos de contacto, a
servicios configurados para no guardar nada ni entrenar con eso (retención cero en Amazon
y Google). La memoria es opcional, necesita la firma de la familia y del chico, y se borra
cuando cualquiera de los dos lo pide.

**"La IA va a perfilar a los chicos."**
La memoria solo anota cómo estudia (qué le cuesta, qué le sirve), filtra todo lo personal
antes de guardar, la ve el propio chico y la puede borrar, vence a los 90 días y se borra
entera cada año. No se usa para notas ni sanciones. Los docentes no la ven.

**"¿Quién controla a los que controlan?"**
La dirección solo puede abrir la memoria de un chico escribiendo un motivo; cada apertura
queda en un registro que ven todas las direcciones de la escuela y que no se borra, y el
chico y su familia ven la fecha.

**"La IA le puede hacer daño a un chico que la está pasando mal."**
Cada mensaje pasa por un clasificador de riesgo independiente. Si detecta algo, avisa a la
escuela y se lo dice al chico. Si no puede evaluar, deja el mensaje para que lo revise una
persona: nunca asume que "no pasa nada".

**"¿Por qué no usan una IA local?"**
Hoy no hay región de nube con GPU en Argentina en AWS, Azure ni Google; un modelo de la
calidad necesaria requiere infraestructura que el municipio no tiene. Se puede sumar un
clasificador local como capa extra (3.B.4).

## 6. Costo

- Retención cero: mismo precio (endpoints "global" de Bedrock y Vertex).
- Razonamiento: el tutor del estudiante pasó a esfuerzo bajo y Migue a medio (Sonnet 5
  razonaba en alto por defecto y eso se cobra como salida, a USD 10 por millón de tokens).
- Caché de prompts: la parte fija de los prompts de EstudIA (estudiantes) y Migue se cobra
  al 10% desde el segundo mensaje de una charla.
- Memoria: la consolidación usa Haiku 5.5 (USD 0,10 / 0,50 por millón), unas diez veces
  más barato que Haiku 4.5.
- El gasto real se ve en Consumo de IA (`ia_events`), con las funciones `estudia_riesgo` y
  `memoria_estudio` separadas.
