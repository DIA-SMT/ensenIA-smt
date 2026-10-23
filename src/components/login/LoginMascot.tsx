import { useEffect, useRef } from 'react';
import type { MiguePose, StudentController } from './student-viewer';

export default function LoginMascot({ pose, rejection, passwordVisible }: { pose: MiguePose; rejection: number; passwordVisible: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<StudentController | null>(null);
  const poseRef = useRef(pose);
  const visibleRef = useRef(passwordVisible);

  useEffect(() => {
    visibleRef.current = passwordVisible;
    controllerRef.current?.setPasswordVisible(passwordVisible);
  }, [passwordVisible]);

  useEffect(() => {
    if (rejection > 0) controllerRef.current?.reject();
  }, [rejection]);

  useEffect(() => {
    poseRef.current = pose;
    controllerRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    const host = hostRef.current;
    const region = host?.closest<HTMLElement>('[data-migue-region]');
    if (!host || !region) return;
    const desktop = matchMedia('(min-width: 861px)');
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
    }).connection;
    // The model is ~21 MB: on a slow or crowded network (a school Wi-Fi with a
    // whole staff logging in at once) it would compete with the app itself.
    // Chrome/Edge estimate the connection; Safari/Firefox don't, and keep loading it.
    const slow = () => !!connection && (
      !!connection.saveData
      || (!!connection.effectiveType && connection.effectiveType !== '4g')
      || (typeof connection.downlink === 'number' && connection.downlink < 5)
    );
    let generation = 0;
    let disposed = false;

    async function mount() {
      const ticket = ++generation;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      if (!host || !desktop.matches || disposed) return;
      if (slow()) { host.dataset.state = 'unavailable'; return; }
      // Let the login form and the app's own code load first
      await new Promise<void>(resolve => {
        if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 2500 });
        else setTimeout(resolve, 1200);
      });
      if (disposed || ticket !== generation) return;
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
        controllerRef.current.setPasswordVisible(visibleRef.current);
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
    <p><strong>¡Hola! Soy Migue.</strong><span>¿Estudiamos juntos?</span></p>
  </aside>;
}
