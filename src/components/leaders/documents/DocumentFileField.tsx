'use client';

/**
 * ช่องแนบไฟล์ของเอกสาร — เก็บไฟล์จริงใน documentImageStore (IndexedDB) ไม่ใช่ localStorage
 *
 * เหตุผลที่ไม่เก็บเป็น Base64 ใน localStorage เหมือนที่วิซาร์ดทำ:
 * ไฟล์ 5 MB กลายเป็น ~6.7 MB เมื่อเข้ารหัส Base64 ซึ่งเกินโควตา localStorage (ราว 5 MB)
 * แค่ไฟล์เดียวก็เต็ม และจะทำให้บันทึกข้อมูลอย่างอื่นพังไปด้วย
 *
 * ไฟล์ถูกอัปโหลดทันทีที่เลือก แล้วคืน imageId ให้ผู้เรียกเก็บลงเอกสาร
 * ถ้าผู้ใช้ยกเลิกฟอร์มโดยไม่บันทึก ไฟล์จะค้างอยู่ใน IndexedDB — ผู้เรียกต้องลบเอง
 */

import { useRef, useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import type { DocKind } from '@/data/leaders/documentSchemas';
import {
  deleteDocumentImage,
  openDocumentImageUrl,
  releaseImageUrl,
  saveDocumentImage,
} from '@/services/documentImageStore';

const MAX_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];
const ACCEPT_ATTR = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export interface AttachedFile {
  imageId: string;
  fileName: string;
  byteSize: number;
  /** ผู้แนบและเวลาที่แนบ — บันทึกลงระเบียนเอกสารด้วย ไม่ได้อยู่แค่ใน IndexedDB */
  uploadedBy: string;
  uploadedAt: string;
}

export function DocumentFileField({
  label,
  required,
  tourLeaderId,
  kind,
  value,
  error,
  onChange,
  onRead,
  retainReplaced,
}: {
  label: string;
  required?: boolean;
  tourLeaderId: string;
  kind: DocKind;
  value: AttachedFile | null;
  error?: string;
  onChange: (file: AttachedFile | null) => void;
  /**
   * อ่านข้อมูลจากไฟล์ที่เพิ่งแนบ (OCR) — ไม่ส่งมา = ไม่มีปุ่มอ่านเอกสาร
   * ช่องแนบไฟล์ไม่รู้จัก schema ของเอกสาร ผู้เรียกจึงเป็นคนเติมค่าลงฟอร์มเอง
   */
  onRead?: (file: File) => void | Promise<void>;
  /**
   * true = ไฟล์เดิมถูกอ้างอยู่ในประวัติของเอกสารที่บันทึกแล้ว จึงห้ามลบทิ้งตอนเปลี่ยนไฟล์
   * false/ไม่ส่ง = ยังไม่เคยบันทึก เปลี่ยนไฟล์ไปมาได้โดยไม่ต้องเก็บของเก่า
   */
  retainReplaced?: boolean;
}) {
  const { currentUser, today, pushToast } = useDemo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setLocalError('รองรับเฉพาะไฟล์ JPG, JPEG, PNG และ PDF');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`ไฟล์ต้องมีขนาดไม่เกิน ${MAX_MB} MB`);
      return;
    }

    setLocalError(undefined);
    setBusy(true);
    try {
      /* ใช้นาฬิกาเดียวกับ audit trail ทั้งระบบ — ไม่ผสมเวลาจริงกับวันที่จำลองของ Demo */
      const uploadedAt = `${today}T00:00`;
      const imageId = await saveDocumentImage(file, {
        tourLeaderId,
        kind,
        fileName: file.name,
        uploadedBy: currentUser.name,
        uploadedAt,
      });
      // เปลี่ยนไฟล์ทับของเดิม → ลบไฟล์เก่าทิ้ง ไม่ให้ค้างกินพื้นที่
      // ยกเว้นเอกสารที่บันทึกแล้ว — ไฟล์เดิมถูกอ้างในประวัติ ลบไปแล้วตรวจย้อนหลังไม่ได้
      if (value && !retainReplaced) await deleteDocumentImage(value.imageId);
      onChange({
        imageId,
        fileName: file.name,
        byteSize: file.size,
        uploadedBy: currentUser.name,
        uploadedAt,
      });
      await onRead?.(file);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'อัปโหลดไฟล์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const view = async () => {
    if (!value) return;
    const url = await openDocumentImageUrl(value.imageId, {
      canView: true, // ผู้เรียกตรวจสิทธิ์มาแล้วก่อนเปิดฟอร์ม
      by: currentUser.name,
      at: `${today}T00:00`,
      tourLeaderId,
    });
    if (!url) {
      pushToast('error', 'เปิดไฟล์ไม่สำเร็จ — อาจถูกลบไปแล้ว');
      return;
    }
    window.open(url, '_blank', 'noopener');
    // ปล่อย URL หลังเบราว์เซอร์เปิดแท็บแล้ว (คืนหน่วยความจำ)
    setTimeout(() => releaseImageUrl(url), 60_000);
  };

  const remove = async () => {
    if (!value) return;
    if (!retainReplaced) await deleteDocumentImage(value.imageId);
    onChange(null);
  };

  const shownError = localError ?? error;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium zego-text-secondary">
        {label}
        {required && <span className="ml-0.5 zego-text-danger">*</span>}
      </p>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border zego-border-color zego-surface-soft-bg p-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded zego-icon-well">
            <Icon name="file" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium zego-text-secondary">{value.fileName}</p>
            <p className="inline-flex items-center gap-1 text-xs zego-text-success">
              <Icon name="check" className="h-3 w-3" />
              แนบแล้ว · {(value.byteSize / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button size="sm" variant="secondary" icon="eye" onClick={view}>เปิดดู</Button>
          <Button size="sm" variant="secondary" onClick={remove}>ลบไฟล์</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cx(
            'flex w-full flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors',
            shownError ? 'zego-warned-border zego-warned-tint' : 'zego-border-color zego-hover-surface',
          )}
        >
          <Icon name="file" className="h-5 w-5 zego-text-tertiary" />
          <span className="text-sm zego-text-secondary">{busy ? 'กำลังอัปโหลด…' : 'คลิกเพื่อเลือกไฟล์'}</span>
          <span className="text-xs zego-text-tertiary">JPG, JPEG, PNG, PDF · ไม่เกิน {MAX_MB} MB</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        aria-label={label}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />

      {/*
        ปุ่มอ่านเอกสาร — วางใต้กรอบแนบไฟล์ ทั้งตอนยังไม่มีไฟล์และตอนแนบแล้ว
        เลือกไฟล์ใหม่ = แทนที่ไฟล์เดิม แล้วให้ผู้เรียกลองอ่านข้อมูลจากไฟล์นั้น
      */}
      {onRead && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cx(
            'mt-2 inline-flex items-center gap-1.5 rounded-lg border zego-border-color zego-surface-bg px-3 py-1.5',
            'text-xs font-medium zego-text-secondary zego-hover-surface disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <Icon name="file" className="h-3.5 w-3.5" />
          อัปโหลดรูปใหม่ / อ่าน OCR ใหม่
        </button>
      )}

      {shownError && <p className="mt-1 text-xs zego-text-danger">{shownError}</p>}
    </div>
  );
}
