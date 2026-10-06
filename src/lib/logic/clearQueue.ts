/**
 * กรุ๊ปที่พร้อมนัดเคลียร์เงิน — ขึ้นในหน้านัดหมายฝั่งการเงินให้กดนัดได้ทันที
 *
 * พร้อม = จบทริปแล้ว และหัวหน้าทัวร์ทำครบทุกอย่าง (กติกาเดียวกับฝั่งหัวหน้าทัวร์ — clearReadiness)
 *   ซองเงินรับครบ · ใบเสร็จบันทึกครบ (ไม่มีต้องแก้ / ร่างค้าง) · ส่งเบี้ยเลี้ยงแล้ว
 * ไม่ขึ้นเมื่อ: มีนัดเคลียร์อยู่แล้ว (รวมนัดที่หัวหน้าทัวร์ขอมา รอการเงินยืนยัน) · ปิดเคลียร์แล้ว
 * กรุ๊ปที่นับ = กรุ๊ปที่มีความเคลื่อนไหวทางเงิน (ซองที่ส่งมอบแล้ว · ใบเสร็จ · เบี้ยเลี้ยง) — ชุดเดียวกับหน้าเคลียร์เงินกรุ๊ป
 */

import type { Appointment, ExpenseRequest } from '@/types';
import { formatDate } from '../format';
import type { CashEnvelope } from './cashEnvelope';
import { clearReadiness, type ClearReadiness } from './clearReadiness';
import { summarizeGroupClear, type GroupClearSummary } from './groupClear';
import { tripEnded, tripStarted } from './tripPhase';

export interface ClearCandidate {
  periodId: string;
  endDate: string;
  summary: GroupClearSummary;
  readiness: ClearReadiness;
}

/** กรุ๊ปที่มีความเคลื่อนไหวทางเงิน */
export function moneyGroupIds(envelopes: CashEnvelope[], expenses: ExpenseRequest[]): string[] {
  return [...new Set([
    ...envelopes.filter((e) => e.sealed && (e.leaderAck || e.handover)).map((e) => e.periodId),
    ...expenses.filter((e) => (e.category === 'actual' || e.claimKind === 'per_diem') && e.status !== 'cancelled').map((e) => e.jobId),
  ])];
}

export function groupsReadyToClear(input: {
  periods: { internalId: string; startDate: string; endDate: string }[];
  today: string;
  envelopes: CashEnvelope[];
  expenses: ExpenseRequest[];
  appointments: Appointment[];
  /** กรุ๊ปที่ปิดเคลียร์แล้ว */
  closedIds: ReadonlySet<string>;
}): ClearCandidate[] {
  const booked = new Set(input.appointments.filter((a) => a.kind === 'clear' && a.status !== 'cancelled').map((a) => a.jobId));
  return input.periods
    .filter((p) => !input.closedIds.has(p.internalId) && !booked.has(p.internalId) && tripEnded(p, input.today))
    .map((p) => {
      const summary = summarizeGroupClear({
        periodId: p.internalId, startDate: p.startDate, endDate: p.endDate, today: input.today,
        envelopes: input.envelopes, expenses: input.expenses, closed: false,
      });
      const readiness = clearReadiness({
        started: tripStarted(p, input.today),
        ended: tripEnded(p, input.today),
        startText: formatDate(p.startDate),
        endText: formatDate(p.endDate || p.startDate),
        envs: summary.envelopes,
        receipts: summary.receipts,
        perDiem: summary.perDiem,
      });
      return { periodId: p.internalId, endDate: p.endDate, summary, readiness };
    })
    .filter((c) => c.readiness.ready)
    // จบทริปนานสุดก่อน — ค้างนานสุดนัดก่อน
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}
