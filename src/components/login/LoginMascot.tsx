import { useEffect, useRef } from 'react';
import type { MiguePose, StudentController } from './student-viewer';

export default function LoginMascot({ pose }: { pose: MiguePose }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<StudentController | null>(null);
  const poseRef = useRef(pose);

  useEffect(() => {
    poseRef.current = pose;
    controllerRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    const host = hostRef.current;
    const region = host?.closest<HTMLElement>('[data-migue-region]');
    if (!host || !region) return;
    const desktop = matchMedia('(min-width: 861px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let generation = 0;
    let disposed = false;

    async function mount() {
      const ticket = ++generation;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      if (!host || !desktop.matches || connection?.saveData || disposed) return;
      host.dataset.state = 'loading';
      try {
        // The 3D library and model are optional; the login is usable while loading.
        const { createStudent } = await import('./student-viewer.js');
        if (disposed || ticket !== generation) return;
        controllerRef.current = createStudent(host, {
          onReady() {
            if (disposed || ticket !== generation) return;
            host.dataset.state = 'ready';
            controllerRef.current?.setPose(poseRef.current);
          },
          onError() { if (!disposed && ticket === generation) host.dataset.state = 'unavailable'; },
        });
        controllerRef.current.setPose(poseRef.current);
      } catch { if (!disposed && ticket === generation) host.dataset.state = 'unavailable'; }
    }

    function clear() { controllerRef.current?.clearPointer(); }
    function pointer(event: PointerEvent) {
      if (event.pointerType !== 'mouse' || !region) { clear(); return; }
      const r = region.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) { clear(); return; }
      controllerRef.current?.trackPointer(event.clientX, event.clientY);
    }
    void mount();
    desktop.addEventListener('change', mount);
    region.addEventListener('pointermove', pointer);
    region.addEventListener('pointerleave', clear);
    region.addEventListener('pointercancel', clear);
    window.addEventListener('blur', clear);
    window.addEventListener('scroll', clear, { capture: true, passive: true });
    return () => {
      disposed = true;
      generation++;
      desktop.removeEventListener('change', mount);
      region.removeEventListener('pointermove', pointer);
      region.removeEventListener('pointerleave', clear);
      region.removeEventListener('pointercancel', clear);
      window.removeEventListener('blur', clear);
      window.removeEventListener('scroll', clear, true);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return <aside className="login-migue" aria-label="Migue, tu compañero en EstudIA">
    <div ref={hostRef} className="login-migue-model" aria-hidden="true" />
    <p><strong>¡Hola! Soy Migue.</strong><span>Aprendemos juntos.</span></p>
  </aside>;
}
