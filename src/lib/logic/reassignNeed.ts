/**
 * "ต้องเปลี่ยนหัวหน้าทัวร์" — กรุ๊ปที่มีหัวหน้าทัวร์คอนเฟิร์มแล้ว แต่คนเดิมไปไม่ได้แล้ว
 *
 * เกิดได้ 2 ทาง
 *   1) ระบบตั้งให้เอง (คำนวณสด ไม่บันทึก) — หัวหน้าทัวร์ที่คอนเฟิร์มแล้ว
 *        • มีวันลา / ติดงานบริษัท / ช่วงไม่พร้อม (อนุมัติแล้ว · กันการจัดงาน) ทับวันเดินทางของกรุ๊ป หรือ
 *        • สถานะการใช้งานเป็น ระงับ / สิ้นสุดการใช้งาน
 *      ยกเลิกวันลา / เปิดใช้งานคืน → กลับเป็น "คอนเฟิร์มแล้ว" เอง
 *   2) ผู้จัดกดตั้งเอง พร้อมเหตุผล (บันทึกใน assignment.assignmentStatus = REASSIGN_REQUIRED + reassignReason)
 *      เช่น หัวหน้าทัวร์แจ้งว่าไปไม่ได้ · ลูกค้าขอเปลี่ยนคน
 * ต่างจาก "ปฏิเสธ" = หัวหน้าทัวร์ไม่รับงานตั้งแต่แรก
 * ปิดได้ด้วยการเปลี่ยนคน (ยกเลิกการมอบหมาย แล้วจัดคนใหม่) หรือ (กรณีผู้จัดตั้งเอง) ยกเลิกสถานะนี้
 */

import type { LeaderAvailabilityRecord, TourLeader } from '@/types';
import type { GuidePeriodAssignment } from '@/services/guideAssignmentStore';
import { boardStatusFromAssignment, type BoardStatus } from './guideBoard';
import { AVAILABILITY_TYPE, formatRecordSchedule } from './availabilityStatus';
import { LEADER_USAGE_STATUS } from '@/lib/labels';

export interface EffectiveBoard {
  board: BoardStatus;
  /** เหตุผลของ "ต้องเปลี่ยนหัวหน้าทัวร์" */
  reason?: string;
  /** true = ระบบตั้งให้เอง (คำนวณสด) · false = ผู้จัดตั้ง */
  auto?: boolean;
}

/** เหตุที่ระบบตั้ง "ต้องเปลี่ยนหัวหน้าทัวร์" ให้เอง — null = ไม่มี */
export function autoReassignReason(
  period: { startDate: string; endDate: string },
  leader: Pick<TourLeader, 'id' | 'usageStatus'> | null | undefined,
  records: LeaderAvailabilityRecord[],
): string | null {
  if (!leader) return null;
  if (leader.usageStatus && leader.usageStatus !== 'active') return `หัวหน้าทัวร์${LEADER_USAGE_STATUS[leader.usageStatus].label}`;
  const end = period.endDate || period.startDate;
  const clash = records.find((r) => r.leaderId === leader.id && r.approval === 'approved' && r.blocksAssignment !== false
    && r.startDate <= end && r.endDate >= period.startDate);
  return clash ? `${AVAILABILITY_TYPE[clash.type].label} ${formatRecordSchedule(clash)} ทับวันเดินทาง` : null;
}

/** สถานะการจัดที่ใช้แสดงจริง — สถานะที่บันทึก + กรณีระบบตั้ง "ต้องเปลี่ยนหัวหน้าทัวร์" ให้เอง */
export function effectiveBoard(
  assignment: Pick<GuidePeriodAssignment, 'assignmentStatus' | 'reassignReason'> | null | undefined,
  period: { startDate: string; endDate: string } | null | undefined,
  leader: Pick<TourLeader, 'id' | 'usageStatus'> | null | undefined,
  records: LeaderAvailabilityRecord[],
): EffectiveBoard {
  const board = boardStatusFromAssignment(assignment?.assignmentStatus);
  if (board === 'REASSIGN_REQUIRED') return { board, reason: assignment?.reassignReason || 'ผู้จัดระบุว่าต้องเปลี่ยนหัวหน้าทัวร์', auto: false };
  if (board === 'CONFIRMED' && period) {
    const reason = autoReassignReason(period, leader, records);
    if (reason) return { board: 'REASSIGN_REQUIRED', reason, auto: true };
  }
  return { board };
}
