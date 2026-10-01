'use client';

/**
 * หน้าข้อมูลในเล่มหนังสือเดินทาง — ผังเดียวใช้ทั้งตอน "อ่าน" และตอน "แก้ไข"
 *
 * ตำแหน่งช่องยึดตามหน้าเล่มจริง: รูปซ้าย · ช่องข้อมูลขวา · MRZ ล่างสุด
 * ไฟล์นี้ทำหน้าที่ "จัดวาง + ป้ายกำกับ" อย่างเดียว ส่วนเนื้อในของแต่ละช่องผู้เรียกส่งมาเอง
 * — การ์ดส่งข้อความอ่านอย่างเดียว · ฟอร์มส่งช่องกรอก
 * กด "แก้ไข" แล้วช่องจึงอยู่ตำแหน่งเดิมทุกช่อง ไม่ต้องมองหาใหม่ว่าช่องไหนคือช่องไหน
 *
 * ⚠️ มีเทสต์ตรวจว่าช่องบนหน้าเล่ม + ช่องนอกหน้าเล่ม รวมกันครบทุกช่องของเล่มพอดี
 */

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/Primitives';
import { PASSPORT_FIELD_ORDER, type PassportFieldKey } from '@/data/leaders/passportBookTypes';

/** ช่องข้อมูล 1 ช่องบนหน้าเล่ม — ป้ายกำกับสองภาษาเหมือนที่พิมพ์อยู่บนเล่มจริง */
export interface PassportPageSlot {
  key: PassportFieldKey;
  en: string;
  th: string;
  /** ตัวอักษรความกว้างเท่ากัน (เลขเล่ม/เลข ปชช./MRZ) — อ่านทีละตัวได้ไม่สับสน */
  mono?: boolean;
}

interface PassportPageRow {
  /** grid = เรียงเป็นตาราง · stack = ช่องละบรรทัดเต็มความกว้าง (ชื่อ-นามสกุลยาว) */
  layout: 'grid' | 'stack';
  slots: PassportPageSlot[];
}

/** ผังหน้าเล่ม เรียงจากบนลงล่างตามที่ตากวาดอ่านบนเล่มจริง */
export const PASSPORT_PAGE_ROWS: PassportPageRow[] = [
  {
    layout: 'grid',
    slots: [
      { key: 'passportType', en: 'Type', th: 'ชนิด' },
      { key: 'issuingCountry', en: 'Country Code', th: 'ประเทศ' },
      { key: 'passportNo', en: 'Passport No.', th: 'หนังสือเดินทางเลขที่', mono: true },
    ],
  },
  {
    layout: 'stack',
    slots: [
      { key: 'lastName', en: 'Surname', th: 'นามสกุล' },
      { key: 'firstName', en: 'Given Name', th: 'ชื่อ' },
      { key: 'fullNameTh', en: 'Name in Thai', th: 'ชื่อภาษาไทย' },
    ],
  },
  {
    layout: 'grid',
    slots: [
      { key: 'nationality', en: 'Nationality', th: 'สัญชาติ' },
      { key: 'dateOfBirth', en: 'Date of Birth', th: 'วันเกิด' },
      { key: 'nationalId', en: 'Identification No.', th: 'เลขประจำตัวประชาชน', mono: true },
      { key: 'gender', en: 'Sex', th: 'เพศ' },
      { key: 'placeOfBirth', en: 'Place of Birth', th: 'สถานที่เกิด' },
      { key: 'height', en: 'Height', th: 'ส่วนสูง' },
    ],
  },
  {
    layout: 'grid',
    slots: [
      { key: 'issueDate', en: 'Date of Issue', th: 'วันที่ออก' },
      { key: 'expiryDate', en: 'Date of Expiry', th: 'วันที่หมดอายุ' },
      { key: 'issuingAuthority', en: 'Issuing Authority', th: 'ออกให้โดย' },
    ],
  },
];

/** แถบ MRZ ท้ายหน้าเล่ม — อยู่นอกผังข้างบนเพราะกินเต็มความกว้างและมีพื้นหลังของตัวเอง */
export const PASSPORT_PAGE_MRZ_KEYS: PassportFieldKey[] = ['mrzLine1', 'mrzLine2'];

/** ช่องที่ปรากฏบนหน้าเล่ม */
export const PASSPORT_PAGE_FIELD_KEYS: PassportFieldKey[] = [
  ...PASSPORT_PAGE_ROWS.flatMap((row) => row.slots.map((s) => s.key)),
  ...PASSPORT_PAGE_MRZ_KEYS,
];

/**
 * ข้อมูลของเล่มที่ไม่ได้พิมพ์บนหน้าเล่ม — ระบบเติมให้จาก OCR เท่านั้น ไม่มีช่องในฟอร์ม
 */
export const PASSPORT_OCR_ONLY_FIELD_KEYS: PassportFieldKey[] = ['placeOfIssue'];

/**
 * ข้อมูล "ของตัวบุคคล" ที่ระบบคัดลอกมาเก็บคู่กับเล่ม (ชื่อไทยแยกคำ · ชื่อเต็ม · คำนำหน้า)
 *
 * ไม่ใช่ข้อมูลของหนังสือเดินทาง — ต้นทางคือประวัติส่วนตัวของหัวหน้าทัวร์ ระบบเติมให้เอง
 * ตอนนำเข้า/อ่าน OCR จึงไม่เปิดให้แก้ในฟอร์มเล่ม ไม่งั้นจะมีชื่อคนละชุดกับประวัติส่วนตัว
 * แก้ที่แท็บ "ข้อมูลส่วนตัว" ที่เดียว แล้วทุกเล่มได้ค่าตรงกัน
 */
export const PASSPORT_PROFILE_FIELD_KEYS: PassportFieldKey[] = [
  'titleName', 'fullName',
  'titleNameTh', 'firstNameTh', 'lastNameTh', 'nameInThaiRaw',
];

/** ช่องที่ไม่ได้อยู่บนหน้าเล่มทั้งหมด = ที่ระบบเติมจาก OCR + ที่เป็นข้อมูลของตัวบุคคล */
export const PASSPORT_OFF_PAGE_FIELD_KEYS: PassportFieldKey[] =
  PASSPORT_FIELD_ORDER.filter((k) => !PASSPORT_PAGE_FIELD_KEYS.includes(k));

export function PassportDataPage({
  photo, renderSlot, slotNote, mrz, banner, className,
}: {
  /** ช่องรูปฝั่งซ้าย — ไม่ส่งมา = ไม่แสดงคอลัมน์รูป */
  photo?: ReactNode;
  /** เนื้อในของช่อง 1 ช่อง (ป้ายกำกับผังเป็นคนวางให้แล้ว) */
  renderSlot: (slot: PassportPageSlot) => ReactNode;
  /**
   * ข้อความต่อท้ายป้ายกำกับของช่องนั้น (เช่น บอกระบบปีในช่องวันที่)
   * มีเฉพาะตอนกรอก — หน้าเล่มแบบอ่านไม่ส่งมา จะได้เหมือนเล่มจริงไม่มีคำอธิบายแทรก
   */
  slotNote?: (slot: PassportPageSlot) => string | undefined;
  /** เนื้อในแถบ MRZ — ไม่ส่งมา = ไม่แสดงแถบนี้ (ฟอร์มกรอกไม่มีแถบ MRZ) */
  mrz?: ReactNode;
  /** แถบเสริมใต้หัวเล่ม (เช่น สถานะเล่ม/ผลตรวจ MRZ ตอนแก้ไข) */
  banner?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('@container overflow-hidden rounded-xl border border-slate-300 bg-gradient-to-b from-sky-50/60 to-white', className)}>
      {/* หัวเล่ม */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-white/70 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Kingdom of Thailand
          <span className="ml-2 font-normal normal-case text-slate-500">ราชอาณาจักรไทย</span>
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Passport
          <span className="ml-2 font-normal normal-case text-slate-500">หนังสือเดินทาง</span>
        </p>
      </div>

      {banner && <div className="border-b border-slate-200 bg-white/60 px-4 py-2">{banner}</div>}

      {/*
        @container ที่ wrapper — เพราะการ์ดนี้ถูกใช้ทั้งในหน้าผู้จัด (กว้างเท่าจอ) และพอร์ทัลมือถือ
        ของหัวหน้าทัวร์ (แคบกว่าจอมากเพราะอยู่ใน max-w-md) การอิง viewport breakpoint (sm:) เดิม
        จะทำให้ที่พอร์ทัลมือถือ (จอกว้างแต่การ์ดแคบ) เข้า breakpoint ทั้งที่พื้นที่จริงไม่พอ ป้ายกำกับ/
        ค่าที่เป็นเลข (เลขหนังสือเดินทาง ฯลฯ) จึงตัดขึ้นบรรทัดใหม่กลางคำจนอ่านยาก
      */}
      <div className="flex flex-col gap-4 p-4 @lg:flex-row">
        {photo && <div className="shrink-0">{photo}</div>}

        <div className="min-w-0 flex-1 space-y-3">
          {PASSPORT_PAGE_ROWS.map((row, i) => (
            <div
              key={row.slots[0].key}
              className={cx(
                i > 0 && 'border-t border-slate-200/70 pt-3',
                row.layout === 'grid' ? 'grid grid-cols-1 gap-x-4 gap-y-3 @lg:grid-cols-2 @3xl:grid-cols-3' : 'space-y-3',
              )}
            >
              {row.slots.map((slot) => (
                <div key={slot.key} className="min-w-0">
                  <p className="text-[10px] leading-tight text-slate-400">
                    {slot.en} <span className="text-slate-400/80">/ {slot.th}</span>
                    {slotNote?.(slot) && (
                      <span className="ml-1 font-medium zego-text-tertiary">({slotNote(slot)})</span>
                    )}
                  </p>
                  <div className="mt-0.5">{renderSlot(slot)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* แถบ MRZ ท้ายเล่ม — มีเฉพาะตอนแสดงหน้าเล่ม ตอนกรอกไม่มีช่องนี้ */}
      {mrz && (
        <div className="border-t border-slate-300 bg-white px-4 py-2.5">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
            Machine Readable Zone
          </p>
          {mrz}
        </div>
      )}
    </div>
  );
}
