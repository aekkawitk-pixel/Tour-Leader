/**
 * กรุ๊ปที่มีซองเงินส่งมอบถึงหัวหน้าทัวร์คนนี้ — ใช้ที่หน้า "รับซองเงิน"
 * (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 *
 * แสดง: ยังมีซองรอยืนยันรับ หรือทริปยังไม่เลยวันกลับ · กรุ๊ปที่มีซองรอยืนยันขึ้นก่อน แล้วเรียงตามวันเดินทาง
 */

import { envelopeStage, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';

export function leaderEnvelopeGroups(envelopes: CashEnvelope[], leaderId: string | null, today: string) {
  return [...new Set(envelopes.filter((e) => e.handover?.receiverId === leaderId).map((e) => e.periodId))]
    .map((periodId) => {
      const period = getTourPeriodById(periodId);
      const waiting = envelopes.some((e) => e.periodId === periodId && envelopeStage(e) === 'handed_over' && e.handover?.receiverId === leaderId && !e.staffReturn);
      return { periodId, period, waiting };
    })
    .filter((g) => g.waiting || (g.period?.endDate ?? '') >= today)
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || (a.period?.startDate ?? '').localeCompare(b.period?.startDate ?? ''));
}
