import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasManyReceipts, mergeDraftReceipts, receiptGroups } from '../src/lib/logic/expenseReceipts';
import type { ExpenseLine, ExpenseRequest } from '../src/types';

const line = (id: string, amount: number, extra: Partial<ExpenseLine> = {}) =>
  ({ id, expenseType: 'ค่าน้ำ', purpose: id, amount, currency: 'JPY', fxRate: 0.25, amountTHB: amount / 4, receiptNo: '—', evidenceFileName: 'a.jpg', ...extra }) as ExpenseLine;
const draft = (id: string, requestedAt: string, lines: ExpenseLine[], note = '') =>
  ({ id, jobId: 'P-1', category: 'actual', requestedAt, lines, totalTHB: 0, note, status: 'draft', history: [] }) as unknown as ExpenseRequest;

test('รวมร่างเป็นใบเบิกเดียว — ใช้เลขน้อยสุด · บรรทัดจำใบเสร็จเดิม · ยอดรวม · วันยื่นแรกสุด', () => {
  const m = mergeDraftReceipts([
    draft('EXP-2026-12', '2026-10-05', [line('L-1', 400)]),
    draft('EXP-2026-9', '2026-10-04', [line('L-2', 200), line('L-3', 40)], 'ร้านปิดเร็ว'),
  ]);
  assert.equal(m.id, 'EXP-2026-9');
  assert.equal(m.requestedAt, '2026-10-04');
  assert.deepEqual(m.lines.map((l) => [l.id, l.receiptId]), [['L-2', 'EXP-2026-9'], ['L-3', 'EXP-2026-9'], ['L-1', 'EXP-2026-12']]);
  assert.equal(m.totalTHB, 160);
  assert.equal(m.lines[0].note, 'ร้านปิดเร็ว');
  assert.equal(m.lines[1].note, undefined);
  assert.equal(m.note, '');
});

test('เลขบรรทัดซ้ำข้ามร่าง → เติมเลขร่างกันชน', () => {
  const m = mergeDraftReceipts([draft('EXP-1', '2026-10-01', [line('L-1', 1)]), draft('EXP-2', '2026-10-01', [line('L-1', 2)])]);
  assert.deepEqual(m.lines.map((l) => l.id), ['L-1', 'EXP-2-L-1']);
});

test('แยกบรรทัดตามใบเสร็จ — ใบเบิกแบบเดิมไม่มี receiptId = ใบเสร็จเดียว', () => {
  const lines = [line('a', 1, { receiptId: 'R1' }), line('b', 1, { receiptId: 'R2' }), line('c', 1, { receiptId: 'R1' })];
  assert.deepEqual(receiptGroups(lines).map((g) => [g.key, g.lines.map((l) => l.id)]), [['R1', ['a', 'c']], ['R2', ['b']]]);
  assert.equal(hasManyReceipts({ lines } as ExpenseRequest), true);
  assert.equal(hasManyReceipts({ lines: [line('x', 1), line('y', 1)] } as ExpenseRequest), false);
});
