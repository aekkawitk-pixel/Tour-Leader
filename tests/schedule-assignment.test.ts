/**
 * เทสต์ ScheduleAssignmentService — recheck (§9) + buildCommit (§10)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildCommit, recheckStaged, type StagedAssignment } from '@/lib/logic/scheduleAssignment';
import type { MatchingContext } from '@/lib/logic/tourLeaderMatching';
import { tourLeaders, countries, tourRoutes, DEMO_TODAY } from '@/data';
import type { TourJob, TourLeader } from '@/types';

const baseLeader = tourLeaders[0];
const leaderWith = (over: Partial<TourLeader>): TourLeader => ({ ...baseLeader, ...over });

const mkJob = (id: string, departDate: string, returnDate: string): TourJob => ({
  id,
  title: `ทัวร์ ${id}`,
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
});

const okLeader = leaderWith({ id: 'OK', active: true, status: 'available' });
const suspended = leaderWith({ id: 'SUS', active: true, usageStatus: 'suspended', status: 'unavailable' });

function setup(jobs: TourJob[], leaders: TourLeader[]) {
  const jobsById = new Map(jobs.map((j) => [j.id, j]));
  const leadersById = new Map(leaders.map((l) => [l.id, l]));
  const ctx: MatchingContext = {
    countries,
    routes: tourRoutes,
    allJobs: jobs,
    today: DEMO_TODAY,
    appointments: [],
    records: [],
  };
  return { jobsById, leadersById, ctx };
}

describe('§10 buildCommit — แยกผ่าน/มีปัญหา', () => {
  test('คนพร้อม → passed (สถานะ pending) + audit ครบ', () => {
    const jobs = [mkJob('J1', '2026-08-10', '2026-08-14')];
    const { jobsById, leadersById, ctx } = setup(jobs, [okLeader]);
    const staged: StagedAssignment[] = [
      { tourJobId: 'J1', tourLeaderId: 'OK', source: 'recommended', recommendedLeaderIds: ['OK'] },
    ];
    const r = buildCommit(staged, jobsById, leadersById, ctx, 'ผู้จัด', '2026-07-13T09:00');
    assert.equal(r.passed.length, 1);
    assert.equal(r.failed.length, 0);
    assert.equal(r.passed[0].assignment.assignmentStatus, 'pending');
    assert.equal(r.passed[0].assignment.tourLeaderId, 'OK');
    assert.equal(r.passed[0].audit.followedRecommendation, true);
    assert.equal(r.passed[0].matchingResult.tourJobId, 'J1');
  });

  test('ถูกระงับการใช้งาน → failed พร้อมเหตุผล', () => {
    const jobs = [mkJob('J1', '2026-08-10', '2026-08-14')];
    const { jobsById, leadersById, ctx } = setup(jobs, [suspended]);
    const staged: StagedAssignment[] = [
      { tourJobId: 'J1', tourLeaderId: 'SUS', source: 'manual', recommendedLeaderIds: [] },
    ];
    const r = buildCommit(staged, jobsById, leadersById, ctx, 'ผู้จัด', '2026-07-13T09:00');
    assert.equal(r.passed.length, 0);
    assert.equal(r.failed.length, 1);
    assert.ok(r.failed[0].reasons.some((x) => x.includes('ระงับ')));
  });
});

describe('§9 recheckStaged — เลือกคนซ้ำในรอบเดียวกัน', () => {
  test('คนเดียวกันสองงานที่วันทับกัน → ทั้งคู่ ok=false + เหตุผล cross-conflict', () => {
    const jobs = [mkJob('J1', '2026-08-10', '2026-08-14'), mkJob('J2', '2026-08-12', '2026-08-16')];
    const { jobsById, leadersById, ctx } = setup(jobs, [okLeader]);
    const staged: StagedAssignment[] = [
      { tourJobId: 'J1', tourLeaderId: 'OK', source: 'manual', recommendedLeaderIds: [] },
      { tourJobId: 'J2', tourLeaderId: 'OK', source: 'manual', recommendedLeaderIds: [] },
    ];
    const items = recheckStaged(staged, jobsById, leadersById, ctx);
    assert.ok(items.every((i) => i.ok === false));
    assert.ok(items.every((i) => i.blockReasons.some((r) => r.includes('ซ้อนกับงาน'))));
  });

  test('คนละคน วันทับกัน → ไม่ cross-conflict (ok=true)', () => {
    const jobs = [mkJob('J1', '2026-08-10', '2026-08-14'), mkJob('J2', '2026-08-12', '2026-08-16')];
    const other = leaderWith({ id: 'OK2', active: true, status: 'available' });
    const { jobsById, leadersById, ctx } = setup(jobs, [okLeader, other]);
    const staged: StagedAssignment[] = [
      { tourJobId: 'J1', tourLeaderId: 'OK', source: 'manual', recommendedLeaderIds: [] },
      { tourJobId: 'J2', tourLeaderId: 'OK2', source: 'manual', recommendedLeaderIds: [] },
    ];
    const items = recheckStaged(staged, jobsById, leadersById, ctx);
    assert.ok(items.every((i) => i.crossConflicts.length === 0));
    assert.ok(items.every((i) => i.ok === true));
  });
});
