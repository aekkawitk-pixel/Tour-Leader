import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterTripProgress } from '../src/lib/logic/afterTripProgress';
import type { Appointment, ExpenseRequest } from '../src/types';

const doc = (status: ExpenseRequest['status']) => ({ id: `D-${status}`, status } as ExpenseRequest);
const apt = (status: Appointment['status']) => ({ id: 'A1', date: '2026-10-20', time: '10:00', status, kind: 'clear' } as Appointment);
const run = (p: Partial<Parameters<typeof afterTripProgress>[0]>) => afterTripProgress({
  periodId: 'P1', receipts: [], perDiem: null, clearAppointment: null, formatWhen: (a) => `${a.date} ${a.time}`, ...p,
});

test('หลังเดินทาง — ยังไม่ทำอะไร: ขั้นต่อไปคือเบิกเบี้ยเลี้ยง (ใบเสร็จไม่บังคับ)', () => {
  const r = run({});
  assert.equal(r.next.label, 'เบิกเบี้ยเลี้ยง');
  assert.equal(r.next.href, '/guide/settlement/allowance');
  assert.equal(r.steps[0].value, 'ยังไม่มี');
  assert.equal(r.recordHref, '/guide/expenses/record?filter=after&period=P1');
});

test('หลังเดินทาง — ใบเสร็จต้องแก้มาก่อนทุกอย่าง', () => {
  const r = run({ receipts: [doc('approved'), doc('revise')], perDiem: null });
  assert.equal(r.next.label, 'แก้ไขใบเสร็จ');
  assert.equal(r.next.href, '/guide/settlement/claim?period=P1', 'ต้องพาไปเปิดกรุ๊ปนั้นโดยตรง');
  assert.equal(r.steps[0].state, 'action');
});

test('หลังเดินทาง — เบี้ยเลี้ยงร่าง/ต้องแก้ ต้องไปส่ง', () => {
  assert.equal(run({ perDiem: doc('draft') }).next.label, 'ส่งใบเบิกเบี้ยเลี้ยง');
  assert.equal(run({ perDiem: doc('revise') }).next.href, '/guide/settlement/allowance');
});

test('หลังเดินทาง — นัดรอยืนยันมาก่อนเบี้ยเลี้ยง (มีวันเวลากำกับ)', () => {
  for (const perDiem of [null, doc('draft'), doc('submitted')]) {
    const r = run({ perDiem, clearAppointment: apt('pending') });
    assert.equal(r.next.label, 'ยืนยันนัดเคลียร์เงิน');
    assert.equal(r.next.href, '/guide/settlement/appointments');
  }
});

test('หลังเดินทาง — รอฝั่งการเงิน/บัญชี ไม่มีปุ่ม', () => {
  assert.equal(run({ perDiem: doc('submitted') }).next.href, undefined);
  assert.equal(run({ perDiem: doc('approved') }).next.label, 'รอการเงินนัดเคลียร์เงิน');
  assert.equal(run({ perDiem: doc('approved'), clearAppointment: apt('confirmed') }).next.label, 'เข้าพบตามนัด 2026-10-20 10:00');
  assert.equal(run({ perDiem: doc('paid'), clearAppointment: apt('attended') }).next.label, 'รอการเงินปิดเคลียร์');
});
