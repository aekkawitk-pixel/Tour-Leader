/**
 * เทสต์ “ต้องเปลี่ยนหัวหน้าทัวร์” — ระบบตั้งเอง (วันลาทับ / ระงับการใช้งาน) และผู้จัดตั้งเอง
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { autoReassignReason, effectiveBoard } from '@/lib/logic/reassignNeed';
import type { LeaderAvailabilityRecord } from '@/types';

const period = { startDate: '2026-10-08', endDate: '2026-10-12' };
const leader = { id: 'TL-1', usageStatus: 'active' as const };
const rec = (over: Partial<LeaderAvailabilityRecord>): LeaderAvailabilityRecord => ({
  id: 'AV-1', leaderId: 'TL-1', type: 'sick_leave', startDate: '2026-10-10', endDate: '2026-10-11',
  startTime: '', endTime: '', isAllDay: true, blocksAssignment: true, reason: '', approval: 'approved',
  createdBy: 'x', createdByRole: 'coordinator', createdAt: '', updatedAt: '', history: [],
  ...over,
} as LeaderAvailabilityRecord);

describe('ต้องเปลี่ยนหัวหน้าทัวร์', () => {
  test('คอนเฟิร์มแล้ว + วันลาอนุมัติทับวันเดินทาง → ระบบตั้งเอง', () => {
    const eb = effectiveBoard({ assignmentStatus: 'CONFIRMED' }, period, leader, [rec({})]);
    assert.equal(eb.board, 'REASSIGN_REQUIRED');
    assert.equal(eb.auto, true);
    assert.match(eb.reason ?? '', /ลาป่วย/);
  });
  test('วันลายังไม่อนุมัติ / ไม่ทับ / ไม่กันการจัดงาน → คงคอนเฟิร์มแล้ว', () => {
    assert.equal(effectiveBoard({ assignmentStatus: 'CONFIRMED' }, period, leader, [rec({ approval: 'pending' })]).board, 'CONFIRMED');
    assert.equal(effectiveBoard({ assignmentStatus: 'CONFIRMED' }, period, leader, [rec({ startDate: '2026-10-13', endDate: '2026-10-14' })]).board, 'CONFIRMED');
    assert.equal(effectiveBoard({ assignmentStatus: 'CONFIRMED' }, period, leader, [rec({ blocksAssignment: false })]).board, 'CONFIRMED');
  });
  test('หัวหน้าทัวร์ถูกระงับการใช้งาน → ระบบตั้งเอง', () => {
    assert.ok(autoReassignReason(period, { id: 'TL-1', usageStatus: 'suspended' }, []));
  });
  test('ผู้จัดตั้งเองพร้อมเหตุผล', () => {
    const eb = effectiveBoard({ assignmentStatus: 'REASSIGN_REQUIRED', reassignReason: 'ไม่สบาย' }, period, leader, []);
    assert.deepEqual(eb, { board: 'REASSIGN_REQUIRED', reason: 'ไม่สบาย', auto: false });
  });
  test('ยังไม่มีหัวหน้าทัวร์ → ยังไม่ระบุ', () => {
    assert.equal(effectiveBoard(null, period, null, []).board, 'UNASSIGNED');
  });
});
