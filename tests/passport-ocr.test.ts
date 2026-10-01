import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapOcrToFields, extractVizDates, inferIssueDate, valueAfterLabel,
  composeFullName, scoreToConfidence, buildOcrComparison,
  extractNationalId, extractHeight, extractThaiName,
} from '../src/lib/logic/passportOcrMapping';
import { validatePassportFields, evaluateSetPrimary, resolveCountry, REQUIRED_FIELDS } from '../src/lib/logic/passportValidation';
import { emptyPassportFields } from '../src/data/leaders/passportBookTypes';
import type { Country } from '../src/types';

const TODAY = '2026-07-13';
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const L2 = 'L898902C36UTO7408122F3204159ZE184226B<<<<<10';

const COUNTRIES: Country[] = [
  { id: 'C-UTO', code: 'UT', alpha2: 'UT', alpha3: 'UTO', nameTh: 'ยูโทเปีย', nameEn: 'Utopia', isActive: true },
  { id: 'C-THA', code: 'TH', alpha2: 'TH', alpha3: 'THA', nameTh: 'ไทย', nameEn: 'Thailand', isActive: true },
  { id: 'C-OLD', code: 'XX', alpha2: 'XX', alpha3: 'XXX', nameTh: 'ประเทศปิดใช้งาน', nameEn: 'Closed', isActive: false },
];

describe('§5 scoreToConfidence — แปลงคะแนน engine เป็นระดับความมั่นใจ', () => {
  test('สูง/ปานกลาง/ต่ำ/อ่านไม่ได้', () => {
    assert.equal(scoreToConfidence(92), 'HIGH');
    assert.equal(scoreToConfidence(70), 'MEDIUM');
    assert.equal(scoreToConfidence(40), 'LOW');
    assert.equal(scoreToConfidence(null), 'UNREADABLE');
  });
});

describe('§2/§3 mapOcrToFields — MRZ เป็นแหล่งข้อมูลหลัก', () => {
  const mapped = mapOcrToFields({
    vizText: `PASSPORT\nERIKSSON\nANNA MARIA\nL898902C3\n12 AUG 1974\n15 APR 2032\nDATE OF ISSUE 20 MAR 2022\nISSUING AUTHORITY MINISTRY OF FOREIGN AFFAIRS\nPLACE OF ISSUE BANGKOK\n${L1}\n${L2}`,
    vizLines: [
      { text: 'ISSUING AUTHORITY MINISTRY OF FOREIGN AFFAIRS', confidence: 88 },
      { text: 'PLACE OF ISSUE BANGKOK', confidence: 91 },
    ],
    mrzText: `${L1}\n${L2}`,
    mrzConfidence: 90,
    todayISO: TODAY,
  });

  test('อ่าน MRZ ได้และเติมช่องหลักครบ', () => {
    assert.equal(mapped.succeeded, true);
    assert.equal(mapped.mrzCheck.parsed, true);
    assert.equal(mapped.fields.passportNo.value, 'L898902C3');
    assert.equal(mapped.fields.lastName.value, 'ERIKSSON');
    assert.equal(mapped.fields.firstName.value, 'ANNA MARIA');
    assert.equal(mapped.fields.dateOfBirth.value, '1974-08-12');
    assert.equal(mapped.fields.expiryDate.value, '2032-04-15');
    assert.equal(mapped.fields.gender.value, 'F');
    assert.equal(mapped.fields.nationality.value, 'UTO');
  });

  test('Check Digit ผ่าน + ยืนยันด้วยข้อความบนเล่ม → ความมั่นใจสูง', () => {
    assert.equal(mapped.fields.passportNo.confidence, 'HIGH');
    assert.equal(mapped.fields.passportNo.source, 'MRZ_VIZ');
    assert.equal(mapped.fields.passportNo.mismatch, undefined);
  });

  test('เก็บ MRZ ทั้ง 2 บรรทัดไว้ตรวจย้อนหลัง (§3)', () => {
    assert.equal(mapped.fields.mrzLine1.value, L1);
    assert.equal(mapped.fields.mrzLine2.value, L2);
  });

  test('อ่านหน่วยงานผู้ออก/สถานที่ออกจากคำกำกับบนเล่ม', () => {
    assert.match(mapped.fields.issuingAuthority.value, /MINISTRY OF FOREIGN AFFAIRS/);
    assert.equal(mapped.fields.placeOfIssue.value, 'BANGKOK');
  });

  test('วันที่ออกอนุมานจากวันที่บนเล่ม (ไม่มีใน MRZ) และทำเครื่องหมายให้ตรวจ', () => {
    assert.equal(mapped.fields.issueDate.value, '2022-03-20');
    assert.equal(mapped.fields.issueDate.confidence, 'MEDIUM');
    assert.equal(mapped.fields.issueDate.source, 'VIZ');
  });

  test('ชื่อเต็มประกอบจาก คำนำหน้า+ชื่อ+นามสกุล (§3)', () => {
    assert.equal(mapped.fields.fullName.value, 'ANNA MARIA ERIKSSON');
    assert.equal(mapped.fields.fullName.source, 'DERIVED');
  });

  test('ช่องที่ไม่มีบนเล่ม → เว้นว่าง + UNREADABLE (ห้ามเดา §5)', () => {
    assert.equal(mapped.fields.titleName.value, '');
    assert.equal(mapped.fields.titleName.confidence, 'UNREADABLE');
  });
});

describe('§8 mapOcrToFields — อ่านไม่สำเร็จ', () => {
  test('ไม่มี MRZ และข้อความน้อย → succeeded=false + ระบุสาเหตุ', () => {
    const r = mapOcrToFields({ vizText: 'blurry', vizLines: [], mrzText: '', mrzConfidence: 0, todayISO: TODAY });
    assert.equal(r.succeeded, false);
    assert.equal(r.mrz, null);
    assert.equal(r.mrzCheck.parsed, false);
    assert.ok(r.failureReasons.some((x) => x.includes('MRZ')));
  });

  test('ไม่คืนค่าที่ไม่ได้อ่านมา — ทุกช่องว่าง', () => {
    const r = mapOcrToFields({ vizText: '', vizLines: [], mrzText: '', mrzConfidence: 0, todayISO: TODAY });
    assert.ok(Object.values(r.fields).every((f) => f.value === ''));
  });

  test('MRZ Check Digit ไม่ผ่าน → เตือนและลดความมั่นใจ', () => {
    const badL2 = `${L2.slice(0, 3)}9${L2.slice(4)}`;
    const r = mapOcrToFields({ vizText: '', vizLines: [], mrzText: `${L1}\n${badL2}`, mrzConfidence: 90, todayISO: TODAY });
    assert.equal(r.mrzCheck.passportNoValid, false);
    assert.equal(r.fields.passportNo.confidence, 'LOW');
    assert.ok(r.failureReasons.some((x) => x.includes('Check Digit')));
  });
});

describe('extractVizDates / inferIssueDate — ไม่เดาเมื่อกำกวม', () => {
  test('อ่านวันที่ได้ทั้งแบบชื่อเดือนและตัวเลข', () => {
    const d = extractVizDates('12 AUG 1974 และ 15/04/2032');
    assert.ok(d.includes('1974-08-12'));
    assert.ok(d.includes('2032-04-15'));
  });

  test('เหลือผู้เข้าข่าย 1 ค่า → คืนค่านั้น', () => {
    assert.equal(inferIssueDate(['1974-08-12', '2022-03-20', '2032-04-15'], '1974-08-12', '2032-04-15', TODAY), '2022-03-20');
  });

  test('เข้าข่ายหลายค่า → null (ให้ผู้ใช้กรอกเอง)', () => {
    assert.equal(inferIssueDate(['2020-01-01', '2022-03-20'], '1974-08-12', '2032-04-15', TODAY), null);
  });

  test('ไม่มีค่าเข้าข่าย → null', () => {
    assert.equal(inferIssueDate(['2032-04-15'], '1974-08-12', '2032-04-15', TODAY), null);
  });
});

describe('§5 buildOcrComparison — เทียบค่าปัจจุบันกับ OCR ใหม่', () => {
  const mapped = mapOcrToFields({ vizText: '', vizLines: [], mrzText: `${L1}\n${L2}`, mrzConfidence: 90, todayISO: TODAY });

  test('แสดงเฉพาะช่องที่ OCR อ่านได้ + ตั้งธง differs ถูกต้อง', () => {
    const current = { ...emptyPassportFields(), passportNo: 'L898902C3', lastName: 'CHANGED' };
    const rows = buildOcrComparison(current, mapped.fields, ['passportNo', 'lastName', 'placeOfIssue']);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    // passportNo ตรงกัน → ไม่ต่าง
    assert.equal(byKey.passportNo.differs, false);
    // lastName ต่าง (CHANGED vs ERIKSSON)
    assert.equal(byKey.lastName.differs, true);
    assert.equal(byKey.lastName.ocr, 'ERIKSSON');
    assert.equal(byKey.lastName.current, 'CHANGED');
    // placeOfIssue: OCR อ่านไม่ได้ → ไม่อยู่ในตาราง
    assert.equal(byKey.placeOfIssue, undefined);
  });

  test('ไม่เขียนทับค่าใด — เป็นเพียงข้อมูลเปรียบเทียบ', () => {
    const current = { ...emptyPassportFields(), lastName: 'ORIGINAL' };
    buildOcrComparison(current, mapped.fields, ['lastName']);
    assert.equal(current.lastName, 'ORIGINAL'); // ค่าเดิมไม่ถูกแตะ
  });
});

describe('§3 extractNationalId / extractHeight', () => {
  test('เลขบัตร ปชช. 13 หลัก (มีขีดคั่น)', () => {
    assert.equal(extractNationalId('Identification No. 0-1234-56789-13-5'), '0123456789135');
  });
  test('เลขบัตร ปชช. 13 หลักติดกัน', () => {
    assert.equal(extractNationalId('IDENT NO 0012345678913'), '0012345678913');
  });
  test('ไม่พบเลข 13 หลัก → null (ไม่เดา)', () => {
    assert.equal(extractNationalId('Passport No AC1064962'), null);
  });
  test('ส่วนสูงแบบเมตร / เซนติเมตร', () => {
    assert.equal(extractHeight([{ text: 'Height 1.66M', confidence: 90 }], 'Height 1.66M'), '1.66M');
    assert.equal(extractHeight([], 'HEIGHT 166 CM'), '166CM');
  });
  test('ส่วนสูงอยู่บรรทัดเดียวกับข้อมูลอื่น (เลข ปชช.) → ไม่ปนกัน', () => {
    // ตัวเลข ปชช. ต้องไม่ถูกจับเป็นส่วนสูง — ต้องอ่านค่าหลังคำ HEIGHT เท่านั้น
    assert.equal(extractHeight([{ text: 'Identification No. 0012345678913 Height 1.66M', confidence: 88 }], ''), '1.66M');
  });
  test('ไม่พบส่วนสูง → null', () => {
    assert.equal(extractHeight([], 'NO HEIGHT DATA HERE'), null);
    assert.equal(extractHeight([{ text: 'Identification No. 0012345678913', confidence: 88 }], ''), null);
  });
});

describe('§2 extractThaiName — ชื่อไทยตามเล่ม (ไม่แปลจากอังกฤษ)', () => {
  test('แยกคำนำหน้า/ชื่อ/นามสกุลไทย + เก็บ raw', () => {
    const r = extractThaiName([
      { text: 'Name in Thai', confidence: 88 },
      { text: 'นางสาว มัณฑณิดา โปษณะสวัสดิวงศ์', confidence: 82 },
    ]);
    assert.ok(r);
    assert.equal(r.title, 'นางสาว');
    assert.equal(r.first, 'มัณฑณิดา');
    assert.equal(r.last, 'โปษณะสวัสดิวงศ์');
    assert.equal(r.raw, 'นางสาว มัณฑณิดา โปษณะสวัสดิวงศ์');
  });
  test('ไม่มีบรรทัดไทย → null', () => {
    assert.equal(extractThaiName([{ text: 'MISS MATHANIDA', confidence: 90 }]), null);
  });
});

describe('valueAfterLabel / composeFullName', () => {
  test('อ่านค่าท้ายคำกำกับ', () => {
    const r = valueAfterLabel([{ text: 'PLACE OF ISSUE BANGKOK', confidence: 90 }], ['PLACE OF ISSUE']);
    assert.equal(r?.value, 'BANGKOK');
  });

  test('ไม่พบคำกำกับ → null (เว้นว่าง)', () => {
    assert.equal(valueAfterLabel([{ text: 'SOMETHING', confidence: 90 }], ['PLACE OF ISSUE']), null);
  });

  test('ชื่อเต็มข้ามค่าว่าง', () => {
    assert.equal(composeFullName('', 'ANNA', 'ERIKSSON'), 'ANNA ERIKSSON');
    assert.equal(composeFullName('MR', 'SOMCHAI', 'JAIDEE'), 'MR SOMCHAI JAIDEE');
  });
});

/* ======================= §6 Validation ======================= */

function validFields() {
  return {
    ...emptyPassportFields(),
    passportType: 'P',
    passportNo: 'AB123456',
    firstName: 'SOMCHAI',
    lastName: 'JAIDEE',
    issuingCountry: 'THA',
    nationality: 'THA',
    dateOfBirth: '1990-05-20',
    gender: 'M',
    issueDate: '2022-03-20',
    expiryDate: '2032-03-19',
    issuingAuthority: 'MINISTRY OF FOREIGN AFFAIRS',
  };
}

const base = { countries: COUNTRIES, todayISO: TODAY, mrzCheck: null };

describe('§6 validatePassportFields', () => {
  test('ข้อมูลครบถูกต้อง → บันทึกได้', () => {
    const r = validatePassportFields({ fields: validFields(), ...base });
    assert.equal(r.canConfirm, true);
    assert.equal(r.errors.length, 0);
  });

  test('เลขหนังสือเดินทางว่าง → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), passportNo: '' }, ...base });
    assert.equal(r.canConfirm, false);
    assert.ok(r.errors.some((e) => e.field === 'passportNo'));
  });

  test('เลขหนังสือเดินทางมีอักขระอื่น → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), passportNo: 'AB-1234' }, ...base });
    assert.ok(r.errors.some((e) => e.message.includes('ภาษาอังกฤษและตัวเลข')));
  });

  test('ชื่อเป็นภาษาไทย → error (ต้องตรงตามเล่ม)', () => {
    const r = validatePassportFields({ fields: { ...validFields(), firstName: 'สมชาย' }, ...base });
    assert.ok(r.errors.some((e) => e.field === 'firstName'));
  });

  test('ประเทศผู้ออกไม่อยู่ใน Country Master → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), issuingCountry: 'ZZZ' }, ...base });
    assert.ok(r.errors.some((e) => e.field === 'issuingCountry'));
  });

  test('ประเทศที่ปิดใช้งานใน Master → warning (ไม่บล็อก)', () => {
    const r = validatePassportFields({ fields: { ...validFields(), nationality: 'XXX' }, ...base });
    assert.equal(r.canConfirm, true);
    assert.ok(r.warnings.some((w) => w.field === 'nationality'));
  });

  test('วันเกิดเป็นอนาคต → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), dateOfBirth: '2030-01-01' }, ...base });
    assert.ok(r.errors.some((e) => e.field === 'dateOfBirth'));
  });

  test('วันที่ออกเป็นอนาคต → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), issueDate: '2030-01-01' }, ...base });
    assert.ok(r.errors.some((e) => e.field === 'issueDate'));
  });

  test('วันหมดอายุ <= วันที่ออก → error', () => {
    const r = validatePassportFields({ fields: { ...validFields(), expiryDate: '2022-03-20' }, ...base });
    assert.ok(r.errors.some((e) => e.field === 'expiryDate'));
  });

  test('Check Digit MRZ ไม่ผ่าน → warning (ไม่บล็อกการบันทึก)', () => {
    const r = validatePassportFields({
      fields: validFields(), ...base,
      mrzCheck: { parsed: true, passportNoValid: false, dateOfBirthValid: true, expiryValid: true, compositeValid: true },
    });
    assert.equal(r.canConfirm, true);
    assert.ok(r.warnings.some((w) => w.message.includes('Check Digit')));
  });

  test('เลข Passport ซ้ำ → error พร้อมชื่อเจ้าของ และบันทึกไม่ได้จนกว่าจะยืนยัน (§6)', () => {
    const dup = [{ tourLeaderId: 'TL-000009', leaderName: 'สมหญิง ใจดี' }];
    const blocked = validatePassportFields({ fields: validFields(), ...base, duplicates: dup });
    assert.equal(blocked.canConfirm, false);
    assert.ok(blocked.errors.some((e) => e.message.includes('สมหญิง ใจดี')));

    const acked = validatePassportFields({ fields: validFields(), ...base, duplicates: dup, duplicateAcknowledged: true });
    assert.equal(acked.canConfirm, true);
    assert.ok(acked.warnings.some((w) => w.field === 'passportNo'));
  });

  test('§5 ช่องความมั่นใจต่ำที่ยังไม่ตรวจ → บันทึกไม่ได้', () => {
    const blocked = validatePassportFields({
      fields: validFields(), ...base,
      confidence: { passportNo: 'LOW' },
    });
    assert.equal(blocked.canConfirm, false);

    const verified = validatePassportFields({
      fields: validFields(), ...base,
      confidence: { passportNo: 'LOW' },
      verifiedFields: ['passportNo'],
    });
    assert.equal(verified.canConfirm, true);
  });

  test('ช่องบังคับครบตามสเปก', () => {
    const empty = validatePassportFields({ fields: emptyPassportFields(), ...base });
    for (const key of REQUIRED_FIELDS) {
      assert.ok(empty.errors.some((e) => e.field === key), `ต้องมี error ของช่อง ${key}`);
    }
  });
});

describe('resolveCountry — อ้างอิง Country Master', () => {
  test('หาได้ด้วย alpha-3 / alpha-2 / ชื่ออังกฤษ / ชื่อไทย', () => {
    assert.equal(resolveCountry('THA', COUNTRIES)?.id, 'C-THA');
    assert.equal(resolveCountry('th', COUNTRIES)?.id, 'C-THA');
    assert.equal(resolveCountry('Thailand', COUNTRIES)?.id, 'C-THA');
    assert.equal(resolveCountry('ไทย', COUNTRIES)?.id, 'C-THA');
  });

  test('ไม่พบ → null', () => {
    assert.equal(resolveCountry('ZZZ', COUNTRIES), null);
  });
});

/* ======================= §7 เล่มหลัก ======================= */

describe('§7 evaluateSetPrimary', () => {
  test('เล่มหมดอายุ → ตั้งเป็นเล่มหลักไม่ได้', () => {
    const r = evaluateSetPrimary('2026-01-01', TODAY, null);
    assert.equal(r.allowed, false);
  });

  test('ไม่ระบุวันหมดอายุ → ตั้งไม่ได้', () => {
    const r = evaluateSetPrimary('', TODAY, null);
    assert.equal(r.allowed, false);
  });

  test('ยังไม่มีเล่มหลัก → ตั้งได้ ไม่ต้องยืนยัน', () => {
    const r = evaluateSetPrimary('2032-01-01', TODAY, null);
    assert.equal(r.allowed, true);
    assert.ok(r.allowed && r.needsConfirm === false);
    assert.ok(r.allowed && r.warning === null);
  });

  test('มีเล่มหลักอยู่แล้ว → ต้องยืนยัน และแจ้งว่าเล่มเดิมจะเป็นเล่มรอง', () => {
    const r = evaluateSetPrimary('2032-01-01', TODAY, { label: 'AB123456' });
    assert.ok(r.allowed && r.needsConfirm === true);
    assert.match((r.allowed && r.confirmMessage) || '', /เล่มรอง/);
  });

  test('เหลืออายุน้อยกว่า 180 วัน → เตือนก่อนตั้ง', () => {
    const r = evaluateSetPrimary('2026-10-01', TODAY, null); // ~80 วัน
    assert.ok(r.allowed && r.warning !== null);
    assert.match((r.allowed && r.warning) || '', /180 วัน/);
  });
});
