/**
 * เทสต์การจัด lane ของแถบปฏิทิน (รายการซ้อนวันต้องคนละแถว · ไม่ซ้อนใช้แถวเดิมได้)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { assignLanes } from '@/components/leaders/AvailabilityCalendar';
import type { LeaderAvailabilityRecord } from '@/types';

const mk = (id: string, startDate: string, endDate: string): LeaderAvailabilityRecord => ({
  id,
  leaderId: 'TL-1',
  type: 'personal_leave',
  startDate,
  endDate,
  startTime: '',
  endTime: '',
  isAllDay: true,
  blocksAssignment: true,
  reason: '',
  approval: 'approved',
  createdBy: 'x',
  createdByRole: 'coordinator',
  createdAt: '',
  updatedAt: '',
  history: [],
});

describe('assignLanes — จัดแถวแถบปฏิทิน', () => {
  test('รายการที่ช่วงวันซ้อนกัน → คนละ lane', () => {
    const m = assignLanes([mk('A', '2026-07-14', '2026-07-16'), mk('B', '2026-07-15', '2026-07-18')]);
    assert.notEqual(m.get('A'), m.get('B'));
  });

  test('รายการที่ไม่ซ้อนกัน → ใช้ lane เดิมได้ (lane 0)', () => {
    const m = assignLanes([mk('A', '2026-07-01', '2026-07-03'), mk('B', '2026-07-10', '2026-07-12')]);
    assert.equal(m.get('A'), 0);
    assert.equal(m.get('B'), 0);
  });

  test('รายการเดียวข้ามหลายสัปดาห์ได้ lane เดียว', () => {
    const m = assignLanes([mk('LONG', '2026-07-30', '2026-08-03')]);
    assert.equal(m.get('LONG'), 0);
  });

  test('สามรายการซ้อนกันทั้งหมด → lane 0,1,2', () => {
    const m = assignLanes([
      mk('A', '2026-07-14', '2026-07-20'),
      mk('B', '2026-07-14', '2026-07-20'),
      mk('C', '2026-07-14', '2026-07-20'),
    ]);
    assert.deepEqual([m.get('A'), m.get('B'), m.get('C')].sort(), [0, 1, 2]);
  });
});
