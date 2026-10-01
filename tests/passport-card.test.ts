import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  passportCardStatus, canBePrimary, statusOrder, sortPassportCards,
  cardActionEligibility, mrzValidationStatus,
  PASSPORT_CARD_STATUS_META, type PassportCardStatus,
} from '../src/lib/logic/passportCard';
import type { MrzCheckSummary } from '../src/data/leaders/passportBookTypes';

const TODAY = '2026-07-13';

describe('§2 สถานะบนหัว Passport Card (6 แบบ)', () => {
  test('ยังไม่หมดอายุและใช้งานอยู่ → ใช้งานได้', () => {
    assert.equal(passportCardStatus('ACTIVE', '2030-01-01', TODAY), 'VALID');
  });

  test('เหลือน้อยกว่า 180 วัน → ใกล้หมดอายุ', () => {
    assert.equal(passportCardStatus('ACTIVE', '2026-10-01', TODAY), 'EXPIRING');
    assert.equal(passportCardStatus('ACTIVE', '2026-08-01', TODAY), 'EXPIRING');
  });

  test('เลยวันหมดอายุ → หมดอายุ', () => {
    assert.equal(passportCardStatus('ACTIVE', '2026-01-01', TODAY), 'EXPIRED');
  });

  test('ไม่ระบุวันหมดอายุ → ไม่ทราบสถานะ (ไม่เดา)', () => {
    assert.equal(passportCardStatus('ACTIVE', null, TODAY), 'UNKNOWN');
  });

  test('สถานะการใช้งานมีน้ำหนักเหนือวันหมดอายุ', () => {
    // ยังไม่หมดอายุ แต่ถูกยกเลิก/สูญหาย/ปิดใช้งาน → ต้องไม่แสดงว่า "ใช้งานได้"
    assert.equal(passportCardStatus('REVOKED', '2030-01-01', TODAY), 'REVOKED');
    assert.equal(passportCardStatus('LOST', '2030-01-01', TODAY), 'LOST');
    assert.equal(passportCardStatus('INACTIVE', '2030-01-01', TODAY), 'INACTIVE');
  });

  test('มีป้ายกำกับครบทุกสถานะ', () => {
    const all: PassportCardStatus[] = ['VALID', 'EXPIRING', 'EXPIRED', 'REVOKED', 'LOST', 'INACTIVE', 'UNKNOWN'];
    for (const s of all) assert.ok(PASSPORT_CARD_STATUS_META[s].label.length > 0, s);
    assert.equal(PASSPORT_CARD_STATUS_META.VALID.label, 'ใช้งานได้');
    assert.equal(PASSPORT_CARD_STATUS_META.REVOKED.label, 'ถูกยกเลิก');
    assert.equal(PASSPORT_CARD_STATUS_META.LOST.label, 'สูญหาย');
    assert.equal(PASSPORT_CARD_STATUS_META.INACTIVE.label, 'ปิดใช้งาน');
  });
});

describe('§6/§7 เล่มที่ตั้งเป็นเล่มหลักได้', () => {
  test('ใช้งานได้ / ใกล้หมดอายุ → ตั้งได้', () => {
    assert.equal(canBePrimary('VALID'), true);
    assert.equal(canBePrimary('EXPIRING'), true);
  });

  test('หมดอายุ / ยกเลิก / สูญหาย / ปิดใช้งาน / ไม่ทราบ → ตั้งไม่ได้', () => {
    for (const s of ['EXPIRED', 'REVOKED', 'LOST', 'INACTIVE', 'UNKNOWN'] as PassportCardStatus[]) {
      assert.equal(canBePrimary(s), false, s);
    }
  });
});

describe('§5 การเรียงลำดับ Passport Card', () => {
  const card = (id: string, isPrimary: boolean, status: PassportCardStatus, expiryDate: string | null) =>
    ({ id, isPrimary, status, expiryDate });

  test('เล่มหลักขึ้นก่อนเสมอ แม้จะใกล้หมดอายุกว่า', () => {
    const sorted = sortPassportCards([
      card('valid', false, 'VALID', '2032-01-01'),
      card('primary', true, 'EXPIRING', '2026-09-01'),
    ]);
    assert.equal(sorted[0].id, 'primary');
  });

  test('ลำดับกลุ่ม: ใช้งานได้ → ใกล้หมดอายุ → หมดอายุ/ปิดใช้งาน', () => {
    const sorted = sortPassportCards([
      card('expired', false, 'EXPIRED', '2025-01-01'),
      card('expiring', false, 'EXPIRING', '2026-09-01'),
      card('inactive', false, 'INACTIVE', '2033-01-01'),
      card('valid', false, 'VALID', '2032-01-01'),
    ]);
    assert.deepEqual(sorted.map((c) => c.id).slice(0, 2), ['valid', 'expiring']);
    assert.ok(['expired', 'inactive'].includes(sorted[2].id));
  });

  test('ในกลุ่มเดียวกัน เรียงตามวันหมดอายุล่าสุดก่อน', () => {
    const sorted = sortPassportCards([
      card('a', false, 'VALID', '2030-01-01'),
      card('b', false, 'VALID', '2033-01-01'),
      card('c', false, 'VALID', '2031-01-01'),
    ]);
    assert.deepEqual(sorted.map((c) => c.id), ['b', 'c', 'a']);
  });

  test('ไม่มีวันหมดอายุ → ไปท้ายกลุ่ม', () => {
    const sorted = sortPassportCards([
      card('none', false, 'VALID', null),
      card('has', false, 'VALID', '2030-01-01'),
    ]);
    assert.deepEqual(sorted.map((c) => c.id), ['has', 'none']);
  });

  test('ไม่แก้ไขอาร์เรย์เดิม', () => {
    const input = [card('a', false, 'VALID', '2030-01-01'), card('b', true, 'VALID', '2031-01-01')];
    const copy = [...input];
    sortPassportCards(input);
    assert.deepEqual(input, copy);
  });

  test('statusOrder จัดกลุ่มถูกต้อง', () => {
    assert.equal(statusOrder('VALID'), 0);
    assert.equal(statusOrder('EXPIRING'), 1);
    assert.equal(statusOrder('EXPIRED'), 2);
    assert.equal(statusOrder('LOST'), 2);
  });
});

describe('§4 สถานะการตรวจสอบ MRZ', () => {
  const mrz = (over: Partial<MrzCheckSummary>): MrzCheckSummary => ({
    parsed: true, passportNoValid: true, dateOfBirthValid: true, expiryValid: true, compositeValid: true, ...over,
  });

  test('ไม่ได้อ่าน MRZ → ไม่สามารถตรวจสอบได้', () => {
    assert.equal(mrzValidationStatus(null), 'UNVERIFIABLE');
    assert.equal(mrzValidationStatus(mrz({ parsed: false })), 'UNVERIFIABLE');
  });

  test('Check Digit ผ่านครบ + ไม่ขัดหน้าเล่ม → ผ่าน', () => {
    assert.equal(mrzValidationStatus(mrz({})), 'PASSED');
  });

  test('Check Digit ไม่ผ่าน → ไม่ตรง', () => {
    assert.equal(mrzValidationStatus(mrz({ passportNoValid: false })), 'MISMATCH');
    assert.equal(mrzValidationStatus(mrz({ compositeValid: false })), 'MISMATCH');
  });

  test('MRZ ขัดกับข้อความบนเล่ม → ไม่ตรง', () => {
    assert.equal(mrzValidationStatus(mrz({ vizMismatch: true })), 'MISMATCH');
  });

  test('Check Digit ตรวจไม่ได้ (null) แต่ไม่ขัด → ผ่าน (ไม่ลงโทษสิ่งที่ตรวจไม่ได้)', () => {
    assert.equal(mrzValidationStatus(mrz({ compositeValid: null })), 'PASSED');
  });
});

describe('§2 เงื่อนไข Action ของแต่ละ Card', () => {
  const active = { isPrimary: false, status: 'VALID' as PassportCardStatus, lifecycle: 'ACTIVE' as const };

  test('เล่มหลักที่มีเล่มอื่น → ปิดใช้งาน/ลบไม่ได้ (ต้องตั้งเล่มใหม่ก่อน)', () => {
    const e = cardActionEligibility({ ...active, isPrimary: true }, 1, false);
    assert.equal(e.deactivate.enabled, false);
    assert.equal(e.delete.enabled, false);
    assert.match(e.deactivate.reason!, /ตั้งเล่มอื่นเป็นเล่มหลักก่อน/);
  });

  test('เล่มหลักที่เป็นเล่มเดียว → ปิดใช้งาน/ลบได้', () => {
    const e = cardActionEligibility({ ...active, isPrimary: true }, 0, false);
    assert.equal(e.deactivate.enabled, true);
    assert.equal(e.delete.enabled, true);
  });

  test('เล่มหลักไม่แสดง/ตั้งเป็นเล่มหลักซ้ำไม่ได้', () => {
    const e = cardActionEligibility({ ...active, isPrimary: true }, 0, false);
    assert.equal(e.setPrimary.enabled, false);
  });

  test('เล่มรองที่ใช้งานได้ → ตั้งเป็นเล่มหลักได้', () => {
    assert.equal(cardActionEligibility(active, 1, false).setPrimary.enabled, true);
  });

  test('เล่มรองที่หมดอายุ → ตั้งเป็นเล่มหลักไม่ได้', () => {
    const e = cardActionEligibility({ ...active, status: 'EXPIRED' }, 1, false);
    assert.equal(e.setPrimary.enabled, false);
    assert.match(e.setPrimary.reason!, /หมดอายุ/);
  });

  test('ถูกอ้างอิงในงานทัวร์ → ลบไม่ได้ พร้อมเหตุผล', () => {
    const e = cardActionEligibility(active, 1, true);
    assert.equal(e.delete.enabled, false);
    assert.match(e.delete.reason!, /อ้างอิง/);
  });

  test('เล่มรองที่ไม่ถูกอ้างอิง → ลบได้', () => {
    assert.equal(cardActionEligibility(active, 1, false).delete.enabled, true);
  });
});
