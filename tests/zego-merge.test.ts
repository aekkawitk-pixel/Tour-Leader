import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeZegoImport } from '../src/lib/logic/zegoMerge';
import { zegoToTourPeriodMaster } from '../src/data/zego/zegoToMaster';
import { detectAssignmentIssues, isMissingButTravelled, periodSnapshotOf } from '../src/lib/logic/guideBoard';
import type { ZegoPeriod, ZegoProgram } from '../src/data/zego/types';

const prog = (code: string, flights: ZegoProgram['flights'] = []): ZegoProgram => ({
  id: `P-${code}`, programCode: code, programName: `โปรแกรม ${code}`, rawProgramName: code, country: 'JAPAN', countryCode: 'JP',
  durationDays: 5, durationNights: 4, periodCount: 0, createdFromSampleFile: false, flights,
});

const per = (id: string, programCode: string, groupCode: string, startDate: string, endDate: string, extra: Partial<ZegoPeriod> = {}): ZegoPeriod => ({
  id, seq: 1, programId: `P-${programCode}`, programCode, groupCode, bus: null, country: 'JAPAN', countryCode: 'JP',
  startDate, endDate, startDateTime: null, endDateTime: null, hasExactWorkTime: false, saleStatus: 'SELL', confirmStatus: 'NOT_SPECIFIED',
  periodTags: [], ticketDeadline: null, ticketDeadlineText: null, paymentText: null, originalPrice: null, salePrice: null,
  totalSeats: null, bookedSeats: null, remainingSeats: null, rawRemainingValue: '', isOverbooked: false, overbookedSeats: 0,
  assignedTourLeaderName: null, assignedTourLeaderType: null, assignmentStatus: 'UNASSIGNED', remark: null, rawProgramName: programCode,
  rawText: '', sourcePage: 0, importWarnings: [], ...extra,
});

const NOW = '2026-10-07T09:00:00.000Z';

test('ดึงทั้งหมด — กรุ๊ปที่ไม่ได้มารอบนี้ไม่ถูกลบ แต่ติด "ไม่พบในต้นทาง"', () => {
  const prev = { programs: [prog('A'), prog('B')], periods: [per('1', 'A', 'KIX-1', '2026-09-01', '2026-09-05'), per('2', 'B', 'NRT-2', '2026-11-01', '2026-11-05')] };
  const next = { programs: [prog('B')], periods: [per('2', 'B', 'NRT-2', '2026-11-01', '2026-11-05'), per('3', 'B', 'NRT-3', '2026-12-01', '2026-12-05')] };
  const r = mergeZegoImport(prev, next, { fullScope: true, now: NOW });
  assert.deepEqual(r.periods.map((p) => p.id).sort(), ['1', '2', '3']);
  assert.equal(r.periods.find((p) => p.id === '1')?.missingSince, NOW);
  assert.deepEqual(r.summary.added, ['3']);
  assert.deepEqual(r.summary.missing, ['1']);
  // โปรแกรม A ยังมีพีเรียดอ้างอยู่ → เก็บไว้
  assert.ok(r.programs.some((p) => p.programCode === 'A'));
});

test('ดึงเฉพาะขอบเขต — กรุ๊ปของโปรแกรมที่ไม่ได้ดึงคงไว้ตามเดิม ไม่ติดไม่พบ', () => {
  const prev = { programs: [prog('A'), prog('B')], periods: [per('1', 'A', 'KIX-1', '2026-11-01', '2026-11-05'), per('2', 'B', 'NRT-2', '2026-11-01', '2026-11-05')] };
  const next = { programs: [prog('B')], periods: [per('2', 'B', 'NRT-2', '2026-11-01', '2026-11-05')] };
  const r = mergeZegoImport(prev, next, { fullScope: false, now: NOW });
  assert.equal(r.periods.find((p) => p.id === '1')?.missingSince, undefined);
  assert.equal(r.summary.keptOutOfScope, 1);
  assert.equal(r.summary.missing.length, 0);
});

test('กลับมาในต้นทาง → ล้างสถานะไม่พบ · ไม่พบซ้ำคงเวลาเดิม', () => {
  const since = '2026-09-01T00:00:00.000Z';
  const prev = { programs: [prog('A')], periods: [per('1', 'A', 'KIX-1', '2026-11-01', '2026-11-05', { missingSince: since }), per('2', 'A', 'KIX-2', '2026-11-08', '2026-11-12', { missingSince: since })] };
  const next = { programs: [prog('A')], periods: [per('1', 'A', 'KIX-1', '2026-11-01', '2026-11-05')] };
  const r = mergeZegoImport(prev, next, { fullScope: true, now: NOW });
  assert.equal(r.periods.find((p) => p.id === '1')?.missingSince, undefined);
  assert.deepEqual(r.summary.restored, ['1']);
  assert.equal(r.periods.find((p) => p.id === '2')?.missingSince, since);
  assert.equal(r.summary.missing.length, 0); // ไม่ใช่ "เพิ่งไม่พบ"
  assert.equal(r.summary.missingTotal, 1);
});

test('id เปลี่ยน (ไม่มี PeriodID) — ผูกกลับ id เดิมด้วยโปรแกรม + รหัสกรุ๊ป + วันไป', () => {
  const prev = { programs: [prog('A')], periods: [per('ZEGO-PD-A-1', 'A', 'KIX-1', '2026-11-01', '2026-11-05')] };
  const next = { programs: [prog('A')], periods: [per('ZEGO-PD-A-KIX-1-2026-11-01', 'A', 'KIX-1', '2026-11-01', '2026-11-05')] };
  const r = mergeZegoImport(prev, next, { fullScope: true, now: NOW });
  assert.deepEqual(r.periods.map((p) => p.id), ['ZEGO-PD-A-1']);
  assert.equal(r.summary.reIdentified, 1);
  assert.equal(r.summary.added.length, 0);
});

test('ตรวจการเปลี่ยนแปลง — วัน / สถานะขาย / เที่ยวบิน', () => {
  const f1 = [{ airlineCode: 'NH', airlineName: 'ANA', flightNo: 'NH806', route: 'BKK-NRT', departureTime: '08:00:00', arrivalTime: '16:00:00' }];
  const f2 = [{ ...f1[0], departureTime: '10:30:00' }];
  const prev = { programs: [prog('A', f1)], periods: [per('1', 'A', 'NRT-1', '2026-11-01', '2026-11-05')] };
  const next = { programs: [prog('A', f2)], periods: [per('1', 'A', 'NRT-1', '2026-11-02', '2026-11-06', { saleStatus: 'CLOSE' })] };
  const r = mergeZegoImport(prev, next, { fullScope: true, now: NOW });
  const d = r.summary.changed[0].details.join(' | ');
  assert.match(d, /วันเดินทาง/);
  assert.match(d, /สถานะขาย SELL → CLOSE/);
  assert.match(d, /เที่ยวบิน/);
});

test('ไม่พบในต้นทาง → Master เป็น MISSING_FROM_SOURCE · เดินทางจบแล้วไม่เตือน · ยังไม่เดินทางเตือน', () => {
  const rows = zegoToTourPeriodMaster({
    programs: [prog('A')],
    periods: [per('old', 'A', 'KIX-1', '2026-09-01', '2026-09-05', { missingSince: NOW }), per('soon', 'A', 'KIX-2', '2026-11-01', '2026-11-05', { missingSince: NOW })],
    importedAt: NOW,
  });
  const old = rows.find((p) => p.internalId === 'old')!;
  const soon = rows.find((p) => p.internalId === 'soon')!;
  assert.equal(old.dataStatus, 'MISSING_FROM_SOURCE');
  assert.equal(old.isActive, false);
  const today = '2026-10-07';
  assert.equal(isMissingButTravelled(old, today), true);
  assert.deepEqual(detectAssignmentIssues(periodSnapshotOf(old), old, today), []);
  assert.equal(detectAssignmentIssues(periodSnapshotOf(soon), soon, today)[0].type, 'MISSING');
});

test('snapshot มีเที่ยวบินขาไป — Zego เปลี่ยนเวลาบินขึ้นเป็น CHANGED · snapshot รุ่นเก่าไม่เทียบ', () => {
  const f1 = [{ airlineCode: 'NH', airlineName: 'ANA', flightNo: '806', route: 'BKK-NRT', departureTime: '08:00:00', arrivalTime: '16:00:00' }];
  const [p] = zegoToTourPeriodMaster({ programs: [prog('A', f1)], periods: [per('1', 'A', 'NRT-1', '2026-11-01', '2026-11-05')], importedAt: NOW });
  const snap = periodSnapshotOf(p);
  assert.equal(snap.outboundFlight, 'NH806 08:00');
  const moved = { ...p, sectors: p.sectors.map((s, i) => (i === 0 ? { ...s, departureTime: '10:30' } : s)) };
  assert.ok(detectAssignmentIssues(snap, moved).some((i) => i.type === 'CHANGED' && /เที่ยวบินขาไป/.test(i.detail ?? '')));
  const legacy = { startDate: snap.startDate, endDate: snap.endDate, bus: snap.bus, countryName: snap.countryName, saleStatus: snap.saleStatus };
  assert.deepEqual(detectAssignmentIssues(legacy, moved), []);
});
