/**
 * จำนวนเจ้าหน้าที่ต่อคิวเคลียร์เงิน — ช่องเวลาหนึ่งรับนัดได้เท่าจำนวนคนในคิวนั้น
 *   ค่าปกติ (ทุกวัน) + กำหนดรายวัน (พีค / มีคนลา) · ค่ารายวันทับค่าปกติเฉพาะคิวที่ระบุ
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import type { ClearLane } from '@/lib/logic/appointmentSlots';
import { readJson, writeJson } from './browserStorage';

export type LaneCapacity = Record<ClearLane, number>;
export interface ClearCapacitySettings {
  default: LaneCapacity;
  /** วันที่ (YYYY-MM-DD) → จำนวนคนของคิวที่กำหนดไว้ (ไม่ระบุคิวไหน = ใช้ค่าปกติ) */
  byDate: Record<string, Partial<LaneCapacity>>;
}

const KEY = 'clearLaneCapacity';
export const CLEAR_CAPACITY_EVENT = 'clear-capacity-changed';
const DEFAULT: ClearCapacitySettings = { default: { japan: 1, other: 1 }, byDate: {} };

export function loadClearCapacity(): ClearCapacitySettings {
  const raw = readJson<Partial<ClearCapacitySettings> | null>(KEY, null);
  return {
    default: { ...DEFAULT.default, ...(raw?.default ?? {}) },
    byDate: raw?.byDate ?? {},
  };
}

export function saveClearCapacity(s: ClearCapacitySettings): void {
  // ล้างวันที่ไม่มีค่าเหลือ — ไม่ให้รายการรายวันรกด้วยวันว่าง
  const byDate = Object.fromEntries(Object.entries(s.byDate).filter(([, v]) => Object.keys(v).length > 0));
  writeJson(KEY, { default: s.default, byDate });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLEAR_CAPACITY_EVENT));
}

/** จำนวนเจ้าหน้าที่ของคิวในวันนั้น (0 = วันนั้นคิวนี้ไม่รับนัด) */
export function capacityOf(s: ClearCapacitySettings, date: string, lane: ClearLane): number {
  return s.byDate[date]?.[lane] ?? s.default[lane];
}
