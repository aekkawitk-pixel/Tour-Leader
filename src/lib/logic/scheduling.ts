/**
 * ตรรกะ "การจัดสเก็ต" — เมนู /jobs ทำหน้าที่จัดตาราง/มอบหมายหัวหน้าทัวร์เท่านั้น
 * ข้อมูลทัวร์ดึงสดจาก store (TourJob) ไม่คัดลอกเก็บแยก · เชื่อมต้นทางด้วย job.id (Tour/Group ID)
 *
 * ข้อจำกัด Demo: ไม่มีโมดูลทัวร์ต้นทางแยก, ไม่มีสถานะ cancelled จริง, ไม่มี Series/Departure ID
 *   → isCancelled() คืน false เสมอ (เตรียม hook ให้ต่อยอดเมื่อมี source cancellation)
 */

import type { TourJob } from '@/types';
import type { StatusMeta } from '@/lib/labels';

export type ScheduleStatus = 'not_ready' | 'unassigned' | 'assigned';

/** ป้ายสถานะการจัดสเก็ต (ใช้ StatusBadge เหมือนสถานะอื่นในระบบ) */
export const SCHEDULE_STATUS: Record<ScheduleStatus, StatusMeta> = {
  not_ready: { label: 'ข้อมูลไม่พร้อมจัดสเก็ต', tone: 'slate' },
  unassigned: { label: 'ยังไม่มีหัวหน้าทัวร์', tone: 'amber' },
  assigned: { label: 'มีหัวหน้าทัวร์แล้ว', tone: 'green' },
};

export const SCHEDULE_STATUS_ORDER: ScheduleStatus[] = ['not_ready', 'unassigned', 'assigned'];

/**
 * ทัวร์ถูกยกเลิกจากต้นทางหรือไม่ — Demo ยังไม่มี source cancellation (ไม่มีสถานะ cancelled)
 * จึงคืน false เสมอ · เตรียม hook อ่าน flag ในอนาคตไว้ให้ต่อยอด
 */
export function isCancelled(job: TourJob): boolean {
  return Boolean((job as { cancelled?: boolean }).cancelled);
}

/**
 * ความพร้อมของข้อมูลทัวร์สำหรับการจัดสเก็ต (§5)
 * ไม่พร้อมเมื่อ: กรุ๊ปถูกยกเลิก · ไม่มีวันเดินทาง · ไม่มีเวลาเดินทาง · ข้อมูลเที่ยวบินไม่ครบ
 */
export function scheduleReadiness(job: TourJob): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (isCancelled(job)) reasons.push('กรุ๊ปถูกยกเลิก');
  if (!job.departDate || !job.returnDate) reasons.push('ยังไม่มีวันเดินทาง');
  // เวลาเดินทาง = ส่วนเวลาของ meetingDateTime (00:00 ถือว่ายังไม่ได้ระบุจริงตาม default ของฟอร์ม)
  const meetingTime = job.meetingDateTime?.split('T')[1]?.slice(0, 5);
  if (!meetingTime || meetingTime === '00:00') reasons.push('ยังไม่มีเวลาเดินทาง');
  const noFlight = (f: TourJob['outboundFlight']) => !f?.flightNo || f.flightNo === '—';
  if (noFlight(job.outboundFlight) || noFlight(job.inboundFlight)) {
    reasons.push('ข้อมูลเที่ยวบินไม่ครบ');
  }
  return { ready: reasons.length === 0, reasons };
}

/** สถานะการจัดสเก็ตที่คำนวณจากข้อมูลทัวร์ (ไม่เก็บเป็น field แยก) */
export function scheduleStatus(job: TourJob): ScheduleStatus {
  if (!scheduleReadiness(job).ready) return 'not_ready';
  return job.leaderId ? 'assigned' : 'unassigned';
}

/** ทัวร์นำมาจัดสเก็ตได้ (ข้อมูลพร้อม + ไม่ถูกยกเลิก) — ใช้กรองรายการใน picker (§5) */
export function isSchedulable(job: TourJob): boolean {
  return !isCancelled(job) && scheduleReadiness(job).ready;
}
