import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookableDays, daySlots, freeSlots } from '../src/lib/logic/appointmentSlots';
import type { Appointment } from '../src/types';

const apt = (date: string, time: string, durationMinutes = 30, status: Appointment['status'] = 'confirmed') =>
  ({ id: `A-${date}-${time}`, date, time, durationMinutes, status, kind: 'clear' } as Appointment);
// จ.–ศ. เป็นวันทำงาน (ทดสอบไม่พึ่งที่เก็บวันหยุด)
const weekday = (iso: string) => { const d = new Date(`${iso}T00:00:00`).getDay(); return d !== 0 && d !== 6; };

test('ช่องว่าง — ช่องที่ชนนัดอื่นไม่ถูกเสนอ (รวมนัดยาวที่คร่อมหลายช่อง)', () => {
  const free = freeSlots([apt('2026-10-14', '09:00', 60)], '2026-10-14', 30);
  assert.ok(!free.includes('09:00'));
  assert.ok(!free.includes('09:30'));
  assert.equal(free[0], '10:00');
});

test('ช่องว่าง — นัดที่ยกเลิกแล้วไม่กันช่อง', () => {
  assert.ok(freeSlots([apt('2026-10-14', '09:00', 30, 'cancelled')], '2026-10-14', 30).includes('09:00'));
});

test('วันที่นัดได้ — เริ่มพรุ่งนี้ ข้ามเสาร์-อาทิตย์', () => {
  // from = ศ. 16 (ไม่นับวัน from) → ส.17/อา.18 ข้าม → จ.19, อ.20
  const days = bookableDays([], '2026-10-16', 2, 30, weekday);
  assert.deepEqual(days.map((d) => d.date), ['2026-10-19', '2026-10-20']);
});

test('วันที่นัดได้ — วันที่เต็มทั้งวันไม่แสดง', () => {
  const full = daySlots().map((t) => apt('2026-10-19', t));
  const days = bookableDays(full, '2026-10-16', 1, 30, weekday);
  assert.equal(days[0].date, '2026-10-20');
});
