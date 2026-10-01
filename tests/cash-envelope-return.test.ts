import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { envelopeTimeline, returnedToFinanceBy, type CashEnvelope } from '../src/lib/logic/cashEnvelope';

const staff = { id: 'SOS-001', name: 'ธนกฤต วงศ์สุวรรณ (เอ)' };

function env(extra: Partial<CashEnvelope> = {}): CashEnvelope {
  return { id: 'ENV-P1-1', periodId: 'P1', no: 1, packedLineIds: ['D::1'], history: [], ...extra };
}

describe('ส่งซองคืนการเงิน — เจ้าหน้าที่ต้องเห็นสถานะจริงหลังการเงินรับคืน', () => {
  test('มี lastReturn ของคนนี้ และยังไม่ส่งมอบใหม่ → คืนแล้ว พร้อมเหตุผล', () => {
    const r = returnedToFinanceBy(env({
      lastReturn: { at: '2026-10-01T11:34', staffId: 'SOS-001', staffName: staff.name, reason: 'กรุ๊ปเลื่อน', receivedAt: '2026-10-01T12:00' },
    }), staff);
    assert.deepEqual(r, { at: '2026-10-01T11:34', receivedAt: '2026-10-01T12:00', reason: 'กรุ๊ปเลื่อน' });
  });

  test('lastReturn เป็นของคนอื่น → ไม่ใช่ของคนนี้', () => {
    const r = returnedToFinanceBy(env({
      lastReturn: { at: 'x', staffId: 'SOS-002', staffName: 'คนอื่น', reason: 'r', receivedAt: 'y' },
    }), staff);
    assert.equal(r, null);
  });

  test('การเงินส่งมอบใหม่แล้ว → ไม่ใช่สถานะ "คืนแล้ว" อีกต่อไป', () => {
    const r = returnedToFinanceBy(env({
      lastReturn: { at: 'x', staffId: 'SOS-001', staffName: staff.name, reason: 'r', receivedAt: 'y' },
      handover: { at: 'z', byName: 'การเงิน', receiverKind: 'staff', receiverName: 'หัวหน้าทัวร์ของกรุ๊ป', proxyStaffId: 'SOS-001', proxyName: staff.name },
    }), staff);
    assert.equal(r, null);
  });

  test('ข้อมูลเก่าที่ไม่มี lastReturn — อ่านจากประวัติแทน', () => {
    const r = returnedToFinanceBy(env({
      history: [
        { at: '2026-10-01T10:00', byName: 'การเงิน', action: 'ส่งมอบซองให้เจ้าหน้าที่ส่งกรุ๊ป' },
        { at: '2026-10-01T11:34', byName: staff.name, action: 'เจ้าหน้าที่ส่งกรุ๊ปส่งซองคืนการเงิน', note: 'ซอง 1 · เหตุผล: ทดสอบเหตุผลการนำซองคืน · รอการเงินยืนยันรับคืน' },
        { at: '2026-10-01T12:00', byName: 'การเงิน', action: 'การเงินรับซองคืน' },
      ],
    }), staff);
    assert.deepEqual(r, { at: '2026-10-01T11:34', receivedAt: '2026-10-01T12:00', reason: 'ทดสอบเหตุผลการนำซองคืน' });
  });

  test('ประวัติมีแค่ส่งคืน แต่การเงินยังไม่ยืนยันรับ → ยังไม่นับว่าคืนแล้ว', () => {
    const r = returnedToFinanceBy(env({
      history: [{ at: 'x', byName: staff.name, action: 'เจ้าหน้าที่ส่งกรุ๊ปส่งซองคืนการเงิน', note: 'เหตุผล: a' }],
    }), staff);
    assert.equal(r, null);
  });
});

describe('Timeline — กดดูรูปหลักฐานของแต่ละทอดได้', () => {
  const RECEIVE = 'เจ้าหน้าที่ส่งกรุ๊ปยืนยันรับซอง';

  test('รายการประวัติที่มีรูปติดมา → Timeline มีรูปของทอดนั้น', () => {
    const ev = envelopeTimeline([env({ history: [{ at: '2026-10-01T10:00', byName: 'ธนกฤต', action: RECEIVE, photo: 'data:img/a' }] })]);
    assert.equal(ev[0].photo, 'data:img/a');
  });

  test('ข้อมูลเดิม (ประวัติไม่มีรูป) → ใช้รูปที่เก็บบนตัวซองแทน', () => {
    const ev = envelopeTimeline([env({
      staffAck: { at: '2026-10-01T10:00', staffId: 'SOS-001', staffName: 'ธนกฤต', photo: 'data:img/old' },
      history: [{ at: '2026-10-01T10:00', byName: 'ธนกฤต', action: RECEIVE }],
    })]);
    assert.equal(ev[0].photo, 'data:img/old');
  });

  test('ทำทอดเดิมซ้ำ (รับซองรอบใหม่) — รูปสำรองผูกกับรายการล่าสุดเท่านั้น ไม่ใส่ให้รอบเก่าผิด ๆ', () => {
    const ev = envelopeTimeline([env({
      staffAck: { at: '2026-10-03T10:00', staffId: 'SOS-001', staffName: 'ธนกฤต', photo: 'data:img/round2' },
      history: [
        { at: '2026-10-01T10:00', byName: 'ธนกฤต', action: RECEIVE },
        { at: '2026-10-03T10:00', byName: 'ธนกฤต', action: RECEIVE },
      ],
    })]);
    // เรียงใหม่ → เก่า
    assert.equal(ev[0].photo, 'data:img/round2');
    assert.equal(ev[1].photo, undefined);
  });

  test('ขั้นที่ไม่มีรูป (เช่น ปิดซอง / การเงินส่งมอบ) → ไม่มีปุ่มดูรูป', () => {
    const ev = envelopeTimeline([env({ history: [{ at: '2026-10-01T09:00', byName: 'การเงิน', action: 'ปิดซอง' }] })]);
    assert.equal(ev[0].photo, undefined);
  });
});
