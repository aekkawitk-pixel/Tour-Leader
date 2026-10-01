/**
 * เทสต์ TourLeaderMatchingService — Required / Warning / Ranking (§5/§6)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateLeaderForJob,
  rankLeadersForJob,
  type MatchingContext,
} from '@/lib/logic/tourLeaderMatching';
import { tourLeaders, countries, tourRoutes, DEMO_TODAY } from '@/data';
import type { LeaderAvailabilityRecord, TourJob, TourLeader } from '@/types';

const baseLeader = tourLeaders[0];

/** งานผู้สมัคร (อนาคต — ไม่ backdated) */
const mkJob = (over: Partial<TourJob> = {}): TourJob => {
  const departDate = over.departDate ?? '2026-08-10';
  const returnDate = over.returnDate ?? '2026-08-14';
  return {
    id: 'CAND',
    title: 'ทัวร์ทดสอบ',
    customer: 'ลูกค้า',
    country: 'ญี่ปุ่น',
    cities: [],
    route: 'BKK – NRT – BKK',
    departDate,
    returnDate,
    meetingDateTime: `${departDate}T06:00`,
    meetingPoint: 'สนามบิน',
    outboundFlight: { flightNo: 'TG-660', route: 'BKK – HND', departAt: `${departDate}T08:00`, arriveAt: `${departDate}T16:00` },
    inboundFlight: { flightNo: 'TG-623', route: 'KIX – BKK', departAt: `${returnDate}T18:00`, arriveAt: `${returnDate}T23:00` },
    paxCount: 10,
    leaderId: null,
    assistantLeaderIds: [],
    coordinator: '',
    leaderFee: 0,
    budget: 0,
    attachments: [],
    note: '',
    status: 'need_leader',
    history: [],
    ...over,
  };
};

const mkLeave = (leaderId: string, over: Partial<LeaderAvailabilityRecord>): LeaderAvailabilityRecord => ({
  id: 'AV-T',
  leaderId,
  type: 'personal_leave',
  startDate: '2026-07-20',
  endDate: '2026-07-20',
  startTime: '',
  endTime: '',
  isAllDay: true,
  blocksAssignment: true,
  reason: 'ลาทดสอบ',
  approval: 'approved',
  createdBy: 'x',
  createdByRole: 'coordinator',
  createdAt: '',
  updatedAt: '',
  history: [],
  ...over,
});

const ctx = (job: TourJob, over: Partial<MatchingContext> = {}): MatchingContext => ({
  countries,
  routes: tourRoutes,
  allJobs: [job],
  today: DEMO_TODAY,
  appointments: [],
  records: [],
  ...over,
});

const leaderWith = (over: Partial<TourLeader>): TourLeader => ({ ...baseLeader, ...over });

describe('§5 Required rules — เลือกไม่ได้', () => {
  test('ถูกระงับการใช้งาน → ineligible + REQ_NOT_SUSPENDED', () => {
    const job = mkJob();
    const e = evaluateLeaderForJob(leaderWith({ id: 'L1', active: true, usageStatus: 'suspended', status: 'unavailable' }), job, ctx(job));
    assert.equal(e.eligible, false);
    assert.ok(e.failedRequired.some((f) => f.code === 'REQ_NOT_SUSPENDED'));
  });

  test('สิ้นสุดการใช้งาน → ineligible + REQ_ACTIVE', () => {
    const job = mkJob();
    const e = evaluateLeaderForJob(
      leaderWith({ id: 'L1', usageStatus: 'ended', active: false, status: 'unavailable' }),
      job,
      ctx(job),
    );
    assert.equal(e.eligible, false);
    assert.ok(e.failedRequired.some((f) => f.code === 'REQ_ACTIVE'));
  });

  test('ใช้งาน แต่ความพร้อมรับงาน = ไม่พร้อมรับงาน → REQ_STATUS_AVAILABLE', () => {
    const job = mkJob();
    const e = evaluateLeaderForJob(
      leaderWith({ id: 'L2', usageStatus: 'active', active: true, status: 'unavailable' }),
      job,
      ctx(job),
    );
    assert.equal(e.eligible, false);
    assert.ok(e.failedRequired.some((f) => f.code === 'REQ_STATUS_AVAILABLE'));
  });

  test('วันลาทับช่วงเดินทาง (ทั้งวัน) → ineligible + REQ_NO_TIME_CONFLICT + มีรายละเอียด', () => {
    const job = mkJob({ departDate: '2026-08-10', returnDate: '2026-08-12' });
    const leave = mkLeave('L1', { startDate: '2026-08-10', endDate: '2026-08-12', isAllDay: true });
    const e = evaluateLeaderForJob(
      leaderWith({ id: 'L1', active: true, status: 'available' }),
      job,
      ctx(job, { records: [leave] }),
    );
    assert.equal(e.eligible, false);
    const conflict = e.failedRequired.find((f) => f.code === 'REQ_NO_TIME_CONFLICT');
    assert.ok(conflict && conflict.detail && conflict.detail.length > 0);
  });
});

describe('§5 ตัวอย่าง: ลาถึง 20/07 12:00 vs ทัวร์ 20/07 23:00 → warn (เลือกได้)', () => {
  test('วันเดียวกันคนละเวลา → eligible=true, verdict=warn, มีคำเตือน', () => {
    const job = mkJob({ departDate: '2026-07-20', returnDate: '2026-07-20', meetingDateTime: '2026-07-20T23:00' });
    const leave = mkLeave('L1', {
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      isAllDay: false,
      startTime: '08:00',
      endTime: '12:00',
    });
    const e = evaluateLeaderForJob(
      leaderWith({ id: 'L1', active: true, status: 'available' }),
      job,
      ctx(job, { records: [leave] }),
    );
    assert.equal(e.eligible, true);
    assert.equal(e.availabilityVerdict, 'warn');
    assert.ok(e.warnings.length > 0);
  });
});

describe('§6 rankLeadersForJob', () => {
  test('แยก eligible / ineligible และ ineligible มีเหตุผล', () => {
    const job = mkJob();
    const leaders = [
      leaderWith({ id: 'OK1', active: true, status: 'available' }),
      leaderWith({ id: 'OK2', active: true, status: 'available' }),
      leaderWith({ id: 'BAD', active: true, usageStatus: 'suspended', status: 'unavailable' }),
    ];
    const { eligible, ineligible } = rankLeadersForJob(job, leaders, ctx(job));
    assert.equal(eligible.length, 2);
    assert.equal(ineligible.length, 1);
    assert.equal(ineligible[0].leaderId, 'BAD');
    assert.ok(ineligible[0].failedRequired.length > 0);
  });

  test('eligible เรียงจากคำเตือนน้อย → คะแนนมาก', () => {
    const job = mkJob();
    const { eligible } = rankLeadersForJob(
      job,
      [
        leaderWith({ id: 'A', active: true, status: 'available' }),
        leaderWith({ id: 'B', active: true, status: 'available' }),
      ],
      ctx(job),
    );
    for (let i = 1; i < eligible.length; i++) {
      const prev = eligible[i - 1];
      const cur = eligible[i];
      assert.ok(prev.warnings.length < cur.warnings.length || prev.score >= cur.score);
    }
  });
});
