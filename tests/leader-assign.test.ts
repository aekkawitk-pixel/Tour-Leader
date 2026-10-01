/**
 * เทสต์ helper ของ Flow "เลือกหัวหน้าทัวร์ก่อน" — suitabilityLevel (§6) + scheduleRunSummary (§8/§9)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  suitabilityLevel,
  scheduleRunSummary,
  type LeaderEvaluation,
} from '@/lib/logic/tourLeaderMatching';

const evalOf = (over: Partial<LeaderEvaluation>): LeaderEvaluation => ({
  leaderId: 'L',
  eligible: true,
  failedRequired: [],
  warnings: [],
  score: 80,
  maxScore: 100,
  scorePct: 80,
  matchedReasons: [],
  factors: [],
  availabilityVerdict: 'ok',
  ...over,
});

describe('suitabilityLevel (§6) — 4 ระดับ', () => {
  test('ไม่ผ่านเงื่อนไขบังคับ → blocked (ไม่สามารถจัดได้)', () => {
    assert.equal(suitabilityLevel(evalOf({ eligible: false, failedRequired: [{ code: 'X', label: 'y' }] })), 'blocked');
  });
  test('ผ่าน + มีคำเตือน → check (ควรตรวจสอบ)', () => {
    assert.equal(suitabilityLevel(evalOf({ warnings: [{ code: 'W', label: 'w' }] })), 'check');
  });
  test('ผ่าน + ไม่มีคำเตือน + คะแนนสูง → excellent (เหมาะสมมาก)', () => {
    assert.equal(suitabilityLevel(evalOf({ score: 85 })), 'excellent');
  });
  test('ผ่าน + ไม่มีคำเตือน + คะแนนไม่สูง → good (เหมาะสม)', () => {
    assert.equal(suitabilityLevel(evalOf({ score: 60 })), 'good');
  });
});

describe('scheduleRunSummary (§8/§9) — วันต่อเนื่อง + ช่วงพัก', () => {
  test('ว่าง → 0 วัน ไม่มีช่วงพัก', () => {
    const r = scheduleRunSummary([]);
    assert.equal(r.consecutiveDays, 0);
    assert.deepEqual(r.restGaps, []);
  });

  test('งานติดกัน (จบ 05 → เริ่ม 06) → นับเป็นช่วงเดียว', () => {
    const r = scheduleRunSummary([
      { id: 'A', departDate: '2026-08-01', returnDate: '2026-08-05' },
      { id: 'B', departDate: '2026-08-06', returnDate: '2026-08-08' },
    ]);
    assert.equal(r.consecutiveDays, 8); // 01–08 รวม 8 วัน
    assert.equal(r.restGaps.length, 0);
  });

  test('งานเว้นช่วง → มีช่วงพักตามจำนวนวันว่าง', () => {
    const r = scheduleRunSummary([
      { id: 'A', departDate: '2026-08-01', returnDate: '2026-08-03' },
      { id: 'B', departDate: '2026-08-08', returnDate: '2026-08-10' },
    ]);
    assert.equal(r.consecutiveDays, 3); // ช่วงยาวสุด = 3 วัน
    assert.equal(r.restGaps.length, 1);
    assert.equal(r.restGaps[0].days, 4); // 04,05,06,07 = 4 วันว่าง
    assert.equal(r.restGaps[0].from, 'A');
    assert.equal(r.restGaps[0].to, 'B');
  });

  test('งานทับกัน → รวมเป็นช่วงเดียว', () => {
    const r = scheduleRunSummary([
      { id: 'A', departDate: '2026-08-01', returnDate: '2026-08-06' },
      { id: 'B', departDate: '2026-08-04', returnDate: '2026-08-09' },
    ]);
    assert.equal(r.consecutiveDays, 9); // 01–09
    assert.equal(r.restGaps.length, 0);
  });
});
