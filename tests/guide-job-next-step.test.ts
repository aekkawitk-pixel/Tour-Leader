import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobNextStep } from '../src/lib/logic/guideJobNextStep';
import type { AfterTripProgress } from '../src/lib/logic/afterTripProgress';

const after = (label: string, href?: string) => ({ steps: [], next: { label, href }, recordHref: '' } as AfterTripProgress);
const run = (p: Partial<Parameters<typeof jobNextStep>[0]>) =>
  jobNextStep({ started: false, ended: false, closed: false, envelopesToAck: 0, afterTrip: null, ...p });

test('ขั้นต่อไป — ปิดเคลียร์แล้วชนะทุกอย่าง', () => {
  assert.deepEqual(run({ closed: true, ended: true, started: true, envelopesToAck: 2 }), { label: 'เคลียร์เงินเรียบร้อย', tone: 'done' });
});

test('ขั้นต่อไป — ซองรอยืนยันรับมาก่อน ทั้งก่อนเดินทางและหลังจบทริป', () => {
  assert.deepEqual(run({ envelopesToAck: 1 }), { label: 'ยืนยันรับซอง', tone: 'action' });
  assert.equal(run({ envelopesToAck: 2, started: true, ended: true, afterTrip: after('เบิกเบี้ยเลี้ยง', '/x') }).label, 'ยืนยันรับซอง 2 ซอง');
});

test('ขั้นต่อไป — ยังไม่ออก = รอเดินทาง · ระหว่างทาง = บันทึกใบเสร็จ', () => {
  assert.deepEqual(run({}), { label: 'รอเดินทาง', tone: 'idle' });
  assert.deepEqual(run({ started: true }), { label: 'บันทึกใบเสร็จระหว่างทาง', tone: 'action' });
});

test('ขั้นต่อไป — จบทริป: มีลิงก์ = ต้องทำ · ไม่มี = รอการเงิน', () => {
  assert.deepEqual(run({ started: true, ended: true, afterTrip: after('เบิกเบี้ยเลี้ยง', '/x') }), { label: 'เบิกเบี้ยเลี้ยง', tone: 'action' });
  assert.deepEqual(run({ started: true, ended: true, afterTrip: after('รอการเงินยืนยันนัด') }), { label: 'รอการเงินยืนยันนัด', tone: 'waiting' });
});
