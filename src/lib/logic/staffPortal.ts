/**
 * พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป — ตรรกะล้วน (ทดสอบได้ตรง ๆ)
 *
 * - ตารางงานของตัวเอง: งานส่งกรุ๊ปที่ถูกจัดให้ → วันที่ต้องไป (ก่อนวันเดินทาง 1 วันถ้าเครื่องออกเช้ามืด)
 *   เวลาถึงสนามบิน คำนวณใหม่จากเวลาเครื่องออกทุกครั้ง (ค่าที่เก็บตอนจัดเป็นแค่ snapshot)
 * - เบิกค่าส่งกรุ๊ป: งานที่คอนเฟิร์มแล้ว + ถึงวันไปส่งแล้ว + ยังไม่เคยเบิก (ใบที่ยกเลิก/ไม่อนุมัติไม่นับ)
 */

import { addDays } from '@/lib/format';
import { sendOffArrival } from '@/lib/logic/sendOffStaff';
import type { SendOffAssignStatus } from '@/lib/logic/sendOffStaff';
import type { ExpenseRequest } from '@/types';

/** ประเภทค่าใช้จ่ายหลักของใบเบิกเจ้าหน้าที่ส่งกรุ๊ป */
export const SEND_OFF_FEE_TYPE = 'ค่าส่งกรุ๊ป';
/** ค่าใช้จ่ายอื่นที่เบิกพร้อมกันได้ (แนบใบเสร็จ) */
export const SEND_OFF_EXTRA_TYPES = ['ค่าเดินทาง', 'ค่าทางด่วน', 'ค่าที่จอดรถ', 'อื่นๆ'] as const;

/** มาตรฐานค่าส่งกรุ๊ป (บาท/กรุ๊ป) — ผู้ดูแลระบบแก้ได้ที่ ตั้งค่าระบบ → ค่าส่งกรุ๊ป (sendOffFeeStore) */
export interface SendOffFeeRates {
  /** วันปกติ */
  normal: number;
  /** วันไปส่งตรงกับวันหยุด */
  holiday: number;
  /** true = เสาร์-อาทิตย์คิดอัตราวันหยุดด้วย · false = เฉพาะวันหยุดในเมนูวันหยุด */
  weekendAsHoliday: boolean;
}
export const DEFAULT_SEND_OFF_FEE_RATES: SendOffFeeRates = { normal: 900, holiday: 1200, weekendAsHoliday: false };
export const SEND_OFF_FEE_NORMAL = DEFAULT_SEND_OFF_FEE_RATES.normal;
export const SEND_OFF_FEE_HOLIDAY = DEFAULT_SEND_OFF_FEE_RATES.holiday;
/** ป้ายอัตราที่เก็บไว้ที่ line.note ของบรรทัดค่าส่งกรุ๊ป — ใช้แยกอัตราวันหยุดตอนแสดง/พิมพ์ (ยอดอาจเปลี่ยนตามมาตรฐานใหม่) */
export const SEND_OFF_HOLIDAY_NOTE = 'อัตราวันหยุด';

/** บรรทัดค่าส่งกรุ๊ปนี้คิดอัตราวันหยุดหรือไม่ — ใบใหม่ดูที่ note · ใบเก่า (ก่อนมี note) เทียบยอดกับอัตราวันหยุดเริ่มต้น */
export const isHolidayFeeLine = (l: { note?: string; amount: number }) =>
  l.note ? l.note.startsWith(SEND_OFF_HOLIDAY_NOTE) : l.amount === SEND_OFF_FEE_HOLIDAY;

/** ตรวจค่ามาตรฐานก่อนบันทึก — คืนข้อความผิดพลาด หรือ null ถ้าใช้ได้ */
export function validateSendOffFeeRates(r: SendOffFeeRates): string | null {
  if (!Number.isFinite(r.normal) || r.normal <= 0) return 'อัตราวันปกติต้องมากกว่า 0';
  if (!Number.isFinite(r.holiday) || r.holiday <= 0) return 'อัตราวันหยุดต้องมากกว่า 0';
  if (r.normal > 100_000 || r.holiday > 100_000) return 'อัตราสูงผิดปกติ (เกิน 100,000 บาท)';
  return null;
}

/**
 * ค่าส่งกรุ๊ปของงาน 1 งาน — ดูจาก "วันที่ไปส่งจริง" (dutyDate ซึ่งอาจเป็นก่อนวันเดินทาง 1 วัน)
 * holidayName = ชื่อวันหยุดของวันนั้น (null = ไม่ใช่วันหยุด) — ผู้เรียกหามาจาก holidayService (+ เสาร์-อาทิตย์ถ้าตั้งไว้)
 */
export function sendOffFee(
  holidayName: string | null,
  rates: SendOffFeeRates = DEFAULT_SEND_OFF_FEE_RATES,
): { amount: number; holiday: string | null } {
  return holidayName ? { amount: rates.holiday, holiday: holidayName } : { amount: rates.normal, holiday: null };
}

export interface DutyAssignment {
  assignmentId: string;
  periodId: string;
  staffId: string;
  dayOffset: number;
  status: SendOffAssignStatus;
}

export interface DutyPeriod {
  internalId: string;
  groupCode: string;
  displayName: string;
  startDate: string;
  endDate: string;
  departureAirportCode?: string | null;
  /** เวลาเครื่องออกเที่ยวแรก HH:MM */
  departureTime?: string | null;
  flightNo?: string | null;
}

export interface StaffDuty {
  assignmentId: string;
  periodId: string;
  period: DutyPeriod | null;
  /** วันที่ต้องไปสนามบิน (ISO) */
  dutyDate: string;
  /** เวลาต้องถึงสนามบิน HH:MM — null = ยังไม่รู้เวลาเครื่องออก */
  arrivalTime: string | null;
  flightTime: string | null;
  airport: string | null;
  confirmed: boolean;
}

export function staffDuties(opts: {
  assignments: DutyAssignment[];
  staffId: string;
  periodOf: (id: string) => DutyPeriod | null;
  manualTimes?: Record<string, string>;
  manualAirports?: Record<string, string>;
  leadHours?: number;
}): StaffDuty[] {
  return opts.assignments
    .filter((a) => a.staffId === opts.staffId)
    .map((a) => {
      const period = opts.periodOf(a.periodId);
      const flightTime = period?.departureTime || opts.manualTimes?.[a.periodId] || null;
      const arrival = flightTime ? sendOffArrival(flightTime, opts.leadHours) : null;
      const offset = arrival?.dayOffset ?? a.dayOffset;
      const start = period?.startDate ?? '';
      return {
        assignmentId: a.assignmentId,
        periodId: a.periodId,
        period,
        dutyDate: start && offset ? addDays(start, offset) : start,
        arrivalTime: arrival?.time ?? null,
        flightTime,
        airport: period?.departureAirportCode || opts.manualAirports?.[a.periodId] || null,
        confirmed: a.status === 'CONFIRMED',
      };
    })
    .sort((x, y) => x.dutyDate.localeCompare(y.dutyDate) || (x.arrivalTime ?? '').localeCompare(y.arrivalTime ?? ''));
}

const INACTIVE = new Set(['cancelled', 'rejected']);

/** ใบเบิกค่าส่งกรุ๊ปของเจ้าหน้าที่คนนี้ */
export function staffClaims(expenses: ExpenseRequest[], staffId: string): ExpenseRequest[] {
  return expenses
    .filter((e) => e.requesterKind === 'sendoff' && e.requesterId === staffId)
    .sort((a, b) => (b.submittedAt ?? b.requestedAt).localeCompare(a.submittedAt ?? a.requestedAt));
}

/**
 * กรุ๊ปที่เบิกค่าส่งกรุ๊ปไปแล้ว (ใบที่ยังมีผล) — ใบรายเดือนดูจาก line.periodId ของบรรทัดค่าส่งกรุ๊ป
 * ใบเดิม (1 ใบ = 1 กรุ๊ป) ไม่มี periodId ที่บรรทัด → ใช้ jobId ของใบ
 * บรรทัดที่บัญชีไม่อนุมัติไม่นับ — กรุ๊ปนั้นกลับมาเบิกใหม่ได้
 */
export function claimedPeriodIds(expenses: ExpenseRequest[], staffId: string): Set<string> {
  const out = new Set<string>();
  for (const e of staffClaims(expenses, staffId)) {
    if (INACTIVE.has(e.status)) continue;
    if (!e.claimMonth) {
      out.add(e.jobId);
      continue;
    }
    for (const l of e.lines) {
      if (l.expenseType === SEND_OFF_FEE_TYPE && l.periodId && !l.rejected) out.add(l.periodId);
    }
  }
  return out;
}

/** งานที่เบิกค่าส่งกรุ๊ปได้: คอนเฟิร์มแล้ว · ถึงวันไปส่งแล้ว · ยังไม่มีใบเบิกที่ยังมีผลของกรุ๊ปนี้ */
export function claimableDuties(duties: StaffDuty[], expenses: ExpenseRequest[], staffId: string, today: string): StaffDuty[] {
  const claimed = claimedPeriodIds(expenses, staffId);
  return duties.filter((d) => d.confirmed && d.dutyDate && d.dutyDate <= today && !claimed.has(d.periodId));
}

/** จัดงานที่รอเบิกเป็นรายเดือน (ตามวันไปส่ง) — เดือนเก่าก่อน · ใช้ทำใบเบิกค่าส่งกรุ๊ปเดือนละ 1 ใบ */
export function dutiesByMonth(duties: StaffDuty[]): { month: string; duties: StaffDuty[] }[] {
  const m = new Map<string, StaffDuty[]>();
  for (const d of duties) {
    const key = d.dutyDate.slice(0, 7);
    m.set(key, [...(m.get(key) ?? []), d]);
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([month, list]) => ({ month, duties: list }));
}
