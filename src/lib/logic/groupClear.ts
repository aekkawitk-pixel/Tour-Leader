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
import type { FollowUp, GroupClearRecord } from '@/services/groupClearStore';
import { envelopeBalance, sumAmounts, type CashEnvelope, type EnvelopeAmount } from './cashEnvelope';

export const CLEAR_DUE_DAYS = 14;

export type GroupClearStage = 'traveling' | 'waiting_leader' | 'waiting_docs' | 'ready' | 'closed' | 'closed_partial';

export const GROUP_CLEAR_STAGE: Record<GroupClearStage, { label: string; tone: 'slate' | 'amber' | 'violet' | 'blue' | 'green' }> = {
  traveling: { label: 'กำลังเดินทาง', tone: 'slate' },
  waiting_leader: { label: 'รอหัวหน้าทัวร์ส่งเอกสาร', tone: 'amber' },
  waiting_docs: { label: 'รอตรวจเอกสาร', tone: 'violet' },
  ready: { label: 'พร้อมเคลียร์', tone: 'blue' },
  closed: { label: 'เคลียร์ครบ', tone: 'green' },
  closed_partial: { label: 'ปิดแบบมีค้าง', tone: 'amber' },
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
  /** ปิดแล้ว — true/'complete' = เคลียร์ครบ · 'partial' = ปิดแบบมีค้าง · false = ยังไม่ปิด */
  closed: boolean | 'complete' | 'partial';
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
  const stage: GroupClearStage = input.closed === 'partial' ? 'closed_partial' : input.closed ? 'closed'
    : endDate > today ? 'traveling'
      : reviewCount > 0 ? 'waiting_docs'
        : leaderCount > 0 || (receipts.length === 0 && !perDiem && received.length > 0) ? 'waiting_leader'
          : 'ready';
  return {
    periodId, envelopes, received, inTransit, receipts, perDiem, balance, toReview, atLeader, pendingDocs: reviewCount + leaderCount, dueDate,
    overdue: stage !== 'closed' && stage !== 'closed_partial' && stage !== 'traveling' && today > dueDate,
    stage,
  };
}

/* ------------------------------------------------------------------ */
/* เช็กลิสต์ความครบถ้วน — ครบทุกข้อ = เคลียร์ครบ                         */
/* ------------------------------------------------------------------ */

export type ClearCheckKey = 'envelopes' | 'receipts' | 'returned' | 'paidExtra' | 'perDiem' | 'landProof';

export interface ClearCheckItem {
  key: ClearCheckKey;
  label: string;
  ok: boolean;
  /** ค้างตรงไหน (ไม่ผ่าน) / สรุปที่ผ่าน */
  detail: string;
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EPS = 0.005;

/**
 * เช็กลิสต์ 6 ข้อของกรุ๊ป — ใช้ทั้งตอนกรอกในแผง (ค่าที่กำลังกรอก) และตอนแสดงผลหลังปิด (ค่าที่บันทึก)
 *   1) ซองถึงมือหัวหน้าทัวร์ครบ (ส่งมอบแล้วต้องยืนยันรับ · ไม่มีแจ้งไม่ได้รับ / ยอดไม่ตรง) — ซองที่ยังไม่ส่งมอบไม่นับ
 *   2) ใบเสร็จผ่านตรวจครบ (ไม่มีร่าง / รอตรวจ / ส่งกลับแก้)
 *   3) รับเงินคืนครบทุกสกุล (รับคืนจริง ≥ ยอดต้องคืน)
 *   4) ใช้เกินซอง → บริษัทจ่ายเพิ่มแล้วครบ
 *   5) เบี้ยเลี้ยงโอนแล้ว (หรือระบุว่าไม่มีเบี้ยเลี้ยง)
 *   6) ส่งแลนด์มีหลักฐาน (รูปใบรับเงิน) ทุกรายการ
 */
export function clearChecklist(
  s: GroupClearSummary,
  v: { returned: { currency: string; amount: number }[]; paidExtra: { currency: string; amount: number }[]; noPerDiem: boolean },
): ClearCheckItem[] {
  const handed = s.envelopes.filter((e) => e.handover || e.leaderAck);
  const envIssues = handed.flatMap((e) => [
    !e.leaderAck && !e.notReceived ? `ซอง ${e.no} รอหัวหน้าทัวร์รับ` : '',
    e.notReceived ? `ซอง ${e.no} แจ้งไม่ได้รับ` : '',
    e.mismatch ? `ซอง ${e.no} แจ้งยอดไม่ตรง` : '',
  ]).filter(Boolean);

  const pendingReceipts = s.toReview.receipts + s.atLeader.receipts;
  const amt = (list: { currency: string; amount: number }[], c: string) => list.filter((x) => x.currency === c).reduce((n, x) => n + x.amount, 0);
  const shortReturn = s.balance.filter((b) => b.remaining > EPS && amt(v.returned, b.currency) + EPS < b.remaining)
    .map((b) => `${b.currency} ขาด ${fmt(b.remaining - amt(v.returned, b.currency))}`);
  const toReturn = s.balance.filter((b) => b.remaining > EPS);
  // คืนเกินยอดที่ต้องคืน — บริษัทต้องคืนส่วนเกินให้หัวหน้าทัวร์
  const overReturn = [...new Set(v.returned.map((x) => x.currency))]
    .map((c) => ({ c, extra: amt(v.returned, c) - Math.max(0, s.balance.find((b) => b.currency === c)?.remaining ?? 0) }))
    .filter((x) => x.extra > EPS)
    .map((x) => `${x.c} คืนเกิน ${fmt(x.extra)}`);
  const shortExtra = s.balance.filter((b) => b.remaining < -EPS && amt(v.paidExtra, b.currency) + EPS < -b.remaining)
    .map((b) => `${b.currency} ค้าง ${fmt(-b.remaining - amt(v.paidExtra, b.currency))}`);
  const over = s.balance.filter((b) => b.remaining < -EPS);
  const land = s.received.flatMap((e) => (e.landPayments ?? []).map((lp) => ({ e, lp })));
  const noProof = land.filter((x) => !x.lp.evidenceImage);
  const pd = s.perDiem;

  return [
    { key: 'envelopes', label: 'ซองถึงมือหัวหน้าทัวร์ครบ', ok: envIssues.length === 0,
      detail: envIssues.length ? envIssues.join(' · ') : handed.length ? `รับครบ ${handed.length} ซอง` : 'ไม่มีซองที่ส่งมอบ' },
    { key: 'receipts', label: 'ใบเสร็จผ่านตรวจครบ', ok: pendingReceipts === 0,
      detail: pendingReceipts ? [s.toReview.receipts && `รอตรวจ ${s.toReview.receipts} ใบ`, s.atLeader.receipts && `หัวหน้าทัวร์ยังไม่ส่ง/ต้องแก้ ${s.atLeader.receipts} ใบ`].filter(Boolean).join(' · ') : `ผ่านตรวจ ${s.receipts.length} ใบ` },
    { key: 'returned', label: 'รับเงินคืนครบทุกสกุล (ไม่ขาด ไม่เกิน)', ok: shortReturn.length === 0 && overReturn.length === 0,
      detail: [...shortReturn, ...overReturn].join(' · ') || (toReturn.length ? `รับคืนครบ ${toReturn.map((b) => b.currency).join(', ')}` : 'ไม่มียอดต้องคืน') },
    { key: 'paidExtra', label: 'ใช้เกินซอง — บริษัทจ่ายเพิ่มแล้ว', ok: shortExtra.length === 0,
      detail: shortExtra.length ? shortExtra.join(' · ') : over.length ? `จ่ายเพิ่มครบ ${over.map((b) => b.currency).join(', ')}` : 'ไม่ได้ใช้เกินซอง' },
    { key: 'perDiem', label: 'เบี้ยเลี้ยงโอนแล้ว', ok: v.noPerDiem || pd?.status === 'paid',
      detail: v.noPerDiem ? 'ระบุว่ากรุ๊ปนี้ไม่มีเบี้ยเลี้ยง' : !pd ? 'ยังไม่มีใบเบิกเบี้ยเลี้ยง' : pd.status === 'paid' ? `โอนแล้ว${pd.paidRef ? ` · ${pd.paidRef}` : ''}` : `ใบเบิก ${pd.id} ยังไม่โอน` },
    { key: 'landProof', label: 'ส่งแลนด์มีหลักฐาน', ok: noProof.length === 0,
      detail: noProof.length ? `ไม่มีรูปใบรับเงิน ${noProof.length} รายการ (${noProof.map((x) => x.lp.landName).join(', ')})` : land.length ? `มีหลักฐานครบ ${land.length} รายการ` : 'ไม่มีการส่งแลนด์' },
  ];
}

/* ------------------------------------------------------------------ */
/* ยอดค้างติดตาม — หลังปิดแบบมีค้าง                                     */
/* ------------------------------------------------------------------ */

export const followUpCovered = (f: FollowUp) => f.payments.reduce((n, p) => n + p.covered, 0);
export const followUpRemaining = (f: FollowUp) => Math.max(0, f.amount - followUpCovered(f));
export const followUpOpen = (f: FollowUp) => followUpRemaining(f) > EPS;

/**
 * ยอดค้างจากเช็กลิสต์ ณ ตอนปิด — คืนขาด (หัวหน้าทัวร์ค้าง) · คืนเกิน / ใช้เกินซองที่ยังไม่จ่าย (บริษัทค้าง)
 */
export function followUpsFromClose(
  s: GroupClearSummary,
  v: { returned: { currency: string; amount: number }[]; paidExtra: { currency: string; amount: number }[] },
  at: string,
  by: string,
): FollowUp[] {
  const amt = (list: { currency: string; amount: number }[], c: string) => list.filter((x) => x.currency === c).reduce((n, x) => n + x.amount, 0);
  const out: FollowUp[] = [];
  const mk = (direction: FollowUp['direction'], reason: FollowUp['reason'], currency: string, amount: number) =>
    out.push({ id: `FU-${Date.now()}-${out.length + 1}`, direction, reason, currency, amount: Math.round(amount * 100) / 100, createdAt: at, createdBy: by, payments: [] });
  const currencies = [...new Set([...s.balance.map((b) => b.currency), ...v.returned.map((x) => x.currency)])];
  for (const c of currencies) {
    const remaining = s.balance.find((b) => b.currency === c)?.remaining ?? 0;
    const ret = amt(v.returned, c);
    if (remaining > EPS && ret + EPS < remaining) mk('leader_owes', 'short_return', c, remaining - ret);
    if (ret - Math.max(0, remaining) > EPS) mk('company_owes', 'over_return', c, ret - Math.max(0, remaining));
    const extra = amt(v.paidExtra, c);
    if (remaining < -EPS && extra + EPS < -remaining) mk('company_owes', 'over_spend', c, -remaining - extra);
  }
  return out;
}

/**
 * ค่าที่ใช้คิดเช็กลิสต์หลังปิด — นับการชำระยอดค้างเข้าไปด้วย
 *   หัวหน้าทัวร์ชำระยอดคืนขาด → บวกเข้าเงินคืน · บริษัทคืนส่วนที่คืนเกิน → หักออกจากเงินคืน
 *   บริษัทจ่ายส่วนที่ใช้เกินซอง → บวกเข้าจ่ายเพิ่ม
 * ชำระครบทุกยอด (และข้ออื่นผ่าน) → กรุ๊ปที่ปิดแบบมีค้างกลายเป็น "เคลียร์ครบ" เอง
 */
export function effectiveClearValues(rec: GroupClearRecord | undefined) {
  const returned = [...(rec?.returned ?? [])];
  const paidExtra = [...(rec?.paidExtra ?? [])];
  for (const f of rec?.followUps ?? []) {
    const covered = followUpCovered(f);
    if (covered <= 0) continue;
    if (f.reason === 'short_return') returned.push({ currency: f.currency, amount: covered });
    if (f.reason === 'over_return') returned.push({ currency: f.currency, amount: -covered });
    if (f.reason === 'over_spend') paidExtra.push({ currency: f.currency, amount: covered });
  }
  return { returned, paidExtra, noPerDiem: !!rec?.noPerDiem };
}
