/**
 * เพดานจำนวนกรุ๊ปสูงสุดต่อเดือน — ตั้งแยกได้ต่อคนและต่อเดือน (เฉพาะเดือนนั้น ๆ เท่านั้น)
 *
 * จงใจไม่มีค่าเริ่มต้นข้ามเดือน — เดือนที่ไม่เคยตั้งไว้ = ไม่จำกัดเสมอ ไม่สืบทอดจากเดือนก่อนหน้า
 * เพราะจำนวนกรุ๊ปที่แต่ละคนรับไหวเปลี่ยนไปทุกเดือนตามภาระงานจริง ไม่ใช่ค่าคงที่ประจำตัว
 * ตั้ง/แก้ได้ตรงจากตารางจัดสเก็ต (กดที่ตัวเลข "X/Y กรุ๊ป" ข้างชื่อ) ไม่ต้องออกไปหน้าเจ้าหน้าที่
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffMonthlyCaps';

/** "{staffId}:{yyyy-mm}" → เพดานของเดือนนั้น */
export type MonthlyCaps = Record<string, number>;

function capKey(staffId: string, monthStart: string): string {
  return `${staffId}:${monthStart.slice(0, 7)}`;
}

export function loadMonthlyCaps(): MonthlyCaps {
  const parsed = readJson<MonthlyCaps | null>(KEY, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** เพดานของคนนี้ในเดือนนี้ — ไม่เคยตั้งไว้ = null (ไม่จำกัด) */
export function monthlyCapFor(caps: MonthlyCaps, staffId: string, monthStart: string): number | null {
  const v = caps[capKey(staffId, monthStart)];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** ตั้งเพดานของคนนี้ในเดือนนี้ — ค่าว่าง/null/ไม่ใช่จำนวนเต็มไม่ติดลบ = ล้างเพดาน (กลับเป็นไม่จำกัด) */
export function setMonthlyCap(staffId: string, monthStart: string, value: number | null): MonthlyCaps {
  const rows = { ...loadMonthlyCaps() };
  const key = capKey(staffId, monthStart);
  if (value === null || !Number.isFinite(value) || value < 0) delete rows[key];
  else rows[key] = Math.round(value);
  writeJson(KEY, rows);
  return rows;
}
