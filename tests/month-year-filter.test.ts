import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesPeriodFilter, validPeriodFilter } from '../src/app/guide/MonthYearFilter';

const months = ['2025-12', '2026-10', '2026-11', '2027-01'];

test('ตัวกรองช่วงเวลา — ไม่ได้เลือก = ปีปัจจุบัน', () => {
  assert.equal(validPeriodFilter(null, months, '2026-10-06'), '2026');
});

test('ตัวกรองช่วงเวลา — ปีนี้ไม่มีกรุ๊ป = ปีล่าสุดที่มี', () => {
  assert.equal(validPeriodFilter(null, months, '2028-03-01'), '2027');
  assert.equal(validPeriodFilter(null, ['2025-05'], '2026-10-06'), '2025');
});

test('ตัวกรองช่วงเวลา — ค่าที่เลือกยังมีกรุ๊ป ใช้ค่านั้น · ไม่มีแล้ว กลับไปปีเริ่มต้น', () => {
  assert.equal(validPeriodFilter('2026-11', months, '2026-10-06'), '2026-11');
  assert.equal(validPeriodFilter('2027', months, '2026-10-06'), '2027');
  assert.equal(validPeriodFilter('2026-03', months, '2026-10-06'), '2026');
});

test('ตัวกรองช่วงเวลา — ไม่มีข้อมูลเลย = null', () => {
  assert.equal(validPeriodFilter(null, [], '2026-10-06'), null);
});

test('ตัวกรองช่วงเวลา — กรองด้วย prefix ของวันที่', () => {
  assert.equal(matchesPeriodFilter('2026-11-21', '2026'), true);
  assert.equal(matchesPeriodFilter('2026-11-21', '2026-11'), true);
  assert.equal(matchesPeriodFilter('2026-11-21', '2026-10'), false);
});
