/**
 * ปฏิทินงานต้องสื่อสถานะการจัดตรงกับที่ผู้จัดตั้งไว้ในหน้าจัดสเก็ต
 *
 * เดิมปฏิทินย่อทุกอย่างเหลือ "จัดแล้ว/ยังไม่จัด" งานที่ยัง "รอคอนเฟิร์ม"
 * จึงขึ้นสีเขียวเหมือนคอนเฟิร์มแล้ว หัวหน้าทัวร์เปิดดูแล้วเข้าใจผิดว่าเรียบร้อย
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD_STATUS, BOARD_STATUS_ORDER, boardStatusFromAssignment } from '../src/lib/logic/guideBoard';

const SRC = readFileSync(new URL('../src/app/calendar/page.tsx', import.meta.url), 'utf8');

describe('สีและป้ายบนปฏิทิน', () => {
  test('ใช้ชุดสถานะกลางเดียวกับหน้าจัดสเก็ต ไม่นิยามสีเองซ้ำ', () => {
    assert.ok(SRC.includes("from '@/lib/logic/guideBoard'"), 'ต้อง import จากตรรกะกลาง');
    assert.ok(SRC.includes('boardStatusFromAssignment('), 'ต้องอ่านสถานะจริงจาก Assignment');
    assert.ok(SRC.includes('BOARD_STATUS[status].label') || SRC.includes('BOARD_STATUS[boardStatusFromAssignment'),
      'ป้ายต้องมาจาก Mapping กลาง');
  });

  test('ไม่เหลือการย่อสถานะเป็นแค่ จัดแล้ว/ยังไม่จัด', () => {
    assert.equal(SRC.includes('ASSIGN_CHIP'), false, 'ต้องไม่เหลือชุดสีแบบสองสถานะ');
    assert.equal(/leader \? ASSIGN_CHIP/.test(SRC), false);
  });

  test('ทุกสถานะกลางยังมีสีไอคอนของตัวเอง ครบทุกสถานะ', () => {
    // ปฏิทินเลิกใช้ Legend คำอธิบายสีแยกแล้ว (พื้นหลัง Event ไม่ไล่สีตามสถานะอีกต่อไป — ดูคอมเมนต์เหนือ
    // STATUS_ICON_COLOR) เหลือแค่ไอคอนที่ไล่สีตามสถานะจริง จึงต้องตรวจที่ตาราง STATUS_ICON_COLOR แทน Legend
    assert.ok(SRC.includes('STATUS_ICON_COLOR: Record<keyof typeof BOARD_STATUS, string>'),
      'ต้องมีตารางสีไอคอนตามสถานะ ผูกชนิดกับ BOARD_STATUS ให้ตกหล่นไม่ได้');
    assert.equal(BOARD_STATUS_ORDER.length, 5);
  });

  test('ไม่ฝังชุดสีของสถานะไว้ในหน้าปฏิทินเอง', () => {
    for (const st of BOARD_STATUS_ORDER) {
      assert.equal(SRC.includes(BOARD_STATUS[st].bar), false, `ห้ามฝังสีของ ${st} ไว้ในหน้าปฏิทิน`);
    }
  });
});

describe('การแปลงสถานะ Assignment', () => {
  test('รอคอนเฟิร์มต้องไม่กลายเป็นคอนเฟิร์มแล้ว', () => {
    assert.equal(boardStatusFromAssignment('PENDING_CONFIRMATION'), 'PENDING_CONFIRMATION');
    assert.equal(BOARD_STATUS.PENDING_CONFIRMATION.label, 'รอคอนเฟิร์ม');
    assert.notEqual(BOARD_STATUS.PENDING_CONFIRMATION.bar, BOARD_STATUS.CONFIRMED.bar, 'สองสถานะนี้ต้องคนละสี');
  });

  test('ไม่มี Assignment = ยังไม่ระบุ', () => {
    assert.equal(boardStatusFromAssignment(undefined), 'UNASSIGNED');
    assert.equal(boardStatusFromAssignment(null), 'UNASSIGNED');
  });

  test('สถานะที่ต้องลงมือทำต่อ ต้องแยกสีออกจากกันทั้งหมด', () => {
    const bars = new Set(BOARD_STATUS_ORDER.map((s) => BOARD_STATUS[s].bar));
    assert.equal(bars.size, BOARD_STATUS_ORDER.length, 'ทุกสถานะต้องมีสีไม่ซ้ำกัน');
  });
});

/* ---------------- หัวหน้าทัวร์ตอบรับ/ปฏิเสธงานของตัวเอง ---------------- */

describe('ปฏิทินไม่มีขั้นตอบรับงาน', () => {
  // ผู้จัดมอบหมายงาน = คอนเฟิร์มทันที — ไม่มีปุ่มให้หัวหน้าทัวร์ยืนยันรับ/ปฏิเสธงานอีก
  test('ไม่มีปุ่มยืนยันรับงานหรือปฏิเสธงาน', () => {
    assert.equal(SRC.includes('ยืนยันรับงาน'), false);
    assert.equal(SRC.includes('ปฏิเสธงาน'), false);
  });

  test('ปฏิทินไม่เปลี่ยนสถานะการจัดงานเอง', () => {
    assert.equal(SRC.includes('setAssignmentStatus('), false);
  });
});

/* ---------------- สลับมุมมองต้องอยู่ช่วงเวลาเดิม ---------------- */

describe('สลับมุมมองปฏิทิน', () => {
  const start = SRC.indexOf('const changeView = (next: View)');
  const fn = start < 0 ? '' : SRC.slice(start, SRC.indexOf('\n  };', start));

  test('มีตัวจัดการสลับมุมมองของตัวเอง ไม่ได้ต่อ setView ตรง ๆ', () => {
    assert.ok(fn, 'ต้องหา changeView เจอ');
    assert.ok(SRC.includes('onChange={changeView}'), 'ปุ่มเลือกมุมมองต้องเรียกผ่าน changeView');
    assert.equal(SRC.includes('onChange={setView}'), false, 'ต้องไม่ต่อ setView ตรง ๆ อีก');
  });

  test('เข้ามุมมองสัปดาห์ ต้องยึดตามเดือนที่กำลังดูอยู่', () => {
    assert.ok(fn.includes("next === 'week'"), 'ต้องแยกกรณีเข้ามุมมองสัปดาห์');
    assert.ok(fn.includes('setWeekAnchor(monthStartISO)'), 'ต้องเลื่อนสัปดาห์ไปที่เดือนที่เลือก');
  });

  test('กลับมุมมองเดือน ต้องตามเดือนของสัปดาห์ที่ดูอยู่', () => {
    assert.ok(fn.includes("next === 'month' && view === 'week'"), 'ต้องแยกกรณีกลับจากสัปดาห์');
    assert.ok(fn.includes('setCursor('), 'ต้องเลื่อนเดือนตามสัปดาห์ที่ดูอยู่');
  });

  test('อยู่เดือนเดียวกันอยู่แล้วต้องไม่ขยับ — กันการรีเซ็ตสัปดาห์ที่ผู้ใช้เลื่อนไว้', () => {
    assert.ok(fn.includes("weekAnchor.slice(0, 7) !== monthStartISO.slice(0, 7)"),
      'ต้องเทียบเดือนก่อนตัดสินใจขยับ');
  });

  test('เดือนที่ใช้ยึดคำนวณจาก cursor ปัจจุบัน ไม่ใช่ค่าตั้งต้นของหน้า', () => {
    assert.ok(SRC.includes('const monthStartISO = `${cursor.year}-${String(cursor.month + 1).padStart(2, \'0\')}-01`;'),
      'ต้องคิดจาก cursor ที่ผู้ใช้เลื่อนไว้');
  });
});

/*
  ทุกมุมมองต้องพูดถึงช่วงเวลาเดียวกัน

  เดิมมุมมองรายการข้ามการกรองช่วงทั้งหมด (คืน masterFiltered ตรง ๆ)
  เลือกเดือนกันยายนไว้แล้วกดรายการ จึงเห็นทั้ง 1,969 พีเรียดเริ่มจากเดือนสิงหาคม
*/
describe('ทุกมุมมองใช้ช่วงเวลาเดียวกัน', () => {
  test('ไม่มีมุมมองไหนข้ามการกรองช่วง', () => {
    assert.equal(SRC.includes("if (view === 'list') return masterFiltered;"), false,
      'มุมมองรายการต้องไม่คืนข้อมูลทั้งหมดโดยข้ามช่วงที่เลือก');
    assert.equal(SRC.includes("if (view === 'list') return listPeriods;"), false,
      'ชุดที่แสดงต้องคิดจากช่วงเดียวกันทุกมุมมอง');
  });

  test('รายการเรียงจากชุดที่อยู่ในช่วงที่เลือก ไม่ใช่จากทั้งหมด', () => {
    const start = SRC.indexOf('const listPeriods = useMemo(');
    const fn = start < 0 ? '' : SRC.slice(start, SRC.indexOf(');', start));
    assert.ok(fn, 'ต้องหา listPeriods เจอ');
    assert.ok(fn.includes('visiblePeriods'), 'ต้องเรียงจากชุดที่แสดงจริง');
    assert.equal(fn.includes('[...filtered]'), false, 'ต้องไม่เรียงจากชุดทั้งหมด');
  });

  test('มุมมองสัปดาห์ใช้ช่วงสัปดาห์ · ที่เหลือใช้ช่วงเดือน', () => {
    assert.ok(SRC.includes("const cells = view === 'week' ? weekCells : monthCells;"),
      'ต้องเลือกช่วงจากมุมมองเดียวกันทุกที่');
  });

  test('หัวข้อบอกช่วงเวลาจริงทุกมุมมอง ไม่มี "พีเรียดทั้งหมด" ที่ขัดกับเดือนที่เลือก', () => {
    assert.equal(SRC.includes("'พีเรียดทั้งหมด'"), false);
    assert.equal(SRC.includes("view === 'list' ? 'ทั้งหมด'"), false, 'ป้ายจำนวนต้องไม่บอกว่าทั้งหมด');
  });

  test('แถบแจ้งผลที่อยู่นอกช่วง ใช้กับมุมมองรายการด้วย', () => {
    assert.equal(SRC.includes("if (view === 'list' || filtered.length === 0) return null;"), false,
      'มุมมองรายการก็ต้องเตือนเมื่อผลค้นหาอยู่นอกช่วงที่แสดง');
  });
});

/*
  แถบเลื่อนต้องมีชั้นเดียว

  เดิมมุมมองตารางมีกล่องเลื่อนแนวตั้งของตัวเอง พร้อมกับที่หน้าเว็บก็เลื่อนได้
  กลายเป็นแถบเลื่อนสองชั้น ผู้ใช้ต้องเดาว่ากำลังเลื่อนอันไหนอยู่
*/
describe('แถบเลื่อนของปฏิทิน', () => {
  test('มุมมองตารางไม่มีกล่องเลื่อนแนวตั้งซ้อนในหน้า', () => {
    assert.equal(SRC.includes("maxHeight: 'calc(100vh - 13rem)'"), false,
      'ต้องไม่จำกัดความสูงจนเกิดกล่องเลื่อนของตัวเอง');
    assert.equal(SRC.includes('overflow-x-hidden overflow-y-auto'), false,
      'ต้องไม่เปิดการเลื่อนแนวตั้งในกล่องตาราง');
  });

  test('Card คลิปเฉพาะแนวนอน เพื่อให้ sticky ตามหน้าเว็บทำงานได้', () => {
    assert.ok(SRC.includes('className="overflow-x-clip"'), 'ต้องคลิปเฉพาะแนวนอน');
    assert.equal(SRC.includes('className="overflow-hidden"'), false,
      'overflow-hidden ตัด sticky ตามหน้าเว็บ จึงต้องมีกล่องเลื่อนซ้อน');
  });

  test('หัววันที่เกาะใต้แถบด้านบนของแอป ไม่ใช่ top-0 ที่จะถูกบัง', () => {
    assert.ok(SRC.includes('APP_HEADER_H'), 'ต้องเว้นระยะเท่าความสูงแถบด้านบน');
    assert.equal(/className="sticky top-0 z-20 grid/.test(SRC), false, 'ต้องไม่เกาะขอบบนสุดของหน้า');
  });
});

/*
  เลื่อนดูตารางยาว ๆ แล้วต้องยังเห็นว่าดูเดือนไหนอยู่และสลับมุมมองได้
  ไม่ใช่เหลือแต่แถวเลขวันที่ลอยอยู่
*/
describe('แถบเดือน/มุมมอง ติดค้างตอนเลื่อน', () => {
  test('แถบเดือน/จำนวน/ปุ่มมุมมอง กับแถวเลขวันที่ อยู่ในกล่อง sticky เดียวกัน', () => {
    assert.ok(SRC.includes('<div className="sticky z-30 zego-surface-bg" style={{ top: APP_HEADER_H }}>'),
      'ต้องมีกล่อง sticky อันเดียวครอบทั้งสองส่วน');
    assert.ok(SRC.includes("{view === 'timeline' && listPeriods.length > 0 && timelineDays.length > 0 && ("),
      'แถวเลขวันที่ต้องอยู่ในกล่องนั้น และแสดงเฉพาะมุมมองตาราง');
  });

  test('ไม่วัดความสูงด้วย JS อีกแล้ว — ค่าที่วัดค้างได้ ทำให้แถวเลขวันที่ไปซ่อนใต้แถบ', () => {
    assert.equal(SRC.includes('toolbarH'), false, 'ต้องไม่เหลือการคำนวณตำแหน่งจากความสูงที่วัด');
    assert.equal(SRC.includes('toolbarRef'), false);
    assert.equal(SRC.includes('ResizeObserver'), false);
  });

  test('เกาะใต้แถบด้านบนของแอป โดยอ้างค่าคงที่จุดเดียว', () => {
    assert.ok(SRC.includes('const APP_HEADER_H = 66;'));
    assert.ok(SRC.includes('style={{ top: APP_HEADER_H }}'));
  });

  test('แถวเลขวันที่ไม่ sticky ซ้อนอีกชั้น — เลื่อนไปพร้อมกล่องเดียวกัน', () => {
    assert.equal(SRC.includes('className="sticky z-20 grid'), false,
      'ต้องไม่ sticky แยกอีกตัว ไม่งั้นต้องคำนวณระยะเกาะเองอีก');
  });
});
