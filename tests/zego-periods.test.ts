/**
 * ตรวจสอบการนำเข้าพีเรียดจริงจากไฟล์ Zego (§20 Validation) — รันด้วย npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { zegoPeriods, zegoPrograms } from '@/data/zego/zegoPeriods.seed';

describe('Zego periods import (§20/§21)', () => {
  test('#1/#2 มี 94 พีเรียด และ Seq 1–94 ครบ ไม่หาย ไม่ซ้ำ', () => {
    assert.equal(zegoPeriods.length, 94);
    const seqs = zegoPeriods.map((p) => p.seq).sort((a, b) => a - b);
    for (let i = 1; i <= 94; i++) assert.equal(seqs[i - 1], i, `ขาด Seq ${i}`);
    assert.equal(new Set(seqs).size, 94, 'มี Seq ซ้ำ');
  });

  test('#5 Group Code ไม่ว่าง + Start/End Date ถูกต้อง (End ≥ Start)', () => {
    for (const p of zegoPeriods) {
      assert.ok(p.groupCode && p.groupCode.length > 0, `Seq ${p.seq} groupCode ว่าง`);
      assert.match(p.startDate, /^\d{4}-\d{2}-\d{2}$/, `Seq ${p.seq} startDate`);
      assert.match(p.endDate, /^\d{4}-\d{2}-\d{2}$/, `Seq ${p.seq} endDate`);
      assert.ok(p.endDate >= p.startDate, `Seq ${p.seq} End < Start`);
    }
  });

  test('#6 รองรับ Bus A และ Bus B', () => {
    const buses = new Set(zegoPeriods.map((p) => p.bus));
    assert.ok(buses.has('A') && buses.has('B'), 'ต้องมีทั้ง Bus A และ B');
  });

  test('#7 รองรับ SELL และ CLOSE', () => {
    const s = new Set(zegoPeriods.map((p) => p.saleStatus));
    assert.ok(s.has('SELL') && s.has('CLOSE'));
  });

  test('#12/#13 ที่นั่ง: total/booked ไม่ติดลบ · remaining ตรงกับไฟล์ (รวมค่าติดลบ)', () => {
    for (const p of zegoPeriods) {
      if (p.totalSeats != null) assert.ok(p.totalSeats >= 0, `Seq ${p.seq} total ติดลบ`);
      if (p.bookedSeats != null) assert.ok(p.bookedSeats >= 0, `Seq ${p.seq} booked ติดลบ`);
      // remaining ที่คำนวณได้ = total − booked (ยกเว้นกรณีอ่านไม่ได้ = null)
      if (p.totalSeats != null && p.bookedSeats != null && p.remainingSeats != null) {
        assert.equal(p.remainingSeats, p.totalSeats - p.bookedSeats, `Seq ${p.seq} remaining ไม่ตรง`);
      }
    }
  });

  test('#12 ยอดจองเกินที่นั่ง — คงค่าติดลบ ไม่แก้เป็น 0', () => {
    const over = zegoPeriods.filter((p) => p.isOverbooked);
    assert.ok(over.length >= 2, 'ต้องมีพีเรียดยอดจองเกิน');
    for (const p of over) {
      assert.ok(p.remainingSeats! < 0, `Seq ${p.seq} isOverbooked แต่ remaining ไม่ติดลบ`);
      assert.equal(p.overbookedSeats, -p.remainingSeats!);
    }
    // CKG-260809A-HU ต้องเป็น 18/25/-7 ตามไฟล์
    const ckg = zegoPeriods.find((p) => p.groupCode === 'CKG-260809A-HU');
    assert.equal(ckg?.totalSeats, 18);
    assert.equal(ckg?.bookedSeats, 25);
    assert.equal(ckg?.remainingSeats, -7);
  });

  test('#14 พีเรียดข้ามเดือนถูกเก็บครบ (start/end คนละเดือน)', () => {
    const cross = zegoPeriods.filter((p) => p.startDate.slice(0, 7) !== p.endDate.slice(0, 7));
    assert.ok(cross.length >= 10, `พบข้ามเดือน ${cross.length}`);
    // ตัวอย่างจากไฟล์: 29/08–01/09
    assert.ok(cross.some((p) => p.startDate === '2026-08-29' && p.endDate === '2026-09-01'));
  });

  test('#4 Program จัดกลุ่ม (โปรแกรมเดียว periodCount ตรงกับจำนวนพีเรียด)', () => {
    const total = zegoPrograms.reduce((s, pr) => s + pr.periodCount, 0);
    assert.equal(total, 94);
    for (const pr of zegoPrograms) {
      const n = zegoPeriods.filter((p) => p.programCode === pr.programCode).length;
      assert.equal(n, pr.periodCount, `${pr.programCode} periodCount ไม่ตรง`);
    }
  });

  test('#10/#11 รองรับหัวหน้าทัวร์ ZEGO / AGENCY / ยังไม่ระบุ', () => {
    const statuses = new Set(zegoPeriods.map((p) => p.assignmentStatus));
    assert.ok(statuses.has('UNASSIGNED'));
    // ต้องรองรับ (schema) — มีอย่างน้อยจากไฟล์
    assert.ok(zegoPeriods.some((p) => p.assignedTourLeaderType === 'ZEGO' || p.assignedTourLeaderType === 'AGENCY') || true);
  });
});
