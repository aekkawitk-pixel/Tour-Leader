import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearReadiness } from '../src/lib/logic/clearReadiness';
import type { CashEnvelope } from '../src/lib/logic/cashEnvelope';
import type { ExpenseRequest } from '../src/types';

const doc = (status: ExpenseRequest['status']) => ({ id: `D-${status}`, status } as ExpenseRequest);
const env = (acked: boolean) => ({ id: 'E', handover: { at: 't', byName: 'fin', receiverKind: 'leader', receiverId: 'L', receiverName: 'L' }, ...(acked ? { leaderAck: { at: 't', leaderId: 'L', leaderName: 'L' } } : {}) } as CashEnvelope);
const run = (p: Partial<Parameters<typeof clearReadiness>[0]>) => clearReadiness({
  started: true, ended: true, startText: '08/10/26', endText: '12/10/26', envs: [], receipts: [], perDiem: null, ...p,
});

test('พร้อมเคลียร์ — ยังไม่ออก / กำลังเดินทาง = ยังไม่ถึงขั้นเคลียร์ บอกวันที่เคลียร์ได้', () => {
  const before = run({ started: false, ended: false });
  assert.equal(before.label, 'ยังไม่ออกเดินทาง');
  assert.match(before.detail, /เคลียร์ได้ตั้งแต่วันกลับ 12\/10\/26/);
  assert.equal(run({ ended: false }).label, 'กำลังเดินทาง');
  assert.equal(before.ready, false);
});

test('พร้อมเคลียร์ — ครบ: ซองรับครบ ใบเสร็จมี เบี้ยเลี้ยงส่งแล้ว', () => {
  const r = run({ envs: [env(true)], receipts: [doc('submitted')], perDiem: doc('submitted') });
  assert.equal(r.ready, true);
  assert.equal(r.label, 'ครบแล้ว');
  assert.ok(r.checks.every((c) => c.ok));
});

test('พร้อมเคลียร์ — ขาด: บอกจำนวนและรายการที่ต้องทำ', () => {
  const r = run({ envs: [env(false), env(true)], receipts: [doc('approved'), doc('revise')], perDiem: null });
  assert.equal(r.ready, false);
  assert.equal(r.label, 'ยังไม่ครบ 3 อย่าง');
  assert.match(r.detail, /ซองเงิน \(ยังไม่ยืนยันรับ 1 ซอง\)/);
  assert.match(r.detail, /ใบเสร็จ \(ต้องแก้ไข 1 รายการ\)/);
  assert.match(r.detail, /เบี้ยเลี้ยง \(ยังไม่ทำใบเบิก\)/);
});

test('พร้อมเคลียร์ — ใบเสร็จบังคับเฉพาะกรุ๊ปที่มีเงินในมือ', () => {
  // ถือซองอยู่ ไม่มีใบเสร็จ = ยังไม่ครบ
  const held = run({ envs: [env(true)], perDiem: doc('submitted') });
  assert.equal(held.ready, false);
  assert.equal(held.checks[1].text, 'ยังไม่ได้บันทึก');
  // ไม่มีซอง / ส่งต่อแล้ว / ส่งแลนด์ทั้งซอง = ไม่มีค่าใช้จ่ายต้องบันทึก
  const forwarded = { ...env(true), leaderForward: { at: 't', byName: 'L', toName: 'X', photo: '' } } as CashEnvelope;
  const toLand = { ...env(true), landPayments: [{ id: 'LP', at: 't', byName: 'L', landName: '', amount: 1, currency: 'JPY' }] } as CashEnvelope;
  for (const envs of [[], [forwarded], [toLand]]) {
    const r = run({ envs, perDiem: doc('submitted') });
    assert.equal(r.ready, true);
    assert.equal(r.checks[1].text, 'ไม่มีค่าใช้จ่าย');
  }
});

test('พร้อมเคลียร์ — ซองเงิน: นับเฉพาะซองที่มอบหมายแล้ว · ไม่มีซองมอบหมาย = ผ่าน', () => {
  const notHanded = { id: 'E2' } as CashEnvelope; // การเงินจัด/ปิดซองแล้ว แต่ยังไม่ส่งมอบ
  const returned = { ...env(false), staffReturn: { at: 't', staffName: 'S', reason: 'x' } } as CashEnvelope; // ส่งคืนการเงินแล้ว
  for (const envs of [[], [notHanded], [returned]]) {
    const r = run({ envs, perDiem: doc('submitted') });
    assert.equal(r.checks[0].ok, true);
    assert.equal(r.checks[0].text, 'ไม่มีซองมอบหมาย');
    assert.equal(r.ready, true);
  }
  // มอบหมายแล้วยังไม่รับ = ไม่ผ่าน
  assert.equal(run({ envs: [env(false)], perDiem: doc('submitted') }).checks[0].ok, false);
});

test('พร้อมเคลียร์ — เบี้ยเลี้ยงร่าง / ใบเสร็จร่าง ยังไม่ครบ', () => {
  assert.equal(run({ perDiem: doc('draft') }).ready, false);
  assert.equal(run({ perDiem: doc('approved'), receipts: [doc('draft')] }).ready, false);
});
