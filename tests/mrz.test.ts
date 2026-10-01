import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mrzCheckDigit, verifyCheckDigit, mrzDateToISO, parseMrzName,
  normalizeMrzLine, findMrzLines, parseMrzTd3, MRZ_TD3_LENGTH,
} from '../src/lib/logic/mrz';

/**
 * ตัวอย่าง MRZ จากเอกสารมาตรฐาน ICAO 9303 Part 3 (ตัวอย่างสาธารณะสำหรับทดสอบ)
 * ไม่ใช่ข้อมูลบุคคลจริงในระบบ — ใช้ยืนยันว่าสูตร Check Digit ถูกต้อง
 */
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const TODAY = '2026-07-13';

describe('MRZ Check Digit (ICAO 9303 — น้ำหนัก 7,3,1)', () => {
  test('ตัวอย่างมาตรฐาน: เลขเอกสาร L898902C3 → check digit 6', () => {
    assert.equal(mrzCheckDigit('L898902C3'), 6);
    assert.ok(verifyCheckDigit('L898902C3', '6'));
  });

  test('วันเกิด 740812 → check digit 2', () => {
    assert.equal(mrzCheckDigit('740812'), 2);
  });

  test('วันหมดอายุ 120415 → check digit 9', () => {
    assert.equal(mrzCheckDigit('120415'), 9);
  });

  test("'<' มีค่าเป็น 0 และตัวอักษร A=10", () => {
    assert.equal(mrzCheckDigit('<'), 0);
    assert.equal(mrzCheckDigit('A'), 70 % 10); // 10*7 = 70 → 0
  });

  test('อักขระนอกชุด MRZ → null (อ่านผิด ไม่เดา)', () => {
    assert.equal(mrzCheckDigit('L8989@2C3'), null);
    assert.equal(verifyCheckDigit('L8989@2C3', '6'), false);
  });

  test("check digit '<' (ไม่ระบุ) ถือว่าไม่ผ่าน", () => {
    assert.equal(verifyCheckDigit('740812', '<'), false);
  });
});

describe('mrzDateToISO — แปลงวันที่ 2 หลักเป็น ISO', () => {
  test('วันเกิด 740812 → 1974-08-12 (อดีตเสมอ)', () => {
    assert.equal(mrzDateToISO('740812', TODAY, 'birth'), '1974-08-12');
  });

  test('วันเกิด 100101 → 2010-01-01 (ปีน้อยกว่าปีปัจจุบัน)', () => {
    assert.equal(mrzDateToISO('100101', TODAY, 'birth'), '2010-01-01');
  });

  test('วันหมดอายุ 300415 → 2030-04-15 (อนาคต)', () => {
    assert.equal(mrzDateToISO('300415', TODAY, 'expiry'), '2030-04-15');
  });

  test('วันที่ไม่มีจริง (31 ก.พ.) → null', () => {
    assert.equal(mrzDateToISO('740231', TODAY, 'birth'), null);
  });

  test('เดือน 13 → null', () => {
    assert.equal(mrzDateToISO('741301', TODAY, 'birth'), null);
  });

  test('ไม่ใช่ตัวเลข 6 หลัก → null', () => {
    assert.equal(mrzDateToISO('7408<2', TODAY, 'birth'), null);
    assert.equal(mrzDateToISO('74081', TODAY, 'birth'), null);
  });
});

describe('parseMrzName — ชื่อตามเล่ม (ห้ามแปลง/แปลไทย)', () => {
  test('SURNAME<<GIVEN<MIDDLE → แยกนามสกุล/ชื่อ', () => {
    const r = parseMrzName('ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<');
    assert.equal(r.lastName, 'ERIKSSON');
    assert.equal(r.firstName, 'ANNA MARIA');
  });

  test('มีเฉพาะนามสกุล', () => {
    const r = parseMrzName('SOMCHAI<<<<<<<<<');
    assert.equal(r.lastName, 'SOMCHAI');
    assert.equal(r.firstName, '');
  });
});

describe('normalizeMrzLine / findMrzLines', () => {
  test('ตัดช่องว่าง + แปลงอักขระแปลกเป็น <', () => {
    assert.equal(normalizeMrzLine('p<uto eriksson'), 'P<UTOERIKSSON');
  });

  test('หา 2 บรรทัด MRZ จากข้อความทั้งหน้า', () => {
    const text = `PASSPORT\nKINGDOM OF SOMEWHERE\n${L1}\n${L2}\n`;
    const found = findMrzLines(text);
    assert.ok(found);
    assert.equal(found.line1.length, MRZ_TD3_LENGTH);
    assert.equal(found.line2.length, MRZ_TD3_LENGTH);
    assert.equal(found.line2.slice(0, 9), 'L898902C3');
  });

  test('ไม่มี MRZ → null (ไม่เดา)', () => {
    assert.equal(findMrzLines('PASSPORT\nชื่อ นามสกุล\n'), null);
  });
});

describe('parseMrzTd3 — อ่านข้อมูลจาก MRZ', () => {
  const p = parseMrzTd3(L1, L2, TODAY);

  test('อ่านได้และ Check Digit หลักผ่านครบ', () => {
    assert.ok(p);
    assert.equal(p.checks.passportNo, true);
    assert.equal(p.checks.dateOfBirth, true);
    assert.equal(p.checks.expiry, true);
    assert.equal(p.checks.composite, true);
    assert.equal(p.allChecksPassed, true);
  });

  test('ได้ค่าตรงตามเล่ม (เก็บอังกฤษตามต้นฉบับ)', () => {
    assert.ok(p);
    assert.equal(p.documentCode, 'P');
    assert.equal(p.issuingCountry, 'UTO');
    assert.equal(p.passportNo, 'L898902C3');
    assert.equal(p.nationality, 'UTO');
    assert.equal(p.lastName, 'ERIKSSON');
    assert.equal(p.firstName, 'ANNA MARIA');
    assert.equal(p.gender, 'F');
    assert.equal(p.dateOfBirth, '1974-08-12');
    assert.equal(p.expiryDate, '2012-04-15');
  });

  test('เลข MRZ ผิด 1 ตัว → Check Digit จับได้ (ไม่ผ่าน)', () => {
    const broken = L2.slice(0, 3) + '9' + L2.slice(4); // แก้เลขเอกสาร
    const r = parseMrzTd3(L1, broken, TODAY);
    assert.ok(r);
    assert.equal(r.checks.passportNo, false);
    assert.equal(r.allChecksPassed, false);
  });

  test('สั้นเกินกว่าจะเป็น MRZ → null', () => {
    assert.equal(parseMrzTd3('P<UTO', L2, TODAY), null);
    assert.equal(parseMrzTd3(L1, 'L898902C36UTO', TODAY), null); // บรรทัด 2 ไม่ถึง 28 ตัว
  });

  test('ไม่มีเลขส่วนบุคคล → personalNumber check = null (ไม่ใช่ false)', () => {
    const noPersonal = `${L2.slice(0, 28)}${'<'.repeat(14)}${L2.slice(42)}`;
    const r = parseMrzTd3(L1, noPersonal, TODAY);
    assert.ok(r);
    assert.equal(r.checks.personalNumber, null);
  });

  test('อ่านบรรทัดครบ → complete = true', () => {
    assert.equal(parseMrzTd3(L1, L2, TODAY)?.complete, true);
  });
});

/**
 * OCR มักอ่านแถบเติม '<<<<' ท้ายบรรทัดผิดหรือหายไป
 * ข้อมูลสำคัญอยู่ตำแหน่ง 0-27 ซึ่งไม่เลื่อน จึงต้องอ่านต่อได้และตรวจ Check Digit ได้ตามปกติ
 */
describe('§2 ทนต่อกรณีส่วนท้าย MRZ ขาด (OCR อ่านแถบเติมผิด)', () => {
  const truncated2 = L2.slice(0, 28); // เหลือเฉพาะส่วนข้อมูล
  const r = parseMrzTd3(L1, truncated2, TODAY);

  test('ยังอ่านข้อมูลสำคัญได้ครบ', () => {
    assert.ok(r);
    assert.equal(r.passportNo, 'L898902C3');
    assert.equal(r.dateOfBirth, '1974-08-12');
    assert.equal(r.expiryDate, '2012-04-15');
    assert.equal(r.nationality, 'UTO');
    assert.equal(r.gender, 'F');
  });

  test('Check Digit ต้นบรรทัดยังตรวจได้และผ่าน', () => {
    assert.ok(r);
    assert.equal(r.checks.passportNo, true);
    assert.equal(r.checks.dateOfBirth, true);
    assert.equal(r.checks.expiry, true);
  });

  test('Check Digit ส่วนท้ายตรวจไม่ได้ → null (ไม่รายงานว่า "ไม่ผ่าน")', () => {
    assert.ok(r);
    assert.equal(r.complete, false);
    assert.equal(r.checks.composite, null);
    assert.equal(r.checks.personalNumber, null);
    assert.equal(r.allChecksPassed, true);
  });

  test('เลขผิดยังถูกจับได้แม้บรรทัดขาด', () => {
    const bad = `${truncated2.slice(0, 3)}9${truncated2.slice(4)}`;
    const r2 = parseMrzTd3(L1, bad, TODAY);
    assert.ok(r2);
    assert.equal(r2.checks.passportNo, false);
    assert.equal(r2.allChecksPassed, false);
  });

  test('ชื่อ: ตัดตัวอักษรซ้ำท้ายที่เกิดจาก OCR อ่านแถบเติมผิด', () => {
    // OCR อ่าน '<<<<<' เป็น 'LLLLL'
    const noisy = 'P<UTOERIKSSON<<ANNA<MARIA<LLLLLLLLLLLLLLLLLL';
    const r3 = parseMrzTd3(noisy, L2, TODAY);
    assert.ok(r3);
    assert.equal(r3.lastName, 'ERIKSSON');
    assert.equal(r3.firstName, 'ANNA MARIA');
  });

  test('ชื่อจริงที่ลงท้ายตัวซ้ำไม่เกิน 3 ตัวไม่ถูกตัด', () => {
    const name = parseMrzName('LEE<<AAB');
    assert.equal(name.firstName, 'AAB');
  });

  test('findMrzLines รับบรรทัดที่ท้ายขาดได้', () => {
    const found = findMrzLines(`${L1}\n${truncated2}\n`);
    assert.ok(found);
    assert.equal(found.line2.slice(0, 9), 'L898902C3');
  });
});
