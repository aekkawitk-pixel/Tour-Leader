/**
 * Auto Assignment ของตารางเจ้าหน้าที่ส่งกรุ๊ป — เกณฑ์จากผู้ใช้:
 *   • กระจายงานให้เจ้าหน้าที่ทุกคนได้จำนวนงานใกล้เคียงกันที่สุด — คำนวณจากวันก่อนเสมอ (วันเดียวกันต้องกระจายคนละคน)
 *     แล้วค่อยไล่ขึ้นสัปดาห์เป็นตัวตัดสินรอง ส่วนเดือนเป็นแค่มุมมองสรุป ไม่ใช่ตัวตัดสิน
 *   • ผลลัพธ์เป็น "ร่างเบื้องต้น" เท่านั้น — ห้ามละเมิดเงื่อนไขที่จัดไม่ได้จริง (เวลางานประจำ/วันลา/งานชนกัน)
 *   • สิทธิ์แก้ตารางนี้ผูกกับตัวบุคคล (Schedule Administrator คนเดียว) ไม่ใช่ตามบทบาท
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  planAutoAssignSendOff, summarizeAutoAssign,
  type AutoAssignJobInput, type AutoAssignStaffInput,
} from '@/lib/logic/sendOffAutoAssign';
import { DEFAULT_SEND_OFF_RULES } from '@/lib/logic/sendOffRules';
import { canEditSendOffSchedule, SEND_OFF_SCHEDULE_ADMIN_USER_IDS } from '@/lib/permissions';
import { demoUsers } from '@/data/users';

const RULES = DEFAULT_SEND_OFF_RULES;

const job = (over: Partial<AutoAssignJobInput> & { periodId: string; flightTime: string }): AutoAssignJobInput => ({
  dutyDate: '2026-11-10',
  isDayOff: false,
  slot: {
    groupCode: over.periodId,
    airport: 'BKK',
    flightMin: 10 * 1440 + hm(over.flightTime),
    checkInMin: 10 * 1440 + hm(over.flightTime) - RULES.leadHours * 60,
  },
  ...over,
});

function hm(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * วันที่ 1 พ.ย. 2026 + n วัน (ISO yyyy-mm-dd) — ห้ามใช้ `new Date(...).toISOString()` แทน
 * เพราะ toISOString() แปลงเป็น UTC ก่อนตัด ในโซนเวลาที่เร็วกว่า UTC (เช่น Asia/Bangkok, +7)
 * เที่ยงคืนตามเวลาท้องถิ่นจะกลายเป็นเย็นวันก่อนหน้าใน UTC ทำให้วันที่เพี้ยนถอยหลังไป 1 วันทั้งชุด
 */
function novDate(n: number): string {
  const d = new Date(2026, 10, 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const staffMember = (over: Partial<AutoAssignStaffInput> & { id: string }): AutoAssignStaffInput => ({
  staffType: 'permanent',
  status: 'active',
  existingJobs: [],
  leaveDates: new Set<string>(),
  confirmedThisMonth: 0,
  ...over,
});

describe('planAutoAssignSendOff — กระจายงานให้เท่ากันที่สุด', () => {
  test('งานเท่าจำนวนคนพอดี ทุกคนได้คนละ 1 งาน', () => {
    const jobs = [
      job({ periodId: 'P1', flightTime: '08:00' }),
      job({ periodId: 'P2', flightTime: '14:00' }),
      job({ periodId: 'P3', flightTime: '20:00' }),
    ];
    const staffList = [staffMember({ id: 'S1' }), staffMember({ id: 'S2' }), staffMember({ id: 'S3' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 3);
    assert.equal(result.unassignedPeriodIds.length, 0);
    const counts = new Map<string, number>();
    for (const p of result.plan) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);
    for (const s of staffList) assert.equal(counts.get(s.id), 1, `${s.id} ต้องได้ 1 งาน`);
  });

  test('งานมากกว่าคน กระจายให้ผลต่างกันไม่เกิน 1 งาน', () => {
    // แต่ละงานห่างกันคนละวันเต็ม ๆ (24 ชม.) — ไม่มีทางชนเกณฑ์ห่างขั้นต่ำ เพื่อให้เทสต์นี้ดูแค่การกระจายภาระ ไม่ปนเรื่องงานชน
    const jobs: AutoAssignJobInput[] = Array.from({ length: 10 }, (_, i) => ({
      periodId: `P${i}`,
      dutyDate: '2026-11-10',
      flightTime: '08:00',
      isDayOff: false,
      slot: { groupCode: `P${i}`, airport: 'BKK', flightMin: i * 1440 + 480, checkInMin: i * 1440 + 480 - RULES.leadHours * 60 },
    }));
    const staffList = [staffMember({ id: 'S1' }), staffMember({ id: 'S2' }), staffMember({ id: 'S3' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 10);
    const counts = new Map<string, number>();
    for (const p of result.plan) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);
    const values = staffList.map((s) => counts.get(s.id) ?? 0);
    assert.ok(Math.max(...values) - Math.min(...values) <= 1, `กระจายไม่เท่ากัน: ${values.join(',')}`);
  });

  test('นับภาระเดิมที่มีอยู่แล้วก่อนรัน — คนที่มีงานเยอะกว่าไม่ควรถูกยัดเพิ่มจนเกินคนว่างกว่า', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '08:00' }), job({ periodId: 'P2', flightTime: '14:00' })];
    const staffList = [
      staffMember({
        id: 'BUSY',
        existingJobs: [
          { dutyDate: '2026-11-10', slot: { groupCode: 'OLD1', airport: 'BKK', flightMin: 0, checkInMin: -1000 } },
          { dutyDate: '2026-11-10', slot: { groupCode: 'OLD2', airport: 'BKK', flightMin: 100000, checkInMin: 99000 } },
        ],
      }),
      staffMember({ id: 'FREE' }),
    ];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    const toFree = result.plan.filter((p) => p.staffId === 'FREE').length;
    const toBusy = result.plan.filter((p) => p.staffId === 'BUSY').length;
    assert.equal(toFree, 2, 'คนว่างกว่าต้องได้งานใหม่ทั้งคู่ก่อน เพราะคนยุ่งเริ่มด้วยภาระ 2 งานอยู่แล้ว');
    assert.equal(toBusy, 0);
  });

  test('ประเภทพนักงานติดเวลางานประจำ — งานช่วงกลางวันไปตกกับประเภทประจำแทน', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '13:00' })]; // เครื่องออก 13:00 อยู่ในเวลางาน 09:00-18:00 (ช่วงเวลานัด-เวลาบินทับซ้อนกับเวลางาน)
    const staffList = [staffMember({ id: 'EMP', staffType: 'employee' }), staffMember({ id: 'PERM', staffType: 'permanent' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 1);
    assert.equal(result.plan[0].staffId, 'PERM');
  });

  test('ประเภทพนักงานทั้งหมด และเวลาชนงานประจำ — จัดอัตโนมัติไม่ได้ ต้องตกไปอยู่ unassigned', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '13:00' })];
    const staffList = [staffMember({ id: 'EMP', staffType: 'employee' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 0);
    assert.deepEqual(result.unassignedPeriodIds, ['P1']);
  });

  test('คนลาวันนั้น ไม่ถูกจัดงานวันที่ลา', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '08:00', dutyDate: '2026-11-10' })];
    const staffList = [
      staffMember({ id: 'ONLEAVE', leaveDates: new Set(['2026-11-10']) }),
      staffMember({ id: 'OK' }),
    ];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 1);
    assert.equal(result.plan[0].staffId, 'OK');
  });

  test('ทุกคนลาวันนั้นหมด — จัดไม่ได้ ไม่ยัดให้คนลา', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '08:00', dutyDate: '2026-11-10' })];
    const staffList = [staffMember({ id: 'ONLEAVE', leaveDates: new Set(['2026-11-10']) })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.deepEqual(result.unassignedPeriodIds, ['P1']);
  });

  test('งานสองกรุ๊ปชนกันตามเกณฑ์ห่างขั้นต่ำ — ไม่จัดให้คนเดียวกัน ถ้ามีคนอื่นว่าง', () => {
    // สนามบินเดียวกัน เช็คอินห่างกันแค่ 1 ชม. (เกณฑ์ต้องเกิน 3 ชม.)
    const jobs = [
      job({ periodId: 'P1', flightTime: '08:00' }),
      job({ periodId: 'P2', flightTime: '09:00' }),
    ];
    const staffList = [staffMember({ id: 'S1' }), staffMember({ id: 'S2' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 2);
    const ids = new Set(result.plan.map((p) => p.staffId));
    assert.equal(ids.size, 2, 'สองงานที่ชนกันต้องกระจายไปคนละคน');
  });

  test('งานชนกันสนามบินเดียวกันและมีคนเดียวในระบบ — ยอมจัดทับซ้อนแทนปล่อยค้าง (ทำเครื่องหมาย overlapping ไว้)', () => {
    const jobs = [
      job({ periodId: 'P1', flightTime: '08:00' }),
      job({ periodId: 'P2', flightTime: '09:00' }),
    ];
    const staffList = [staffMember({ id: 'ONLY' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 2, 'ไม่มีใครว่างกว่านี้แล้ว — ยอมทับซ้อนดีกว่าปล่อยค้าง');
    assert.deepEqual(result.unassignedPeriodIds, []);
    assert.equal(result.plan[0].overlapping, false, 'งานแรกของคนนี้ยังไม่ชนอะไร');
    assert.equal(result.plan[1].overlapping, true, 'งานที่สองทับซ้อนกับงานแรก ต้องทำเครื่องหมายไว้');
  });

  test('งานชนกันข้ามสนามบิน (ห่างไม่ถึงเกณฑ์) — จัดไม่ได้จริง ต่อให้เป็นคนเดียวที่มีในระบบก็ต้องปล่อยค้าง', () => {
    // สนามบินคนละที่ ต้องห่างกันเกิน crossAirportGapHours (ค่าเริ่มต้น 6 ชม.) — ที่นี่ห่างกันแค่ 1 ชม. (เครื่องออก 08:00 vs 09:00)
    const jobs: AutoAssignJobInput[] = [
      { periodId: 'P1', dutyDate: '2026-11-10', flightTime: '08:00', isDayOff: false, slot: { groupCode: 'P1', airport: 'DMK', flightMin: 10 * 1440 + 480, checkInMin: 10 * 1440 + 480 - RULES.leadHours * 60 } },
      { periodId: 'P2', dutyDate: '2026-11-10', flightTime: '09:00', isDayOff: false, slot: { groupCode: 'P2', airport: 'CNX', flightMin: 10 * 1440 + 540, checkInMin: 10 * 1440 + 540 - RULES.leadHours * 60 } },
    ];
    const staffList = [staffMember({ id: 'ONLY' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 1, 'จัดได้แค่งานแรก');
    assert.equal(result.plan[0].periodId, 'P1');
    assert.deepEqual(result.unassignedPeriodIds, ['P2'], 'งานที่สองชนข้ามสนามบิน จัดไม่ได้จริง ไม่ใช่แค่ทับซ้อน');
  });

  test('มีคนอื่นว่างจริง ๆ (ไม่ชนใคร) ต้องเลือกคนนั้นก่อนเสมอ ไม่ยอมทับซ้อนทั้งที่มีทางเลี่ยง', () => {
    const jobs = [
      job({ periodId: 'P1', flightTime: '08:00' }),
      job({ periodId: 'P2', flightTime: '09:00' }), // ชนกับ P1 ถ้าคนเดียวกัน (สนามบินเดียวกัน ห่างแค่ 1 ชม.)
    ];
    const staffList = [staffMember({ id: 'S1' }), staffMember({ id: 'S2' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 2);
    assert.ok(result.plan.every((p) => !p.overlapping), 'มีคนว่างพอ ไม่ควรมีใครถูกจัดแบบทับซ้อนเลย');
    const ids = new Set(result.plan.map((p) => p.staffId));
    assert.equal(ids.size, 2, 'สองงานที่ชนกันต้องกระจายไปคนละคน');
  });

  test('เกณฑ์ทับซ้อนสนามบินเดียวกันเริ่มต้นคือ 2 ชม. (ไม่ใช่ 3 ชม.เดิม)', () => {
    assert.equal(RULES.sameAirportGapHours, 2);
  });

  test('บาลานซ์ภาระต่อสัปดาห์ ไม่ใช่แค่รวมทั้งเดือน — คนที่มีงานเยอะในสัปดาห์ก่อนไม่ควรถูกงดในสัปดาห์ถัดไปที่ตัวเองว่าง', () => {
    // S1 มีงานเดิม 3 กรุ๊ปในสัปดาห์แรก ส่วน S2 ว่าง — วันที่สัปดาห์ใหม่ห่างจากสัปดาห์แรก 7 วันเต็ม จึงตกคนละสัปดาห์แน่นอน
    const week1Existing = Array.from({ length: 3 }, (_, i) => ({
      dutyDate: '2026-11-01',
      slot: { groupCode: `OLD${i}`, airport: 'BKK', flightMin: i * 1440 + 480, checkInMin: i * 1440 + 480 - RULES.leadHours * 60 },
    }));
    const staffList = [
      staffMember({ id: 'S1', existingJobs: week1Existing }),
      staffMember({ id: 'S2' }),
    ];
    // งานใหม่ทั้งหมดอยู่สัปดาห์ถัดไป (2026-11-08 ห่างจาก 2026-11-01 ครบ 7 วัน) — เวลาบินก็ห่างกันคนละวันเต็ม ๆ กันชนกันเอง
    const jobs: AutoAssignJobInput[] = Array.from({ length: 4 }, (_, i) => ({
      periodId: `NEW${i}`,
      dutyDate: '2026-11-08',
      flightTime: '08:00',
      isDayOff: false,
      slot: { groupCode: `NEW${i}`, airport: 'BKK', flightMin: (i + 20) * 1440 + 480, checkInMin: (i + 20) * 1440 + 480 - RULES.leadHours * 60 },
    }));
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    const counts = new Map<string, number>();
    for (const p of result.plan) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);
    // ถ้าบาลานซ์แบบรวมทั้งเดือน S1 (3 งานเดิม) จะถูกงดตลอด ได้ 0 งานใหม่ทั้งที่สัปดาห์ใหม่ตัวเองว่างพอ ๆ กับ S2
    // บาลานซ์รายสัปดาห์ต้องแบ่งงานสัปดาห์ใหม่ให้ทั้งคู่ใกล้เคียงกัน (2 ต่อ 2)
    assert.equal(counts.get('S1'), 2, 'สัปดาห์ใหม่ S1 ว่างเท่า S2 ต้องได้ส่วนแบ่งด้วย ไม่ใช่โดนงดเพราะภาระเดือนก่อนสูงกว่า');
    assert.equal(counts.get('S2'), 2);
  });

  test('เกลี่ยงานในวันเดียวกันก่อนเสมอ แม้อีกคนจะภาระสัปดาห์เยอะกว่ามากก็ตาม — ไม่ปล่อยให้คนว่างกว่าได้ทั้งวันไปคนเดียว', () => {
    // S1 มีงานเดิม 5 กรุ๊ปแล้วในสัปดาห์นี้ (วันอื่น) ส่วน S2 ว่างทั้งสัปดาห์ — ถ้าเกลี่ยแค่รายสัปดาห์ S2 จะได้ทั้ง 2 กรุ๊ปใหม่คนเดียว
    const week1Existing = Array.from({ length: 5 }, (_, i) => ({
      dutyDate: '2026-11-02', // จันทร์ สัปดาห์เดียวกับ 2026-11-03 (Sun 1 พ.ย. – Sat 7 พ.ย.)
      slot: { groupCode: `OLD${i}`, airport: 'BKK', flightMin: i * 1440 + 480, checkInMin: i * 1440 + 480 - RULES.leadHours * 60 },
    }));
    const staffList = [
      staffMember({ id: 'S1', existingJobs: week1Existing }),
      staffMember({ id: 'S2' }),
    ];
    // งานใหม่ 2 กรุ๊ป วันเดียวกัน (2026-11-03) พอดีจำนวนคน — หลักการ "คำนวณจากวันก่อน" ต้องกระจายให้คนละคน
    // แม้ S1 จะภาระสัปดาห์เยอะกว่า S2 อยู่มากก็ตาม (ไม่ใช่หยิบคนภาระสัปดาห์น้อยสุดไปเลยจนได้ทั้งสองกรุ๊ปในวันเดียว)
    const jobs: AutoAssignJobInput[] = Array.from({ length: 2 }, (_, i) => ({
      periodId: `NEW${i}`,
      dutyDate: '2026-11-03',
      flightTime: '08:00',
      isDayOff: false,
      slot: { groupCode: `NEW${i}`, airport: 'BKK', flightMin: (i + 10) * 1440 + 480, checkInMin: (i + 10) * 1440 + 480 - RULES.leadHours * 60 },
    }));
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    const staffIds = result.plan.map((p) => p.staffId).sort();
    assert.deepEqual(staffIds, ['S1', 'S2'], 'วันเดียวกันต้องกระจายให้คนละคน ไม่ปล่อยให้คนว่างกว่าได้ทั้งสองกรุ๊ปในวันเดียว');
  });

  test('เพดานกรุ๊ปต่อเดือน — ครบแล้วจัดอัตโนมัติให้เพิ่มไม่ได้อีก แม้จะยังภาระน้อยกว่าคนอื่น', () => {
    // S1 ตั้งเพดานไว้ 2 กรุ๊ป/เดือน ส่วน S2 ไม่จำกัด — มี 5 กรุ๊ปคนละวัน ไม่ชนกันเอง (สัปดาห์เดียวกันทั้งหมด)
    const jobs: AutoAssignJobInput[] = Array.from({ length: 5 }, (_, i) => {
      const iso = novDate(i);
      return {
        periodId: `P${i}`,
        dutyDate: iso,
        flightTime: '08:00',
        isDayOff: false,
        slot: { groupCode: `P${i}`, airport: 'BKK', flightMin: i * 1440 + 480, checkInMin: i * 1440 + 480 - RULES.leadHours * 60 },
      };
    });
    const staffList = [
      staffMember({ id: 'S1', maxGroupsPerMonth: 2 }),
      staffMember({ id: 'S2' }),
    ];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.unassignedPeriodIds.length, 0);
    const counts = new Map<string, number>();
    for (const p of result.plan) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);
    assert.equal(counts.get('S1'), 2, 'S1 ต้องได้แค่ 2 กรุ๊ปตามเพดาน ไม่เกิน ต่อให้ยังภาระน้อยกว่า S2');
    assert.equal(counts.get('S2'), 3, 'ที่เหลือต้องไหลไปที่ S2 เพราะ S1 ครบเพดานแล้ว');
  });

  test('เพดานเต็มตั้งแต่ต้น (มีงานเดิมคอนเฟิร์มแล้วเท่าเพดานแล้ว) — ไม่ถูกจัดเพิ่มเลยตั้งแต่กรุ๊ปแรก', () => {
    const existing = [{
      dutyDate: '2026-11-01',
      slot: { groupCode: 'OLD1', airport: 'BKK', flightMin: 480, checkInMin: 480 - RULES.leadHours * 60 },
    }];
    const staffList = [
      // confirmedThisMonth ต้องตรงกับงานเดิมที่ "คอนเฟิร์มแล้ว" — เพดานนับเฉพาะตัวนี้ ไม่ใช่ existingJobs.length ตรง ๆ
      staffMember({ id: 'S1', maxGroupsPerMonth: 1, existingJobs: existing, confirmedThisMonth: 1 }),
      staffMember({ id: 'S2' }),
    ];
    const jobs = [job({ periodId: 'P1', flightTime: '14:00', dutyDate: '2026-11-10' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 1);
    assert.equal(result.plan[0].staffId, 'S2', 'S1 ครบเพดานจากงานเดิมอยู่แล้ว ต้องไม่ได้งานใหม่เลย');
  });

  test('ทุกคนครบเพดานหมด (เพดาน 0) — ตกไปอยู่ unassigned ไม่มีใครถูกจัดเกินเพดาน', () => {
    const staffList = [staffMember({ id: 'S1', maxGroupsPerMonth: 0 })];
    const jobs = [job({ periodId: 'P1', flightTime: '08:00' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 0);
    assert.deepEqual(result.unassignedPeriodIds, ['P1']);
  });

  test('ยอดรวมทั้งเดือนไม่ถ่างออกข้ามหลายสัปดาห์ แม้ประเภทพนักงานติดเวลางานบ่อยกว่าเป็นประจำ — เกลี่ยแล้วห่างกันไม่เกิน 2-3 กรุ๊ป (พนักงานห่างกันเองไม่เกิน 1-2)', () => {
    /*
      4 สัปดาห์เต็ม (28 วัน) สลับกรุ๊ปที่ติดเวลางานพนักงาน (บล็อกเฉพาะพนักงาน จัดได้แต่ประจำ) กับกรุ๊ปที่จัดได้ทั้งคู่ วันเว้นวัน
      ถ้าเกลี่ยแค่รายวัน+รายสัปดาห์ (ไม่มีชั้นรายเดือนกันไว้) คนที่ได้เปรียบตั้งแต่สัปดาห์แรกจะไม่ถูกจดจำข้ามสัปดาห์เลย —
      วัดได้จริงว่ายอดรวมทั้งเดือนถ่างออกไปถึง 4 กรุ๊ป ทั้งที่แต่ละสัปดาห์เดี่ยว ๆ ดูสมดุลดี จึงต้องมีชั้นรายเดือนกันการถ่างสะสมนี้ไว้
    */
    const jobs: AutoAssignJobInput[] = Array.from({ length: 28 }, (_, d) => {
      const iso = novDate(d);
      const flightTime = d % 2 === 0 ? '14:00' : '22:00'; // สลับ ในเวลางาน (บล็อกพนักงาน) / นอกเวลางาน (จัดได้ทั้งคู่)
      return {
        periodId: `P${d}`,
        dutyDate: iso,
        flightTime,
        isDayOff: false,
        slot: { groupCode: `P${d}`, airport: 'BKK', flightMin: d * 1440 + hm(flightTime), checkInMin: d * 1440 + hm(flightTime) - RULES.leadHours * 60 },
      };
    });
    const staffList = [
      staffMember({ id: 'E1', staffType: 'employee' }),
      staffMember({ id: 'E2', staffType: 'employee' }),
      staffMember({ id: 'P1' }),
      staffMember({ id: 'P2' }),
    ];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.unassignedPeriodIds.length, 0);
    const counts = new Map<string, number>();
    for (const s of staffList) counts.set(s.id, 0);
    for (const p of result.plan) counts.set(p.staffId, (counts.get(p.staffId) ?? 0) + 1);

    const empCounts = ['E1', 'E2'].map((id) => counts.get(id)!);
    const allCounts = [...counts.values()];
    assert.ok(Math.max(...empCounts) - Math.min(...empCounts) <= 2, `ประเภทพนักงานต้องห่างกันไม่เกิน 1-2 กรุ๊ป: ${empCounts.join(',')}`);
    assert.ok(Math.max(...allCounts) - Math.min(...allCounts) <= 3, `ยอดรวมทั้งเดือนของทุกคนต้องห่างกันไม่เกิน 2-3 กรุ๊ป: ${allCounts.join(',')}`);
    // สถานการณ์นี้สลับพอดี ๆ เกลี่ยได้ลงตัวสนิทเลยด้วยซ้ำ (ล็อกผลลัพธ์ไว้กันเผลอถอยหลัง)
    assert.equal(counts.get('E1'), 7);
    assert.equal(counts.get('E2'), 7);
    assert.equal(counts.get('P1'), 7);
    assert.equal(counts.get('P2'), 7);
  });

  test('ยังไม่รู้เวลาเครื่องออก (ไม่มี slot) — จัดอัตโนมัติไม่ได้', () => {
    const jobs = [{ periodId: 'P1', dutyDate: '2026-11-10', flightTime: null, isDayOff: false, slot: null }];
    const staffList = [staffMember({ id: 'S1' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.equal(result.plan.length, 0);
    assert.deepEqual(result.unassignedPeriodIds, ['P1']);
  });

  test('คนที่ปิดการใช้งาน/ระงับชั่วคราว ไม่ถูกจัดงานให้เลย', () => {
    const jobs = [job({ periodId: 'P1', flightTime: '08:00' })];
    const staffList = [staffMember({ id: 'DISABLED', status: 'disabled' }), staffMember({ id: 'SUSPENDED', status: 'suspended' })];
    const result = planAutoAssignSendOff(jobs, staffList, RULES);
    assert.deepEqual(result.unassignedPeriodIds, ['P1']);
  });
});

describe('summarizeAutoAssign — ข้อความสรุปก่อนยืนยัน', () => {
  test('ไม่มีงานที่จัดได้เลย', () => {
    const text = summarizeAutoAssign({ plan: [], unassignedPeriodIds: ['P1'] }, 3);
    assert.equal(text, 'ไม่มีกรุ๊ปที่จัดอัตโนมัติได้ในเดือนนี้');
  });

  test('จัดได้ครบ ไม่มีตกค้าง ไม่มีทับซ้อน', () => {
    const text = summarizeAutoAssign({ plan: [{ periodId: 'P1', staffId: 'S1', arrivalTime: '08:00', dayOffset: 0, overlapping: false }], unassignedPeriodIds: [] }, 2);
    assert.match(text, /จัดอัตโนมัติได้ 1 กรุ๊ป ให้เจ้าหน้าที่ 2 คน/);
    assert.ok(!text.includes('ต้องจัดเอง'));
    assert.ok(!text.includes('ทับซ้อน'));
  });

  test('มีตกค้าง — บอกจำนวนที่ต้องจัดเองด้วย', () => {
    const text = summarizeAutoAssign({ plan: [{ periodId: 'P1', staffId: 'S1', arrivalTime: '08:00', dayOffset: 0, overlapping: false }], unassignedPeriodIds: ['P2', 'P3'] }, 2);
    assert.match(text, /อีก 2 กรุ๊ปจัดอัตโนมัติไม่ได้.*ต้องจัดเอง/);
  });

  test('มีทับซ้อน — บอกจำนวนที่ทับซ้อนด้วย', () => {
    const text = summarizeAutoAssign({
      plan: [
        { periodId: 'P1', staffId: 'S1', arrivalTime: '08:00', dayOffset: 0, overlapping: false },
        { periodId: 'P2', staffId: 'S1', arrivalTime: '09:00', dayOffset: 0, overlapping: true },
      ],
      unassignedPeriodIds: [],
    }, 2);
    assert.match(text, /1 กรุ๊ปในนั้นเวลานัดทับซ้อนกับงานอื่น/);
  });
});

describe('canEditSendOffSchedule — สิทธิ์แก้ตารางส่งกรุ๊ปผูกกับตัวบุคคล ไม่ใช่บทบาท', () => {
  test('มี Schedule Administrator ตั้งไว้คนเดียวตามนโยบาย (ผู้จัดสเก็ต)', () => {
    assert.equal(SEND_OFF_SCHEDULE_ADMIN_USER_IDS.length, 1);
    const names = SEND_OFF_SCHEDULE_ADMIN_USER_IDS.map((id) => demoUsers.find((u) => u.id === id)?.name);
    assert.ok(names.includes('ผู้จัดสเก็ต'));
  });

  test('Schedule Administrator แก้ตารางนี้ได้', () => {
    for (const id of SEND_OFF_SCHEDULE_ADMIN_USER_IDS) {
      assert.equal(canEditSendOffSchedule({ id }), true, `${id} ต้องแก้ตารางส่งกรุ๊ปได้`);
    }
  });

  test('ผู้ใช้อื่นทุกคนในระบบ (รวม admin/coordinator อื่น) แก้ตารางนี้ไม่ได้', () => {
    for (const u of demoUsers) {
      if (SEND_OFF_SCHEDULE_ADMIN_USER_IDS.includes(u.id)) continue;
      assert.equal(canEditSendOffSchedule(u), false, `${u.name} (${u.role}) ต้องเป็น View/Limited Access เท่านั้น`);
    }
  });
});
