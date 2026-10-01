'use client';

/**
 * เปลือกฟอร์มหนังสือเดินทาง — จัดช่องกรอกให้เรียงเหมือนหน้าข้อมูลในเล่มจริง
 *
 * ใช้ร่วมกันทั้งฟอร์ม "เพิ่มเล่ม" (ตรวจข้อมูลจาก OCR) และ "แก้ไขเล่ม"
 * ไฟล์นี้ทำหน้าที่ "จัดวาง" อย่างเดียว — ตัวช่องกรอกมาจากผู้เรียกผ่าน renderField
 * เพราะสองหน้าจอมีรายละเอียดช่องต่างกัน (ฝั่งเพิ่มมีป้ายความมั่นใจ OCR ·
 * ฝั่งแก้ไขมีการปิดบังเลขและโหมดอ่านอย่างเดียว) แต่ตำแหน่งช่องต้องเหมือนกัน
 */

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/Primitives';
import { PASSPORT_FORM_GROUPS, type PassportFieldKey } from '@/data/leaders/passportBookTypes';

const COL_CLASS: Record<1 | 2 | 3, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

export function PassportFormLayout({
  renderField,
  header,
}: {
  /** ช่องกรอก 1 ช่องตามชื่อ key */
  renderField: (key: PassportFieldKey) => ReactNode;
  /** แถบเสริมใต้หัวเล่ม (เช่น คำเตือนเลขซ้ำ) */
  header?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border zego-border-color bg-gradient-to-b from-sky-50/60 to-white">
      {/* หัวเล่ม — ให้รู้ทันทีว่ากำลังกรอกหน้าไหนของเล่ม */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 zego-divider-bottom bg-white/70 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide zego-text-secondary">
          Kingdom of Thailand
          <span className="ml-2 font-normal normal-case zego-text-tertiary">ราชอาณาจักรไทย</span>
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide zego-text-secondary">
          Passport
          <span className="ml-2 font-normal normal-case zego-text-tertiary">หนังสือเดินทาง</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {header}

        {PASSPORT_FORM_GROUPS.map((group) => (
          <section key={group.title} className="zego-divider-top pt-3 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold zego-text">{group.title}</h3>
            {group.note && <p className="mt-0.5 text-xs zego-text-tertiary">{group.note}</p>}
            <div className={cx('mt-2 grid gap-3', COL_CLASS[group.cols])}>
              {group.keys.map((key) => renderField(key))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
