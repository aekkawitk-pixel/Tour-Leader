/**
 * งานไปส่งกรุ๊ป — ตัวกลางระหว่าง "พีเรียด" กับ "เจ้าหน้าที่ที่ถูกจัด"
 *
 * แยกออกมาจากหน้าจอเพราะมีสองมุมมองที่ต้องใช้ชุดเดียวกัน
 *   • ตารางจัดเจ้าหน้าที่ส่งกรุ๊ป (รายเดือน มองจากคน)
 *   • มุมมองรายกรุ๊ป (มองจากกรุ๊ป เทียบกับหัวหน้าทัวร์)
 * ถ้าปล่อยให้แต่ละหน้าคำนวณเอง เลขจะไม่ตรงกันเมื่อกติกาเปลี่ยน
 */

import { addDays } from '@/lib/format';
import type { SendOffAssignment as _SendOffAssignment } from '@/services/sendOffAssignmentStore';
import { periodTurnaround } from '@/lib/logic/guideBoard';
import {
  checkSendOff,
  type SendOffCheck, type SendOffStaff,
} from '@/lib/logic/sendOffStaff';
import {
  DEFAULT_SEND_OFF_RULES, formatHours, hardConflictWith, sendOffSlot, worstSendOffPair,
  type SendOffPairCheck, type SendOffRules, type SendOffSlot,
} from '@/lib/logic/sendOffRules';
import type { SendOffAssignment } from '@/services/sendOffAssignmentStore';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

/**
 * คัดพีเรียดที่หน้าจอจัดเจ้าหน้าที่ควรเห็น
 *
 * ต้องตรงกับกองที่หน้าต่างเลือกกรุ๊ปใช้ (getAssignablePeriods) ไม่งั้นตัวเลข
 * "ยังไม่มีคนไปส่ง" จะรวมกรุ๊ปที่กดเลือกไม่ได้เลย แล้วยอดค้างไม่มีวันเป็นศูนย์
 *
 * ข้อยกเว้น: กรุ๊ปที่จัดคนไปแล้วต้องเห็นเสมอ แม้ภายหลังจะกลายเป็น NO SELL
 * — ผู้จัดต้องเห็นเพื่อถอดคนออก ไม่ใช่ให้หายไปเงียบ ๆ พร้อมคนที่ยังคิดว่าต้องไป
 */
export function sendOffPeriodPool(input: {
  periods: TourPeriodMaster[];
  assignablePeriodIds: Set<string>;
  assignments: _SendOffAssignment[];
}): TourPeriodMaster[] {
  const assigned = new Set(input.assignments.map((a) => a.periodId));
  return input.periods.filter((p) => input.assignablePeriodIds.has(p.internalId) || assigned.has(p.internalId));
}

/** งานไปส่ง 1 กรุ๊ป — รวมพีเรียด เวลาบิน คนที่จัด และผลการตรวจไว้ในที่เดียว */
export interface SendOffJob {
  period: TourPeriodMaster;
  /** วันที่ต้องไปส่ง — ปกติ = วันออกเดินทาง · เที่ยวบินดึกมากอาจต้องไปตั้งแต่คืนก่อน */
  dutyDate: string;
  flightTime: string | null;
  /** เวลาเครื่องออกมาจากไหน — 'flight' = Sector จริง · 'manual' = ผู้จัดกรอกเอง · null = ยังไม่มี */
  flightSource: 'flight' | 'manual' | null;
  assignment: SendOffAssignment | null;
  staff: SendOffStaff | null;
  /** ผลการตรวจของคนที่จัดไว้ — ยังไม่มีคน = ตรวจไม่ได้ */
  check: SendOffCheck | null;
  /** งานนี้ในรูปที่ใช้ตรวจเงื่อนไข (เวลาเช็คอิน/เครื่องออก เป็นนาทีสัมบูรณ์) */
  slot: SendOffSlot | null;
  /** สนามบินที่ต้องไปส่ง (รหัส IATA ของ Sector 1) — ไม่มีข้อมูลเที่ยวบิน = null */
  airport: string | null;
  /** วันที่ต้องไปส่งเป็นวันหยุดหรือไม่ — วันหยุดพนักงานจัดได้เท่าประจำ */
  dayOff: { label: string } | null;
  /**
   * คู่ที่ "แย่ที่สุด" เมื่อเทียบกับงานอื่นของคนเดียวกัน (รวมทั้งสนามบินเดียวกันและคนละสนามบิน) — null = ไม่มีงานอื่นหรือตรวจไม่ได้
   * ใช้แสดงคำอธิบาย/เหตุผลเท่านั้น — ตัดสินว่า "จัดได้จริงไหม" ให้ดูที่ hardConflict แทน (สนามบินเดียวกันจัดได้ แค่ทับซ้อน)
   */
  conflict: { check: SendOffPairCheck; withGroupCode: string } | null;
  /**
   * คู่ที่จัดไม่ได้จริง (คนละสนามบิน ห่างไม่พอ) — null = ไม่มี ไปได้ปกติ (ต่อให้ conflict ข้างบนไม่ null ก็ตาม ถ้าเป็นแค่ทับซ้อนสนามบินเดียวกัน)
   */
  hardConflict: { check: SendOffPairCheck; withGroupCode: string } | null;
}

/**
 * เวลาที่ต้องไปถึงของกรุ๊ป โดยยังไม่ผูกกับตัวคน
 * ตรวจด้วยประเภท "ประจำ" เพราะประจำไปได้ทุกเวลา ผลที่ได้จึงเป็นเวลาไปถึงล้วน ๆ ไม่ถูกกฎเวลางานตัด
 */
export function jobArrival(flightTime: string | null, rules: SendOffRules = DEFAULT_SEND_OFF_RULES): SendOffCheck {
  return checkSendOff('permanent', flightTime, { leadHours: rules.leadHours });
}

/**
 * สถานะของงานหนึ่ง — ยังไม่มีคน = UNASSIGNED · มีคนแล้วอ่านสถานะจาก assignment ตรง ๆ (รอคอนเฟิร์ม/คอนเฟิร์มแล้ว)
 * ใช้ชื่อสถานะชุดเดียวกับ BoardStatus ของตารางหัวหน้าทัวร์ (guideBoard.ts) จึงใช้สี/ป้ายชุดเดียวกันได้เลยไม่ต้องแมปซ้ำ
 */
export function jobStatus(job: SendOffJob): 'CONFIRMED' | 'PENDING_CONFIRMATION' | 'UNASSIGNED' {
  return job.assignment?.status ?? 'UNASSIGNED';
}

/**
 * งานนี้มีเรื่องต้องแก้หรือไม่ — ใช้ตัดสินว่าจะติดเครื่องหมาย ! บนป้าย
 * ยังไม่มีคนไปส่งไม่นับเป็นปัญหาของป้าย เพราะทั้งแถวบอกอยู่แล้วว่าเป็นงานค้าง
 */
export function jobIssue(job: SendOffJob): string | null {
  if (!job.assignment) return null;
  // พีเรียดปิดขายหลังจัดคนไปแล้ว — ต้องถอดคนออก ไม่ใช่ปล่อยค้าง
  if (job.period.saleStatus === 'NO_SELL') return 'พีเรียดเปลี่ยนเป็น NO SELL แล้ว — ตรวจว่ายังต้องมีคนไปส่งหรือไม่';
  if (job.check?.kind === 'blocked') return job.check.reason;
  // จัดไม่ได้จริง (คนละสนามบิน ห่างไม่พอ) เท่านั้นที่นับเป็นปัญหา — สนามบินเดียวกันทับซ้อนกันได้ตามนโยบาย ดู jobOverlapWarning แทน
  if (job.hardConflict) {
    return `กับ ${job.hardConflict.withGroupCode}: ${job.hardConflict.check.reason}`;
  }
  /*
    ตรวจด้วยเกณฑ์สนามบินเดียวกันไปก่อนเพราะยังไม่รู้สนามบิน — ต้องกลับมาดูอีกที (ถ้ารู้แล้วกลายเป็นคนละสนามบินจะเป็น hardConflict ทันที)
    airportKnown เป็น false ได้ทั้งเพราะกรุ๊ปนี้เองหรือกรุ๊ปที่เทียบด้วยไม่รู้สนามบิน — ต้องบอกให้ถูกฝั่ง ไม่งั้นผู้จัดจะงงว่ากรุ๊ปนี้มีสนามบินอยู่แล้วทำไมยังเตือน
  */
  /*
    กรุ๊ปนี้เองไม่รู้สนามบิน = เจ้าหน้าที่ไม่รู้ว่าต้องไปส่งที่ไหน — เตือนเสมอ ไม่ขึ้นกับว่าชนกับกรุ๊ปอื่นไหม
    (ข้อมูลเที่ยวบินจาก Zego บางกรุ๊ปไม่มีเส้นทาง เช่น "VZ820 00:15–07:55" ไม่มี BKK-KIX)
  */
  if (!job.airport || job.airport === '-') {
    // กรุ๊ปจาก CSV ไม่มีทั้งเวลาและสนามบิน — บอกทั้งสองอย่างในข้อความเดียว ไม่ให้เรื่องเวลาหายไป
    if (job.check?.kind === 'unknown') return 'ยังไม่รู้เวลาเครื่องออกและสนามบินที่ต้องไปส่ง';
    return 'ยังไม่รู้สนามบินที่ต้องไปส่ง — กรอกสนามบินในหน้าต่างเลือกคนไปส่ง หรือรอข้อมูลเที่ยวบิน';
  }
  // กรุ๊ปนี้รู้สนามบินแล้ว แต่กรุ๊ปที่ใกล้กันไม่รู้ และห่างกันพอที่สนามบินจะเปลี่ยนผลได้ (ดู airportPending)
  if (job.conflict?.check.airportPending) {
    return `ยังไม่รู้สนามบินของ ${job.conflict.withGroupCode} — ตรวจอีกครั้งเมื่อข้อมูลเที่ยวบินเข้ามา`;
  }
  if (job.check?.kind === 'unknown') return 'ยังไม่รู้เวลาเครื่องออก';
  return null;
}

/**
 * เวลานัดทับซ้อนกับงานอื่นของคนเดียวกัน (สนามบินเดียวกัน ห่างไม่ถึงเกณฑ์ที่แนะนำ) — ไม่ใช่ปัญหาที่ต้องแก้ (ดู jobIssue)
 * จัดแบบนี้ได้ตามนโยบายเมื่อกรุ๊ปวันนั้นเยอะกว่าคนว่าง แค่ต้องรู้ไว้ให้เจ้าหน้าที่เตรียมตัวถูก
 */
export function jobOverlapWarning(job: SendOffJob): string | null {
  if (!job.assignment) return null;
  if (job.hardConflict) return null; // มีปัญหาจริงอยู่แล้ว ให้ jobIssue จัดการแทน ไม่ต้องเตือนซ้ำ
  if (!job.conflict || job.conflict.check.ok) return null;
  return `เวลานัดทับซ้อนกับ ${job.conflict.withGroupCode} — ${job.conflict.check.reason}`;
}

/** สรุปเงื่อนไขเป็นข้อความสั้น ใช้ในคำอธิบายบนหน้าจอ */
export function rulesSummary(rules: SendOffRules): string {
  return [
    `ถึงสนามบินก่อนเครื่องออก ${formatHours(rules.leadHours)}`,
    `สนามบินเดียวกันห่างกันเกิน ${formatHours(rules.sameAirportGapHours)} (นับเวลาเช็คอิน)`,
    `คนละสนามบินห่างกันเกิน ${formatHours(rules.crossAirportGapHours)} (นับเวลาเครื่องออก)`,
  ].join(' · ');
}

/**
 * ข้อความสั้นบนป้าย — เวลาที่ต้องไปถึง
 * ช่องวันบนตารางกว้างราว 55px เท่านั้น ข้อความยาวจะถูกตัดจนอ่านไม่ออก
 * ไม่รู้เวลาบินจึงใช้ขีดคู่กับสีของป้าย แล้วอธิบายเต็ม ๆ ใน tooltip
 */
export function chipTime(job: SendOffJob): string {
  const check = job.check ?? jobArrival(job.flightTime);
  if (!check.arrivalTime) return '—';
  return check.dayOffset === -1 ? `${check.arrivalTime}✳` : check.arrivalTime;
}

/**
 * สร้างรายการงานไปส่งจากพีเรียดที่ให้มา พร้อมตรวจงานชนให้ครบทั้งชุด
 *
 * ตรวจงานชนต้องทำหลังรู้ครบทั้งชุด — งานของคนเดียวกันอาจอยู่คนละวัน
 * (เที่ยวบินดึกเริ่มงานตั้งแต่คืนก่อน) จึงเทียบด้วยช่วงเวลาสัมบูรณ์ ไม่ใช่จับกลุ่มตามวัน
 */
export function buildSendOffJobs(input: {
  periods: TourPeriodMaster[];
  assignments: SendOffAssignment[];
  staffById: Map<string, SendOffStaff>;
  /** เวลาเครื่องออกที่ผู้จัดกรอกเอง — ใช้เมื่อพีเรียดยังไม่มีข้อมูลเที่ยวบิน */
  manualTimes: Record<string, string>;
  /** สนามบินขาไปที่ผู้จัดกรอกเอง — ใช้เมื่อพีเรียดยังไม่มีข้อมูลเที่ยวบิน (กรุ๊ปจาก CSV ไม่มีสนามบินเลย ต่อให้กรอกเวลาแล้ว) */
  manualAirports?: Record<string, string>;
  /** เงื่อนไขที่ผู้จัดตั้งไว้ — ไม่ส่งมา = ค่าเริ่มต้นของระบบ */
  rules?: SendOffRules;
  /**
   * วันหยุดของช่วงที่กำลังดู — คืนชื่อวันหยุด หรือ null ถ้าเป็นวันทำงาน
   * ไม่ส่งมา = ถือว่าทุกวันเป็นวันทำงาน (ตรวจเข้มไว้ก่อน)
   */
  dayOffOf?: (iso: string) => string | null;
}): SendOffJob[] {
  const rules = input.rules ?? DEFAULT_SEND_OFF_RULES;
  /*
    1 พีเรียดมีได้หลาย assignment (กรุ๊ปใหญ่ใช้เจ้าหน้าที่มากกว่า 1 คน) — เก็บเป็น array ต่อ periodId
    แล้ว flatMap ทีหลังให้พีเรียดที่มีหลายคนกลายเป็นหลาย SendOffJob (1 แถวต่อคนที่จัดไว้)
    พีเรียดที่ยังไม่มีใครเลยยังคงได้ SendOffJob เดียวที่ assignment เป็น null เหมือนเดิม
  */
  const byPeriod = new Map<string, SendOffAssignment[]>();
  for (const a of input.assignments) {
    const list = byPeriod.get(a.periodId) ?? [];
    list.push(a);
    byPeriod.set(a.periodId, list);
  }

  const base: SendOffJob[] = input.periods
    .flatMap((period) => {
      // เวลาจริงจาก Sector ชนะค่าที่กรอกเองเสมอ — ค่าที่กรอกเองเป็นตัวแทนชั่วคราวเท่านั้น
      const real = periodTurnaround(period).departureTime ?? null;
      const manual = input.manualTimes[period.internalId] ?? null;
      const flightTime = real ?? manual;
      const flightSource: SendOffJob['flightSource'] = real ? 'flight' : manual ? 'manual' : null;
      const assignmentsOfPeriod = byPeriod.get(period.internalId) ?? [null];
      const arrival = jobArrival(flightTime, rules);
      // เที่ยวบินดึกมากจนต้องออกจากบ้านตั้งแต่คืนก่อน → งานตกวันก่อนหน้า
      const dutyDate = arrival.dayOffset === -1 ? addDays(period.startDate, -1) : period.startDate;
      /*
        วันหยุดต้องดูที่ "วันที่ไปส่งจริง" ไม่ใช่วันออกเดินทาง
        เที่ยวบินตี 2 ของวันจันทร์ = ไปตั้งแต่คืนวันอาทิตย์ ซึ่งเป็นวันหยุด
      */
      const dayOffLabel = input.dayOffOf?.(dutyDate) ?? null;
      const opts = {
        leadHours: rules.leadHours,
        workStart: rules.employeeWorkStart,
        workEnd: rules.employeeWorkEnd,
        isDayOff: dayOffLabel !== null,
        dayOffLabel: dayOffLabel ?? undefined,
      };
      // สนามบินจริงจาก Sector ชนะค่าที่กรอกเองเสมอ — เหมือนกับเวลาเครื่องออก
      const airport = period.departureAirportCode ?? input.manualAirports?.[period.internalId] ?? null;
      return assignmentsOfPeriod.map((assignment) => {
        const staff = assignment ? input.staffById.get(assignment.staffId) ?? null : null;
        const check = staff ? checkSendOff(staff.staffType, flightTime, opts) : null;
        return {
          period, dutyDate, flightTime, flightSource, assignment, staff, check, airport,
          dayOff: dayOffLabel !== null ? { label: dayOffLabel } : null,
          slot: sendOffSlot({ groupCode: period.groupCode, departDate: period.startDate, flightTime, airport }, rules),
          conflict: null,
          hardConflict: null,
        };
      });
    })
    .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate) || a.period.groupCode.localeCompare(b.period.groupCode));

  /*
    ตรวจเงื่อนไขต้องทำหลังรู้ครบทั้งชุด — งานของคนเดียวกันอาจอยู่คนละวัน
    (เที่ยวบินดึกเริ่มงานตั้งแต่คืนก่อน) จึงเทียบด้วยเวลาสัมบูรณ์ ไม่ใช่จับกลุ่มตามวัน
  */
  const slotsByStaff = new Map<string, { periodId: string; slot: SendOffSlot }[]>();
  for (const j of base) {
    if (!j.assignment || !j.slot) continue;
    const list = slotsByStaff.get(j.assignment.staffId) ?? [];
    list.push({ periodId: j.period.internalId, slot: j.slot });
    slotsByStaff.set(j.assignment.staffId, list);
  }

  return base.map((j) => {
    if (!j.assignment || !j.slot) return j;
    const others = (slotsByStaff.get(j.assignment.staffId) ?? [])
      .filter((o) => o.periodId !== j.period.internalId)
      .map((o) => o.slot);
    const worst = worstSendOffPair(j.slot, others, rules);
    const hard = hardConflictWith(j.slot, others, rules);
    return {
      ...j,
      conflict: worst ? { check: worst.check, withGroupCode: worst.with.groupCode } : null,
      hardConflict: hard ? { check: hard.check, withGroupCode: hard.with.groupCode } : null,
    };
  });
}
