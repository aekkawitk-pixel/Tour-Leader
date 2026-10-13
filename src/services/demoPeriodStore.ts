/**
 * พีเรียดตัวอย่างสำหรับ Demo (ตั้งค่าระบบ → โหลดข้อมูลตัวอย่าง) — ต่อท้ายชุดพีเรียดหลัก ไม่แทนที่
 *
 * ชุดพีเรียดหลัก (CSV / Zego) เป็นข้อมูลจริงที่จบทริปไปแล้วทั้งหมด จึงไม่มีกรุ๊ปก่อนเดินทาง/กำลังเดินทางให้สาธิต
 * การนำเข้า Zego แทนที่ทั้งชุด (ข้อมูลเดิมหาย) — จึงเก็บพีเรียดตัวอย่างแยกไว้ที่นี่ แล้ว tourPeriodMaster ต่อท้ายให้
 * internalId ขึ้นต้นด้วย DEMO- เสมอ — ลบข้อมูลตัวอย่างได้โดยไม่แตะข้อมูลจริง
 */

import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { readJson, writeJson } from './browserStorage';
import { bumpPeriodVersion } from './periodCacheBus';

const KEY = 'demoExtraPeriods';
export const DEMO_ID_PREFIX = 'DEMO-';

export function loadDemoPeriods(): TourPeriodMaster[] {
  const rows = readJson<unknown>(KEY, []);
  return Array.isArray(rows) ? (rows as TourPeriodMaster[]) : [];
}

export function saveDemoPeriods(rows: TourPeriodMaster[]): void {
  writeJson(KEY, rows);
  bumpPeriodVersion();
}

export function clearDemoPeriods(): void {
  writeJson(KEY, []);
  bumpPeriodVersion();
}
