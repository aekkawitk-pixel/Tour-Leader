/**
 * เทสต์ปฏิทินช่วงไม่ว่าง + การตรวจความว่างตาม "วันและเวลาจริง"
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkProgramAvailability,
  leaderUnavailability,
  programBusyWindow,
  type UnavailableWindow,
} from '@/lib/logic/leaderAvailability';
import type { Appointment, TourJob } from '@/types';

/** โปรแกรม — เติมวัน–เวลาให้สอดคล้องกับวันเดินทางที่ override เสมอ */
const mkJob = (over: Partial<TourJob>): TourJob => {
  const departDate = over.departDate ?? '2026-08-01';
  const returnDate = over.returnDate ?? '2026-08-05';
  return {
    id: 'JOB-X',
    title: 'โปรแกรมทดสอบ',
    customer: 'ลูกค้า',
    country: 'ญี่ปุ่น',
    cities: [],
    route: 'เส้นทาง',
    meetingPoint: 'สนามบิน',
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
    departDate,
    returnDate,
    meetingDateTime: over.meetingDateTime ?? `${departDate}T06:00`,
    outboundFlight: over.outboundFlight ?? {
      flightNo: 'TG-1',
      route: 'BKK – X',
      departAt: `${departDate}T08:00`,
      arriveAt: `${departDate}T12:00`,
    },
    inboundFlight: over.inboundFlight ?? {
      flightNo: 'TG-2',
      route: 'X – BKK',
      departAt: `${returnDate}T18:00`,
      arriveAt: `${returnDate}T20:00`,
    },
  };
};

/** โปรแกรมวันเดียว 20/07/2569 ระบุเวลาเริ่ม–สิ้นสุด */
const timedProgram = (startTime: string, endTime: string): TourJob =>
  mkJob({
    id: 'NEW',
    departDate: '2026-07-20',
    returnDate: '2026-07-20',
    meetingDateTime: `2026-07-20T${startTime}`,
    inboundFlight: { flightNo: 'X', route: 'X', departAt: '', arriveAt: `2026-07-20T${endTime}` },
  });

const leaveWindow = (startTime: string, endTime: string, allDay = false): UnavailableWindow => ({
  id: 'AV-LV',
  tourLeaderId: 'TL-1',
  eventType: 'LEAVE',
  sourceId: 'LV-1',
  title: 'ลากิจ',
  start: '2026-07-20',
  end: '2026-07-20',
  isAllDay: allDay,
  blocksAssignment: true,
  status: 'active',
  reason: '',
  startTime,
  endTime,
});

const tourWindow = (start: string, end: string, sourceId = 'JOB-OLD'): UnavailableWindow => ({
  id: `AV-JOB-${sourceId}`,
  tourLeaderId: 'TL-1',
  eventType: 'TOUR_ASSIGNMENT',
  sourceId,
  title: 'งานเดิม',
  start,
  end,
  isAllDay: true,
  blocksAssignment: true,
  status: 'active',
  reason: 'มีโปรแกรมทัวร์ทับซ้อน',
});

const NO_REST = { minRestDays: 0 };

describe('§3 programBusyWindow — ใช้เวลานัดหมาย/รายงานตัวก่อน', () => {
  test('ใช้ meetingDateTime เป็นเวลาเริ่ม และ inbound arrive เป็นเวลาสิ้นสุด', () => {
    const w = programBusyWindow(
      mkJob({ departDate: '2026-08-01', returnDate: '2026-08-05', meetingDateTime: '2026-08-01T05:30' }),
    );
    assert.equal(w.startAt, '2026-08-01T05:30');
    assert.equal(w.endAt, '2026-08-05T20:00');
    assert.equal(w.hasStartTime, true);
  });
});

describe('§4 ตรวจเวลาทับซ้อน — ลากิจ 20/07 08:00–12:00', () => {
  const windows = [leaveWindow('08:00', '12:00')];
  const V = (s: string, e: string) => checkProgramAvailability(timedProgram(s, e), windows, NO_REST).verdict;

  test('09:00–11:00 ทับ → blocked', () => assert.equal(V('09:00', '11:00'), 'blocked'));
  test('11:00–15:00 ทับ 1 ชม. → blocked', () => assert.equal(V('11:00', '15:00'), 'blocked'));
  test('12:00–18:00 เริ่มพอดีเวลาลาเลิก → เลือกได้ (warn วันเดียวกัน)', () =>
    assert.equal(V('12:00', '18:00'), 'warn'));
  test('23:00 คนละเวลา → เลือกได้ (warn วันเดียวกัน)', () => assert.equal(V('23:00', '23:30'), 'warn'));
  test('วันถัดไป 21/07 → ok', () =>
    assert.equal(checkProgramAvailability(mkJob({ id: 'N', departDate: '2026-07-21', returnDate: '2026-07-21' }), windows, NO_REST).verdict, 'ok'));

  test('warn วันเดียวกันแนบระยะห่างเป็นชั่วโมง (23:00 ห่าง 11 ชม.)', () => {
    const r = checkProgramAvailability(timedProgram('23:00', '23:30'), windows, NO_REST);
    assert.equal(r.needsConfirm, true);
    assert.match(r.detail ?? '', /ห่าง 11 ชั่วโมง/);
    assert.match(r.reason ?? '', /วันเดียวกับวันลา/);
  });
});

describe('§13 เคสขอบเขตเวลา', () => {
  const windows = [leaveWindow('08:00', '12:00')];
  test('เริ่มตรงเวลาสิ้นสุดการลา (12:00) → ไม่ทับ (warn)', () =>
    assert.equal(checkProgramAvailability(timedProgram('12:00', '16:00'), windows, NO_REST).verdict, 'warn'));
  test('เริ่มก่อนเวลาสิ้นสุดการลา 1 นาที (11:59) → ทับ (blocked)', () =>
    assert.equal(checkProgramAvailability(timedProgram('11:59', '16:00'), windows, NO_REST).verdict, 'blocked'));
  test('วันลาแบบทั้งวัน → โปรแกรมเวลาใดก็ blocked', () =>
    assert.equal(checkProgramAvailability(timedProgram('23:00', '23:30'), [leaveWindow('00:00', '23:59', true)], NO_REST).verdict, 'blocked'));
});

describe('§2/§8 งานทัวร์ (ทับตามวัน) + ระยะพัก', () => {
  const windows = [tourWindow('2026-08-10', '2026-08-15')];
  const V = (d: string, r: string, opt = NO_REST) =>
    checkProgramAvailability(mkJob({ id: 'N', departDate: d, returnDate: r }), windows, opt).verdict;

  test('8–9 ก่อนงาน → ok', () => assert.equal(V('2026-08-08', '2026-08-09'), 'ok'));
  test('8–10 คาบวันแรก → blocked', () => assert.equal(V('2026-08-08', '2026-08-10'), 'blocked'));
  test('15–18 คาบวันสุดท้าย → blocked', () => assert.equal(V('2026-08-15', '2026-08-18'), 'blocked'));
  test('16–20 หลังงาน + ไม่ต้องพัก → ok', () => assert.equal(V('2026-08-16', '2026-08-20'), 'ok'));
  test('16 (พัก 0) + ต้องพัก 1 วัน → warn (พักไม่พอ)', () =>
    assert.equal(V('2026-08-16', '2026-08-18', { minRestDays: 1 }), 'warn'));
  test('17 (พัก 1) + ต้องพัก 1 วัน → ok', () =>
    assert.equal(V('2026-08-17', '2026-08-19', { minRestDays: 1 }), 'ok'));

  test('blocked แนบรหัสงานที่ทับ (Link ดูโปรแกรมที่ทับซ้อน)', () => {
    const r = checkProgramAvailability(mkJob({ id: 'N', departDate: '2026-08-12', returnDate: '2026-08-14' }), windows, NO_REST);
    assert.equal(r.conflictJobId, 'JOB-OLD');
    assert.match(r.detail ?? '', /JOB-OLD/);
  });
});

describe('§7 โปรแกรมไม่มีเวลาเริ่มงาน', () => {
  test('ไม่มี meetingDateTime/flight → warn "ต้องตรวจสอบเวลา" (ยังเลือกได้)', () => {
    const job = mkJob({
      id: 'N',
      departDate: '2026-09-01',
      returnDate: '2026-09-03',
      meetingDateTime: '',
      outboundFlight: { flightNo: '', route: '', departAt: '', arriveAt: '' },
      inboundFlight: { flightNo: '', route: '', departAt: '', arriveAt: '' },
    });
    const r = checkProgramAvailability(job, [], NO_REST);
    assert.equal(r.verdict, 'warn');
    assert.equal(r.needsConfirm, true);
    assert.match(r.reason ?? '', /ยังไม่ระบุเวลาเริ่มงาน/);
  });
});

describe('leaderUnavailability — สร้างปฏิทินจากแหล่งกลาง', () => {
  const mkAppt = (over: Partial<Appointment>): Appointment => ({
    id: 'APT-1',
    date: '2026-08-20',
    time: '09:00',
    durationMinutes: 180,
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
  const jobs = [
    mkJob({ id: 'ACCEPTED', leaderId: 'TL-1', status: 'accepted', departDate: '2026-08-10', returnDate: '2026-08-15' }),
    mkJob({ id: 'REJECTED', leaderId: 'TL-1', status: 'rejected', departDate: '2026-10-01', returnDate: '2026-10-05' }),
    mkJob({ id: 'OTHER', leaderId: 'TL-2', status: 'accepted', departDate: '2026-08-10', returnDate: '2026-08-15' }),
  ];
  const appts = [
    mkAppt({ id: 'A-OK', status: 'confirmed' }),
    mkAppt({ id: 'A-CANCELLED', status: 'cancelled' }),
    mkAppt({ id: 'A-NOBLOCK', status: 'confirmed', blocksAssignment: false }),
  ];

  test('เอาเฉพาะงานจองตัวของคนนั้น + นัดหมายที่ยังไม่ยกเลิก/ปิดช่วงรับงาน', () => {
    const w = leaderUnavailability('TL-1', jobs, appts);
    assert.deepEqual(w.filter((x) => x.eventType === 'TOUR_ASSIGNMENT').map((x) => x.sourceId), ['ACCEPTED']);
    assert.deepEqual(w.filter((x) => x.eventType === 'APPOINTMENT').map((x) => x.sourceId), ['A-OK']);
  });

  test('นัดหมายวันเดียวกับ "วันรายงานตัว" ของโปรแกรม แต่คนละเวลา → warn (ไม่ block)', () => {
    // นัดหมาย 20/08 09:00–12:00; โปรแกรมรายงานตัว 20/08 20:00
    const w = leaderUnavailability('TL-1', [], appts);
    const prog = mkJob({ id: 'N', departDate: '2026-08-20', returnDate: '2026-08-22', meetingDateTime: '2026-08-20T20:00' });
    const r = checkProgramAvailability(prog, w, NO_REST);
    assert.equal(r.verdict, 'warn');
    assert.equal(r.eventType, 'APPOINTMENT');
  });

  test('นัดหมายอยู่กลางช่วงเดินทาง (คนละเวลาก็ตาม) → blocked', () => {
    const w = leaderUnavailability('TL-1', [], appts); // นัดหมาย 20/08
    const prog = mkJob({ id: 'N', departDate: '2026-08-19', returnDate: '2026-08-21', meetingDateTime: '2026-08-19T06:00' });
    const r = checkProgramAvailability(prog, w, NO_REST);
    assert.equal(r.verdict, 'blocked');
  });
});
