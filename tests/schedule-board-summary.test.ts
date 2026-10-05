/**
 * หน้า "การจัดสเก็ต / Schedule" — แถบสรุป "สถานะการจัด" ใต้ชุดตัวกรอง
 *
 * แถบนี้เคยถูกนำออกไปช่วงหนึ่ง แล้วนำกลับมาในรูปแบบชิปที่กดกรองได้
 * ชุดทดสอบนี้ล็อกทั้งการมีอยู่ของแถบ พฤติกรรมการกรอง และการที่สถานะยังใช้กับส่วนอื่นตามเดิม
 * อ่านจากไฟล์ต้นทางโดยตรง ไม่ตรวจจากข้อความบนหน้าจอ
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD_STATUS, BOARD_STATUS_ORDER } from '../src/lib/logic/guideBoard';

const SRC = readFileSync(new URL('../src/components/jobs/GuideScheduleTimeline.tsx', import.meta.url), 'utf8');
const countsBlock = () => SRC.match(/const boardCounts = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';

test('AC1 มีหัวข้อ "สถานะการจัด:" ใต้ชุดตัวกรอง', () => {
  assert.ok(/>\s*สถานะการจัด:\s*</.test(SRC), 'ต้องมีหัวข้อแถบสรุป');
});

test('AC2 แสดงครบทั้ง 5 สถานะเป็นชิป พร้อมจุดสีและจำนวน', () => {
  // วนจากลำดับสถานะกลาง (ซ่อน “ปฏิเสธ” เมื่อไม่มีข้อมูล — สถานะนี้ไม่เกิดในขั้นตอนปัจจุบัน)
  assert.ok(/BOARD_STATUS_ORDER(\.filter\(.*?\))?\.map\(\(s\)/.test(SRC), 'ต้องวนจากลำดับสถานะกลาง');
  assert.ok(SRC.includes('BOARD_STATUS[s].dot'), 'ต้องมีจุดสีจาก Mapping กลาง');
  assert.ok(SRC.includes('BOARD_STATUS[s].label'), 'ต้องใช้ชื่อสถานะจาก Mapping กลาง');
  assert.ok(SRC.includes('boardCounts[s]'), 'ต้องแสดงจำนวนต่อท้าย');
  assert.equal(BOARD_STATUS_ORDER.length, 5);
});

test('AC3 จำนวนคำนวณจากข้อมูลจริง ไม่ Hardcode', () => {
  const c = countsBlock();
  assert.ok(c, 'ต้องมีการคำนวณจำนวน');
  assert.ok(c.includes('rowsByLeader'), 'นับจากงานจริงของแต่ละคน');
  assert.ok(c.includes('normalizeBoardStatus(e.board)'), 'อ่านจากฟิลด์ board ไม่ใช่ข้อความบนจอ');
  assert.ok(c.includes('assignedPeriodIds'), '"ยังไม่ระบุ" นับจากพีเรียดที่ยังไม่มีหัวหน้าทัวร์');
});

test('AC3 จำนวนบนชิปไม่เปลี่ยนตามชิปที่เลือก (นับจากชุดก่อนกรองสถานะ)', () => {
  const c = countsBlock();
  assert.ok(c.includes('baseLeaders'), 'ต้องนับจาก baseLeaders');
  assert.equal(c.includes('boardFilter'), false, 'ต้องไม่ขึ้นกับชิปที่เลือก');
});

test('AC4 กดชิปแล้วกรอง · กดซ้ำยกเลิกกลับมาทุกสถานะ', () => {
  assert.ok(SRC.includes('onClick={() => setBoardFilter(on ? null : s)}'), 'กดซ้ำต้องล้างค่าเป็น null');
  assert.ok(SRC.includes('aria-pressed={on}'), 'ต้องบอกสถานะ Active ให้เข้าถึงได้');
  assert.ok(/const shownLeaders = useMemo[\s\S]{0,400}boardFilter/.test(SRC), 'ต้องกรองรายชื่อตามสถานะที่เลือก');
});

test('AC5 ใช้ค่าตัวกรองชุดเดียว ไม่มีตัวกรองสถานะการจัดซ้อนกัน', () => {
  const states = SRC.match(/useState<BoardStatus \| null>/g) ?? [];
  assert.equal(states.length, 1, 'ต้องมี state ของตัวกรองสถานะการจัดชุดเดียว');
  assert.equal(/aria-label="สถานะการจัด"/.test(SRC), false, 'ต้องไม่มี dropdown สถานะการจัดมาซ้อน');
});

test('"ล้างค่า" ล้างตัวกรองสถานะการจัดด้วย', () => {
  /* จับทั้งบล็อก — สองตัวนี้ยาวหลายบรรทัดได้เมื่อมีตัวกรองเพิ่ม (รองรับ CRLF ด้วย) */
  const reset = SRC.match(/const resetFilters = [\s\S]*?\r?\n  \};/)?.[0] ?? '';
  const hasFilter = SRC.match(/const hasFilter = [\s\S]*?;/)?.[0] ?? '';
  assert.ok(reset.includes('setBoardFilter(null)'), 'resetFilters ต้องล้างชิป');
  assert.ok(hasFilter.includes('boardFilter'), 'hasFilter ต้องนับชิปเป็นตัวกรองด้วย');
});

test('สถานะการจัดทั้ง 5 ค่ายังอยู่ครบในระบบ พร้อมสีและป้าย', () => {
  assert.deepEqual(BOARD_STATUS_ORDER, [
    'CONFIRMED', 'PENDING_CONFIRMATION', 'REASSIGN_REQUIRED', 'DECLINED', 'UNASSIGNED',
  ]);
  for (const s of BOARD_STATUS_ORDER) {
    assert.ok(BOARD_STATUS[s]?.label, `สถานะ ${s} ต้องมี label`);
    assert.ok(BOARD_STATUS[s]?.bar, `สถานะ ${s} ต้องมีสีแถบ`);
    assert.ok(BOARD_STATUS[s]?.dot, `สถานะ ${s} ต้องมีจุดสีสำหรับชิป`);
  }
});

test('AC6 สถานะการจัดยังใช้ระบายสีแถบงานและแสดงในรายละเอียดการมอบหมาย', () => {
  assert.ok(SRC.includes('boardStatusMeta(e.board).bar'), 'แถบงานต้องยังใช้สีตามสถานะการจัด');
  assert.ok(SRC.includes('<Field label="สถานะการจัด"'), 'รายละเอียดการมอบหมายต้องยังแสดงสถานะการจัด');
});

test('AC6 ชิปกับแถบงานใช้ Mapping สีชุดเดียวกัน (ไม่นิยามสีซ้ำใน Component)', () => {
  for (const s of BOARD_STATUS_ORDER) {
    assert.equal(SRC.includes(BOARD_STATUS[s].bar), false, `ห้ามฝังชุดสีของ ${s} ไว้ใน Component`);
  }
});

test('AC7 คำอธิบายสีความพร้อมยังอยู่ และแยกกลุ่มด้วยเส้นคั่น', () => {
  assert.ok(SRC.includes("(['leave', 'company', 'unavailable', 'cancelled'] as const).map"));
  assert.ok(SRC.includes('LEAVE_STYLE[k].legend'));
  assert.ok(SRC.includes("w-px shrink-0 bg-[var(--zego-border-strong)]"), 'ต้องมีเส้นคั่นแนวตั้งระหว่างสองกลุ่ม');
});

test('ตัวกรองอื่นที่คงไว้ยังอยู่ครบ — ค้นหา / รูปแบบการร่วมงาน / คนว่าง / คนมีงาน', () => {
  /* รับได้ทั้ง aria-label ตรง ๆ และ prop ariaLabel ของ TagMultiSelect — ตัวกรองยังต้องมีอยู่ */
  assert.ok(/(aria-label|ariaLabel)="รูปแบบการร่วมงาน"/.test(SRC));
  assert.ok(SRC.includes('label="ค้นหาหัวหน้าทัวร์"'));
  assert.ok(SRC.includes('คนว่าง') && SRC.includes('คนมีงาน'));
});

test('Dropdown "ทุกสถานะ" / "งานที่ต้องดำเนินการ" ไม่กลับมา (ถูกนำออกไปแล้ว)', () => {
  assert.equal(/aria-label="สถานะหัวหน้าทัวร์"/.test(SRC), false);
  assert.equal(/aria-label="งานที่ต้องดำเนินการ"/.test(SRC), false);
  for (const dead of ['statusFilter', 'actionFilter', 'ACTION_FILTERS']) {
    assert.equal(SRC.includes(dead), false, `ยังเหลือ ${dead}`);
  }
});

test('ช่องค้นหาบนแถบเครื่องมือ ค้นเฉพาะ ชื่อ / นามสกุล / ชื่อเล่น เท่านั้น', () => {
  const block = SRC.match(/const matchesSearch = \(l: TourLeader\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.ok(block, 'ต้องหา matchesSearch เจอ');
  assert.ok(block.includes('[l.firstName, l.lastName, l.nickname]'), 'ต้องค้นจากสามฟิลด์นี้เท่านั้น');
  for (const dead of ['l.id', 'expSearch', 'expertiseByLeader']) {
    assert.equal(block.includes(dead), false, `ช่องค้นหาต้องไม่ค้นจาก ${dead} อีกแล้ว`);
  }
  assert.ok(SRC.includes('placeholder="ค้นหาชื่อ นามสกุล หรือชื่อเล่น"'), 'ข้อความใน Placeholder ต้องตรงกับขอบเขตที่ค้นจริง');
});

test('ตัวกรองเส้นทางที่เชี่ยวชาญ จัดกลุ่มตามประเทศ (ไม่ใช่รายการรหัสเรียงเดี่ยว)', () => {
  const block = SRC.match(/const expertiseOptions = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/)?.[0] ?? '';
  assert.ok(block, 'ต้องหา expertiseOptions เจอ');
  assert.ok(block.includes('routeGroups'), 'ต้องสร้างกลุ่มเส้นทางแยกตามประเทศ');
  assert.ok(/groups=\{expertiseOptions\.routeGroups\}/.test(SRC), 'ต้องส่งกลุ่มให้ช่องเลือกเส้นทาง');
  /* หัวข้อกลุ่มติ๊กได้ทั้งประเทศในครั้งเดียว — ชื่อประเทศต้องอยู่ในป้ายกำกับ ไม่ใช่คำว่า "หมวด" */
  const TAGS = readFileSync(new URL('../src/components/jobs/TagMultiSelect.tsx', import.meta.url), 'utf8');
  assert.ok(TAGS.includes('เลือกทุกเส้นทางของ ${g.label}'));
});

/*
  สลับแหล่งข้อมูลพีเรียดแล้ว การมอบหมายเดิมอาจอ้างถึงพีเรียดที่ไม่มีในแหล่งใหม่
  รายการพวกนี้ทำอะไรกับมันไม่ได้เลย (ไม่มีแถวงานให้กดถอด) จึงต้องมีทางเคลียร์ทั้งชุด
*/
test('เคลียร์การมอบหมายที่พีเรียดหายจากต้นทางได้ และเคลียร์เฉพาะรายการที่หายจริง', () => {
  assert.ok(SRC.includes('const orphanAssignments = useMemo('), 'ต้องแยกรายการที่พีเรียดหายออกมา');
  assert.ok(/orphanAssignments = useMemo\(\s*\(\) => affected\.filter\(\(x\) => !periodById\.has\(x\.periodId\)\)/.test(SRC),
    'ต้องคัดจากการที่ไม่มีพีเรียดในแหล่งข้อมูลปัจจุบัน ไม่ใช่จากชนิดของปัญหา');
  assert.ok(SRC.includes('เคลียร์รายการที่พีเรียดหายจากต้นทาง'), 'ต้องมีปุ่มบนแถบแจ้งเตือน');

  const fn = SRC.match(/const clearOrphanAssignments = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.ok(fn, 'ต้องหาฟังก์ชันเคลียร์เจอ');
  assert.ok(fn.includes('unassignPeriod'), 'ต้องถอดผ่าน Store ปกติ เพื่อให้มีประวัติ ไม่ลบข้อมูลตรง ๆ');
  assert.ok(fn.includes('orphanAssignments'), 'ต้องวนเฉพาะรายการที่พีเรียดหาย');
});

test('ต้องยืนยันก่อนเคลียร์ ไม่ถอดให้เองอัตโนมัติ', () => {
  assert.ok(SRC.includes('open={confirmClearOrphans}'), 'ต้องผ่านกล่องยืนยัน');
  assert.equal(/useEffect\([^)]*clearOrphanAssignments/.test(SRC), false, 'ห้ามเคลียร์อัตโนมัติตอนเปิดหน้า');
});

/*
  เดือนค่าเริ่มต้นของหน้า Schedule = เดือนปัจจุบัน + 1 เสมอ
  ต้องคิดจากวันที่จริงของเครื่องผู้ใช้ ไม่ใช่ DEMO_TODAY ที่ตรึงไว้ที่ 2026-07-13
  (ไม่งั้นเปิดหน้ากี่เดือนผ่านไปก็ค้างอยู่ที่สิงหาคม 2569 ตลอด)
*/
test('เดือนค่าเริ่มต้น = เดือนปัจจุบัน + 1 คิดจากวันที่จริง', () => {
  assert.ok(SRC.includes('nextMonthStartFromNow()'), 'ต้องใช้เดือนถัดไปจากวันที่จริง');
  const effect = SRC.match(/useEffect\(\(\) => \{[^}]*setCursor\(nextMonthStartFromNow\(\)\);[\s\S]*?\}, \[\]\);/)?.[0] ?? '';
  assert.ok(effect, 'ต้องตั้งค่าตอน mount (หน้านี้ prerender ตอน build จะคำนวณตอน render ไม่ได้)');
  assert.ok(effect.includes('[]'), 'ต้องทำครั้งเดียวตอนเปิดหน้า ไม่ทับเดือนที่ผู้ใช้เลื่อนไปเอง');
});
