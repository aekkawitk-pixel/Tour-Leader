import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearReadiness, receiptsBlockedReason } from '../src/lib/logic/clearReadiness';
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
  assert.equal(r.label, 'ครบแล้ว · ทำนัดหมายได้');
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
    assert.equal(r.checks[1].na, true);
  }
});

test('พร้อมเคลียร์ — ซองเงิน: นับเฉพาะซองที่มอบหมายแล้ว · ไม่มีซองมอบหมาย = ผ่าน', () => {
  const notHanded = { id: 'E2' } as CashEnvelope; // การเงินจัด/ปิดซองแล้ว แต่ยังไม่ส่งมอบ
  const returned = { ...env(false), staffReturn: { at: 't', staffName: 'S', reason: 'x' } } as CashEnvelope; // ส่งคืนการเงินแล้ว
  for (const envs of [[], [notHanded], [returned]]) {
    const r = run({ envs, perDiem: doc('submitted') });
    assert.equal(r.checks[0].ok, true);
    assert.equal(r.checks[0].text, envs[0] === notHanded ? 'การเงินยังไม่ส่งมอบ' : 'ไม่มีซองมอบหมาย');
    assert.equal(r.checks[0].na, true);
    assert.equal(r.ready, true);
  }
  // มอบหมายแล้วยังไม่รับ = ไม่ผ่าน
  assert.equal(run({ envs: [env(false)], perDiem: doc('submitted') }).checks[0].ok, false);
});

test('พร้อมเคลียร์ — ยังไม่จบทริป: เบี้ยเลี้ยงยังไม่ใช่เรื่องค้าง · มีซองรอส่งมอบ = รอรับซองก่อน (ไม่ใช่ไม่มีค่าใช้จ่าย)', () => {
  const notHanded = { id: 'E2' } as CashEnvelope;
  const r = run({ started: false, ended: false, envs: [notHanded] });
  assert.equal(r.checks[1].text, 'รอรับซองก่อน');
  assert.equal(r.checks[1].na, true);
  assert.equal(r.checks[2].na, true);
  assert.equal(r.checks[2].text, 'ส่งได้ตั้งแต่ 12/10/26');
  // ไม่มีซอง ระหว่างเดินทาง
  assert.equal(run({ ended: false }).checks[1].text, 'บันทึกระหว่างเดินทาง');
  // ถือเงินแต่ยังไม่จบทริป = ยังไม่ใช่เรื่องค้าง
  const heldBefore = run({ started: true, ended: false, envs: [env(true)] });
  assert.equal(heldBefore.checks[1].na, true);
  assert.equal(heldBefore.checks[1].text, 'บันทึกระหว่างเดินทาง');
  // จบทริปแล้ว เบี้ยเลี้ยงยังไม่ทำ = ต้องทำ
  assert.equal(run({}).checks[2].ok, false);
});

test('พร้อมเคลียร์ — เบี้ยเลี้ยงร่าง / ใบเสร็จร่าง ยังไม่ครบ', () => {
  assert.equal(run({ perDiem: doc('draft') }).ready, false);
  assert.equal(run({ perDiem: doc('approved'), receipts: [doc('draft')] }).ready, false);
});

test('บันทึกใบเสร็จได้หรือยัง — ซองยังไม่ถึงมือ = ยังไม่ได้ · ไม่มีซอง / รับแล้ว / ส่งคืนการเงิน = ได้', () => {
  assert.equal(receiptsBlockedReason([]), null);
  assert.equal(receiptsBlockedReason([{ } as CashEnvelope]), 'รอการเงินส่งมอบซองก่อน');
  assert.equal(receiptsBlockedReason([env(false)]), 'ยืนยันรับซองก่อน');
  assert.equal(receiptsBlockedReason([env(true)]), null);
  assert.equal(receiptsBlockedReason([{ ...env(false), staffReturn: { at: 't', staffName: 'S', reason: 'x' } } as CashEnvelope]), null);
});

test('พร้อมเคลียร์ — ยังไม่จบทริป: ใบเสร็จที่บันทึกแล้วเป็นเทา (ยังเพิ่มได้อีก) · ต้องแก้ไขยังเป็นเรื่องต้องทำ', () => {
  const before = run({ started: false, ended: false, receipts: [doc('submitted'), doc('submitted'), doc('draft')] });
  const c = before.checks.find((x) => x.label === 'ใบเสร็จ')!;
  assert.equal(c.ok, true);
  assert.equal(c.na, true);
  assert.equal(c.text, 'บันทึกแล้ว 2 รายการ · ร่าง 1 · ยังไม่จบทริป');
  const fix = run({ started: true, ended: false, receipts: [doc('revise')] }).checks.find((x) => x.label === 'ใบเสร็จ')!;
  assert.equal(fix.ok, false);
});
