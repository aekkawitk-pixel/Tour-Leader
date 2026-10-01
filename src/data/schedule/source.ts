/**
 * CSV Loader / Data Source — แหล่งข้อมูลกลางของพีเรียด
 *
 * ปัจจุบันอ่านจาก seed ที่แปลงมาจากไฟล์ CSV (periods.seed.ts)
 * ออกแบบให้เปลี่ยนไปดึงจาก REST API ได้ที่ "จุดเดียว" — เพียงแก้ฟังก์ชันนี้ (เช่น ทำเป็น async fetch)
 * โดยไม่ต้องแก้ Normalizer / Sale Status Mapper / Schedule Table
 */

import { rawPeriods } from './periods.seed';
import { normalizePeriod } from './normalize';
import type { RawPeriod, SchedulePeriod } from './types';

/** ข้อมูลดิบทั้งหมด (642 พีเรียด) */
export function getRawPeriods(): RawPeriod[] {
  return rawPeriods;
}

/** ข้อมูลพร้อมแสดง (normalize แล้ว) — เติม internalId ที่ไม่ซ้ำ (Group Code อาจซ้ำได้ §27) */
export function getSchedulePeriods(): SchedulePeriod[] {
  return getRawPeriods().map((raw, i) => {
    const p = normalizePeriod(raw);
    return { ...p, internalId: `${p.tourCode}-${p.programCode ?? ''}-${p.startDate}-${i}` };
  });
}
