/**
 * เคลียร์เงินกรุ๊ป — ผลการปิดเคลียร์ของแต่ละกรุ๊ป (รับเงินคืนจริงแยกสกุล · ผู้ปิด · ประวัติ)
 *
 * ยอดตั้งต้น (ในซอง / ส่งแลนด์ / ใช้ตามใบเสร็จ) คำนวณสดจากซองเงินและใบเสร็จเสมอ — ที่นี่เก็บเฉพาะสิ่งที่การเงินบันทึก
 * นัดหมายเคลียร์เงินอยู่ในชุดนัดหมายกลาง (appointmentStore · kind 'clear') — เห็นในปฏิทินเมนูนัดหมายด้วย
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'groupClearRecords';

export interface GroupClearEvent {
  at: string;
  by: string;
  action: 'close' | 'reopen';
  note?: string;
}

export const CLEAR_EVENT_LABEL: Record<GroupClearEvent['action'], string> = {
  close: 'ปิดการเคลียร์',
  reopen: 'เปิดใหม่',
};

/** วิธีปิดยอดค้าง — ไม่มีหักจากเบี้ยเลี้ยง (นโยบายบริษัท) · write_off = ตัดเป็นค่าใช้จ่าย ต้องมีผู้อนุมัติ */
export type FollowUpMethod = 'cash' | 'transfer' | 'write_off';
export const FOLLOW_UP_METHOD: Record<FollowUpMethod, string> = { cash: 'เงินสด', transfer: 'โอน', write_off: 'ตัดเป็นค่าใช้จ่าย' };

/** การชำระ 1 ครั้ง — จ่ายเป็นสกุลเดิม หรือเป็นบาท (กรอกอัตราแลกเปลี่ยน) · covered = ยอดที่ตัดในสกุลของยอดค้าง */
export interface FollowUpPayment {
  id: string;
  at: string;
  by: string;
  method: FollowUpMethod;
  paidCurrency: string;
  paidAmount: number;
  /** บาทต่อ 1 หน่วยสกุลของยอดค้าง — ใช้เมื่อจ่ายเป็นบาทแทนสกุลเดิม */
  fxRate?: number;
  covered: number;
  ref?: string;
  note?: string;
  /** ตัดเป็นค่าใช้จ่าย — ผู้อนุมัติ */
  approvedBy?: string;
}

/**
 * ยอดค้างติดตามหลังปิดเคลียร์ — แยกสกุล แยกทิศทาง
 *   leader_owes  = หัวหน้าทัวร์ค้างบริษัท (คืนไม่ครบ)
 *   company_owes = บริษัทค้างหัวหน้าทัวร์ (ใช้เกินซอง / คืนเกิน)
 */
export interface FollowUp {
  id: string;
  direction: 'leader_owes' | 'company_owes';
  reason: 'short_return' | 'over_spend' | 'over_return' | 'other';
  currency: string;
  amount: number;
  note?: string;
  createdAt: string;
  createdBy: string;
  payments: FollowUpPayment[];
}
export const FOLLOW_UP_REASON: Record<FollowUp['reason'], string> = {
  short_return: 'คืนเงินไม่ครบ',
  over_spend: 'ใช้เกินเงินในซอง',
  over_return: 'คืนเงินเกิน',
  other: 'อื่น ๆ',
};

export interface GroupClearRecord {
  periodId: string;
  /** เงินที่หัวหน้าทัวร์คืนจริงตอนเคลียร์ แยกสกุล (0 = ไม่ต้องคืน) */
  returned: { currency: string; amount: number }[];
  /** บริษัทจ่ายเพิ่มให้หัวหน้าทัวร์แล้ว (กรณีใช้เกินเงินในซอง) แยกสกุล */
  paidExtra?: { currency: string; amount: number }[];
  /** กรุ๊ปนี้ไม่มีเบี้ยเลี้ยง — ข้อ "เบี้ยเลี้ยงโอนแล้ว" ถือว่าผ่าน */
  noPerDiem?: boolean;
  /** complete = เช็กลิสต์ผ่านครบตอนปิด · partial = ปิดทั้งที่มีข้อค้าง (ต้องมีเหตุผล) */
  closeKind?: 'complete' | 'partial';
  partialReason?: string;
  /** ยอดค้างติดตาม (สร้างตอนปิดแบบมีค้าง / เพิ่มเอง) */
  followUps?: FollowUp[];
  note?: string;
  closedAt?: string;
  closedBy?: string;
  history: GroupClearEvent[];
}

export function loadGroupClears(): Record<string, GroupClearRecord> {
  const raw = readJson<Record<string, GroupClearRecord> | null>(KEY, null);
  return raw && typeof raw === 'object' ? raw : {};
}

export function saveGroupClear(rec: GroupClearRecord): Record<string, GroupClearRecord> {
  const all = { ...loadGroupClears(), [rec.periodId]: rec };
  writeJson(KEY, all);
  return all;
}
