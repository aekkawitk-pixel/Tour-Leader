import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leaderLeaveRequests,
  leaveSpanTimes,
  overlappingRecords,
  overlappingTrips,
  upcomingUnavailability,
} from '../src/lib/logic/leaveRequest';
import type { LeaderAvailabilityRecord } from '../src/types';

const rec = (over: Partial<LeaderAvailabilityRecord>): LeaderAvailabilityRecord => ({
  id: 'R', leaderId: 'TL-1', type: 'personal_leave', startDate: '2026-11-12', endDate: '2026-11-14',
  startTime: '', endTime: '', isAllDay: true, blocksAssignment: true, reason: '', approval: 'approved',
  createdBy: 'x', createdByRole: 'leader', createdAt: '2026-10-20T09:00', updatedAt: '2026-10-20T09:00', history: [],
  ...over,
});

test('ขอลา — ช่วงเวลา → เวลาที่เก็บ', () => {
  assert.deepEqual(leaveSpanTimes('full', { start: '10:00', end: '11:00' }), { isAllDay: true, startTime: '', endTime: '' });
  assert.deepEqual(leaveSpanTimes('morning', { start: '', end: '' }), { isAllDay: false, startTime: '09:00', endTime: '12:00' });
  assert.deepEqual(leaveSpanTimes('afternoon', { start: '', end: '' }), { isAllDay: false, startTime: '13:00', endTime: '18:00' });
  assert.deepEqual(leaveSpanTimes('custom', { start: '10:00', end: '11:30' }), { isAllDay: false, startTime: '10:00', endTime: '11:30' });
});

test('ขอลา — ทริปที่ทับวันลา (นับวันขอบ · เรียงวันออกเดินทาง)', () => {
  const trips = [
    { id: 'b', code: 'KIX-261205A', startDate: '2026-12-05', endDate: '2026-12-09' },
    { id: 'a', code: 'ICN-261201B', startDate: '2026-12-01', endDate: '2026-12-04' },
    { id: 'c', code: 'IST-261220A', startDate: '2026-12-20', endDate: '2026-12-26' },
  ];
  assert.deepEqual(overlappingTrips(trips, '2026-12-04', '2026-12-05').map((t) => t.id), ['a', 'b']);
  assert.deepEqual(overlappingTrips(trips, '2026-12-10', '2026-12-19'), []);
  assert.deepEqual(overlappingTrips(trips, '2026-12-26', '2026-12-26').map((t) => t.id), ['c']);
  assert.deepEqual(overlappingTrips(trips, '', '2026-12-26'), []);
});

test('ขอลา — คำขอเดิมที่ทับ ไม่นับที่ปฏิเสธ/ยกเลิก หรือของคนอื่น', () => {
  const records = [
    rec({ id: 'ok' }),
    rec({ id: 'rej', approval: 'rejected' }),
    rec({ id: 'cxl', approval: 'cancelled' }),
    rec({ id: 'other', leaderId: 'TL-2' }),
    rec({ id: 'pending', approval: 'pending', startDate: '2026-11-14', endDate: '2026-11-15' }),
  ];
  assert.deepEqual(overlappingRecords(records, 'TL-1', '2026-11-14', '2026-11-14').map((r) => r.id), ['ok', 'pending']);
});

test('สถานะ/การลา — ช่วงไม่ว่างถัดไป กับ คำขอลา แยกกัน', () => {
  const records = [
    rec({ id: 'past', startDate: '2026-10-01', endDate: '2026-10-03' }),
    rec({ id: 'later', startDate: '2026-12-24', endDate: '2026-12-24', createdByRole: 'coordinator' }),
    rec({ id: 'soon' }),
    rec({ id: 'pending', approval: 'pending', startDate: '2026-12-05', endDate: '2026-12-05' }),
    rec({ id: 'open', blocksAssignment: false, startDate: '2026-11-20', endDate: '2026-11-20' }),
  ];
  assert.deepEqual(upcomingUnavailability(records, 'TL-1', '2026-10-22').map((r) => r.id), ['soon', 'later']);
  assert.deepEqual(leaderLeaveRequests(records, 'TL-1').map((r) => r.id), ['pending', 'open', 'soon', 'past']);
});
