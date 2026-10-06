# Migue estudiante en el acceso de EstudIA

Modelo aprobado: torso estudiante v09, sin mochila ni casco, con rostro y morphs de mirada y expresiones conservados. Presencia inicial: 90%.

- `migue-estudiante.glb`: 20.6 MB, comprimido con Draco. Se carga bajo demanda únicamente en escritorio; no se solicita en la vista móvil ni si el navegador indica ahorro de datos.
- `draco/`: decodificador local, licencia Apache 2.0 incluida. Three.js está fijado en 0.180.0.
- La URL incluye `v1` para permitir futuras actualizaciones sin reutilizar el mismo nombre. No se añade este modelo al precache de la PWA.
- El login funciona independientemente de la carga del modelo. La carga 3D es un módulo separado.
- El pizarrón mantiene los trazos solo en memoria, los conserva al redimensionar y no envía ni guarda datos.
- Las expresiones reciben únicamente estados del formulario; el motor de Migue no recibe el email ni la contraseña.
- En móvil se prioriza el formulario. Se respetan movimiento reducido y el modo de contraste alto para la tarjeta y el fondo.

Verificación: compilación de producción, lint de los archivos TypeScript modificados, interacción de escritorio con modelo cargado, dibujo/borrado, transparencia al enfocar, contraseña oculta/revelada y formulario móvil sin desborde. La autenticación no se simula ni se sustituye.
