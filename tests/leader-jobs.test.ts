/**
 * เทสต์ตรรกะ "จัดงานตามหัวหน้าทัวร์" (มุมมองดูตามหัวหน้าทัวร์)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptanceCategory,
  ACCEPTANCE_TAB_META,
  assignableJobsFrom,
  assignedCountByLeader,
  backdatedAssignmentError,
  checkCandidateForLeader,
  departureStarted,
  jobTiming,
  jobsForLeader,
  leaderAcceptance,
  leaderAssignmentGate,
  leaderJobStats,
  leaderJobsByAcceptance,
  leaderProgramSummary,
  rejectionReasonOf,
  travelStatusLabel,
  unassignedJobs,
} from '@/lib/logic/leaderJobs';
import type { Appointment, JobStatus, LeaderStatus, LeaderUsageStatus, TourJob } from '@/types';

const TODAY = '2026-07-14';

const flight = { flightNo: 'TG-1', route: 'BKK – HND', departAt: '', arriveAt: '' };

const mkJob = (over: Partial<TourJob>): TourJob => ({
  id: 'JOB-X',
  title: 'โปรแกรมทดสอบ',
  customer: 'ลูกค้า',
  country: 'ญี่ปุ่น',
  cities: [],
  route: 'เส้นทาง',
  departDate: '2026-08-01',
  returnDate: '2026-08-05',
  meetingDateTime: '2026-08-01T06:00',
  meetingPoint: 'สนามบิน',
  outboundFlight: flight,
  inboundFlight: flight,
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
});

const mkAppt = (over: Partial<Appointment>): Appointment => ({
  id: 'APT-1',
  date: '2026-08-02',
  time: '10:00',
  durationMinutes: 60,
  leaderId: 'TL-1',
  jobId: 'JOB-Y',
  staffName: '',
  mode: 'office',
  location: '',
  note: '',
  status: 'confirmed',
  history: [],
  ...over,
});

describe('jobTiming — จัดช่วงเวลาเทียบวันนี้', () => {
  test('กำลังเดินทาง (วันนี้อยู่ในช่วง) = current', () => {
    assert.equal(jobTiming(mkJob({ departDate: '2026-07-10', returnDate: '2026-07-20' }), TODAY), 'current');
  });
  test('อนาคต = upcoming', () => {
    assert.equal(jobTiming(mkJob({ departDate: '2026-09-01', returnDate: '2026-09-05' }), TODAY), 'upcoming');
  });
  test('อดีต = past', () => {
    assert.equal(jobTiming(mkJob({ departDate: '2026-01-01', returnDate: '2026-01-05' }), TODAY), 'past');
  });
});

describe('jobsForLeader / stats / counts', () => {
  const jobs = [
    mkJob({ id: 'A', leaderId: 'TL-1', departDate: '2026-09-01', returnDate: '2026-09-05', status: 'offered' }),
    mkJob({ id: 'B', leaderId: 'TL-1', departDate: '2026-01-01', returnDate: '2026-01-05', status: 'closed' }),
    mkJob({ id: 'C', leaderId: 'TL-1', departDate: '2026-07-10', returnDate: '2026-07-20', status: 'traveling' }),
    mkJob({ id: 'D', leaderId: 'TL-2', departDate: '2026-08-01', returnDate: '2026-08-05', status: 'offered' }),
    mkJob({ id: 'E', leaderId: null }),
  ];

  test('เฉพาะงานของคนนั้น เรียงใหม่→เก่า', () => {
    const mine = jobsForLeader(jobs, 'TL-1');
    assert.deepEqual(mine.map((j) => j.id), ['A', 'C', 'B']);
  });

  test('สถิติแยกตามช่วงเวลา', () => {
    const s = leaderJobStats(jobs, 'TL-1', TODAY);
    assert.deepEqual(s, { total: 3, current: 1, upcoming: 1, past: 1 });
  });

  test('นับจำนวนโปรแกรมต่อคน (ข้ามงานไม่มีหัวหน้าทัวร์)', () => {
    const map = assignedCountByLeader(jobs);
    assert.equal(map.get('TL-1'), 3);
    assert.equal(map.get('TL-2'), 1);
    assert.equal(map.has('__none__'), false);
  });

  test('unassignedJobs = งานที่ยังไม่มีคน และไม่ปิดงาน', () => {
    const open = unassignedJobs(jobs);
    assert.deepEqual(open.map((j) => j.id), ['E']);
  });
});

describe('ห้ามมอบหมายย้อนหลัง (departureStarted / assignableJobsFrom)', () => {
  // วันนี้ = 2026-07-13 (ตามตัวอย่างในสเปก)
  const NOW = '2026-07-13';

  test('ออกเดินทางวันนี้ → ยังมอบหมายได้ (ไม่ถือว่าเริ่มไปแล้ว)', () => {
    assert.equal(departureStarted(mkJob({ departDate: '2026-07-13' }), NOW), false);
    assert.equal(backdatedAssignmentError(mkJob({ departDate: '2026-07-13' }), NOW), null);
  });

  test('ออกเดินทางพรุ่งนี้ → มอบหมายได้', () => {
    assert.equal(departureStarted(mkJob({ departDate: '2026-07-14' }), NOW), false);
  });

  test('เริ่มเดินทางเมื่อวานแต่ยังไม่กลับ (12–16) → เริ่มไปแล้ว มอบหมายไม่ได้', () => {
    const j = mkJob({ departDate: '2026-07-12', returnDate: '2026-07-16' });
    assert.equal(departureStarted(j, NOW), true);
    assert.match(backdatedAssignmentError(j, NOW) ?? '', /เริ่มเดินทางแล้ว/);
  });

  test('เดินทางเสร็จแล้ว (10–12) → มอบหมายไม่ได้', () => {
    assert.equal(departureStarted(mkJob({ departDate: '2026-07-10', returnDate: '2026-07-12' }), NOW), true);
  });

  test('assignableJobsFrom: เหลือเฉพาะงานไม่มีคน + ออกเดินทางวันนี้/อนาคต', () => {
    const jobs = [
      mkJob({ id: 'PAST', leaderId: null, departDate: '2026-07-10', returnDate: '2026-07-12' }),
      mkJob({ id: 'STARTED', leaderId: null, departDate: '2026-07-12', returnDate: '2026-07-16' }),
      mkJob({ id: 'TODAY', leaderId: null, departDate: '2026-07-13', returnDate: '2026-07-15' }),
      mkJob({ id: 'FUTURE', leaderId: null, departDate: '2026-08-01', returnDate: '2026-08-05' }),
      mkJob({ id: 'HAS_LEADER', leaderId: 'TL-9', departDate: '2026-08-10', returnDate: '2026-08-12' }),
      mkJob({ id: 'CLOSED', leaderId: null, status: 'closed', departDate: '2026-08-20', returnDate: '2026-08-22' }),
    ];
    const ids = assignableJobsFrom(jobs, NOW).map((j) => j.id);
    assert.deepEqual(ids, ['TODAY', 'FUTURE']); // เรียงตามวันเดินทาง ใกล้→ไกล
  });
});

describe('leaderAcceptance — สถานะการตอบรับจากสถานะงาน', () => {
  const cases: [JobStatus, string][] = [
    ['offered', 'รอตอบรับ'],
    ['accepted', 'ตอบรับแล้ว'],
    ['traveling', 'ตอบรับแล้ว'],
    ['rejected', 'ปฏิเสธ'],
    ['need_leader', 'ยังไม่ได้เสนอ'],
  ];
  for (const [status, label] of cases) {
    test(`${status} → ${label}`, () => {
      assert.equal(leaderAcceptance(status).label, label);
    });
  }
});

describe('หมวดการตอบรับ (Tab ตามสถานะการตอบรับ)', () => {
  test('offered → assigned · accepted/traveling/awaiting/closed → accepted · rejected → rejected', () => {
    assert.equal(acceptanceCategory('offered'), 'assigned');
    assert.equal(acceptanceCategory('accepted'), 'accepted');
    assert.equal(acceptanceCategory('traveling'), 'accepted');
    assert.equal(acceptanceCategory('awaiting_settlement'), 'accepted');
    assert.equal(acceptanceCategory('closed'), 'accepted');
    assert.equal(acceptanceCategory('rejected'), 'rejected');
    assert.equal(acceptanceCategory('need_leader'), null);
  });

  test('ป้ายและข้อความว่างใช้คำว่า "ปฏิเสธ" ที่สะกดถูก', () => {
    assert.equal(ACCEPTANCE_TAB_META.rejected.badge.label, 'ปฏิเสธ');
    assert.equal(ACCEPTANCE_TAB_META.rejected.tabLabel, 'โปรแกรมที่ปฏิเสธ');
    assert.equal(ACCEPTANCE_TAB_META.rejected.empty, 'ยังไม่มีโปรแกรมที่ถูกปฏิเสธ');
    // ต้องไม่มี ฎ (ปฎิเสธ ผิด) ในทุกข้อความ
    for (const meta of Object.values(ACCEPTANCE_TAB_META)) {
      assert.ok(!`${meta.tabLabel} ${meta.badge.label} ${meta.empty}`.includes('ปฎิเสธ'));
    }
  });

  test('leaderJobsByAcceptance: แยกงานของคนเดียวเป็น 3 หมวด เรียงวันเดินทางใกล้→ไกล', () => {
    const jobs = [
      mkJob({ id: 'OFF', leaderId: 'TL-1', status: 'offered', departDate: '2026-09-01' }),
      mkJob({ id: 'ACC', leaderId: 'TL-1', status: 'accepted', departDate: '2026-08-01' }),
      mkJob({ id: 'TRV', leaderId: 'TL-1', status: 'traveling', departDate: '2026-07-01' }),
      mkJob({ id: 'REJ', leaderId: 'TL-1', status: 'rejected', departDate: '2026-10-01' }),
      mkJob({ id: 'OTHER', leaderId: 'TL-2', status: 'offered', departDate: '2026-09-01' }),
    ];
    const g = leaderJobsByAcceptance(jobs, 'TL-1');
    assert.deepEqual(g.assigned.map((j) => j.id), ['OFF']);
    assert.deepEqual(g.accepted.map((j) => j.id), ['TRV', 'ACC']); // ใกล้→ไกล
    assert.deepEqual(g.rejected.map((j) => j.id), ['REJ']);
  });

  test('rejectionReasonOf: อ่านเหตุผลจากประวัติ event ล่าสุดที่ to=rejected', () => {
    const job = mkJob({
      id: 'R',
      status: 'rejected',
      history: [
        { id: 'e1', at: '2026-07-01T09:00', from: 'need_leader', to: 'offered', by: 'ผู้จัด' },
        { id: 'e2', at: '2026-07-02T09:00', from: 'offered', to: 'rejected', by: 'หัวหน้าทัวร์', note: 'ติดงานอื่น' },
      ],
    });
    assert.equal(rejectionReasonOf(job), 'ติดงานอื่น');
    assert.equal(rejectionReasonOf(mkJob({ status: 'offered' })), null);
  });

  test('travelStatusLabel: กำลังเดินทาง / อีก N วัน / สิ้นสุดแล้ว', () => {
    const NOW = '2026-07-13';
    assert.equal(travelStatusLabel(mkJob({ departDate: '2026-07-10', returnDate: '2026-07-20' }), NOW), 'กำลังเดินทาง');
    assert.equal(travelStatusLabel(mkJob({ departDate: '2026-07-24', returnDate: '2026-07-28' }), NOW), 'อีก 11 วัน');
    assert.equal(travelStatusLabel(mkJob({ departDate: '2026-06-01', returnDate: '2026-06-05' }), NOW), 'สิ้นสุดแล้ว');
  });
});

describe('leaderProgramSummary — สรุปงานสำหรับการ์ดรายชื่อ', () => {
  const NOW = '2026-07-13';

  test('นับแยกหมวด + total + งานถัดไป (accepted ที่ยังไม่เริ่ม ใกล้สุด) + รอตอบรับ', () => {
    const jobs = [
      mkJob({ id: 'OFF1', leaderId: 'TL-1', status: 'offered', departDate: '2026-08-10', returnDate: '2026-08-14' }),
      mkJob({ id: 'ACC_PAST', leaderId: 'TL-1', status: 'traveling', departDate: '2026-07-01', returnDate: '2026-07-20' }),
      mkJob({ id: 'ACC_NEXT', leaderId: 'TL-1', status: 'accepted', departDate: '2026-07-28', returnDate: '2026-08-02' }),
      mkJob({ id: 'ACC_FAR', leaderId: 'TL-1', status: 'accepted', departDate: '2026-12-01', returnDate: '2026-12-05' }),
      mkJob({ id: 'REJ1', leaderId: 'TL-1', status: 'rejected', departDate: '2026-09-01', returnDate: '2026-09-05' }),
    ];
    const s = leaderProgramSummary(jobs, 'TL-1', NOW);
    assert.equal(s.total, 5);
    assert.deepEqual(s.counts, { assigned: 1, accepted: 3, rejected: 1 });
    assert.equal(s.nextTrip?.id, 'ACC_NEXT'); // accepted ที่ยังไม่เริ่ม ใกล้สุด (ไม่เอา traveling ที่เริ่มแล้ว)
    assert.equal(s.pendingCount, 1); // OFF1 (offered upcoming)
  });

  test('ไม่มี accepted ในอนาคต → nextTrip = null', () => {
    const jobs = [
      mkJob({ id: 'OFF', leaderId: 'TL-2', status: 'offered', departDate: '2026-08-01', returnDate: '2026-08-05' }),
    ];
    const s = leaderProgramSummary(jobs, 'TL-2', NOW);
    assert.equal(s.nextTrip, null);
    assert.equal(s.pendingCount, 1);
    assert.equal(s.total, 1);
  });
});

describe('checkCandidateForLeader — ตรวจก่อนเพิ่มโปรแกรม', () => {
  const leaderId = 'TL-1';
  const existing = mkJob({
    id: 'JOB-OLD',
    leaderId,
    status: 'offered', // blocking
    departDate: '2026-12-25',
    returnDate: '2026-12-30',
  });

  test('ทับกับงานเดิม → blocked พร้อมข้อความอ้างอิงรหัสงาน', () => {
    const candidate = mkJob({ id: 'JOB-NEW', departDate: '2026-12-28', returnDate: '2027-01-02' });
    const res = checkCandidateForLeader(candidate, leaderId, [existing, candidate], []);
    assert.equal(res.verdict, 'blocked');
    assert.match(res.message ?? '', /JOB-OLD/);
  });

  test('ไม่ทับ + ห่างเกิน 2 วัน + ไม่มีนัดหมาย → ok', () => {
    const candidate = mkJob({ id: 'JOB-FAR', departDate: '2026-06-01', returnDate: '2026-06-05' });
    const res = checkCandidateForLeader(candidate, leaderId, [existing, candidate], []);
    assert.equal(res.verdict, 'ok');
  });

  test('ใกล้งานเดิม ≤ 2 วัน → warn', () => {
    // งานเดิมจบ 30 ธ.ค., งานใหม่เริ่ม 1 ม.ค. (ห่าง 2 วัน)
    const candidate = mkJob({ id: 'JOB-NEAR', departDate: '2027-01-01', returnDate: '2027-01-04' });
    const res = checkCandidateForLeader(candidate, leaderId, [existing, candidate], []);
    assert.equal(res.verdict, 'warn');
    assert.match(res.message ?? '', /ใกล้กับงาน/);
  });

  test('มีนัดหมายตรงช่วงเดินทาง → warn', () => {
    const candidate = mkJob({ id: 'JOB-APPT', departDate: '2026-08-01', returnDate: '2026-08-05' });
    const appt = mkAppt({ leaderId, date: '2026-08-03' });
    const res = checkCandidateForLeader(candidate, leaderId, [candidate], [appt]);
    assert.equal(res.verdict, 'warn');
    assert.match(res.message ?? '', /นัดหมาย/);
  });

  test('งานเดิมสถานะ draft (ไม่ blocking) ไม่ทำให้ทับซ้อน', () => {
    const draft = mkJob({ id: 'JOB-DRAFT', leaderId, status: 'draft', departDate: '2026-08-01', returnDate: '2026-08-10' });
    const candidate = mkJob({ id: 'JOB-OVL', departDate: '2026-08-03', returnDate: '2026-08-06' });
    const res = checkCandidateForLeader(candidate, leaderId, [draft, candidate], []);
    assert.equal(res.verdict, 'ok');
  });
});

/* ------------- กฎการนำหัวหน้าทัวร์ไปจัดงาน (ตรวจตามลำดับ) ------------- */

describe('leaderAssignmentGate — ลำดับ: ใช้งาน → พร้อมรับงาน → งานซ้อน → ลา/ไม่พร้อม', () => {
  const L = (usageStatus: LeaderUsageStatus, status: LeaderStatus) => ({ usageStatus, status });
  const clear = { hasJobOverlap: false, hasLeaveOverlap: false };

  test('ผ่านทุกข้อ', () => {
    const r = leaderAssignmentGate(L('active', 'available'), clear);
    assert.equal(r.ok, true);
    assert.equal(r.failed, null);
  });

  test('ข้อ 1 สถานะการใช้งานต้องเป็น "ใช้งาน"', () => {
    assert.equal(leaderAssignmentGate(L('suspended', 'available'), clear).failed, 'usage');
    assert.equal(leaderAssignmentGate(L('ended', 'available'), clear).failed, 'usage');
    assert.match(leaderAssignmentGate(L('suspended', 'available'), clear).reason, /ระงับการใช้งาน/);
  });

  test('ข้อ 2 ความพร้อมรับงานต้องเป็น "พร้อมรับงาน"', () => {
    const r = leaderAssignmentGate(L('active', 'unavailable'), clear);
    assert.equal(r.failed, 'readiness');
    assert.match(r.reason, /ไม่พร้อมรับงาน/);
  });

  test('ข้อ 3 งานเดิมทับซ้อน', () => {
    const r = leaderAssignmentGate(L('active', 'available'), { hasJobOverlap: true, hasLeaveOverlap: false });
    assert.equal(r.failed, 'job_overlap');
  });

  test('ข้อ 4 รายการลา/ช่วงไม่พร้อมทับซ้อน', () => {
    const r = leaderAssignmentGate(L('active', 'available'), { hasJobOverlap: false, hasLeaveOverlap: true });
    assert.equal(r.failed, 'leave_overlap');
  });

  test('หยุดที่ข้อแรกที่ไม่ผ่าน — สถานะการใช้งานมาก่อนงานซ้อน', () => {
    const r = leaderAssignmentGate(L('suspended', 'unavailable'), { hasJobOverlap: true, hasLeaveOverlap: true });
    assert.equal(r.failed, 'usage');
  });

  test('ใช้งาน + พร้อมรับงาน = ไม่ถูกบล็อกด้วยมิติสถานะการใช้งาน (สองมิติแยกกัน)', () => {
    assert.equal(leaderAssignmentGate(L('active', 'available'), clear).ok, true);
    // ระงับ แต่ความพร้อมยังเป็นพร้อมรับงาน (ข้อมูลเก่า) → ต้องยังบล็อกที่ข้อ 1
    assert.equal(leaderAssignmentGate(L('suspended', 'available'), clear).ok, false);
  });
});
