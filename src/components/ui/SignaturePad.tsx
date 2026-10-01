'use client';

/**
 * ช่องเซ็นชื่อบนจอ (นิ้ว/ปากกา/เมาส์) — คืนลายเซ็นเป็น PNG data URL ผ่าน onChange (ล้าง = null)
 * วาดบน canvas ความละเอียดตามจอ (devicePixelRatio) เส้นจึงคมบนมือถือ · touch-action:none กันหน้าเลื่อนตอนเซ็น
 */

import { useEffect, useRef, useState } from 'react';

export function SignaturePad({
  onChange,
  height = 160,
  label = 'เซ็นชื่อในกรอบ',
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  /** มีเส้นแล้วหรือยัง — เก็บใน ref (อ่านตอนยกปากกาได้ค่าล่าสุดเสมอ แม้ยังไม่ render ใหม่) */
  const hasInk = useRef(false);

  // ขนาดจริงของ canvas ตามกรอบบนจอ × devicePixelRatio
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = point(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current && canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed zego-border-color bg-white">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ height, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
          aria-label={label}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
            {label}
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={clear} disabled={empty} className="text-xs font-medium zego-text-info hover:underline disabled:opacity-40">
          ล้างลายเซ็น
        </button>
      </div>
    </div>
  );
}
