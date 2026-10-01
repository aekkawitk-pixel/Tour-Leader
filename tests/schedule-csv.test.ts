/**
 * ตรวจสอบการนำเข้าพีเรียดจริงจากไฟล์ CSV (Query All Period Aug To Sep 2026) — npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { getRawPeriods, getSchedulePeriods } from '@/data/schedule/source';
import { getSaleStatus } from '@/data/schedule/saleStatus';
import { splitTourName, airlineFromTourCode, getPeriodStatus, resolvePeriodStatus } from '@/data/schedule/normalize';
import { validateSchedulePeriods } from '@/data/schedule/validate';
import { buildTourPeriodMaster } from '@/data/schedule/master';

describe('Schedule CSV import', () => {
  test('มี 642 พีเรียด · tourCode ไม่ซ้ำ', () => {
    const rows = getRawPeriods();
    assert.equal(rows.length, 642);
    assert.equal(new Set(rows.map((r) => r.tourCode)).size, 642);
  });

  test('Sale Status Mapper — SELL 294 / CLOSED 46 / NO_SELL 302 (ค่าในระบบ · ตรงกับไฟล์)', () => {
    const p = getSchedulePeriods();
    const c = p.reduce((a, x) => ((a[x.saleStatus] = (a[x.saleStatus] || 0) + 1), a), {} as Record<string, number>);
    assert.equal(c.SELL, 294);
    assert.equal(c.CLOSED, 46);
    assert.equal(c.NO_SELL, 302);
    // สถานะขายมีได้เพียง 3 ค่า (ไม่มี Open/INC/COL ปะปน)
    assert.ok(p.every((x) => ['SELL', 'NO_SELL', 'CLOSED'].includes(x.saleStatus)));
  });

  test('ลำดับความสำคัญของ getSaleStatus (ค่าในระบบ NO_SELL/CLOSED)', () => {
    assert.equal(getSaleStatus({ tourStatus: 'NO SELL', sellStatus: 'Open' }), 'NO_SELL');
    assert.equal(getSaleStatus({ tourStatus: 'NO SELL', sellStatus: 'Close' }), 'NO_SELL');
    assert.equal(getSaleStatus({ tourStatus: 'SELL', sellStatus: 'Close' }), 'CLOSED');
    assert.equal(getSaleStatus({ tourStatus: 'SELL', sellStatus: 'Open' }), 'SELL');
    assert.equal(getSaleStatus({ tourStatus: '', sellStatus: '' }), 'SELL');
  });

  test('bookingCount = seat − bookingBalance · วันที่เป็น ISO · สายการบินจากท้าย tourCode', () => {
    for (const r of getSchedulePeriods()) {
      if (r.seat != null && r.bookingBalance != null) assert.equal(r.bookingCount, r.seat - r.bookingBalance);
      if (r.startDate) assert.match(r.startDate, /^\d{4}-\d{2}-\d{2}$/);
      if (r.endDate) assert.ok(r.endDate >= r.startDate, `${r.tourCode} end < start`);
    }
    const anyAir = getSchedulePeriods().find((r) => r.tourCode.endsWith('-AQ'));
    assert.equal(anyAir?.airlineCode, 'AQ');
  });

  test('splitTourName — แยก Program Code + ตัด [STATUS] ออกจากชื่อ', () => {
    const a = splitTourName('ZGCKG-2622HU : จีน มหานครฉงชิ่ง (เที่ยวครบทุกวัน-ไม่ลงร้าน) 4 วัน 3 คืน');
    assert.equal(a.programCode, 'ZGCKG-2622HU');
    assert.equal(a.displayName, 'จีน มหานครฉงชิ่ง (เที่ยวครบทุกวัน-ไม่ลงร้าน) 4 วัน 3 คืน');
    const b = splitTourName('ZGCKG-2601VZ : [ NO SELL ] จีน มหานครฉงชิ่ง มรดกโลก (ไม่ลงร้าน) 5 วัน 3 คืน');
    assert.equal(b.programCode, 'ZGCKG-2601VZ');
    assert.ok(!b.displayName.includes('NO SELL'), 'ต้องตัด [NO SELL] ออก');
    assert.ok(b.displayName.startsWith('จีน'));
    // ทุกพีเรียดแยก programCode ได้ (ไม่เท่ากับ groupCode)
    for (const p of getSchedulePeriods()) {
      if (p.programCode) assert.notEqual(p.programCode, p.tourCode);
      assert.ok(!/\[\s*(NO\s*SELL|SELL|CLOSE)\s*\]/i.test(p.displayName), `${p.tourCode} ชื่อยังมีแท็กสถานะ`);
    }
    assert.equal(airlineFromTourCode('CAN-260910E-AQ'), 'AQ');
  });

  test('getPeriodStatus — อ่านจากข้อความ "INC :"/"COL :" เท่านั้น', () => {
    assert.equal(getPeriodStatus('INC : บริษัท ยู เอ็ม ทัวร์ จำกัด [ หัวหน้าทัวร์เอเจนซ์ ]'), 'INC');
    assert.equal(getPeriodStatus('  INC:รักน่านฟ้า'), 'INC');
    assert.equal(getPeriodStatus('COL : [ หัวหน้าทัวร์ซีโก้ : ไผ่ตง ]'), 'COL');
    assert.equal(getPeriodStatus('Flight has been cancelled'), null);
    assert.equal(getPeriodStatus('เปลี่ยน Project ขาย'), null);
    assert.equal(getPeriodStatus(''), null);
    assert.equal(getPeriodStatus(null), null);
  });

  test('resolvePeriodStatus — ไม่ใช่ INC ก็เป็น COL ทันที · ไม่มีค่าว่าง', () => {
    assert.equal(resolvePeriodStatus('INC : รักน่านฟ้า'), 'INC');
    assert.equal(resolvePeriodStatus('  INC:รักน่านฟ้า'), 'INC');
    assert.equal(resolvePeriodStatus('COL : [ ไผ่ตง ]'), 'COL');
    assert.equal(resolvePeriodStatus('Flight has been cancelled'), 'COL');
    assert.equal(resolvePeriodStatus('ไม่ได้วางมัดจำ'), 'COL');
    assert.equal(resolvePeriodStatus(''), 'COL');
    assert.equal(resolvePeriodStatus(null), 'COL');
    assert.equal(resolvePeriodStatus(undefined), 'COL');
  });

  test('ประเภทกรุ๊ปแยกแกนกับสถานะขาย — ทุกสถานะขายเกิดได้กับทั้ง INC และ COL', () => {
    const p = getSchedulePeriods();
    // ประเภทกรุ๊ปต้องเป็น INC/COL เสมอ ไม่มีค่าว่าง
    for (const r of p) assert.ok(['INC', 'COL'].includes(r.periodStatus));

    // สถานะขายของกรุ๊ป NO SELL ต้องไม่ทำให้ประเภทกรุ๊ปหายไป
    const noSell = p.filter((r) => r.saleStatus === 'NO_SELL');
    assert.equal(noSell.length, 302);
    for (const r of noSell) assert.ok(['INC', 'COL'].includes(r.periodStatus));

    // ข้อมูลจริง: INC 15 · COL 627 (รวม 642)
    const inc = p.filter((x) => x.periodStatus === 'INC');
    const col = p.filter((x) => x.periodStatus === 'COL');
    assert.equal(inc.length, 15);
    assert.equal(col.length, 627);
    assert.equal(inc.length + col.length, 642);

    // INC ต้องมาจากข้อความ "INC :" จริงเสมอ
    for (const r of inc) assert.match(r.incName ?? '', /^\s*INC\s*:/i);
    // COL มาจากข้อความ "COL :" 1 รายการ · ที่เหลือมาจากกฎ "ไม่ใช่ INC ก็เป็น COL"
    assert.equal(col.filter((r) => /^\s*COL\s*:/i.test(r.incName ?? '')).length, 1);

    // systemNote = ข้อความอื่นที่ไม่ใช่ INC/COL — ต้องไม่ถูก COL ที่อนุมานกลืนหาย
    const noteRow = p.find((x) => x.incName === 'Flight has been cancelled');
    assert.equal(noteRow?.periodStatus, 'COL');
    assert.equal(noteRow?.systemNote, 'Flight has been cancelled');
    assert.equal(noteRow?.saleStatus, 'NO_SELL');
    // INC/COL ต้องไม่ถูกนับเป็นสถานะขาย
    for (const r of p) assert.ok(['SELL', 'NO_SELL', 'CLOSED'].includes(r.saleStatus));
  });

  test('periodStatusDetail — มีข้อความเต็มเฉพาะรายการที่ IncName ระบุ INC:/COL: จริง', () => {
    const m = buildTourPeriodMaster();
    const withDetail = m.filter((r) => r.periodStatusDetail !== null);
    assert.equal(withDetail.length, 16); // INC 15 + COL จากข้อความ 1
    for (const r of withDetail) assert.match(r.periodStatusDetail ?? '', /^\s*(INC|COL)\s*:/i);
    // COL ที่ระบบอนุมานให้ ต้องไม่มีข้อความเต็มค้างมา
    const derivedCol = m.filter((r) => r.periodStatus === 'COL' && !/^\s*COL\s*:/i.test(r.incName ?? ''));
    assert.equal(derivedCol.length, 626);
    for (const r of derivedCol) assert.equal(r.periodStatusDetail, null);
  });

  test('§22 Validation — ไม่มี dup/สถานะผิด/Seat ติดลบ · overbook คงค่าติดลบตามไฟล์ (ไม่แก้เป็น 0)', () => {
    const p = getSchedulePeriods();
    const w = validateSchedulePeriods(p);
    // ปัญหาร้ายแรงต้องไม่มี (ยกเว้น "BookingBalance ติดลบ" = ยอดจองเกินจริงจากไฟล์)
    const critical = w.filter((x) => /Group Code ซ้ำ|สถานะขายไม่ถูกต้อง|Seat ติดลบ|startDate มากกว่า|Airline Code ผิด/.test(x.issue));
    assert.equal(critical.length, 0, `พบปัญหา: ${critical.map((x) => `${x.tourCode}:${x.issue}`).join(', ')}`);
    // ยอดจองเกิน (BookingBalance ติดลบ) มีจริงในไฟล์ — ต้องคงค่าไว้ ไม่แก้เป็น 0
    const over = p.filter((x) => x.bookingBalance != null && x.bookingBalance < 0);
    assert.ok(over.length >= 1, 'ควรมีพีเรียดยอดจองเกิน');
    for (const o of over) assert.ok(o.bookingBalance! < 0);
  });
});
