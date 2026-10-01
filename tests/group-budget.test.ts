/**
 * รายการงบของกรุ๊ป (ใบเบิกเงินทดรอง) ↔ ใบเสร็จของหัวหน้าทัวร์ (lib/logic/groupBudget)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { budgetItemsForGroup, budgetLineAmount, recordedByBudgetLine } from '../src/lib/logic/groupBudget';
import type { ExpenseLine, ExpenseRequest } from '../src/types';

const line = (id: string, amount: number, currency = 'JPY', extra: Partial<ExpenseLine> = {}): ExpenseLine => ({
  id, expenseType: '#หมวดโรงแรม/ที่พัก', purpose: 'ค่าโรงแรม', amount, currency, fxRate: 0.2057,
  amountTHB: Math.round(amount * 0.2057), receiptNo: '—', evidenceFileName: '—', ...extra,
});
const expense = (id: string, jobId: string, category: ExpenseRequest['category'], status: ExpenseRequest['status'], lines: ExpenseLine[]): ExpenseRequest => ({
  id, jobId, category, requesterId: 'U-003', requesterName: 'บัญชี', requestedAt: '2026-09-01', lines,
  totalTHB: 0, bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' }, note: '', status, history: [],
});

describe('groupBudget', () => {
  test('งบ = บรรทัดในใบเงินทดรองของกรุ๊ปนั้น (รวมร่าง) ไม่รวมใบที่ปฏิเสธ/ยกเลิก หรือกรุ๊ปอื่น', () => {
    const list = [
      expense('A1', 'G1', 'advance', 'draft', [line('B1', 456000), line('B2', 18000)]),
      expense('A2', 'G1', 'advance', 'rejected', [line('B3', 1)]),
      expense('A3', 'G2', 'advance', 'submitted', [line('B4', 1)]),
      expense('E1', 'G1', 'actual', 'submitted', [line('R1', 1)]),
    ];
    assert.deepEqual(budgetItemsForGroup(list, 'G1').map((b) => b.line.id), ['B1', 'B2']);
  });

  test('ยอดใช้จริงของแต่ละรายการงบ แยกสกุลเงิน ไม่นับใบเสร็จที่ยกเลิก', () => {
    const list = [
      expense('E1', 'G1', 'actual', 'submitted', [line('R1', 200000, 'JPY', { budgetLineId: 'B1' }), line('R2', 500, 'THB', { budgetLineId: 'B1' })]),
      expense('E2', 'G1', 'actual', 'approved', [line('R3', 256000, 'JPY', { budgetLineId: 'B1' })]),
      expense('E3', 'G1', 'actual', 'cancelled', [line('R4', 999, 'JPY', { budgetLineId: 'B1' })]),
      expense('E4', 'G1', 'actual', 'submitted', [line('R5', 100, 'JPY')]), // นอกรายการงบ
    ];
    const used = recordedByBudgetLine(list, 'G1').get('B1');
    assert.equal(used?.get('JPY'), 456000);
    assert.equal(used?.get('THB'), 500);
  });

  test('จำนวน × ราคา/หน่วย − ส่วนลด · ไม่ครบคืน null', () => {
    assert.equal(budgetLineAmount(36, 500), 18000);
    assert.equal(budgetLineAmount(3, 2500, 500), 7000);
    assert.equal(budgetLineAmount(undefined, 500), null);
    assert.equal(budgetLineAmount(3, undefined), null);
  });
});
