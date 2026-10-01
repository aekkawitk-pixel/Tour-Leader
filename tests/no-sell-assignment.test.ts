/**
 * สถานะขาย NO SELL กับการจัดหัวหน้าทัวร์
 *
 * ครอบคลุมชั้นที่หน้าจอทดสอบไม่ถึง: การปฏิเสธที่ชั้นบันทึก · การเปลี่ยนสถานะกลับ · การไม่ปะปนข้อมูล
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getTourPeriods, getTourPeriodById, getAssignablePeriods, getSaleStatusChange } from '@/services/tourPeriodMaster';
import { detectAssignmentIssues, isNoSellPeriod, periodSnapshotOf, NO_SELL_REVIEW_LABEL } from '@/lib/logic/guideBoard';
import {
  loadGuideAssignments, loadActiveGuideAssignments, assignPeriod, reassignPeriod, unassignPeriod,
  loadGuideAssignmentAudit, NO_SELL_ASSIGN_ERROR,
} from '@/services/guideAssignmentStore';
import { setPeriodSaleStatus, clearPeriodOverride } from '@/services/periodOverrideStore';
import { listNoSellAlerts, noSellAlertMessage } from '@/lib/logic/noSellAlerts';

const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  },
};

const TODAY = '2026-07-13';
const AT = `${TODAY}T09:00`;
/** พีเรียดที่ยังขายอยู่ (ใช้เป็นฐานของสถานการณ์ "จัดแล้วค่อยเปลี่ยนเป็น NO SELL") */
const sellable = () => getTourPeriods().find((p) => p.saleStatus === 'SELL')!;

describe('AC1/AC2 — โปรแกรม NO SELL ห้ามนำมาจัดสเก็ตใหม่', () => {
  beforeEach(() => { mem.clear(); });

  test('AC1 getAssignablePeriods ตัดโปรแกรม NO SELL ออก (แต่ Master ยังมีข้อมูลอยู่)', () => {
    const noSell = getTourPeriods().filter((p) => p.saleStatus === 'NO_SELL');
    assert.ok(noSell.length > 0, 'ข้อมูลจริงต้องมีพีเรียด NO SELL ให้ทดสอบ');
    const assignable = new Set(getAssignablePeriods().map((p) => p.internalId));
    for (const p of noSell) assert.equal(assignable.has(p.internalId), false, `${p.groupCode} ต้องไม่ถูกเสนอให้จัด`);
    // ไม่ได้ลบจาก Master — ยังเปิดดูเพื่อตรวจสอบได้
    assert.ok(getTourPeriodById(noSell[0].internalId));
  });

  test('AC2 ชั้นบันทึกปฏิเสธการสร้าง Assignment ให้โปรแกรม NO SELL', () => {
    const p = getTourPeriods().find((x) => x.saleStatus === 'NO_SELL')!;
    const res = assignPeriod(p.internalId, 'TL-000001', 'ผู้จัด A', AT, undefined, periodSnapshotOf(p));
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.error, NO_SELL_ASSIGN_ERROR);
    assert.equal(loadGuideAssignments().length, 0, 'ต้องไม่มีการเขียนข้อมูลใด ๆ');
    assert.equal(loadGuideAssignmentAudit().length, 0);
  });

  test('AC2 ปฏิเสธแม้เรียกจากหน้าจอที่เปิดค้างไว้ (ข้อมูลเก่ายังเป็น SELL)', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย', `${TODAY}T10:00`, 'SELL');
    // ผู้เรียกอ่านค่าล่าสุดจาก Master ก่อนบันทึกเสมอ → ถูกปฏิเสธ
    const fresh = getTourPeriodById(p.internalId)!;
    const res = reassignPeriod(`GA-lead-${p.internalId}`, 'TL-000002', 'A', AT, 'ย้ายคน', fresh.saleStatus);
    assert.equal(res.ok, false);
    assert.equal(loadGuideAssignments()[0].tourLeaderId, 'TL-000001', 'ต้องไม่ถูกเปลี่ยนคน');
  });
});

describe('AC3/AC4 — เปลี่ยนเป็น NO SELL หลังจัดแล้ว', () => {
  beforeEach(() => { mem.clear(); });

  test('AC3 ไม่ถอด Assignment อัตโนมัติ + ตั้งสถานะตรวจสอบ "รอถอดออกเนื่องจาก NO SELL"', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย ก.', `${TODAY}T10:30`, p.saleStatus);

    assert.equal(loadActiveGuideAssignments().length, 1, 'ห้ามถอดอัตโนมัติ');
    const fresh = getTourPeriodById(p.internalId)!;
    assert.ok(isNoSellPeriod(fresh));
    const issues = detectAssignmentIssues(loadGuideAssignments()[0].snapshot, fresh);
    const noSell = issues.find((i) => i.type === 'NO_SELL');
    assert.ok(noSell, 'ต้องตรวจพบว่าเป็นงาน NO SELL ที่ยังมีหัวหน้าทัวร์');
    assert.equal(noSell.label, NO_SELL_REVIEW_LABEL);
    assert.match(noSell.detail ?? '', /สถานะขายเปลี่ยนจาก SELL เป็น NO_SELL/);
  });

  test('§6 บันทึกสถานะขายเดิม/ใหม่ ผู้เปลี่ยน และเวลาที่เปลี่ยน', () => {
    const p = sellable();
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย ก.', `${TODAY}T10:30`, p.saleStatus);
    const ch = getSaleStatusChange(p.internalId)!;
    assert.equal(ch.from, 'SELL');
    assert.equal(ch.to, 'NO_SELL');
    assert.equal(ch.by, 'ฝ่ายขาย ก.');
    assert.equal(ch.at, `${TODAY}T10:30`);
  });

  test('AC4 รายการแจ้งเตือน — หนึ่งรายการต่อ Assignment ต่อการเปลี่ยนหนึ่งครั้ง', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย ก.', `${TODAY}T10:30`, p.saleStatus);

    const first = listNoSellAlerts(TODAY);
    assert.equal(first.length, 1);
    // เปิดหน้าใหม่/คำนวณซ้ำ → id เดิม ไม่เกิดรายการซ้ำ
    assert.deepEqual(listNoSellAlerts(TODAY).map((a) => a.id), first.map((a) => a.id));
    assert.match(noSellAlertMessage(first[0], 'ชัยมงคล ตติยวงศ์วิวัฒน์'),
      /ถูกเปลี่ยนสถานะขายเป็น NO SELL แต่ยังมีหัวหน้าทัวร์ ชัยมงคล ตติยวงศ์วิวัฒน์ ถูกจัดอยู่/);

    // เปลี่ยนสถานะอีกครั้ง (ครั้งใหม่) → id เปลี่ยนตามเวลาที่เปลี่ยน
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย ข.', `${TODAY}T15:00`, 'NO_SELL');
    assert.notEqual(listNoSellAlerts(TODAY)[0].id, first[0].id);
  });

  test('§8 เรียงลำดับ: ใกล้วันเดินทาง/เกินกำหนดก่อน', () => {
    const ps = getTourPeriods().filter((x) => x.saleStatus === 'SELL').slice(0, 3);
    ps.forEach((p, i) => {
      assignPeriod(p.internalId, `TL-00000${i + 1}`, 'A', AT, undefined, periodSnapshotOf(p));
      setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย', `${TODAY}T10:0${i}`, 'SELL');
    });
    const dates = listNoSellAlerts(TODAY).map((a) => a.period.startDate);
    assert.deepEqual(dates, [...dates].sort(), 'ต้องเรียงตามวันเดินทางจากใกล้ที่สุด');
  });
});

describe('AC7/AC8 — ถอดหัวหน้าทัวร์', () => {
  beforeEach(() => { mem.clear(); });

  test('AC8 ไม่ลบ Record เดิม + เก็บผู้ถอด/เวลา/เหตุผล/สถานะก่อนถอด', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    const id = `GA-lead-${p.internalId}`;
    unassignPeriod(id, 'ผู้จัด B', `${TODAY}T11:00`, 'โปรแกรมเปลี่ยนเป็น NO SELL — แจ้งแล้ว', 'NO_SELL');

    const all = loadGuideAssignments();
    assert.equal(all.length, 1, 'ห้ามลบ Record ออกจากฐานข้อมูล');
    assert.equal(all[0].removedBy, 'ผู้จัด B');
    assert.equal(all[0].removedAt, `${TODAY}T11:00`);
    assert.equal(all[0].statusBeforeRemove, 'CONFIRMED');
    assert.equal(all[0].saleStatusAtRemove, 'NO_SELL');
    assert.equal(all[0].tourLeaderId, 'TL-000001', 'ยังรู้ว่าเคยจัดใคร');
    assert.match(all[0].removedReason ?? '', /NO SELL/);
    assert.ok(loadGuideAssignmentAudit().some((e) => e.action === 'unassign'));
  });

  test('AC7 หลังถอด ช่วงเวลาของหัวหน้าทัวร์กลับมาว่าง', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    assert.equal(loadActiveGuideAssignments().length, 1);
    unassignPeriod(`GA-lead-${p.internalId}`, 'B', `${TODAY}T11:00`, 'NO SELL', 'NO_SELL');
    assert.equal(loadActiveGuideAssignments().length, 0, 'ต้องไม่ครองช่วงเวลาอีก');
    assert.equal(listNoSellAlerts(TODAY).length, 0, 'ต้องปิดรายการแจ้งเตือน');
  });
});

describe('AC9/AC10 — เปลี่ยนกลับจาก NO SELL เป็น SELL', () => {
  beforeEach(() => { mem.clear(); });

  test('AC9 ยังไม่ได้ถอด → ยกเลิกคำเตือน คง Assignment และสถานะการจัดเดิม', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย', `${TODAY}T10:00`, 'SELL');
    assert.equal(listNoSellAlerts(TODAY).length, 1);

    setPeriodSaleStatus(p.internalId, 'SELL', 'ฝ่ายขาย', `${TODAY}T12:00`, 'NO_SELL');
    assert.equal(listNoSellAlerts(TODAY).length, 0, 'คำเตือนต้องหาย');
    const a = loadActiveGuideAssignments();
    assert.equal(a.length, 1, 'Assignment เดิมต้องยังอยู่');
    assert.equal(a[0].tourLeaderId, 'TL-000001');
    assert.equal(a[0].assignmentStatus, 'CONFIRMED', 'สถานะการจัดเดิมไม่เปลี่ยน');
    const fresh = getTourPeriodById(p.internalId)!;
    assert.equal(detectAssignmentIssues(a[0].snapshot, fresh).some((i) => i.type === 'NO_SELL'), false);
  });

  test('AC10 ถอดไปแล้ว → กลับเป็น SELL ต้องไม่จัดคนเดิมกลับอัตโนมัติ + ประวัติยังอยู่', () => {
    const p = sellable();
    assignPeriod(p.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p));
    setPeriodSaleStatus(p.internalId, 'NO_SELL', 'ฝ่ายขาย', `${TODAY}T10:00`, 'SELL');
    unassignPeriod(`GA-lead-${p.internalId}`, 'B', `${TODAY}T11:00`, 'NO SELL', 'NO_SELL');
    setPeriodSaleStatus(p.internalId, 'SELL', 'ฝ่ายขาย', `${TODAY}T12:00`, 'NO_SELL');

    assert.equal(loadActiveGuideAssignments().length, 0, 'ต้องไม่มีใครถูกจัดกลับเอง');
    assert.equal(loadGuideAssignments()[0].removedBy, 'B', 'ประวัติการถอดต้องยังอยู่');
    // โปรแกรมกลับเข้าสู่รายการ "ยังไม่ระบุหัวหน้าทัวร์" → เลือกจัดใหม่ได้
    assert.ok(getAssignablePeriods().some((x) => x.internalId === p.internalId));
  });
});

describe('AC12 — ข้อมูล Program Period และ Assignment ไม่ปะปนกัน', () => {
  beforeEach(() => { mem.clear(); });

  test('เปลี่ยนสถานะขายของพีเรียดหนึ่ง ไม่กระทบพีเรียด/Assignment อื่น', () => {
    const [p1, p2] = getTourPeriods().filter((x) => x.saleStatus === 'SELL').slice(0, 2);
    assignPeriod(p1.internalId, 'TL-000001', 'A', AT, undefined, periodSnapshotOf(p1));
    assignPeriod(p2.internalId, 'TL-000002', 'A', AT, undefined, periodSnapshotOf(p2));
    setPeriodSaleStatus(p1.internalId, 'NO_SELL', 'ฝ่ายขาย', `${TODAY}T10:00`, 'SELL');

    const alerts = listNoSellAlerts(TODAY);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].period.internalId, p1.internalId);
    assert.equal(alerts[0].tourLeaderId, 'TL-000001');
    // พีเรียดอีกอันไม่ถูกแตะ
    assert.equal(getTourPeriodById(p2.internalId)!.saleStatus, 'SELL');
    assert.equal(getSaleStatusChange(p2.internalId), null);

    unassignPeriod(alerts[0].assignment.assignmentId, 'B', `${TODAY}T11:00`, 'NO SELL', 'NO_SELL');
    const active = loadActiveGuideAssignments();
    assert.equal(active.length, 1);
    assert.equal(active[0].periodId, p2.internalId, 'ต้องถอดเฉพาะรายการที่เลือก');
    clearPeriodOverride(p1.internalId);
  });
});
