/**
 * ตรรกะสถานะการใช้งาน + วันลา/ช่วงไม่พร้อม — แยกจาก UI
 *   • แปลงรายการวันลา/ช่วงไม่พร้อม → UnavailableWindow (ป้อนเข้า engine ตรวจการมอบหมาย)
 *   • สถานะการใช้งาน (usage) และสถานะความพร้อมที่คำนวณ (§9)
 * ใช้ข้อมูลชุดเดียวกันทั้งระบบ — ไม่สร้างวันลา/สถานะแยกต่อหน้า
 */

import type {
  AvailabilityApproval,
  AvailabilityRecordType,
  LeaderAvailabilityRecord,
  TourJob,
  TourLeader,
} from '@/types';
import type { StatusMeta } from '@/lib/labels';
import { LEADER_STATUS, LEADER_USAGE_STATUS } from '@/lib/labels';
import { formatDate, formatDateRange } from '@/lib/format';
import { isBlockingJob } from './conflicts';

export const AVAILABILITY_TYPE: Record<AvailabilityRecordType, StatusMeta> = {
  sick_leave: { label: 'ลาป่วย', tone: 'amber' },
  personal_leave: { label: 'ลากิจ', tone: 'amber' },
  company_work: { label: 'ติดงานบริษัท', tone: 'blue' },
  unavailable: { label: 'ไม่พร้อมรับงาน', tone: 'orange' },
};

/** ลำดับแสดงใน Dropdown/ตัวกรอง (ตามสเปก) */
export const AVAILABILITY_TYPE_ORDER: AvailabilityRecordType[] = [
  'sick_leave',
  'personal_leave',
  'company_work',
  'unavailable',
];

/** ตรวจสอบว่าเป็นประเภทที่รองรับ (ใช้ validate ทั้งฟอร์มและ service) */
export function isValidAvailabilityType(value: string): value is AvailabilityRecordType {
  return (AVAILABILITY_TYPE_ORDER as string[]).includes(value);
}

export const AVAILABILITY_APPROVAL: Record<AvailabilityApproval, StatusMeta> = {
  pending: { label: 'รออนุมัติ', tone: 'amber' },
  approved: { label: 'อนุมัติแล้ว', tone: 'green' },
  rejected: { label: 'ปฏิเสธ', tone: 'red' },
  cancelled: { label: 'ยกเลิก', tone: 'slate' },
};

export function recordTypeLabel(record: Pick<LeaderAvailabilityRecord, 'type'>): string {
  return AVAILABILITY_TYPE[record.type].label;
}

/**
 * ข้อความวัน–เวลาของรายการ (§5) ใช้เหมือนกันทุกหน้า — มาตรฐาน DD/MM/YY HH:mm
 *   ทั้งวัน           → "14/07/26–16/07/26 · ทั้งวัน" (วันเดียว → "14/07/26 · ทั้งวัน")
 *   ระบุเวลาวันเดียว   → "14/07/26 09:00–12:00"
 *   ระบุเวลาข้ามวัน    → "14/07/26 23:00 ถึง 15/07/26 08:00"
 */
export function formatRecordSchedule(
  r: Pick<LeaderAvailabilityRecord, 'isAllDay' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
): string {
  if (r.isAllDay) return `${formatDateRange(r.startDate, r.endDate)} · ทั้งวัน`;
  if (r.startDate === r.endDate) return `${formatDate(r.startDate)} ${r.startTime}–${r.endTime}`;
  return `${formatDate(r.startDate)} ${r.startTime} ถึง ${formatDate(r.endDate)} ${r.endTime}`;
}

/** รายการของหัวหน้าทัวร์ (ใหม่→เก่าตามวันเริ่ม) */
export function recordsForLeader(
  records: LeaderAvailabilityRecord[],
  leaderId: string,
): LeaderAvailabilityRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** รายการมีผลครอบคลุมวันนี้ (ระดับวัน) */
export function isActiveOn(record: LeaderAvailabilityRecord, today: string): boolean {
  return record.approval !== 'cancelled' && record.approval !== 'rejected' && record.startDate <= today && record.endDate >= today;
}

/* --------------------------- สถานะการใช้งาน --------------------------- */

/** ป้ายสถานะการใช้งาน — อ่านจาก usageStatus โดยตรง (ไม่ปนกับความพร้อมรับงาน) */
export function usageStatus(leader: TourLeader): StatusMeta {
  return LEADER_USAGE_STATUS[leader.usageStatus];
}

/** ระงับการใช้งาน/สิ้นสุดการใช้งาน = ห้ามมอบหมายงานใหม่ทุกกรณี */
export function isUsageBlocked(leader: TourLeader): boolean {
  return leader.usageStatus !== 'active';
}

/* ---------------------- สถานะความพร้อมที่คำนวณ (§9) ---------------------- */

export type AvailabilityStatusKey =
  | 'suspended'
  | 'inactive'
  | 'not_ready'
  | 'company_work'
  | 'leave'
  | 'unavailable'
  | 'on_job'
  | 'available';

/**
 * สถานะความพร้อม คำนวณตามวันปัจจุบัน (ลำดับความสำคัญ)
 *   ระงับการใช้งาน > สิ้นสุดการใช้งาน > ไม่พร้อมรับงาน (ค่าหลัก)
 *   > ติดงานบริษัท/ลา/ไม่พร้อม (จากรายการตามช่วงวัน) > ติดงาน(ทัวร์) > พร้อมรับงาน
 */
export function computeAvailabilityStatus(
  leader: TourLeader,
  jobs: TourJob[],
  records: LeaderAvailabilityRecord[],
  today: string,
): { key: AvailabilityStatusKey; label: string; tone: StatusMeta['tone'] } {
  if (leader.usageStatus === 'suspended')
    return { key: 'suspended', label: LEADER_USAGE_STATUS.suspended.label, tone: 'red' };
  if (leader.usageStatus === 'ended')
    return { key: 'inactive', label: LEADER_USAGE_STATUS.ended.label, tone: 'slate' };
  if (leader.status === 'unavailable')
    return { key: 'not_ready', label: LEADER_STATUS.unavailable.label, tone: 'slate' };

  const activeRecords = records.filter(
    (r) => r.leaderId === leader.id && r.approval === 'approved' && isActiveOn(r, today),
  );
  if (activeRecords.some((r) => r.type === 'company_work'))
    return { key: 'company_work', label: 'ติดงานบริษัท', tone: 'blue' };
  if (activeRecords.some((r) => r.type === 'sick_leave' || r.type === 'personal_leave'))
    return { key: 'leave', label: 'ลา', tone: 'amber' };
  if (activeRecords.some((r) => r.type === 'unavailable'))
    return { key: 'unavailable', label: 'ไม่พร้อมรับงาน', tone: 'orange' };

  const onJob = jobs.some(
    (j) =>
      j.leaderId === leader.id &&
      isBlockingJob(j) &&
      j.departDate <= today &&
      j.returnDate >= today,
  );
  if (onJob) return { key: 'on_job', label: 'ติดงาน', tone: 'blue' };

  return { key: 'available', label: 'พร้อมรับงาน', tone: 'green' };
}

/**
 * สถานะความพร้อมแบบสองระดับ (§1/§5): พร้อมรับงาน / ไม่พร้อมรับงาน + เหตุผล
 *   available → พร้อมรับงาน · อื่น ๆ (ลา/ติดงานบริษัท/ไม่พร้อม/ติดงาน/ระงับ/ไม่ใช้งาน) → ไม่พร้อมรับงาน
 */
export function readinessStatus(
  leader: TourLeader,
  jobs: TourJob[],
  records: LeaderAvailabilityRecord[],
  today: string,
): { label: string; tone: StatusMeta['tone']; reason: string } {
  const s = computeAvailabilityStatus(leader, jobs, records, today);
  if (s.key === 'available') return { label: 'พร้อมรับงาน', tone: 'green', reason: '' };
  const reasonMap: Partial<Record<AvailabilityStatusKey, string>> = {
    leave: 'อยู่ในช่วงวันลา',
    company_work: 'ติดงานบริษัท',
    unavailable: 'อยู่ในช่วงไม่พร้อมรับงาน',
    on_job: 'กำลังปฏิบัติงานทัวร์',
    not_ready: 'ตั้งค่าความพร้อมรับงานเป็นไม่พร้อมรับงาน',
    suspended: LEADER_USAGE_STATUS.suspended.label,
    inactive: LEADER_USAGE_STATUS.ended.label,
  };
  return { label: 'ไม่พร้อมรับงาน', tone: 'orange', reason: reasonMap[s.key] ?? '' };
}

/** จำนวนรายการวันลา "กำลังมีผลหรือในอนาคต" (ใช้ทำ Badge แท็บ §6) */
export function activeOrUpcomingLeaveCount(
  records: LeaderAvailabilityRecord[],
  leaderId: string,
  today: string,
): number {
  return records.filter(
    (r) =>
      r.leaderId === leaderId &&
      r.approval !== 'cancelled' &&
      r.approval !== 'rejected' &&
      r.endDate >= today,
  ).length;
}

/** ช่วงไม่พร้อมที่ใกล้ที่สุด (มีผล วันนี้เป็นต้นไป) — ใช้แสดงในรายการ/สรุป */
export function nearestUnavailability(
  records: LeaderAvailabilityRecord[],
  leaderId: string,
  today: string,
): LeaderAvailabilityRecord | null {
  return (
    records
      .filter(
        (r) =>
          r.leaderId === leaderId &&
          (r.approval === 'approved' || r.approval === 'pending') &&
          r.endDate >= today,
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}
