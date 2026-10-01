/**
 * แหล่งข้อมูลกลาง "ประวัติไกด์ถูกยกเลิกงาน" — คงอยู่ใน localStorage (Demo)
 *
 * ข้อมูลกลาง (ไม่ผูกกับผู้ใช้คนใดคนหนึ่ง) — เพื่อให้พนักงานทุกคนเห็นตรงกันว่าไกด์รายใด
 * เพิ่งถูกยกเลิกงาน ไม่ใช่รับรู้เฉพาะพนักงานที่ดูแลกรุ๊ปนั้น (ตามปัญหาที่ต้องแก้)
 *
 * ใช้ Key เดียวทุกจุด เหมือน leave-storage.ts:
 *   • ปลอดภัยกับ SSR/เบราว์เซอร์ที่ปิด localStorage
 *   • JSON.parse ปลอดภัย — ข้อมูลเสียไม่ทำหน้าพัง
 *   • ไม่เขียน Array ว่างทับข้อมูลเดิม (seed เฉพาะเมื่อยังไม่มี Key)
 *   • เขียนไม่สำเร็จ → โยน StorageWriteError พร้อมสาเหตุจริง
 */

import type { GuideCancellationRecord } from '@/types';
import { canUseStorage, writeJson } from './browserStorage';

export const GUIDE_CANCELLATION_STORAGE_KEY = 'guideCancellationRecords';

const SEED: GuideCancellationRecord[] = [];

/**
 * ล้างรายการเก่าที่เคยสร้างจากฝั่ง TourJob (jobId ขึ้นต้น "JOB-") ทิ้ง — ระบบไม่สร้างรายการแบบนี้แล้ว
 * (การระบุกรุ๊ปชดเชยทำที่ฝั่งจัดสเก็ตเท่านั้น) ข้อมูลเก่าที่ค้างใน localStorage จากก่อนแก้ไขจึงต้องล้างครั้งเดียว
 */
function pruneLegacyJobRecords(records: GuideCancellationRecord[]): GuideCancellationRecord[] {
  return records.filter((r) => !r.jobId.startsWith('JOB-'));
}

export function loadGuideCancellations(): GuideCancellationRecord[] {
  if (!canUseStorage()) return [...SEED];
  try {
    const raw = window.localStorage.getItem(GUIDE_CANCELLATION_STORAGE_KEY);
    if (raw === null) {
      try {
        window.localStorage.setItem(GUIDE_CANCELLATION_STORAGE_KEY, JSON.stringify(SEED));
      } catch { /* quota / โหมดส่วนตัว */ }
      return [...SEED];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...SEED];
    const records = parsed as GuideCancellationRecord[];
    const pruned = pruneLegacyJobRecords(records);
    if (pruned.length !== records.length) {
      try {
        window.localStorage.setItem(GUIDE_CANCELLATION_STORAGE_KEY, JSON.stringify(pruned));
      } catch { /* quota / โหมดส่วนตัว — คืนรายการที่ล้างแล้วในหน่วยความจำต่อไปได้ */ }
    }
    return pruned;
  } catch {
    return [...SEED];
  }
}

export function saveGuideCancellations(records: GuideCancellationRecord[]): void {
  writeJson(GUIDE_CANCELLATION_STORAGE_KEY, records);
}

/** เพิ่มรายการใหม่ (อ่านล่าสุดก่อน แล้วต่อท้าย ไม่ทับของคนอื่น) — คืน Array ใหม่ทั้งหมด */
export function addGuideCancellation(record: GuideCancellationRecord): GuideCancellationRecord[] {
  const all = loadGuideCancellations().filter((r) => r.id !== record.id);
  const next = [record, ...all];
  saveGuideCancellations(next);
  return next;
}

/** แก้ไขเฉพาะรายการ id ที่ตรง — รักษารายการอื่นไว้ทั้งหมด */
export function updateGuideCancellation(
  id: string,
  changes: Partial<GuideCancellationRecord>,
): GuideCancellationRecord[] {
  const next = loadGuideCancellations().map((r) => (r.id === id ? { ...r, ...changes } : r));
  saveGuideCancellations(next);
  return next;
}

/** สร้าง id ที่ไม่ซ้ำจากเลขลำดับท้าย id (รูปแบบ GC-2026-NNN) กันชนกับข้อมูลที่ persist ไว้ */
export function nextGuideCancellationId(records: GuideCancellationRecord[]): string {
  const max = records.reduce((m, r) => {
    const match = /(\d+)\s*$/.exec(r.id);
    const n = match ? parseInt(match[1], 10) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `GC-2026-${String(max + 1).padStart(3, '0')}`;
}
