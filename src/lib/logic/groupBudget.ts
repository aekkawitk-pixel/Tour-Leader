/**
 * รายการงบของกรุ๊ป — ตรรกะล้วน (ทดสอบได้ตรง ๆ)
 *
 * งบ = บรรทัดในใบเบิก "เงินทดรองก่อนเดินทาง" (category 'advance') ของกรุ๊ปนั้น ที่คนทำเบิกเตรียมไว้
 * หัวหน้าทัวร์บันทึกใบเสร็จ (category 'actual') แล้วเลือกว่าเป็นของรายการงบไหน (ExpenseLine.budgetLineId)
 * หน้านี้จึงเทียบ "งบ" กับ "ใช้จริงที่บันทึกแล้ว" ได้ทีละรายการ
 *
 * เห็นงบทันทีที่คนทำเบิกบันทึก (รวมร่าง) — ยกเว้นใบที่ถูกปฏิเสธ/ยกเลิก
 */

import type { ExpenseLine, ExpenseRequest, ExpenseStatus } from '@/types';
import { groupEnvelopeStatus, groupLines, type CashEnvelope, type NoEnvelopeMark } from './cashEnvelope';

/** ใบที่ไม่นับแล้ว — ทั้งฝั่งงบและฝั่งใช้จริง */
const INACTIVE: ReadonlySet<ExpenseStatus> = new Set<ExpenseStatus>(['rejected', 'cancelled']);

/**
 * "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" ที่ฝ่ายเบิกจ่ายเตรียมให้ (นำเข้าจากไฟล์ .xls / ตัวอย่างที่ติดมากับระบบ)
 * เป็นรายการงบให้หัวหน้าทัวร์เลือก "ตามรายการเบิก" — ไม่ใช่ใบเบิกที่หัวหน้าทัวร์ส่งมา
 * จึงไม่นับในรายการ/สถิติใบเบิกฝั่งผู้จัด (หน้าเบิกจ่าย, Dashboard)
 */
export function isGroupAdvanceDoc(e: ExpenseRequest): boolean {
  return Boolean(e.sourceDoc);
}

export interface BudgetItem {
  /** เลขใบเบิกเงินทดรองที่รายการนี้อยู่ */
  expenseId: string;
  line: ExpenseLine;
}

/** รายการงบทั้งหมดของกรุ๊ป (ตามลำดับในใบเบิก) */
export function budgetItemsForGroup(expenses: ExpenseRequest[], groupId: string): BudgetItem[] {
  return expenses
    .filter((e) => e.jobId === groupId && e.category === 'advance' && !INACTIVE.has(e.status))
    .flatMap((e) => e.lines.map((line) => ({ expenseId: e.id, line })));
}

/**
 * หัวหน้าทัวร์เห็นเอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls) ได้เมื่อการเงินจัดซองเสร็จแล้ว (ทุกรายการอยู่ในซองที่ปิดแล้ว)
 * หรือระบุว่ากรุ๊ปนี้ไม่มีซอง — ระหว่างรอจัด/กำลังจัด ยอดและรายการยังเปลี่ยนได้ จึงยังไม่ให้เห็นรายละเอียด
 * ไม่มีเอกสารนำเข้า = ไม่มีอะไรต้องรอ
 */
export function advanceDocsReleased(
  expenses: ExpenseRequest[],
  envelopes: CashEnvelope[],
  noEnvelopeMarks: NoEnvelopeMark[],
  groupId: string,
): boolean {
  const docs = expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === groupId && !INACTIVE.has(e.status));
  if (docs.length === 0) return true;
  const envs = envelopes.filter((e) => e.periodId === groupId);
  return groupEnvelopeStatus(groupLines(docs), envs, noEnvelopeMarks.find((m) => m.periodId === groupId)).stage !== 'packing';
}

/** รายการงบที่หัวหน้าทัวร์เห็นได้ — เอกสารเบิกกรุ๊ปที่ยังจัดซองไม่เสร็จถูกซ่อนไว้ก่อน */
export function leaderBudgetItems(
  expenses: ExpenseRequest[],
  envelopes: CashEnvelope[],
  noEnvelopeMarks: NoEnvelopeMark[],
  groupId: string,
): BudgetItem[] {
  if (advanceDocsReleased(expenses, envelopes, noEnvelopeMarks, groupId)) return budgetItemsForGroup(expenses, groupId);
  const hidden = new Set(expenses.filter(isGroupAdvanceDoc).map((e) => e.id));
  return budgetItemsForGroup(expenses, groupId).filter((b) => !hidden.has(b.expenseId));
}

/** ยอดใช้จริงที่บันทึกแล้วของแต่ละรายการงบ แยกสกุลเงิน — budgetLineId → (สกุลเงิน → ยอด) */
export function recordedByBudgetLine(expenses: ExpenseRequest[], groupId: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    if (e.jobId !== groupId || e.category !== 'actual' || INACTIVE.has(e.status)) continue;
    for (const l of e.lines) {
      if (!l.budgetLineId || l.rejected) continue; // บรรทัดที่บัญชีไม่อนุมัติ ไม่นับเป็นยอดใช้ไป
      const byCurrency = out.get(l.budgetLineId) ?? new Map<string, number>();
      byCurrency.set(l.currency, (byCurrency.get(l.currency) ?? 0) + l.amount);
      out.set(l.budgetLineId, byCurrency);
    }
  }
  return out;
}

/** จำนวน × ราคา/หน่วย − ส่วนลด — ไม่ครบคืน null (ให้ใช้ยอดที่กรอกตรง ๆ แทน) */
export function budgetLineAmount(quantity: number | undefined, unitPrice: number | undefined, discount = 0): number | null {
  if (quantity === undefined || unitPrice === undefined || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null;
  return Math.round((quantity * unitPrice - (discount || 0)) * 100) / 100;
}
