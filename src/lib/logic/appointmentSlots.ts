/**
 * ช่องเวลานัดหมาย — นัดห่างกันช่วงละ 30 นาที (ตรงตามที่หน้างานใช้จริง)
 *
 * เวลาทำการ 09:00–17:00 → เริ่มนัดได้ 09:00, 09:30, … 16:30 · ระยะเวลาเริ่มต้น 30 นาที (1 ช่อง)
 * ช่องที่มีนัดแล้ว (นัดที่ยังไม่ยกเลิก/ไม่ใช่นัดที่กำลังแก้) แจ้งไว้ในตัวเลือก — ค่าเริ่มต้นเลือกช่องว่างช่องแรก
 */

import type { Appointment } from '@/types';
import { hasTimeOverlap } from './conflicts';

export const SLOT_MINUTES = 30;
export const DAY_START = '09:00';
export const DAY_END = '17:00';
/** ระยะเวลาที่เลือกได้ — ทวีคูณของช่อง 30 นาที */
export const SLOT_DURATIONS = [30, 60, 90, 120];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** เวลาเริ่มทุกช่องของวัน (09:00 … 16:30) */
export function daySlots(): string[] {
  const out: string[] = [];
  for (let m = toMin(DAY_START); m + SLOT_MINUTES <= toMin(DAY_END); m += SLOT_MINUTES) out.push(toTime(m));
  return out;
}

/** นัดที่ชนกับช่องนี้ (วันเดียวกัน · ยังไม่ยกเลิก · ไม่นับนัดที่กำลังแก้) */
export function slotConflicts(appointments: Appointment[], date: string, time: string, duration: number, excludeId?: string): Appointment[] {
  return appointments.filter((a) => a.id !== excludeId && a.status !== 'cancelled' && a.date === date
    && hasTimeOverlap(date, time, duration, a.date, a.time, a.durationMinutes));
}

/** ตัวเลือกช่องเวลา พร้อมป้าย "มีนัดแล้ว N" · เวลาเดิมที่ไม่ตรงช่อง (นัดเก่า) ใส่ไว้ด้วยให้แก้ได้ */
export function slotOptions(appointments: Appointment[], date: string, duration: number, excludeId?: string, current?: string) {
  const slots = daySlots();
  if (current && !slots.includes(current)) slots.push(current);
  return slots.sort().map((t) => {
    const n = slotConflicts(appointments, date, t, duration, excludeId).length;
    return { value: t, label: `${t}–${toTime(toMin(t) + duration)} น.${n > 0 ? ` · มีนัดแล้ว ${n}` : ''}`, busy: n > 0 };
  });
}

/** ช่องว่างช่องแรกของวัน (ไม่มีว่าง = ช่องแรกของวัน) */
export function firstFreeSlot(appointments: Appointment[], date: string, duration: number, excludeId?: string): string {
  return slotOptions(appointments, date, duration, excludeId).find((o) => !o.busy)?.value ?? DAY_START;
}
