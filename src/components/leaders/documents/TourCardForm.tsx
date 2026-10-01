'use client';

/**
 * ฟอร์มกรอกบัตรผู้นำเที่ยว — จัดวางช่องกรอก "ทับตำแหน่งเดียวกับบนบัตรจริง"
 *
 * ผู้กรอกถือบัตรจริงอยู่ในมือ แล้วไล่กรอกตามที่ตาเห็นได้เลย — ไม่ต้องแปลว่า
 * ช่องไหนบนบัตรตรงกับช่องไหนในฟอร์ม ซึ่งเป็นจุดที่กรอกผิดกันบ่อย
 *
 * ตัวช่องกรอกทั้งหมดมาจาก renderField ของฟอร์มกลาง — ไฟล์นี้ทำหน้าที่ "จัดวาง" อย่างเดียว
 * จึงได้การตรวจสอบ · ข้อความ error · การจัดการวันที่ ชุดเดียวกับเอกสารชนิดอื่น
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { tourCardTitle } from '@/data/leaders/documentSchemas';

/**
 * ช่องที่ฟอร์มนี้วางไว้ครบแล้ว — มีเทสต์ตรวจว่าตรงกับ DOC_SCHEMAS.tour_card
 * ถ้าเพิ่มช่องใน schema แล้วลืมวางในฟอร์ม เทสต์จะแดงทันที (กันช่องหายเงียบ ๆ)
 */
export const TOUR_CARD_FORM_FIELD_KEYS = [
  'cardType', 'number',
  'holderName', 'holderNameEn',
  'issuedDate', 'expiryDate',
] as const;

export function TourCardForm({
  field,
  fileSlot,
  cardType,
}: {
  /** ช่องกรอก 1 ช่องตามชื่อ key (มาจากฟอร์มกลาง) */
  field: (key: string) => ReactNode;
  /** ช่องแนบไฟล์ — วางแทนตำแหน่งรูปบนบัตร */
  fileSlot: ReactNode;
  /** ประเภทบัตรที่กำลังเลือกอยู่ — หัวบัตรเปลี่ยนตามค่านี้ทันที */
  cardType: string;
}) {
  const title = tourCardTitle(cardType);

  return (
    <div className="overflow-hidden rounded-xl border zego-border-color bg-gradient-to-b from-sky-50/70 to-white">
      {/* หัวบัตร */}
      <div className="flex flex-wrap items-center gap-3 zego-divider-bottom bg-white/70 px-4 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full zego-icon-well">
          <Icon name="guide" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight zego-text">{title.th}</p>
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide zego-text-tertiary">
            {title.en}
          </p>
        </div>
      </div>

      {/*
        รูปอยู่ซ้ายเริ่มจากบนสุด · ช่องข้อมูลอยู่ขวาเรียงลงมาในคอลัมน์เดียวกันทั้งหมด
        เลขที่บัตรจึงชิดขอบเดียวกับชื่อผู้ถือบัตร — ตากวาดลงมาตรง ๆ ไม่สะดุด
      */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* ตำแหน่งรูปบนบัตร */}
        <div className="w-full shrink-0 sm:w-40">{fileSlot}</div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* ประเภทบัตรมาก่อนเลขที่ — ระบุว่าเป็นบัตรอะไร แล้วค่อยเลขของบัตรใบนั้น */}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('cardType')}
            {field('number')}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium zego-text-tertiary">อนุญาตให้</p>
            <div className="space-y-3">
              {field('holderName')}
              {field('holderNameEn')}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field('issuedDate')}
            {field('expiryDate')}
          </div>
        </div>
      </div>
    </div>
  );
}
