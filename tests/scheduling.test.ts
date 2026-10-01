/**
 * เทสต์ตรรกะการจัดสเก็ต — ความพร้อมข้อมูล + สถานะการจัดสเก็ต
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { scheduleReadiness, scheduleStatus, isSchedulable } from '@/lib/logic/scheduling';
import type { TourJob } from '@/types';

/** ทัวร์ข้อมูลครบ (พร้อมจัดสเก็ต) — override เฉพาะที่ต้องการ */
const mkJob = (over: Partial<TourJob> = {}): TourJob => ({
  id: 'JOB-1',
  title: 'ทัวร์ทดสอบ',
  customer: 'ลูกค้า',
  country: 'ญี่ปุ่น',
  cities: [],
  route: 'BKK – NRT – BKK',
  departDate: '2026-08-01',
  returnDate: '2026-08-05',
  meetingDateTime: '2026-08-01T06:00',
  meetingPoint: 'สนามบิน',
  outboundFlight: { flightNo: 'TG-660', route: 'BKK – HND', departAt: '', arriveAt: '' },
  inboundFlight: { flightNo: 'TG-623', route: 'KIX – BKK', departAt: '', arriveAt: '' },
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

describe('scheduleReadiness — ความพร้อมข้อมูลทัวร์ (§5)', () => {
  test('ข้อมูลครบ → พร้อม', () => {
    const r = scheduleReadiness(mkJob());
    assert.equal(r.ready, true);
    assert.deepEqual(r.reasons, []);
  });

  test('ไม่มีวันเดินทาง → "ยังไม่มีวันเดินทาง"', () => {
    const r = scheduleReadiness(mkJob({ departDate: '', returnDate: '' }));
    assert.equal(r.ready, false);
    assert.ok(r.reasons.includes('ยังไม่มีวันเดินทาง'));
  });

  test('เวลานัดหมายเป็น 00:00 → "ยังไม่มีเวลาเดินทาง"', () => {
    const r = scheduleReadiness(mkJob({ meetingDateTime: '2026-08-01T00:00' }));
    assert.equal(r.ready, false);
    assert.ok(r.reasons.includes('ยังไม่มีเวลาเดินทาง'));
  });

  test('เที่ยวบินขาไปเป็น "—" → "ข้อมูลเที่ยวบินไม่ครบ"', () => {
    const r = scheduleReadiness(
      mkJob({ outboundFlight: { flightNo: '—', route: '—', departAt: '', arriveAt: '' } }),
    );
    assert.equal(r.ready, false);
    assert.ok(r.reasons.includes('ข้อมูลเที่ยวบินไม่ครบ'));
  });

  test('ขาดหลายอย่าง → รายงานหลายสาเหตุ', () => {
    const r = scheduleReadiness(
      mkJob({
        departDate: '',
        returnDate: '',
        inboundFlight: { flightNo: '', route: '', departAt: '', arriveAt: '' },
      }),
    );
    assert.equal(r.reasons.length >= 2, true);
  });
});

describe('scheduleStatus / isSchedulable', () => {
  test('ข้อมูลไม่ครบ → not_ready (และ isSchedulable=false)', () => {
    const job = mkJob({ departDate: '', returnDate: '' });
    assert.equal(scheduleStatus(job), 'not_ready');
    assert.equal(isSchedulable(job), false);
  });

  test('ข้อมูลครบ + ยังไม่มีหัวหน้าทัวร์ → unassigned', () => {
    assert.equal(scheduleStatus(mkJob({ leaderId: null })), 'unassigned');
    assert.equal(isSchedulable(mkJob({ leaderId: null })), true);
  });

  test('ข้อมูลครบ + มีหัวหน้าทัวร์ → assigned', () => {
    assert.equal(scheduleStatus(mkJob({ leaderId: 'TL-001' })), 'assigned');
  });
});
