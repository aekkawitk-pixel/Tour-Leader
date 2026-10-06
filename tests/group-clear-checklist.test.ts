import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearChecklist, summarizeGroupClear } from '../src/lib/logic/groupClear';
import type { CashEnvelope } from '../src/lib/logic/cashEnvelope';
import type { ExpenseRequest } from '../src/types';

const TODAY = '2026-10-06';
const envelope = (over: Partial<CashEnvelope> = {}): CashEnvelope => ({
  id: 'E1', periodId: 'P1', no: 1, kind: 'advance', packedLineIds: ['x'], history: [],
  sealed: { at: 't', byName: 'fin', faceTotals: [{ amount: 1000, currency: 'JPY' }], lineSnapshot: [] },
  handover: { at: 't', byName: 'fin', receiverKind: 'leader', receiverId: 'L1', receiverName: 'L' },
  leaderAck: { at: 't', leaderId: 'L1', leaderName: 'L' },
  ...over,
} as CashEnvelope);
const receipt = (status: ExpenseRequest['status'], amount = 300) => ({
  id: `R-${status}`, jobId: 'P1', category: 'actual', status, lines: [{ id: 'l', amount, currency: 'JPY' }],
} as unknown as ExpenseRequest);
const summary = (p: { startDate?: string; endDate?: string; envs?: CashEnvelope[]; expenses?: ExpenseRequest[] }) => summarizeGroupClear({
  periodId: 'P1', startDate: p.startDate ?? '2026-09-01', endDate: p.endDate ?? '2026-09-05', today: TODAY,
  envelopes: p.envs ?? [], expenses: p.expenses ?? [], closed: false,
});
const NO_VALUES = { returned: [], paidExtra: [], noPerDiem: false };
const item = (list: ReturnType<typeof clearChecklist>, key: string) => list.find((c) => c.key === key)!;

test('เคลียร์เงินกรุ๊ป — ยังไม่ออกเดินทาง ≠ กำลังเดินทาง', () => {
  assert.equal(summary({ startDate: '2026-10-08', endDate: '2026-10-12' }).stage, 'upcoming');
  assert.equal(summary({ startDate: '2026-10-01', endDate: '2026-10-12' }).stage, 'traveling');
});

test('เคลียร์เงินกรุ๊ป — ยังไม่จบทริป: ข้อ 2–6 ยังไม่ตรวจ (เทา) · ข้อซองตรวจได้เลย', () => {
  const s = summary({ startDate: '2026-10-08', endDate: '2026-10-12', envs: [envelope()] });
  const checks = clearChecklist(s, NO_VALUES);
  assert.equal(item(checks, 'envelopes').na, undefined);
  for (const k of ['receipts', 'returned', 'paidExtra', 'perDiem', 'landProof']) {
    assert.equal(item(checks, k).na, true);
    assert.equal(item(checks, k).detail, 'ตรวจได้หลังจบทริป');
  }
});

test('เคลียร์เงินกรุ๊ป — ถือเงินแต่ไม่มีใบเสร็จ = ไม่ผ่าน · คืนเงินครบทั้งก้อน = ผ่าน · ไม่มีเงินในมือ = ไม่เกี่ยวข้อง', () => {
  const held = summary({ envs: [envelope()] });
  assert.equal(item(clearChecklist(held, NO_VALUES), 'receipts').ok, false);
  const returnedAll = clearChecklist(held, { ...NO_VALUES, returned: [{ currency: 'JPY', amount: 1000 }] });
  assert.equal(item(returnedAll, 'receipts').ok, true);
  const none = item(clearChecklist(summary({}), NO_VALUES), 'receipts');
  assert.equal(none.na, true);
  assert.equal(none.detail, 'ไม่มีค่าใช้จ่าย');
  // มีใบเสร็จผ่านตรวจ = ผ่าน
  assert.equal(item(clearChecklist(summary({ envs: [envelope()], expenses: [receipt('approved')] }), NO_VALUES), 'receipts').ok, true);
});

test('เคลียร์เงินกรุ๊ป — ซองค่า Land ยังไม่ส่งแลนด์ = ไม่ผ่าน · ส่งแลนด์แล้วมีหลักฐาน = ผ่าน · ไม่มีส่งแลนด์ = ไม่เกี่ยวข้อง', () => {
  const unpaid = item(clearChecklist(summary({ envs: [envelope({ kind: 'land' })] }), NO_VALUES), 'landProof');
  assert.equal(unpaid.ok, false);
  assert.match(unpaid.detail, /ซอง 1 \(ค่า Land\) ยังไม่ส่งแลนด์/);
  const paid = envelope({ kind: 'land', landPayments: [{ id: 'LP', at: 't', byName: 'L', landName: '', amount: 1000, currency: 'JPY', evidenceImage: 'img' }] });
  assert.equal(item(clearChecklist(summary({ envs: [paid] }), NO_VALUES), 'landProof').ok, true);
  assert.equal(item(clearChecklist(summary({ envs: [envelope()] }), NO_VALUES), 'landProof').na, true);
});

test('เคลียร์เงินกรุ๊ป — ข้อที่ไม่เกี่ยวข้องเป็น na (ไม่นับในตัวเลขครบ)', () => {
  const checks = clearChecklist(summary({}), NO_VALUES);
  assert.equal(item(checks, 'envelopes').na, true); // ไม่มีซอง
  assert.equal(item(checks, 'paidExtra').na, true); // ไม่ได้ใช้เกิน
  assert.equal(item(checks, 'returned').na, true); // ไม่มียอดต้องคืน
  assert.equal(item(checks, 'perDiem').na, undefined); // เบี้ยเลี้ยงยังต้องตรวจ
});
