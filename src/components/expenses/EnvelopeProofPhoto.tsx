'use client';

/**
 * รูปถ่ายหลักฐานการรับส่งซองเงิน — ใช้ทุกทอด (การเงิน ↔ เจ้าหน้าที่ส่งกรุ๊ป ↔ หัวหน้าทัวร์)
 *
 * PhotoConfirmModal: กล่องยืนยันที่ "ต้องแนบรูปก่อน" ปุ่มยืนยันถึงจะกดได้ — กันกดยืนยันลอย ๆ โดยไม่มีหลักฐานว่าเงินเปลี่ยนมือจริง
 * ProofThumb: รูปย่อของหลักฐาน กดดูรูปเต็มได้
 */

import { useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Primitives';
import { compressImageToDataUrl } from '@/lib/image/compressImage';

export function PhotoConfirmModal({
  title,
  description,
  confirmLabel,
  photoHint = 'ถ่ายรูปซองคู่กับผู้รับ/ผู้ส่ง ให้เห็นหน้าซองชัดเจน',
  canConfirm = true,
  photoOptional = false,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  photoHint?: string;
  /** เงื่อนไขอื่นนอกจากรูป (เช่นกรอกเหตุผลแล้ว) — รูปบังคับเสมอ */
  canConfirm?: boolean;
  /** รูปไม่บังคับ — ใช้กับทอดที่คนรับเป็นคนถ่ายตอนกดรับเอง (ส่งรูปว่าง '' เมื่อไม่ได้แนบ) */
  photoOptional?: boolean;
  onClose: () => void;
  onConfirm: (photo: string) => void | Promise<void>;
  /** ช่องกรอกเพิ่มเติมของแต่ละทอด (ชื่อผู้รับ / เหตุผล) */
  children?: ReactNode;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const data = await compressImageToDataUrl(f);
    if (data) { setPhoto(data); setError(null); } else setError('อ่านรูปไม่สำเร็จ — ลองถ่ายใหม่อีกครั้ง');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            disabled={(!photo && !photoOptional) || !canConfirm}
            title={!photo && !photoOptional ? 'แนบรูปถ่ายหลักฐานก่อน' : undefined}
            onClick={async () => {
              setSaving(true);
              try { await onConfirm(photo ?? ''); } finally { setSaving(false); }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {children}
        <div>
          <p className="mb-1 text-sm font-medium zego-text-secondary">
            รูปถ่ายหลักฐาน {photoOptional ? <span className="text-xs font-normal zego-text-tertiary">(ไม่บังคับ)</span> : <span className="text-rose-600">*</span>}
          </p>
          <p className="mb-2 text-xs zego-text-tertiary">{photoHint}</p>
          {photo ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="รูปหลักฐาน" className="max-h-56 w-full rounded-lg border zego-border-color object-contain" />
              <Button variant="secondary" size="sm" icon="camera" onClick={() => cameraRef.current?.click()}>ถ่ายใหม่</Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" icon="camera" className="justify-center" onClick={() => cameraRef.current?.click()}>ถ่ายรูป</Button>
              <Button variant="secondary" className="justify-center" onClick={() => galleryRef.current?.click()}>เลือกจากคลังรูป</Button>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        </div>
      </div>
    </Modal>
  );
}

/** รูปย่อหลักฐาน — ไม่มีรูป (ข้อมูลก่อนบังคับแนบรูป) ไม่แสดงอะไร */
export function ProofThumb({ src, label }: { src?: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 align-middle" aria-label={`ดูรูปหลักฐาน: ${label}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-9 w-9 rounded border zego-border-color object-cover" />
        <span className="text-[11px] font-medium zego-text-info underline">ดูรูป</span>
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} size="md" title="รูปหลักฐาน" description={label}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} className="max-h-[70vh] w-full rounded-lg object-contain" />
        </Modal>
      )}
    </>
  );
}
