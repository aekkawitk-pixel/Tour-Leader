/**
 * เทสต์ service วันลา: การสร้าง id ที่ไม่ซ้ำ (regression: ห้ามได้ AV-2026-2026007)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { nextLeaveEventId } from '@/services/leave-storage';
import type { LeaderAvailabilityRecord } from '@/types';

const mk = (id: string): LeaderAvailabilityRecord => ({
  id,
  leaderId: 'TL-1',
  type: 'personal_leave',
  startDate: '2026-07-01',
  endDate: '2026-07-01',
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

describe('nextLeaveEventId', () => {
  test('ต่อจากเลขลำดับท้ายที่มากสุด — ไม่รวมปีในกลาง id', () => {
    // regex เดิม (\D→'') จะได้ 2026006 แล้ว +1 เป็น AV-2026-2026007 ซึ่งผิด
    assert.equal(nextLeaveEventId([mk('AV-2026-001'), mk('AV-2026-006')]), 'AV-2026-007');
  });

  test('รายการว่าง → เริ่มที่ 001', () => {
    assert.equal(nextLeaveEventId([]), 'AV-2026-001');
  });

  test('เลือกค่าสูงสุดแม้ไม่เรียง', () => {
    assert.equal(nextLeaveEventId([mk('AV-2026-012'), mk('AV-2026-003'), mk('AV-2026-009')]), 'AV-2026-013');
  });

  test('ข้าม id รูปแบบแปลก (ไม่มีเลขท้าย) โดยไม่พัง', () => {
    assert.equal(nextLeaveEventId([mk('AV-2026-004'), mk('legacy')]), 'AV-2026-005');
  });
});
