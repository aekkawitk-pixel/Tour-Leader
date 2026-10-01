/**
 * งานที่ถอด/ลบไปแล้วต้องไม่กลับมาแสดงบน Schedule
 *
 * เคยพลาดตรงที่ฟังก์ชันเขียนข้อมูลคืน "รายการทั้งหมด" (รวมรายการที่ถอดแล้ว) กลับไปให้ผู้เรียก
 * ตั้ง state — พอเพิ่มงานใหม่ งานเก่าที่ถอดไปจึงโผล่กลับมา
 * ชุดทดสอบนี้ล็อกไว้ว่าทุกทางออกของ store คืนเฉพาะรายการที่ยังมีผลเท่านั้น
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { periodSnapshotOf } from '@/lib/logic/guideBoard';
import {
  loadGuideAssignments, loadActiveGuideAssignments, loadGuideAssignmentAudit,
  assignPeriod, reassignPeriod, setAssignmentStatus, acknowledgeChange, unassignPeriod,
} from '@/services/guideAssignmentStore';
import { setPeriodSaleStatus } from '@/services/periodOverrideStore';

/** localStorage จำลอง — "รีเฟรชเบราว์เซอร์" = อ่านใหม่จาก mem เดิมโดยไม่ล้าง */
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
};

const AT = (n: number) => `2026-07-13T0${n}:00`;
const sellable = (n: number) => getTourPeriods().filter((p) => p.saleStatus === 'SELL')[n];
const idOf = (periodId: string) => `GA-lead-${periodId}`;
const add = (p: ReturnType<typeof sellable>, leader: string, t: number) =>
  assignPeriod(p.internalId, leader, 'ผู้จัด', AT(t), undefined, periodSnapshotOf(p));

describe('รายการที่ถอดแล้วต้องไม่กลับมา', () => {
  beforeEach(() => { mem.clear(); });

  test('Test 1 — สร้าง A → ถอด A → โหลดใหม่ ต้องไม่พบ A', () => {
    const a = sellable(0);
    add(a, 'TL-1', 1);
    assert.equal(loadActiveGuideAssignments().length, 1);

    const rows = unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(2), 'ยกเลิกงาน');
    assert.equal(rows.length, 0, 'ค่าที่คืนกลับต้องไม่มี A');
    assert.equal(loadActiveGuideAssignments().length, 0, 'โหลดใหม่ต้องไม่พบ A');
  });

  test('Test 2 — สร้าง A → ถอด A → สร้าง B ต้องเห็นเฉพาะ B (A ห้ามกลับมา)', () => {
    const a = sellable(0);
    const b = sellable(1);
    add(a, 'TL-1', 1);
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(2), 'ยกเลิก');

    const res = add(b, 'TL-2', 3);
    assert.equal(res.ok, true);
    const ids = (res.ok ? res.rows : []).map((x) => x.periodId);
    assert.deepEqual(ids, [b.internalId], 'ค่าที่คืนหลังเพิ่ม B ต้องมีเฉพาะ B');
    assert.deepEqual(loadActiveGuideAssignments().map((x) => x.periodId), [b.internalId]);
  });

  test('Test 3 — ถอดเพราะ NO SELL → เพิ่มงานใหม่ รายการที่ถอดต้องไม่กลับมา', () => {
    const a = sellable(0);
    const b = sellable(1);
    add(a, 'TL-1', 1);
    setPeriodSaleStatus(a.internalId, 'NO_SELL', 'ฝ่ายขาย', AT(2), 'SELL');
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(3), 'โปรแกรมเปลี่ยนเป็น NO SELL', 'NO_SELL');

    const res = add(b, 'TL-2', 4);
    assert.equal((res.ok ? res.rows : []).some((x) => x.periodId === a.internalId), false);
    assert.equal(loadActiveGuideAssignments().some((x) => x.periodId === a.internalId), false);
  });

  test('Test 4/5 — โหลดซ้ำหลายรอบ (เปลี่ยนเดือน/รีเฟรช) รายการที่ถอดต้องไม่กลับมา', () => {
    const a = sellable(0);
    add(a, 'TL-1', 1);
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(2), 'ยกเลิก');
    for (let i = 0; i < 5; i++) {
      assert.equal(loadActiveGuideAssignments().length, 0, `โหลดรอบที่ ${i + 1} ต้องยังไม่พบ`);
    }
  });

  test('Test 6 — ข้อมูลที่แสดงตรงกับที่เก็บไว้จริง (active = ทั้งหมด − ที่ถอดแล้ว)', () => {
    const [a, b, c] = [sellable(0), sellable(1), sellable(2)];
    add(a, 'TL-1', 1); add(b, 'TL-2', 2); add(c, 'TL-3', 3);
    unassignPeriod(idOf(b.internalId), 'ผู้จัด', AT(4), 'ยกเลิก');

    const stored = loadGuideAssignments();
    const active = loadActiveGuideAssignments();
    assert.equal(stored.length, 3, 'ที่เก็บไว้ยังครบ 3 (ห้ามลบทิ้ง)');
    assert.equal(active.length, 2);
    assert.deepEqual(active.map((x) => x.periodId).sort(), [a.internalId, c.internalId].sort());
    assert.equal(stored.filter((x) => x.removedAt).length, 1);
  });
});

describe('ทุกทางออกของ store คืนเฉพาะรายการที่ยังมีผล', () => {
  beforeEach(() => { mem.clear(); });

  test('เปลี่ยนสถานะ / รับทราบ / เปลี่ยนคน — ไม่ดึงรายการที่ถอดแล้วกลับมา', () => {
    const a = sellable(0);
    const b = sellable(1);
    add(a, 'TL-1', 1);
    add(b, 'TL-2', 2);
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(3), 'ยกเลิก');

    const noA = (rows: { periodId: string }[]) => rows.every((x) => x.periodId !== a.internalId);
    assert.ok(noA(setAssignmentStatus(idOf(b.internalId), 'CONFIRMED', 'ผู้จัด', AT(4))));
    assert.ok(noA(acknowledgeChange(idOf(b.internalId), periodSnapshotOf(b), 'ผู้จัด', AT(5))));
    const moved = reassignPeriod(idOf(b.internalId), 'TL-9', 'ผู้จัด', AT(6), 'ย้ายคน');
    assert.equal(moved.ok, true);
    assert.ok(noA(moved.ok ? moved.rows : []));
  });

  test('รายการที่ถอดแล้วถูกปลุกกลับมาไม่ได้ด้วยการเปลี่ยนคน/เปลี่ยนสถานะ', () => {
    const a = sellable(0);
    add(a, 'TL-1', 1);
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(2), 'ยกเลิก');

    const moved = reassignPeriod(idOf(a.internalId), 'TL-9', 'ผู้จัด', AT(3), 'ลองย้าย');
    assert.equal(moved.ok, false, 'ต้องปฏิเสธ ไม่ใช่ปลุกกลับมา');
    assert.equal(loadActiveGuideAssignments().length, 0);

    setAssignmentStatus(idOf(a.internalId), 'REASSIGN_REQUIRED', 'ผู้จัด', AT(4));
    assert.equal(loadActiveGuideAssignments().length, 0, 'เปลี่ยนสถานะแล้วต้องยังไม่กลับมา');
    assert.equal(loadGuideAssignments()[0].assignmentStatus, 'CONFIRMED', 'ห้ามแก้ record ที่ถอดแล้ว');
  });

  test('ไม่มีรายการซ้ำ assignmentId แม้ข้อมูลในที่เก็บซ้ำ', () => {
    const a = sellable(0);
    add(a, 'TL-1', 1);
    // จำลองข้อมูลเสียที่มี assignmentId ซ้ำ (เช่นเขียนพร้อมกันจากสองแท็บ)
    const dup = loadGuideAssignments();
    mem.set('guidePeriodAssignments', JSON.stringify([...dup, { ...dup[0], tourLeaderId: 'TL-9' }]));
    const active = loadActiveGuideAssignments();
    assert.equal(active.length, 1, 'ต้องเหลือรายการเดียวต่อ assignmentId');
    assert.equal(active[0].tourLeaderId, 'TL-9', 'เก็บรายการหลังสุด');
  });

  test('จัดงานให้พีเรียดที่เคยถอด → เริ่มรายการใหม่ ไม่สืบทอดร่องรอยการถอด และประวัติยังอยู่', () => {
    const a = sellable(0);
    add(a, 'TL-1', 1);
    unassignPeriod(idOf(a.internalId), 'ผู้จัด', AT(2), 'ยกเลิก');
    const res = add(a, 'TL-5', 3);

    assert.equal(res.ok, true);
    const active = loadActiveGuideAssignments();
    assert.equal(active.length, 1);
    assert.equal(active[0].tourLeaderId, 'TL-5');
    assert.equal(active[0].removedAt, undefined, 'รายการใหม่ต้องไม่มีร่องรอยการถอด');
    // AC11 ประวัติการถอดยังตรวจสอบได้จาก Audit Log
    const audit = loadGuideAssignmentAudit().map((e) => e.action);
    assert.deepEqual(audit, ['assign', 'unassign', 'reassign']);
  });
});
