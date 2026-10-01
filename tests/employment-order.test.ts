/**
 * เทสต์การจัดลำดับประวัติการทำงาน (Drag & Drop / sortOrder)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { sortByDisplayOrder, sortEmploymentHistory } from '@/modules/tour-leaders/experience';
import type { EmploymentHistory } from '@/types';

const entry = (
  id: string,
  over: Partial<EmploymentHistory> = {},
): EmploymentHistory => ({
  id,
  tourLeaderId: 'TL-1',
  employerName: id,
  currency: 'THB',
  startMonth: 1,
  startYear: 2020,
  isCurrentJob: false,
  position: 'พนักงาน',
  createdAt: '2020-01-01',
  updatedAt: '2020-01-01',
  ...over,
});

describe('sortByDisplayOrder — ลำดับที่ผู้ใช้จัดไว้', () => {
  test('เรียงตาม sortOrder ไม่ใช่ลำดับใน array', () => {
    const list = [
      entry('A', { sortOrder: 2 }),
      entry('B', { sortOrder: 0 }),
      entry('C', { sortOrder: 1 }),
    ];
    assert.deepEqual(
      sortByDisplayOrder(list).map((e) => e.id),
      ['B', 'C', 'A'],
    );
  });

  test('ไม่มี sortOrder → คงลำดับใน array เดิม (stable)', () => {
    const list = [entry('X'), entry('Y'), entry('Z')];
    assert.deepEqual(
      sortByDisplayOrder(list).map((e) => e.id),
      ['X', 'Y', 'Z'],
    );
  });

  test('ไม่ทำข้อมูลของแต่ละแถวเสียหาย/สลับผิดแถว', () => {
    const list = [
      entry('A', { sortOrder: 1, position: 'ผู้จัดการ', employerName: 'บริษัท ก' }),
      entry('B', { sortOrder: 0, position: 'หัวหน้า', employerName: 'บริษัท ข' }),
    ];
    const [first, second] = sortByDisplayOrder(list);
    assert.equal(first.id, 'B');
    assert.equal(first.position, 'หัวหน้า');
    assert.equal(first.employerName, 'บริษัท ข');
    assert.equal(second.id, 'A');
    assert.equal(second.position, 'ผู้จัดการ');
  });

  test('ไม่กลายพันธุ์ (immutable) — ไม่แก้ array เดิม', () => {
    const list = [entry('A', { sortOrder: 1 }), entry('B', { sortOrder: 0 })];
    const before = list.map((e) => e.id);
    sortByDisplayOrder(list);
    assert.deepEqual(
      list.map((e) => e.id),
      before,
    );
  });
});

describe('sortEmploymentHistory — เรียงจากล่าสุด (ผู้ใช้สั่งเอง)', () => {
  test('งานปัจจุบันก่อน แล้วเรียงตามวันเริ่มล่าสุด→เก่า', () => {
    const list = [
      entry('old', { startYear: 2018, startMonth: 3 }),
      entry('current', { isCurrentJob: true, startYear: 2015, startMonth: 1 }),
      entry('recent', { startYear: 2022, startMonth: 6 }),
    ];
    assert.deepEqual(
      sortEmploymentHistory(list).map((e) => e.id),
      ['current', 'recent', 'old'],
    );
  });
});
