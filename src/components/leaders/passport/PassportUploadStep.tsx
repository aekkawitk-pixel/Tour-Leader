'use client';

/**
 * §1 อัปโหลดรูป Passport + ตัวอย่างรูปก่อนอ่านข้อมูล
 *   • ลากมาวาง / เลือกไฟล์จากเครื่อง / ถ่ายรูปจากกล้อง
 *   • รองรับ JPG · JPEG · PNG · PDF (หน้าข้อมูล)
 *   • ปุ่ม: เปลี่ยนรูป · หมุนรูป · ครอปรูป · ลบรูป · เริ่มอ่านข้อมูล
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import {
  ACCEPT_ATTR, FULL_CROP, isAcceptedFile, isPdf, pdfFirstPageToImage,
  type CropRect,
} from '@/services/passportImageEdit';

interface Props {
  /** รูปที่เลือกไว้ (หลังแปลง PDF แล้ว) */
  file: Blob | null;
  fileName: string;
  rotateDeg: number;
  crop: CropRect;
  onPick: (file: Blob, fileName: string) => void;
  onRotate: (deg: number) => void;
  onCrop: (crop: CropRect) => void;
  onClear: () => void;
  onStart: () => void;
  busy: boolean;
}

export function PassportUploadStep({
  file, fileName, rotateDeg, crop, onPick, onRotate, onCrop, onClear, onStart, busy,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropping, setCropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // blob: URL ผูกกับไฟล์ปัจจุบัน · คืนหน่วยความจำเมื่อเปลี่ยนไฟล์/ออกจากหน้า (§9)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const accept = useCallback(async (picked: File) => {
    setError(null);
    if (!isAcceptedFile(picked)) {
      setError('รองรับเฉพาะไฟล์ JPG, JPEG, PNG และ PDF (หน้าข้อมูล Passport)');
      return;
    }
    setLoading(true);
    try {
      if (isPdf(picked, picked.name)) {
        const img = await pdfFirstPageToImage(picked);
        onPick(img, picked.name);
      } else {
        onPick(picked, picked.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปิดไฟล์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [onPick]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void accept(dropped);
  };

  /* ------------------------------ ยังไม่มีรูป ------------------------------ */
  if (!file) {
    return (
      <div className="space-y-4">
        {error && <Callout tone="red" title="เปิดไฟล์ไม่ได้">{error}</Callout>}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx(
            'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragOver ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-surface-soft-bg',
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full zego-surface-bg zego-text-info ring-1 ring-[var(--zego-border)]">
            <Icon name="file" className="h-7 w-7" />
          </span>
          <div>
            <p className="text-base font-semibold zego-text">ลากไฟล์รูป Passport มาวางที่นี่</p>
            <p className="mt-1 text-sm zego-text-tertiary">รองรับ JPG · JPEG · PNG · PDF (เฉพาะหน้าข้อมูล Passport)</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" icon="plus" onClick={() => fileInput.current?.click()} disabled={loading}>
              เลือกไฟล์จากเครื่อง
            </Button>
            <Button variant="secondary" onClick={() => cameraInput.current?.click()} disabled={loading}>
              ถ่ายรูปจากกล้อง
            </Button>
          </div>
          {loading && <p className="text-sm zego-text-tertiary">กำลังเปิดไฟล์…</p>}
        </div>

        <input
          ref={fileInput} type="file" accept={ACCEPT_ATTR} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); e.target.value = ''; }}
        />
        {/* capture = เปิดกล้องบนอุปกรณ์ที่รองรับ · อุปกรณ์อื่นจะกลายเป็นเลือกไฟล์ตามปกติ */}
        <input
          ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); e.target.value = ''; }}
        />

        <p className="text-xs zego-text-tertiary">
          รูปหนังสือเดินทางเป็นข้อมูลสำคัญ — ระบบเก็บไว้ในเครื่องของคุณแบบส่วนตัว ไม่ส่งออกภายนอก และจำกัดสิทธิ์การเปิดดูตามบทบาทผู้ใช้
        </p>
      </div>
    );
  }

  /* ------------------------------ มีรูปแล้ว ------------------------------ */
  return (
    <div className="space-y-4">
      {error && <Callout tone="red" title="เกิดข้อผิดพลาด">{error}</Callout>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm zego-text-secondary">
          ไฟล์: <span className="font-medium zego-text">{fileName}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>เปลี่ยนรูป</Button>
          <Button size="sm" variant="secondary" onClick={() => onRotate((rotateDeg + 90) % 360)} disabled={busy}>หมุนรูป 90°</Button>
          <Button
            size="sm"
            variant={cropping ? 'primary' : 'secondary'}
            onClick={() => setCropping((v) => !v)}
            disabled={busy}
          >
            {cropping ? 'เสร็จสิ้นการครอป' : 'ครอปรูป'}
          </Button>
          <Button size="sm" variant="ghost" icon="x" onClick={onClear} disabled={busy}>ลบรูป</Button>
        </div>
      </div>

      <CropStage
        url={previewUrl}
        rotateDeg={rotateDeg}
        crop={crop}
        cropping={cropping}
        onCrop={onCrop}
      />

      {cropping && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f1f7fd] px-3 py-2 text-sm text-[var(--zego-info)] ring-1 ring-[#d1e3f5]">
          <span>ลากบนรูปเพื่อเลือกเฉพาะหน้าข้อมูล Passport (ให้เห็นแถบตัวอักษรด้านล่างครบ)</span>
          <Button size="sm" variant="ghost" onClick={() => onCrop(FULL_CROP)}>ล้างพื้นที่ที่เลือก</Button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="primary" icon="search" onClick={onStart} disabled={busy}>
          เริ่มอ่านข้อมูล
        </Button>
      </div>

      <input
        ref={fileInput} type="file" accept={ACCEPT_ATTR} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f); e.target.value = ''; }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** พื้นที่แสดงตัวอย่าง + เลือกกรอบครอปด้วยการลาก */
function CropStage({
  url, rotateDeg, crop, cropping, onCrop,
}: { url: string | null; rotateDeg: number; crop: CropRect; cropping: boolean; onCrop: (c: CropRect) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toRatio = (e: React.PointerEvent) => {
    const el = boxRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!cropping) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toRatio(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!cropping || !drag) return;
    const p = toRatio(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };

  const onUp = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const width = Math.abs(drag.x1 - drag.x0);
    const height = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    // กันการคลิกพลาดเป็นกรอบจิ๋ว
    if (width > 0.05 && height > 0.05) onCrop({ x, y, width, height });
  };

  const active = drag
    ? {
      x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0),
    }
    : crop;

  const showOverlay = cropping || (active.width < 0.999 || active.height < 0.999);

  return (
    <div
      ref={boxRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={cx(
        'relative mx-auto flex max-h-[52vh] justify-center overflow-hidden rounded-xl zego-surface-soft-bg ring-1 ring-[var(--zego-border)]',
        cropping && 'cursor-crosshair',
      )}
    >
      {url && (
        // ไฟล์ผู้ใช้เป็น blob: URL ชั่วคราว — ใช้ <img> ตรง ๆ (next/image ไม่รองรับ blob และห้ามอัปโหลดออกนอกเครื่อง §9)
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="ตัวอย่างรูปหนังสือเดินทางที่อัปโหลด"
          draggable={false}
          className="max-h-[52vh] w-auto select-none object-contain"
          style={{ transform: `rotate(${rotateDeg}deg)` }}
        />
      )}
      {showOverlay && (
        <div
          className="pointer-events-none absolute border-2 border-[var(--zego-primary-500)] bg-[var(--zego-primary-500)]/10"
          style={{
            left: `${active.x * 100}%`,
            top: `${active.y * 100}%`,
            width: `${active.width * 100}%`,
            height: `${active.height * 100}%`,
          }}
        />
      )}
    </div>
  );
}
