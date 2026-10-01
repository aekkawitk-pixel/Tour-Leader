/**
 * เทสต์การจัดการเล่มหนังสือเดินทางที่มาจากไฟล์นำเข้าต้นทาง
 *
 * ข้อมูลนำเข้าแก้ที่ต้นทางไม่ได้ ระบบจึงต้อง:
 *   • กดแก้ไข → คัดลอกมาเป็นเล่มของระบบก่อน แล้วแก้ที่เล่มนั้น
 *   • กดลบ    → เลิกแสดงเล่มนำเข้าเท่านั้น (ไฟล์ต้นทางไม่ถูกแตะ)
 *
 * รันด้วย: npm test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { adoptMasterBook, getPassportBooks } from '@/services/passportBookStore';
import {
  hideMasterPassport,
  isMasterPassportHidden,
  unhideMasterPassport,
} from '@/services/masterPassportHidden';
import { emptyPassportFields } from '@/data/leaders/passportBookTypes';

/* ------------------ localStorage จำลอง (เทสต์รันนอกเบราว์เซอร์) ------------------ */

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function fakeStorage(): FakeStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const globalWithWindow = globalThis as { window?: { localStorage: FakeStorage } };
beforeEach(() => { globalWithWindow.window = { localStorage: fakeStorage() }; });
afterEach(() => { delete globalWithWindow.window; });

const LEADER = 'TL-000001';
const AT = '2026-08-18T00:00';

const masterFields = () => ({
  ...emptyPassportFields(),
  passportNo: 'AC1062395',
  firstName: 'CHAIMONGKON',
  lastName: 'TATIYAVONGVIVAT',
  issueDate: '2024-02-13',
  expiryDate: '2029-02-12',
  issuingAuthority: 'MFA',
});

/* ------------------------------ คัดลอกมาเป็นเล่มระบบ ----------------------------- */

describe('adoptMasterBook — คัดลอกเล่มนำเข้ามาเป็นเล่มในระบบ', () => {
  test('ได้เล่มใหม่ที่แก้ไขได้ พร้อมข้อมูลครบตามเล่มนำเข้า', () => {
    const book = adoptMasterBook({ tourLeaderId: LEADER, fields: masterFields(), by: 'ผู้ทดสอบ', at: AT });

    assert.ok(book.bookId, 'ต้องมีรหัสเล่มในระบบ');
    assert.equal(book.fields.passportNo, 'AC1062395');
    assert.equal(book.fields.firstName, 'CHAIMONGKON');
    assert.equal(book.fields.expiryDate, '2029-02-12');
  });

  test('บันทึกเป็นเล่มยืนยันแล้ว ไม่ใช่ฉบับร่าง (ข้อมูลนำเข้าถือว่าตรวจแล้ว)', () => {
    const book = adoptMasterBook({ tourLeaderId: LEADER, fields: masterFields(), by: 'ผู้ทดสอบ', at: AT });
    assert.equal(book.status, 'CONFIRMED');
    assert.equal(book.entryMethod, 'MANUAL');
  });

  test('เล่มแรกของคนนั้น → เป็นเล่มหลักอัตโนมัติ', () => {
    const book = adoptMasterBook({ tourLeaderId: LEADER, fields: masterFields(), by: 'ผู้ทดสอบ', at: AT });
    assert.equal(book.isPrimary, true);
  });

  test('อ่านกลับมาจาก store ได้ (บันทึกจริง ไม่ใช่แค่คืนค่า)', () => {
    adoptMasterBook({ tourLeaderId: LEADER, fields: masterFields(), by: 'ผู้ทดสอบ', at: AT });
    const rows = getPassportBooks(LEADER);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].fields.passportNo, 'AC1062395');
  });

  test('ไม่มีไฟล์แนบ/ค่า OCR ติดมา — เล่มนำเข้าไม่มีรูปในระบบ', () => {
    const book = adoptMasterBook({ tourLeaderId: LEADER, fields: masterFields(), by: 'ผู้ทดสอบ', at: AT });
    assert.equal(book.imageId, null);
    assert.equal(book.ocrOriginal, null);
    assert.equal(book.sourceFileName, null);
  });
});

/* ------------------------------ ลบเล่มนำเข้า ----------------------------- */

describe('masterPassportHidden — เลิกแสดงเล่มนำเข้า', () => {
  test('ค่าเริ่มต้นคือยังแสดงอยู่', () => {
    assert.equal(isMasterPassportHidden(LEADER), false);
  });

  test('สั่งซ่อนแล้วจำได้ (อ่านใหม่ = จำลองรีเฟรชหน้า)', () => {
    hideMasterPassport(LEADER);
    assert.equal(isMasterPassportHidden(LEADER), true);
  });

  test('ซ่อนของคนหนึ่งไม่กระทบคนอื่น', () => {
    hideMasterPassport(LEADER);
    assert.equal(isMasterPassportHidden('TL-000002'), false);
  });

  test('สั่งซ่อนซ้ำไม่เกิดรายการซ้ำ และยังซ่อนอยู่', () => {
    hideMasterPassport(LEADER);
    hideMasterPassport(LEADER);
    assert.equal(isMasterPassportHidden(LEADER), true);
  });

  test('นำกลับมาแสดงได้', () => {
    hideMasterPassport(LEADER);
    unhideMasterPassport(LEADER);
    assert.equal(isMasterPassportHidden(LEADER), false);
  });
});
