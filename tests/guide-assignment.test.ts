/**
 * Guide Assignment (periodId) + Tour Period Service fns + period conflict (§3/§6/§7/§8)
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTourPeriods, getTourPeriodById, getAssignablePeriods, getTourPeriodsByMonth, getTourPeriodsByDateRange, getTourPeriodSectors } from '@/services/tourPeriodMaster';
import { periodScheduleDisplay, boardStatusFromAssignment, checkPeriodConflict, periodSnapshotOf, detectAssignmentIssues } from '@/lib/logic/guideBoard';
import { loadGuideAssignments, loadActiveGuideAssignments, assignPeriod, reassignPeriod, unassignPeriod, acknowledgeChange, loadGuideAssignmentAudit } from '@/services/guideAssignmentStore';
import { setPeriodDataStatus, clearPeriodOverride } from '@/services/periodOverrideStore';

// mock localStorage (node ไม่มี window) — store อ่าน window แบบ lazy จึงตั้งค่าก่อน test รันได้
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
};

const TODAY = '2026-07-13';

describe('Tour Period Service — fns เพิ่ม (§3)', () => {
  test('getTourPeriodsByMonth / ByDateRange / Sectors', () => {
    const aug = getTourPeriodsByMonth('2026-08-01');
    assert.ok(aug.length > 0 && aug.every((p) => p.startDate <= '2026-08-31' && p.endDate >= '2026-08-01'));
    const range = getTourPeriodsByDateRange('2026-08-01', '2026-08-03');
    assert.ok(range.every((p) => p.startDate <= '2026-08-03' && p.endDate >= '2026-08-01'));
    assert.deepEqual(getTourPeriodSectors(getTourPeriods()[0].internalId), []); // CSV ยังไม่มี Sector
  });
});

describe('Period display + board + conflict (§6/§8)', () => {
  test('periodScheduleDisplay อ่านจาก Master · boardStatusFromAssignment', () => {
    const p = getTourPeriods()[0];
    const d = periodScheduleDisplay(p);
    assert.equal(d.groupCode, p.groupCode);
    assert.equal(d.country, p.countryName);
    assert.equal(boardStatusFromAssignment(undefined), 'UNASSIGNED');
    assert.equal(boardStatusFromAssignment('CONFIRMED'), 'CONFIRMED');
  });

  test('checkPeriodConflict — ทับวัน → blocked · พักน้อยกว่า buffer → warn · ว่าง → ok', () => {
    const assigned = [{ periodId: 'P1', startDate: '2026-08-01', endDate: '2026-08-04' }];
    assert.equal(checkPeriodConflict({ periodId: 'P2', startDate: '2026-08-03', endDate: '2026-08-06' }, assigned, []).verdict, 'blocked');
    assert.equal(checkPeriodConflict({ periodId: 'P2', startDate: '2026-08-05', endDate: '2026-08-08' }, assigned, [], 48).verdict, 'warn');
    assert.equal(checkPeriodConflict({ periodId: 'P2', startDate: '2026-08-20', endDate: '2026-08-23' }, assigned, [], 24).verdict, 'ok');
  });
});

describe('Guide Assignment Store (§7) — เก็บเฉพาะ periodId', () => {
  beforeEach(() => { mem.clear(); });

  test('assign → CONFIRMED ทันที · reassign (คนใหม่ + CONFIRMED ทันที) · unassign + audit', () => {
    const pid = getTourPeriods()[0].internalId;
    const created = assignPeriod(pid, 'TL-000001', 'ผู้จัด A', `${TODAY}T00:00`, 'ลูกค้าขอ');
    assert.equal(created.ok, true);
    let list = created.rows;
    assert.equal(list.length, 1);
    const a = list[0];
    assert.equal(a.periodId, pid);
    assert.equal(a.tourLeaderId, 'TL-000001');
    // มอบหมายแล้วถือว่าคอนเฟิร์มทันที — ไม่มีขั้นตอนรอคอนเฟิร์มแยกต่างหากอีกต่อไป
    assert.equal(a.assignmentStatus, 'CONFIRMED');
    // ไม่เก็บข้อมูลพีเรียดซ้ำ (§7)
    assert.ok(!('groupCode' in a) && !('country' in a) && !('startDate' in a));

    const moved = reassignPeriod(a.assignmentId, 'TL-000002', 'ผู้จัด A', `${TODAY}T02:00`, 'คนเดิมติดภารกิจ');
    assert.equal(moved.ok, true);
    list = moved.rows;
    assert.equal(list[0].tourLeaderId, 'TL-000002');
    assert.equal(list[0].assignmentStatus, 'CONFIRMED'); // เปลี่ยนคนแล้วคอนเฟิร์มทันทีเช่นกัน

    // ถอดออก = ไม่มีผลแล้ว แต่ Record ต้องยังอยู่ให้ตรวจย้อนหลัง (ห้ามลบ)
    unassignPeriod(a.assignmentId, 'ผู้จัด A', `${TODAY}T03:00`);
    assert.equal(loadActiveGuideAssignments().length, 0);
    assert.equal(loadGuideAssignments().length, 1);
    assert.equal(loadGuideAssignments()[0].removedBy, 'ผู้จัด A');

    // audit ครบทุก action
    const audit = loadGuideAssignmentAudit();
    const actions = audit.map((e) => e.action);
    assert.deepEqual(actions, ['assign', 'reassign', 'unassign']);
    assert.ok(audit.every((e) => e.periodId === pid));
  });
});

describe('Master เปลี่ยน/พีเรียดปิด → แจ้งเตือน (§9/§10)', () => {
  beforeEach(() => { mem.clear(); });

  test('detectAssignmentIssues — CHANGED (วันเดินทางต่าง) / MISSING / INACTIVE', () => {
    const p = getTourPeriods()[0];
    const snap = periodSnapshotOf(p);
    assert.deepEqual(detectAssignmentIssues(snap, p), []); // ตรงกัน → ไม่มี issue
    // วันเดินทางเปลี่ยน
    const changed = detectAssignmentIssues({ ...snap, startDate: '2026-08-02', endDate: '2026-08-05' }, p);
    assert.ok(changed.some((i) => i.type === 'CHANGED' && /วันเดินทางเปลี่ยน/.test(i.detail ?? '')));
    // พีเรียดหาย
    assert.equal(detectAssignmentIssues(snap, null)[0].type, 'MISSING');
    // ปิดใช้งาน
    assert.equal(detectAssignmentIssues(snap, { ...p, dataStatus: 'INACTIVE', isActive: false })[0].type, 'INACTIVE');
  });

  test('override: ปิดใช้งานพีเรียด → service สะท้อน + getAssignablePeriods ตัดออก · เปิดกลับได้ (§10)', () => {
    const p = getTourPeriods()[0];
    assert.equal(getTourPeriodById(p.internalId)?.dataStatus, 'ACTIVE');
    assert.ok(getAssignablePeriods().some((x) => x.internalId === p.internalId));
    setPeriodDataStatus(p.internalId, 'INACTIVE');
    assert.equal(getTourPeriodById(p.internalId)?.dataStatus, 'INACTIVE');
    assert.equal(getTourPeriodById(p.internalId)?.isActive, false);
    assert.ok(!getAssignablePeriods().some((x) => x.internalId === p.internalId)); // §10 ห้ามจัดใหม่
    clearPeriodOverride(p.internalId);
    assert.equal(getTourPeriodById(p.internalId)?.dataStatus, 'ACTIVE');
  });

  test('acknowledgeChange — อัปเดต snapshot ตามต้นทาง + audit (ไม่ลบ assignment §9)', () => {
    const p = getTourPeriods()[0];
    assignPeriod(p.internalId, 'TL-000001', 'A', '2026-07-13T00:00', undefined, { ...periodSnapshotOf(p), startDate: '2026-08-02' });
    const before = loadGuideAssignments()[0];
    assert.ok(detectAssignmentIssues(before.snapshot, p).some((i) => i.type === 'CHANGED'));
    const list = acknowledgeChange(before.assignmentId, periodSnapshotOf(p), 'A', '2026-07-13T01:00');
    assert.equal(list.length, 1); // ไม่ลบ
    assert.deepEqual(detectAssignmentIssues(list[0].snapshot, p), []); // หลังรับทราบ → ไม่มี issue
  });
});
