/**
 * Guide Schedule Timeline — สถานะการจัดหัวหน้าทัวร์ (Board Status) + ตรวจงานชน/เวลาพัก (Buffer)
 *
 * แยกออกจากมุมมอง (ตาราง Timeline แสดงผลอย่างเดียว) — ตรรกะสถานะ/ชนอยู่ที่นี่ทั้งหมด
 * สถานะการจัด (§3) คำนวณจาก TourJob (leaderId + JobStatus) ไม่เก็บเป็น field แยก
 * การตรวจชน (§7) ใช้ DateTime overlap: newStart < existingEnd && newEnd > existingStart
 */

import type { StatusMeta } from '@/lib/labels';
import type { TourJob } from '@/types';
import type { TourPeriodMaster, TourSector } from '@/data/schedule/masterTypes';
import type { AssignmentBoardStatus, PeriodSnapshot } from '@/services/guideAssignmentStore';
import { parseDate, daysBetween, formatDate } from '@/lib/format';
import { programBusyWindow, type UnavailableWindow } from './leaderAvailability';
import { flightNoOf } from './airlines';

/** 5 สถานะการจัดหัวหน้าทัวร์ (§3) */
export type BoardStatus =
  | 'UNASSIGNED' // ยังไม่ระบุ
  | 'PENDING_CONFIRMATION' // รอคอนเฟิร์ม
  | 'CONFIRMED' // คอนเฟิร์มแล้ว
  | 'DECLINED' // ปฏิเสธ
  | 'REASSIGN_REQUIRED'; // ต้องเปลี่ยนหัวหน้าทัวร์

/**
 * §3 Mapping กลางของ "สถานะการจัดหัวหน้าทัวร์" → ป้าย + สี — จุดเดียวของทั้งระบบ
 *
 * ทุกหน้าที่แสดงสถานะนี้ต้องอ่านจากที่นี่ (ห้ามนิยามสีซ้ำใน Component)
 * • bar    = สีพื้น + สีอักษร + เส้นขอบซ้าย สำหรับแถบงานบนปฏิทิน/ตาราง
 * • dot    = จุดสีเล็กสำหรับรายการ/ป้ายกำกับ
 * ทุก class เขียนเต็มคำแบบคงที่ (ห้ามประกอบเป็น string เช่น `bg-${c}-100`)
 * เพื่อให้ Tailwind มองเห็นตอน build ทั้ง Development และ Production
 * ⚠️ ไม่ใช้สีจากสถานะขาย (saleStatus) สถานะโปรแกรม หรือสถานะความพร้อมรับงาน
 */
export const BOARD_STATUS: Record<BoardStatus, StatusMeta & { bar: string; dot: string }> = {
  UNASSIGNED: { label: 'ยังไม่ระบุ', tone: 'slate', bar: 'zego-status-bar zego-status-bar--slate', dot: 'zego-dot--slate' },
  PENDING_CONFIRMATION: { label: 'รอคอนเฟิร์ม', tone: 'amber', bar: 'zego-status-bar zego-status-bar--warning', dot: 'zego-dot--warning' },
  CONFIRMED: { label: 'คอนเฟิร์มแล้ว', tone: 'green', bar: 'zego-status-bar zego-status-bar--success', dot: 'zego-dot--success' },
  DECLINED: { label: 'ปฏิเสธ', tone: 'red', bar: 'zego-status-bar zego-status-bar--danger', dot: 'zego-dot--danger' },
  REASSIGN_REQUIRED: { label: 'เปลี่ยนหัวหน้าทัวร์', tone: 'amber', bar: 'zego-status-bar zego-status-bar--orange', dot: 'zego-dot--orange' },
};

export const BOARD_STATUS_ORDER: BoardStatus[] = ['CONFIRMED', 'PENDING_CONFIRMATION', 'REASSIGN_REQUIRED', 'DECLINED', 'UNASSIGNED'];

/**
 * รับค่าสถานะรูปแบบใดก็ได้ → BoardStatus ที่ถูกต้องเสมอ
 *
 * รองรับตัวพิมพ์เล็ก/ใหญ่ · snake_case · และป้ายภาษาไทย เผื่อข้อมูลเก่าที่ persist ไว้
 * ค่าที่ไม่รู้จัก null undefined หรือค่าว่าง → 'UNASSIGNED'
 * (ต้องไม่มีกรณีที่แถบงาน "ไม่มีสี" เพราะจับคู่สถานะไม่ได้)
 */
export function normalizeBoardStatus(value: unknown): BoardStatus {
  const key = String(value ?? '').trim().toLowerCase();
  return BOARD_STATUS_ALIAS[key] ?? 'UNASSIGNED';
}

const BOARD_STATUS_ALIAS: Record<string, BoardStatus> = {
  confirmed: 'CONFIRMED', confirm: 'CONFIRMED', accepted: 'CONFIRMED', 'คอนเฟิร์มแล้ว': 'CONFIRMED',
  pending_confirmation: 'PENDING_CONFIRMATION', pending: 'PENDING_CONFIRMATION', offered: 'PENDING_CONFIRMATION', 'รอคอนเฟิร์ม': 'PENDING_CONFIRMATION',
  reassign_required: 'REASSIGN_REQUIRED', need_replacement: 'REASSIGN_REQUIRED', replacement_required: 'REASSIGN_REQUIRED', need_leader: 'REASSIGN_REQUIRED', 'ต้องเปลี่ยนหัวหน้าทัวร์': 'REASSIGN_REQUIRED', 'เปลี่ยนหัวหน้าทัวร์': 'REASSIGN_REQUIRED',
  declined: 'DECLINED', rejected: 'DECLINED', reject: 'DECLINED', 'ปฏิเสธ': 'DECLINED',
  unassigned: 'UNASSIGNED', not_assigned: 'UNASSIGNED', 'ยังไม่ระบุ': 'UNASSIGNED',
};

/** ป้าย+สีของสถานะการจัด — ปลอดภัยเสมอ ไม่มีทางคืน undefined (ใช้แทนการอ่าน BOARD_STATUS[x] ตรง ๆ) */
export function boardStatusMeta(value: unknown): StatusMeta & { bar: string; dot: string } {
  return BOARD_STATUS[normalizeBoardStatus(value)];
}

/**
 * สถานะการจัดของงานหนึ่ง (§3) — map จาก JobStatus + leaderId
 *   ไม่มีหัวหน้าทัวร์ → UNASSIGNED · rejected → DECLINED · offered → รอคอนเฟิร์ม
 *   accepted/traveling/awaiting_settlement/closed → คอนเฟิร์มแล้ว
 *   need_leader ทั้งที่เคยมีหัวหน้าทัวร์ → ต้องเปลี่ยนหัวหน้าทัวร์
 */
export function boardStatus(job: TourJob): BoardStatus {
  if (job.status === 'rejected') return 'DECLINED';
  if (!job.leaderId) return 'UNASSIGNED';
  if (job.status === 'need_leader') return 'REASSIGN_REQUIRED';
  if (job.status === 'offered') return 'PENDING_CONFIRMATION';
  return 'CONFIRMED'; // accepted / traveling / awaiting_settlement / closed
}

/** Group Code ที่แสดงบนแถบ (§2) — ใช้ periodCode/programCode ถ้ามี ไม่งั้น Tour Code (= job.id) */
export function groupCodeOf(job: TourJob): string {
  return job.periodCode || job.programCode || job.id;
}

const DASH = '-';

/** ข้อมูลย่อสำหรับแสดงบนแถบงาน/Tooltip — สนามบิน+สายการบินมาจาก Sector 1 (เที่ยวบินขาออก) จริงเท่านั้น */
export interface ScheduleDisplay {
  groupCode: string;
  bus: string;
  country: string;
  depAirport: string; // From ของ Sector 1
  airlineCode: string; // Airline Code ของ Sector 1
}

/**
 * ข้อมูล Sector 1 = เที่ยวบินขาออก (outboundFlight) — ไม่ใช้ Sector อื่นแทน · ไม่มี → "-"
 *   From        = สนามบินต้นทางของ route เช่น "BKK – HND" → BKK
 *   Airline Code = อักษรนำหน้า flightNo เช่น "TG-660" → TG (ไม่สร้างจาก Group Code)
 */
export function scheduleDisplay(job: TourJob): ScheduleDisplay {
  const f = job.outboundFlight;
  const validNo = f?.flightNo && f.flightNo !== '—' && f.flightNo !== DASH ? f.flightNo : '';
  const depAirport = f?.route ? (f.route.split(/[–—-]/)[0]?.trim() || DASH) : DASH;
  const airlineCode = validNo ? (validNo.split(/[-\s]/)[0]?.trim() || DASH) : DASH;
  return {
    groupCode: groupCodeOf(job),
    bus: job.bus ?? DASH,
    country: job.country || DASH,
    depAirport,
    airlineCode,
  };
}

/* ------------------------------ Tour Period Master → แสดงผล (§6) ------------------------------ */

/** ข้อมูลย่อบนแถบ/รายละเอียด จาก Master (periodId) — อ่านฟิลด์จาก Master เท่านั้น ไม่อนุมานใน UI */
export function periodScheduleDisplay(period: TourPeriodMaster): ScheduleDisplay {
  return {
    groupCode: period.groupCode,
    bus: period.bus ?? DASH,
    country: period.countryName || DASH,
    depAirport: period.departureAirportCode ?? DASH, // From ของ Sector 1 (CSV ไม่มี Sector → "-")
    airlineCode: period.firstSectorAirlineCode ?? DASH,
  };
}

/**
 * สรุปเที่ยวบิน 1 ช่วงเป็นข้อความสั้น เช่น "SC8888 BKK–TAO 02:30–06:10"
 * ส่วนที่แหล่งข้อมูลไม่มีจะถูกตัดออก ไม่แสดงขีดหรือช่องว่างค้างไว้
 */
export function sectorSummary(s: TourSector): string {
  const leg = s.fromAirportCode && s.toAirportCode ? `${s.fromAirportCode}–${s.toAirportCode}` : '';
  const time = s.departureTime || s.arrivalTime ? `${s.departureTime ?? '—'}–${s.arrivalTime ?? '—'}` : '';
  return [s.flightNumber, leg, time].filter(Boolean).join(' ');
}

/**
 * แยกช่วงบินเป็น "ขาไป" กับ "ขากลับ" จากเส้นทางจริง ไม่ใช่หารครึ่ง
 *
 * จุดกลับตัวดูจาก "รอยต่อที่ขาด" — ช่วงก่อนหน้าลงที่เมืองหนึ่ง แต่ช่วงถัดไปขึ้นจากอีกเมือง
 * แปลว่าระหว่างนั้นเดินทางทางบก = จบขาไปตรงนั้น
 *   BKK–IST · IST–TLL · VNO–IST · IST–BKK
 *   → TLL ≠ VNO คือรอยต่อที่ขาด → ขาไป [BKK–IST, IST–TLL] · ขากลับ [VNO–IST, IST–BKK]
 *
 * บินต่อกันตลอดไม่มีรอยขาด (เช่น BKK–IST · IST–TLL · TLL–BKK) ถือว่าช่วงสุดท้ายคือขากลับ
 * เพราะเมืองปลายทางคือจุดที่ลงแล้วอยู่ต่อ ไม่ใช่แค่ต่อเครื่อง
 *
 * แยกไม่ได้ (ข้อมูลสนามบินไม่ครบ / ไม่ได้กลับถึงสนามบินต้นทาง) → คืนขาไปทั้งหมด
 * ให้หน้าจอแสดงรวดเดียวตามเดิม ดีกว่าแบ่งมั่วแล้วอ่านผิด
 */
export function splitFlightLegs(sectors: TourSector[]): { outbound: TourSector[]; inbound: TourSector[] } {
  const origin = sectors[0]?.fromAirportCode;
  const last = sectors[sectors.length - 1];
  if (!origin || sectors.length < 2 || last.toAirportCode !== origin) return { outbound: sectors, inbound: [] };

  /* รอยต่อที่ขาดอันท้ายสุด = จุดเริ่มขากลับ · ไม่มีรอยขาดเลย = ขากลับคือช่วงสุดท้ายช่วงเดียว */
  let turnaround = sectors.length - 1;
  for (let i = 1; i < sectors.length; i += 1) {
    if (sectors[i - 1].toAirportCode !== sectors[i].fromAirportCode) turnaround = i;
  }
  return { outbound: sectors.slice(0, turnaround), inbound: sectors.slice(turnaround) };
}

/** สรุปทุกช่วงบินของพีเรียด — ไม่มีข้อมูลจากต้นทางคืนค่าว่าง (หน้าจอจะไม่แสดงบรรทัดนั้น) */
export function flightSummary(period: TourPeriodMaster): string {
  return period.sectors.map(sectorSummary).filter(Boolean).join(' · ');
}

/** สถานะการจัดของแถบ = สถานะจาก Guide Assignment · ไม่มี assignment → UNASSIGNED */
export function boardStatusFromAssignment(assignmentStatus: AssignmentBoardStatus | undefined | null): BoardStatus {
  return assignmentStatus ?? 'UNASSIGNED';
}

/* ------------------------------ ตรวจ Master เปลี่ยน / พีเรียดปิด (§9/§10) ------------------------------ */

/** Snapshot ของพีเรียด ณ เวลามอบหมาย (ใช้เทียบการเปลี่ยนแปลง) */
export function periodSnapshotOf(p: TourPeriodMaster): PeriodSnapshot {
  return {
    startDate: p.startDate, endDate: p.endDate, bus: p.bus ?? null, countryName: p.countryName, saleStatus: p.saleStatus,
    outboundFlight: outboundFlightOf(p), departureAirport: p.departureAirportCode ?? '',
  };
}

/** เที่ยวบินขาไป "NH806 08:00" — ไม่มี sector = '' */
function outboundFlightOf(p: TourPeriodMaster): string {
  const s = p.sectors?.[0];
  if (!s) return '';
  const time = s.departureTime ?? (s.departureDateTime ? s.departureDateTime.slice(11, 16) : '');
  return [flightNoOf(s), time].filter(Boolean).join(' ');
}

/**
 * พีเรียด "ไม่พบในข้อมูล Zego รอบล่าสุด" แต่เดินทางจบไปแล้ว = ปกติ (Zego ส่งมาเฉพาะกรุ๊ปที่ยังไม่เดินทาง/ยังขายอยู่)
 * ไม่ต้องเตือน และห้ามถูกเคลียร์ทิ้ง · ยังไม่ถึงวันกลับ = อาจถูกยกเลิก ต้องตรวจสอบ
 */
export function isMissingButTravelled(period: TourPeriodMaster | null, today: string): boolean {
  return !!period && period.dataStatus === 'MISSING_FROM_SOURCE' && !!period.endDate && period.endDate < today;
}

export type AssignmentIssueType = 'MISSING' | 'INACTIVE' | 'INVALID' | 'CHANGED' | 'NO_SELL';
export interface AssignmentIssue { type: AssignmentIssueType; label: string; detail?: string }

/** ป้ายสถานะตรวจสอบของ Assignment ที่รอผู้ใช้ถอดออกเพราะโปรแกรมไม่เปิดขายแล้ว */
export const NO_SELL_REVIEW_LABEL = 'รอถอดออกเนื่องจาก NO SELL';

/** พีเรียดไม่เปิดขายแล้ว — ยังมีหัวหน้าทัวร์อยู่ ต้องให้ผู้ใช้ยืนยันถอดเอง (ห้ามถอดอัตโนมัติ) */
export function isNoSellPeriod(period: TourPeriodMaster | null): boolean {
  return period?.saleStatus === 'NO_SELL';
}

/**
 * ตรวจว่า Assignment ได้รับผลกระทบจาก Master หรือไม่ (§9/§10)
 *   period == null / MISSING_FROM_SOURCE → หายจากต้นทาง · ปิดใช้งาน/Archive · INVALID · snapshot ต่างจากปัจจุบัน → เปลี่ยน
 *   saleStatus = NO_SELL → ต้องถอดหัวหน้าทัวร์ออก (ขึ้นก่อนเพื่อน เพราะเป็นเรื่องที่ต้องลงมือทำ)
 */
export function detectAssignmentIssues(snapshot: PeriodSnapshot | undefined, period: TourPeriodMaster | null, today?: string): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  if (!period) return [{ type: 'MISSING', label: 'พีเรียดหายจากต้นทาง' }];
  // เดินทางจบแล้วจึงหลุดจากข้อมูล Zego — เป็นเรื่องปกติ ไม่ใช่ปัญหาของการจัดงาน
  if (today && isMissingButTravelled(period, today)) return [];
  if (isNoSellPeriod(period)) {
    issues.push({
      type: 'NO_SELL',
      label: NO_SELL_REVIEW_LABEL,
      detail: snapshot && snapshot.saleStatus !== 'NO_SELL'
        ? `สถานะขายเปลี่ยนจาก ${snapshot.saleStatus} เป็น NO_SELL หลังจัดหัวหน้าทัวร์แล้ว`
        : 'โปรแกรมนี้มีสถานะขายเป็น NO SELL',
    });
  }
  if (period.dataStatus === 'MISSING_FROM_SOURCE') issues.push({ type: 'MISSING', label: 'ไม่พบในข้อมูล Zego รอบล่าสุด', detail: 'ไม่พบกรุ๊ปนี้ในข้อมูล Zego รอบล่าสุด (อาจถูกยกเลิก) — ตรวจสอบกับฝ่ายขาย' });
  else if (period.dataStatus !== 'ACTIVE' || !period.isActive) issues.push({ type: 'INACTIVE', label: period.dataStatus === 'ARCHIVED' ? 'พีเรียดถูก Archive' : 'พีเรียดถูกปิดใช้งาน' });
  if (period.validationStatus === 'INVALID') issues.push({ type: 'INVALID', label: 'ข้อมูลพีเรียดไม่ถูกต้อง' });
  if (snapshot) {
    const ch: string[] = [];
    if (snapshot.startDate !== period.startDate || snapshot.endDate !== period.endDate) ch.push(`วันเดินทางเปลี่ยนจาก ${formatDate(snapshot.startDate)}–${formatDate(snapshot.endDate)} เป็น ${formatDate(period.startDate)}–${formatDate(period.endDate)}`);
    if ((snapshot.bus ?? '') !== (period.bus ?? '')) ch.push(`บัสเปลี่ยนจาก ${snapshot.bus ?? '-'} เป็น ${period.bus ?? '-'}`);
    if (snapshot.countryName !== period.countryName) ch.push(`ประเทศเปลี่ยนจาก ${snapshot.countryName} เป็น ${period.countryName}`);
    if (snapshot.saleStatus !== period.saleStatus) ch.push(`สถานะขายเปลี่ยนจาก ${snapshot.saleStatus} เป็น ${period.saleStatus}`);
    // snapshot รุ่นก่อนไม่มีสองช่องนี้ — ไม่เทียบ (ไม่งั้นทุกงานเก่าจะขึ้นว่าเปลี่ยน)
    if (snapshot.outboundFlight !== undefined) {
      const now = outboundFlightOf(period);
      if (snapshot.outboundFlight !== now) ch.push(`เที่ยวบินขาไปเปลี่ยนจาก ${snapshot.outboundFlight || '-'} เป็น ${now || '-'}`);
    }
    if (snapshot.departureAirport !== undefined && snapshot.departureAirport !== (period.departureAirportCode ?? '')) {
      ch.push(`สนามบินต้นทางเปลี่ยนจาก ${snapshot.departureAirport || '-'} เป็น ${period.departureAirportCode || '-'}`);
    }
    if (ch.length) issues.push({ type: 'CHANGED', label: 'ข้อมูลต้นทางเปลี่ยน', detail: ch.join(' · ') });
  }
  return issues;
}

/* ------------------------------ ตรวจงานชน / เวลาพัก (§7) ------------------------------ */

interface DateRangeRef {
  periodId: string;
  startDate: string;
  endDate: string;
  /** เวลาออกเดินทางของเที่ยวบินแรก (HH:MM) — ไม่รู้เวลา = undefined */
  departureTime?: string | null;
  /** เวลาที่ลงเครื่องกลับถึงไทยของเที่ยวบินสุดท้าย (HH:MM) */
  arrivalTime?: string | null;
}

/**
 * เวลาออกเดินทาง/เวลาลงเครื่องกลับของพีเรียด — อ่านจากเที่ยวบินจริง
 * ออก = เที่ยวบินแรกของขาไป · กลับถึง = เที่ยวบินสุดท้ายของขากลับ
 * ไม่มีข้อมูลเที่ยวบิน (เช่นข้อมูลจาก CSV) → undefined ทั้งคู่ ระบบจะกลับไปตรวจระดับวันตามเดิม
 */
export function periodTurnaround(period: TourPeriodMaster): { departureTime?: string | null; arrivalTime?: string | null } {
  const { outbound, inbound } = splitFlightLegs(period.sectors);
  const back = inbound.length > 0 ? inbound : outbound;
  return {
    departureTime: outbound[0]?.departureTime ?? null,
    arrivalTime: back[back.length - 1]?.arrivalTime ?? null,
  };
}

/** ช่วงวันของพีเรียดพร้อมเวลาบิน — ใช้ส่งเข้า checkPeriodConflict */
export function periodRangeRef(period: TourPeriodMaster): DateRangeRef {
  return { periodId: period.internalId, startDate: period.startDate, endDate: period.endDate, ...periodTurnaround(period) };
}

/** "HH:MM" → นาทีนับจากเที่ยงคืน · รูปแบบอื่น/ว่าง → null */
function minutesOfDay(time: string | null | undefined): number | null {
  const m = (time ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59 ? h * 60 + mm : null;
}

/**
 * §7 ต่อเครื่องวันเดียวกัน — ลงเครื่องกรุ๊ปหนึ่งแล้วขึ้นเครื่องอีกกรุ๊ปในวันเดียวกัน
 *
 * ระดับวันจะมองว่าทับซ้อนและห้ามจัด แต่จริง ๆ ทำได้ถ้าเวลาห่างพอ
 * (กลับถึง 04/08 01:00 แล้วออก 04/08 22:00 = ห่าง 21 ชม.)
 * คืนจำนวนชั่วโมงที่ห่างกันเพื่อให้ผู้จัดตัดสินใจเอง — ระบบไม่ตัดสินแทนว่ากี่ชั่วโมงถึงจะพอ
 *
 * คืน null เมื่อ: ไม่ใช่กรณีชนกันแค่วันเดียว · ไม่รู้เวลาบินฝั่งใดฝั่งหนึ่ง · หรือเวลาซ้อนกันจริง (ติดลบ)
 */
export function sameDayTurnaroundHours(candidate: DateRangeRef, other: DateRangeRef): number | null {
  /* ผู้สมัครออกเดินทางวันเดียวกับที่อีกกรุ๊ปกลับถึง */
  if (candidate.startDate === other.endDate && candidate.endDate > other.endDate) {
    const arrive = minutesOfDay(other.arrivalTime);
    const depart = minutesOfDay(candidate.departureTime);
    if (arrive === null || depart === null) return null;
    return depart >= arrive ? (depart - arrive) / 60 : null;
  }
  /* กลับด้าน — ผู้สมัครกลับถึงวันเดียวกับที่อีกกรุ๊ปออกเดินทาง */
  if (candidate.endDate === other.startDate && candidate.startDate < other.startDate) {
    const arrive = minutesOfDay(candidate.arrivalTime);
    const depart = minutesOfDay(other.departureTime);
    if (arrive === null || depart === null) return null;
    return depart >= arrive ? (depart - arrive) / 60 : null;
  }
  return null;
}

/** ชั่วโมงเป็นข้อความอ่านง่าย เช่น 21 ชม. หรือ 5 ชม. 30 นาที */
export function formatGapHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

/**
 * ตรวจงานชนระดับพีเรียด (§8) — ใช้วันเดินทางจาก Master (พีเรียดที่ไม่มีเวลาบิน → ระดับวัน)
 *   ทับซ้อน: cand.start <= other.end && cand.end >= other.start → blocked
 *   ยกเว้นชนกันแค่วันต่อวันและรู้เวลาบินทั้งสองฝั่ง → คิดชั่วโมงจริงแล้ว warn ให้ผู้จัดพิจารณา
 *   ไม่ทับ แต่พักน้อยกว่า Buffer → warn · ทับวันลา/ไม่ว่าง → blocked
 */
export function checkPeriodConflict(
  candidate: DateRangeRef,
  assignedPeriods: DateRangeRef[],
  leaveWindows: UnavailableWindow[],
  bufferHours = 0,
): ConflictResult {
  let nearestRestDays: number | undefined;
  let nearestId: string | undefined;

  /* เก็บกรณีต่อเครื่องวันเดียวกันไว้ก่อน — ถ้าไม่มีอะไร blocked เลยจึงค่อยรายงานเป็นคำเตือน */
  let turnaround: { hours: number; id: string } | undefined;

  for (const ap of assignedPeriods) {
    if (ap.periodId === candidate.periodId) continue;
    if (candidate.startDate <= ap.endDate && candidate.endDate >= ap.startDate) {
      const gap = sameDayTurnaroundHours(candidate, ap);
      if (gap === null) {
        return { verdict: 'blocked', reason: `ทับซ้อนกับพีเรียดที่จัดไว้ (${ap.periodId})`, conflictId: ap.periodId };
      }
      if (!turnaround || gap < turnaround.hours) turnaround = { hours: gap, id: ap.periodId };
      continue;
    }
    const gap = candidate.startDate > ap.endDate ? daysBetween(ap.endDate, candidate.startDate) - 1 : daysBetween(candidate.endDate, ap.startDate) - 1;
    if (nearestRestDays === undefined || gap < nearestRestDays) { nearestRestDays = gap; nearestId = ap.periodId; }
  }

  for (const w of leaveWindows) {
    if (candidate.startDate <= w.end && candidate.endDate >= w.start) {
      return { verdict: 'blocked', reason: `ทับซ้อนกับ ${w.title}`, conflictId: w.sourceId };
    }
  }

  /* ต่อเครื่องวันเดียวกัน — จัดได้ แต่ต้องเตือนพร้อมบอกชั่วโมงที่ห่างกันจริง */
  if (turnaround) {
    return {
      verdict: 'warn',
      reason: `เดินทางวันเดียวกัน — ลงเครื่องกรุ๊ปก่อนหน้าแล้วขึ้นเครื่องกรุ๊ปนี้ห่างกัน ${formatGapHours(turnaround.hours)} · โปรดพิจารณาว่าเพียงพอหรือไม่`,
      conflictId: turnaround.id,
      restHours: turnaround.hours,
      sameDayTurnaround: true,
    };
  }

  if (bufferHours > 0 && nearestRestDays !== undefined && nearestRestDays * 24 < bufferHours) {
    return { verdict: 'warn', reason: `เวลาพักเพียง ${Math.max(0, nearestRestDays)} วัน (น้อยกว่าเกณฑ์ ${bufferHours} ชม.)`, conflictId: nearestId, restHours: nearestRestDays * 24 };
  }
  return { verdict: 'ok', restHours: nearestRestDays !== undefined ? nearestRestDays * 24 : undefined };
}

export type ConflictVerdict = 'ok' | 'warn' | 'blocked';

export interface ConflictResult {
  verdict: ConflictVerdict;
  reason?: string;
  conflictId?: string;
  /** ชั่วโมงพักที่ใกล้ที่สุดกับงาน/ช่วงไม่ว่างอื่น (ถ้ามี) */
  restHours?: number;
  /** true = ชนกันแค่วันต่อวันแต่เวลาบินไม่ซ้อนกัน (ต่อเครื่องวันเดียวกัน) */
  sameDayTurnaround?: boolean;
}

/** แปลง UnavailableWindow → ช่วงเวลา ISO datetime [startAt, endAt] */
function windowInterval(w: UnavailableWindow): { startAt: string; endAt: string } {
  const startAt = w.isAllDay ? `${w.start}T00:00` : `${w.start}T${w.startTime || '00:00'}`;
  const endAt = w.isAllDay ? `${w.end}T23:59` : `${w.end}T${w.endTime || '23:59'}`;
  return { startAt, endAt };
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(parseDate(a).getTime() - parseDate(b).getTime()) / 3_600_000;
}

/**
 * ตรวจว่าจะจัด `candidate` ให้หัวหน้าทัวร์ที่มี `windows` (งาน/ลา/ไม่พร้อม/ติดงาน) ได้ไหม (§7)
 *   - เวลาชนจริง (overlap) → blocked
 *   - ไม่ชน แต่พักน้อยกว่า bufferHours → warn (ระบุชั่วโมงพัก)
 *   - candidate ไม่มีเวลาเริ่มชัดเจน แต่ตรงวันกับช่วงไม่ว่าง → warn
 */
export function checkConflict(
  candidate: Pick<TourJob, 'id' | 'departDate' | 'returnDate' | 'meetingDateTime' | 'outboundFlight' | 'inboundFlight'>,
  windows: UnavailableWindow[],
  bufferHours = 0,
): ConflictResult {
  const prog = programBusyWindow(candidate as TourJob);
  let nearestRest: number | undefined;
  let nearestId: string | undefined;

  for (const w of windows) {
    const iv = windowInterval(w);
    // overlap แบบ DateTime: newStart < existingEnd && newEnd > existingStart
    if (prog.startAt < iv.endAt && prog.endAt > iv.startAt) {
      return { verdict: 'blocked', reason: `เวลาทำงานทับซ้อนกับ ${w.title}`, conflictId: w.sourceId };
    }
    // ไม่ชน — คำนวณช่วงพักที่ใกล้ที่สุด
    const gap = prog.startAt >= iv.endAt ? hoursBetween(prog.startAt, iv.endAt) : hoursBetween(iv.startAt, prog.endAt);
    if (nearestRest === undefined || gap < nearestRest) {
      nearestRest = gap;
      nearestId = w.sourceId;
    }
  }

  if (!prog.hasStartTime && windows.some((w) => w.start <= candidate.returnDate && w.end >= candidate.departDate)) {
    return { verdict: 'warn', reason: 'งานนี้ยังไม่มีเวลาเริ่มที่ชัดเจน และมีช่วงไม่ว่างในวันเดียวกัน — โปรดตรวจสอบ', restHours: nearestRest };
  }
  if (bufferHours > 0 && nearestRest !== undefined && nearestRest < bufferHours) {
    return {
      verdict: 'warn',
      reason: `เวลาพักเพียง ${Math.floor(nearestRest)} ชม. (น้อยกว่าเกณฑ์ ${bufferHours} ชม.)`,
      conflictId: nearestId,
      restHours: nearestRest,
    };
  }
  return { verdict: 'ok', restHours: nearestRest };
}
