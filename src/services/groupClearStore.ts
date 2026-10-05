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

export interface GroupClearRecord {
  periodId: string;
  /** เงินที่หัวหน้าทัวร์คืนจริงตอนเคลียร์ แยกสกุล (0 = ไม่ต้องคืน) */
  returned: { currency: string; amount: number }[];
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
