/**
 * Corre las tareas de a pocas: con muchas juntas, el wifi de la casa (o los
 * datos del celular) también sufre. Avisa cada una que termina, bien o mal.
 */
export async function deAPocas(
  tareas: (() => Promise<unknown>)[],
  enParalelo: number,
  alTerminarUna: (ok: boolean) => void,
): Promise<void> {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const tarea = tareas[siguiente++];
      let ok = true;
      try { await tarea(); } catch { ok = false; }
      alTerminarUna(ok);
    }
  };
  await Promise.all(Array.from({ length: Math.min(enParalelo, tareas.length) }, trabajador));
}
