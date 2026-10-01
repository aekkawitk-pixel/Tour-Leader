import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  passportDataStatus, passportDaysText, missingPassportFields,
  normalizeName, sameName, sameGender, verifyIdentity,
  PASSPORT_DATA_STATE,
} from '../src/lib/logic/identityVerification';

const TODAY = '2026-07-24';

const fullBook = (over: Record<string, string> = {}) => ({
  passportNo: 'AC1234567',
  issuingCountry: 'THA',
  issueDate: '2022-01-01',
  expiryDate: '2032-01-01',
  firstName: 'SOMCHAI',
  lastName: 'JAIDEE',
  dateOfBirth: '1990-01-01',
  nationality: 'THA',
  gender: 'M',
  ...over,
});

describe('§8 passportDataStatus — คำนวณอัตโนมัติจากวันหมดอายุ', () => {
  test('ไม่มีข้อมูลเลย → none', () => {
    assert.equal(passportDataStatus(null, TODAY), 'none');
    assert.equal(passportDataStatus({}, TODAY), 'none');
  });
  test('หมดอายุแล้ว → expired', () => {
    assert.equal(passportDataStatus(fullBook({ expiryDate: '2026-07-01' }), TODAY), 'expired');
  });
  test('เหลือ ≤ 6 เดือน → expiring', () => {
    assert.equal(passportDataStatus(fullBook({ expiryDate: '2026-10-01' }), TODAY), 'expiring');
  });
  test('เหลือ > 6 เดือน + ครบ → valid', () => {
    assert.equal(passportDataStatus(fullBook(), TODAY), 'valid');
  });
  test('ไม่หมดอายุแต่ช่องบังคับขาด → incomplete', () => {
    assert.equal(passportDataStatus(fullBook({ firstName: '' }), TODAY), 'incomplete');
  });
  test('มีเลขแต่ไม่มีวันหมดอายุ → incomplete', () => {
    assert.equal(passportDataStatus({ passportNo: 'AC1' }, TODAY), 'incomplete');
  });
  test('มี label/tone ครบ 5 สถานะ', () => {
    assert.deepEqual(Object.keys(PASSPORT_DATA_STATE).sort(), ['expired', 'expiring', 'incomplete', 'none', 'valid']);
  });
});

describe('§8 passportDaysText', () => {
  test('ยังไม่หมดอายุ → "เหลือ N วัน"', () => {
    assert.match(passportDaysText('2026-12-19', TODAY), /^เหลือ \d+ วัน$/);
  });
  test('หมดอายุแล้ว → "หมดอายุแล้ว N วัน"', () => {
    assert.match(passportDaysText('2026-06-22', TODAY), /^หมดอายุแล้ว \d+ วัน$/);
  });
  test('ไม่มีวันหมดอายุ → "—"', () => {
    assert.equal(passportDaysText(null, TODAY), '—');
  });
});

describe('§10 เปรียบเทียบชื่อ — ตัดช่องว่าง + ไม่สนตัวพิมพ์ (คงอักขระอื่น)', () => {
  test('normalizeName ตัดช่องว่างซ้ำและ lowercase', () => {
    assert.equal(normalizeName('  SOMCHAI   JAIDEE '), 'somchai jaidee');
  });
  test('ต่างแค่ตัวพิมพ์/ช่องว่าง → ตรงกัน', () => {
    assert.equal(sameName('somchai  jaidee', ' SOMCHAI JAIDEE'), true);
  });
  test('อักขระสำคัญต่างกัน → ไม่ตรง (ห้ามตัดทิ้ง)', () => {
    assert.equal(sameName("O'BRIEN", 'OBRIEN'), false);
    assert.equal(sameName('ANNE-MARIE', 'ANNE MARIE'), false);
  });
  test('sameGender: male ↔ M · female ↔ F', () => {
    assert.equal(sameGender('male', 'M'), true);
    assert.equal(sameGender('female', 'F'), true);
    assert.equal(sameGender('male', 'F'), false);
    assert.equal(sameGender('unspecified', 'M'), false);
  });
});

describe('§9 verifyIdentity', () => {
  const personal = { firstNameEn: 'Somchai', lastNameEn: 'Jaidee', birthDate: '1990-01-01', gender: 'male', nationalityAlpha3: 'THA' };

  test('ไม่มี Passport → รายการเดียว state unknown', () => {
    const checks = verifyIdentity({ personal, passport: null, hasFile: false, today: TODAY });
    assert.equal(checks.length, 1);
    assert.equal(checks[0].state, 'unknown');
    assert.equal(checks[0].target, 'passport');
  });

  test('ตรงกันทุกช่อง + มีไฟล์ + ครบ → ok ทั้งหมด', () => {
    const checks = verifyIdentity({ personal, passport: fullBook(), hasFile: true, today: TODAY });
    assert.ok(checks.every((c) => c.state === 'ok'), JSON.stringify(checks.filter((c) => c.state !== 'ok')));
  });

  test('นามสกุลไม่ตรง → warn พร้อมรายละเอียด', () => {
    const checks = verifyIdentity({ personal, passport: fullBook({ lastName: 'JAIDEE2' }), hasFile: true, today: TODAY });
    const c = checks.find((x) => x.key === 'lastNameEn')!;
    assert.equal(c.state, 'warn');
    assert.match(c.detail!, /Passport: JAIDEE2/);
  });

  test('Passport หมดอายุ → error · ใกล้หมดอายุ → warn', () => {
    const expired = verifyIdentity({ personal, passport: fullBook({ expiryDate: '2026-01-01' }), hasFile: true, today: TODAY });
    assert.equal(expired.find((c) => c.key === 'expiry')!.state, 'error');
    const soon = verifyIdentity({ personal, passport: fullBook({ expiryDate: '2026-10-01' }), hasFile: true, today: TODAY });
    assert.equal(soon.find((c) => c.key === 'expiry')!.state, 'warn');
  });

  test('ไม่มีไฟล์สำเนา → error', () => {
    const checks = verifyIdentity({ personal, passport: fullBook(), hasFile: false, today: TODAY });
    assert.equal(checks.find((c) => c.key === 'file')!.state, 'error');
  });

  test('ข้อมูลไม่ครบ → warn + บอกจำนวนที่ขาด', () => {
    const checks = verifyIdentity({ personal, passport: fullBook({ issueDate: '', placeOfIssue: '' }), hasFile: true, today: TODAY });
    const c = checks.find((x) => x.key === 'complete')!;
    assert.equal(c.state, 'warn');
    assert.match(c.detail!, /ยังขาดข้อมูล 1 รายการ/);
  });

  test('ข้อมูลโปรไฟล์ว่าง → unknown (ไม่ตัดสินว่าไม่ตรง)', () => {
    const checks = verifyIdentity({ personal: { ...personal, firstNameEn: '' }, passport: fullBook(), hasFile: true, today: TODAY });
    assert.equal(checks.find((c) => c.key === 'firstNameEn')!.state, 'unknown');
  });

  test('missingPassportFields คืนช่องที่ขาด', () => {
    assert.deepEqual(missingPassportFields(fullBook({ firstName: '', lastName: '' })), ['firstName', 'lastName']);
  });
});
