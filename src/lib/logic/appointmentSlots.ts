/**
 * ช่องเวลานัดหมาย — ญี่ปุ่นช่วงละ 30 นาที · ประเทศอื่นช่วงละ 10 นาที (คนละคิว ดู ClearLane)
 *
 * เวลารับนัด เช้า 09:00–12:00 · บ่าย 13:00–18:00 (พักเที่ยง 12:00–12:59) → ญี่ปุ่นเริ่มนัดได้ 09:00, 09:30, … 17:30 · ระยะเวลาเริ่มต้น 30 นาที (1 ช่อง)
 * ช่องที่มีนัดแล้ว (นัดที่ยังไม่ยกเลิก/ไม่ใช่นัดที่กำลังแก้) แจ้งไว้ในตัวเลือก — ค่าเริ่มต้นเลือกช่องว่างช่องแรก
 */

import type { Appointment } from '@/types';
import { hasTimeOverlap } from './conflicts';

export const SLOT_MINUTES = 30;
export const DAY_START = '09:00';
export const DAY_END = '18:00';
/** ระยะเวลาที่เลือกได้ — ทวีคูณของช่อง 30 นาที */
export const SLOT_DURATIONS = [10, 30, 60, 90, 120];

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/*
  คิวเคลียร์เงินแยก 2 ช่อง (เจ้าหน้าที่คนละคน รับกรุ๊ปซ้อนเวลากันได้ระหว่างช่อง)
    ญี่ปุ่น      — นัดละ 30 นาที (09:00, 09:30, …)
    ประเทศอื่น   — นัดละ 10 นาที (09:00, 09:10, …)
  นัดชนกันเฉพาะในช่องเดียวกัน — ผู้เรียกคัดนัดให้เหลือช่องเดียวกันก่อน (appointmentLane.ts) แล้วค่อยส่งเข้าฟังก์ชันในไฟล์นี้
*/
export type ClearLane = 'japan' | 'other';
export const LANE_DURATION: Record<ClearLane, number> = { japan: 30, other: 10 };
export const LANE_LABEL: Record<ClearLane, string> = { japan: 'ญี่ปุ่น', other: 'ประเทศอื่น' };
/** ประเทศของกรุ๊ป → ช่องคิว (ข้อมูลกรุ๊ปใช้ชื่ออังกฤษตัวใหญ่ เช่น JAPAN · รองรับชื่อไทยด้วย) */
export function laneOfCountry(country: string | null | undefined): ClearLane {
  return /japan|ญี่ปุ่น/i.test(country ?? '') ? 'japan' : 'other';
}
/** ระยะห่างของช่องเวลา — นัดสั้นกว่า 30 นาที (ประเทศอื่น 10 นาที) ใช้ช่องละเท่าความยาวนัด */
export function slotStep(duration: number): number {
  return duration > 0 && duration < SLOT_MINUTES ? duration : SLOT_MINUTES;
}

/** พักเที่ยง 12:00–12:59 — ไม่รับนัด (ช่องที่เริ่มหรือคร่อมช่วงนี้ไม่เสนอให้เลือก) */
export const LUNCH_START = '12:00';
export const LUNCH_END = '13:00';
/** ช่วงนัด [start, start+duration) คร่อมพักเที่ยงหรือไม่ */
export function overlapsLunch(time: string, duration: number): boolean {
  const s = toMin(time);
  return s < toMin(LUNCH_END) && s + duration > toMin(LUNCH_START);
}

/** เวลาเริ่มทุกช่องของวัน (เว้นพักเที่ยง) — step 30 = 09:00 … 11:30, 13:00 … 17:30 · step 10 = 09:00 … 11:50, 13:00 … 17:50 */
export function daySlots(step: number = SLOT_MINUTES): string[] {
  const out: string[] = [];
  for (let m = toMin(DAY_START); m + step <= toMin(DAY_END); m += step) {
    if (!overlapsLunch(toTime(m), step)) out.push(toTime(m));
  }
  return out;
}

/** นัดที่ชนกับช่องนี้ (วันเดียวกัน · ยังไม่ยกเลิก · ไม่นับนัดที่กำลังแก้) */
export function slotConflicts(appointments: Appointment[], date: string, time: string, duration: number, excludeId?: string): Appointment[] {
  return appointments.filter((a) => a.id !== excludeId && a.status !== 'cancelled' && a.date === date
    && hasTimeOverlap(date, time, duration, a.date, a.time, a.durationMinutes));
}

/**
 * ตัวเลือกช่องเวลา พร้อมป้าย "มีนัดแล้ว N" · เวลาเดิมที่ไม่ตรงช่อง (นัดเก่า) ใส่ไว้ด้วยให้แก้ได้
 * capacity = จำนวนเจ้าหน้าที่ของคิวในวันนั้น — ช่องเต็มเมื่อนัดที่ทับช่องนี้ครบจำนวนคน (left = รับได้อีกกี่กรุ๊ป)
 */
export function slotOptions(appointments: Appointment[], date: string, duration: number, excludeId?: string, current?: string, capacity = 1) {
  // นัดยาว (เช่น 60 นาที) ที่เริ่มก่อนเที่ยงแล้วคร่อมพักเที่ยง ก็ไม่เสนอ
  const slots = daySlots(slotStep(duration)).filter((t) => !overlapsLunch(t, duration));
  if (current && !slots.includes(current)) slots.push(current);
  return slots.sort().map((t) => {
    const n = slotConflicts(appointments, date, t, duration, excludeId).length;
    const left = Math.max(0, capacity - n);
    const tag = n === 0 ? '' : capacity > 1 ? ` · มีนัดแล้ว ${n}/${capacity}` : ` · มีนัดแล้ว ${n}`;
    return { value: t, label: `${t}–${toTime(toMin(t) + duration)} น.${tag}`, busy: left === 0, left };
  });
}

/** ช่องที่ยังรับได้ของวัน — ใช้ตอนขอนัด/เลื่อนนัด: เลือกได้เฉพาะเวลาที่ฝ่ายบัญชีว่าง · excludeId = นัดที่กำลังเลื่อน (ช่องเดิมของมันนับว่าว่าง) */
export function freeSlots(appointments: Appointment[], date: string, duration: number, excludeId?: string, capacity = 1): string[] {
  return slotOptions(appointments, date, duration, excludeId, undefined, capacity).filter((o) => !o.busy).map((o) => o.value);
}

/**
 * วันที่ฝ่ายบัญชีรับนัดได้ — วันทำงานถัดจาก `from` (ไม่รวม from) ที่ยังมีช่องว่าง เรียงตามวัน
 * isWorkday มาจากผู้เรียก (dayTypeOf + วันหยุดในเมนูวันหยุด) — ไฟล์นี้ไม่ผูกกับที่เก็บวันหยุด
 */
export function bookableDays(
  appointments: Appointment[],
  from: string,
  count: number,
  duration: number,
  isWorkday: (iso: string) => boolean,
  excludeId?: string,
  /** จำนวนเจ้าหน้าที่ของคิวในแต่ละวัน — ไม่ส่ง = 1 คน · 0 = วันนั้นไม่รับนัด */
  capacityOf: (iso: string) => number = () => 1,
): { date: string; free: string[]; left: Record<string, number>; capacity: number }[] {
  const out: { date: string; free: string[]; left: Record<string, number>; capacity: number }[] = [];
  const d = new Date(`${from}T00:00:00`);
  // มองไปข้างหน้าไม่เกิน 60 วัน — กันวนไม่จบถ้าช่วงนั้นเต็มหมด
  for (let i = 0; i < 60 && out.length < count; i++) {
    d.setDate(d.getDate() + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!isWorkday(iso)) continue;
    const capacity = capacityOf(iso);
    if (capacity <= 0) continue;
    const opts = slotOptions(appointments, iso, duration, excludeId, undefined, capacity).filter((o) => !o.busy);
    if (opts.length > 0) out.push({ date: iso, free: opts.map((o) => o.value), left: Object.fromEntries(opts.map((o) => [o.value, o.left])), capacity });
  }
  return out;
}

/** ช่วงของวัน — เช้า 09:00–12:00 · บ่าย 13:00–18:00 (พักเที่ยง 12:00–12:59 ไม่รับนัด) (นัดก่อน 09:00 นับเช้า · หลัง 18:00 นับบ่าย) */
export type DayPeriod = 'morning' | 'afternoon';
export const DAY_PERIODS: { key: DayPeriod; label: string; range: string }[] = [
  { key: 'morning', label: 'เช้า', range: '09.00–12.00' },
  { key: 'afternoon', label: 'บ่าย', range: '13.00–18.00' },
];
export function periodOf(time: string): DayPeriod {
  return toMin(time) <= toMin('12:00') ? 'morning' : 'afternoon';
}

/** ช่องว่างช่องแรกของวัน (ไม่มีว่าง = ช่องแรกของวัน) */
export function firstFreeSlot(appointments: Appointment[], date: string, duration: number, excludeId?: string, capacity = 1): string {
  return slotOptions(appointments, date, duration, excludeId, undefined, capacity).find((o) => !o.busy)?.value ?? DAY_START;
}

/** นัดที่ยังรอเข้าพบ (ยังไม่เข้าพบ / ไม่ยกเลิก) */
const WAITING: ReadonlySet<Appointment['status']> = new Set(['pending', 'confirmed', 'rescheduled']);

/** เคลียร์เสร็จก่อนเวลานัดจบหรือไม่ — วันเดียวกับนัด และตอนนี้ยังไม่ถึงเวลาจบ (now = 'YYYY-MM-DDTHH:mm') */
export function finishedEarly(a: Pick<Appointment, 'date' | 'time' | 'durationMinutes'>, now: string): boolean {
  if (now.slice(0, 10) !== a.date) return false;
  return toMin(now.slice(11, 16)) < toMin(a.time) + a.durationMinutes;
}

/**
 * คิวถัดไปของวันเดียวกันในคิวเดียวกัน (ญี่ปุ่น / ประเทศอื่น) — ใช้ "เรียกคนถัดไป" เมื่อเคลียร์เสร็จก่อนเวลา
 * laneOf ส่งมาจากผู้เรียก (appointmentLane.ts) ไฟล์นี้จึงยังไม่ต้องอ่านข้อมูลกรุ๊ป
 * นัดที่มีเจ้าหน้าที่จองแล้ว (ถูกเรียก / กำลังทำ) ข้ามไป · เรียงตามเวลานัด
 */
export function nextInQueue<A extends Appointment>(appointments: A[], done: Appointment, laneOf: (a: Appointment) => string): A | null {
  const lane = laneOf(done);
  return appointments
    .filter((a) => a.id !== done.id && a.date === done.date && WAITING.has(a.status) && !isClaimed(a)
      && toMin(a.time) >= toMin(done.time) && laneOf(a) === lane)
    .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null;
}

/** มีเจ้าหน้าที่จองนัดนี้แล้ว — ถูกเรียกเข้าพบ หรือกำลังเคลียร์อยู่ (คนอื่นห้ามเรียกซ้ำ) */
export function isClaimed(a: Pick<Appointment, 'calledEarly' | 'inProgress'>): boolean {
  return !!a.calledEarly || !!a.inProgress;
}

/** งานที่เจ้าหน้าที่คนนี้ถืออยู่วันนี้ (เรียกแล้วรอเข้าพบ / กำลังเคลียร์) — ทีละกรุ๊ปต่อคน */
export function myCurrentJob<A extends Appointment>(appointments: A[], today: string, me: string): A | null {
  return appointments.find((a) => a.date === today && WAITING.has(a.status)
    && (a.inProgress?.by === me || (!a.inProgress && a.calledEarly?.by === me))) ?? null;
}

/**
 * คิวที่รอเรียกของวันนี้ในคิวที่เจ้าหน้าที่คนนี้รับ (ญี่ปุ่น / ประเทศอื่น / ทั้งสอง) — ยังไม่มีใครจอง เรียงตามเวลานัด
 * ตัวแรก = คนที่ปุ่ม "เรียกคิวถัดไป" จะเรียก · เจ้าหน้าที่หลายคนในคิวเดียวกันกดได้คนละคน ไม่ชนกัน
 */
export function waitingQueue<A extends Appointment>(appointments: A[], today: string, lanes: readonly string[], laneOf: (a: Appointment) => string): A[] {
  return appointments
    .filter((a) => a.date === today && a.kind === 'clear' && WAITING.has(a.status) && !isClaimed(a) && lanes.includes(laneOf(a)))
    .sort((a, b) => a.time.localeCompare(b.time));
}
