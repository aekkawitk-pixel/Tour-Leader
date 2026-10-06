import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripEnded, tripOngoing, tripStarted } from '../src/lib/logic/tripPhase';

const trip = { startDate: '2026-10-08', endDate: '2026-10-12' };

test('ช่วงของทริป — ก่อนวันไป', () => {
  assert.equal(tripStarted(trip, '2026-10-07'), false);
  assert.equal(tripOngoing(trip, '2026-10-07'), false);
  assert.equal(tripEnded(trip, '2026-10-07'), false);
});

test('ช่วงของทริป — วันไปนับเป็นกำลังเดินทาง', () => {
  assert.equal(tripStarted(trip, '2026-10-08'), true);
  assert.equal(tripOngoing(trip, '2026-10-08'), true);
  assert.equal(tripEnded(trip, '2026-10-08'), false);
});

test('ช่วงของทริป — วันกลับเป็นทั้งกำลังเดินทางและจบทริป (ไม่มีวันที่กรุ๊ปหายจากทั้งสองแท็บ)', () => {
  assert.equal(tripOngoing(trip, '2026-10-12'), true);
  assert.equal(tripEnded(trip, '2026-10-12'), true);
});

test('ช่วงของทริป — หลังวันกลับ', () => {
  assert.equal(tripOngoing(trip, '2026-10-13'), false);
  assert.equal(tripEnded(trip, '2026-10-13'), true);
});

test('ช่วงของทริป — ไม่มีวันกลับ ใช้วันไปแทน', () => {
  const noEnd = { startDate: '2026-10-08', endDate: '' };
  assert.equal(tripEnded(noEnd, '2026-10-07'), false);
  assert.equal(tripOngoing(noEnd, '2026-10-08'), true);
  assert.equal(tripEnded(noEnd, '2026-10-08'), true);
});
