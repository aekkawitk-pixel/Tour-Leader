'use client';

/**
 * ปุ่มดาว "ไกด์ของฉัน" — ทางลัดปักดาวหัวหน้าทัวร์จากรายการได้ทันที ไม่ต้องเปิดหน้าจัดลำดับ
 * ปักดาวไว้แล้วจะขึ้นก่อนคนอื่นเสมอตอนแนะนำ/เลือกไกด์ทุกจุด (ดู lib/useFavoriteGuides)
 *
 * ปักดาว (เพิ่ม) ทำทันที — เอาออกต้องถามยืนยันก่อนทุกครั้ง กันกดโดนโดยไม่ตั้งใจแล้วหลุดจากรายการที่ตั้งใจไว้
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';

export function FavoriteStarButton({
  favorited,
  onToggle,
  name,
  size = 'md',
  className,
}: {
  favorited: boolean;
  onToggle: () => void;
  /** ชื่อคนที่ปักดาว — ใช้ประกอบ aria-label และข้อความยืนยันเท่านั้น */
  name: string;
  size?: 'sm' | 'md';
  /** ให้ผู้เรียกวางตำแหน่งเอง (เช่น badge มุมรูปโปรไฟล์) — ต่อท้าย class เริ่มต้น ไม่ทับ */
  className?: string;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // เอาออก = ต้องยืนยันก่อนเสมอ · ปักดาวเพิ่ม = ทำทันที ไม่ต้องถาม
          if (favorited) setConfirmRemove(true);
          else onToggle();
        }}
        aria-pressed={favorited}
        aria-label={favorited ? `เอา ${name} ออกจากไกด์ของฉัน` : `ปักดาว ${name} เป็นไกด์ของฉัน`}
        title={favorited ? 'ไกด์ของฉัน — กดเพื่อเอาออก' : 'ปักดาวเป็นไกด์ของฉัน'}
        className={cx(
          'shrink-0 rounded-full p-1 transition-colors',
          'hover:bg-amber-50',
          favorited ? 'text-amber-500' : 'zego-text-disabled hover:text-amber-400',
          className,
        )}
      >
        <Icon name="star" filled={favorited} className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>

      {/* ⚠️ Modal ไม่ได้ render ผ่าน portal — ยังเป็นลูกของแถวตารางที่คลิกแล้วเปิดรายละเอียดได้
          ห่อด้วย stopPropagation กันคลิกปุ่มในกล่องยืนยัน "ทะลุ" ไปโดนแถวข้างใต้ */}
      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmDialog
          open={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          onConfirm={() => {
            onToggle();
            setConfirmRemove(false);
          }}
          tone="danger"
          title="เอาออกจากไกด์ของฉัน"
          confirmLabel="เอาออก"
          message={`เอา ${name} ออกจาก "ไกด์ของฉัน" หรือไม่? จะไม่ถูกแนะนำขึ้นก่อนคนอื่นอีกจนกว่าจะปักดาวใหม่`}
        />
      </div>
    </>
  );
}
