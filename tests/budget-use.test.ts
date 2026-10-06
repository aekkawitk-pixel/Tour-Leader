import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetUseOf } from '../src/lib/logic/groupBudget';
import type { ExpenseRequest } from '../src/types';

const advance = {
  id: 'ADV', jobId: 'P1', category: 'advance', status: 'approved',
  lines: [
    { id: 'BUS', purpose: 'ค่ารถบัส', amount: 240000, currency: 'JPY' },
    { id: 'TOLL', purpose: 'ค่าทางด่วน', amount: 100000, currency: 'JPY' },
    { id: 'FOOD', purpose: 'ค่าอาหาร', amount: 4500, currency: 'JPY' },
  ],
} as unknown as ExpenseRequest;
const receipt = (id: string, budgetLineId: string | undefined, amount: number, status: ExpenseRequest['status'] = 'submitted') => ({
  id, jobId: 'P1', category: 'actual', status, lines: [{ id: 'l', amount, currency: 'JPY', ...(budgetLineId ? { budgetLineId } : {}) }],
} as unknown as ExpenseRequest);

test('เทียบรายการเบิก — ครบ / ใช้ไม่ครบ / เกิน / นอกรายการเบิก', () => {
  const bus = receipt('R1', 'BUS', 240000);
  const toll = receipt('R2', 'TOLL', 50000);
  const food = receipt('R3', 'FOOD', 6000);
  const extra = receipt('R4', undefined, 7000);
  const all = [advance, bus, toll, food, extra];
  assert.equal(budgetUseOf(all, bus).kind, 'full');
  const t = budgetUseOf(all, toll);
  assert.equal(t.kind, 'under');
  assert.equal(t.diff, -50000);
  const f = budgetUseOf(all, food);
  assert.equal(f.kind, 'over');
  assert.equal(f.diff, 1500);
  assert.equal(budgetUseOf(all, extra).kind, 'outside');
});

test('เทียบรายการเบิก — หลายใบผูกรายการเดียวกัน เทียบที่ยอดรวม · ใบที่ยกเลิกไม่นับ', () => {
  const a = receipt('R1', 'TOLL', 60000);
  const b = receipt('R2', 'TOLL', 40000);
  const cancelled = receipt('R3', 'TOLL', 99999, 'cancelled');
  const all = [advance, a, b, cancelled];
  assert.equal(budgetUseOf(all, a).kind, 'full');
  assert.equal(budgetUseOf(all, a).used, 100000);
});
