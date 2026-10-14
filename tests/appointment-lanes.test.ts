import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySlots, freeSlots, LANE_DURATION, laneOfCountry, slotOptions, slotStep } from '../src/lib/logic/appointmentSlots';
import type { Appointment } from '../src/types';

const apt = (time: string, durationMinutes: number, lane: 'japan' | 'other') =>
  ({ id: `A-${lane}-${time}`, date: '2026-10-19', time, durationMinutes, status: 'confirmed', kind: 'clear', lane } as Appointment);

test('คิวตามประเทศ — ญี่ปุ่น 30 นาที · ประเทศอื่น 10 นาที', () => {
  assert.equal(laneOfCountry('JAPAN'), 'japan');
  assert.equal(laneOfCountry('ญี่ปุ่น'), 'japan');
  assert.equal(laneOfCountry('CHINA'), 'other');
  assert.equal(laneOfCountry(''), 'other');
  assert.deepEqual(LANE_DURATION, { japan: 30, other: 10 });
});

test('ช่องเวลา — ประเทศอื่นช่องละ 10 นาที (09:00–17:50) · ญี่ปุ่นช่องละ 30 นาที', () => {
  assert.equal(slotStep(10), 10);
  assert.equal(slotStep(30), 30);
  assert.equal(slotStep(60), 30);
  const ten = daySlots(10);
  assert.deepEqual(ten.slice(0, 3), ['09:00', '09:10', '09:20']);
  assert.equal(ten[ten.length - 1], '17:50');
  assert.equal(daySlots().length, 16); // เช้า 09:00–11:30 (6) + บ่าย 13:00–17:30 (10)
});

test('ประเทศอื่น — นัด 09:00–09:10 กันเฉพาะช่อง 09:00 · 09:10 ยังว่าง', () => {
  const free = freeSlots([apt('09:00', 10, 'other')], '2026-10-19', 10);
  assert.ok(!free.includes('09:00'));
  assert.equal(free[0], '09:10');
});

test('คนละคิวซ้อนเวลากันได้ — ผู้เรียกส่งเฉพาะนัดคิวเดียวกัน (ญี่ปุ่น 09:00–09:30 ไม่กันประเทศอื่น 09:00)', () => {
  const all = [apt('09:00', 30, 'japan')];
  const otherLane = all.filter((a) => a.lane === 'other');
  assert.ok(freeSlots(otherLane, '2026-10-19', 10).includes('09:00'));
  assert.ok(!freeSlots(all.filter((a) => a.lane === 'japan'), '2026-10-19', 30).includes('09:00'));
});

test('พักเที่ยง 12:00–12:59 — ไม่มีช่องนัด ทั้งคิว 30 และ 10 นาที · นัดยาวที่คร่อมเที่ยงก็ไม่เสนอ', () => {
  for (const step of [30, 10]) {
    const slots = daySlots(step);
    assert.ok(!slots.some((t) => t >= '12:00' && t < '13:00'), `step ${step}`);
    assert.ok(slots.includes('13:00'));
  }
  assert.ok(daySlots(10).includes('11:50'));
  const sixty = slotOptions([], '2026-10-19', 60).map((o) => o.value);
  assert.ok(!sixty.includes('11:30'), '11:30–12:30 คร่อมพักเที่ยง');
  assert.ok(sixty.includes('11:00'));
});

test('เรียกคิวถัดไป — วันเดียวกัน คิวเดียวกัน ยังรอเข้าพบ เรียงตามเวลา · ข้ามคนที่ถูกเรียกไปแล้ว', async () => {
  const { nextInQueue, finishedEarly } = await import('../src/lib/logic/appointmentSlots');
  const laneOf = (a: Appointment) => a.lane ?? 'other';
  const done = apt('09:00', 10, 'other');
  const list = [
    done,
    apt('09:30', 10, 'other'),
    apt('09:10', 10, 'other'),
    apt('09:05', 30, 'japan'),
    { ...apt('09:20', 10, 'other'), status: 'cancelled' } as Appointment,
  ];
  assert.equal(nextInQueue(list, done, laneOf)?.time, '09:10');
  const called = list.map((a) => (a.time === '09:10' ? { ...a, calledEarly: { at: 'x', by: 'y' } } : a));
  assert.equal(nextInQueue(called, done, laneOf)?.time, '09:30');
  assert.equal(nextInQueue([done], done, laneOf), null);
  assert.equal(finishedEarly(done, '2026-10-19T09:06'), true);
  assert.equal(finishedEarly(done, '2026-10-19T09:10'), false);
  assert.equal(finishedEarly(done, '2026-10-20T08:00'), false);
});

test('จำนวนเจ้าหน้าที่ต่อคิว — 2 คน: ช่องเดียวกันรับได้ 2 กรุ๊ป · ครบแล้วเต็ม', async () => {
  const { slotOptions, bookableDays } = await import('../src/lib/logic/appointmentSlots');
  const one = [apt('09:00', 30, 'japan')];
  const two = [apt('09:00', 30, 'japan'), { ...apt('09:00', 30, 'japan'), id: 'A2' }];
  const o1 = slotOptions(one, '2026-10-19', 30, undefined, undefined, 2).find((o) => o.value === '09:00')!;
  assert.equal(o1.busy, false);
  assert.equal(o1.left, 1);
  assert.match(o1.label, /มีนัดแล้ว 1\/2/);
  assert.equal(slotOptions(two, '2026-10-19', 30, undefined, undefined, 2).find((o) => o.value === '09:00')!.busy, true);
  assert.equal(slotOptions(one, '2026-10-19', 30).find((o) => o.value === '09:00')!.busy, true, 'ค่าเดิม 1 คน');
  // วันที่ตั้ง 0 คน = ไม่รับนัด
  const weekday = (iso: string) => { const d = new Date(`${iso}T00:00:00`).getDay(); return d !== 0 && d !== 6; };
  const days = bookableDays([], '2026-10-16', 1, 30, weekday, undefined, (iso) => (iso === '2026-10-19' ? 0 : 2));
  assert.equal(days[0].date, '2026-10-20');
  assert.equal(days[0].capacity, 2);
});

test('เรียกคิวถัดไป — ไม่ชนกันระหว่างเจ้าหน้าที่ · ทีละกรุ๊ปต่อคน', async () => {
  const { waitingQueue, myCurrentJob } = await import('../src/lib/logic/appointmentSlots');
  const laneOf = (a: Appointment) => a.lane ?? 'other';
  const list = [
    apt('09:00', 30, 'japan'),
    { ...apt('09:30', 30, 'japan'), calledEarly: { at: 'x', by: 'สมศรี' } },
    { ...apt('10:00', 30, 'japan'), inProgress: { at: 'x', by: 'สมชาย' } },
    apt('10:30', 30, 'japan'),
    apt('09:10', 10, 'other'),
  ].map((a) => ({ ...a, date: '2026-10-19' }));
  assert.deepEqual(waitingQueue(list, '2026-10-19', ['japan'], laneOf).map((a) => a.time), ['09:00', '10:30']);
  assert.deepEqual(waitingQueue(list, '2026-10-19', ['japan', 'other'], laneOf).map((a) => a.time), ['09:00', '09:10', '10:30']);
  assert.equal(myCurrentJob(list, '2026-10-19', 'สมศรี')?.time, '09:30');
  assert.equal(myCurrentJob(list, '2026-10-19', 'สมชาย')?.time, '10:00');
  assert.equal(myCurrentJob(list, '2026-10-19', 'คนอื่น'), null);
});
