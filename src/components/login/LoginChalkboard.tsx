import { useEffect, useRef, useState } from 'react';

const COLORS = [
  { label: 'Tiza blanca', value: '#f4f8ff' },
  { label: 'Tiza amarilla', value: '#f4dc61' },
  { label: 'Tiza celeste', value: '#91d2ff' },
];
type Point = { x: number; y: number };
type Stroke = { pointer: number; color: string; points: Point[] };

export default function LoginChalkboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clearRef = useRef<() => void>(() => {});
  const colorRef = useRef(COLORS[0].value);
  const [color, setColor] = useState(COLORS[0].value);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let strokes: Stroke[] = [];
    let active: Stroke | null = null;
    let width = 0, height = 0, count = 0;
    const maxPoints = 24000;
    function point(e: PointerEvent): Point {
      const r = canvas!.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
    }
    function segment(a: Point, b: Point, ink: string) {
      ctx!.strokeStyle = ctx!.fillStyle = ink;
      ctx!.globalAlpha = .86;
      ctx!.lineWidth = 2.6;
      ctx!.lineCap = ctx!.lineJoin = 'round';
      ctx!.beginPath();
      ctx!.moveTo(a.x * width, a.y * height);
      ctx!.lineTo(b.x * width, b.y * height);
      ctx!.stroke();
      if (a === b) { ctx!.beginPath(); ctx!.arc(a.x * width, a.y * height, 1.3, 0, Math.PI * 2); ctx!.fill(); }
    }
    function paint() {
      ctx!.clearRect(0, 0, width, height);
      for (const stroke of strokes) {
        segment(stroke.points[0], stroke.points[0], stroke.color);
        for (let i = 1; i < stroke.points.length; i++) segment(stroke.points[i - 1], stroke.points[i], stroke.color);
      }
    }
    function resize() {
      const r = canvas!.getBoundingClientRect();
      if (!r.width || !r.height) return;
      width = r.width; height = r.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint();
    }
    function stop() {
      const id = active?.pointer;
      active = null;
      if (id !== undefined && canvas!.hasPointerCapture(id)) canvas!.releasePointerCapture(id);
    }
    function down(e: PointerEvent) {
      if (e.button !== 0 || active) return;
      e.preventDefault();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.closest('.login-card')) focused.blur();
      if (count >= maxPoints && strokes.length) { count -= strokes.shift()!.points.length; paint(); }
      canvas!.setPointerCapture(e.pointerId);
      active = { pointer: e.pointerId, color: colorRef.current, points: [point(e)] };
      strokes.push(active); count++;
      segment(active.points[0], active.points[0], active.color);
      setMessage('');
    }
    function move(e: PointerEvent) {
      if (!active || e.pointerId !== active.pointer || count >= maxPoints) return;
      const p = point(e), last = active.points[active.points.length - 1];
      if (Math.hypot((p.x - last.x) * width, (p.y - last.y) * height) < 1) return;
      active.points.push(p); count++; segment(last, p, active.color);
    }
    function up(e: PointerEvent) { if (e.pointerId === active?.pointer) stop(); }
    clearRef.current = () => { stop(); strokes = []; count = 0; paint(); };
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', stop);
    window.addEventListener('blur', stop);
    return () => {
      stop(); observer.disconnect(); clearRef.current = () => {};
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);

  return <div className="login-board">
    <svg className="login-doodles" viewBox="0 0 400 600" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M280 120l72-26-19 55-16-22-37-7 72-26-35 33-9 22 2-22" />
        <path d="M277 147c-39 16-18 39-46 45" strokeDasharray="4 8" />
        <path d="M38 458l15-11 15 11v24H38zM48 482v-14h11v14M53 435v-12M42 439l-8-8M64 439l8-8" />
        <path d="M295 469q20-10 37 0v39q-17-10-37 0zM332 469q18-10 37 0v39q-19-10-37 0M303 480l20-1M303 487l20-1M341 480l18-1" />
        <path d="M335 221l4 10 11 1-8 7 2 11-9-6-10 6 3-11-8-7 11-1z" />
      </g>
    </svg>
    <canvas ref={canvasRef} className="login-chalk" aria-label="Pizarrón para garabatear: mantené clic y arrastrá. Los dibujos son temporales." />
    <div className="login-board-heading"><span>NUESTRO RINCÓN</span><b>Ideas que crecen.</b></div>
    <div className="login-chalk-tools" role="group" aria-label="Herramientas del pizarrón">
      {COLORS.map(c => <button key={c.value} type="button" className="login-chalk-color" style={{ backgroundColor: c.value }} aria-label={c.label} aria-pressed={color === c.value} onClick={() => { colorRef.current = c.value; setColor(c.value); }} />)}
      <button type="button" onClick={() => { clearRef.current(); setMessage('Pizarrón borrado.'); }}>Borrar</button>
    </div>
    <span className="login-chalk-hint">Clic y arrastrá para garabatear ✎</span>
    <span className="login-chalk-status" role="status">{message}</span>
  </div>;
}
