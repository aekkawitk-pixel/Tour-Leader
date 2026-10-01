/**
 * ยอดเงินฝั่งพอร์ทัลหัวหน้าทัวร์ — แสดงตามสกุลเงินเดิมของใบเสร็จ ไม่แปลงเป็นบาท (ตามที่ตกลง)
 * แต่ละบรรทัดในใบเบิกเดียวกันเลือกสกุลเงินของตัวเองได้ (ใบเสร็จใบเดียวมีหลายสกุลเงินได้) — ห้ามบวกข้ามสกุลเงินรวมกัน
 * จึงต้องจัดกลุ่มตามสกุลเงินทุกจุดที่รวมยอด ทั้งระดับบรรทัด/ใบเบิก/หลายใบเบิก
 */

import type { ExpenseRequest } from '@/types';
import { formatCurrency } from '@/lib/format';

export interface CurrencyAmount {
  amount: number;
  currency: string;
}

/** รวมยอดหลายรายการเข้าด้วยกัน แยกเป็นก้อนตามสกุลเงิน */
export function groupAmountsByCurrency(items: CurrencyAmount[]): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const { amount, currency } of items) {
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals.entries()].map(([currency, amount]) => ({ amount, currency }));
}

/** ยอดรวมของใบเบิกเดียว แยกเป็นก้อนตามสกุลเงิน — ใบเดียวอาจมีหลายสกุลเงินได้ (แต่ละบรรทัดเลือกเอง) */
export function expenseOriginalTotals(expense: ExpenseRequest): CurrencyAmount[] {
  return groupAmountsByCurrency(expense.lines.map((l) => ({ amount: l.amount, currency: l.currency })));
}

/** ยอดที่นับได้ของใบเบิก — ไม่รวมบรรทัดที่บัญชีไม่อนุมัติ (อนุมัติบางรายการ) · ยังไม่ตรวจ = เท่ากับยอดที่ขอ */
export function expenseApprovedTotals(expense: ExpenseRequest): CurrencyAmount[] {
  return groupAmountsByCurrency(expense.lines.filter((l) => !l.rejected).map((l) => ({ amount: l.amount, currency: l.currency })));
}

/** บัญชีไม่อนุมัติบางบรรทัดในใบนี้ */
export function isPartiallyApproved(expense: ExpenseRequest): boolean {
  return expense.lines.some((l) => l.rejected);
}

/** ยอดรวมหลายใบเบิก แยกเป็นก้อนตามสกุลเงิน (กันบวกข้ามสกุลเงินผิด ๆ) — ไม่นับบรรทัดที่ไม่อนุมัติ */
export function sumByCurrency(list: ExpenseRequest[]): CurrencyAmount[] {
  return groupAmountsByCurrency(list.flatMap((e) => expenseApprovedTotals(e)));
}

/**
 * เวลาที่ขอเบิกจริง — ใช้ submittedAt (เวลาจริงที่กดบันทึก) ก่อน เพราะ requestedAt ของใบเก่าเคยเก็บเป็น
 * "วันที่จำลองของ Demo" (DEMO_TODAY) ทำให้แสดง "ขอเมื่อ" ผิดวัน · ใบตั้งต้นที่ไม่มี submittedAt ใช้ requestedAt
 */
export function requestedAtOf(expense: ExpenseRequest): string {
  return expense.submittedAt ?? expense.requestedAt;
}

/** ต่อยอดรวมหลายสกุลเงินเป็นข้อความเดียว เช่น "270.00 JPY · 500.00 THB" */
export function formatMultiCurrency(totals: CurrencyAmount[]): string {
  if (totals.length === 0) return formatCurrency(0, 'THB');
  return totals.map((t) => formatCurrency(t.amount, t.currency)).join(' · ');
}
