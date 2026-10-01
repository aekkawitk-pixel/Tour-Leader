/**
 * Tour Period Master + Service (§1/§2/§6/§13/§14) — แหล่งข้อมูลกลางของพีเรียด
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildTourPeriodMaster, validateTourPeriodRecord, compositeKey } from '@/data/schedule/master';
import {
  getTourPeriods, getTourPeriodById, getTourPeriodByGroupCode, getAssignablePeriods,
  validateTourPeriod, syncTourPeriods, getTourPeriodHistory,
} from '@/services/tourPeriodMaster';

describe('Tour Period Master — โครงสร้าง (§1/§2)', () => {
  test('มี 642 พีเรียด · internalId (PK) ไม่ซ้ำ · Group Code เป็นตัวพิมพ์ใหญ่ (§5.1)', () => {
    const m = buildTourPeriodMaster();
    assert.equal(m.length, 642);
    assert.equal(new Set(m.map((r) => r.internalId)).size, 642); // PK ไม่ซ้ำ (Group Code อาจซ้ำได้)
    for (const r of m) assert.equal(r.groupCode, r.groupCode.trim().toUpperCase());
  });

  test('field canonical ครบ (§2) · seatBooked = seatTotal - seatRemaining · provenance สายการบิน (§5.5)', () => {
    const m = buildTourPeriodMaster();
    for (const r of m) {
      assert.equal(r.sourceSystem, 'CSV');
      assert.equal(r.sourceFileName, 'Query All Period Aug To Sep 2026.csv');
      assert.ok(r.sourceRowNumber >= 2);
      assert.equal(r.currency, 'THB');
      if (r.seatTotal != null && r.seatRemaining != null) assert.equal(r.seatBooked, r.seatTotal - r.seatRemaining);
      // สายการบินจาก CSV = อนุมานจากท้าย Group Code (ไม่มี Sector จริง) — ต้องระบุที่มา
      if (r.firstSectorAirlineCode) assert.equal(r.airlineSource, 'derived_from_group_code');
      assert.deepEqual(r.sectors, []);
      assert.equal(r.programId, null);
    }
  });

  test('Composite Key (§6) — sourceSystem+groupCode+programCode+start+end · ไม่ซ้ำในไฟล์จริง', () => {
    const m = buildTourPeriodMaster();
    const keys = m.map(compositeKey);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('Tour Period Master — สถานะ (§3)', () => {
  test('saleStatus มีแค่ 3 ค่า · periodStatus INC/COL/null (ไม่ปนกัน)', () => {
    const m = buildTourPeriodMaster();
    assert.ok(m.every((r) => ['SELL', 'NO_SELL', 'CLOSED'].includes(r.saleStatus)));
    assert.ok(m.every((r) => r.periodStatus === null || ['INC', 'COL'].includes(r.periodStatus)));
    assert.equal(m.filter((r) => r.periodStatus === 'INC').length, 15);
  });
});

describe('Tour Period Master — Validation (§13)', () => {
  test('สถานะ VALID/WARNING/INVALID · ยอดจองเกิน = WARNING (คงข้อมูลจริง) · ไม่มี INVALID ในไฟล์จริง', () => {
    const m = buildTourPeriodMaster();
    assert.ok(m.every((r) => ['VALID', 'WARNING', 'INVALID'].includes(r.validationStatus)));
    assert.equal(m.filter((r) => r.validationStatus === 'INVALID').length, 0);
    const over = m.filter((r) => r.seatRemaining != null && r.seatRemaining < 0);
    assert.ok(over.length >= 1);
    for (const r of over) assert.equal(r.validationStatus, 'WARNING');
  });

  test('validateTourPeriodRecord จับ INVALID (start>end / seat ติดลบ / สถานะขายผิด)', () => {
    const base = buildTourPeriodMaster()[0];
    assert.equal(validateTourPeriodRecord({ ...base, startDate: '2026-09-10', endDate: '2026-09-01' }).status, 'INVALID');
    assert.equal(validateTourPeriodRecord({ ...base, seatTotal: -1 }).status, 'INVALID');
    assert.equal(validateTourPeriodRecord({ ...base, groupCode: '' }).status, 'INVALID');
  });
});

describe('Tour Period Sync/Access Service (§14)', () => {
  test('getTourPeriods + ตัวกรอง (ประเทศ/สถานะขาย/ค้นหา)', () => {
    assert.equal(getTourPeriods().length, 642);
    const sell = getTourPeriods({ saleStatus: ['SELL'] });
    assert.ok(sell.every((r) => r.saleStatus === 'SELL'));
    const inc = getTourPeriods({ periodStatus: 'INC' });
    assert.equal(inc.length, 15);
    const warn = getTourPeriods({ validationStatus: 'WARNING' });
    assert.ok(warn.every((r) => r.validationStatus === 'WARNING'));
  });

  test('getTourPeriodById (internalId) + getTourPeriodByGroupCode (คืนได้หลายรายการ)', () => {
    const one = getTourPeriods()[0];
    assert.equal(getTourPeriodById(one.internalId)?.internalId, one.internalId);
    assert.equal(getTourPeriodById('ไม่มีจริง'), null);
    const byGroup = getTourPeriodByGroupCode(one.groupCode);
    assert.ok(byGroup.length >= 1 && byGroup.every((r) => r.groupCode === one.groupCode));
  });

  test('getAssignablePeriods = Active + ไม่ INVALID (§13)', () => {
    const a = getAssignablePeriods();
    assert.ok(a.every((r) => r.isActive && r.dataStatus === 'ACTIVE' && r.validationStatus !== 'INVALID'));
  });

  test('validateTourPeriod + getTourPeriodHistory + syncTourPeriods (CSV report §10)', () => {
    const one = getTourPeriods()[0];
    assert.ok(['VALID', 'WARNING', 'INVALID'].includes(validateTourPeriod(one).status));
    const hist = getTourPeriodHistory(one.internalId);
    assert.equal(hist[0]?.action, 'import');
    const rep = syncTourPeriods('CSV');
    assert.equal(rep.total, 642);
    assert.equal(rep.source, 'CSV');
    assert.equal(rep.invalidCount, 0);
    assert.throws(() => syncTourPeriods('REST'), /ยังไม่รองรับ/);
  });
});

describe('ค้นหาพีเรียด — ขอบเขตของแต่ละช่อง', () => {
  const all = getTourPeriods();

  test('groupOrProgram ค้นได้ทั้งรหัสกรุ๊ปและชื่อโปรแกรม (ไม่สนตัวพิมพ์)', () => {
    const sample = all[0];
    const byCode = getTourPeriods({ groupOrProgram: sample.groupCode.toLowerCase() });
    assert.ok(byCode.some((r) => r.internalId === sample.internalId));

    const withName = all.find((r) => r.displayName.trim().length > 6)!;
    const byName = getTourPeriods({ groupOrProgram: withName.displayName.slice(0, 6) });
    assert.ok(byName.some((r) => r.internalId === withName.internalId));
  });

  test('groupOrProgram ไม่ค้น INC และหมายเหตุจากระบบ', () => {
    /* ช่องค้นหาในปฏิทินต้องจำกัดที่รหัสกรุ๊ป + โปรแกรมเท่านั้น */
    const withInc = all.find((r) => (r.incName ?? '').trim().length > 3);
    if (withInc) {
      const q = withInc.incName!.trim();
      const hit = getTourPeriods({ groupOrProgram: q })
        .some((r) => r.internalId === withInc.internalId);
      const matchesCodeOrName = `${withInc.groupCode} ${withInc.programCode ?? ''} ${withInc.displayName}`
        .toLowerCase().includes(q.toLowerCase());
      assert.equal(hit, matchesCodeOrName);
    }

    const withNote = all.find((r) => (r.systemNote ?? '').trim().length > 3);
    if (withNote) {
      const q = withNote.systemNote!.trim();
      const hit = getTourPeriods({ groupOrProgram: q })
        .some((r) => r.internalId === withNote.internalId);
      const matchesCodeOrName = `${withNote.groupCode} ${withNote.programCode ?? ''} ${withNote.displayName}`
        .toLowerCase().includes(q.toLowerCase());
      assert.equal(hit, matchesCodeOrName);
    }
  });

  test('search (หน้า Master) ยังค้น INC ได้ตามเดิม — คนละช่องกับปฏิทิน', () => {
    const withInc = all.find((r) => (r.incName ?? '').trim().length > 3);
    if (withInc) {
      const hits = getTourPeriods({ search: withInc.incName!.trim() });
      assert.ok(hits.some((r) => r.internalId === withInc.internalId));
    }
  });

  test('คำค้นที่คร่อมรอยต่อสองช่องต้องไม่ตรง', () => {
    const r = all.find((x) => x.programCode && x.displayName.trim())!;
    if (r) {
      const straddling = `${r.programCode} ${r.displayName.slice(0, 3)}`;
      const hit = getTourPeriods({ groupOrProgram: straddling })
        .some((x) => x.internalId === r.internalId);
      assert.equal(hit, false);
    }
  });
});
