'use client';

/**
 * ฟอร์มกรอกบัตรประจำตัวประชาชน — จัดวางช่องกรอก "ทับตำแหน่งเดียวกับบนบัตรจริง"
 *
 * ผู้กรอกถือบัตรจริงอยู่ในมือ แล้วไล่กรอกตามที่ตาเห็นได้เลย — ไม่ต้องแปลว่า
 * ช่องไหนบนบัตรตรงกับช่องไหนในฟอร์ม ซึ่งเป็นจุดที่กรอกผิดกันบ่อย
 *
 * ตัวช่องกรอกทั้งหมดมาจาก renderField ของฟอร์มกลาง — ไฟล์นี้ทำหน้าที่ "จัดวาง" อย่างเดียว
 * จึงได้การตรวจสอบ · ข้อความ error · การจัดการวันที่ ชุดเดียวกับเอกสารชนิดอื่น
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * ช่องที่ฟอร์มนี้วางไว้ครบแล้ว — มีเทสต์ตรวจว่าตรงกับ DOC_SCHEMAS.id_card
 * ถ้าเพิ่มช่องใน schema แล้วลืมวางในฟอร์ม เทสต์จะแดงทันที (กันช่องหายเงียบ ๆ)
 */
export const ID_CARD_FORM_FIELD_KEYS = [
  'idNumber',
  'title', 'firstName', 'lastName',
  'titleEn', 'firstNameEn', 'lastNameEn',
  'birthDate',
  /* ที่อยู่: ช่องรายละเอียด + ชุดเขตปกครองที่ addressSlot ดูแลให้ (รวมรหัสจังหวัด/อำเภอ) */
  'addressLine', 'province', 'district', 'subdistrict', 'postalCode', 'provinceCode', 'districtCode',
  'issuedDate', 'expiryDate',
] as const;

export function IdCardForm({
  field,
  fileSlot,
  addressSlot,
}: {
  /** ช่องกรอก 1 ช่องตามชื่อ key (มาจากฟอร์มกลาง) */
  field: (key: string) => ReactNode;
  /** ช่องแนบไฟล์ — วางแทนตำแหน่งรูปบนบัตร (ฝั่งขวาเหมือนบัตรจริง) */
  fileSlot: ReactNode;
  /** ชุดช่องเขตปกครอง จังหวัด → เขต/อำเภอ → แขวง/ตำบล → รหัสไปรษณีย์ (สัมพันธ์กันเป็นลำดับ) */
  addressSlot: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border zego-border-color bg-gradient-to-br from-sky-50 via-sky-50/40 to-white">
      {/* หัวบัตร — ตราครุฑซ้าย ชื่อบัตรสองภาษาเหมือนบัตรจริง */}
      <div className="flex flex-wrap items-center gap-3 border-b border-sky-200/80 px-4 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-300 zego-text-danger">
          <Icon name="star" className="h-4 w-4" />
        </span>
        <p className="min-w-0 text-sm font-semibold leading-tight zego-text">
          ข้อมูลประจำตัวประชาชน
          <span className="ml-2 font-semibold zego-text-info">Thai National ID Card Data</span>
        </p>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="min-w-0 flex-1 space-y-3">
          {/* เลขประจำตัวอยู่บนสุดเหมือนบัตรจริง และเป็นตัวระบุใบนี้ */}
          {field('idNumber')}

          {/* ชื่อไทยแถวบน ชื่ออังกฤษแถวล่าง — เรียงเหมือนที่พิมพ์บนบัตร */}
          <div className="grid gap-3 sm:grid-cols-3">
            {field('title')}
            {field('firstName')}
            {field('lastName')}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {field('titleEn')}
            {field('firstNameEn')}
            {field('lastNameEn')}
          </div>

          {field('birthDate')}

          {/* ที่อยู่ — บรรทัดรายละเอียดก่อน แล้วค่อยเขตปกครองที่อ้างอิงกันเป็นลำดับ */}
          <div className="space-y-3 rounded-lg border border-sky-200/70 bg-white/60 p-3">
            {field('addressLine')}
            {addressSlot}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {field('issuedDate')}
            {field('expiryDate')}
          </div>
        </div>

        {/* ตำแหน่งรูปบนบัตร — อยู่ขวาเหมือนบัตรจริง */}
        <div className="w-full shrink-0 sm:order-last sm:w-40">{fileSlot}</div>
      </div>
    </div>
  );
}
