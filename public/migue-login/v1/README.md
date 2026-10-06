# Migue estudiante en el acceso de EstudIA

Modelo: torso estudiante v13 (actualización visual aprobada por Lucas), sin mochila ni casco, con rostro y morphs de mirada y expresiones conservados. Presencia inicial: 90%.

- `migue-estudiante.glb`: 21.2 MB, comprimido con Draco. Se carga bajo demanda únicamente en escritorio; no se solicita en la vista móvil ni si el navegador indica ahorro de datos.
- `draco/`: decodificador local, licencia Apache 2.0 incluida. Three.js está fijado en 0.180.0.
- La URL del modelo incluye `?uniforme=v13` para invalidar la caché de la versión anterior. No se añade este modelo al precache de la PWA.
- El login funciona independientemente de la carga del modelo. La carga 3D es un módulo separado.
- El pizarrón mantiene los trazos solo en memoria, los conserva al redimensionar y no envía ni guarda datos.
- Las expresiones reciben únicamente estados del formulario; el motor de Migue no recibe el email ni la contraseña.
- En móvil se prioriza el formulario. Se respetan movimiento reducido y el modo de contraste alto para la tarjeta y el fondo.

Verificación: compilación de producción, lint de los archivos TypeScript modificados, interacción de escritorio con modelo cargado, dibujo/borrado, transparencia al enfocar, contraseña oculta/revelada y formulario móvil sin desborde. La autenticación no se simula ni se sustituye.

Uniforme v10: solapas con bordes redondeados, cuello vuelto continuo, remera azul con cuello de punto y costuras, algodón blanco cálido y emblema municipal original sobre el bolsillo izquierdo. Fuente editable: migue_estudiante_visual_v12.blend, en el proyecto Migue_3D. Geometría facial y morphs conservados.

Botones v11: cuatro discos blancos satinados con borde redondeado, centro rebajado, cuatro perforaciones y costura. Posición ajustada a la superficie de la tapeta para evitar que queden hundidos. El resto del modelo v10 se conserva.

Cuello v12: cuello vuelto continuo desde la nuca hasta las puntas delanteras, con caída sobre las solapas. Se retrajo el borde antiguo del escote bajo el doblez. Remera, botones v11, emblema municipal y morphs faciales conservados.

Nitidez web: el atlas principal ya tiene 4096 x 4096 píxeles. El visor renderiza a escala 2 como mínimo habitual, respeta densidades de pantalla de hasta 4 y limita la superficie a 3840 x 2160 píxeles y las capacidades de la GPU. Filtrado anisotrópico hasta 8x, actualización de densidad al cambiar de monitor y limpieza del observador al desmontar. No se modifica el peso del GLB ni las expresiones.

Cierre v13: delanteros originales con cruce real de tela, cuatro botones alineados en el eje central y ojales verticales bordados a las mismas alturas. Se retiró la tapeta agregada y se integraron las puntas de las solapas con cada capa. Cuello v12, remera, rostro, hombros, emblema y nitidez del visor conservados. Fuente: migue_estudiante_visual_v13.blend.
