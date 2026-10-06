import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPayable, sortForPayment } from '../src/lib/logic/payments';
import type { ExpenseRequest } from '../src/types';

const doc = (over: Partial<ExpenseRequest>) =>
  ({ id: 'X', jobId: 'P-1', category: 'leader_fee', claimKind: 'per_diem', lines: [], status: 'approved', requestedAt: '2026-10-01', history: [], ...over }) as ExpenseRequest;

test('งานจ่ายเงิน — ใบเบิกที่อนุมัติแล้ว/รอโอน/จ่ายแล้ว · ไม่รวมใบเสร็จค่าใช้จ่ายจริง เอกสารนำเข้า และใบที่ยังไม่ผ่านตรวจ', () => {
  assert.equal(isPayable(doc({})), true);
  assert.equal(isPayable(doc({ status: 'awaiting_payment' })), true);
  assert.equal(isPayable(doc({ status: 'paid' })), true);
  assert.equal(isPayable(doc({ status: 'submitted' })), false);
  assert.equal(isPayable(doc({ category: 'actual', claimKind: undefined, status: 'approved' })), false); // รายงานการใช้เงิน
  assert.equal(isPayable(doc({ category: 'actual', claimKind: undefined, requesterKind: 'sendoff', claimMonth: '2026-10' })), true); // ค่าส่งกรุ๊ป
  assert.equal(isPayable(doc({ category: 'advance', sourceDoc: {} as ExpenseRequest['sourceDoc'] })), false);
});

test('เรียง — รอโอน → รอตั้งเรื่อง (ค้างนานก่อน) → จ่ายแล้ว (ล่าสุดก่อน)', () => {
  const list = [
    doc({ id: 'paid-old', status: 'paid', paidAt: '2026-10-01' }),
    doc({ id: 'appr-new', status: 'approved', requestedAt: '2026-10-05' }),
    doc({ id: 'paid-new', status: 'paid', paidAt: '2026-10-05' }),
    doc({ id: 'appr-old', status: 'approved', requestedAt: '2026-10-01' }),
    doc({ id: 'queue', status: 'awaiting_payment', requestedAt: '2026-10-03' }),
  ];
  assert.deepEqual(sortForPayment(list).map((e) => e.id), ['queue', 'appr-old', 'appr-new', 'paid-new', 'paid-old']);
});
