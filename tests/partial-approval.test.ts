import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseApprovedTotals, expenseOriginalTotals, isPartiallyApproved, sumByCurrency } from '../src/app/guide/expenses/expenseAmounts';
import { recordedByBudgetLine } from '../src/lib/logic/groupBudget';
import type { ExpenseLine, ExpenseRequest } from '../src/types';

const line = (id: string, amount: number, currency: string, extra: Partial<ExpenseLine> = {}): ExpenseLine => ({
  id, expenseType: 'x', purpose: id, amount, currency, fxRate: 1, amountTHB: amount, receiptNo: '—', evidenceFileName: 'f', ...extra,
});
const expense = (lines: ExpenseLine[]): ExpenseRequest => ({
  id: 'E1', jobId: 'G1', category: 'actual', requesterId: 'TL', requesterName: 'TL', requestedAt: '2026-09-30', lines,
  totalTHB: 0, bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' }, note: '', status: 'approved', history: [],
});

test('อนุมัติบางรายการ — ยอดอนุมัติไม่รวมบรรทัดที่ไม่อนุมัติ แต่ยอดที่ขอยังครบ', () => {
  const e = expense([line('a', 2500, 'THB'), line('b', 3000, 'EUR', { rejected: true, rejectNote: 'ไม่มีใบเสร็จ' })]);
  assert.equal(isPartiallyApproved(e), true);
  assert.deepEqual(expenseApprovedTotals(e), [{ amount: 2500, currency: 'THB' }]);
  assert.deepEqual(expenseOriginalTotals(e).map((t) => t.currency).sort(), ['EUR', 'THB']);
  assert.deepEqual(sumByCurrency([e]), [{ amount: 2500, currency: 'THB' }]);
});

test('ยอดใช้ไปของรายการเบิก — ไม่นับบรรทัดที่บัญชีไม่อนุมัติ', () => {
  const e = expense([
    line('a', 1000, 'JPY', { budgetLineId: 'B1' }),
    line('b', 500, 'JPY', { budgetLineId: 'B1', rejected: true }),
  ]);
  assert.equal(recordedByBudgetLine([e], 'G1').get('B1')?.get('JPY'), 1000);
});
