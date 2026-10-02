/**
 * Zego Import Store — โปรแกรม/พีเรียดที่ "กดนำเข้า" มาจาก Zego API
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 *
 * เหตุที่เก็บไว้แทนการยิง API ทุกครั้งที่เปิดหน้า:
 *   • ใช้งานต่อได้แม้ API ล่ม และรู้ชัดว่ากำลังดูข้อมูล ณ เวลาไหน
 *   • ไม่ยิง API ซ้ำโดยไม่จำเป็นทุกครั้งที่สลับหน้า
 */

import type { ZegoPeriod, ZegoProgram } from '@/data/zego/types';
import { readJson, writeJson } from './browserStorage';
import { bumpPeriodVersion } from '@/services/periodCacheBus';

const KEY = 'zegoImportedPrograms';

export interface ZegoImportSnapshot {
  /** เวลาที่กดนำเข้า (ISO ฝั่งเครื่องผู้ใช้) */
  importedAt: string;
  /** เวลาที่ Zego แจ้งว่าข้อมูลถูกแก้ล่าสุด — null = ยังไม่ได้ถาม/ถามไม่สำเร็จ */
  sourceUpdatedAt: string | null;
  /** ขอบเขตที่ดึง เช่น "ทั้งหมด" หรือ "ประเทศ JP" — ไว้บอกว่าข้อมูลชุดนี้ครอบคลุมแค่ไหน */
  scope: string;
  programs: ZegoProgram[];
  periods: ZegoPeriod[];
  /** รายการที่แปลงไม่ได้ตอนนำเข้า */
  skipped: string[];
}

/** ข้อมูลที่นำเข้าไว้ล่าสุด — null = ยังไม่เคยนำเข้า */
export function loadZegoImport(): ZegoImportSnapshot | null {
  const parsed = readJson<ZegoImportSnapshot | null>(KEY, null);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.programs) || !Array.isArray(parsed.periods)) return null;
  return parsed;
}

/** บันทึกผลการนำเข้า — เขียนไม่สำเร็จจะโยน StorageWriteError (UI ต้องไม่บอกว่าสำเร็จ) */
export function saveZegoImport(snapshot: ZegoImportSnapshot): void {
  writeJson(KEY, snapshot);
  bumpPeriodVersion();
}

/** ล้างข้อมูลที่นำเข้า — ระบบกลับไปใช้ข้อมูลตัวอย่างเดิม */
export function clearZegoImport(): void {
  writeJson(KEY, null);
  bumpPeriodVersion();
}
