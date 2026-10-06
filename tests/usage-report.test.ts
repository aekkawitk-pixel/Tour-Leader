import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalPlan, autoPassable, expenseStatusMeta, groupUsageReview, isUsageReport, lineTitle, usageRefsOf, usageRowKey, summarizeUsageGroups, advanceDocIndex, withSiblings, autoReadyKeys } from '../src/lib/logic/usageReport';
import type { ExpenseRequest } from '../src/types';

const doc = (over: Partial<ExpenseRequest>) =>
  ({ id: 'X', jobId: 'P-1', category: 'actual', lines: [], status: 'submitted', history: [], ...over }) as ExpenseRequest;

test('ใบเสร็จค่าใช้จ่ายจริงของหัวหน้าทัวร์ = รายงานการใช้เงิน · เบี้ยเลี้ยง / ค่าส่งกรุ๊ป / เอกสารนำเข้า ไม่ใช่', () => {
  assert.equal(isUsageReport(doc({})), true);
  assert.equal(isUsageReport(doc({ claimKind: 'per_diem' })), false);
  assert.equal(isUsageReport(doc({ claimMonth: '2026-10', requesterKind: 'sendoff' })), false);
  assert.equal(isUsageReport(doc({ category: 'advance' })), false);
});

test('สถานะรายงานการใช้เงิน — รอตรวจ / ให้แก้ไข / ตรวจแล้ว · ใบเบิกอื่นใช้คำเดิม', () => {
  assert.equal(expenseStatusMeta(doc({})).label, 'รอตรวจ');
  assert.equal(expenseStatusMeta(doc({ status: 'approved' })).label, 'ตรวจแล้ว');
  assert.equal(expenseStatusMeta(doc({ status: 'revise' })).label, 'ให้แก้ไข');
  assert.equal(expenseStatusMeta(doc({ claimKind: 'per_diem', status: 'approved' })).label, 'อนุมัติ');
});

test('อ้างอิงใบเบิกเงินทดรอง + ชื่อรายการเบิกที่ผูก', () => {
  const advance = doc({ id: 'EXPOP26100001', category: 'advance', status: 'paid', lines: [
    { id: 'B1', purpose: 'Kiyomizu Temple', amount: 1, currency: 'JPY' },
    { id: 'B2', purpose: 'ค่าน้ำ', amount: 1, currency: 'JPY' },
  ] as ExpenseRequest['lines'] });
  const report = doc({ id: 'EXP-1', lines: [{ id: 'L1', budgetLineId: 'B2' }] as ExpenseRequest['lines'] });
  assert.deepEqual(usageRefsOf([advance, report], report), { docIds: ['EXPOP26100001'], itemNames: ['ค่าน้ำ'] });
  assert.deepEqual(usageRefsOf([advance], doc({ lines: [{ id: 'L2' }] as ExpenseRequest['lines'] })), { docIds: [], itemNames: [] });
});

test('ตรวจทั้งกรุ๊ป — จัดตามรายการเบิก · นอกรายการเบิกท้ายสุด · รายการที่ยังไม่มีใบเสร็จ · เลือกผ่านอัตโนมัติ · แผนตรวจผ่าน', () => {
  const advance = doc({ id: 'EXPOP1', category: 'advance', status: 'paid', lines: [
    { id: 'B1', purpose: 'โรงแรม', amount: 100, currency: 'JPY' },
    { id: 'B2', purpose: 'อาหาร', amount: 50, currency: 'JPY' },
    { id: 'B3', purpose: 'รถ', amount: 30, currency: 'JPY' },
  ] as ExpenseRequest['lines'] });
  const r1 = doc({ id: 'R1', lines: [{ id: 'a', budgetLineId: 'B1', amount: 100, currency: 'JPY', evidenceFileName: 'x.jpg' }] as ExpenseRequest['lines'] });
  const r2 = doc({ id: 'R2', lines: [
    { id: 'b', budgetLineId: 'B2', amount: 70, currency: 'JPY', evidenceFileName: 'y.jpg' },
    { id: 'c', amount: 5, currency: 'JPY', evidenceFileName: 'ไม่มีหลักฐาน' },
  ] as ExpenseRequest['lines'] });
  const done = doc({ id: 'R3', status: 'approved', lines: [{ id: 'd', budgetLineId: 'B1', amount: 0, currency: 'JPY', evidenceFileName: 'z.jpg' }] as ExpenseRequest['lines'] });
  const { sections, idle } = groupUsageReview([advance, r1, r2, done], 'P-1');
  assert.deepEqual(sections.map((s) => [s.item?.line.id ?? 'outside', s.use?.kind ?? null, s.rows.map((r) => r.line.id)]),
    [['B1', 'full', ['a', 'd']], ['B2', 'over', ['b']], ['outside', null, ['c']]]);
  assert.deepEqual(idle.map((b) => b.line.id), ['B3']);
  const auto = sections.flatMap((s) => s.rows.filter((r) => autoPassable(s, r)).map(usageRowKey));
  assert.deepEqual(auto, ['R1|a']); // เกินงบ / ไม่มีหลักฐาน / ตรวจแล้ว ไม่เลือกให้
  const rows = sections.flatMap((s) => s.rows);
  assert.deepEqual(approvalPlan(rows, new Set(['R1|a', 'R2|b'])), { ready: ['R1'], partial: ['R2'] });
});

test('ชื่อรายการ — สองฝั่งของ " — " เหมือนกันแสดงครั้งเดียว · ต่างกันคงเดิม · ว่าง = ประเภท', () => {
  assert.equal(lineTitle({ purpose: 'ค่าทางด่วน — ค่าทางด่วน', expenseType: 'x' }), 'ค่าทางด่วน');
  assert.equal(lineTitle({ purpose: 'ค่ารถบัส — 3 วัน วันละ 80000', expenseType: 'x' }), 'ค่ารถบัส — 3 วัน วันละ 80000');
  assert.equal(lineTitle({ purpose: '', expenseType: 'ค่าที่พัก' }), 'ค่าที่พัก');
});

test('สรุปรายกรุ๊ป — นับใบเสร็จ/รอตรวจ/เกินงบ/นอกรายการเบิก · เรียงรอตรวจก่อน', () => {
  const adv = (jobId: string) => doc({ id: `ADV-${jobId}`, jobId, category: 'advance', status: 'paid', lines: [{ id: 'B1', purpose: 'x', amount: 10, currency: 'JPY' }] as ExpenseRequest['lines'] });
  const rep = (id: string, jobId: string, status: ExpenseRequest['status'], amount: number, b?: string, at = '2026-10-06T10:00') =>
    doc({ id, jobId, status, submittedAt: at, lines: [{ id: 'l', amount, currency: 'JPY', ...(b ? { budgetLineId: b } : {}) }] as ExpenseRequest['lines'] });
  const all = [adv('G1'), adv('G2'), rep('a', 'G1', 'approved', 10, 'B1'), rep('b', 'G2', 'submitted', 15, 'B1', '2026-10-05T09:00'), rep('c', 'G2', 'submitted', 3)];
  const s = summarizeUsageGroups(all, all);
  assert.deepEqual(s.map((g) => [g.jobId, g.status, g.receipts, g.pending, g.over, g.outside]), [['G2', 'pending', 2, 2, 1, 1], ['G1', 'done', 1, 0, 0, 0]]);
  assert.equal(advanceDocIndex(all).get('G1|B1'), 'ADV-G1');
});

test('เลือกทั้งการส่ง · เลือกล่วงหน้าเฉพาะการส่งที่ไม่มีปัญหาทุกใบ', () => {
  const adv = doc({ id: 'A', category: 'advance', status: 'paid', lines: [
    { id: 'B1', purpose: 'x', amount: 100, currency: 'JPY' },
    { id: 'B2', purpose: 'y', amount: 100, currency: 'JPY' },
  ] as ExpenseRequest['lines'] });
  // R1 = ใบเดียวปกติ · R2 = ส่ง 2 ใบพร้อมกัน ใบหนึ่งนอกรายการเบิก
  const r1 = doc({ id: 'R1', lines: [{ id: 'a', budgetLineId: 'B1', amount: 50, currency: 'JPY', evidenceFileName: 'x.jpg' }] as ExpenseRequest['lines'] });
  const r2 = doc({ id: 'R2', lines: [
    { id: 'b', budgetLineId: 'B2', amount: 50, currency: 'JPY', evidenceFileName: 'y.jpg' },
    { id: 'c', amount: 5, currency: 'JPY', evidenceFileName: 'z.jpg' },
  ] as ExpenseRequest['lines'] });
  const { sections } = groupUsageReview([adv, r1, r2], 'P-1');
  const rows = sections.flatMap((s) => s.rows);
  assert.deepEqual(withSiblings(rows, ['R2|b']).sort(), ['R2|b', 'R2|c']);
  assert.deepEqual(autoReadyKeys(sections), ['R1|a']);
});
