import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dutyShift, staffHomeSummary, type StaffDuty } from '../src/lib/logic/staffPortal';

const duty = (dutyDate: string, arrivalTime: string | null, airport: string | null, confirmed = true): StaffDuty => ({
  assignmentId: `${dutyDate}-${arrivalTime}-${airport}`, periodId: 'P', period: null, dutyDate, arrivalTime, flightTime: null, airport, confirmed,
});

test('หน้าหลักเจ้าหน้าที่ — ช่วงเช้า 00:01–12:00 · ช่วงเย็น 12:01–00:00', () => {
  assert.equal(dutyShift('00:01'), 'morning');
  assert.equal(dutyShift('12:00'), 'morning');
  assert.equal(dutyShift('12:01'), 'evening');
  assert.equal(dutyShift('23:59'), 'evening');
  assert.equal(dutyShift('00:00'), 'evening');
  assert.equal(dutyShift(null), null);
});

test('หน้าหลักเจ้าหน้าที่ — งานเดือนนี้ · แยกสุวรรณภูมิ/ดอนเมือง · งานวันนี้', () => {
  const s = staffHomeSummary([
    duty('2026-10-07', '04:00', 'BKK'),
    duty('2026-10-07', '15:30', 'DMK'),
    duty('2026-10-07', null, 'BKK', false),
    duty('2026-10-20', '09:00', 'BKK'),
    duty('2026-10-21', '09:00', 'CNX'),
    duty('2026-11-01', '09:00', 'DMK'), // เดือนหน้า ไม่นับ
  ], '2026-10-07');
  assert.equal(s.monthCount, 5);
  assert.equal(s.monthPending, 1);
  assert.deepEqual(s.monthByAirport, [{ code: 'BKK', count: 3 }, { code: 'DMK', count: 1 }, { code: 'CNX', count: 1 }]);
  assert.equal(s.today.duties.length, 3);
  assert.deepEqual(s.today.airports, [{ code: 'BKK', count: 2 }, { code: 'DMK', count: 1 }]);
  assert.equal(s.today.morning, 1);
  assert.equal(s.today.evening, 1);
  assert.equal(s.today.noTime, 1);
});

test('หน้าหลักเจ้าหน้าที่ — ไม่มีงาน: สุวรรณภูมิ/ดอนเมืองยังแสดงเป็น 0', () => {
  const s = staffHomeSummary([], '2026-10-07');
  assert.deepEqual(s.monthByAirport, [{ code: 'BKK', count: 0 }, { code: 'DMK', count: 0 }]);
  assert.equal(s.today.morning + s.today.evening, 0);
});

import { dutyStage } from '../src/lib/logic/staffPortal';

test('หน้าหลักเจ้าหน้าที่ — เลือกเดือนอื่นได้ (ส่วนวันนี้ยังอิงวันนี้)', () => {
  const s = staffHomeSummary([duty('2026-10-07', '04:00', 'BKK'), duty('2026-11-01', '09:00', 'DMK')], '2026-10-07', '2026-11');
  assert.equal(s.monthCount, 1);
  assert.deepEqual(s.monthByAirport, [{ code: 'BKK', count: 0 }, { code: 'DMK', count: 1 }]);
  assert.equal(s.today.duties.length, 1);
});

test('หน้าหลักเจ้าหน้าที่ — สถานะงานตามเวลา', () => {
  assert.equal(dutyStage({ confirmed: false, arrivalTime: '10:00', dutyDate: 'x' }, '09:00'), 'pending');
  assert.equal(dutyStage({ confirmed: true, arrivalTime: null, dutyDate: 'x' }, '09:00'), 'no_time');
  assert.equal(dutyStage({ confirmed: true, arrivalTime: '08:00', dutyDate: 'x' }, '09:00'), 'in_progress');
  assert.equal(dutyStage({ confirmed: true, arrivalTime: '12:00', dutyDate: 'x' }, '09:00'), 'preparing');
  assert.equal(dutyStage({ confirmed: true, arrivalTime: '12:01', dutyDate: 'x' }, '09:00'), 'waiting');
});

test('หน้าหลักเจ้าหน้าที่ — เลือกวันที่อื่นในเดือน', () => {
  const list = [duty('2026-10-07', '04:00', 'BKK'), duty('2026-10-20', '15:00', 'DMK'), duty('2026-10-20', null, 'BKK')];
  const s = staffHomeSummary(list, '2026-10-07', '2026-10', '2026-10-20');
  assert.equal(s.today.duties.length, 2);
  assert.equal(s.today.evening, 1);
  assert.equal(s.today.noTime, 1);
  assert.equal(dutyStage(list[1], '09:00', '2026-10-07'), 'waiting');
  assert.equal(dutyStage(list[0], '09:00', '2026-10-08'), 'past');
});
