/**
 * Send-off Staff Store — เจ้าหน้าที่ส่งกรุ๊ป
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * ครั้งแรกที่ยังไม่มีข้อมูลจะใช้ชุดตัวอย่างจาก data/sendOffStaff.ts
 */

import { sendOffStaffSeed } from '@/data/sendOffStaff';
import { EMPTY_ID_CARD, type SendOffStaff, type SendOffStaffStatus } from '@/lib/logic/sendOffStaff';
import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffStaff';

/**
 * รายชื่อทั้งหมด (รวมคนที่ไม่ได้ใช้งาน) — ยังไม่เคยบันทึก = ชุดตัวอย่าง
 * ข้อมูลที่บันทึกไว้ก่อนเปลี่ยนเป็น 3 สถานะ ยังเป็น active: boolean → แปลงให้ตอนอ่าน
 * ไม่งั้นสถานะจะกลายเป็นค่าว่างและทุกคนหลุดจากการถูกเลือก
 */
export function loadSendOffStaff(): SendOffStaff[] {
  const parsed = readJson<(SendOffStaff & { active?: boolean })[] | null>(KEY, null);
  if (!Array.isArray(parsed)) return sendOffStaffSeed;
  return parsed.map((s) => ({
    ...s,
    status: s.status ?? (s.active === false ? 'disabled' : 'active'),
    // ข้อมูลเก่าไม่มีช่องชื่ออังกฤษ/รหัสเขตปกครอง — เติมค่าว่างให้ ไม่ให้ฟอร์มพังเพราะอ่านค่าไม่เจอ
    idCard: { ...EMPTY_ID_CARD, ...s.idCard },
    // ข้อมูลเก่าไม่มีบัญชีธนาคาร (เพิ่มทีหลัง) — เติมอาเรย์ว่างให้ ไม่ให้ตัวแก้ไขบัญชีพัง
    bankAccounts: s.bankAccounts ?? [],
  }) as SendOffStaff);
}

/** บันทึกทั้งชุด — เขียนไม่สำเร็จจะโยน StorageWriteError (UI ต้องไม่บอกว่าสำเร็จ) */
export function saveSendOffStaff(rows: SendOffStaff[]): SendOffStaff[] {
  writeJson(KEY, rows);
  return rows;
}

/** เพิ่มหรือแก้ไขทีละคน — คืนรายชื่อชุดใหม่ */
export function upsertSendOffStaff(staff: SendOffStaff): SendOffStaff[] {
  const all = loadSendOffStaff();
  const exists = all.some((s) => s.id === staff.id);
  return saveSendOffStaff(exists ? all.map((s) => (s.id === staff.id ? staff : s)) : [...all, staff]);
}

/**
 * เปลี่ยนสถานะ — ไม่ลบทิ้ง
 * ประวัติการส่งกรุ๊ปที่ผ่านมายังต้องอ้างถึงคนนี้ได้ ลบแล้วรายงานย้อนหลังจะพัง
 */
export function setSendOffStaffStatus(id: string, status: SendOffStaffStatus): SendOffStaff[] {
  return saveSendOffStaff(loadSendOffStaff().map((s) => (s.id === id ? { ...s, status } : s)));
}

/** รหัสถัดไปแบบต่อเนื่อง (SOS-001, SOS-002, …) */
export function nextSendOffStaffId(rows: SendOffStaff[]): string {
  const max = rows.reduce((m, s) => {
    const n = Number(s.id.replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `SOS-${String(max + 1).padStart(3, '0')}`;
}
