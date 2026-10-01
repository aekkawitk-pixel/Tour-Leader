/**
 * Send-off Staff Leave Store — คำขอลาของเจ้าหน้าที่ส่งกรุ๊ป
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import type { SendOffLeaveRecord } from '@/lib/logic/sendOffStaffLeave';
import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffStaffLeave';

export function loadSendOffLeave(): SendOffLeaveRecord[] {
  return readJson<SendOffLeaveRecord[]>(KEY, []);
}

/** บันทึกทั้งชุด — เขียนไม่สำเร็จจะโยน StorageWriteError (UI ต้องไม่บอกว่าสำเร็จ) */
export function saveSendOffLeave(rows: SendOffLeaveRecord[]): SendOffLeaveRecord[] {
  writeJson(KEY, rows);
  return rows;
}

/** เพิ่มหรือแก้ไขทีละรายการ — คืนรายการชุดใหม่ */
export function upsertSendOffLeave(rec: SendOffLeaveRecord): SendOffLeaveRecord[] {
  const all = loadSendOffLeave();
  const exists = all.some((r) => r.id === rec.id);
  return saveSendOffLeave(exists ? all.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...all]);
}

/** อนุมัติ/ไม่อนุมัติคำขอ — บันทึกผู้ตัดสินและเวลาไว้ด้วย */
export function decideSendOffLeave(
  id: string,
  status: 'approved' | 'rejected',
  decidedBy: string,
  decisionNote?: string,
): SendOffLeaveRecord[] {
  const nowIso = new Date().toISOString();
  return saveSendOffLeave(
    loadSendOffLeave().map((r) => (r.id === id ? { ...r, status, decidedBy, decidedAt: nowIso, decisionNote } : r)),
  );
}

/** ยกเลิกคำขอ — ต่างจากปฏิเสธตรงที่เจ้าตัว/ผู้จัดถอนคำขอเอง ไม่ใช่ผู้จัดไม่อนุมัติ */
export function cancelSendOffLeave(id: string, cancelledBy: string): SendOffLeaveRecord[] {
  const nowIso = new Date().toISOString();
  return saveSendOffLeave(
    loadSendOffLeave().map((r) => (r.id === id ? { ...r, status: 'cancelled', decidedBy: cancelledBy, decidedAt: nowIso } : r)),
  );
}

/** รหัสถัดไปแบบต่อเนื่อง (SOL-001, SOL-002, …) */
export function nextSendOffLeaveId(rows: SendOffLeaveRecord[]): string {
  const max = rows.reduce((m, r) => {
    const n = Number(r.id.replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `SOL-${String(max + 1).padStart(3, '0')}`;
}
