/**
 * ตรรกะคำนวณการเคลียร์งาน
 *
 * สูตรหลัก:  ยอดสุทธิ = ค่าใช้จ่ายที่อนุมัติ − เงินทดรอง
 *   • ยอดเป็นบวก  → บริษัทต้องจ่ายเพิ่ม
 *   • ยอดเป็นลบ   → หัวหน้าทัวร์ต้องคืนเงิน
 *   • ยอดเป็นศูนย์ → เคลียร์พอดี
 */

import type { Settlement, SettlementItem, SettlementSummary } from '@/types';
import { diffDays } from '@/lib/format';

export function summarizeSettlement(
  settlement: Settlement,
  today: string,
): SettlementSummary {
  const items = settlement.items;

  const claimedTHB = items.reduce((sum, i) => sum + i.claimedTHB, 0);
  const approvedTHB = items.reduce((sum, i) => sum + i.approvedTHB, 0);
  const netTHB = approvedTHB - settlement.advanceTHB;

  const isFinished = settlement.status === 'settled' || settlement.status === 'closed';
  const overdue = isFinished ? 0 : Math.max(0, diffDays(settlement.dueDate, today));

  return {
    advanceTHB: settlement.advanceTHB,
    claimedTHB,
    approvedTHB,
    netTHB,
    direction: netTHB > 0 ? 'company_pays' : netTHB < 0 ? 'leader_returns' : 'balanced',
    cutTHB: items.reduce((sum, i) => sum + Math.max(0, i.claimedTHB - i.approvedTHB), 0),
    missingDocCount: items.filter((i) => !i.hasReceipt).length,
    partialCount: items.filter((i) => i.decision === 'partial').length,
    rejectedCount: items.filter((i) => i.decision === 'rejected').length,
    pendingCount: items.filter((i) => i.decision === 'pending').length,
    overdueDays: overdue,
  };
}

/** ข้อความอธิบายทิศทางของยอดสุทธิ */
export function settlementDirectionLabel(summary: SettlementSummary): string {
  if (summary.direction === 'company_pays') return 'บริษัทต้องจ่ายเพิ่มให้หัวหน้าทัวร์';
  if (summary.direction === 'leader_returns') return 'หัวหน้าทัวร์ต้องคืนเงินบริษัท';
  return 'เคลียร์พอดี ไม่มียอดค้าง';
}

/** ผลของการตรวจรายการหนึ่งรายการ — คืนรายการใหม่ ไม่แก้ของเดิม */
export function applyReview(
  item: SettlementItem,
  decision: Exclude<SettlementItem['decision'], 'pending'>,
  approvedTHB: number,
  reason: string,
  reviewer: string,
  at: string,
): SettlementItem {
  const amount =
    decision === 'full' ? item.claimedTHB : decision === 'rejected' ? 0 : Math.max(0, approvedTHB);
  return {
    ...item,
    decision,
    approvedTHB: amount,
    reason: decision === 'full' ? '' : reason,
    reviewedBy: reviewer,
    reviewedAt: at,
  };
}

/** ตรวจครบทุกรายการแล้วหรือยัง */
export function isReviewComplete(settlement: Settlement): boolean {
  return settlement.items.length > 0 && settlement.items.every((i) => i.decision !== 'pending');
}

/** สรุปเงินทดรองค้างเคลียร์ทั้งระบบ */
export function totalOutstandingAdvance(settlements: Settlement[]): number {
  return settlements
    .filter((s) => s.status !== 'settled' && s.status !== 'closed')
    .reduce((sum, s) => sum + s.advanceTHB, 0);
}
