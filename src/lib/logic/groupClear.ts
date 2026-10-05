/**
 * เคลียร์เงินกรุ๊ป — ตรรกะล้วน (ทดสอบได้ตรง ๆ)
 *
 * ต่อกรุ๊ป แยกทีละสกุลเงิน (ไม่แปลงอัตราแลกเปลี่ยน):
 *   ในซอง      = ยอดหน้าซองที่หัวหน้าทัวร์ยืนยันรับแล้ว
 *   ส่งแลนด์    = เงินที่หัวหน้าทัวร์บันทึกส่งแลนด์จากซอง
 *   ใช้ตามใบเสร็จ = ใบเสร็จที่บัญชีอนุมัติแล้ว (ไม่นับบรรทัดที่ไม่อนุมัติ)
 *   รอตรวจ     = ใบเสร็จที่หัวหน้าทัวร์ส่งแล้ว รอบัญชีตรวจ — ยังไม่หักจากคงเหลือ
 *   (ร่าง / ส่งกลับแก้ไข = หัวหน้าทัวร์ยังไม่ส่ง — นับแยก ไม่ใช่งานรอตรวจของบัญชี)
 *   คงเหลือ     = ในซอง − ส่งแลนด์ − ใช้ตามใบเสร็จ → บวก = หัวหน้าทัวร์ต้องคืน · ลบ = บริษัทจ่ายเพิ่ม
 * เบี้ยเลี้ยงโอนแยก (ไม่หักกลบกับเงินคืน) — แสดงสถานะใบเบิกให้เห็นในหน้าเดียว
 * วันกลับนับเป็นจบทริป · กำหนดเคลียร์ = วันกลับ + 14 วัน
 */

import type { ExpenseRequest } from '@/types';
import { envelopeBalance, sumAmounts, type CashEnvelope, type EnvelopeAmount } from './cashEnvelope';

export const CLEAR_DUE_DAYS = 14;

export type GroupClearStage = 'traveling' | 'waiting_leader' | 'waiting_docs' | 'ready' | 'closed';

export const GROUP_CLEAR_STAGE: Record<GroupClearStage, { label: string; tone: 'slate' | 'amber' | 'violet' | 'blue' | 'green' }> = {
  traveling: { label: 'กำลังเดินทาง', tone: 'slate' },
  waiting_leader: { label: 'รอหัวหน้าทัวร์ส่งเอกสาร', tone: 'amber' },
  waiting_docs: { label: 'รอตรวจเอกสาร', tone: 'violet' },
  ready: { label: 'พร้อมเคลียร์', tone: 'blue' },
  closed: { label: 'เคลียร์แล้ว', tone: 'green' },
};

const APPROVED = new Set(['approved', 'awaiting_payment', 'paid']);
/** ส่งแล้ว รอบัญชีตรวจ */
const TO_REVIEW = new Set(['submitted']);
/** หัวหน้าทัวร์ยังไม่ส่ง — ร่าง / ถูกส่งกลับให้แก้ */
const AT_LEADER = new Set(['draft', 'revise']);
const INACTIVE = new Set(['cancelled', 'rejected']);

export interface GroupClearSummary {
  periodId: string;
  envelopes: CashEnvelope[];
  /** ซองที่หัวหน้าทัวร์รับแล้ว */
  received: CashEnvelope[];
  /** ส่งมอบแล้ว ยังไม่มีการยืนยันรับ (ระหว่างทาง) — ยังไม่นับใน "ในซอง" แต่ให้การเงินเห็นว่าเงินออกไปแล้ว */
  inTransit: EnvelopeAmount[];
  receipts: ExpenseRequest[];
  perDiem: ExpenseRequest | null;
  balance: { currency: string; face: number; land: number; spent: number; pending: number; remaining: number }[];
  /** ส่งแล้ว รอบัญชีตรวจ — ใบเสร็จ (จำนวนใบ) / ใบเบิกเบี้ยเลี้ยง */
  toReview: { receipts: number; perDiem: boolean };
  /** หัวหน้าทัวร์ยังไม่ส่ง (ร่าง / ส่งกลับแก้ไข) — ใบเสร็จ (จำนวนใบ) / ใบเบิกเบี้ยเลี้ยง */
  atLeader: { receipts: number; perDiem: boolean };
  /** รวมเอกสารที่ยังไม่ผ่านตรวจ (รอตรวจ + หัวหน้าทัวร์ยังไม่ส่ง) — มีอยู่ = ยังปิดเคลียร์ไม่ได้ */
  pendingDocs: number;
  dueDate: string;
  overdue: boolean;
  stage: GroupClearStage;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const linesOf = (docs: ExpenseRequest[]): EnvelopeAmount[] =>
  docs.flatMap((e) => e.lines.filter((l) => !l.rejected).map((l) => ({ amount: l.amount, currency: l.currency })));

export function summarizeGroupClear(input: {
  periodId: string;
  endDate: string;
  today: string;
  envelopes: CashEnvelope[];
  expenses: ExpenseRequest[];
  closed: boolean;
}): GroupClearSummary {
  const { periodId, endDate, today } = input;
  const envelopes = input.envelopes.filter((e) => e.periodId === periodId && e.sealed).sort((a, b) => a.no - b.no);
  const received = envelopes.filter((e) => e.leaderAck);
  const receipts = input.expenses.filter((e) => e.jobId === periodId && e.category === 'actual' && e.status !== 'cancelled');
  const perDiem = input.expenses.find((e) => e.claimKind === 'per_diem' && e.jobId === periodId && !INACTIVE.has(e.status)) ?? null;

  const face = sumAmounts(received.flatMap((e) => e.sealed!.faceTotals));
  const inTransit = sumAmounts(envelopes.filter((e) => e.handover && !e.leaderAck && !e.staffReturn).flatMap((e) => e.sealed!.faceTotals));
  const land = sumAmounts(received.flatMap((e) => (e.landPayments ?? []).map((p) => ({ amount: p.amount, currency: p.currency }))));
  const spent = sumAmounts(linesOf(receipts.filter((r) => APPROVED.has(r.status))));
  const pendingAmt = sumAmounts(linesOf(receipts.filter((r) => TO_REVIEW.has(r.status))));
  const base = envelopeBalance(face, land, spent);
  const currencies = [...new Set([...base.map((b) => b.currency), ...pendingAmt.map((p) => p.currency)])];
  const balance = currencies.map((c) => {
    const b = base.find((x) => x.currency === c) ?? { currency: c, face: 0, land: 0, spent: 0, remaining: 0 };
    return { ...b, pending: pendingAmt.find((p) => p.currency === c)?.amount ?? 0 };
  });

  const toReview = { receipts: receipts.filter((r) => TO_REVIEW.has(r.status)).length, perDiem: !!perDiem && TO_REVIEW.has(perDiem.status) };
  const atLeader = { receipts: receipts.filter((r) => AT_LEADER.has(r.status)).length, perDiem: !!perDiem && AT_LEADER.has(perDiem.status) };
  const reviewCount = toReview.receipts + (toReview.perDiem ? 1 : 0);
  const leaderCount = atLeader.receipts + (atLeader.perDiem ? 1 : 0);
  const dueDate = addDays(endDate, CLEAR_DUE_DAYS);
  // บัญชีมีงานตรวจก่อน → รอตรวจ · ไม่มีงานตรวจแต่หัวหน้าทัวร์ยังค้างส่ง / ยังไม่มีเอกสารเลย → รอหัวหน้าทัวร์
  const stage: GroupClearStage = input.closed ? 'closed'
    : endDate > today ? 'traveling'
      : reviewCount > 0 ? 'waiting_docs'
        : leaderCount > 0 || (receipts.length === 0 && !perDiem && received.length > 0) ? 'waiting_leader'
          : 'ready';
  return {
    periodId, envelopes, received, inTransit, receipts, perDiem, balance, toReview, atLeader, pendingDocs: reviewCount + leaderCount, dueDate,
    overdue: stage !== 'closed' && stage !== 'traveling' && today > dueDate,
    stage,
  };
}
