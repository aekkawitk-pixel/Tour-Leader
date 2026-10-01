/**
 * หน้าต่างจัดงาน — กรองงานด้วย "ช่วงวันเดินทาง" + "ประเทศ"
 *
 * ตรวจตรรกะกับข้อมูลพีเรียดจริง และย้ำหลักการสำคัญ:
 * ช่วงวันที่ที่เลือกเป็นเพียงเงื่อนไข "ค้นหา" — วันแสดงงานจริงมาจากวันเดินทางของโปรแกรม
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTourPeriods, getAssignablePeriods } from '@/services/tourPeriodMaster';
import { endOfMonth, startOfMonth } from '@/lib/format';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

const SRC = readFileSync(new URL('../src/components/jobs/GuideScheduleTimeline.tsx', import.meta.url), 'utf8');

/** ตรรกะเดียวกับ departsWithin + ตัวกรองประเทศใน Component */
const departsWithin = (p: TourPeriodMaster, s: string, e: string) => p.startDate >= s && p.startDate <= e;
const matchCountry = (p: TourPeriodMaster, picked: string[]) => picked.length === 0 || picked.includes(p.countryName);

const ALL = getTourPeriods();
const ASSIGNABLE = getAssignablePeriods();
const MONTH = '2026-08-01';
const MONTH_END = endOfMonth(MONTH);

describe('กรองตามช่วงวันเดินทาง', () => {
  test('แสดงเฉพาะงานที่ dep_date อยู่ในช่วง (รวมวันหัวและวันท้าย)', () => {
    const got = ALL.filter((p) => departsWithin(p, '2026-08-01', '2026-08-05'));
    assert.ok(got.length > 0);
    assert.ok(got.every((p) => p.startDate >= '2026-08-01' && p.startDate <= '2026-08-05'));
    // วันหัว/วันท้ายต้องรวมอยู่ด้วย
    for (const edge of ['2026-08-01', '2026-08-05']) {
      const onEdge = ALL.filter((p) => p.startDate === edge);
      if (onEdge.length) assert.ok(got.some((g) => g.internalId === onEdge[0].internalId), `ต้องรวมงานวันที่ ${edge}`);
    }
  });

  test('ช่วงวันเดียว (วันที่ที่คลิก) = งานที่ออกเดินทางวันนั้น', () => {
    const day = ALL.map((p) => p.startDate).sort()[Math.floor(ALL.length / 2)];
    const got = ALL.filter((p) => departsWithin(p, day, day));
    assert.ok(got.length > 0);
    assert.ok(got.every((p) => p.startDate === day));
  });

  test('เปลี่ยนช่วงวันที่ → ได้คนละชุด ไม่ปนกัน', () => {
    const a = ALL.filter((p) => departsWithin(p, '2026-08-01', '2026-08-05')).map((p) => p.internalId);
    const b = ALL.filter((p) => departsWithin(p, '2026-08-20', '2026-08-25')).map((p) => p.internalId);
    assert.ok(a.length > 0 && b.length > 0);
    assert.equal(a.some((id) => b.includes(id)), false);
  });

  test('ไม่แสดงงานที่ออกเดินทางก่อนหรือหลังช่วงที่เลือก', () => {
    const got = ALL.filter((p) => departsWithin(p, '2026-08-10', '2026-08-12'));
    assert.equal(got.some((p) => p.startDate < '2026-08-10' || p.startDate > '2026-08-12'), false);
  });
});

describe('กรองตามประเทศ (เลือกได้หลายรายการ)', () => {
  test('ไม่เลือกประเทศ = ทุกประเทศ', () => {
    assert.equal(ALL.filter((p) => matchCountry(p, [])).length, ALL.length);
  });

  test('เลือกประเทศเดียว = เฉพาะประเทศนั้น', () => {
    const c = ASSIGNABLE[0].countryName;
    const got = ASSIGNABLE.filter((p) => matchCountry(p, [c]));
    assert.ok(got.length > 0);
    assert.ok(got.every((p) => p.countryName === c));
  });

  test('เลือกหลายประเทศ = อยู่ในประเทศใดประเทศหนึ่ง และได้ผลมากกว่าเลือกเดียว', () => {
    const list = [...new Set(ASSIGNABLE.map((p) => p.countryName))];
    const [c1, c2] = list;
    const one = ASSIGNABLE.filter((p) => matchCountry(p, [c1]));
    const two = ASSIGNABLE.filter((p) => matchCountry(p, [c1, c2]));
    assert.ok(two.length > one.length);
    assert.ok(two.every((p) => p.countryName === c1 || p.countryName === c2));
  });

  test('รายชื่อประเทศมาจากข้อมูลจริงใน Master (ไม่ Hardcode)', () => {
    const options = [...new Set(ASSIGNABLE.map((p) => p.countryName).filter(Boolean))];
    assert.ok(options.length > 1, 'ต้องมีมากกว่า 1 ประเทศให้เลือก');
    assert.ok(SRC.includes('getAssignablePeriods().map((p) => p.countryName)'), 'ต้องดึงจาก Master');
  });
});

describe('ค้นหา Group Code / ชื่อโปรแกรม', () => {
  /** ตรรกะเดียวกับ matchesQuery ใน Component */
  const squash = (v: string) => v.toLowerCase().replace(/[\s-]/g, '');
  const match = (p: TourPeriodMaster, q: string) => {
    const t = q.trim();
    if (!t) return true;
    const fields = [p.groupCode, p.displayName, p.programCode ?? ''];
    return fields.some((f) => f.toLowerCase().includes(t.toLowerCase()) || squash(f).includes(squash(t)));
  };
  const P = ASSIGNABLE[0];

  test('คำค้นว่าง = ไม่กรอง', () => {
    assert.equal(ASSIGNABLE.filter((p) => match(p, '')).length, ASSIGNABLE.length);
    assert.equal(ASSIGNABLE.filter((p) => match(p, '   ')).length, ASSIGNABLE.length);
  });

  test('AC2 ค้นจากบางส่วนของ Group Code ได้', () => {
    const part = P.groupCode.slice(0, 7);
    const got = ASSIGNABLE.filter((p) => match(p, part));
    assert.ok(got.length > 0);
    assert.ok(got.some((p) => p.internalId === P.internalId));
    assert.ok(got.every((p) => squash(`${p.groupCode}${p.displayName}${p.programCode ?? ''}`).includes(squash(part))));
  });

  test('ข้อ1 ไม่แยกตัวพิมพ์เล็ก–ใหญ่', () => {
    const n = ASSIGNABLE.filter((p) => match(p, P.groupCode)).length;
    assert.equal(ASSIGNABLE.filter((p) => match(p, P.groupCode.toLowerCase())).length, n);
    assert.equal(ASSIGNABLE.filter((p) => match(p, P.groupCode.toUpperCase())).length, n);
  });

  test('ข้อ3 พิมพ์ Group Code โดยมีหรือไม่มีขีดก็เจอ', () => {
    assert.ok(ASSIGNABLE.filter((p) => match(p, P.groupCode.replace(/-/g, ''))).some((p) => p.internalId === P.internalId));
  });

  test('ข้อ4 ตัดช่องว่างหน้า–หลังอัตโนมัติ', () => {
    assert.ok(ASSIGNABLE.filter((p) => match(p, `   ${P.groupCode}   `)).some((p) => p.internalId === P.internalId));
  });

  test('AC3 ค้นชื่อโปรแกรม (ไทย) และ Program Code ได้', () => {
    const thai = (P.displayName.match(/[ก-๙]{4,}/) ?? [])[0];
    assert.ok(thai, 'ชื่อโปรแกรมต้องมีคำภาษาไทยให้ทดสอบ');
    assert.ok(ASSIGNABLE.filter((p) => match(p, thai)).some((p) => p.internalId === P.internalId));
    if (P.programCode) {
      assert.ok(ASSIGNABLE.filter((p) => match(p, P.programCode!.slice(0, 6))).some((p) => p.internalId === P.internalId));
    }
  });

  test('AC4/AC5 ค้นหาทำงานร่วมกับช่วงวันที่ ประเทศ และไม่มี NO SELL', () => {
    const picked = [P.countryName];
    const got = ASSIGNABLE
      .filter((p) => departsWithin(p, P.startDate, P.startDate))
      .filter((p) => matchCountry(p, picked))
      .filter((p) => match(p, P.groupCode.slice(0, 5)));
    assert.ok(got.length > 0);
    assert.ok(got.every((p) => p.startDate === P.startDate && p.countryName === P.countryName));
    assert.equal(got.some((p) => p.saleStatus === 'NO_SELL'), false);
  });

  test('ค้นจากฟิลด์จริงของ Master ไม่ใช่ข้อความบนหน้าจอ', () => {
    // ตัวกรองย้ายไปอยู่ที่เดียว เพราะหน้าต่างจัดเจ้าหน้าที่ส่งกรุ๊ปต้องค้นเจอกรุ๊ปเดียวกัน
    const FILTER = readFileSync(new URL('../src/lib/logic/periodFilter.ts', import.meta.url), 'utf8');
    assert.ok(FILTER.includes('const fields = [p.groupCode, p.displayName, p.programCode'));
    assert.ok(FILTER.includes('export function matchesQuery('));
    assert.ok(SRC.includes("from '@/lib/logic/periodFilter'"), 'ตารางหัวหน้าทัวร์ต้องใช้ตัวกรองชุดเดียวกัน');
  });

  test('AC8 คำค้นหาไม่ค้างเมื่อเปิด Modal ใหม่', () => {
    assert.ok(SRC.includes('key={`${addTarget.leader.id}-${addTarget.date}`}'), 'ต้อง remount เมื่อเปิดใหม่');
  });

  test('มี debounce และกด Enter ค้นทันที', () => {
    assert.ok(/setTimeout\(\(\) => setQuery\(queryInput\.trim\(\)\), 3\d\d\)/.test(SRC), 'ต้อง debounce ~300–500ms');
    assert.ok(SRC.includes("if (e.key === 'Enter')"), 'Enter ต้องค้นทันที');
  });
});

describe('เงื่อนไขรวม + ขอบเขตเดือน', () => {
  test('§9 ช่วงวันที่ + ประเทศ + ไม่ NO SELL ทำงานพร้อมกัน', () => {
    const picked = [...new Set(ASSIGNABLE.map((p) => p.countryName))].slice(0, 2);
    const got = ASSIGNABLE
      .filter((p) => departsWithin(p, '2026-08-01', '2026-08-05'))
      .filter((p) => matchCountry(p, picked));
    assert.ok(got.length > 0);
    assert.ok(got.every((p) => picked.includes(p.countryName)));
    assert.ok(got.every((p) => p.startDate >= '2026-08-01' && p.startDate <= '2026-08-05'));
    assert.equal(got.some((p) => p.saleStatus === 'NO_SELL'), false);
  });

  test('AC11 โปรแกรม NO SELL ไม่อยู่ในรายการที่เลือกจัดได้', () => {
    const noSell = ALL.filter((p) => p.saleStatus === 'NO_SELL');
    assert.ok(noSell.length > 0, 'ข้อมูลจริงต้องมี NO SELL ให้ทดสอบ');
    const ids = new Set(ASSIGNABLE.map((p) => p.internalId));
    assert.equal(noSell.some((p) => ids.has(p.internalId)), false);
  });

  test('AC7/AC8 ขอบเขตวันที่ = เดือนที่กำลังเปิดใน Schedule', () => {
    assert.equal(startOfMonth('2026-08-15'), MONTH);
    assert.equal(MONTH_END, '2026-08-31');
    assert.ok(SRC.includes('monthStart={monthStart} monthEnd={monthEnd}'), 'ต้องส่งขอบเขตเดือนที่เปิดอยู่ให้ Modal');
    assert.ok(SRC.includes('min={monthStart} max={monthEnd}'), 'ช่องวันที่เริ่มต้องจำกัดขอบเขต');
    assert.ok(SRC.includes('max={monthEnd}'), 'ช่องวันที่สิ้นสุดต้องจำกัดถึงวันสุดท้ายของเดือน');
  });

  test('§5 ข้อความ Validation ครบตามที่กำหนด', () => {
    assert.ok(SRC.includes('กรุณาเลือกช่วงวันที่ภายในเดือน'));
    assert.ok(SRC.includes('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'));
  });
});

describe('โครงสร้าง Modal', () => {
  test('AC4 ไม่มี Dropdown "ค้นหางานตาม" เหลืออยู่', () => {
    assert.equal(SRC.includes('ค้นหางานตาม'), false);
    for (const dead of ['DateFilterMode', 'DATE_FILTER_MODES', 'matchesDateFilter']) {
      assert.equal(SRC.includes(dead), false, `ยังเหลือ ${dead}`);
    }
  });

  test('AC6 ค่าเริ่มต้นของช่วงวันที่ = วันที่ที่คลิก ทั้งวันเริ่มและวันสิ้นสุด', () => {
    assert.ok(SRC.includes('useState(date)'), 'วันเริ่มต้องเป็นวันที่คลิก');
    assert.match(SRC, /const \[to, setTo\] = useState\(date\)/, 'วันสิ้นสุดต้องเป็นวันที่คลิกด้วย');
  });

  test('AC10 นำช่องหมายเหตุการมอบหมายออกทั้งหมด', () => {
    for (const s of ['หมายเหตุการมอบหมาย', 'ลูกค้าขอหัวหน้าทัวร์คนนี้']) {
      assert.equal(SRC.includes(s), false, `ยังเหลือ "${s}"`);
    }
    // ตรวจเฉพาะภายใน AddAssignmentPanel — "หมายเหตุการถอด" ของหน้าต่างถอดหัวหน้าทัวร์เป็นคนละช่องและต้องคงไว้
    /* รองรับทั้ง LF และ CRLF — ไฟล์ในเครื่อง Windows ถูก autocrlf แปลงเป็น CRLF ได้ */
    const panel = SRC.match(/function AddAssignmentPanel[\s\S]*?\r?\n}\r?\n/)?.[0] ?? '';
    assert.ok(panel, 'ต้องหา AddAssignmentPanel เจอ');
    assert.equal(/setNote/.test(panel), false, 'ยังเหลือ state ของหมายเหตุในหน้าต่างจัดงาน');
    assert.ok(SRC.includes('หมายเหตุการถอด'), 'หมายเหตุของหน้าต่างถอดหัวหน้าทัวร์ต้องยังอยู่');
  });

  test('§8 หัวข้อสั้น + บรรทัดสรุปเงื่อนไข', () => {
    assert.ok(SRC.includes('>งานที่ยังไม่ระบุหัวหน้าทัวร์</p>'));
    assert.ok(SRC.includes('พบ {candidates.length} รายการ'));
    assert.ok(SRC.includes('โปรแกรม NO SELL ไม่ถูกนำมาแสดง'));
  });

  test('§10 Empty State พร้อมทางออก', () => {
    /* ทางออกเรื่องช่วงวันที่ตอนนี้คือปุ่ม/ช่องติ๊ก "แสดงทั้งเดือน" (เดิมเป็น "เปลี่ยนช่วงวันที่ (ทั้งเดือน)") */
    for (const s of ['ไม่พบงานที่ยังไม่ระบุหัวหน้าทัวร์', 'เลือกทุกประเทศ', 'แสดงทั้งเดือน']) {
      assert.ok(SRC.includes(s), `Empty State ต้องมี "${s}"`);
    }
  });

  test('§13 วันที่ที่ใช้กรองไม่ใช่วันของ Assignment', () => {
    assert.ok(SRC.includes('start: p.startDate, end: p.endDate'), 'แถบงานต้องใช้วันเดินทางจาก Master');
    assert.ok(SRC.includes('checkPeriodConflict('), 'ต้องตรวจเวลาทับซ้อนทั้งช่วงก่อนบันทึก');
  });
});
