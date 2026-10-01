/**
 * ตารางจัดหัวหน้าทัวร์ (Guide Schedule Timeline) — ตรรกะสถานะการจัด + ตรวจงานชน/เวลาพัก + จัดกลุ่ม
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { boardStatus, groupCodeOf, checkConflict, scheduleDisplay, BOARD_STATUS, BOARD_STATUS_ORDER } from '@/lib/logic/guideBoard';
import { guideGroupsForLeader, GUIDE_GROUPS } from '@/data/guideGroups';
import type { TourJob } from '@/types';

const baseJob = (over: Partial<TourJob>): TourJob => ({
  id: 'JOB-X', title: 't', customer: 'c', country: 'ญี่ปุ่น', cities: [], route: '',
  departDate: '2026-07-10', returnDate: '2026-07-13', meetingDateTime: '2026-07-10T08:00',
  meetingPoint: '', outboundFlight: { flightNo: 'X', route: '', departAt: '2026-07-10T10:00', arriveAt: '2026-07-10T14:00' },
  inboundFlight: { flightNo: 'Y', route: '', departAt: '2026-07-13T18:00', arriveAt: '2026-07-13T20:00' },
  paxCount: 0, leaderId: null, assistantLeaderIds: [], coordinator: '', leaderFee: 0, budget: 0,
  status: 'need_leader', history: [],
  ...over,
} as TourJob);

describe('Guide Timeline — board status (§3)', () => {
  test('5 สถานะครบและ map จาก JobStatus + leaderId', () => {
    assert.equal(boardStatus(baseJob({ leaderId: null, status: 'need_leader' })), 'UNASSIGNED');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'offered' })), 'PENDING_CONFIRMATION');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'accepted' })), 'CONFIRMED');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'traveling' })), 'CONFIRMED');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'closed' })), 'CONFIRMED');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'rejected' })), 'DECLINED');
    assert.equal(boardStatus(baseJob({ leaderId: 'TL-1', status: 'need_leader' })), 'REASSIGN_REQUIRED');
    // สีครบ 5 สถานะ + ลำดับครบ
    for (const s of BOARD_STATUS_ORDER) assert.ok(BOARD_STATUS[s].bar && BOARD_STATUS[s].dot);
    assert.equal(BOARD_STATUS_ORDER.length, 5);
  });

  test('groupCodeOf ใช้ periodCode/programCode ก่อน แล้วค่อย job.id', () => {
    assert.equal(groupCodeOf(baseJob({ id: 'JOB-9' })), 'JOB-9');
    assert.equal(groupCodeOf(baseJob({ id: 'JOB-9', periodCode: 'KIX-260801A-XJ' })), 'KIX-260801A-XJ');
    assert.equal(groupCodeOf(baseJob({ id: 'JOB-9', programCode: 'ZG-1' })), 'ZG-1');
  });

  test('scheduleDisplay — สนามบิน/สายการบินมาจาก Sector 1 (outbound) จริง · ไม่มี → "-"', () => {
    const d = scheduleDisplay(baseJob({
      periodCode: 'KIX-260801CB-XJ', bus: 'B', country: 'JAPAN',
      outboundFlight: { flightNo: 'XJ-611', route: 'BKK – KIX', departAt: '2026-08-01T09:00', arriveAt: '2026-08-01T17:00' },
      inboundFlight: { flightNo: 'TG-999', route: 'NRT – DMK', departAt: '2026-08-05T20:00', arriveAt: '2026-08-06T01:00' },
    }));
    assert.equal(d.groupCode, 'KIX-260801CB-XJ');
    assert.equal(d.bus, 'B');
    assert.equal(d.country, 'JAPAN');
    assert.equal(d.depAirport, 'BKK'); // จาก Sector 1 (ไม่ใช่ NRT ของขากลับ)
    assert.equal(d.airlineCode, 'XJ'); // จาก Sector 1 (ไม่ใช่ TG ของขากลับ)
    // ไม่มีเที่ยวบิน / placeholder → สนามบิน-สายการบิน = "-"
    const none = scheduleDisplay(baseJob({ bus: undefined, outboundFlight: { flightNo: '—', route: '', departAt: '', arriveAt: '' } }));
    assert.equal(none.depAirport, '-');
    assert.equal(none.airlineCode, '-');
    assert.equal(none.bus, '-');
  });
});

describe('Guide Timeline — ตรวจงานชน/เวลาพัก (§7)', () => {
  const win = (over: Partial<Parameters<typeof checkConflict>[1][number]>) => ({
    id: 'W', tourLeaderId: 'TL-1', eventType: 'TOUR_ASSIGNMENT' as const, sourceId: 'JOB-A', title: 'งาน JOB-A',
    start: '2026-07-10', end: '2026-07-10', isAllDay: false, blocksAssignment: true, status: 'active' as const,
    reason: '', startTime: '10:00', endTime: '18:00', ...over,
  });

  test('เวลาทับซ้อนจริง → blocked', () => {
    const r = checkConflict(baseJob({ meetingDateTime: '2026-07-10T08:00' }), [win({})], 0);
    assert.equal(r.verdict, 'blocked');
  });

  test('ไม่ชน แต่พักน้อยกว่า Buffer → warn · พักพอ → ok', () => {
    // งานเริ่ม 11/07 08:00 · ช่วงไม่ว่างจบ 10/07 23:00 → พัก 9 ชม.
    const cand = baseJob({ departDate: '2026-07-11', returnDate: '2026-07-13', meetingDateTime: '2026-07-11T08:00' });
    const w = [win({ start: '2026-07-10', end: '2026-07-10', startTime: '20:00', endTime: '23:00' })];
    assert.equal(checkConflict(cand, w, 12).verdict, 'warn'); // 9 < 12
    assert.equal(checkConflict(cand, w, 6).verdict, 'ok'); // 9 >= 6
    assert.equal(checkConflict(cand, w, 0).verdict, 'ok');
  });
});

describe('Guide Timeline — จัดกลุ่ม Many-to-Many (§10)', () => {
  test('คนหนึ่งอยู่ได้หลายกลุ่ม · agent → AGENCY · ไม่มีเลย → OTHER', () => {
    const g1 = guideGroupsForLeader(['ญี่ปุ่น', 'จีน'], 'general');
    assert.ok(g1.includes('JAPAN') && g1.includes('CHINA'));
    assert.ok(guideGroupsForLeader(['เกาหลีใต้'], 'general').includes('ASIA'));
    assert.ok(guideGroupsForLeader([], 'agent').includes('AGENCY'));
    assert.deepEqual(guideGroupsForLeader([], 'general'), ['OTHER']);
    // ทุก group id ที่คืนต้องรู้จักใน GUIDE_GROUPS
    const known = new Set(GUIDE_GROUPS.map((g) => g.id));
    for (const id of guideGroupsForLeader(['ญี่ปุ่น', 'ยุโรป'], 'agent')) assert.ok(known.has(id));
  });
});
