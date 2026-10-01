/**
 * ชุดช่องข้อมูลจริงของเอกสารแต่ละชนิด — ตัวกลางระหว่าง schema สองชุดที่ระบบมีอยู่
 *
 * ระบบมี schema ของหนังสือเดินทาง 2 ระดับ (ตั้งใจให้ต่างกัน ไม่ใช่ข้อมูลซ้ำ):
 *   • DOC_SCHEMAS.passport (10 ช่อง)  — ชุดย่อสำหรับกรอกเร็วในวิซาร์ดเพิ่มหัวหน้าทัวร์
 *   • PASSPORT_FIELD_ORDER (24 ช่อง) — ชุดเต็มตามหน้าเล่มจริง รวม MRZ · ใช้ในโมดูลหนังสือเดินทาง
 *
 * "ฉบับที่เก็บจริง" ต้องใช้ชุดเต็มเสมอ ฟังก์ชันในไฟล์นี้จึงเป็นแหล่งอ้างอิงเดียว
 * ว่าเอกสารชนิดหนึ่ง ๆ มีช่องอะไรบ้าง — ทั้ง store · ฟอร์ม · และการตรวจสอบใช้ตัวนี้
 */

import { DOC_SCHEMAS, type DocKind } from './documentSchemas';
import { PASSPORT_FIELD_ORDER } from './passportBookTypes';

/** ชื่อช่องทั้งหมดของเอกสารชนิดนี้ (ตามลำดับที่ควรแสดง) */
export function documentFieldKeys(kind: DocKind): readonly string[] {
  if (kind === 'passport') return PASSPORT_FIELD_ORDER;
  return DOC_SCHEMAS[kind].map((f) => f.key);
}

/**
 * ช่อง "เลขที่เอกสาร" ของแต่ละชนิด — ใช้ตรวจเลขซ้ำทั้งระบบ
 * (แต่ละชนิดเรียกชื่อช่องไม่เหมือนกัน จึงต้องแปลงที่นี่จุดเดียว)
 */
export function documentNumberFieldKey(kind: DocKind): string {
  switch (kind) {
    case 'passport': return 'passportNo';
    case 'id_card': return 'idNumber';
    case 'criminal_record': return 'documentNumber';
    default: return 'number'; // visa · tour_card
  }
}

/**
 * ช่องที่ต้องกรอกของแต่ละชนิด
 *
 * เอกสารประจำตัวยึด "เลขที่เอกสาร" เป็นตัวระบุ — ขาดไม่ได้
 * ส่วนกลุ่มแนบไฟล์ไม่บังคับช่องข้อความเลย เพราะสิ่งที่บังคับคือตัวไฟล์
 * (ฟอร์มตรวจการแนบไฟล์แยกต่างหาก ดู DocumentFormModal.validate)
 */
export function documentRequiredFieldKeys(kind: DocKind): readonly string[] {
  switch (kind) {
    case 'certificate':
    case 'criminal_record':
      return [];
    // ชนิดรวมทุกอย่าง — ชื่อเอกสารคือสิ่งเดียวที่บอกได้ว่าไฟล์ที่แนบคืออะไร
    case 'other':
      return ['docTitle'];
    default:
      return [documentNumberFieldKey(kind)];
  }
}

/** ช่องวันหมดอายุ — ทุกชนิดใช้ชื่อเดียวกัน แต่ผ่านฟังก์ชันนี้เพื่อไม่ต้องเดาในโค้ดอื่น */
export function documentExpiryFieldKey(): string {
  return 'expiryDate';
}

/** ช่องวันที่ออกเอกสาร */
export function documentIssueFieldKey(kind: DocKind): string {
  return kind === 'passport' ? 'issueDate' : 'issuedDate';
}
