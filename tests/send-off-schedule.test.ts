/**
 * ตารางจัดเจ้าหน้าที่ส่งกรุ๊ป — โหมดที่ 2 ของเมนู "การจัดสเก็ต"
 *
 * เกณฑ์จากผู้ใช้:
 *   • สลับได้ระหว่าง "จัดหัวหน้าทัวร์" กับ "จัดเจ้าหน้าที่ส่งกรุ๊ป" ในเมนูเดียว
 *   • โหมดเจ้าหน้าที่ต้องเห็นเฉพาะรายชื่อเจ้าหน้าที่ส่งกรุ๊ป ไม่ใช่รายชื่อหัวหน้าทัวร์
 *   • เวลาที่ต้องไปถึง = เวลาเครื่องออกจากไทย − 3 ชั่วโมง
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airportByIata } from '../src/data/airports';
import { airportLabel, isDifferentAirport } from '../src/lib/logic/airportLabel';
import { checkSendOff } from '../src/lib/logic/sendOffStaff';
import { jobIssue, type SendOffJob } from '../src/lib/logic/sendOffJobs';
import {
  checkSendOffPair, DEFAULT_SEND_OFF_RULES, formatHours, sendOffSlot, validateRules,
} from '../src/lib/logic/sendOffRules';

const VIEW = readFileSync('src/components/jobs/JobsScheduleView.tsx', 'utf8');
const BOARD = readFileSync('src/components/jobs/SendOffScheduleTimeline.tsx', 'utf8');
/** กติกาการสร้างงานไปส่งและการตรวจปัญหา — ใช้ร่วมกันทั้งตารางรายเดือนและมุมมองรายกรุ๊ป */
const JOBS = readFileSync('src/lib/logic/sendOffJobs.ts', 'utf8');
/** หน้าต่างเลือกคน */
const PICKER = readFileSync('src/components/jobs/SendOffStaffPicker.tsx', 'utf8');
/** มุมมองรายกรุ๊ป — เห็นทั้งหัวหน้าทัวร์และเจ้าหน้าที่ส่งกรุ๊ปในแถวเดียว */
const GROUP = readFileSync('src/components/jobs/GroupCoverageView.tsx', 'utf8');
/** กติกาที่ปรับได้ + หน้าตั้งค่า */
const RULES = readFileSync('src/lib/logic/sendOffRules.ts', 'utf8');
const RULES_FORM = readFileSync('src/components/staff/SendOffRulesForm.tsx', 'utf8');
/** หน้าต่างจัดกรุ๊ปให้เจ้าหน้าที่ — ทรงเดียวกับหน้าต่างจัดงานของหัวหน้าทัวร์ */
const ADD = readFileSync('src/components/jobs/AddSendOffPanel.tsx', 'utf8');
/** ตารางจัดหัวหน้าทัวร์ — ใช้เทียบว่าสองโหมดทำงานทิศทางเดียวกัน */
const LEADER = readFileSync('src/components/jobs/GuideScheduleTimeline.tsx', 'utf8');

describe('สลับโหมดในเมนูการจัดสเก็ต', () => {
  test('มีปุ่มสลับ 3 มุมมอง และแยกคอมโพเนนต์ตามโหมด', () => {
    assert.ok(VIEW.includes('<SegmentedControl'), 'ต้องมีปุ่มสลับโหมดที่หัวหน้า');
    assert.ok(VIEW.includes("{ value: 'leader', label: 'จัดหัวหน้าทัวร์' }"), 'ต้องมีโหมดจัดหัวหน้าทัวร์');
    assert.ok(VIEW.includes("{ value: 'sendoff', label: 'จัดเจ้าหน้าที่ส่งกรุ๊ป' }"), 'ต้องมีโหมดจัดเจ้าหน้าที่ส่งกรุ๊ป');
    assert.ok(VIEW.includes("{ value: 'group', label: 'มองจากกรุ๊ป' }"), 'ต้องมีมุมมองรายกรุ๊ป');
    for (const c of ['<GuideScheduleTimeline />', '<SendOffScheduleTimeline />', '<GroupCoverageView />']) {
      assert.ok(VIEW.includes(c), `แต่ละโหมดต้องเป็นคนละคอมโพเนนต์ — ขาด ${c}`);
    }
  });

  test('โหมดค้างอยู่ใน URL — refresh หรือส่งลิงก์แล้วยังอยู่โหมดเดิม', () => {
    assert.ok(VIEW.includes("modeFromParam(params.get('mode'), canSendOff)"), 'ต้องอ่านโหมดจาก URL');
    assert.ok(VIEW.includes('router.replace('), 'สลับโหมดต้องเขียนกลับลง URL');
    assert.ok(!VIEW.includes('router.push('), 'ต้องไม่ใช้ push — ปุ่ม Back ควรพาออกจากหน้านี้ ไม่ใช่ไล่ย้อนโหมด');
  });

  test('ค่าเดิมใน URL ต้องไม่หายตอนสลับโหมด', () => {
    assert.ok(VIEW.includes('new URLSearchParams(params.toString())'), 'ต้องต่อจากพารามิเตอร์เดิม เช่น ?leader=');
  });

  test('โหมดเริ่มต้นคือจัดหัวหน้าทัวร์ (ของเดิม) และค่าแปลก ๆ ต้องไม่ทำให้หน้าว่าง', () => {
    assert.ok(VIEW.includes("if (value === 'sendoff') return value;"), 'ต้องรับโหมดจัดเจ้าหน้าที่ส่งกรุ๊ป');
    assert.ok(VIEW.includes("return 'leader';"), 'ค่าที่ไม่รู้จักต้องตกกลับเป็นโหมดเดิม');
  });

  test('คนที่ไม่มีสิทธิ์จัดเจ้าหน้าที่ส่งกรุ๊ป ไม่เห็นแท็บมองจากกรุ๊ป และดูได้แค่มุมมองตาราง', () => {
    assert.ok(VIEW.includes("if (value === 'group' && canSendOff) return value;"), '?mode=group ต้องเปิดได้เฉพาะคนที่มีสิทธิ์');
    assert.ok(VIEW.includes("MODE_OPTIONS.filter((o) => o.value !== 'group')"), 'ต้องซ่อนแท็บมองจากกรุ๊ป');
    assert.ok(BOARD.includes("const view = canAssign ? pickedView : 'board';"), 'ไม่มีสิทธิ์ต้องล็อกเป็นมุมมองตาราง');
    assert.match(BOARD, /\{canAssign && \(\s*<SegmentedControl/, 'ต้องซ่อนปุ่มสลับตาราง/รายการ');
  });
});

describe('ตารางโหมดเจ้าหน้าที่ส่งกรุ๊ป', () => {
  test('ใช้ทะเบียนเจ้าหน้าที่ส่งกรุ๊ป ไม่ใช่รายชื่อหัวหน้าทัวร์', () => {
    assert.ok(BOARD.includes('loadSendOffStaff()'), 'รายชื่อในคอลัมน์ซ้ายต้องมาจากทะเบียนเจ้าหน้าที่ส่งกรุ๊ป');
    assert.ok(!/\bleaders\b/.test(BOARD), 'ต้องไม่ดึงรายชื่อหัวหน้าทัวร์เข้ามาปน');
  });

  test('งานผูกกับวันเดียว ไม่ใช่ทั้งช่วงของทริป', () => {
    // เจ้าหน้าที่เกี่ยวกับตอนไปส่งวันเดียว ถ้าใช้ช่วงวันจะกลายเป็นติดงานทั้งทริป
    assert.ok(JOBS.includes('dutyDate'), 'ต้องมีวันที่ต้องไปส่งของแต่ละงาน');
    assert.ok(
      GROUP.includes('p.startDate >= monthStart && p.startDate <= monthEnd'),
      'มุมมองรายกรุ๊ปมองจากกรุ๊ป จึงคัดด้วยวันออกเดินทาง',
    );
  });

  test('ป้ายบนตารางบอกเวลาที่ต้องไปถึง ไม่ใช่เวลาเครื่องออก', () => {
    assert.ok(BOARD.includes('check.arrivalTime'), 'ป้ายต้องใช้เวลาที่ต้องไปถึงสนามบิน');
    assert.ok(BOARD.includes('เวลาที่ต้องถึงสนามบิน'), 'ต้องมีคำอธิบายกำกับให้ผู้จัดรู้ว่าเลขนี้คือเวลาอะไร');
  });

  test('ตารางมีแต่แถวของคน ไม่มีแถวกองกรุ๊ปที่ยังไม่มีคนไปส่ง', () => {
    // ตารางนี้มองจากคนล้วน ๆ เหมือนตารางหัวหน้าทัวร์ · กรุ๊ปที่ยังค้างดูได้ที่มุมมองรายกรุ๊ป
    assert.ok(!BOARD.includes('กดที่กรุ๊ปเพื่อเลือกคน'), 'ต้องไม่มีแถวกองกรุ๊ปบนตารางแล้ว');
    assert.ok(BOARD.includes('ยังไม่มีคนไปส่ง <b'), 'แต่ยังต้องเห็นจำนวนที่ค้างในแถบสรุป');
  });

  test('ช่องวันหนึ่งวันไม่วาดป้ายเกิน 3 อัน — วันที่มีหลายสิบกรุ๊ปต้องยุบได้', () => {
    assert.ok(BOARD.includes('MAX_CHIPS_PER_DAY'), 'ต้องจำกัดจำนวนป้ายต่อวัน');
    assert.ok(BOARD.includes('setDayList('), 'ส่วนที่เกินต้องเปิดดูเป็นรายการทั้งวันได้');
  });

  test('1 กรุ๊ปมีคนไปส่งได้หลายคน — จัดคนเดิมซ้ำคือแทนที่ของเดิม จัดคนใหม่คือเพิ่มคนที่สอง', () => {
    const STORE = readFileSync('src/services/sendOffAssignmentStore.ts', 'utf8');
    assert.ok(
      STORE.includes('.filter((r) => !(r.periodId === input.periodId && r.staffId === input.staffId))'),
      'จัดคนเดิมซ้ำที่กรุ๊ปเดิมต้องแทนที่ของเดิม (คน+กรุ๊ปตรงกัน) ส่วนคนอื่นที่กรุ๊ปเดียวกันต้องไม่ถูกแตะ — ถึงจะเพิ่มเป็นคนที่สองได้',
    );
  });

  test('เวลาบินจริงชนะเวลาที่กรอกเองเสมอ', () => {
    assert.ok(JOBS.includes('const flightTime = real ?? manual;'), 'เวลาจาก Sector ต้องมาก่อนค่าที่กรอกเอง');
  });
});

describe('แยกสาเหตุที่ส่งไม่ได้ออกจากกัน', () => {
  test('ติดเวลางาน = blocked · ไม่รู้เวลาบิน = unknown', () => {
    // สองอย่างนี้ผู้จัดต้องทำคนละแบบ — อันแรกเปลี่ยนคน อันหลังตามเวลาบินมาเติม
    assert.equal(checkSendOff('employee', '15:00').kind, 'blocked');
    assert.equal(checkSendOff('employee', null).kind, 'unknown');
    assert.equal(checkSendOff('permanent', null).kind, 'unknown');
    assert.equal(checkSendOff('permanent', '15:00').kind, 'ok');
    // เครื่องออก 21:00 → ต้องถึง 18:00 พอดี ช่วงนี้ยังทับซ้อนกับเวลางาน (เช็คทั้งช่วงเวลานัด-เวลาบิน) → ต้องเลย 21:00 ถึงจะไปได้
    assert.equal(checkSendOff('employee', '21:00').kind, 'blocked');
    assert.equal(checkSendOff('employee', '21:01').kind, 'ok');
  });

  test('ไม่รู้เวลาบินยังจัดคนได้ แต่ต้องเห็นว่าเป็นสีเตือน', () => {
    assert.ok(PICKER.includes("unknown: 'border-amber-300"), 'ไม่รู้เวลาบินต้องเป็นสีเหลือง แยกจากสีแดงที่แปลว่าไปไม่ได้');
    assert.ok(
      PICKER.includes("blocked: 'border-rose-300"),
      'ไปไม่ได้ต้องเป็นสีแดง',
    );
    assert.ok(
      PICKER.includes("const blocked = rows.filter((r) => r.check.kind === 'blocked' || r.hardConflict || r.atCap);"),
      'กันเฉพาะคนที่ติดเวลางาน/ชนข้ามสนามบินจริง (hardConflict)/ครบเพดานเดือนแล้ว — ทับซ้อนสนามบินเดียวกันไม่กันอีกต่อไป ไม่กันตอนที่ยังไม่รู้เวลาบิน',
    );
  });

  test('คนที่ไปไม่ได้ยังต้องแสดงพร้อมเหตุผล ไม่ซ่อนทิ้ง', () => {
    assert.ok(PICKER.includes('ไปไม่ได้ ({blocked.length})'), 'ต้องมีหัวข้อคนที่ไปไม่ได้');
    assert.ok(PICKER.includes('check.reason'), 'ต้องบอกเหตุผลตรงนั้น ไม่งั้นผู้จัดไม่รู้ว่าคนที่คิดไว้หายไปไหน');
  });
});

describe('การจัดคนไปส่ง — เริ่มที่รอคอนเฟิร์มเสมอ ผู้จัดกดยืนยันเองหลังคุยกับเจ้าหน้าที่แล้ว (ไม่มีสถานะปฏิเสธแยก)', () => {
  const STORE = readFileSync('src/services/sendOffAssignmentStore.ts', 'utf8');

  test('SendOffAssignment มีฟิลด์สถานะรอคอนเฟิร์ม/คอนเฟิร์มแล้ว — จัดคนไม่ใช่คอนเฟิร์มทันทีอีกต่อไป', () => {
    assert.ok(STORE.includes('SEND_OFF_ASSIGN_STATUS_DEFAULT'), 'assignSendOff ต้องตั้งสถานะเริ่มต้นเป็นรอคอนเฟิร์ม');
    assert.ok(STORE.includes('confirmedAt: null'), 'สร้างใหม่ต้องยังไม่มีเวลาคอนเฟิร์ม');
    assert.ok(!STORE.includes('declinedReason'), 'ยังไม่มีสถานะปฏิเสธแยก — ไม่รับงานใช้วิธีถอดคนแทน');
  });

  test('มีฟังก์ชันยืนยันแยกจากถอดคน — ผู้จัดกดยืนยันเองหลังคุยกับเจ้าหน้าที่นอกระบบแล้วเท่านั้น', () => {
    assert.ok(STORE.includes('export function confirmSendOff'), 'ต้องมีฟังก์ชันยืนยัน');
    assert.ok(STORE.includes('export function unassignSendOff'), 'ยังต้องมีฟังก์ชันถอดคนไว้หาคนใหม่');
  });

  test('ตารางของผู้จัดมีปุ่มยืนยันสำหรับงานที่ยังรอคอนเฟิร์ม และยังมีปุ่มถอดคนไปส่งตามเดิม', () => {
    assert.ok(BOARD.includes('doConfirm('), 'ต้องมีตัวจัดการกดยืนยัน');
    assert.ok(BOARD.includes("j.assignment?.status === 'PENDING_CONFIRMATION'"), 'ปุ่มยืนยันต้องขึ้นเฉพาะงานที่ยังรอคอนเฟิร์มเท่านั้น');
    assert.ok(BOARD.includes('ถอดคนไปส่ง'), 'ต้องยังมีปุ่มถอดคนไปส่งอยู่ตามเดิม — ทางเดียวที่เปลี่ยนคนได้');
    assert.ok(!PICKER.includes('DeclineDialog'), 'DeclineDialog ต้องไม่มี — เจ้าหน้าที่ไม่รับงานให้แจ้งผู้จัดเอง ผู้จัดถอดคนแทน');
  });

  test('sendOffJobs.ts ไม่มีการอ้างอิงสถานะปฏิเสธ — สถานะที่มีคือรอคอนเฟิร์ม/คอนเฟิร์มแล้วเท่านั้น', () => {
    assert.ok(!JOBS.includes('DECLINED'), 'ตรรกะงานไปส่งต้องไม่แยกกรณีปฏิเสธ — มี assignment คือครองเวลาเสมอไม่ว่าจะสถานะไหน');
    assert.ok(JOBS.includes("job.assignment?.status ?? 'UNASSIGNED'"), 'สถานะของงานต้องอ่านจาก assignment ตรง ๆ');
  });
});

describe('สีและเครื่องหมายบนป้าย', () => {
  test('สีป้าย = สถานะการจัด ชุดเดียวกับตารางหัวหน้าทัวร์', () => {
    assert.ok(BOARD.includes('function statusBar('), 'ต้องมีสีตามสถานะ');
    assert.ok(BOARD.includes('statusBar(jobStatus(j))'), 'แท่งบนตารางต้องใช้สีของสถานะ');
    assert.ok(BOARD.includes('BOARD_STATUS[status].bar'), 'ต้องใช้คลาสแท่งชุดเดียวกับตารางหัวหน้าทัวร์');
    assert.ok(BOARD.includes("import { BOARD_STATUS }"), 'ป้ายสถานะต้องใช้ชุดเดียวกับตารางหัวหน้าทัวร์ ไม่ตั้งชื่อใหม่');
  });

  test('เรื่องที่ต้องตรวจใช้เครื่องหมาย ! ไม่แย่งสีของสถานะ', () => {
    assert.ok(JOBS.includes('export function jobIssue('), 'ต้องมีตัวสรุปว่ามีเรื่องต้องตรวจไหม');
    assert.ok(BOARD.includes('aria-label="มีเรื่องต้องตรวจ"'), 'เครื่องหมายต้องมีคำอธิบายให้เครื่องอ่านหน้าจอ');
  });

  test('ชนข้ามสนามบินจริง (hardConflict) สำคัญกว่าเรื่องไม่รู้เวลาบิน จึงตรวจก่อน', () => {
    const fn = JOBS.slice(JOBS.indexOf('export function jobIssue('), JOBS.indexOf('/**\n * เวลานัดทับซ้อน'));
    const conflictAt = fn.indexOf('job.hardConflict');
    const unknownAt = fn.indexOf("check?.kind === 'unknown'");
    assert.ok(conflictAt > 0 && unknownAt > 0 && conflictAt < unknownAt, 'ผลตรวจ hardConflict ต้องขึ้นก่อนเรื่องไม่รู้เวลาบิน');
  });

  test('เตือนไม่รู้สนามบิน ต้องบอกให้ถูกฝั่ง — ไม่ใช่โทษกรุ๊ปที่มีสนามบินอยู่แล้วเสมอ', () => {
    /*
      airportKnown เป็น false ได้ทั้งเพราะกรุ๊ปนี้เองหรือกรุ๊ปที่เทียบด้วยไม่รู้สนามบิน
      ถ้ากรุ๊ปนี้มีสนามบินอยู่แล้ว (เช่น TBS-...) แต่กรุ๊ปที่เทียบด้วย (เช่น KIX-...) ยังไม่รู้ ต้องโทษกรุ๊ปนั้น ไม่ใช่กรุ๊ปนี้
      กลับกัน ถ้ากรุ๊ปนี้เองไม่รู้สนามบิน ต้องบอกว่าเป็นกรุ๊ปนี้เอง ไม่ใช่ไปโทษกรุ๊ปที่เทียบด้วยเสมอแบบเดิม
    */
    const base = {
      assignment: { assignmentId: 'A1' },
      period: { saleStatus: 'SELL' },
      check: { kind: 'ok' },
      hardConflict: null,
    } as unknown as SendOffJob;

    const thisGroupKnown: SendOffJob = { ...base, airport: 'BKK', conflict: { check: { airportKnown: false, airportPending: true } as never, withGroupCode: 'KIX-261010FB-VZ' } };
    assert.equal(jobIssue(thisGroupKnown), 'ยังไม่รู้สนามบินของ KIX-261010FB-VZ — ตรวจอีกครั้งเมื่อข้อมูลเที่ยวบินเข้ามา');

    const thisGroupUnknown: SendOffJob = { ...base, airport: null, conflict: { check: { airportKnown: false, airportPending: true } as never, withGroupCode: 'KIX-261010FB-VZ' } };
    assert.equal(jobIssue(thisGroupUnknown), 'ยังไม่รู้สนามบินที่ต้องไปส่ง — กรอกสนามบินในหน้าต่างเลือกคนไปส่ง หรือรอข้อมูลเที่ยวบิน');
    // กรุ๊ปนี้ไม่รู้สนามบิน = เตือนเสมอ แม้ไม่ได้อยู่ใกล้กรุ๊ปอื่นเลย (เจ้าหน้าที่ไม่รู้ว่าต้องไปที่ไหน)
    assert.equal(jobIssue({ ...base, airport: null, conflict: null }), 'ยังไม่รู้สนามบินที่ต้องไปส่ง — กรอกสนามบินในหน้าต่างเลือกคนไปส่ง หรือรอข้อมูลเที่ยวบิน');
  });

  test('ไม่รู้สนามบินแต่กรุ๊ปห่างกันเกินเกณฑ์คนละสนามบิน → ไม่เตือน (สนามบินไหนก็ผ่าน)', () => {
    const slot = (groupCode: string, airport: string | null, flightMin: number) =>
      ({ groupCode, airport, flightMin, checkInMin: flightMin - 180 });
    // HKG 02/10 14:00 กับ KIX 05/10 00:15 — ห่างกันกว่า 2 วัน
    const far = checkSendOffPair(slot('HKG', 'BKK', 0), slot('KIX', null, 58 * 60), DEFAULT_SEND_OFF_RULES);
    assert.equal(far.airportKnown, false);
    assert.equal(far.airportPending, false, 'ห่างกันเป็นวัน ไม่ว่าสนามบินไหนก็จัดได้ ต้องไม่เตือน');
    const near = checkSendOffPair(slot('HKG', 'BKK', 0), slot('KIX', null, 4 * 60), DEFAULT_SEND_OFF_RULES);
    assert.equal(near.airportPending, true, 'ห่างกันไม่ถึงเกณฑ์คนละสนามบิน ต้องเตือนให้กลับมาตรวจ');

    const base = { assignment: { assignmentId: 'A1' }, period: { saleStatus: 'SELL' }, check: { kind: 'ok' }, hardConflict: null } as unknown as SendOffJob;
    assert.equal(jobIssue({ ...base, airport: 'BKK', conflict: { check: far, withGroupCode: 'KIX' } }), null);
  });
});

describe('มุมมองรายกรุ๊ป', () => {
  test('อ่านทั้งสองฝั่งของกรุ๊ปเดียวกัน', () => {
    assert.ok(GROUP.includes('loadActiveGuideAssignments()'), 'ต้องอ่านการจัดหัวหน้าทัวร์');
    assert.ok(GROUP.includes('loadSendOffAssignments()'), 'ต้องอ่านการจัดเจ้าหน้าที่ส่งกรุ๊ป');
    assert.ok(GROUP.includes('buildSendOffJobs('), 'ต้องใช้กติกาชุดเดียวกับตารางรายเดือน ไม่คำนวณเอง');
  });

  test('หัวหน้าทัวร์ที่ปฏิเสธ/ต้องเปลี่ยนตัวยังนับว่าขาดคน · เจ้าหน้าที่ส่งกรุ๊ปที่ยังรอคอนเฟิร์มก็ยังนับว่าขาดคนเหมือนกัน', () => {
    // ถ้านับว่าครบ กรุ๊ปที่หัวหน้าทัวร์ปฏิเสธไปแล้วจะหลุดจากรายการตรวจแล้วไม่มีใครไปในวันจริง
    assert.ok(
      GROUP.includes("leaderStatus !== 'DECLINED'"),
      'หัวหน้าทัวร์ที่ปฏิเสธต้องไม่นับว่ามีคนแล้ว (หัวหน้าทัวร์ยังมีสถานะนี้อยู่ คนละระบบกับเจ้าหน้าที่ส่งกรุ๊ป)',
    );
    assert.ok(
      GROUP.includes("leaderStatus !== 'REASSIGN_REQUIRED'"),
      'หัวหน้าทัวร์ที่ต้องเปลี่ยนตัวก็ยังไม่นับว่ามีคน',
    );
    assert.ok(
      GROUP.includes("hasSendOff: job.assignment?.status === 'CONFIRMED'"),
      'เจ้าหน้าที่ส่งกรุ๊ปที่ยังรอคอนเฟิร์มต้องยังไม่นับว่ามีคนแล้ว — นับเฉพาะที่คอนเฟิร์มจริง',
    );
  });

  test('ตัวกรองเริ่มที่ "ยังไม่ครบ" — เปิดมาต้องเห็นงานค้างก่อน', () => {
    assert.ok(GROUP.includes("useState<Gap>('incomplete')"), 'ค่าเริ่มต้นต้องเป็นงานที่ยังไม่ครบ');
    for (const key of ['incomplete', 'noLeader', 'noSendOff', 'issue', 'complete', 'all']) {
      assert.ok(GROUP.includes(`${key}:`), `ต้องนับจำนวนของตัวกรอง ${key} ให้เห็นบนปุ่ม`);
    }
  });

  test('เดือนที่มีหลายร้อยกรุ๊ปต้องไม่วาดครบทีเดียว', () => {
    assert.ok(GROUP.includes('const PAGE_SIZE'), 'ต้องจำกัดจำนวนแถวต่อครั้ง');
    assert.ok(GROUP.includes('แสดง {limit} จาก {shown.length} กรุ๊ป'), 'ต้องบอกว่ากำลังแสดงกี่จากทั้งหมด ไม่ตัดเงียบ ๆ');
  });

  test('จำนวนแถวที่กางไว้ผูกกับตัวกรอง ไม่ค้างข้ามการกรอง', () => {
    assert.ok(GROUP.includes('page.key === filterKey ? page.limit : PAGE_SIZE'), 'เปลี่ยนตัวกรองต้องกลับไปเริ่มใหม่เอง');
  });

  test('ส่งต่อไปจัดหัวหน้าทัวร์แล้วเปิดกรุ๊ปนั้นให้เลย', () => {
    assert.ok(GROUP.includes('/jobs?period='), 'ต้องส่ง periodId ไปด้วย');
    const TIMELINE = readFileSync('src/components/jobs/GuideScheduleTimeline.tsx', 'utf8');
    assert.ok(TIMELINE.includes("params.get('period')"), 'ตารางหัวหน้าทัวร์ต้องรับ periodId');
    assert.ok(
      TIMELINE.includes('useState<string | null>(periodParam)'),
      'ต้องเปิดรายละเอียดกรุ๊ปนั้นให้ ไม่ปล่อยให้ไปไล่หาเองในกรุ๊ปหลายร้อยรายการ',
    );
  });

  test('จัดคนไปส่งได้ในตัว โดยใช้หน้าต่างเลือกคนตัวเดียวกัน', () => {
    assert.ok(GROUP.includes('<SendOffStaffPicker'), 'ต้องใช้หน้าต่างเลือกคนตัวเดียวกับตารางรายเดือน');
    assert.ok(GROUP.includes('jobs={jobs}'), 'ต้องส่งงานทั้งเดือนไปให้ตรวจงานชนด้วย ไม่งั้นจัดชนได้');
  });
});

describe('กติกาที่ใช้ร่วมกันอยู่ที่เดียว', () => {
  test('ทั้งสองมุมมองสร้างงานไปส่งจากตัวเดียวกัน', () => {
    assert.ok(BOARD.includes('buildSendOffJobs('), 'ตารางรายเดือนต้องใช้ตัวกลาง');
    assert.ok(GROUP.includes('buildSendOffJobs('), 'มุมมองรายกรุ๊ปต้องใช้ตัวกลางตัวเดียวกัน');
    assert.ok(
      !BOARD.includes('periodTurnaround(') && !GROUP.includes('periodTurnaround('),
      'ห้ามหน้าจอไปอ่านเวลาบินเอง ไม่งั้นเลขจะไม่ตรงกันเมื่อกติกาเปลี่ยน',
    );
  });
});

describe('เลือกกรุ๊ปให้เจ้าหน้าที่ ทิศทางเดียวกับหัวหน้าทัวร์', () => {
  test('เริ่มจากคลิกช่องวันของคน ไม่ใช่คลิกกรุ๊ปแล้วหาคน', () => {
    // ตารางหัวหน้าทัวร์ทำแบบนี้อยู่แล้ว — สองเมนูต้องใช้งานเหมือนกัน ไม่ให้จำสองแบบ
    assert.ok(LEADER.includes('onEmptyClick={(date) => setAddTarget({ leader, date })}'), 'อ้างอิงจากตารางหัวหน้าทัวร์');
    assert.ok(BOARD.includes('setAddTarget({ staff: s, date: iso })'), 'คลิกช่องวันของใคร = จัดกรุ๊ปให้คนนั้น');
    assert.ok(BOARD.includes('<AddSendOffPanel'), 'ต้องเปิดหน้าต่างเลือกกรุ๊ป');
    assert.ok(!BOARD.includes('<SendOffStaffPicker'), 'ตารางนี้ต้องไม่ใช้หน้าต่างเลือก "คน" อีกแล้ว');
  });

  test('คลิกได้เฉพาะคนที่รับงานได้จริง', () => {
    assert.ok(
      BOARD.includes('canAssign && canSendOffByStatus(s.status) ?'),
      'คนที่ปิดใช้งาน/ระงับชั่วคราว และผู้ที่ไม่มีสิทธิ์จัด ต้องคลิกไม่ได้',
    );
  });

  test('หน้าต่างมีของครบเหมือนของหัวหน้าทัวร์', () => {
    for (const [needle, why] of [
      ['const wholeMonth = from === monthStart && to === monthEnd', 'ต้องมีปุ่มแสดงทั้งเดือน'],
      ['<TagMultiSelect', 'ต้องมีตัวกรองประเทศชุดเดียวกัน'],
      ['setTimeout(() => setQuery(queryInput.trim()), 350)', 'ต้อง debounce คำค้นเท่ากัน'],
      ['const [picked, setPicked] = useState<Map<string, TourPeriodMaster>>', 'ต้องเลือกได้หลายกรุ๊ปรวดเดียว'],
      ['กรุณาเลือกช่วงวันที่ภายในเดือน', 'ต้องเลือกข้ามเดือนไม่ได้'],
    ]) {
      assert.ok(ADD.includes(needle), why);
    }
  });

  test('เปิดใหม่แล้วค่าที่เลือกไว้ต้องไม่ค้าง', () => {
    assert.ok(
      BOARD.includes('key={`${addTarget.staff.id}-${addTarget.date}`}'),
      'ต้อง remount ทุกครั้งที่เปิด เหมือนหน้าต่างของหัวหน้าทัวร์',
    );
  });

  test('กรุ๊ปที่มีคนไปส่งแล้วต้องไม่โผล่ให้เลือกซ้ำ', () => {
    assert.ok(
      ADD.includes('jobs.filter((j) => j.assignment).map((j) => j.period.internalId)'),
      'มี assignment แล้วต้องไม่โผล่ให้เลือกซ้ำ — ไม่มีสถานะปฏิเสธที่ทำให้กลับมาเลือกใหม่ได้อีกต่อไป (ถอดคนก่อนถึงจะเลือกใหม่ได้)',
    );
  });

  test('ตรวจเงื่อนไขทั้งกับงานเดิมและกับกรุ๊ปอื่นที่กำลังเลือกอยู่', () => {
    assert.ok(ADD.includes('busySlots'), 'ต้องเทียบกับงานที่คนนี้รับไว้แล้ว');
    assert.ok(ADD.includes('pickedSlots'), 'ต้องเทียบกันเองในชุดที่เลือกด้วย — คนเดียวไปสองที่พร้อมกันไม่ได้');
    assert.ok(ADD.includes('disabled={picked.size === 0 || hasConflict || overCapacity}'), 'เลือกกรุ๊ปที่ไม่ผ่านเงื่อนไขไว้ต้องกดจัดไม่ได้');
    assert.ok(ADD.includes('กับ {c.hardConflict.withGroupCode}'), 'ต้องบอกชื่อกรุ๊ปที่ติด ไม่ใช่บอกแค่ว่าติด');
  });

  test('กรอกเวลาเครื่องออกได้จากในรายการ ไม่ต้องออกไปแก้ที่อื่น', () => {
    assert.ok(ADD.includes('onSaveFlightTime(c.p.internalId, e.target.value)'), 'กรอกเวลาได้ตรงแถวของกรุ๊ป');
    assert.ok(
      !BOARD.includes('เปิดเลือกคนอีกครั้งเพื่อดูใครไปได้บ้าง'),
      'กรอกเวลาแล้วต้องไม่ปิดหน้าต่างทิ้ง',
    );
  });

  test('จัดหลายกรุ๊ปรวดเดียว โดยคำนวณเวลาไปถึงใหม่ทีละกรุ๊ป', () => {
    assert.ok(BOARD.includes('const doAssignMany ='), 'ต้องมีตัวจัดหลายกรุ๊ป');
    const loopAt = BOARD.indexOf('for (const period of periods)');
    const calcAt = BOARD.indexOf('checkSendOff(s.staffType, flightTime, {');
    assert.ok(loopAt > 0 && calcAt > loopAt, 'แต่ละกรุ๊ปต้องคิดเวลาไปถึงของตัวเองในลูป ไม่ใช้ค่าเดียวร่วมกัน');
    assert.ok(BOARD.includes('?? manualTimes[period.internalId]'), 'เวลาจริงต้องมาก่อนค่าที่กรอกเอง');
  });
});

describe('การ์ดกรุ๊ปในหน้าต่างจัดงาน ใช้ตัวเดียวกันทั้งสองเมนู', () => {
  const CARD = readFileSync('src/components/jobs/PeriodOptionCard.tsx', 'utf8');

  test('รายละเอียดบนการ์ดวาดจากที่เดียว', () => {
    // เพิ่มฟิลด์ทีหลังแล้วอีกหน้าต่างต้องไม่ขาดข้อมูลไปเงียบ ๆ
    assert.ok(LEADER.includes('<PeriodOptionCard'), 'หน้าต่างของหัวหน้าทัวร์ต้องใช้การ์ดกลาง');
    assert.ok(ADD.includes('<PeriodOptionCard'), 'หน้าต่างของเจ้าหน้าที่ส่งกรุ๊ปต้องใช้การ์ดกลาง');
    assert.ok(!LEADER.includes('function FlightLines('), 'บรรทัดเที่ยวบินต้องไม่เหลือสำเนาไว้');
  });

  test('การ์ดมีข้อมูลที่ต้องเห็นก่อนตัดสินใจครบ', () => {
    for (const [needle, why] of [
      ['period.groupCode}{period.bus', 'รหัสกรุ๊ปพร้อมบัส'],
      ['{period.displayName}', 'ชื่อโปรแกรม'],
      ['{period.programCode ? `${period.programCode} · ` : \'\'}{period.countryName} · {airportLabel(d.depAirport)} · {d.airlineCode}', 'รหัสโปรแกรม ประเทศ สนามบิน สายการบิน'],
      ['เดินทาง {formatDateRange(period.startDate, period.endDate)} · {tripDays(period)} วัน · ขาย {period.saleStatus}', 'ช่วงวันเดินทาง จำนวนวัน สถานะขาย'],
      ['<FlightLines period={period} />', 'เที่ยวบิน'],
    ]) {
      assert.ok(CARD.includes(needle), `ต้องมี${why}บนการ์ด`);
    }
  });

  test('ท้ายบรรทัดสรุปต่างกันตามงาน แต่ที่เหลือเหมือนกัน', () => {
    assert.ok(CARD.includes('tailLine'), 'การ์ดต้องเปิดช่องให้เติมข้อมูลเฉพาะงาน');
    assert.ok(LEADER.includes('tailLine="ยังไม่ระบุหัวหน้าทัวร์"'), 'เมนูหัวหน้าทัวร์สนใจว่ามีหัวหน้าทัวร์หรือยัง');
    assert.ok(ADD.includes('ถึงสนามบิน ${arrival.arrivalTime}'), 'เมนูเจ้าหน้าที่สนใจเวลาที่ต้องไปถึง');
  });

  test('ป้ายผลตรวจใช้คำเดียวกันทั้งสองเมนู', () => {
    for (const label of ['จัดได้', 'ควรตรวจสอบ', 'จัดไม่ได้']) {
      assert.ok(ADD.includes(label), `ต้องใช้คำว่า "${label}" เหมือนเมนูหัวหน้าทัวร์`);
      assert.ok(LEADER.includes(label), `เมนูหัวหน้าทัวร์ต้องยังมีคำว่า "${label}"`);
    }
  });
});

describe('สนามบิน BKK / DMK', () => {
  const LABEL = readFileSync('src/lib/logic/airportLabel.ts', 'utf8');
  const CARD = readFileSync('src/components/jobs/PeriodOptionCard.tsx', 'utf8');

  test('ชื่อสนามบินมาจาก Airport Master ไม่ได้เขียนคู่ไว้ในโค้ด', () => {
    assert.ok(LABEL.includes("import { airportByIata } from '@/data/airports'"), 'ต้องอ่านจาก Master ชุดเดียวกับทั้งระบบ');
    assert.ok(!/BKK'?\s*:\s*'สุวรรณภูมิ/.test(LABEL), 'ห้ามฮาร์ดโค้ดคู่รหัส–ชื่อซ้ำกับ Master');
  });

  test('Master มี BKK = สุวรรณภูมิ และ DMK = ดอนเมือง', () => {
    assert.equal(airportByIata('BKK')?.nameTh, 'สุวรรณภูมิ');
    assert.equal(airportByIata('DMK')?.nameTh, 'ดอนเมือง');
  });

  test('การ์ดกรุ๊ปแสดงรหัสคู่กับชื่อ', () => {
    assert.equal(airportLabel('BKK'), 'BKK · สุวรรณภูมิ');
    assert.equal(airportLabel('DMK'), 'DMK · ดอนเมือง');
    assert.ok(CARD.includes('{airportLabel(d.depAirport)}'), 'การ์ดต้องใช้ป้ายที่มีชื่อสนามบิน');
  });

  test('ไม่มีข้อมูลก็ไม่เดาชื่อให้', () => {
    assert.equal(airportLabel('-'), '-');
    assert.equal(airportLabel(''), '-');
    assert.equal(airportLabel(null), '-');
    assert.equal(airportLabel('ZZZ'), 'ZZZ', 'รหัสที่ไม่รู้จักต้องคืนค่าเดิม ไม่ใช่ช่องว่าง');
  });

  test('รู้ว่าสองสนามบินคนละที่กัน — ไม่รู้ฝั่งใดฝั่งหนึ่ง = ตอบไม่ได้', () => {
    assert.equal(isDifferentAirport('BKK', 'DMK'), true);
    assert.equal(isDifferentAirport('BKK', 'bkk'), false, 'ตัวพิมพ์ไม่ต่างกัน');
    assert.equal(isDifferentAirport('BKK', null), false, 'ไม่รู้ต้องไม่ตอบว่าต่าง');
    assert.equal(isDifferentAirport('BKK', '-'), false);
  });

  test('งานไปส่งรู้ว่าต้องไปสนามบินไหน', () => {
    assert.ok(JOBS.includes('const airport = period.departureAirportCode ?? input.manualAirports?.[period.internalId] ?? null;'), 'ต้องอ่านสนามบินขาออกจาก Master ก่อนเสมอ แล้วค่อยใช้ค่าที่กรอกเองเป็นตัวสำรอง');
    assert.ok(RULES.includes('a.airport!.toUpperCase() === b.airport!.toUpperCase()'), 'ต้องเทียบสนามบินของสองกรุ๊ป');
  });
});

describe('เงื่อนไขการจัด — ปรับได้ตามนโยบายของผู้จัด', () => {
  const R = DEFAULT_SEND_OFF_RULES;
  const slot = (code: string, airport: string, flightTime: string, date = '2026-09-01') =>
    sendOffSlot({ groupCode: code, departDate: date, flightTime, airport }, R)!;

  test('ค่าเริ่มต้นตรงกับที่ผู้จัดกำหนด', () => {
    assert.equal(R.leadHours, 3, 'ถึงสนามบินก่อนเครื่องออก 3 ชม.');
    assert.equal(R.sameAirportGapHours, 2, 'สนามบินเดียวกันควรห่างเกิน 2 ชม. — ไม่ถึงแค่เตือนว่าทับซ้อน ไม่บล็อก');
    assert.equal(R.crossAirportGapHours, 6, 'คนละสนามบินห่างเกิน 6 ชม. — กฎตายตัว บล็อกจริง');
  });

  test('เวลาเช็คอิน = เครื่องออก − leadHours', () => {
    const a = slot('G1', 'DMK', '08:00');
    assert.equal(a.flightMin - a.checkInMin, 180);
  });

  test('สนามบินเดียวกัน นับจากเวลาเช็คอิน', () => {
    // 08:00 → เช็คอิน 05:00 · 11:30 → เช็คอิน 08:30 → ห่าง 3 ชม. 30 นาที = เกิน 3 ชม.
    const c = checkSendOffPair(slot('G1', 'DMK', '08:00'), slot('G2', 'DMK', '11:30'), R);
    assert.equal(c.sameAirport, true);
    assert.equal(c.basis, 'checkin');
    assert.equal(c.gapMinutes, 210);
    assert.equal(c.ok, true);
  });

  test('สนามบินเดียวกัน ห่างไม่ถึงเกณฑ์ = ok เป็น false (ระดับบนถือเป็นแค่ทับซ้อน จัดได้ ดู hardConflictWith)', () => {
    const c = checkSendOffPair(slot('G1', 'DMK', '08:00'), slot('G2', 'DMK', '09:30'), R);
    assert.equal(c.ok, false, 'เช็คอินห่าง 1 ชม. 30 นาที ยังไม่เกิน 2 ชม.');
    assert.match(c.reason, /เวลาเช็คอิน/);
  });

  test('ห่างเท่าเกณฑ์พอดี ยังไม่ผ่าน — เกณฑ์คือ "เกิน"', () => {
    const c = checkSendOffPair(slot('G1', 'DMK', '08:00'), slot('G2', 'DMK', '10:00'), R);
    assert.equal(c.gapMinutes, 120);
    assert.equal(c.ok, false);
  });

  test('คนละสนามบิน นับจากเวลาเครื่องออก และใช้เกณฑ์ 6 ชม.', () => {
    // ดอนเมือง 11:30 → สุวรรณภูมิ 18:30 = ห่าง 7 ชม. (เกิน 6) → จัดได้
    const ok = checkSendOffPair(slot('G2', 'DMK', '11:30'), slot('G3', 'BKK', '18:30'), R);
    assert.equal(ok.sameAirport, false);
    assert.equal(ok.basis, 'flight');
    assert.equal(ok.gapMinutes, 420);
    assert.equal(ok.ok, true);
  });

  test('คนละสนามบินห่างไม่ถึง 6 ชม. = จัดไม่ได้', () => {
    const bad = checkSendOffPair(slot('G2', 'DMK', '11:30'), slot('G3', 'BKK', '16:00'), R);
    assert.equal(bad.ok, false, 'ห่าง 4 ชม. 30 นาที ยังไม่เกิน 6 ชม.');
    assert.match(bad.reason, /คนละสนามบิน/);
    assert.match(bad.reason, /เวลาเครื่องออก/);
  });

  test('ลำดับตัวอย่างของผู้จัดต้องผ่านทุกคู่', () => {
    // กรุ๊ป1 DMK 08:00 → กรุ๊ป2 DMK 11:30 → กรุ๊ป3 BKK 18:30 → กรุ๊ป4 BKK 22:00
    const seq = [slot('G1', 'DMK', '08:00'), slot('G2', 'DMK', '11:30'), slot('G3', 'BKK', '18:30'), slot('G4', 'BKK', '22:00')];
    for (let i = 0; i < seq.length - 1; i += 1) {
      assert.equal(checkSendOffPair(seq[i], seq[i + 1], R).ok, true, `คู่ที่ ${i + 1} ต้องจัดได้`);
    }
  });

  test('ยังไม่รู้สนามบิน ใช้เกณฑ์สนามบินเดียวกันไปก่อน แต่ต้องบอกว่ายังตรวจไม่ครบ', () => {
    const c = checkSendOffPair(slot('G1', 'DMK', '08:00'), sendOffSlot({ groupCode: 'G2', departDate: '2026-09-01', flightTime: '11:30', airport: null }, R)!, R);
    assert.equal(c.airportKnown, false);
    assert.equal(c.sameAirport, true, 'ไม่ใช้เกณฑ์ที่เข้มกว่าโดยไม่มีข้อมูลยืนยัน');
    assert.match(c.reason, /ยังไม่รู้สนามบิน/);
  });

  test('เทียบข้ามวันได้ — เที่ยวบินดึกเริ่มงานตั้งแต่คืนก่อน', () => {
    const c = checkSendOffPair(slot('G1', 'BKK', '22:00', '2026-09-01'), slot('G2', 'BKK', '02:00', '2026-09-02'), R);
    assert.equal(c.gapMinutes, 240, 'เช็คอิน 19:00 กับ 23:00 ห่างกัน 4 ชม.');
    assert.equal(c.ok, true);
  });

  test('ปรับค่าแล้วผลเปลี่ยนตาม', () => {
    const strict = { ...R, crossAirportGapHours: 8 };
    const pair = [slot('G2', 'DMK', '11:30'), slot('G3', 'BKK', '18:30')] as const;
    assert.equal(checkSendOffPair(pair[0], pair[1], R).ok, true, 'เกณฑ์ 6 ชม. ผ่าน');
    assert.equal(checkSendOffPair(pair[0], pair[1], strict).ok, false, 'เกณฑ์ 8 ชม. ไม่ผ่าน');
  });

  test('ค่าที่กรอกนอกขอบเขตต้องบันทึกไม่ได้', () => {
    assert.equal(validateRules(R), null);
    assert.ok(validateRules({ ...R, leadHours: 0 }), 'leadHours ต่ำเกินไป');
    assert.ok(validateRules({ ...R, crossAirportGapHours: 99 }), 'เกินขอบเขตบน');
    assert.ok(validateRules({ ...R, employeeWorkEnd: '08:00' }), 'เลิกงานก่อนเข้างานไม่ได้');
    assert.ok(validateRules({ ...R, employeeWorkStart: 'ไม่ใช่เวลา' }), 'รูปแบบเวลาไม่ถูกต้อง');
  });

  test('ไม่รู้เวลาบิน = สร้าง slot ไม่ได้ (ไม่เดา)', () => {
    assert.equal(sendOffSlot({ groupCode: 'G', departDate: '2026-09-01', flightTime: null, airport: 'BKK' }, R), null);
    assert.equal(sendOffSlot({ groupCode: 'G', departDate: '', flightTime: '08:00', airport: 'BKK' }, R), null);
  });

  test('formatHours อ่านง่าย', () => {
    assert.equal(formatHours(6), '6 ชม.');
    assert.equal(formatHours(3.5), '3 ชม. 30 นาที');
    assert.equal(formatHours(0.5), '30 นาที');
  });
});

describe('เมนูตั้งค่าเงื่อนไข', () => {
  test('อยู่ในเมนูเจ้าหน้าที่ส่งกรุ๊ป เป็นแท็บของตัวเอง', () => {
    const VIEW_STAFF = readFileSync('src/components/staff/SendOffStaffView.tsx', 'utf8');
    assert.ok(VIEW_STAFF.includes("{ key: 'rules', label: 'เงื่อนไขการจัด' }"), 'ต้องมีแท็บเงื่อนไขการจัด');
    assert.ok(VIEW_STAFF.includes('<SendOffRulesForm />'), 'ต้องแสดงหน้าตั้งค่า');
  });

  test('ตัวเลขบนหน้าจออ่านจากค่าที่ตั้งไว้ ไม่พิมพ์ค้าง', () => {
    const VIEW_STAFF = readFileSync('src/components/staff/SendOffStaffView.tsx', 'utf8');
    assert.ok(VIEW_STAFF.includes('formatHours(rules.leadHours)'), 'คำอธิบายต้องใช้ค่าที่ตั้งไว้');
    assert.ok(!VIEW_STAFF.includes('SEND_OFF_LEAD_HOURS'), 'ต้องไม่ใช้ค่าคงที่เดิมแล้ว');
  });

  test('บันทึกไม่ได้ถ้าค่าไม่ผ่านการตรวจ และมีปุ่มคืนค่าเริ่มต้น', () => {
    assert.ok(RULES_FORM.includes('disabled={Boolean(error) || !dirty}'), 'ค่าไม่ผ่านต้องกดบันทึกไม่ได้');
    assert.ok(RULES_FORM.includes('resetSendOffRules'), 'ต้องมีปุ่มคืนค่าเริ่มต้น');
  });

  test('ทดลองค่าได้ก่อนบันทึก', () => {
    assert.ok(RULES_FORM.includes('checkSendOffPair('), 'ต้องคำนวณตัวอย่างจากค่าที่กรอกอยู่');
    assert.ok(RULES_FORM.includes("{ groupCode: 'กรุ๊ป 1', airport: 'DMK'"), 'ใช้ตัวอย่างตามที่ผู้จัดอธิบายไว้');
  });

  test('ตารางจัดสเก็ตอ่านเงื่อนไขจากที่เก็บ ไม่ใช้ค่าคงที่', () => {
    for (const [src, name] of [[BOARD, 'ตารางรายเดือน'], [GROUP, 'มุมมองรายกรุ๊ป']] as const) {
      assert.ok(src.includes('loadSendOffRules()'), `${name} ต้องโหลดเงื่อนไขที่ตั้งไว้`);
      assert.ok(src.includes('rules,'), `${name} ต้องส่งเงื่อนไขเข้า buildSendOffJobs`);
    }
  });
});

describe('การกรองวันที่และกองข้อมูล', () => {
  test('ตารางกับหน้าต่างเลือกกรุ๊ปต้องใช้กองเดียวกัน', () => {
    // เดิมตารางใช้ getTourPeriods (405) แต่หน้าต่างใช้ getAssignablePeriods (248)
    // ยอด "ยังไม่มีคนไปส่ง" จึงรวมกรุ๊ป NO SELL ที่กดเลือกไม่ได้ 157 รายการ แล้วไม่มีวันเคลียร์หมด
    for (const [src, name] of [[BOARD, 'ตารางรายเดือน'], [GROUP, 'มุมมองรายกรุ๊ป']] as const) {
      assert.ok(src.includes('getAssignablePeriods()'), `${name} ต้องคัดด้วยกองที่จัดได้จริง`);
      assert.ok(src.includes('sendOffPeriodPool('), `${name} ต้องใช้ตัวคัดกองชุดเดียวกัน`);
    }
    assert.ok(ADD.includes('getAssignablePeriods()'), 'หน้าต่างเลือกกรุ๊ปใช้กองเดียวกันอยู่แล้ว');
  });

  test('กรุ๊ปที่จัดคนไปแล้วต้องไม่หายแม้ภายหลังเป็น NO SELL', () => {
    assert.ok(
      JOBS.includes('input.assignablePeriodIds.has(p.internalId) || assigned.has(p.internalId)'),
      'ต้องเก็บกรุ๊ปที่มีคนอยู่แล้วไว้ให้ผู้จัดถอดออกได้',
    );
    const issueFn = JOBS.slice(JOBS.indexOf('export function jobIssue('), JOBS.indexOf('/** สรุปเงื่อนไข'));
    assert.ok(issueFn.includes("job.period.saleStatus === 'NO_SELL'"), 'ต้องขึ้นเตือนว่าพีเรียดปิดขายแล้ว');
  });

  test('ตารางคัดด้วยวันที่ต้องไปส่ง ไม่ใช่วันออกเดินทาง', () => {
    // เที่ยวบินดึกทำให้ต้องไปตั้งแต่คืนก่อน วันไปส่งจึงคร่อมเดือนได้
    // ถ้าคัดด้วยวันออกเดินทาง งานที่วันไปส่งตกเดือนก่อนจะไม่มีช่องให้วาด แล้วหายไปจากตาราง
    assert.ok(BOARD.includes('const from = addDays(monthStart, -1);'), 'ต้องดึงพีเรียดเผื่อหัวท้ายข้างละวัน');
    assert.ok(
      BOARD.includes('.filter((j) => j.dutyDate >= monthStart && j.dutyDate <= monthEnd)'),
      'แล้วคัดด้วยวันที่ต้องไปส่งอีกชั้น',
    );
    assert.ok(BOARD.includes('งานไปส่งเดือนนี้'), 'ป้ายต้องบอกให้ตรงว่านับอะไร');
  });

  test('จำนวนที่รายงานต้องเป็นจำนวนจริง ไม่ใช่จำนวนที่ตัดแล้ว', () => {
    // เดิม slice ก่อนนับ ทำให้ขึ้น "พบ 80" ทั้งที่มีมากกว่านั้น
    assert.ok(ADD.includes('const shownCandidates = candidates.slice(0, limit);'), 'ต้องตัดตอนวาดเท่านั้น');
    assert.ok(ADD.includes('พบ {candidates.length}'), 'จำนวนที่รายงานต้องเป็นของจริง');
    assert.ok(ADD.includes('{shownCandidates.map((c) => {'), 'รายการที่วาดต้องเป็นชุดที่ตัดแล้ว');
    assert.ok(ADD.includes('candidates.length > limit'), 'บอกว่าเหลืออีกเมื่อเกินจริงเท่านั้น');
  });
  test('เลือกทั้งเดือนต้องกดดูกรุ๊ปปลายเดือนได้ ไม่ตัดตายตัว', () => {
    // เดิมตัดที่ 80 แล้วจบ — เลือกทั้งเดือนจะเห็นแค่ถึงกลางเดือน กรุ๊ปหลังจากนั้นจัดไม่ได้เลย
    assert.ok(ADD.includes('แสดงเพิ่มอีก {Math.min(PAGE_SIZE, candidates.length - limit)}'), 'ต้องมีปุ่มแสดงเพิ่ม');
    assert.ok(ADD.includes('page.key === filterKey ? page.limit : PAGE_SIZE'), 'เปลี่ยนตัวกรองต้องกลับไปเริ่มใหม่');
    assert.ok(!ADD.includes('MAX_CANDIDATES'), 'ต้องไม่เหลือการตัดตายตัว');
  });
});

describe('อ่านงานที่จัดไปแล้วได้ชัดเจน', () => {
  const AGENDA = readFileSync('src/components/jobs/SendOffAgenda.tsx', 'utf8');

  test('แท่งงานอ่านแบบเดียวกับตารางหัวหน้าทัวร์', () => {
    // มุมมองรายการ (SendOffAgenda) คือที่ "อ่านงานที่จัดไปแล้วได้ชัดเจน" ตามชื่อ describe — ไม่ใช่ช่องกริดเล็ก ๆ
    // ใน SendOffScheduleTimeline (BOARD) ที่ตั้งใจย่อให้พอดีตารางแทน จึงต้องอ่านจาก AGENDA
    const chipBody = AGENDA.slice(AGENDA.indexOf('{list.map((j) =>'), AGENDA.indexOf('</button>'));
    assert.ok(chipBody.includes('j.period.groupCode'), 'แท่งงานต้องแสดงรหัสกรุ๊ปเหมือนตารางหัวหน้าทัวร์');
    assert.ok(chipBody.includes('j.period.countryName'), 'และบรรทัดล่าง ประเทศ · รายละเอียดกรุ๊ป');
    assert.ok(chipBody.includes('airportLabel(j.airport)'), 'ต้องเห็นสนามบินด้วย');
    assert.ok(BOARD.includes('{chipTime(j)}'), 'ป้ายต้องเป็นเวลาที่ต้องไปถึง');
    // เดิมกันช่องวันแคบเกินด้วย DAY_MIN_W + Horizontal Scroll ทั้งเดือน — เปลี่ยนมาโชว์ทีละ VISIBLE_DAYS วัน
    // แทนแล้ว (ดูคอมเมนต์ header ของไฟล์) แต่ละวันจึงได้พื้นที่เท่า ๆ กันจากความกว้างที่มีอยู่โดยไม่ต้องกำหนดขั้นต่ำเอง
    assert.ok(BOARD.includes('const VISIBLE_DAYS = 7;'), 'ต้องโชว์ทีละไม่กี่วันแทนอัดทั้งเดือน ไม่งั้นแต่ละช่องจะแคบจนอ่านไม่ออก');
    assert.ok(BOARD.includes('absolute -right-0.5 -top-1'), 'เครื่องหมายปัญหาต้องลอยที่มุม ไม่กินความกว้างของข้อความ');
  });

  test('มีมุมมองรายการสำหรับอ่านรายละเอียด', () => {
    assert.ok(BOARD.includes("useState<'board' | 'agenda'>('board')"), 'ต้องสลับมุมมองได้ และเริ่มที่ตารางเหมือนเดิม');
    assert.ok(BOARD.includes('<SendOffAgenda jobs={jobs}'), 'มุมมองรายการต้องใช้งานชุดเดียวกับตาราง');
  });

  test('รายการแสดงเฉพาะงานที่จัดแล้ว จัดกลุ่มตามวัน เรียงตามเวลาไปถึง', () => {
    assert.ok(AGENDA.includes('if (!j.assignment) continue;'), 'กรุ๊ปที่ยังไม่มีคนไม่ใช่คำถามของมุมมองนี้');
    assert.ok(AGENDA.includes('m.set(j.dutyDate,'), 'ต้องจัดกลุ่มตามวันที่ต้องไปส่ง');
    assert.ok(
      AGENDA.includes('(x.slot?.checkInMin ?? 0) - (y.slot?.checkInMin ?? 0)'),
      'ในวันเดียวกันต้องเรียงตามเวลาที่ต้องไปถึง — ลำดับที่คนไปส่งใช้จริง',
    );
  });

  test('รายการมีของครบตามที่ต้องรู้', () => {
    for (const [needle, why] of [
      ["{arrival.arrivalTime ?? '—'}", 'เวลาที่ต้องไปถึง'],
      ['ถึงสนามบิน', 'ป้ายบอกว่าเวลานั้นคือเวลาไปถึงสนามบิน'],
      ['formatDate(j.period.startDate)', 'วันที่เครื่องออกเมื่อข้ามคืน'],
      ['{j.period.groupCode}', 'รหัสกรุ๊ป'],
      ['BOARD_STATUS[status', 'สถานะการจัด'],
      ['airportLabel(j.airport)', 'สนามบิน'],
      ['flightSummary(j.period)', 'เที่ยวบิน'],
      ['sendOffStaffName(j.staff)', 'คนไปส่ง'],
      ['{issue}', 'เรื่องที่ต้องตรวจ'],
    ] as const) {
      assert.ok(AGENDA.includes(needle), `รายการต้องแสดง${why}`);
    }
  });

  test('กดที่รายการเปิดรายละเอียดตัวเดียวกับกดจากตาราง', () => {
    assert.ok(AGENDA.includes('onOpen(j)'), 'ต้องเปิดรายละเอียดได้');
    assert.ok(BOARD.includes('onOpen={setDetail}'), 'ใช้หน้าต่างรายละเอียดตัวเดียวกัน');
  });
});

describe('วันหยุด — พนักงานจัดได้เท่าประเภทประจำ', () => {
  const DAYOFF = readFileSync('src/lib/logic/dayOff.ts', 'utf8');
  const AGENDA = readFileSync('src/components/jobs/SendOffAgenda.tsx', 'utf8');

  test('วันทำงาน พนักงานยังติดเวลางานเหมือนเดิม', () => {
    // เครื่องออก 15:00 อยู่ในเวลางาน 09:00–18:00 โดยตรง (เช็คจากเวลาเครื่องออก ไม่ใช่เวลาที่ต้องถึงสนามบิน)
    assert.equal(checkSendOff('employee', '15:00').kind, 'blocked');
    assert.equal(checkSendOff('employee', '15:00', { isDayOff: false }).kind, 'blocked');
  });

  test('วันหยุด พนักงานไปได้ทุกช่วงเวลา', () => {
    const r = checkSendOff('employee', '15:00', { isDayOff: true, dayOffLabel: 'วันเสาร์' });
    assert.equal(r.ok, true);
    assert.equal(r.kind, 'ok');
    assert.match(r.reason, /วันเสาร์/, 'ต้องบอกเหตุผลว่าทำไมวันนี้จัดได้');
    assert.equal(r.arrivalTime, '12:00', 'เวลาที่ต้องไปถึงยังคำนวณเหมือนเดิม');
  });

  test('วันหยุดไม่ทำให้กติกาอื่นหลวมลง', () => {
    // ไม่รู้เวลาบินก็ยังคำนวณไม่ได้อยู่ดี ไม่ใช่ปล่อยผ่านเพราะเป็นวันหยุด
    assert.equal(checkSendOff('employee', null, { isDayOff: true }).kind, 'unknown');
    // ประเภทประจำไม่เปลี่ยนอะไร
    assert.equal(checkSendOff('permanent', '15:00', { isDayOff: true }).kind, 'ok');
  });

  test('เสาร์-อาทิตย์ และวันหยุดที่ตั้งไว้ นับเป็นวันหยุดทั้งคู่', () => {
    assert.ok(DAYOFF.includes("type === 'holiday'"), 'ต้องรับวันหยุดจากเมนูวันหยุด');
    assert.ok(DAYOFF.includes("type === 'weekend'"), 'ต้องรับเสาร์-อาทิตย์');
    assert.ok(DAYOFF.includes('dayTypeOf'), 'ต้องใช้ตัวตัดสินวันชุดเดียวกับปฏิทินทุกหน้า');
  });

  test('ดูวันหยุดที่ "วันไปส่งจริง" ไม่ใช่วันออกเดินทาง', () => {
    // เที่ยวบินตี 2 วันจันทร์ = ต้องไปตั้งแต่คืนวันอาทิตย์ ซึ่งเป็นวันหยุด
    assert.ok(JOBS.includes('input.dayOffOf?.(dutyDate)'), 'ต้องเช็คด้วยวันที่ต้องไปส่ง');
    assert.ok(ADD.includes('const dayOffLabel = dayOffOf(dutyDate);'), 'หน้าต่างเลือกกรุ๊ปต้องคิดแบบเดียวกัน');
  });

  test('ทุกหน้าจอส่งวันหยุดเข้าไปตรวจ ไม่มีหน้าไหนตกหล่น', () => {
    for (const [src, name] of [[BOARD, 'ตารางรายเดือน'], [GROUP, 'มุมมองรายกรุ๊ป']] as const) {
      assert.ok(src.includes('dayOffLookup('), `${name} ต้องสร้างตัวตรวจวันหยุด`);
      assert.ok(src.includes('dayOffOf'), `${name} ต้องส่งเข้า buildSendOffJobs`);
    }
  });

  test('ต้องเห็นบนหน้าจอว่าทำไมวันนั้นพนักงานจัดได้', () => {
    assert.ok(ADD.includes('{c.dayOffLabel}'), 'การ์ดกรุ๊ปต้องติดป้ายวันหยุด');
    assert.ok(AGENDA.includes('list[0].dayOff.label'), 'รายการต้องบอกที่หัวข้อวัน');
    assert.ok(BOARD.includes("detail.staff?.staffType === 'employee'"), 'รายละเอียดต้องอธิบายเฉพาะกรณีพนักงาน');
  });
});
