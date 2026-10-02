import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocatedTotals, allocationOf, canSeal, pendingDepositLabel, carriedByLeader, carrierOf, custodyTrail, handoverReceiverText, docChangedSinceSeal, envelopeShortLabel, envelopeStage, envelopeStatusLabel, envelopeTotals, groupEnvelopeStatus,
  groupLines, leaderCanAck, leaderEnvelopeState, lineKey, newEnvelope, normalizeEnvelope, packingFromAllocation, unassignedLines, type CashEnvelope,
} from '../src/lib/logic/cashEnvelope';

// กรุ๊ป G1 มีเอกสารเบิก 2 ใบ — id บรรทัดซ้ำกันข้ามเอกสารได้ (R-1)
const docs = [
  { id: 'EXPOP1', lines: [{ id: 'R-1', amount: 17000, currency: 'JPY' }, { id: 'R-2', amount: 450000, currency: 'JPY' }, { id: 'R-3', amount: 2000, currency: 'THB' }] },
  { id: 'EXPOP2', lines: [{ id: 'R-1', amount: 30000, currency: 'JPY' }] },
];
const lines = groupLines(docs);
const K = (doc: string, id: string) => lineKey(doc, id);
/** ใส่เต็มจำนวนทุกรายการ */
const full = (keys: string[]) => allocationOf({ packedLineIds: keys }, lines);

const sealedWith = (env: CashEnvelope, keys: string[]): CashEnvelope => ({
  ...env,
  packedLineIds: keys,
  sealed: { at: 't', byName: 'x', faceTotals: envelopeTotals(lines, full(keys)).packed, lineSnapshot: lines.filter((l) => keys.includes(l.id)) },
});

test('รายการของทุกเอกสารในกรุ๊ปรวมเป็นชุดเดียว — id บรรทัดซ้ำข้ามเอกสารไม่ชนกัน', () => {
  assert.equal(lines.length, 4);
  assert.equal(new Set(lines.map((l) => l.id)).size, 4);
  assert.ok(lines.some((l) => l.id === 'EXPOP2::R-1'));
});

test('ยอดที่ต้องจัด vs ยอดในซอง — แยกสกุลเงิน ไม่บวกข้ามสกุล', () => {
  const t = envelopeTotals(lines, full([K('EXPOP1', 'R-1'), K('EXPOP1', 'R-3')]));
  assert.deepEqual(t.required, [{ currency: 'JPY', amount: 497000 }, { currency: 'THB', amount: 2000 }]);
  assert.deepEqual(t.packed, [{ currency: 'JPY', amount: 17000 }, { currency: 'THB', amount: 2000 }]);
});

test('ปิดซองได้เมื่อมีรายการอย่างน้อย 1 รายการ (แยกหลายซองได้ ไม่ต้องครบทั้งใบ)', () => {
  assert.equal(canSeal(lines, {}), false);
  assert.equal(canSeal(lines, full([K('EXPOP1', 'R-2')])), true);
  assert.equal(canSeal(lines, { [K('EXPOP9', 'R-1')]: 100 }), false); // รายการไม่อยู่ในเอกสารแล้ว
});

test('ซองใหม่ของกรุ๊ปเรียงลำดับต่อกัน', () => {
  const a = newEnvelope('G1', []);
  const b = newEnvelope('G1', [a]);
  const other = newEnvelope('G2', [a, b]);
  assert.deepEqual([a.no, b.no, other.no], [1, 2, 1]);
  assert.notEqual(a.id, b.id);
});

test('รายการที่ยังไม่ได้จัด', () => {
  const a = { ...newEnvelope('G1', []), packedLineIds: [K('EXPOP1', 'R-1'), K('EXPOP1', 'R-2')] };
  const b = { ...newEnvelope('G1', [a]), packedLineIds: [K('EXPOP2', 'R-1')] };
  assert.equal(allocatedTotals(lines, [a, b]).get(K('EXPOP2', 'R-1')), 30000);
  assert.deepEqual(unassignedLines(lines, [a, b]).map((l) => l.id), [K('EXPOP1', 'R-3')]);
});

test('1 รายการแบ่งใส่หลายซองได้ — ยอดรวมไม่เกินรายการ · ยังไม่ครบ = เหลือให้จัด', () => {
  const k = K('EXPOP1', 'R-2'); // 450,000 JPY
  const a = { ...newEnvelope('G1', []), ...packingFromAllocation({ [k]: 300000 }, lines) };
  assert.deepEqual(a.splits, { [k]: 300000 });
  // เต็มจำนวน = ไม่เก็บ splits
  assert.equal(packingFromAllocation({ [k]: 450000 }, lines).splits, undefined);
  const left = unassignedLines(lines.filter((l) => l.id === k), [a]);
  assert.deepEqual(left.map((l) => l.amount), [150000]);
  assert.deepEqual(envelopeTotals(lines, allocationOf(a, lines)).packed, [{ currency: 'JPY', amount: 300000 }]);
  // ซอง 2 ใส่ได้ไม่เกินที่เหลือ
  const others = allocatedTotals(lines, [a]);
  assert.equal(canSeal(lines, { [k]: 150000 }, others), true);
  assert.equal(canSeal(lines, { [k]: 150001 }, others), false);
  assert.equal(canSeal(lines, { [k]: 0 }, others), false);
});

test('สถานะกรุ๊ป: รายการที่แบ่ง 2 ซอง ต้องปิดครบทั้ง 2 ซองจึงพ้น "กำลังจัด"', () => {
  const k = K('EXPOP2', 'R-1'); // 30,000 JPY
  const one = lines.filter((l) => l.id === k);
  const seal = (e: CashEnvelope): CashEnvelope => ({ ...e, sealed: { at: 't', byName: 'x', faceTotals: [], lineSnapshot: one } });
  const a = seal({ ...newEnvelope('G1', []), ...packingFromAllocation({ [k]: 10000 }, lines) });
  const b = { ...newEnvelope('G1', [a]), ...packingFromAllocation({ [k]: 20000 }, lines) };
  assert.equal(groupEnvelopeStatus(one, [a, b]).stage, 'packing');
  assert.equal(groupEnvelopeStatus(one, [a, seal(b)]).stage, 'sealed');
});

test('สถานะกรุ๊ป: รวมทุกเอกสารในซองเดียว', () => {
  const env = newEnvelope('G1', []);
  assert.equal(groupEnvelopeStatus(lines, []).label, 'รอจัด');
  assert.equal(groupEnvelopeStatus(lines, [{ ...env, packedLineIds: [K('EXPOP1', 'R-1')] }]).label, 'กำลังจัด');
  const one = sealedWith(env, lines.map((l) => l.id));
  assert.deepEqual(
    { stage: groupEnvelopeStatus(lines, [one]).stage, label: groupEnvelopeStatus(lines, [one]).label },
    { stage: 'sealed', label: 'รอส่งมอบ' },
  );
});

test('สถานะกรุ๊ป: แยกหลายซอง — จัดไม่ครบยังเป็นกำลังจัด · ครบแล้วใช้ขั้นของซองที่ช้าที่สุด', () => {
  const a = sealedWith(newEnvelope('G1', []), [K('EXPOP1', 'R-1'), K('EXPOP1', 'R-2'), K('EXPOP2', 'R-1')]);
  const b0 = newEnvelope('G1', [a]);
  assert.equal(groupEnvelopeStatus(lines, [a]).label, 'กำลังจัด'); // R-3 (THB) ยังไม่อยู่ซองไหน
  const b = sealedWith(b0, [K('EXPOP1', 'R-3')]);
  const aHanded: CashEnvelope = { ...a, handover: { at: 't', byName: 'x', receiverKind: 'staff', receiverName: 'สมชาย' } };
  const s1 = groupEnvelopeStatus(lines, [aHanded, b]);
  assert.equal(s1.label, 'รอส่งมอบ'); // ซอง b ยังไม่ส่งมอบ
  assert.equal(s1.envelopeCount, 2);
  const bHanded: CashEnvelope = { ...b, handover: { at: 't', byName: 'x', receiverKind: 'leader', receiverName: 'ชัยมงคล' } };
  assert.equal(groupEnvelopeStatus(lines, [aHanded, bHanded]).label, 'รอหัวหน้าทัวร์รับ');
  const ack = { at: 't', leaderId: 'TL', leaderName: 'ชัยมงคล' };
  assert.equal(groupEnvelopeStatus(lines, [{ ...aHanded, leaderAck: ack }, { ...bHanded, leaderAck: ack }]).label, 'หัวหน้าทัวร์รับแล้ว');
  const mism = groupEnvelopeStatus(lines, [{ ...aHanded, leaderAck: ack, mismatch: { at: 't', byName: 'x', note: 'ขาด' } }, { ...bHanded, leaderAck: ack }]);
  assert.deepEqual({ label: mism.label, tone: mism.tone, mismatch: mism.mismatch }, { label: 'ยอดไม่ตรง', tone: 'red', mismatch: true });
});

test('ซองเปล่า (สร้างแล้วยังไม่ใส่รายการ) ไม่นับในสถานะกรุ๊ป', () => {
  const a = sealedWith(newEnvelope('G1', []), lines.map((l) => l.id));
  const empty = newEnvelope('G1', [a]);
  const s = groupEnvelopeStatus(lines, [a, empty]);
  assert.equal(s.label, 'รอส่งมอบ');
  assert.equal(s.envelopeCount, 1);
});

test('ลำดับสถานะซองใบเดียว · แจ้งยอดไม่ตรงชนะทุกสถานะ', () => {
  const env: CashEnvelope = newEnvelope('G1', []);
  assert.equal(envelopeStage(undefined), 'packing');
  assert.equal(envelopeStatusLabel(env).label, 'รอจัดซอง');
  assert.equal(envelopeShortLabel(env).label, 'รอจัด');
  env.packedLineIds = [K('EXPOP1', 'R-1')];
  assert.equal(envelopeStatusLabel(env).label, 'กำลังจัดซอง');
  assert.equal(envelopeShortLabel(env).label, 'กำลังจัด');
  env.sealed = { at: 't', byName: 'x', faceTotals: [], lineSnapshot: [] };
  assert.equal(envelopeShortLabel(env).label, 'รอส่งมอบ');
  env.handover = { at: 't', byName: 'x', receiverKind: 'staff', receiverName: 'สมชาย' };
  assert.equal(envelopeStatusLabel(env).label, 'ฝากผู้รับแทน รอหัวหน้าทัวร์ยืนยันรับ');
  assert.equal(envelopeStatusLabel({ ...env, handover: { at: 't', byName: 'x', receiverKind: 'leader', receiverName: 'ชัยมงคล' } }).label, 'ส่งมอบแล้ว รอหัวหน้าทัวร์ยืนยัน');
  assert.equal(envelopeShortLabel(env).label, 'รอหัวหน้าทัวร์รับ');
  env.leaderAck = { at: 't', leaderId: 'TL', leaderName: 'ชัยมงคล', fromStaffName: 'สมชาย' };
  assert.equal(envelopeStage(env), 'received');
  assert.equal(envelopeShortLabel(env).label, 'หัวหน้าทัวร์รับแล้ว');
  env.mismatch = { at: 't', byName: 'ชัยมงคล', note: 'ขาด 1,000 เยน' };
  assert.deepEqual(envelopeShortLabel(env), { label: 'ยอดไม่ตรง', tone: 'red' });
});

test('เอกสารเบิกถูกแก้หลังปิดซอง — ตรวจจับเฉพาะรายการในซอง · รายการใหม่ไม่นับ', () => {
  const keys = [K('EXPOP1', 'R-1'), K('EXPOP1', 'R-2')];
  const env = sealedWith(newEnvelope('G1', []), keys);
  assert.equal(docChangedSinceSeal(env, [...lines].reverse()), false);
  assert.equal(docChangedSinceSeal(env, [...lines, { id: K('EXPOP1', 'R-9'), amount: 1, currency: 'JPY' }]), false);
  assert.equal(docChangedSinceSeal(env, lines.map((l) => (l.id === keys[0] ? { ...l, amount: 18000 } : l))), true);
  assert.equal(docChangedSinceSeal(env, lines.filter((l) => l.id !== keys[1])), true);
});

test('แปลงข้อมูลซองรุ่นเก่า (1 เอกสาร = 1 ซอง) ให้ใช้ lineKey', () => {
  const old = {
    id: 'ENV-EXPOP1', advanceDocId: 'EXPOP1', periodId: 'G1', packedLineIds: ['R-1'], history: [],
    sealed: { at: 't', byName: 'x', faceTotals: [], lineSnapshot: [{ id: 'R-1', amount: 17000, currency: 'JPY' }] },
  } as unknown as CashEnvelope;
  const env = normalizeEnvelope(old);
  assert.equal(env.no, 1);
  assert.deepEqual(env.packedLineIds, ['EXPOP1::R-1']);
  assert.equal(env.sealed!.lineSnapshot[0].id, 'EXPOP1::R-1');
  assert.deepEqual(normalizeEnvelope(env).packedLineIds, ['EXPOP1::R-1']); // แปลงซ้ำไม่เพี้ยน
});

test('ยอดคงเหลือ = หน้าซอง − ส่งแลนด์ − ใช้ตามใบเสร็จ (แยกสกุลเงิน)', async () => {
  const { envelopeBalance } = await import('../src/lib/logic/cashEnvelope');
  const b = envelopeBalance(
    [{ currency: 'JPY', amount: 1586607 }],
    [{ currency: 'JPY', amount: 920300 }],
    [{ currency: 'JPY', amount: 76000 }, { currency: 'THB', amount: 500 }],
  );
  assert.deepEqual(b.find((x) => x.currency === 'JPY'), { currency: 'JPY', face: 1586607, land: 920300, spent: 76000, remaining: 590307 });
  assert.equal(b.find((x) => x.currency === 'THB')?.remaining, -500);
});

test('ผู้รับซอง: แสดงผู้รับแทนเมื่อคนมารับไม่ใช่ผู้รับที่ระบุไว้', async () => {
  const { handoverReceiverText } = await import('../src/lib/logic/cashEnvelope');
  assert.equal(handoverReceiverText({ receiverName: 'สมชาย ใจดี' }), 'สมชาย ใจดี');
  assert.equal(handoverReceiverText({ receiverName: 'สมชาย ใจดี', proxyName: 'สมศักดิ์' }), 'สมชาย ใจดี (รับแทนโดย สมศักดิ์)');
});

test('Timeline รวมทุกซองของกรุ๊ป เรียงใหม่ → เก่า ไม่เติมชื่อซองซ้ำ', async () => {
  const { envelopeTimeline } = await import('../src/lib/logic/cashEnvelope');
  const a: CashEnvelope = { ...newEnvelope('G1', []), history: [
    { at: '2026-09-30T10:00:00', byName: 'อรวรรณ', action: 'สร้างซอง' },
    { at: '2026-09-30T11:00:00', byName: 'อรวรรณ', action: 'ปิดซอง', note: 'ซอง 1 · ยอดหน้าซอง 34,000.00 JPY' },
  ] };
  const b: CashEnvelope = { ...newEnvelope('G1', [a]), label: 'ทิป', history: [
    { at: '2026-09-30T10:30:00', byName: 'อรวรรณ', action: 'สร้างซอง' },
  ] };
  const ev = envelopeTimeline([a, b]);
  assert.deepEqual(ev.map((e) => e.title), ['ปิดซอง', 'สร้างซอง', 'สร้างซอง']);
  assert.deepEqual({ env: ev[0].envName, details: ev[0].details, by: ev[0].byName }, { env: 'ซอง 1', details: ['ยอดหน้าซอง 34,000.00 JPY'], by: 'อรวรรณ' });
  assert.deepEqual({ env: ev[1].envName, details: ev[1].details }, { env: 'ซอง 2 · ทิป', details: [] });
});

test('ฝากเจ้าหน้าที่ส่งกรุ๊ป: รอเจ้าหน้าที่รับ → เจ้าหน้าที่ถือซอง → ส่งต่อแล้ว → หัวหน้าทัวร์รับ', () => {
  const base = { ...newEnvelope('G1', []), packedLineIds: [K('EXPOP1', 'R-1')], sealed: { at: 't', byName: 'x', faceTotals: [], lineSnapshot: [] } } as CashEnvelope;
  const env: CashEnvelope = {
    ...base,
    handover: { at: 't', byName: 'การเงิน', receiverKind: 'leader', receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-001' },
  };
  assert.equal(envelopeStage(env), 'handed_over');
  assert.equal(envelopeStatusLabel(env).label, 'รอเจ้าหน้าที่ส่งกรุ๊ปยืนยันรับ');
  assert.equal(envelopeShortLabel(env).label, 'รอเจ้าหน้าที่ส่งกรุ๊ปรับ');
  const held = { ...env, staffAck: { at: 't1', staffId: 'SOS-001', staffName: 'ธนกฤต' } };
  assert.equal(envelopeStatusLabel(held).label, 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง รอส่งหัวหน้าทัวร์');
  assert.equal(envelopeShortLabel(held).label, 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง');
  const passed = { ...held, staffHandoff: { at: 't2', staffName: 'ธนกฤต' } };
  assert.equal(envelopeStatusLabel(passed).label, 'ส่งต่อให้หัวหน้าทัวร์แล้ว รอยืนยันรับ');
  assert.equal(envelopeShortLabel(passed).label, 'รอหัวหน้าทัวร์รับ');
  const got = { ...passed, leaderAck: { at: 't3', leaderId: 'TL', leaderName: 'ชัยมงคล', fromStaffName: 'ธนกฤต' } };
  assert.equal(envelopeStage(got), 'received');
  assert.equal(envelopeShortLabel(got).label, 'หัวหน้าทัวร์รับแล้ว');
});

test('ข้อความผู้รับ: ฝากเจ้าหน้าที่ส่งกรุ๊ปนำส่งหัวหน้าทัวร์', async () => {
  const { handoverReceiverText } = await import('../src/lib/logic/cashEnvelope');
  assert.equal(
    handoverReceiverText({ receiverKind: 'staff', receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-001' }),
    'เจ้าหน้าที่ส่งกรุ๊ป ธนกฤต → นำส่ง ชัยมงคล',
  );
  assert.equal(handoverReceiverText({ receiverKind: 'leader', receiverName: 'ชัยมงคล', proxyName: 'สมศักดิ์' }), 'ชัยมงคล (รับแทนโดย สมศักดิ์)');
});

test('สถานะกรุ๊ป: ฝากเจ้าหน้าที่ส่งกรุ๊ปแล้วยังไม่ยืนยันรับ ต้องไม่ขึ้นว่ารอหัวหน้าทัวร์รับ', () => {
  const sealed = sealedWith(newEnvelope('G1', []), lines.map((l) => l.id));
  const viaStaff: CashEnvelope = { ...sealed, handover: { at: 't', byName: 'x', receiverKind: 'staff', receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-001' } };
  assert.equal(groupEnvelopeStatus(lines, [viaStaff]).label, 'รอเจ้าหน้าที่ส่งกรุ๊ปรับ');
  const held = { ...viaStaff, staffAck: { at: 't1', staffId: 'SOS-001', staffName: 'ธนกฤต' } };
  assert.equal(groupEnvelopeStatus(lines, [held]).label, 'เจ้าหน้าที่ส่งกรุ๊ปถือซอง');
  const passed = { ...held, staffHandoff: { at: 't2', staffName: 'ธนกฤต' } };
  assert.equal(groupEnvelopeStatus(lines, [passed]).label, 'รอหัวหน้าทัวร์รับ');
  // 2 ซอง: ซองหนึ่งส่งหัวหน้าทัวร์ตรง อีกซองยังรอเจ้าหน้าที่ → กรุ๊ปขึ้นตามซองที่ช้ากว่า
  const a = sealedWith(newEnvelope('G1', []), [K('EXPOP1', 'R-1')]);
  const b = sealedWith(newEnvelope('G1', [a]), lines.map((l) => l.id).filter((k) => k !== K('EXPOP1', 'R-1')));
  const direct: CashEnvelope = { ...a, handover: { at: 't', byName: 'x', receiverKind: 'leader', receiverName: 'ชัยมงคล' } };
  const staffB: CashEnvelope = { ...b, handover: viaStaff.handover };
  assert.equal(groupEnvelopeStatus(lines, [direct, staffB]).label, 'รอเจ้าหน้าที่ส่งกรุ๊ปรับ');
});

test('สถานะกรุ๊ประบุชื่อผู้ที่ต้องตอบรับ', () => {
  const sealed = sealedWith(newEnvelope('G1', []), lines.map((l) => l.id));
  const viaStaff: CashEnvelope = { ...sealed, handover: { at: 't', byName: 'x', receiverKind: 'staff', receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-001' } };
  assert.equal(groupEnvelopeStatus(lines, [viaStaff]).awaiting, 'ธนกฤต');
  const held = { ...viaStaff, staffAck: { at: 't1', staffId: 'SOS-001', staffName: 'ธนกฤต' } };
  assert.equal(groupEnvelopeStatus(lines, [held]).awaiting, 'ธนกฤต');
  assert.equal(groupEnvelopeStatus(lines, [{ ...held, staffHandoff: { at: 't2', staffName: 'ธนกฤต' } }]).awaiting, 'ชัยมงคล');
  const direct: CashEnvelope = { ...sealed, handover: { at: 't', byName: 'x', receiverKind: 'leader', receiverName: 'ชัยมงคล' } };
  assert.equal(groupEnvelopeStatus(lines, [direct]).awaiting, 'ชัยมงคล');
  assert.equal(groupEnvelopeStatus(lines, [sealed]).awaiting, undefined);
});

test('การเงินแก้ไขการส่งมอบได้จนกว่าจะมีผู้ตอบรับ', async () => {
  const { canEditHandover, groupManageable } = await import('../src/lib/logic/cashEnvelope');
  const sealed = sealedWith(newEnvelope('G1', []), lines.map((l) => l.id));
  assert.equal(canEditHandover(sealed), false); // ยังไม่ได้ส่งมอบ
  const handed: CashEnvelope = { ...sealed, handover: { at: 't', byName: 'x', receiverKind: 'staff', receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-001' } };
  assert.equal(canEditHandover(handed), true);
  assert.equal(groupManageable(lines, [handed]), true);
  const acked = { ...handed, staffAck: { at: 't1', staffId: 'SOS-001', staffName: 'ธนกฤต' } };
  assert.equal(canEditHandover(acked), false);
  assert.equal(groupManageable(lines, [acked]), false);
  const leaderAcked = { ...handed, leaderAck: { at: 't1', leaderId: 'TL', leaderName: 'ชัยมงคล' } };
  assert.equal(canEditHandover(leaderAcked), false);
});

test('Timeline: ตัดชื่อซอง (รวมชื่อที่ตั้งเอง) ออกจากรายละเอียด และแยกบรรทัด', async () => {
  const { envelopeTimeline } = await import('../src/lib/logic/cashEnvelope');
  const env: CashEnvelope = { ...newEnvelope('G1', []), label: 'ทดสอบ', history: [
    { at: '2026-09-30T17:26:00', byName: 'อรวรรณ', action: 'ส่งมอบซองให้เจ้าหน้าที่ส่งกรุ๊ป', note: 'ซอง 1 · ทดสอบ · ธนกฤต นำส่ง ชัยมงคล · รอเจ้าหน้าที่ยืนยันรับ' },
  ] };
  assert.deepEqual(envelopeTimeline([env])[0].details, ['ธนกฤต นำส่ง ชัยมงคล', 'รอเจ้าหน้าที่ยืนยันรับ']);
});

test('กรุ๊ปที่การเงินระบุว่าไม่มีซอง — สถานะ "ไม่มีซอง" · มีรายการในซองแล้วการระบุไม่มีผล', () => {
  const mark = { periodId: 'G1', reason: 'โอนจ่ายแลนด์/ซัพพลายเออร์โดยตรง', at: 't', byName: 'x' };
  const s = groupEnvelopeStatus(lines, [], mark);
  assert.equal(s.stage, 'none');
  assert.equal(s.label, 'ไม่มีซอง');
  const a = { ...newEnvelope('G1', []), packedLineIds: [K('EXPOP1', 'R-1')] };
  assert.equal(groupEnvelopeStatus(lines, [a], mark).stage, 'packing');
});

test('หัวหน้าทัวร์แจ้งไม่ได้รับซอง — สถานะกรุ๊ปแดง "แจ้งไม่ได้รับซอง" · ได้รับภายหลังแล้วกลับเป็นรับแล้ว', () => {
  const k = K('EXPOP2', 'R-1');
  const one = lines.filter((l) => l.id === k);
  const env: CashEnvelope = {
    ...sealedWith(newEnvelope('G1', []), [k]),
    handover: { at: 't', byName: 'f', receiverKind: 'leader', receiverId: 'L1', receiverName: 'L' },
    notReceived: { at: 't2', byName: 'L', note: 'ไม่มีคนมาส่ง' },
  };
  assert.equal(envelopeStatusLabel(env).label, 'หัวหน้าทัวร์แจ้งไม่ได้รับซอง');
  assert.equal(envelopeShortLabel(env).label, 'แจ้งไม่ได้รับซอง');
  const s = groupEnvelopeStatus(one, [env]);
  assert.equal(s.label, 'แจ้งไม่ได้รับซอง');
  assert.equal(s.mismatch, true);
  assert.equal(leaderEnvelopeState(env, 'L1'), 'not_received');
  const acked = { ...env, leaderAck: { at: 't3', leaderId: 'L1', leaderName: 'L' } };
  assert.equal(groupEnvelopeStatus(one, [acked]).mismatch, false);
  assert.equal(leaderEnvelopeState(acked, 'L1'), null);
});

test('สถานะซองฝั่งหัวหน้าทัวร์ — ส่งตรง = to_ack · เจ้าหน้าที่ยังไม่รับจากการเงิน = at_finance · รับแล้วยังไม่ส่งต่อ = in_transit · ส่งต่อแล้ว = to_ack', () => {
  const base = sealedWith(newEnvelope('G1', []), [K('EXPOP1', 'R-1')]);
  const direct: CashEnvelope = { ...base, handover: { at: 't', byName: 'f', receiverKind: 'leader', receiverId: 'L1', receiverName: 'L' } };
  assert.equal(leaderEnvelopeState(direct, 'L1'), 'to_ack');
  assert.equal(leaderEnvelopeState(direct, 'L2'), null);
  const atFinance: CashEnvelope = { ...base, handover: { at: 't', byName: 'f', receiverKind: 'staff', receiverId: 'L1', receiverName: 'L', proxyName: 'S', proxyStaffId: 'SOS-1' } };
  // เจ้าหน้าที่ยังไม่ได้รับจากการเงิน — ขั้นตอนยังมาไม่ถึง กดรับไม่ได้
  assert.equal(leaderEnvelopeState(atFinance, 'L1'), 'at_finance');
  assert.equal(leaderCanAck(atFinance, 'L1'), false);
  const viaStaff: CashEnvelope = { ...atFinance, staffAck: { at: 't', staffId: 'SOS-1', staffName: 'S' } };
  assert.equal(leaderEnvelopeState(viaStaff, 'L1'), 'in_transit');
  assert.equal(leaderCanAck(viaStaff, 'L1'), true);
  assert.equal(leaderEnvelopeState({ ...viaStaff, staffHandoff: { at: 't', staffName: 'S' } }, 'L1'), 'to_ack');
  assert.equal(leaderEnvelopeState({ ...viaStaff, staffReturn: { at: 't', staffId: 'SOS-1', staffName: 'S', reason: 'x' } }, 'L1'), null);
});

test('ฝากหัวหน้าทัวร์คนอื่นนำส่ง — ผู้ถือซองระหว่างทาง · ปลายทางเห็นสถานะตามทอด · ไล่เส้นทางซองย้อนหลังได้', () => {
  const base = sealedWith(newEnvelope('G1', []), [K('EXPOP1', 'R-1')]);
  const env: CashEnvelope = {
    ...base,
    handover: { at: 't1', byName: 'การเงิน', receiverKind: 'leader', receiverId: 'L1', receiverName: 'ชัยมงคล', proxyName: 'สมชาย', proxyLeaderId: 'L2' },
    history: [{ at: 't1', byName: 'การเงิน', action: 'ส่งมอบซองให้หัวหน้าทัวร์ (ฝากส่ง)' }, { at: 't0', byName: 'การเงิน', action: 'ปิดซอง' }],
  };
  assert.deepEqual(carrierOf(env.handover), { kind: 'leader', id: 'L2', name: 'สมชาย' });
  assert.equal(handoverReceiverText(env.handover!), 'หัวหน้าทัวร์ (ฝากส่ง) สมชาย → นำส่ง ชัยมงคล');
  // คนฝากส่ง (L2) เห็นเป็นงานของตัวเอง · ปลายทาง (L1) ยังกดรับไม่ได้จนกว่าผู้ถือจะรับซอง
  assert.equal(carriedByLeader(env, 'L2'), true);
  assert.equal(carriedByLeader(env, 'L1'), false);
  assert.equal(leaderEnvelopeState(env, 'L1'), 'at_finance');
  assert.equal(envelopeShortLabel(env).label, 'รอหัวหน้าทัวร์ฝากส่งรับ');
  const holding: CashEnvelope = { ...env, staffAck: { at: 't2', staffId: 'L2', staffName: 'สมชาย' } };
  assert.equal(leaderEnvelopeState(holding, 'L1'), 'in_transit');
  assert.equal(envelopeShortLabel(holding).label, 'หัวหน้าทัวร์ฝากส่งถือซอง');
  // ปลายทางรับแล้ว — คนฝากส่งไม่ต้องทำอะไรต่อ
  assert.equal(carriedByLeader({ ...holding, leaderAck: { at: 't3', leaderId: 'L1', leaderName: 'ชัยมงคล' } }, 'L2'), false);
  // เส้นทางซอง: เฉพาะทอดที่ซองเปลี่ยนมือ (ไม่รวม "ปิดซอง")
  assert.deepEqual(custodyTrail(env).map((h) => h.action), ['ส่งมอบซองให้หัวหน้าทัวร์ (ฝากส่ง)']);
});

test('เส้นทางเลือกแยก: เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ฝากส่ง → หัวหน้าทัวร์หลัก', () => {
  assert.equal(
    handoverReceiverText({ receiverName: 'ชัยมงคล', proxyName: 'ธนกฤต', proxyStaffId: 'SOS-1', receiverKind: 'staff', nextLeaderCarrier: { id: 'L2', name: 'สมชาย', viaGroup: 'KIX-1' } }),
    'เจ้าหน้าที่ส่งกรุ๊ป ธนกฤต → หัวหน้าทัวร์ (ฝากส่ง) สมชาย (ไปกับกรุ๊ป KIX-1) → นำส่ง ชัยมงคล',
  );
});

test('รอฝากไปกับกรุ๊ปอื่น — สถานะของซอง/กรุ๊ปบอกว่ารอฝากกับใคร', () => {
  const k = K('EXPOP2', 'R-1');
  const one = lines.filter((l) => l.id === k);
  const env: CashEnvelope = { ...sealedWith(newEnvelope('G1', []), [k]), pendingDeposit: { at: 't', byName: 'f', staff: 'pending', leader: 'main' } };
  assert.equal(envelopeStatusLabel(env).label, 'รอฝากไปกับเจ้าหน้าที่กรุ๊ปอื่น');
  assert.equal(envelopeShortLabel(env).label, 'รอฝากไปกับเจ้าหน้าที่กรุ๊ปอื่น');
  assert.equal(groupEnvelopeStatus(one, [env]).label, 'รอฝากไปกับเจ้าหน้าที่กรุ๊ปอื่น');
  assert.equal(pendingDepositLabel({ at: 't', byName: 'f', staff: 'none', leader: 'pending' }), 'รอฝากไปกับหัวหน้าทัวร์กรุ๊ปอื่น');
  assert.equal(pendingDepositLabel({ at: 't', byName: 'f', staff: 'pending', leader: 'pending' }), 'รอฝากไปกับกรุ๊ปอื่น');
});
