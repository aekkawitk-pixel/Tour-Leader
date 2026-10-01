/**
 * ตรรกะ "ประวัติไกด์ถูกยกเลิกงาน" + Reminder การชดเชยงาน — แยกจาก UI/Store
 *
 * กติกา Reminder: กรุ๊ปที่ไกด์ถูกยกเลิกมีกำหนดเดินทางเดือน M (originalTravelDate) และยังไม่ได้ชดเชย
 * (pending) จะขึ้นเตือนเฉพาะตอนดูเดือนถัดไปจากเดือนเดินทางเดิม (M+1) เท่านั้น — ยึดตาม "เดือนที่กรุ๊ป
 * ควรจะเดินทาง" ไม่ใช่วันที่กดยกเลิก เพราะผู้จัดวางแผนงานเดือนถัดไปจากเดือนที่ไกด์เสียงานไป ไม่ใช่จาก
 * วันที่เอกสารยกเลิกถูกบันทึก (สองวันนี้อาจเป็นคนละเดือนกันได้ เช่น ยกเลิกล่วงหน้าข้ามเดือน)
 */

import { monthKeyOf, nextMonthKey } from '@/services/monthRosterStore';
import type { GuideCancellationRecord, TourLeader } from '@/types';

/**
 * สร้างรายการประวัติถูกยกเลิกงาน จากกรุ๊ป/พีเรียดในตาราง "การจัดสเก็ต" (Tour Period Master)
 * — คนละระบบกับ TourJob (ไม่มีฟิลด์ผู้ประสานงาน จึงใช้ผู้ที่กดยกเลิกเป็นผู้รับผิดชอบกรุ๊ป)
 */
export function buildCancellationRecordFromPeriod(
  id: string,
  period: { internalId: string; groupCode: string; displayName: string; route: string | null; startDate: string; endDate: string },
  leader: TourLeader,
  responsibleUser: string,
  cancelledDate: string,
): GuideCancellationRecord {
  return {
    id,
    leaderId: leader.id,
    leaderName: `${leader.firstName} ${leader.lastName}`,
    jobId: period.groupCode,
    jobTitle: period.displayName,
    route: period.route || '—',
    originalTravelDate: period.startDate,
    originalReturnDate: period.endDate,
    cancelledDate,
    responsibleUser: responsibleUser || '—',
    compensationStatus: 'pending',
  };
}

/** รายการของไกด์คนเดียว — ล่าสุดขึ้นก่อน */
export function cancellationsForLeader(
  records: GuideCancellationRecord[],
  leaderId: string,
): GuideCancellationRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId)
    .sort((a, b) => b.cancelledDate.localeCompare(a.cancelledDate));
}

/** ยังรอชดเชย และเดือนที่กำลังดูคือเดือนถัดไปจากเดือนที่กรุ๊ปควรเดินทางพอดี (M+1 เดือนเดียวเท่านั้น) */
export function isPendingReminder(record: GuideCancellationRecord, viewedMonthKey: string): boolean {
  return record.compensationStatus === 'pending' && nextMonthKey(monthKeyOf(record.originalTravelDate)) === viewedMonthKey;
}

/** ไกด์คนนี้มีรายการที่ต้องเตือนหรือไม่ ในเดือนที่กำลังดู */
export function hasPendingReminder(
  records: GuideCancellationRecord[],
  leaderId: string,
  viewedMonthKey: string,
): boolean {
  return records.some((r) => r.leaderId === leaderId && isPendingReminder(r, viewedMonthKey));
}

/** รายการที่ต้องเตือนของไกด์คนนี้ ในเดือนที่กำลังดู — ใช้กับ badge/รายละเอียด */
export function pendingRemindersForLeader(
  records: GuideCancellationRecord[],
  leaderId: string,
  viewedMonthKey: string,
): GuideCancellationRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId && isPendingReminder(r, viewedMonthKey))
    .sort((a, b) => b.cancelledDate.localeCompare(a.cancelledDate));
}

/**
 * ทุกรายการของไกด์คนนี้ที่กรุ๊ปมีกำหนดเดินทางเดือนก่อนเดือนที่กำลังดู 1 เดือนพอดี (M+1)
 * — รวมทั้งที่ชดเชยแล้วและยังไม่ชดเชย (ต่างจาก pendingRemindersForLeader ที่มีเฉพาะยังไม่ชดเชย)
 * ใช้กับ badge ที่ต้องนับความคืบหน้า (เช่น "2/1") และรายละเอียดที่อยากเห็นครบทุกรายการในช่วงนี้
 */
export function remindersInWindow(
  records: GuideCancellationRecord[],
  leaderId: string,
  viewedMonthKey: string,
): GuideCancellationRecord[] {
  return records
    .filter((r) => r.leaderId === leaderId && nextMonthKey(monthKeyOf(r.originalTravelDate)) === viewedMonthKey)
    .sort((a, b) => b.cancelledDate.localeCompare(a.cancelledDate));
}

/**
 * ความคืบหน้าการชดเชยของไกด์คนนี้ในเดือนที่กำลังดู — { total, compensated } เช่น total 2 compensated 1 = "2/1"
 * คืน null เมื่อไม่มีรายการในช่วงนี้เลย (ไม่ต้องแสดง badge)
 */
export function compensationProgress(
  records: GuideCancellationRecord[],
  leaderId: string,
  viewedMonthKey: string,
): { total: number; compensated: number } | null {
  const inWindow = remindersInWindow(records, leaderId, viewedMonthKey);
  if (inWindow.length === 0) return null;
  return { total: inWindow.length, compensated: inWindow.filter((r) => r.compensationStatus === 'compensated').length };
}

/** สรุปข้อความ Reminder สำหรับไกด์ 1 คน — ใช้กับ tooltip */
export function reminderSummary(records: GuideCancellationRecord[], leaderId: string, viewedMonthKey: string): string {
  const inWindow = remindersInWindow(records, leaderId, viewedMonthKey);
  const pending = inWindow.filter((r) => r.compensationStatus === 'pending');
  if (inWindow.length === 0) return '';
  if (pending.length === 0) return `ชดเชยครบแล้วทั้ง ${inWindow.length} กรุ๊ปที่ถูกยกเลิก`;
  if (pending.length === 1 && inWindow.length === 1) {
    const r = pending[0];
    return `มีประวัติถูกยกเลิกงาน (${r.jobId} · ${r.jobTitle}) และยังไม่ได้รับงานชดเชย`;
  }
  return `ถูกยกเลิกงาน ${inWindow.length} กรุ๊ป · ชดเชยแล้ว ${inWindow.length - pending.length} · ยังไม่ชดเชย ${pending.length} — กดดูรายละเอียด`;
}

/**
 * ช่วงวันที่ (เริ่ม-สิ้นสุด) ของกรุ๊ปที่ไกด์คนนี้ "เคย" ถูกจัดแล้วถูกยกเลิก — ไม่จำกัดสถานะชดเชย
 * ใช้วาดแถบสีแดงบนปฏิทินในเดือนที่ถูกยกเลิก (คนละเงื่อนไขกับ Reminder ที่จำกัดแค่เดือนถัดไป)
 */
export function cancelledSpansForLeader(
  records: GuideCancellationRecord[],
  leaderId: string,
): GuideCancellationRecord[] {
  return records.filter((r) => r.leaderId === leaderId);
}
