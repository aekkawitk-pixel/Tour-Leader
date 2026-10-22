/**
 * คำขอลาของหัวหน้าทัวร์ (พอร์ทัล /guide/profile/leave) — ตรรกะล้วน ทดสอบได้
 *
 * ต้นแบบ C4/C5: หน้าสถานะแยก "ช่วงไม่ว่างถัดไป" ออกจาก "คำขอลา" · ฟอร์มขอลาสั้น ๆ
 * (ประเภท · วันที่ · ช่วงเวลา · เหตุผล) และตรวจทริปที่ทับกับวันลาให้ก่อนส่ง
 */

import type { AvailabilityRecordType, LeaderAvailabilityRecord } from '@/types';

/** ประเภทที่หัวหน้าทัวร์ขอเองได้ — "ติดงานบริษัท" ฝ่ายจัดงานเป็นผู้บันทึก */
export const LEADER_LEAVE_TYPES: readonly AvailabilityRecordType[] = ['personal_leave', 'sick_leave', 'unavailable'];

export type LeaveSpan = 'full' | 'morning' | 'afternoon' | 'custom';

/** ช่วงเวลา — ครึ่งวันใช้ได้เฉพาะลาวันเดียว (หลายวันเลือกได้แค่ทั้งวันหรือระบุเวลาเอง) */
export const LEAVE_SPAN_OPTIONS: readonly { value: LeaveSpan; label: string; singleDayOnly?: boolean }[] = [
  { value: 'full', label: 'ทั้งวัน' },
  { value: 'morning', label: 'ครึ่งวันเช้า (09:00–12:00)', singleDayOnly: true },
  { value: 'afternoon', label: 'ครึ่งวันบ่าย (13:00–18:00)', singleDayOnly: true },
  { value: 'custom', label: 'ระบุเวลาเอง' },
];

/** ช่วงเวลา → ค่าที่เก็บในรายการวันลา (ทั้งวัน = ไม่มีเวลา) */
export function leaveSpanTimes(
  span: LeaveSpan,
  custom: { start: string; end: string },
): { isAllDay: boolean; startTime: string; endTime: string } {
  switch (span) {
    case 'full': return { isAllDay: true, startTime: '', endTime: '' };
    case 'morning': return { isAllDay: false, startTime: '09:00', endTime: '12:00' };
    case 'afternoon': return { isAllDay: false, startTime: '13:00', endTime: '18:00' };
    default: return { isAllDay: false, startTime: custom.start, endTime: custom.end };
  }
}

export interface DatedTrip {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
}

/** ช่วงวัน [aStart, aEnd] กับ [bStart, bEnd] มีวันร่วมกันไหม (ระดับวัน · นับวันขอบด้วย) */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** ทริปที่ทับกับวันลา — ระดับวัน (ลาครึ่งวันในวันเดินทางก็ถือว่าทับ) · เรียงวันออกเดินทาง */
export function overlappingTrips(trips: readonly DatedTrip[], start: string, end: string): DatedTrip[] {
  if (!start || !end) return [];
  return trips.filter((t) => overlaps(start, end, t.startDate, t.endDate)).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** คำขอลา/ช่วงไม่ว่างเดิมของคนนี้ที่ทับกัน (ไม่นับที่ถูกปฏิเสธ/ยกเลิก) — กันส่งซ้ำ */
export function overlappingRecords(
  records: readonly LeaderAvailabilityRecord[],
  leaderId: string,
  start: string,
  end: string,
): LeaderAvailabilityRecord[] {
  if (!start || !end) return [];
  return records.filter(
    (r) => r.leaderId === leaderId && r.approval !== 'rejected' && r.approval !== 'cancelled' && overlaps(start, end, r.startDate, r.endDate),
  );
}

/** ช่วงไม่ว่างที่กำลังจะถึง/กำลังมีผล — อนุมัติแล้ว · ปิดรับงาน · ยังไม่จบ · เรียงวันเริ่ม */
export function upcomingUnavailability(
  records: readonly LeaderAvailabilityRecord[],
  leaderId: string,
  today: string,
): LeaderAvailabilityRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId && r.approval === 'approved' && r.blocksAssignment && r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** คำขอลาที่หัวหน้าทัวร์ส่งเอง — ทุกสถานะ · วันลาใหม่สุดขึ้นก่อน */
export function leaderLeaveRequests(
  records: readonly LeaderAvailabilityRecord[],
  leaderId: string,
): LeaderAvailabilityRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId && r.createdByRole === 'leader')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}
