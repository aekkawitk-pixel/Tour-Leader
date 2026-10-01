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

/** งานที่เบิกค่าส่งกรุ๊ปได้: คอนเฟิร์มแล้ว · ถึงวันไปส่งแล้ว · ยังไม่มีใบเบิกที่ยังมีผลของกรุ๊ปนี้ */
export function claimableDuties(duties: StaffDuty[], expenses: ExpenseRequest[], staffId: string, today: string): StaffDuty[] {
  const claimed = new Set(staffClaims(expenses, staffId).filter((e) => !INACTIVE.has(e.status)).map((e) => e.jobId));
  return duties.filter((d) => d.confirmed && d.dutyDate && d.dutyDate <= today && !claimed.has(d.periodId));
}
