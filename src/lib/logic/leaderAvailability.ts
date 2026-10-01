/**
 * ปฏิทิน "ช่วงเวลาที่หัวหน้าทัวร์รับงานไม่ได้" + การตรวจความว่างตาม "วันและเวลาจริง"
 *
 * §3 ช่วงเวลาปฏิบัติงานของโปรแกรม: ใช้ข้อมูลที่ละเอียดสุดก่อน
 *     เริ่ม = วัน–เวลานัดหมาย/รายงานตัว → เที่ยวบินขาไป → วันเดินทางเริ่ม (00:00)
 *     สิ้นสุด = เที่ยวบินขากลับถึง → วันเดินทางสิ้นสุด (23:59)
 * §4 ทับซ้อนเมื่อ programStart < unavailableEnd && programEnd > unavailableStart (เข้ม: ชนขอบ = ไม่ทับ)
 *
 * เก็บช่วงไม่ว่างแบบ derive จากงาน + นัดหมาย (เชื่อม sourceId กลับต้นทาง — §12)
 */

import type { AvailabilityRecordType, Appointment, LeaderAvailabilityRecord, TourJob } from '@/types';
import { addDays, diffDays, formatDate, formatDateRange } from '@/lib/format';
import { isBlockingJob } from './conflicts';

export type UnavailableEventType =
  | 'TOUR_ASSIGNMENT'
  | 'LEAVE'
  | 'APPOINTMENT'
  | 'COMPANY_WORK'
  | 'UNAVAILABLE'
  | 'TRAINING'
  | 'OTHER';

/** หนึ่งช่วงเวลาที่รับงานไม่ได้ (โครงสร้างแบบ calendarEvents §12) */
export interface UnavailableWindow {
  id: string;
  tourLeaderId: string;
  eventType: UnavailableEventType;
  sourceId: string;
  title: string;
  start: string; // ISO date
  end: string; // ISO date (ข้ามวัน/ข้ามปีได้)
  isAllDay: boolean;
  blocksAssignment: boolean;
  status: 'active';
  reason: string;
  startTime?: string; // HH:mm (เมื่อ isAllDay = false)
  endTime?: string;
}

export interface AvailabilityOptions {
  /** §8 จำนวนวันพักขั้นต่ำระหว่างโปรแกรม */
  minRestDays: number;
}

export const DEFAULT_AVAILABILITY_OPTIONS: AvailabilityOptions = { minRestDays: 1 };

const EVENT_LABEL: Record<UnavailableEventType, string> = {
  TOUR_ASSIGNMENT: 'งานทัวร์',
  LEAVE: 'วันลา',
  APPOINTMENT: 'นัดหมาย',
  COMPANY_WORK: 'ติดงานบริษัท',
  UNAVAILABLE: 'ช่วงไม่พร้อมรับงาน',
  TRAINING: 'ช่วงอบรม',
  OTHER: 'ช่วงไม่ว่าง',
};

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** เวลา HH:mm ของสตริง ISO datetime (ถ้าเป็นวันที่ล้วนคืน undefined) */
function timeOf(iso: string): string | undefined {
  return iso.length > 10 ? iso.slice(11, 16) : undefined;
}

/** แปลงเป็นสตริง datetime เทียบลำดับได้ (YYYY-MM-DDTHH:mm) */
function toDateTime(dateOrIso: string, fallbackTime: string): string {
  return dateOrIso.length > 10 ? dateOrIso.slice(0, 16) : `${dateOrIso}T${fallbackTime}`;
}

function hoursBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(Math.abs(ms) / 3_600_000);
}

/* --------------------------- ช่วงเวลาของโปรแกรม --------------------------- */

export interface ProgramWindow {
  startAt: string; // ISO datetime
  endAt: string;
  startDate: string;
  endDate: string;
  /** มีข้อมูลเวลาเริ่มงานที่เชื่อถือได้หรือไม่ (§7) */
  hasStartTime: boolean;
}

/** ช่วงเวลาปฏิบัติงานจริงของโปรแกรม ตามลำดับความละเอียด (§3) */
export function programBusyWindow(
  job: Pick<TourJob, 'departDate' | 'returnDate' | 'meetingDateTime' | 'outboundFlight' | 'inboundFlight'>,
): ProgramWindow {
  const startSource = job.meetingDateTime || job.outboundFlight?.departAt || '';
  const hasStartTime = Boolean(timeOf(startSource));
  const startAt = hasStartTime ? startSource.slice(0, 16) : `${job.departDate}T00:00`;
  const endSource = job.inboundFlight?.arriveAt || '';
  const endAt = timeOf(endSource) ? endSource.slice(0, 16) : `${job.returnDate}T23:59`;
  return { startAt, endAt, startDate: job.departDate, endDate: job.returnDate, hasStartTime };
}

/* ----------------------- สร้างปฏิทินช่วงไม่ว่างกลาง ----------------------- */

const RECORD_EVENT: Record<AvailabilityRecordType, UnavailableEventType> = {
  sick_leave: 'LEAVE',
  personal_leave: 'LEAVE',
  company_work: 'COMPANY_WORK',
  unavailable: 'UNAVAILABLE',
};

export function leaderUnavailability(
  tourLeaderId: string,
  jobs: TourJob[],
  appointments: Appointment[],
  records: LeaderAvailabilityRecord[] = [],
  excludeJobId?: string,
): UnavailableWindow[] {
  const windows: UnavailableWindow[] = [];

  for (const job of jobs) {
    if (job.id === excludeJobId) continue;
    const involved =
      job.leaderId === tourLeaderId || job.assistantLeaderIds.includes(tourLeaderId);
    if (!involved || !isBlockingJob(job)) continue;
    windows.push({
      id: `AV-JOB-${job.id}`,
      tourLeaderId,
      eventType: 'TOUR_ASSIGNMENT',
      sourceId: job.id,
      title: job.title,
      start: job.departDate,
      end: job.returnDate,
      isAllDay: true, // งานทัวร์กันตัวตลอดช่วงเดินทาง
      blocksAssignment: true,
      status: 'active',
      reason: 'มีโปรแกรมทัวร์ทับซ้อน',
    });
  }

  for (const appt of appointments) {
    if (appt.leaderId !== tourLeaderId) continue;
    if (appt.status === 'cancelled') continue;
    if (appt.blocksAssignment === false) continue;
    windows.push({
      id: `AV-APT-${appt.id}`,
      tourLeaderId,
      eventType: 'APPOINTMENT',
      sourceId: appt.id,
      title: 'นัดหมาย/กิจกรรม',
      start: appt.date,
      end: appt.date,
      isAllDay: false, // §5 นัดหมายอิงวัน–เวลาจริง
      blocksAssignment: true,
      status: 'active',
      reason: 'มีนัดหมายหรือกิจกรรมที่ปิดช่วงรับงาน',
      startTime: appt.time,
      endTime: addMinutes(appt.time, appt.durationMinutes),
    });
  }

  // วันลา / ช่วงไม่พร้อม (เฉพาะที่อนุมัติแล้ว + ปิดรับงาน)
  for (const rec of records) {
    if (rec.leaderId !== tourLeaderId) continue;
    if (rec.approval !== 'approved' || !rec.blocksAssignment) continue;
    windows.push({
      id: `AV-REC-${rec.id}`,
      tourLeaderId,
      eventType: RECORD_EVENT[rec.type],
      sourceId: rec.id,
      title: rec.reason || rec.type,
      start: rec.startDate,
      end: rec.endDate,
      isAllDay: rec.isAllDay,
      blocksAssignment: true,
      status: 'active',
      reason: rec.reason,
      startTime: rec.isAllDay ? undefined : rec.startTime,
      endTime: rec.isAllDay ? undefined : rec.endTime,
    });
  }

  return windows;
}

/**
 * §8 สรุปความว่างของหัวหน้าทัวร์ "สัมพันธ์กับเดือนที่เลือก" จากช่วงไม่ว่าง (windows)
 *   ว่างตลอดเดือน · ว่างวันนี้ · ว่างตั้งแต่ DD/MM/YY · ไม่ว่างทั้งเดือน
 */
export function monthFreeInfo(
  windows: UnavailableWindow[],
  monthStart: string,
  monthEnd: string,
  today: string,
): { free: boolean; freeDate: string | null; text: string } {
  const relevant = windows.filter((w) => w.blocksAssignment && w.start <= monthEnd && w.end >= monthStart);
  if (relevant.length === 0) return { free: true, freeDate: monthStart, text: 'ว่างตลอดเดือน' };
  const from = today > monthStart && today <= monthEnd ? today : monthStart;
  const covered = (iso: string) => relevant.some((w) => w.start <= iso && w.end >= iso);
  let free: string | null = null;
  for (let d = from; d <= monthEnd; d = addDays(d, 1)) {
    if (!covered(d)) { free = d; break; }
  }
  if (!free) return { free: false, freeDate: null, text: 'ไม่ว่างทั้งเดือน' };
  if (free === today) return { free: true, freeDate: free, text: 'ว่างวันนี้' };
  return { free: true, freeDate: free, text: `ว่างตั้งแต่ ${formatDate(free)}` };
}

/** ช่วง datetime ของ window (all-day → 00:00–23:59) */
function windowRange(w: UnavailableWindow): { startAt: string; endAt: string } {
  if (w.isAllDay) return { startAt: `${w.start}T00:00`, endAt: `${w.end}T23:59` };
  return {
    startAt: toDateTime(w.start, w.startTime ?? '00:00'),
    endAt: toDateTime(w.end, w.endTime ?? '23:59'),
  };
}

/* ------------------------------ ตรวจความว่าง ------------------------------ */

export type AvailabilityVerdict = 'ok' | 'warn' | 'blocked';

export interface AvailabilityResult {
  verdict: AvailabilityVerdict;
  reason?: string;
  detail?: string;
  conflictJobId?: string;
  eventType?: UnavailableEventType;
  /** ต้องให้ผู้จัดยืนยันก่อนมอบหมาย (§8) — จริงเมื่อ verdict = warn */
  needsConfirm?: boolean;
}

/** §4 ทับซ้อนเชิงเวลา (เข้มงวด: ชนขอบไม่นับ) */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** วันปฏิทินคาบเกี่ยวกันหรือไม่ (ระดับวัน) */
function shareDay(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function restDaysBetween(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  if (aEnd < bStart) return diffDays(aEnd, bStart) - 1;
  if (bEnd < aStart) return diffDays(bEnd, aStart) - 1;
  return 0;
}

function blockedReason(eventType: UnavailableEventType): string {
  switch (eventType) {
    case 'TOUR_ASSIGNMENT':
      return 'ไม่สามารถมอบหมาย — มีโปรแกรมทัวร์ทับซ้อน';
    case 'LEAVE':
      return 'ไม่สามารถมอบหมาย — อยู่ระหว่างวันลา';
    case 'APPOINTMENT':
      return 'ไม่สามารถมอบหมาย — มีนัดหมาย/กิจกรรมทับซ้อน';
    case 'COMPANY_WORK':
      return 'ไม่สามารถมอบหมาย — หัวหน้าทัวร์ติดงานบริษัทในช่วงเวลานี้';
    case 'UNAVAILABLE':
      return 'ไม่สามารถมอบหมาย — อยู่ในช่วงไม่พร้อมรับงาน';
    case 'TRAINING':
      return 'ไม่สามารถมอบหมาย — อยู่ในช่วงอบรม';
    default:
      return 'ไม่สามารถมอบหมาย — มีช่วงไม่ว่างทับซ้อน';
  }
}

function blockedDetail(w: UnavailableWindow): string {
  const r = windowRange(w);
  if (w.eventType === 'TOUR_ASSIGNMENT') {
    return `ทับกับ ${w.sourceId} วันที่ ${formatDateRange(w.start, w.end)}`;
  }
  if (!w.isAllDay) {
    return `ทับช่วง${EVENT_LABEL[w.eventType]} ${formatDate(w.start)} ${timeOf(r.startAt)}–${timeOf(r.endAt)}`;
  }
  return `${EVENT_LABEL[w.eventType]} (ทั้งวัน) วันที่ ${formatDateRange(w.start, w.end)}`;
}

/**
 * ตรวจว่ามอบหมายโปรแกรม `candidate` ให้หัวหน้าทัวร์ได้หรือไม่ เทียบปฏิทินช่วงไม่ว่าง
 *   blocked = วัน–เวลาทับซ้อนจริง (เลือกไม่ได้)
 *   warn    = วันเดียวกันแต่คนละเวลา / พักไม่พอ / ยังไม่มีเวลาเริ่มงาน (เลือกได้ แต่ต้องยืนยัน)
 *   ok      = ว่าง
 */
export function checkProgramAvailability(
  candidate: Pick<TourJob, 'id' | 'departDate' | 'returnDate' | 'meetingDateTime' | 'outboundFlight' | 'inboundFlight'>,
  windows: UnavailableWindow[],
  options: AvailabilityOptions = DEFAULT_AVAILABILITY_OPTIONS,
): AvailabilityResult {
  const prog = programBusyWindow(candidate);
  const relevant = windows.filter((w) => w.sourceId !== candidate.id && w.blocksAssignment);

  // 1) ทับซ้อนตามวัน–เวลาจริง → blocked
  for (const w of relevant) {
    const r = windowRange(w);
    if (overlaps(prog.startAt, prog.endAt, r.startAt, r.endAt)) {
      return {
        verdict: 'blocked',
        reason: blockedReason(w.eventType),
        detail: blockedDetail(w),
        conflictJobId: w.eventType === 'TOUR_ASSIGNMENT' ? w.sourceId : undefined,
        eventType: w.eventType,
      };
    }
  }

  // §7 ไม่มีเวลาเริ่มงาน → ตรวจเวลาไม่ครบ (เลือกได้ แต่ต้องยืนยัน)
  if (!prog.hasStartTime) {
    return {
      verdict: 'warn',
      needsConfirm: true,
      reason: 'ควรตรวจสอบ — โปรแกรมยังไม่ระบุเวลาเริ่มงาน',
      detail: 'จึงตรวจการทับซ้อนของเวลาได้ไม่ครบถ้วน โปรดยืนยันเวลาเริ่มปฏิบัติงานก่อน',
    };
  }

  // 2) วันเดียวกันกับวันลา/นัดหมาย แต่คนละเวลา → ควรตรวจสอบ (§5.2/§6)
  // ใช้ "วันที่ครอบคลุมจริง" จากเวลารายงานตัว–สิ้นสุด (อาจเริ่มก่อนวันเดินทาง เช่น รายงานตัวคืนก่อน)
  const progStartDay = prog.startAt.slice(0, 10);
  const progEndDay = prog.endAt.slice(0, 10);
  let sameDay: { w: UnavailableWindow; gap: number } | null = null;
  for (const w of relevant) {
    if (w.eventType === 'TOUR_ASSIGNMENT') continue;
    if (!shareDay(progStartDay, progEndDay, w.start, w.end)) continue;
    const r = windowRange(w);
    const gap = hoursBetween(prog.startAt >= r.endAt ? r.endAt : r.startAt, prog.startAt >= r.endAt ? prog.startAt : prog.endAt);
    if (!sameDay || gap < sameDay.gap) sameDay = { w, gap };
  }
  if (sameDay) {
    const r = windowRange(sameDay.w);
    const label = EVENT_LABEL[sameDay.w.eventType];
    return {
      verdict: 'warn',
      needsConfirm: true,
      reason: `ควรตรวจสอบ — เป็นงานในวันเดียวกับ${label}`,
      detail: `${label}ถึงเวลา ${timeOf(r.endAt)} · โปรแกรมเริ่ม ${timeOf(prog.startAt)} (ห่าง ${sameDay.gap} ชั่วโมง)`,
      eventType: sameDay.w.eventType,
    };
  }

  // 3) พักไม่เพียงพอระหว่างโปรแกรม (§8)
  if (options.minRestDays > 0) {
    let nearest: { w: UnavailableWindow; rest: number } | null = null;
    for (const w of relevant) {
      if (w.eventType !== 'TOUR_ASSIGNMENT') continue;
      const rest = restDaysBetween(prog.startDate, prog.endDate, w.start, w.end);
      if (rest < options.minRestDays && (!nearest || rest < nearest.rest)) nearest = { w, rest };
    }
    if (nearest) {
      return {
        verdict: 'warn',
        needsConfirm: true,
        reason: `ควรตรวจสอบ — พักไม่เพียงพอ (ควรพักอย่างน้อย ${options.minRestDays} วัน)`,
        detail: `ห่างจาก ${nearest.w.sourceId} เพียง ${nearest.rest} วัน`,
        conflictJobId: nearest.w.sourceId,
        eventType: nearest.w.eventType,
      };
    }
  }

  return { verdict: 'ok' };
}
