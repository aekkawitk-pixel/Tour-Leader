import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearChecklist, followUpsFromClose, fxCovered, fxRateText, settlementText, summarizeGroupClear } from '../src/lib/logic/groupClear';
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

test('เคลียร์เงินกรุ๊ป — ใบเสร็จนอกรายการเบิกไม่ใช่เงินในซอง: ไม่หักจากคงเหลือ แสดงแยก', () => {
  const advance = {
    id: 'ADV', jobId: 'P1', category: 'advance', status: 'approved', lines: [{ id: 'B1', amount: 500, currency: 'JPY' }],
  } as unknown as ExpenseRequest;
  const inList = { ...receipt('approved', 400), id: 'R-in', lines: [{ id: 'l1', amount: 400, currency: 'JPY', budgetLineId: 'B1' }] } as unknown as ExpenseRequest;
  const outsideOk = { ...receipt('approved', 200), id: 'R-out' } as ExpenseRequest;
  const outsidePending = { ...receipt('submitted', 50), id: 'R-out2' } as ExpenseRequest;
  const s = summary({ envs: [envelope()], expenses: [advance, inList, outsideOk, outsidePending] });
  const jpy = s.balance.find((b) => b.currency === 'JPY')!;
  assert.equal(jpy.spent, 400);
  assert.equal(jpy.pending, 0);
  assert.equal(jpy.remaining, 600);
  assert.deepEqual(s.outside, [{ currency: 'JPY', approved: 200, pending: 50 }]);
  // ยังต้องผ่านตรวจเหมือนใบอื่น
  assert.equal(s.toReview.receipts, 1);
});

test('เคลียร์เงินกรุ๊ป — ใช้เกินซอง: จ่ายเพิ่ม หรือ ไม่อนุมัติจ่ายเพิ่ม ครอบคลุมยอดเกิน = ผ่าน · ส่วนที่ไม่อนุมัติไม่เป็นยอดค้าง', () => {
  const advance = { id: 'ADV', jobId: 'P1', category: 'advance', status: 'approved', lines: [{ id: 'B1', amount: 2000, currency: 'JPY' }] } as unknown as ExpenseRequest;
  const spend = { ...receipt('approved', 1500), lines: [{ id: 'l1', amount: 1500, currency: 'JPY', budgetLineId: 'B1' }] } as unknown as ExpenseRequest;
  const s = summary({ envs: [envelope()], expenses: [advance, spend] });
  assert.equal(s.balance[0].remaining, -500);
  const none = clearChecklist(s, NO_VALUES);
  assert.equal(item(none, 'paidExtra').ok, false);
  const rejected = clearChecklist(s, { ...NO_VALUES, rejectedExtra: [{ currency: 'JPY', amount: 500 }] });
  assert.equal(item(rejected, 'paidExtra').ok, true);
  assert.match(item(rejected, 'paidExtra').detail, /ไม่อนุมัติจ่ายเพิ่ม/);
  const split = clearChecklist(s, { ...NO_VALUES, paidExtra: [{ currency: 'JPY', amount: 200 }], rejectedExtra: [{ currency: 'JPY', amount: 300 }] });
  assert.equal(item(split, 'paidExtra').ok, true);
  assert.deepEqual(followUpsFromClose(s, { returned: [], paidExtra: [], rejectedExtra: [{ currency: 'JPY', amount: 500 }] }, 't', 'fin'), []);
  assert.equal(followUpsFromClose(s, { returned: [], paidExtra: [] }, 't', 'fin')[0].amount, 500);
});

test('เคลียร์เงินกรุ๊ป — คืนเงินหลายสกุล: ยอดที่ตัด (amount) รวมกันครบ = คืนครบ', () => {
  const s = summary({ envs: [envelope()] }); // ในซอง 1,000 JPY ไม่มีใบเสร็จ → ต้องคืน 1,000
  const returned = [
    { currency: 'JPY', amount: 600 },
    { currency: 'JPY', amount: 400, paidCurrency: 'THB', paidAmount: 88, fxRate: 0.22 },
  ];
  assert.equal(item(clearChecklist(s, { ...NO_VALUES, returned }), 'returned').ok, true);
  assert.deepEqual(followUpsFromClose(s, { returned, paidExtra: [] }, 't', 'fin'), []);
  assert.equal(settlementText(returned[1]), '88.00 THB (อัตรา 1 JPY = 0.22 THB) = 400.00 JPY');
  assert.equal(followUpsFromClose(s, { returned: [returned[0]], paidExtra: [] }, 't', 'fin')[0].amount, 400);
});

test('เคลียร์เงินกรุ๊ป — อัตราแลกเปลี่ยนอ้างอิงบาท: แปลงกลับเป็นสกุลของยอด', () => {
  // ยอด JPY คืนเป็นบาท — 1 JPY = 0.22 THB → 32,820 THB = 149,181.82 JPY
  assert.equal(fxRateText('JPY', 'THB', 0.22), '1 JPY = 0.22 THB');
  assert.equal(fxCovered('JPY', 'THB', 32820, 0.22), 149181.82);
  // ยอดบาท คืนเป็น USD — 1 USD = 35 THB → 100 USD = 3,500 THB
  assert.equal(fxRateText('THB', 'USD', 35), '1 USD = 35 THB');
  assert.equal(fxCovered('THB', 'USD', 100, 35), 3500);
  // ไม่มีบาท — ยอด JPY คืนเป็น USD · 1 USD = 150 JPY
  assert.equal(fxRateText('JPY', 'USD', 150), '1 USD = 150 JPY');
  assert.equal(fxCovered('JPY', 'USD', 10, 150), 1500);
  // ยังไม่กรอกอัตรา = ยังไม่ตัดยอด
  assert.equal(fxCovered('JPY', 'THB', 32820, 0), 0);
});
