/**
 * §7 ต่อเครื่องวันเดียวกัน — ลงเครื่องกรุ๊ปหนึ่งแล้วขึ้นเครื่องอีกกรุ๊ปในวันเดียวกัน
 *
 * เคสจากผู้ใช้: กรุ๊ปแรกกลับถึง 04/08/26 เวลา 01:00 · กรุ๊ปถัดไปออก 04/08/26 เวลา 22:00
 * ต้อง "จัดได้" แต่ต้องเตือนพร้อมบอกชั่วโมงที่ห่างกัน ให้ผู้จัดพิจารณาเอง
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkPeriodConflict, formatGapHours, sameDayTurnaroundHours } from '../src/lib/logic/guideBoard';
import type { UnavailableWindow } from '../src/lib/logic/leaderAvailability';

/** พีเรียดย่อสำหรับตรวจงานชน */
const ref = (periodId: string, startDate: string, endDate: string, departureTime?: string | null, arrivalTime?: string | null) =>
  ({ periodId, startDate, endDate, departureTime, arrivalTime });

describe('ต่อเครื่องวันเดียวกัน — เคสจริงจากผู้ใช้', () => {
  /* กรุ๊ปที่จัดไว้แล้ว: 01/08 ออก 22:00 → กลับถึง 04/08 เวลา 01:00 */
  const assigned = [ref('P1', '2026-08-01', '2026-08-04', '22:00', '01:00')];
  /* กรุ๊ปใหม่: ออก 04/08 เวลา 22:00 → กลับ 08/08 */
  const candidate = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');

  test('จัดได้ ไม่ใช่ blocked (เดิมชนกันระดับวันจึงห้ามจัด)', () => {
    const r = checkPeriodConflict(candidate, assigned, []);
    assert.equal(r.verdict, 'warn');
    assert.equal(r.sameDayTurnaround, true);
  });

  test('บอกชั่วโมงที่ห่างกันจริง — ลงเครื่อง 01:00 ขึ้นเครื่อง 22:00 = 21 ชม.', () => {
    const r = checkPeriodConflict(candidate, assigned, []);
    assert.equal(r.restHours, 21);
    assert.ok(r.reason?.includes('21 ชม.'), `ข้อความต้องบอกชั่วโมง — ได้ "${r.reason}"`);
    assert.ok(r.reason?.includes('วันเดียวกัน'));
  });

  test('เวลาซ้อนกันจริง (ขึ้นเครื่องก่อนลงเครื่อง) → ยัง blocked เหมือนเดิม', () => {
    const tooEarly = ref('P2', '2026-08-04', '2026-08-08', '00:30', '15:00');
    assert.equal(checkPeriodConflict(tooEarly, assigned, []).verdict, 'blocked');
  });

  test('เวลาห่างน้อยมากก็ยังจัดได้ แต่ต้องเตือนพร้อมตัวเลข — ระบบไม่ตัดสินแทนว่ากี่ชั่วโมงถึงพอ', () => {
    const tight = ref('P2', '2026-08-04', '2026-08-08', '02:30', '15:00');
    const r = checkPeriodConflict(tight, assigned, []);
    assert.equal(r.verdict, 'warn');
    assert.equal(r.restHours, 1.5);
    assert.ok(r.reason?.includes('1 ชม. 30 นาที'));
  });
});

describe('ขอบเขตของกติกา — ต้องไม่ปล่อยกรณีที่ชนจริง', () => {
  test('ทับซ้อนหลายวัน → blocked แม้จะรู้เวลาบิน', () => {
    const assigned = [ref('P1', '2026-08-01', '2026-08-06', '22:00', '01:00')];
    const overlapping = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');
    assert.equal(checkPeriodConflict(overlapping, assigned, []).verdict, 'blocked');
  });

  test('ไม่รู้เวลาบิน (ข้อมูล CSV) → blocked ตามเดิม ไม่เดาว่าห่างพอ', () => {
    const assigned = [ref('P1', '2026-08-01', '2026-08-04')];
    const candidate = ref('P2', '2026-08-04', '2026-08-08');
    assert.equal(checkPeriodConflict(candidate, assigned, []).verdict, 'blocked');
  });

  test('รู้เวลาแค่ฝั่งเดียว → blocked ตามเดิม', () => {
    const assigned = [ref('P1', '2026-08-01', '2026-08-04', '22:00', null)];
    const candidate = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');
    assert.equal(checkPeriodConflict(candidate, assigned, []).verdict, 'blocked');
  });

  test('ทับวันลา → blocked เสมอ ไม่เกี่ยวกับเวลาบิน', () => {
    const leave: UnavailableWindow[] = [{
      id: 'W1', tourLeaderId: 'TL-1', eventType: 'LEAVE', sourceId: 'L1', title: 'ลาพักร้อน',
      start: '2026-08-04', end: '2026-08-05', isAllDay: true, blocksAssignment: true, status: 'active', reason: 'ลาพักร้อน',
    }];
    const candidate = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');
    const r = checkPeriodConflict(candidate, [], leave);
    assert.equal(r.verdict, 'blocked');
    assert.ok(r.reason?.includes('ลาพักร้อน'));
  });

  test('ไม่ชนกันเลย → ok ตามเดิม', () => {
    const assigned = [ref('P1', '2026-08-01', '2026-08-04', '22:00', '01:00')];
    assert.equal(checkPeriodConflict(ref('P2', '2026-08-20', '2026-08-25', '10:00', '20:00'), assigned, []).verdict, 'ok');
  });
});

describe('sameDayTurnaroundHours — ทิศทางและกรณีขอบ', () => {
  test('ตรวจได้ทั้งสองทิศทาง (กรุ๊ปใหม่ต่อท้าย และกรุ๊ปใหม่มาก่อน)', () => {
    const older = ref('P1', '2026-08-01', '2026-08-04', '22:00', '01:00');
    const newer = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');
    assert.equal(sameDayTurnaroundHours(newer, older), 21);
    /* สลับบทบาท: P2 กลับถึง 08/08 15:00 และอีกกรุ๊ปออก 08/08 20:00 */
    const after = ref('P3', '2026-08-08', '2026-08-12', '20:00', '10:00');
    assert.equal(sameDayTurnaroundHours(newer, after), 5);
  });

  test('ห่าง 0 ชั่วโมง (ลงแล้วขึ้นทันที) ยังนับว่าเป็นกรณีต่อเครื่อง ไม่ใช่ชนกัน', () => {
    const older = ref('P1', '2026-08-01', '2026-08-04', '22:00', '10:00');
    const newer = ref('P2', '2026-08-04', '2026-08-08', '10:00', '15:00');
    assert.equal(sameDayTurnaroundHours(newer, older), 0);
  });

  test('เวลาไม่ถูกรูปแบบ → null ไม่เดา', () => {
    const older = ref('P1', '2026-08-01', '2026-08-04', '22:00', '25:99');
    const newer = ref('P2', '2026-08-04', '2026-08-08', '22:00', '15:00');
    assert.equal(sameDayTurnaroundHours(newer, older), null);
  });
});

describe('formatGapHours', () => {
  test('ชั่วโมงเต็ม / มีเศษนาที / น้อยกว่าชั่วโมง', () => {
    assert.equal(formatGapHours(21), '21 ชม.');
    assert.equal(formatGapHours(1.5), '1 ชม. 30 นาที');
    assert.equal(formatGapHours(0.75), '45 นาที');
    assert.equal(formatGapHours(0), '0 นาที');
  });
});

/*
  แถบสรุปด้านล่างของหน้าต่างจัดงาน ต้องอยู่เหนือหัวข้อเส้นทางที่เป็น sticky เหมือนกัน
  z เท่ากันเมื่อไร ตัวที่อยู่หลังใน DOM จะพาดทับ ทำให้หัวข้อเส้นทางไปคาดกลางแถบสรุป
*/
import { readFileSync } from 'node:fs';

test('แถบสรุปกรุ๊ปที่เลือก z สูงกว่าหัวข้อเส้นทาง', () => {
  const SRC = readFileSync(new URL('../src/components/jobs/GuideScheduleTimeline.tsx', import.meta.url), 'utf8');
  const footer = SRC.match(/className="sticky bottom-0[^"]*"/)?.[0] ?? '';
  const header = SRC.match(/className="sticky top-0 z-10 -mx-1[^"]*"/)?.[0] ?? '';
  assert.ok(footer, 'ต้องหาแถบสรุปเจอ');
  assert.ok(header, 'ต้องหาหัวข้อเส้นทางเจอ');
  const zOf = (cls: string) => Number(cls.match(/z-(\d+)/)?.[1] ?? 0);
  assert.ok(zOf(footer) > zOf(header), `แถบสรุป (z-${zOf(footer)}) ต้องสูงกว่าหัวข้อ (z-${zOf(header)})`);
});
