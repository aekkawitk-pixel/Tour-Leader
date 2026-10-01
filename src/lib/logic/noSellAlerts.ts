/**
 * งานที่โปรแกรมเป็น NO SELL แต่ยังมีหัวหน้าทัวร์ถูกจัดอยู่ — แหล่งข้อมูลเดียวของทุกช่องทางแจ้งเตือน
 *
 * ใช้ร่วมกันระหว่าง Banner ในหน้า Schedule · กระดิ่งแจ้งเตือน · ตัวเลขบนเมนู
 * เพื่อไม่ให้แต่ละที่นับกันคนละแบบ (ห้ามคัดลอกเงื่อนไขไปเขียนซ้ำ)
 *
 * อ่านจากข้อมูลจริงเสมอ: Assignment ที่ยังมีผล + สถานะขายล่าสุดจาก Tour Period Master
 * ไม่เก็บสถานะแจ้งเตือนซ้ำไว้อีกชุด — id ของการแจ้งเตือนคำนวณแบบคงที่จาก
 * assignmentId + เวลาที่เปลี่ยนสถานะขาย จึงได้ "หนึ่งรายการต่อ Assignment ต่อการเปลี่ยนหนึ่งครั้ง"
 */

import { formatDateRange } from '@/lib/format';
import { isNoSellPeriod } from '@/lib/logic/guideBoard';
import { loadActiveGuideAssignments, type GuidePeriodAssignment } from '@/services/guideAssignmentStore';
import { getTourPeriods, getSaleStatusChange, type SaleStatusChange } from '@/services/tourPeriodMaster';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

export interface NoSellAlert {
  /** id คงที่ — เท่ากันทุกครั้งที่คำนวณใหม่ จึงไม่เกิดรายการซ้ำเวลาเปิดหน้าใหม่ */
  id: string;
  assignment: GuidePeriodAssignment;
  period: TourPeriodMaster;
  tourLeaderId: string;
  change: SaleStatusChange | null;
  /** เลยวันเดินทางแล้ว = เกินกำหนดดำเนินการ */
  overdue: boolean;
}

/**
 * รายการงาน NO SELL ที่ยังมีหัวหน้าทัวร์ — เรียงตาม §8
 *   1) ใกล้วันเดินทางที่สุด (วันที่ผ่านมาแล้วขึ้นก่อน = เกินกำหนดดำเนินการ)
 *   2) เปลี่ยนสถานะล่าสุดขึ้นก่อนเมื่อวันเดินทางเท่ากัน
 */
export function listNoSellAlerts(today: string): NoSellAlert[] {
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  return loadActiveGuideAssignments()
    .map((a) => ({ a, p: periodById.get(a.periodId) ?? null }))
    .filter((x): x is { a: GuidePeriodAssignment; p: TourPeriodMaster } => isNoSellPeriod(x.p))
    .map(({ a, p }) => {
      const change = getSaleStatusChange(a.periodId);
      return {
        id: `NOSELL-${a.assignmentId}-${change?.at ?? 'master'}`,
        assignment: a,
        period: p,
        tourLeaderId: a.tourLeaderId,
        change,
        overdue: p.startDate < today,
      };
    })
    .sort((x, y) => x.period.startDate.localeCompare(y.period.startDate)
      || (y.change?.at ?? '').localeCompare(x.change?.at ?? ''));
}

/** ข้อความแจ้งเตือนหนึ่งรายการ — ใช้ชื่อหัวหน้าทัวร์จริงที่ผู้เรียกหาให้ */
export function noSellAlertMessage(alert: NoSellAlert, leaderName: string): string {
  return `โปรแกรม ${alert.period.groupCode}${alert.period.bus && alert.period.bus !== '-' ? ` (${alert.period.bus})` : ''}`
    + ` ถูกเปลี่ยนสถานะขายเป็น NO SELL แต่ยังมีหัวหน้าทัวร์ ${leaderName} ถูกจัดอยู่`
    + ` (เดินทาง ${formatDateRange(alert.period.startDate, alert.period.endDate)})`
    + ' กรุณาตรวจสอบและถอดหัวหน้าทัวร์ออก';
}
