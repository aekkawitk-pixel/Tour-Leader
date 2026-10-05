/**
 * ล้างข้อมูลทดสอบ — เริ่มทดสอบขั้นตอนใหม่ตั้งแต่ต้นจนจบ (ตั้งค่าระบบ → ล้างข้อมูลทดสอบ)
 *
 * ล้างเฉพาะ "รายการที่เกิดจากการใช้งาน" (ทรานแซกชัน) · เก็บข้อมูลหลัก / ตั้งค่าไว้ทั้งหมด
 *   (หัวหน้าทัวร์ · สัญญา / เอกสาร · อัตราเบี้ยเลี้ยง · เรทค่าส่งกรุ๊ป / ทิป · Period Master · เจ้าหน้าที่ส่งกรุ๊ป · กฎ)
 * เอกสารเบิกค่าใช้จ่ายกรุ๊ป (ใบเบิกเงินทดรองที่นำเข้า) เป็นต้นทางของงาน — ไม่ล้าง
 * การจัดงาน (หัวหน้าทัวร์ลงกรุ๊ป / เจ้าหน้าที่ส่งกรุ๊ป) เลือกได้ว่าจะล้างด้วยหรือไม่
 */

import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { readJson, writeJson } from './browserStorage';
import { clearEnvelopes } from './cashEnvelopeStore';
import { clearSavedExpenses, loadSavedExpenses } from './expenseStore';

export type ResetGroupKey = 'envelopes' | 'expenses' | 'appointments' | 'clears' | 'leaderAssign' | 'sendOffAssign';

export interface ResetGroup {
  key: ResetGroupKey;
  label: string;
  detail: string;
  /** true = เลือกได้ (ค่าเริ่มต้นไม่ล้าง) */
  optional?: boolean;
  count: () => number;
  clear: () => Promise<void> | void;
}

const len = (key: string) => {
  const v = readJson<unknown>(key, []);
  return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
};
const activeLen = (key: string) => {
  const v = readJson<unknown>(key, []);
  return Array.isArray(v) ? v.filter((r) => !(r as { removedAt?: string }).removedAt).length : 0;
};

export const RESET_GROUPS: ResetGroup[] = [
  {
    key: 'envelopes',
    label: 'ซองเงิน',
    detail: 'การจัดซอง ปิดซอง ส่งมอบ รับซอง ฝากซอง ส่งแลนด์ + รูปหลักฐาน · รายการ "ไม่จัดซอง"',
    count: () => len('cashEnvelopes') + len('cashEnvelopeNone'),
    clear: () => clearEnvelopes(),
  },
  {
    key: 'expenses',
    label: 'ใบเสร็จ / ใบเบิก',
    detail: 'ใบเสร็จค่าใช้จ่าย ใบเบิกเบี้ยเลี้ยง ค่าส่งกรุ๊ป ฯลฯ + รูปหลักฐาน · เอกสารเบิกค่าใช้จ่ายกรุ๊ปยังอยู่',
    count: () => loadSavedExpenses().filter((e) => !isGroupAdvanceDoc(e)).length,
    clear: async () => { await clearSavedExpenses(isGroupAdvanceDoc); },
  },
  {
    key: 'appointments',
    label: 'นัดหมาย',
    detail: 'นัดเคลียร์เงิน / นัดส่งเอกสาร ทั้งหมดในปฏิทิน',
    count: () => len('appointments'),
    clear: () => writeJson('appointments', []),
  },
  {
    key: 'clears',
    label: 'เคลียร์เงินกรุ๊ป',
    detail: 'ผลการเคลียร์ (รับคืน / จ่ายเพิ่ม / ปิด) และยอดค้างติดตามทั้งหมด',
    count: () => len('groupClearRecords'),
    clear: () => writeJson('groupClearRecords', {}),
  },
  {
    key: 'leaderAssign',
    label: 'การจัดหัวหน้าทัวร์ลงกรุ๊ป',
    detail: 'ล้างด้วย = ทดสอบได้ตั้งแต่ขั้นจัดหัวหน้าทัวร์ · รวมประวัติการจัดและการยกเลิกงาน',
    optional: true,
    count: () => activeLen('guidePeriodAssignments'),
    clear: () => {
      writeJson('guidePeriodAssignments', []);
      writeJson('guidePeriodAssignmentAudit', []);
      writeJson('guideCancellationRecords', []);
    },
  },
  {
    key: 'sendOffAssign',
    label: 'การจัดเจ้าหน้าที่ส่งกรุ๊ป',
    detail: 'งานส่งกรุ๊ปที่จัดให้เจ้าหน้าที่ (ตัวเจ้าหน้าที่และเรทค่าส่งกรุ๊ปยังอยู่)',
    optional: true,
    count: () => len('sendOffAssignments'),
    clear: () => writeJson('sendOffAssignments', []),
  },
];

/** ล้างตามกลุ่มที่เลือก — เรียงทำทีละกลุ่ม ผิดพลาดกลุ่มไหนโยน error ออกไป (กลุ่มก่อนหน้าล้างไปแล้ว) */
export async function resetTestData(keys: ResetGroupKey[]): Promise<void> {
  for (const g of RESET_GROUPS) if (keys.includes(g.key)) await g.clear();
}
