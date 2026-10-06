/**
 * "งานใหม่" ในกระดิ่ง — เครื่องหมายเปิดดูแล้วอยู่กับตัวงาน (leaderSeenAt) ไม่ใช่กับเครื่อง
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { periodSnapshotOf } from '@/lib/logic/guideBoard';
import { assignPeriod, loadActiveGuideAssignments, markAssignmentSeen, reassignPeriod } from '@/services/guideAssignmentStore';

const mem = new Map<string, string>();
let events = 0;
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
  dispatchEvent: () => { events += 1; return true; },
};

const p = () => getTourPeriods().filter((x) => x.saleStatus === 'SELL')[0];
const seenOf = (id: string) => loadActiveGuideAssignments().find((a) => a.assignmentId === id)?.leaderSeenAt;

beforeEach(() => { mem.clear(); events = 0; });

test('มอบหมายใหม่ = ยังไม่เคยเปิดดู · เปิดดูแล้วบันทึกเวลาไว้กับตัวงาน', () => {
  const period = p();
  assignPeriod(period.internalId, 'TL-1', 'ผู้จัด', '2026-10-01T09:00', undefined, periodSnapshotOf(period));
  const id = `GA-lead-${period.internalId}`;
  assert.equal(seenOf(id), undefined);
  markAssignmentSeen(id, '2026-10-02T10:00');
  assert.equal(seenOf(id), '2026-10-02T10:00');
  assert.equal(events, 1, 'ต้องแจ้งให้กระดิ่งนับใหม่');
  // เปิดซ้ำไม่ทับเวลาครั้งแรก และไม่แจ้งซ้ำ
  markAssignmentSeen(id, '2026-10-03T10:00');
  assert.equal(seenOf(id), '2026-10-02T10:00');
  assert.equal(events, 1);
});

test('เปลี่ยนหัวหน้าทัวร์ = ล้างเครื่องหมาย (คนใหม่ยังไม่เคยเห็นงานนี้)', () => {
  const period = p();
  assignPeriod(period.internalId, 'TL-1', 'ผู้จัด', '2026-10-01T09:00', undefined, periodSnapshotOf(period));
  const id = `GA-lead-${period.internalId}`;
  markAssignmentSeen(id, '2026-10-02T10:00');
  reassignPeriod(id, 'TL-2', 'ผู้จัด', '2026-10-04T09:00', 'สลับคน', period.saleStatus);
  assert.equal(seenOf(id), undefined);
});
