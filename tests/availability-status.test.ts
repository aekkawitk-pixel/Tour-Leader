/**
 * เทสต์ "สถานะและการลา": สถานะความพร้อมที่คำนวณ + วันลาป้อนเข้า engine ตรวจมอบหมาย
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeOrUpcomingLeaveCount,
  computeAvailabilityStatus,
  formatRecordSchedule,
  isActiveOn,
  isUsageBlocked,
  nearestUnavailability,
  readinessStatus,
  usageStatus,
} from '@/lib/logic/availabilityStatus';
import { checkProgramAvailability, leaderUnavailability } from '@/lib/logic/leaderAvailability';
import type { LeaderAvailabilityRecord, TourJob, TourLeader } from '@/types';

const TODAY = '2026-07-13';

const mkLeader = (over: Partial<TourLeader> = {}): TourLeader =>
  ({
    id: 'TL-1',
    firstName: 'ก',
    lastName: 'ข',
    status: 'available',
    usageStatus: 'active',
    active: true,
    ...over,
  }) as TourLeader;

const mkRecord = (over: Partial<LeaderAvailabilityRecord>): LeaderAvailabilityRecord => ({
  id: 'AV-1',
  leaderId: 'TL-1',
  type: 'personal_leave',
  startDate: '2026-07-13',
  endDate: '2026-07-13',
  startTime: '',
  endTime: '',
  isAllDay: true,
  blocksAssignment: true,
  reason: 'ทดสอบ',
  approval: 'approved',
  createdBy: 'ผู้จัด',
  createdByRole: 'coordinator',
  createdAt: '2026-07-10T09:00',
  updatedAt: '2026-07-10T09:00',
  history: [],
  ...over,
});

const flight = { flightNo: 'X', route: 'X', departAt: '', arriveAt: '' };
const mkJob = (over: Partial<TourJob>): TourJob => {
  const departDate = over.departDate ?? '2026-08-01';
  const returnDate = over.returnDate ?? '2026-08-05';
  return {
    id: 'JOB-X', title: 't', customer: '', country: '', cities: [], route: '',
    meetingPoint: '', paxCount: 0, leaderId: null, assistantLeaderIds: [], coordinator: '',
    leaderFee: 0, budget: 0, attachments: [], note: '', status: 'need_leader', history: [],
    ...over, departDate, returnDate,
    meetingDateTime: over.meetingDateTime ?? `${departDate}T06:00`,
    outboundFlight: over.outboundFlight ?? { ...flight, departAt: `${departDate}T08:00` },
    inboundFlight: over.inboundFlight ?? { ...flight, arriveAt: `${returnDate}T20:00` },
  } as TourJob;
};

describe('§9 computeAvailabilityStatus — ลำดับความสำคัญ', () => {
  test('ระงับการใช้งาน > อื่น', () => {
    assert.equal(
      computeAvailabilityStatus(mkLeader({ usageStatus: 'suspended' }), [], [], TODAY).key,
      'suspended',
    );
  });
  test('สิ้นสุดการใช้งาน', () => {
    assert.equal(
      computeAvailabilityStatus(mkLeader({ usageStatus: 'ended', active: false }), [], [], TODAY).key,
      'inactive',
    );
  });
  test('ความพร้อมรับงาน = ไม่พร้อมรับงาน (ค่าหลัก) → not_ready', () => {
    assert.equal(
      computeAvailabilityStatus(mkLeader({ status: 'unavailable' }), [], [], TODAY).key,
      'not_ready',
    );
  });
  test('ติดงานบริษัท (company_work active วันนี้)', () => {
    const rec = mkRecord({ type: 'company_work', startDate: '2026-07-10', endDate: '2026-07-20' });
    assert.equal(computeAvailabilityStatus(mkLeader(), [], [rec], TODAY).key, 'company_work');
  });
  test('ลา (sick/personal active วันนี้)', () => {
    const rec = mkRecord({ type: 'sick_leave', startDate: TODAY, endDate: TODAY });
    assert.equal(computeAvailabilityStatus(mkLeader(), [], [rec], TODAY).key, 'leave');
  });
  test('ไม่พร้อมรับงาน (unavailable active วันนี้)', () => {
    const rec = mkRecord({ type: 'unavailable', startDate: TODAY, endDate: TODAY });
    assert.equal(computeAvailabilityStatus(mkLeader(), [], [rec], TODAY).key, 'unavailable');
  });
  test('ติดงาน (มีงานคาบวันนี้)', () => {
    const job = mkJob({ leaderId: 'TL-1', status: 'traveling', departDate: '2026-07-10', returnDate: '2026-07-20' });
    assert.equal(computeAvailabilityStatus(mkLeader(), [job], [], TODAY).key, 'on_job');
  });
  test('พร้อมรับงาน (ไม่มีเงื่อนไข)', () => {
    assert.equal(computeAvailabilityStatus(mkLeader(), [], [], TODAY).key, 'available');
  });
  test('รายการที่ยกเลิก/ปฏิเสธไม่นับ', () => {
    const rec = mkRecord({ type: 'sick_leave', startDate: TODAY, endDate: TODAY, approval: 'cancelled' });
    assert.equal(computeAvailabilityStatus(mkLeader(), [], [rec], TODAY).key, 'available');
  });
});

describe('§1/§5 readinessStatus — พร้อม/ไม่พร้อมรับงาน', () => {
  test('ไม่มีเงื่อนไข → พร้อมรับงาน', () => {
    assert.equal(readinessStatus(mkLeader(), [], [], TODAY).label, 'พร้อมรับงาน');
  });
  test('ช่วงวันลา → ไม่พร้อมรับงาน (เหตุผล: อยู่ในช่วงวันลา)', () => {
    const rec = mkRecord({ type: 'personal_leave', startDate: TODAY, endDate: TODAY });
    const r = readinessStatus(mkLeader(), [], [rec], TODAY);
    assert.equal(r.label, 'ไม่พร้อมรับงาน');
    assert.equal(r.reason, 'อยู่ในช่วงวันลา');
  });
  test('พ้นวันลา → กลับเป็นพร้อมรับงาน', () => {
    const rec = mkRecord({ type: 'personal_leave', startDate: '2026-07-01', endDate: '2026-07-05' });
    assert.equal(readinessStatus(mkLeader(), [], [rec], TODAY).label, 'พร้อมรับงาน');
  });
  test('ระงับการใช้งาน → ไม่พร้อมรับงาน (เหตุผล: ระงับการใช้งาน)', () => {
    const r = readinessStatus(mkLeader({ usageStatus: 'suspended' }), [], [], TODAY);
    assert.equal(r.label, 'ไม่พร้อมรับงาน');
    assert.equal(r.reason, 'ระงับการใช้งาน');
  });
});

describe('§9 formatRecordSchedule — ข้อความวัน–เวลา', () => {
  test('ทั้งวัน (ช่วง) → "14/07/26–16/07/26 · ทั้งวัน"', () => {
    const s = formatRecordSchedule({ isAllDay: true, startDate: '2026-07-14', endDate: '2026-07-16', startTime: '', endTime: '' });
    assert.equal(s, '14/07/26–16/07/26 · ทั้งวัน');
  });
  test('ระบุเวลาวันเดียว → "14/07/26 09:00–12:00" (ไม่มี น.)', () => {
    const s = formatRecordSchedule({ isAllDay: false, startDate: '2026-07-14', endDate: '2026-07-14', startTime: '09:00', endTime: '12:00' });
    assert.equal(s, '14/07/26 09:00–12:00');
  });
  test('ระบุเวลาข้ามวัน → "20/07/26 23:00 ถึง 21/07/26 08:00"', () => {
    const s = formatRecordSchedule({ isAllDay: false, startDate: '2026-07-20', endDate: '2026-07-21', startTime: '23:00', endTime: '08:00' });
    assert.equal(s, '20/07/26 23:00 ถึง 21/07/26 08:00');
  });
});

describe('§6 activeOrUpcomingLeaveCount — Badge แท็บ', () => {
  test('นับเฉพาะรายการที่ยังไม่จบ + ไม่ยกเลิก/ปฏิเสธ', () => {
    const recs = [
      mkRecord({ id: 'A', startDate: '2026-06-01', endDate: '2026-06-05' }), // จบแล้ว
      mkRecord({ id: 'B', startDate: TODAY, endDate: '2026-07-20' }), // กำลังมีผล
      mkRecord({ id: 'C', startDate: '2026-08-01', endDate: '2026-08-03' }), // อนาคต
      mkRecord({ id: 'D', startDate: '2026-08-10', endDate: '2026-08-12', approval: 'cancelled' }), // ยกเลิก
    ];
    assert.equal(activeOrUpcomingLeaveCount(recs, 'TL-1', TODAY), 2); // B + C
  });
});

describe('usageStatus (สถานะการใช้งาน — แยกจากความพร้อมรับงาน)', () => {
  test('ใช้งาน / ระงับการใช้งาน / สิ้นสุดการใช้งาน', () => {
    assert.equal(usageStatus(mkLeader()).label, 'ใช้งาน');
    assert.equal(usageStatus(mkLeader({ usageStatus: 'suspended' })).label, 'ระงับการใช้งาน');
    assert.equal(usageStatus(mkLeader({ usageStatus: 'ended' })).label, 'สิ้นสุดการใช้งาน');
  });

  test('isUsageBlocked: ระงับ/สิ้นสุด = บล็อก · ใช้งาน = ไม่บล็อก (ไม่ขึ้นกับความพร้อมรับงาน)', () => {
    assert.equal(isUsageBlocked(mkLeader()), false);
    assert.equal(isUsageBlocked(mkLeader({ status: 'unavailable' })), false);
    assert.equal(isUsageBlocked(mkLeader({ usageStatus: 'suspended' })), true);
    assert.equal(isUsageBlocked(mkLeader({ usageStatus: 'ended' })), true);
  });
});

describe('isActiveOn / nearestUnavailability', () => {
  test('isActiveOn — วันนี้อยู่ในช่วง', () => {
    assert.equal(isActiveOn(mkRecord({ startDate: '2026-07-10', endDate: '2026-07-15' }), TODAY), true);
    assert.equal(isActiveOn(mkRecord({ startDate: '2026-08-10', endDate: '2026-08-15' }), TODAY), false);
  });
  test('nearestUnavailability — เลือกช่วงที่ยังไม่จบ ใกล้สุด', () => {
    const recs = [
      mkRecord({ id: 'A', startDate: '2026-06-01', endDate: '2026-06-05' }), // จบแล้ว
      mkRecord({ id: 'B', startDate: '2026-08-01', endDate: '2026-08-03' }),
      mkRecord({ id: 'C', startDate: '2026-07-20', endDate: '2026-07-22' }),
    ];
    assert.equal(nearestUnavailability(recs, 'TL-1', TODAY)?.id, 'C');
  });
});

describe('§5/§10 วันลา/ติดงานบริษัท ป้อนเข้า engine ตรวจมอบหมาย', () => {
  test('ลาทั้งวันคาบช่วงเดินทาง → โปรแกรม blocked (เฉพาะที่อนุมัติ + ปิดรับงาน)', () => {
    const rec = mkRecord({ type: 'sick_leave', startDate: '2026-08-05', endDate: '2026-08-13', reason: 'ลาป่วย' });
    const windows = leaderUnavailability('TL-1', [], [], [rec]);
    const prog = mkJob({ id: 'NEW', departDate: '2026-08-06', returnDate: '2026-08-10', meetingDateTime: '2026-08-06T06:00' });
    const r = checkProgramAvailability(prog, windows, { minRestDays: 0 });
    assert.equal(r.verdict, 'blocked');
    assert.equal(r.eventType, 'LEAVE');
  });

  test('§5 ติดงานบริษัท คาบช่วงเดินทาง → blocked + ข้อความเฉพาะ', () => {
    const rec = mkRecord({ type: 'company_work', startDate: '2026-08-05', endDate: '2026-08-13', reason: 'ประชุมบริษัท' });
    const windows = leaderUnavailability('TL-1', [], [], [rec]);
    const prog = mkJob({ id: 'NEW', departDate: '2026-08-06', returnDate: '2026-08-10', meetingDateTime: '2026-08-06T06:00' });
    const r = checkProgramAvailability(prog, windows, { minRestDays: 0 });
    assert.equal(r.verdict, 'blocked');
    assert.equal(r.eventType, 'COMPANY_WORK');
    assert.match(r.reason ?? '', /ติดงานบริษัทในช่วงเวลานี้/);
  });

  test('รายการรออนุมัติ (pending) ยังไม่บล็อก', () => {
    const rec = mkRecord({ type: 'sick_leave', startDate: '2026-08-05', endDate: '2026-08-13', approval: 'pending' });
    const windows = leaderUnavailability('TL-1', [], [], [rec]);
    assert.equal(windows.length, 0);
  });

  test('ไม่ปิดรับงาน (blocksAssignment=false) ไม่บล็อก', () => {
    const rec = mkRecord({ startDate: '2026-08-05', endDate: '2026-08-13', blocksAssignment: false });
    const windows = leaderUnavailability('TL-1', [], [], [rec]);
    assert.equal(windows.length, 0);
  });
});
