'use client';

/**
 * §4 (ฝั่งซ้าย) ตัวดูรูป Passport — ซูมเข้า/ออก · หมุน · เลื่อนดู · เต็มหน้าจอ
 * ใช้ blob: URL ชั่วคราวเท่านั้น (§9 ห้ามเปิดผ่าน Public URL)
 */

import { useEffect, useRef, useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;

export function PassportImageViewer({ url, className }: { url: string | null; className?: string }) {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [full, setFull] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // ปิดเต็มหน้าจอด้วย Esc
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  const reset = () => { setZoom(1); setRotate(0); setOffset({ x: 0, y: 0 }); };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const stage = (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cx(
        'relative flex-1 cursor-grab overflow-hidden rounded-lg bg-slate-900/80 active:cursor-grabbing',
        full ? 'h-full' : 'min-h-[320px]',
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="รูปหนังสือเดินทางที่อัปโหลด (ใช้เทียบข้อมูล)"
          draggable={false}
          className="absolute left-1/2 top-1/2 select-none object-contain"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotate}deg) scale(${zoom})`,
            // พอดีกรอบตั้งแต่เริ่ม (ซูม 100% = เห็นทั้งใบ) แล้วค่อยซูม/ลากดูรายละเอียด
            maxHeight: full ? '88vh' : '50vh',
            maxWidth: '100%',
          }}
        />
      ) : (
        <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-slate-300">
          ไม่มีรูปประกอบ
        </div>
      )}
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.25).toFixed(2)))} aria-label="ซูมเข้า">+ ซูมเข้า</Button>
      <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.25).toFixed(2)))} aria-label="ซูมออก">− ซูมออก</Button>
      <Button size="sm" variant="secondary" onClick={() => setRotate((r) => (r + 90) % 360)}>หมุน 90°</Button>
      <Button size="sm" variant="ghost" onClick={reset}>รีเซ็ต</Button>
      <span className="ml-auto text-xs tabular-nums zego-text-tertiary">{Math.round(zoom * 100)}%</span>
      <Button size="sm" variant="secondary" icon="eye" onClick={() => setFull((v) => !v)}>
        {full ? 'ออกจากเต็มหน้าจอ' : 'เต็มหน้าจอ'}
      </Button>
    </div>
  );

  if (full) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col gap-2 bg-slate-950/95 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-white">รูปหนังสือเดินทาง — ลากเพื่อเลื่อนดู</p>
          <button type="button" onClick={() => setFull(false)} aria-label="ปิดเต็มหน้าจอ" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {stage}
        <div className="rounded-lg bg-white/95 px-3 py-2">{controls}</div>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {stage}
      {controls}
      <p className="text-xs zego-text-tertiary">ลากบนรูปเพื่อเลื่อนดูรายละเอียด · ใช้เทียบกับข้อมูลทางขวาก่อนบันทึก</p>
    </div>
  );
}
