/**
 * Pending Confirmation Alerts — งานที่จัดให้หัวหน้าทัวร์คนนี้แล้ว แต่ยังไม่กดคอนเฟิร์ม
 *
 * ใช้เกณฑ์เดียวกับ "งานของฉัน" หน้าหลักพอร์ทัลหัวหน้าทัวร์ (src/app/guide/page.tsx):
 * ไม่นับงานที่ปฏิเสธไปแล้ว และไม่นับงานที่ทริปจบไปแล้ว (period.endDate < today)
 * เพื่อไม่ให้ตัวเลขต่างจากที่หน้า "งานของฉัน" แสดงจริง
 */

import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';

export function countPendingConfirmationJobs(leaderId: string | null, today: string): number {
  if (!leaderId) return 0;
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));

  return loadActiveGuideAssignments().filter((a) => {
    if (a.tourLeaderId !== leaderId || a.assignmentStatus !== 'PENDING_CONFIRMATION') return false;
    const period = periodById.get(a.periodId);
    return Boolean(period) && period!.endDate >= today;
  }).length;
}
