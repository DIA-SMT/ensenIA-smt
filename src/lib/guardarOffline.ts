/**
 * En la PRIMERA visita, el service worker se instala mientras la app ya
 * está bajando sus pantallas: esas no pasan por él y no quedan guardadas
 * para usar sin conexión (andan de casualidad, mientras el navegador no
 * vacíe su caché). Apenas el service worker toma el control, se vuelven a
 * pedir los archivos de la app que ya se bajaron: salen del caché del
 * navegador (no gastan datos) y ahora sí quedan guardados.
 */
function guardarLoBajado(): void {
  const urls = new Set(
    performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(u => u.startsWith(location.origin + '/assets/')),
  );
  for (const u of urls) fetch(u).catch(() => { /* sin red: ya se guardará la próxima */ });
}

let listo = false;

export function asegurarPantallasOffline(): void {
  if (listo || !('serviceWorker' in navigator)) return;
  listo = true;
  // Si ya controla la página, todo lo que se baje de acá en más queda guardado solo.
  if (navigator.serviceWorker.controller) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    guardarLoBajado();
    // Las pantallas anticipadas pueden terminar de bajar un poco después.
    window.setTimeout(guardarLoBajado, 10_000);
  }, { once: true });
}
