# Memoria de estudio de EstudIA — consentimiento informado (BORRADOR para legal)

Borrador del 10/10/2026. **No está publicado**: en la base está cargado como versión
`2026-10-borrador` y la base no deja publicar un borrador. Cuando legal lo apruebe (con
cambios o sin cambios), se carga como versión nueva y se publica (ver al final).

Hasta que haya un texto publicado, nadie puede autorizar y EstudIA funciona sin memoria:
las familias y los estudiantes no ven nada nuevo.

---

## Texto para la familia

> **Memoria de estudio de EstudIA**
>
> EstudIA es el tutor de estudio de la app SMT EstudIA. Hoy, cada vez que su hijo o hija
> abre una charla nueva, EstudIA empieza de cero. Con la memoria de estudio, EstudIA
> recuerda cómo estudia: qué temas trabajó, qué le costó, qué ya maneja y qué explicaciones
> le sirvieron. Así puede retomar donde quedó y explicarle mejor.
>
> **Qué se guarda.** Notas cortas por materia, por ejemplo: "Matemática · Le cuesta aplicar
> un signo menos delante de un paréntesis" o "Le sirven los ejemplos con plata". También se
> usan los resultados de las prácticas que hace en la app.
>
> **Qué NO se guarda.** La memoria está hecha para no guardar nombres de personas, datos de
> contacto ni nada de su vida personal, familiar, de salud o de cómo se siente: la app filtra
> lo que lo parezca antes de guardar, y si alguna vez aparece algo así, se puede borrar.
> Tampoco se guarda lo que haya charlado con Migue.
> Si en una charla cuenta algo que preocupa sobre su bienestar, eso no va a la memoria:
> sigue el mismo camino que hoy, que es avisar al equipo de la escuela.
>
> **Quién lo ve.** Su hijo o hija ve todo lo que EstudIA recuerda y puede borrarlo cuando
> quiera. Los docentes no lo ven. La dirección de la escuela puede revisarlo para controlar
> que se use bien; cada revisión queda registrada con fecha y motivo, y ustedes y su hijo o
> hija ven la fecha.
>
> **Para qué NO se usa.** No se usa para poner notas, evaluar ni sancionar. No se comparte
> con otras escuelas ni con terceros.
>
> **Dónde se procesa.** Para responder, EstudIA usa un modelo de inteligencia artificial
> (Claude, de la empresa Anthropic) a través del intermediario OpenRouter, en servidores de
> Amazon Web Services o Google Cloud que están fuera de la Argentina, principalmente en
> Estados Unidos. La app usa solo servicios que no guardan lo que se les envía ni lo usan
> para entrenar modelos. Antes de enviar cada mensaje, la app saca el nombre del
> estudiante, el de la escuela y los datos de contacto (teléfonos, correos, documentos).
> Las notas de la memoria viajan con cada charla y se guardan en la base de datos de la app.
>
> **Cuánto dura.** Lo que no se repite en 90 días se borra solo. Al empezar cada ciclo
> lectivo (1° de marzo) se borra todo lo del año anterior.
>
> **Es voluntario.** Si no autorizan, EstudIA funciona igual, sin memoria. Pueden retirar
> la autorización en cualquier momento desde la app o en la escuela, y la memoria se borra
> en el momento. Su hijo o hija también tiene que aceptar, y también puede retirarse cuando
> quiera.
>
> **Sus derechos.** Pueden pedir ver, corregir o borrar estos datos en la dirección de la
> escuela (Ley 25.326 de Protección de Datos Personales).

## Texto para el estudiante

> Si aceptás, EstudIA va a recordar cómo estudiás: qué temas trabajaste, qué te costó, qué
> ya te sale y qué ejemplos te sirven. Así no arranca de cero cada vez.
>
> - Está hecha para no guardar nombres ni nada de tu vida personal, tu familia o cómo te
>   sentís. Si alguna vez ves algo así, borralo.
> - Lo que recuerda lo ves vos, entero, y lo podés borrar cuando quieras.
> - Tus docentes no lo ven. La dirección lo puede revisar para controlar que se use bien,
>   y vos ves cuándo lo hizo.
> - No se usa para ponerte notas.
> - Para responderte, EstudIA usa una inteligencia artificial que funciona fuera del país.
>   Le manda estas notas sin tu nombre, y ese servicio no guarda lo que recibe.
> - Lo que no se repite en 90 días se borra solo, y todo se borra cuando empieza el ciclo
>   lectivo.
> - Tu familia también tiene que aceptar. Si no aceptás, EstudIA funciona igual, sin
>   memoria. Podés cambiar de idea cuando quieras.

---

## Puntos para que revise legal

1. **Base para la transferencia internacional.** Estados Unidos no figura entre los
   países con protección adecuada (Disposición DNPDP 60-E/2016, art. 3, según la Res.
   AAIP 34/2019). El art. 12 del Decreto 1558/2001 admite el **consentimiento expreso** o
   **cláusulas contractuales**. Este texto nombra el país y los proveedores para que el
   consentimiento sea expreso; igual conviene sumar las cláusulas modelo (ver
   `proteccion-de-datos.md`, punto D).
2. **Quién consiente por un adolescente.** El texto pide las dos aceptaciones: familia y
   estudiante. Verificar contra el art. 26 del Código Civil y Comercial (autonomía
   progresiva) y la Res. AAIP 4/2019 (no la pudimos confirmar en fuente oficial). El
   proyecto de ley 3397-D-2026 fijaría 16 años para consentir solo.
3. **"No guardan lo que se les envía".** Es cierto con la configuración actual: cada pedido
   exige endpoints de retención cero (Amazon Bedrock y Google Vertex). OpenRouter declara
   que no retiene prompts salvo que se active el registro, pero dice que toma una muestra
   chica y anónima para clasificarlos. Hay que confirmar que la cuenta tenga el registro
   apagado (ver `proteccion-de-datos.md`, punto A) antes de publicar esta frase.
4. **Región del proyecto de Supabase.** La base de datos de la app también está fuera de la
   Argentina. Confirmar la región y si el texto la tiene que nombrar.
5. **Datos de salud.** La memoria filtra todo lo de salud y ánimo, pero el clasificador de
   riesgo (que ya existía en Migue y ahora también corre en EstudIA) produce una inferencia
   sobre el bienestar, que es dato sensible (art. 2 y 7 de la Ley 25.326). No es parte de
   este consentimiento: necesita su propio análisis.
6. **Plazos.** 90 días sin repetirse y borrado al 1° de marzo. Confirmar que el 1° de marzo
   no deja afuera las mesas de febrero (lo que se trabajó para febrero se borra en marzo).

## Cómo se publica

En la base (como superadmin), cargar la versión aprobada con un nombre que no diga
"borrador" y publicarla:

```sql
INSERT INTO consentimiento_textos (version, titulo, para_familia, para_estudiante)
VALUES ('2026-11-v1', 'Memoria de estudio de EstudIA', '<texto familia>', '<texto estudiante>');
SELECT publicar_consentimiento_memoria('2026-11-v1');
```

Un texto publicado no se puede editar. Si después cambia, se carga y se publica otra
versión: las autorizaciones anteriores quedan en pausa (la memoria no se usa ni se borra)
hasta que familia y estudiante acepten el texto nuevo.
