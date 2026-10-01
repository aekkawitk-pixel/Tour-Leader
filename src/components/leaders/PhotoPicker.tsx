'use client';

/**
 * เลือกรูปประจำตัว + แสดง Preview
 * ⚠️ Demo: อ่านไฟล์เป็น Data URL (Base64) เก็บไปกับ record ของหัวหน้าทัวร์ (localStorage)
 *    ไม่อัปโหลดขึ้น Server · รูปใหญ่ทำให้พื้นที่จัดเก็บเต็มได้ → จำกัดขนาดที่ maxSizeMB
 */

import { useRef, useState } from 'react';
import { Avatar, Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';

const DEFAULT_MAX_SIZE_MB = 2;
const DEFAULT_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function PhotoPicker({
  photoUrl,
  initials,
  color,
  onChange,
  accepted = DEFAULT_ACCEPTED,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  formatsLabel = 'JPG, PNG, WebP หรือ GIF',
}: {
  photoUrl: string | null;
  initials: string;
  color: string;
  onChange: (dataUrl: string | null) => void;
  /** ชนิดไฟล์ที่รองรับ (MIME) */
  accepted?: string[];
  maxSizeMB?: number;
  /** ข้อความอธิบายชนิดไฟล์ที่รองรับ */
  formatsLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const pick = (file: File | undefined) => {
    if (!file) return;

    if (!accepted.includes(file.type)) {
      setError(`ไฟล์ต้องเป็นรูปภาพเท่านั้น (${formatsLabel})`);
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(
        `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB) — ขนาดสูงสุด ${maxSizeMB} MB`,
      );
      return;
    }

    setError(undefined);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.onerror = () => setError('อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่');
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative">
        <Avatar initials={initials || '—'} color={color} size="xl" src={photoUrl} />
        {photoUrl && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--zego-success)] p-1 text-white ring-2 ring-[var(--zego-surface)]">
            <Icon name="check" className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium zego-text-secondary">รูปประจำตัว</p>
        <p className="mt-0.5 text-xs zego-text-tertiary">
          รองรับ {formatsLabel} · ขนาดไม่เกิน {maxSizeMB} MB
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="edit"
            onClick={() => inputRef.current?.click()}
          >
            {photoUrl ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </Button>
          {photoUrl && (
            <Button size="sm" variant="ghost" icon="close" onClick={() => onChange(null)}>
              นำรูปออก
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accepted.join(',')}
          className="sr-only"
          aria-label="เลือกไฟล์รูปประจำตัว"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
          }}
        />

        {error && (
          <p className="mt-2 rounded-lg zego-warned-tint px-2.5 py-1.5 text-xs font-medium zego-text-danger border zego-warned-border">
            {error}
          </p>
        )}

        <p
          className={cx(
            'mt-2 rounded-lg zego-badge--warning px-2.5 py-1.5 text-[11px] border',
          )}
        >
          ⚠️ รูปถูกบันทึกไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่อัปโหลดขึ้น Server — เปิดจากเครื่องอื่นจะไม่เห็นรูป
        </p>

        {!photoUrl && (
          <p className="mt-1.5 text-xs zego-text-tertiary">
            หากไม่มีรูป ระบบจะแสดงอักษรย่อชื่อแทนโดยอัตโนมัติ
          </p>
        )}
      </div>
    </div>
  );
}
