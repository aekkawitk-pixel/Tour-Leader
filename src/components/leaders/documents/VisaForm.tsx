'use client';

/**
 * ฟอร์มกรอกวีซ่า — จัดวางช่องกรอก "ทับตำแหน่งเดียวกับบนสติกเกอร์จริง"
 *
 * ผู้กรอกเปิดเล่มดูสติกเกอร์อยู่ แล้วไล่กรอกตามที่ตาเห็นได้เลย — ไม่ต้องแปลว่า
 * ช่องไหนบนสติกเกอร์ตรงกับช่องไหนในฟอร์ม ซึ่งเป็นจุดที่กรอกผิดกันบ่อย
 *
 * ตัวช่องกรอกทั้งหมดมาจาก renderField ของฟอร์มกลาง — ไฟล์นี้ทำหน้าที่ "จัดวาง" อย่างเดียว
 * จึงได้การตรวจสอบ · ข้อความ error · การจัดการวันที่ ชุดเดียวกับเอกสารชนิดอื่น
 */

import type { ReactNode } from 'react';

/**
 * ช่องที่ฟอร์มนี้วางไว้ครบแล้ว — มีเทสต์ตรวจว่าตรงกับ DOC_SCHEMAS.visa
 * ถ้าเพิ่มช่องใน schema แล้วลืมวางในฟอร์ม เทสต์จะแดงทันที (กันช่องหายเงียบ ๆ)
 */
export const VISA_FORM_FIELD_KEYS = [
  'countryId', 'number',
  'issuedPlace', 'startDate', 'expiryDate',
  'visaType', 'category', 'entries',
  'holderLastName', 'holderFirstName', 'birthDate', 'nationality',
  'passportNo', 'sex', 'authorizedBy',
  /* ช่องที่มีบนสติกเกอร์บางประเทศ (เชงเก้น) — วางต่อจากขอบเขตการใช้งาน */
  'validFor', 'duration', 'issuedDate',
] as const;

export function VisaForm({
  field,
  fileSlot,
}: {
  /** ช่องกรอก 1 ช่องตามชื่อ key (มาจากฟอร์มกลาง) */
  field: (key: string) => ReactNode;
  /** ช่องแนบไฟล์ — วางแทนตำแหน่งรูปบนสติกเกอร์ */
  fileSlot: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border zego-border-color bg-gradient-to-br from-rose-50/50 via-sky-50/40 to-amber-50/40">
      {/* หัวสติกเกอร์ */}
      <div className="flex flex-wrap items-baseline gap-2 zego-divider-bottom bg-white/70 px-4 py-2.5">
        <p className="text-sm font-bold uppercase tracking-[0.2em] zego-text">Visa</p>
        <p className="text-xs zego-text-tertiary">ตรวจลงตรา</p>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* ตำแหน่งรูปบนสติกเกอร์ */}
        <div className="w-full shrink-0 sm:w-40">{fileSlot}</div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* ประเทศผู้ออกและเลขที่วีซ่า */}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('countryId')}
            {field('number')}
          </div>

          {/* 1-3 สถานที่ออก · ช่วงที่ใช้ได้ */}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('issuedPlace')}
            {field('startDate')}
            {field('expiryDate')}
          </div>

          {/* 4-6 ประเภท · รหัส · จำนวนครั้ง */}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('visaType')}
            {field('category')}
            {field('entries')}
          </div>

          {/*
            ช่องที่มีบนสติกเกอร์บางประเทศ (เชงเก้น) — วางต่อจากขอบเขตการใช้งานเพราะเป็นเรื่องเดียวกัน
            สติกเกอร์ไทยไม่มีสามช่องนี้ ปล่อยว่างไว้ได้ หน้าสติกเกอร์จะไม่แสดงช่องที่ไม่ได้กรอก
          */}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('validFor')}
            {field('duration')}
            {field('issuedDate')}
          </div>

          {/* 7 ชื่อผู้ถือ — สติกเกอร์พิมพ์ "นามสกุล, ชื่อ" จึงเรียงนามสกุลก่อน */}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('holderLastName')}
            {field('holderFirstName')}
          </div>

          {/* 8-9 วันเกิด · สัญชาติ */}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('birthDate')}
            {field('nationality')}
          </div>

          {/* 10-12 เลขหนังสือเดินทาง · เพศ · อนุญาตโดย */}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('passportNo')}
            {field('sex')}
            {field('authorizedBy')}
          </div>
        </div>
      </div>
    </div>
  );
}
