/**
 * กรุ๊ปที่หัวหน้าทัวร์ติดจริง — จากการจัดหัวหน้าทัวร์ลงกรุ๊ป (เมนูการจัดสเก็ต · guidePeriodAssignments)
 * + วันไป–กลับจาก Tour Period Master · ใช้คำนวณ "ติดงาน" ในความพร้อมรับงาน (แทนงานตัวอย่างเดิม)
 *
 * นับเป็นติดงาน: คอนเฟิร์มแล้ว + รอคอนเฟิร์ม (เสนองานไปแล้ว ถือว่ากันวันไว้) · ปฏิเสธ / ต้องเปลี่ยนคน = ไม่นับ
 */

import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { getTourPeriodById } from '@/services/tourPeriodMaster';

export interface LeaderTrip {
  leaderId: string;
  periodId: string;
  groupCode: string;
  programName: string;
  start: string;
  end: string;
  pending: boolean;
}

export function loadLeaderTrips(): LeaderTrip[] {
  const out: LeaderTrip[] = [];
  for (const a of loadActiveGuideAssignments()) {
    if (a.assignmentStatus !== 'CONFIRMED' && a.assignmentStatus !== 'PENDING_CONFIRMATION') continue;
    const p = getTourPeriodById(a.periodId);
    if (!p) continue;
    out.push({
      leaderId: a.tourLeaderId,
      periodId: a.periodId,
      groupCode: p.groupCode,
      programName: p.displayName,
      start: p.startDate,
      end: p.endDate || p.startDate,
      pending: a.assignmentStatus === 'PENDING_CONFIRMATION',
    });
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

/** กรุ๊ปที่ครอบวันนี้ (วันไปถึงวันกลับ รวมปลาย) */
export function tripOn(trips: LeaderTrip[], leaderId: string, today: string): LeaderTrip | null {
  return trips.find((t) => t.leaderId === leaderId && t.start <= today && t.end >= today) ?? null;
}

/** กรุ๊ปถัดไปที่ยังไม่ออกเดินทาง */
export function nextTrip(trips: LeaderTrip[], leaderId: string, today: string): LeaderTrip | null {
  return trips.find((t) => t.leaderId === leaderId && t.start > today) ?? null;
}
