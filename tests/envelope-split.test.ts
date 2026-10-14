import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLineAmount } from '../src/lib/logic/cashEnvelope';

test('แบ่งซอง — ยอดต่อซอง: ซองเต็ม + เศษ', () => {
  assert.deepEqual(splitLineAmount(101000, 'per', 20000, 'JPY'), { parts: [20000, 20000, 20000, 20000, 20000], remainder: 1000 });
});

test('แบ่งซอง — ยอดต่อซองลงตัว ไม่มีเศษ', () => {
  assert.deepEqual(splitLineAmount(110000, 'per', 10000, 'JPY'), { parts: Array(11).fill(10000), remainder: 0 });
});

test('แบ่งซอง — จำนวนซองเท่า ๆ กัน: เศษจากการปัดไปรวมซองสุดท้าย', () => {
  const r = splitLineAmount(100001, 'count', 3, 'JPY');
  assert.deepEqual(r, { parts: [33333, 33333, 33335], remainder: 0 });
});

test('แบ่งซอง — สกุลที่มีทศนิยมปัดถึงสตางค์ · ยอดรวมเท่าเดิมเสมอ', () => {
  const r = splitLineAmount(1000, 'count', 3, 'USD');
  assert.deepEqual(r.parts, [333.33, 333.33, 333.34]);
  assert.equal(Math.round(r.parts.reduce((a, b) => a + b, 0) * 100) / 100, 1000);
});

test('แบ่งซอง — ค่าไม่ถูกต้อง = ไม่แบ่ง', () => {
  assert.deepEqual(splitLineAmount(1000, 'per', 2000, 'USD').parts, []);
  assert.deepEqual(splitLineAmount(1000, 'count', 1, 'USD').parts, []);
  assert.deepEqual(splitLineAmount(0, 'per', 10, 'USD').parts, []);
});
