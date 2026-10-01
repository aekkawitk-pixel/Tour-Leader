/**
 * nextMonthStartFromNow — เดือนถัดไปจากวันที่จริง (ใช้เป็นเดือนค่าเริ่มต้นของหน้า Schedule)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextMonthStart } from '../src/components/ui/MonthPicker';
import { toISODate } from '../src/lib/format';

describe('เดือนค่าเริ่มต้น = เดือนปัจจุบัน + 1', () => {
  test('เดือนกลางปีเลื่อนไป 1 เดือน', () => {
    assert.equal(nextMonthStart('2026-08-21'), '2026-09-01');
    assert.equal(nextMonthStart('2026-08-01'), '2026-09-01', 'วันแรกของเดือนก็ยังได้เดือนถัดไป');
    assert.equal(nextMonthStart('2026-08-31'), '2026-09-01', 'วันสุดท้ายของเดือนก็ยังได้เดือนถัดไป');
  });

  test('ข้ามปีได้ถูกต้อง', () => {
    assert.equal(nextMonthStart('2026-12-15'), '2027-01-01');
  });

  test('เดือนที่มี 31 วันไปเดือนที่มี 30 วัน ไม่เพี้ยน', () => {
    assert.equal(nextMonthStart('2026-01-31'), '2026-02-01', 'ม.ค. 31 ต้องได้ ก.พ. ไม่ใช่ มี.ค.');
    assert.equal(nextMonthStart('2026-03-31'), '2026-04-01');
  });

  test('คิดจากวันที่จริงของเครื่อง ไม่ใช่วันที่อ้างอิงของ Demo', () => {
    const now = new Date();
    const expected = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    assert.equal(nextMonthStart(toISODate(now)), expected);
    assert.notEqual(expected, nextMonthStart('2026-07-13'), 'ต้องไม่ตรึงอยู่ที่ DEMO_TODAY');
  });
});
