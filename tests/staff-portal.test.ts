import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimableDuties, dutiesByMonth, sendOffFee, staffClaims, staffDuties, validateSendOffFeeRates, type DutyPeriod } from '../src/lib/logic/staffPortal';
import type { ExpenseRequest } from '../src/types';

const periods: Record<string, DutyPeriod> = {
  P1: { internalId: 'P1', groupCode: 'KIX-1', displayName: 'โอซาก้า', startDate: '2026-07-10', endDate: '2026-07-15', departureAirportCode: 'BKK', departureTime: '01:30', flightNo: 'XJ612' },
  P2: { internalId: 'P2', groupCode: 'SGN-1', displayName: 'เวียดนาม', startDate: '2026-07-20', endDate: '2026-07-23', departureAirportCode: null, departureTime: null },
  P3: { internalId: 'P3', groupCode: 'HKG-1', displayName: 'ฮ่องกง', startDate: '2026-07-05', endDate: '2026-07-08', departureAirportCode: 'DMK', departureTime: '10:00' },
};
const assignments = [
  { assignmentId: 'A1', periodId: 'P1', staffId: 'SOS-001', dayOffset: 0, status: 'CONFIRMED' as const },
  { assignmentId: 'A2', periodId: 'P2', staffId: 'SOS-001', dayOffset: 0, status: 'PENDING_CONFIRMATION' as const },
  { assignmentId: 'A3', periodId: 'P3', staffId: 'SOS-001', dayOffset: 0, status: 'CONFIRMED' as const },
  { assignmentId: 'A4', periodId: 'P3', staffId: 'SOS-002', dayOffset: 0, status: 'CONFIRMED' as const },
];

const duties = staffDuties({
  assignments,
  staffId: 'SOS-001',
  periodOf: (id) => periods[id] ?? null,
  manualTimes: { P2: '09:00' },
  manualAirports: { P2: 'BKK' },
  leadHours: 3,
});

test('ตารางงาน: เฉพาะของตัวเอง เรียงตามวันที่ต้องไป', () => {
  assert.deepEqual(duties.map((d) => d.assignmentId), ['A3', 'A1', 'A2']);
});

test('เครื่องออกเช้ามืด → ต้องไปคืนก่อนวันเดินทาง · เวลาถึงสนามบินคำนวณจากเวลาเครื่องออก', () => {
  const p1 = duties.find((d) => d.periodId === 'P1')!;
  assert.equal(p1.dutyDate, '2026-07-09');
  assert.equal(p1.arrivalTime, '22:30');
  const p3 = duties.find((d) => d.periodId === 'P3')!;
  assert.equal(p3.dutyDate, '2026-07-05');
  assert.equal(p3.arrivalTime, '07:00');
  assert.equal(p3.airport, 'DMK');
});

test('ไม่มีเวลาเครื่องออกในพีเรียด → ใช้เวลาที่ผู้จัดกรอกเอง และสนามบินที่กรอกเอง', () => {
  const p2 = duties.find((d) => d.periodId === 'P2')!;
  assert.equal(p2.flightTime, '09:00');
  assert.equal(p2.arrivalTime, '06:00');
  assert.equal(p2.airport, 'BKK');
  assert.equal(p2.confirmed, false);
});

const claim = (jobId: string, status: ExpenseRequest['status'], requesterId = 'SOS-001'): ExpenseRequest => ({
  id: `EXP-${jobId}-${status}`, jobId, category: 'actual', requesterId, requesterName: 'x', requesterKind: 'sendoff',
  requestedAt: '2026-07-13T10:00', lines: [], totalTHB: 0, bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' },
  note: '', status, history: [],
});

test('เบิกได้: คอนเฟิร์มแล้ว + ถึงวันไปส่งแล้ว + ยังไม่เคยเบิก', () => {
  assert.deepEqual(claimableDuties(duties, [], 'SOS-001', '2026-07-13').map((d) => d.periodId), ['P3', 'P1']);
  // P2 ยังไม่คอนเฟิร์ม และยังไม่ถึงวัน
  assert.deepEqual(claimableDuties(duties, [], 'SOS-001', '2026-07-30').map((d) => d.periodId), ['P3', 'P1']);
  // ยังไม่ถึงวันไปส่ง
  assert.deepEqual(claimableDuties(duties, [], 'SOS-001', '2026-07-06').map((d) => d.periodId), ['P3']);
});

test('เบิกแล้วไม่ขึ้นซ้ำ · ใบที่ยกเลิก/ไม่อนุมัติ เบิกใหม่ได้ · ใบของคนอื่นไม่นับ', () => {
  const today = '2026-07-13';
  assert.deepEqual(claimableDuties(duties, [claim('P3', 'submitted')], 'SOS-001', today).map((d) => d.periodId), ['P1']);
  assert.deepEqual(claimableDuties(duties, [claim('P3', 'rejected')], 'SOS-001', today).map((d) => d.periodId), ['P3', 'P1']);
  assert.deepEqual(claimableDuties(duties, [claim('P3', 'submitted', 'SOS-002')], 'SOS-001', today).map((d) => d.periodId), ['P3', 'P1']);
});

test('ใบเบิกของฉัน: เฉพาะใบเบิกเจ้าหน้าที่ส่งกรุ๊ปของตัวเอง', () => {
  const leaderExpense = { ...claim('P1', 'submitted'), requesterKind: undefined };
  assert.deepEqual(staffClaims([claim('P1', 'paid'), leaderExpense, claim('P3', 'submitted', 'SOS-002')], 'SOS-001').map((e) => e.jobId), ['P1']);
});

test('ค่าส่งกรุ๊ป: วันปกติ 900 บาท · วันไปส่งตรงกับวันหยุด 1,200 บาท', () => {
  assert.deepEqual(sendOffFee(null), { amount: 900, holiday: null });
  assert.deepEqual(sendOffFee('วันปิยมหาราช'), { amount: 1200, holiday: 'วันปิยมหาราช' });
});

test('ใบเบิกรายเดือน: กรุ๊ปในใบไม่ขึ้นรอเบิกซ้ำ · บรรทัดที่บัญชีไม่อนุมัติ กรุ๊ปนั้นเบิกใหม่ได้', () => {
  const today = '2026-07-13';
  const feeLine = (periodId: string, rejected = false) => ({
    id: `L-${periodId}`, expenseType: 'ค่าส่งกรุ๊ป', purpose: '', amount: 900, currency: 'THB', fxRate: 1, amountTHB: 900,
    receiptNo: '', evidenceFileName: '', periodId, ...(rejected ? { rejected: true } : {}),
  });
  const monthly = { ...claim('SOM-2026-07', 'submitted'), claimMonth: '2026-07', lines: [feeLine('P3'), feeLine('P1')] };
  assert.deepEqual(claimableDuties(duties, [monthly], 'SOS-001', today).map((d) => d.periodId), []);
  const partial = { ...monthly, lines: [feeLine('P3'), feeLine('P1', true)] };
  assert.deepEqual(claimableDuties(duties, [partial], 'SOS-001', today).map((d) => d.periodId), ['P1']);
});

test('จัดงานรอเบิกเป็นรายเดือนตามวันไปส่ง', () => {
  const list = dutiesByMonth(duties);
  assert.deepEqual(list.map((g) => [g.month, g.duties.map((d) => d.periodId)]), [['2026-07', duties.map((d) => d.periodId)]]);
});

test('ค่าส่งกรุ๊ป: ใช้มาตรฐานที่ผู้ดูแลระบบตั้ง · ตรวจค่าก่อนบันทึก', () => {
  const rates = { normal: 1000, holiday: 1500, weekendAsHoliday: true };
  assert.deepEqual(sendOffFee(null, rates), { amount: 1000, holiday: null });
  assert.deepEqual(sendOffFee('วันเสาร์', rates), { amount: 1500, holiday: 'วันเสาร์' });
  assert.equal(validateSendOffFeeRates(rates), null);
  assert.notEqual(validateSendOffFeeRates({ ...rates, normal: 0 }), null);
});
