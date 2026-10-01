import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffAdvanceDoc } from '../src/lib/import/advanceDiff';
import type { ParsedAdvanceItem } from '../src/lib/import/advanceXls';
import type { ExpenseLine } from '../src/types';

const item = (no: number, purpose: string, amount: number, description = '', category = 'ค่าโรงแรม'): ParsedAdvanceItem => ({
  no, category, purpose, description, discount: 0, currency: 'JPY', fxRate: 0.2, amount,
});
const line = (id: string, purpose: string, amount: number, description = '', category = 'ค่าโรงแรม'): ExpenseLine => ({
  id, expenseType: category, purpose, amount, currency: 'JPY', fxRate: 0.2, amountTHB: 0, receiptNo: '—', evidenceFileName: 'x.xls',
  ...(description ? { description } : {}),
});

test('แทรกรายการใหม่กลางใบ — รายการเดิมใช้ id เดิม ไม่เลื่อนตามลำดับ', () => {
  const old = [line('R-1', 'A', 100), line('R-2', 'B', 200)];
  const d = diffAdvanceDoc('R', old, [item(1, 'A', 100), item(2, 'NEW', 50), item(3, 'B', 200)], () => 0);
  assert.equal(d.lineIds[0], 'R-1');
  assert.equal(d.lineIds[2], 'R-2');
  // รายการใหม่อยู่ลำดับที่ 2 แต่ R-2 เป็นของ B อยู่แล้ว → ต้องได้ id อื่นที่ไม่ชน
  assert.ok(!['R-1', 'R-2'].includes(d.lineIds[1]));
  assert.equal(d.added.length, 1);
  assert.equal(d.removed.length, 0);
  assert.equal(d.unchangedCount, 2);
});

test('id ใหม่ไม่ชนกับ id เดิม (รวมรายการที่ถูกลบ)', () => {
  const old = [line('R-1', 'A', 100), line('R-2', 'GONE', 200)];
  const d = diffAdvanceDoc('R', old, [item(1, 'A', 100), item(2, 'NEW', 50)], () => 0);
  assert.equal(d.lineIds[0], 'R-1');
  assert.notEqual(d.lineIds[1], 'R-2');
  assert.equal(d.removed[0].line.id, 'R-2');
});

test('ลบรายการที่มีใบเสร็จผูกอยู่ — นับใบเสร็จที่จะหลุด', () => {
  const old = [line('R-1', 'A', 100), line('R-2', 'B', 200)];
  const d = diffAdvanceDoc('R', old, [item(1, 'A', 100)], (id) => (id === 'R-2' ? 3 : 0));
  assert.equal(d.orphanedReceipts, 3);
  assert.equal(d.removed[0].receipts, 3);
});

test('คำอธิบายเปลี่ยน — จับคู่ด้วยหมวด+รายการ (รอบ 2) และรายงานว่าเปลี่ยน', () => {
  const old = [line('R-1', 'ค่าโรงแรม/ที่พัก', 450000, 'Hotel Koyo 2 คืน')];
  const d = diffAdvanceDoc('R', old, [item(1, 'ค่าโรงแรม/ที่พัก', 675000, 'Hotel Koyo 3 คืน')], (id) => (id === 'R-1' ? 1 : 0));
  assert.deepEqual(d.lineIds, ['R-1']);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].receipts, 1);
  assert.ok(d.changed[0].changes.some((c) => c.startsWith('ยอด')));
  assert.ok(d.changed[0].changes.some((c) => c.startsWith('คำอธิบาย')));
});

test('ชื่อรายการซ้ำหลายแถว — แยกด้วยคำอธิบายก่อน ไม่สลับกัน', () => {
  const old = [line('R-12', '156 Restaurant Lucky', 69190, 'ลูกค้า', 'ค่าอาหาร'), line('R-13', '156 Restaurant Lucky', 1017, 'ไกด์ครึ่งราคา', 'ค่าอาหาร')];
  const d = diffAdvanceDoc('R', old, [
    item(1, '156 Restaurant Lucky', 1017, 'ไกด์ครึ่งราคา', 'ค่าอาหาร'),
    item(2, '156 Restaurant Lucky', 69190, 'ลูกค้า', 'ค่าอาหาร'),
  ], () => 0);
  assert.deepEqual(d.lineIds, ['R-13', 'R-12']);
  assert.equal(d.unchangedCount, 2);
});
