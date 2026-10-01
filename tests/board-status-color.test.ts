/**
 * สีบ่งบอก "สถานะการจัดหัวหน้าทัวร์" — Mapping กลางชุดเดียวของทั้งระบบ
 *
 * ครอบคลุมทั้ง 5 สถานะ (หน้าจอไล่คลิกได้ไม่ครบทุกสถานะ จึงตรวจที่ตรรกะให้ครบที่นี่)
 * และกันการถดถอยที่เคยทำให้ "สีไม่ขึ้น": class ประกอบเป็น string · สีกระจายอยู่หลาย Component
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOARD_STATUS, BOARD_STATUS_ORDER, boardStatusMeta, normalizeBoardStatus, type BoardStatus,
} from '../src/lib/logic/guideBoard';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const TIMELINE = read('../src/components/jobs/GuideScheduleTimeline.tsx');
const CALENDAR = read('../src/components/jobs/LeaderScheduleCalendar.tsx');
const OVERRIDES = read('../src/styles/zego-overrides.css');

/*
  ตั้งแต่ปรับไปใช้ zego-design-system — .bar ไม่ใช่ Tailwind class แบบ `bg-emerald-100` ประกอบสด ๆ
  แล้ว แต่เป็น class ความหมาย 'zego-status-bar zego-status-bar--<โทน>' ที่ผูกสี/กรอบ/ตัวหนังสือ
  ไว้ในไฟล์ CSS (src/styles/zego-overrides.css) — toneOf ดึงเฉพาะส่วนโทนท้าย class มาตรวจแทน
*/
const toneOf = (s: BoardStatus) => BOARD_STATUS[s].bar.match(/zego-status-bar--(\w+)/)?.[1];

test('ครบทั้ง 5 สถานะ และแต่ละสถานะได้โทนสีคนละโทน', () => {
  const tones = BOARD_STATUS_ORDER.map(toneOf);
  assert.equal(tones.length, 5);
  assert.equal(new Set(tones).size, 5, `โทนซ้ำกัน: ${tones.join(', ')}`);
});

test('สีตรงตามที่กำหนด — เขียว/เหลือง/ส้ม/แดง/เทา', () => {
  assert.equal(toneOf('CONFIRMED'), 'success');           // AC1 คอนเฟิร์มแล้ว = เขียว
  assert.equal(toneOf('PENDING_CONFIRMATION'), 'warning'); // AC2 รอคอนเฟิร์ม = เหลือง
  assert.equal(toneOf('REASSIGN_REQUIRED'), 'orange');     // AC3 ต้องเปลี่ยน = ส้ม
  assert.equal(toneOf('DECLINED'), 'danger');               // AC4 ปฏิเสธ = แดง
  assert.equal(toneOf('UNASSIGNED'), 'slate');              // AC5 ยังไม่ระบุ = เทา
});

test('ทุกสถานะมีสีพื้น + เส้นขอบซ้าย + สีอักษร ครบ (นิยามไว้ใน zego-overrides.css)', () => {
  for (const s of BOARD_STATUS_ORDER) {
    const tone = toneOf(s);
    assert.ok(tone, `${s} ต้องมีโทนสี`);
    const rule = OVERRIDES.match(new RegExp(`\\.zego-status-bar--${tone}\\{([^}]+)\\}`));
    assert.ok(rule, `ต้องมีนิยาม .zego-status-bar--${tone} ใน zego-overrides.css`);
    assert.match(rule![1], /background:/, `${s} ต้องมีสีพื้น`);
    assert.match(rule![1], /border-left-color:/, `${s} ต้องมีเส้นขอบซ้ายเห็นชัด`);
    assert.match(rule![1], /color:/, `${s} ต้องมีสีอักษร`);
    assert.ok(BOARD_STATUS[s].label, `${s} ต้องมี label`);
  }
});

test('class เขียนเต็มคำแบบคงที่ ไม่ประกอบเป็น string (Tailwind ต้อง generate ได้ตอน build)', () => {
  // ตัดคอมเมนต์ออกก่อน — ตัวอย่างที่ "ห้ามเขียน" ถูกอธิบายไว้ในคอมเมนต์ของไฟล์นั้นเอง
  const code = read('../src/lib/logic/guideBoard.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.equal(/\b(bg|text|ring|border|zego-status-bar)-\$\{/.test(code), false, 'ห้ามใช้ class แบบ dynamic string');
  for (const s of BOARD_STATUS_ORDER) {
    for (const cls of BOARD_STATUS[s].bar.split(' ')) {
      assert.equal(cls.includes('${'), false, `${cls} ต้องเป็น class คงที่`);
    }
  }
});

test('normalize รับค่าได้หลายรูปแบบ — ตัวพิมพ์ / snake_case / ภาษาไทย', () => {
  for (const v of ['CONFIRMED', 'confirmed', ' Confirmed ', 'confirm', 'accepted', 'คอนเฟิร์มแล้ว']) {
    assert.equal(normalizeBoardStatus(v), 'CONFIRMED', `${v} ต้องได้ CONFIRMED`);
  }
  for (const v of ['pending', 'pending_confirmation', 'offered', 'รอคอนเฟิร์ม']) {
    assert.equal(normalizeBoardStatus(v), 'PENDING_CONFIRMATION');
  }
  for (const v of ['need_replacement', 'replacement_required', 'REASSIGN_REQUIRED', 'ต้องเปลี่ยนหัวหน้าทัวร์']) {
    assert.equal(normalizeBoardStatus(v), 'REASSIGN_REQUIRED');
  }
  for (const v of ['rejected', 'reject', 'DECLINED', 'ปฏิเสธ']) {
    assert.equal(normalizeBoardStatus(v), 'DECLINED');
  }
});

test('ค่าที่ไม่รู้จัก/ว่าง ต้องได้สีเทา "ยังไม่ระบุ" — ห้ามกลายเป็นไม่มีสี', () => {
  for (const v of [null, undefined, '', '   ', 'อะไรก็ไม่รู้', 42, {}, NaN]) {
    assert.equal(normalizeBoardStatus(v), 'UNASSIGNED', `${String(v)} ต้องตกเป็น UNASSIGNED`);
    const meta = boardStatusMeta(v);
    assert.ok(meta?.bar, 'ต้องได้สีเสมอ ไม่เป็น undefined');
    assert.match(meta.bar, /zego-status-bar--slate/, 'ค่าที่ไม่รู้จักต้องได้โทนเทาของ "ยังไม่ระบุ"');
  }
});

test('boardStatusMeta คืนค่าตรงกับ BOARD_STATUS เสมอ', () => {
  for (const s of BOARD_STATUS_ORDER) assert.deepEqual(boardStatusMeta(s), BOARD_STATUS[s]);
});

test('หน้า Schedule ใช้ Mapping กลาง ไม่นิยามสีสถานะเอง', () => {
  assert.ok(TIMELINE.includes('boardStatusMeta(e.board).bar'), 'แถบงานต้องใช้ Mapping กลาง');
  // ห้ามคัดลอก "ชุดสีของสถานะ" มาเขียนซ้ำใน Component (สีเดี่ยว ๆ เช่น badge เตือน ใช้ได้)
  for (const s of BOARD_STATUS_ORDER) {
    assert.equal(TIMELINE.includes(BOARD_STATUS[s].bar), false,
      `ห้ามฝังชุดสีของสถานะ ${s} ไว้ในไฟล์ Component`);
  }
});

test('ปฏิทินรายบุคคลใช้สีชุดเดียวกับหน้า Schedule (ไม่ใช่สีฟ้ารวมทุกสถานะ)', () => {
  assert.ok(CALENDAR.includes('boardStatusMeta('), 'ต้องอ่านสีจาก Mapping กลาง');
  assert.equal(CALENDAR.includes("job: { chip: 'bg-blue-100"), false,
    'งานทัวร์ต้องไม่ถูกระบายสีเดียวโดยไม่สนสถานะ');
});

test('AC12 สีความพร้อมรับงาน (ลา/ติดงานบริษัท/ไม่พร้อม) ไม่ชนกับสีสถานะการจัด', () => {
  // ชุดสีความพร้อมในตาราง Schedule กำหนดด้วย gradient สีพื้นหลังโดยตรง (LEAVE_BG)
  // แยกระบบกับสีสถานะการจัด (BOARD_STATUS ใช้ class zego-status-bar--*) อยู่แล้วโดยธรรมชาติ —
  // ตรวจว่าไม่มีการปนกันข้ามระบบ (เผลออ้าง class ของอีกระบบ) แทนการเทียบค่าสีเดิม
  const leaveBg = TIMELINE.match(/const LEAVE_BG[^;]+;/)?.[0] ?? '';
  assert.ok(leaveBg, 'ต้องมีชุดสีความพร้อมแยกต่างหาก');
  assert.equal(leaveBg.includes('zego-status-bar'), false, 'ชุดสีความพร้อมต้องไม่ปนกับ class ของสีสถานะการจัด');
});
