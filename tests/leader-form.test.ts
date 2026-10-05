/**
 * เทสต์ตรรกะฟอร์มหัวหน้าทัวร์ — ครอบคลุมบุคคลไทย / บุคคลต่างชาติ / การสลับประเภท /
 * การคัดลอกที่อยู่ / ช่องทางหลัก / validation
 *
 * รันด้วย: npm test   (node:test + tsx — ไม่ต้องมี framework เพิ่ม)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyLeaderForm,
  formToLeader,
  leaderToForm,
  type LeaderFormState,
} from '@/modules/tour-leaders/mappers';
import { validateLeaderForm, validateContactValue } from '@/modules/tour-leaders/validation';
import { removeContact, setPrimaryContact } from '@/modules/tour-leaders/utils';
import {
  districtLabel,
  districtsOf,
  findProvinceByName,
  postalCodesOf,
  searchProvinces,
  subdistrictLabel,
  subdistrictsOf,
} from '@/data/thaiAdmin';
import { selectDistrict, selectProvince, selectSubdistrict } from '@/modules/tour-leaders/address';
import { nextHighlight } from '@/components/ui/Combobox';
import {
  NOTE_MAX_LENGTH,
  TITLE_OPTIONS,
  TITLE_OPTIONS_EN,
  TITLE_TH_TO_EN,
} from '@/modules/tour-leaders/constants';
import type { ContactChannel, LanguageSkill } from '@/types';

/** สร้าง LanguageSkill แบบย่อสำหรับเทสต์ — level: 'native' หรือรหัสระดับ (เช่น 'B1') */
const langSkill = (id: string, language: string, level: string): LanguageSkill => ({
  id,
  languageCode: language,
  languageName: language,
  isNativeLanguage: level === 'native',
  standard: 'GENERAL',
  levelCode: level === 'native' ? null : level,
  levelName: level === 'native' ? null : level,
  levelRank: level === 'native' ? null : 3,
});

const TODAY = '2026-07-14';
const BUILD = { routes: [], actor: 'tester', now: '2026-07-14T10:00:00Z', today: TODAY };
const VCTX = { existingLeaders: [], isNew: true, today: TODAY };

const base = () => emptyLeaderForm('TL-900', TODAY);

const phone = (): ContactChannel => ({
  id: 'CC-1',
  type: 'phone',
  value: '081-234-5678',
  isPrimary: true,
  label: 'เบอร์หลัก',
});

/** ฟอร์มคนไทยที่กรอกครบและบันทึกผ่าน */
const thaiForm = (): LeaderFormState => ({
  ...base(),
  personType: 'thai',
  firstName: 'สมชาย',
  lastName: 'ทดสอบ',
  nickname: 'ชาย',
  birthDate: '1990-01-01',
  nationalIdNumber: '1234567890123',
  nationalIdExpiresAt: '2030-01-01',
  // จังหวัดถูกเลือกจาก Master → มีทั้งรหัสและชื่อ
  address: {
    houseNo: '99/1',
    province: 'กรุงเทพมหานคร',
    provinceCode: '10',
    postalCode: '10230',
    countryId: 'C-TH',
  },
  idCardSameAsCurrent: true,
  contacts: [phone()],
  languages: [langSkill('L-1', 'ไทย', 'native')],
});

/** ฟอร์มบุคคลต่างชาติที่กรอกครบและบันทึกผ่าน */
const foreignForm = (): LeaderFormState => ({
  ...base(),
  personType: 'foreigner',
  title: 'Mr.',
  firstName: '',
  lastName: '',
  nickname: '',
  firstNameEn: 'John',
  lastNameEn: "O'Brien",
  birthDate: '1990-01-01',
  nationalityCountryId: 'C-JP',
  birthCountryId: 'C-JP',
  passportNumber: 'AA1234567',
  passportCountryId: 'C-JP',
  passportIssuedAt: '2024-01-01',
  passportExpiresAt: '2030-01-01',
  visaStatus: 'not_applicable',
  workPermitStatus: 'none',
  address: { houseNo: '12/3', province: 'ภูเก็ต', postalCode: '83000', countryId: 'C-TH' },
  contacts: [phone()],
  languages: [langSkill('L-1', 'อังกฤษ', 'native')],
});

const generalErrors = (form: LeaderFormState) =>
  validateLeaderForm(form, VCTX)
    .errors.filter((e) => e.step === 'general')
    .map((e) => e.field);

/* ------------------------------- บุคคลสัญชาติไทย ------------------------------- */

describe('บุคคลสัญชาติไทย', () => {
  test('กรอกครบแล้วไม่มีข้อผิดพลาดในขั้นตอนข้อมูลทั่วไป', () => {
    assert.deepEqual(generalErrors(thaiForm()), []);
  });

  test('สัญชาติถูกกำหนดเป็นไทยอัตโนมัติตอนบันทึก', () => {
    const record = formToLeader({ ...thaiForm(), nationalityCountryId: 'C-JP' }, BUILD);
    assert.equal(record.nationalityCountryId, 'C-TH');
  });

  test('เลขบัตรประชาชนถูกปิดบังก่อนบันทึกเสมอ', () => {
    const record = formToLeader(thaiForm(), BUILD);
    assert.equal(record.nationalIdNumber, 'xxxxxxxxx0123');
    assert.ok(!record.nationalIdNumber?.includes('12345'));
  });

  test('เลขบัตรไม่ครบ 13 หลัก → error บอกวิธีแก้', () => {
    const result = validateLeaderForm({ ...thaiForm(), nationalIdNumber: '123' }, VCTX);
    const error = result.errors.find((e) => e.field === 'nationalIdNumber');
    assert.ok(error);
    assert.match(error.message, /13 หลัก/);
  });

  test('§2/§3 บัตรประชาชนไม่บังคับ — เว้นว่างทั้งเลขและวันหมดอายุ → ไม่มี error', () => {
    const fields = generalErrors({ ...thaiForm(), nationalIdNumber: '', nationalIdExpiresAt: '' });
    assert.ok(!fields.includes('nationalIdNumber'));
    assert.ok(!fields.includes('nationalIdExpiresAt'));
  });

  test('§3 ไม่บังคับกรอกเลขบัตรและวันหมดอายุพร้อมกัน (มีอย่างใดอย่างหนึ่งก็ไม่ error required)', () => {
    // มีวันหมดอายุ แต่ไม่มีเลขบัตร → ไม่มี error required ของทั้งสองช่อง
    const onlyExpiry = generalErrors({ ...thaiForm(), nationalIdNumber: '', nationalIdExpiresAt: '2030-01-01' });
    assert.ok(!onlyExpiry.includes('nationalIdNumber'));
    assert.ok(!onlyExpiry.includes('nationalIdExpiresAt'));
    // มีเลขบัตรครบ 13 หลัก แต่ไม่มีวันหมดอายุ → ไม่มี error required
    const onlyNumber = generalErrors({ ...thaiForm(), nationalIdNumber: '1234567890123', nationalIdExpiresAt: '' });
    assert.ok(!onlyNumber.includes('nationalIdExpiresAt'));
  });

  test('§3 กรอกเลขบัตรไม่ถูกต้องยังตรวจ format · วันหมดอายุเว้นว่างได้', () => {
    const fields = generalErrors({ ...thaiForm(), nationalIdNumber: '12', nationalIdExpiresAt: '' });
    assert.ok(fields.includes('nationalIdNumber')); // format ยังตรวจเมื่อกรอก
    assert.ok(!fields.includes('nationalIdExpiresAt')); // วันหมดอายุไม่บังคับ
  });

  test('§3 ที่อยู่ปัจจุบันไม่บังคับ — เว้นว่างทั้ง Section → ไม่มี error', () => {
    const fields = generalErrors({
      ...thaiForm(),
      address: { houseNo: '', countryId: 'C-TH' },
    });
    assert.ok(!fields.includes('houseNo'));
    assert.ok(!fields.includes('province'));
    assert.ok(!fields.includes('postalCode'));
  });

  test('ไม่ส่งข้อมูลของบุคคลต่างชาติไปบันทึก แม้มีค่าตกค้างในฟอร์ม', () => {
    const record = formToLeader(
      { ...thaiForm(), passportNumber: 'AA1234567', visaStatus: 'has', birthCountryId: 'C-JP' },
      BUILD,
    );
    assert.equal(record.passportNumber, undefined);
    assert.equal(record.visaStatus, undefined);
    // ประเทศที่เกิดเก็บได้ทุกคน (คนไทยไม่บังคับ) — ไม่ใช่ข้อมูลเฉพาะชาวต่างชาติแล้ว
    assert.equal(record.birthCountryId, 'C-JP');
    assert.equal(record.homeCountryAddress, undefined);
  });
});

/* -------------------------------- บุคคลต่างชาติ -------------------------------- */

describe('บุคคลต่างชาติ', () => {
  test('กรอกครบแล้วไม่มีข้อผิดพลาด (วีซ่า/ใบอนุญาต = ไม่เกี่ยวข้อง/ไม่มี)', () => {
    assert.deepEqual(generalErrors(foreignForm()), []);
  });

  test('ไม่บังคับชื่อไทย แต่บังคับชื่อตามหนังสือเดินทาง', () => {
    const fields = generalErrors({ ...foreignForm(), firstNameEn: '', lastNameEn: '' });
    assert.ok(fields.includes('firstNameEn'));
    assert.ok(fields.includes('lastNameEn'));
    assert.ok(!fields.includes('firstName'));
    assert.ok(!fields.includes('lastName'));
  });

  test('ฟิลด์ที่ซ่อน (บัตรประชาชน / ที่อยู่ตามบัตร) ไม่ถูกบังคับ', () => {
    const fields = generalErrors(foreignForm());
    assert.ok(!fields.some((f) => f.startsWith('nationalId') || f.startsWith('idCard')));
  });

  test('สัญชาติไทยใช้กับบุคคลต่างชาติไม่ได้', () => {
    const fields = generalErrors({ ...foreignForm(), nationalityCountryId: 'C-TH' });
    assert.ok(fields.includes('nationality'));
  });

  test('ชื่ออังกฤษรองรับ apostrophe และขีดกลาง แต่ปฏิเสธตัวเลข', () => {
    assert.deepEqual(generalErrors({ ...foreignForm(), lastNameEn: 'Anne-Marie' }), []);
    assert.ok(generalErrors({ ...foreignForm(), firstNameEn: 'John123' }).includes('firstNameEn'));
  });

  test('วีซ่าสถานะ "มี" → บังคับประเภท/หมายเลข/วันหมดอายุ', () => {
    const fields = generalErrors({ ...foreignForm(), visaStatus: 'has' });
    assert.deepEqual(fields, ['visaType', 'visaNumber', 'visaExpiresAt']);
  });

  test('วีซ่าสถานะ "ไม่มี" → ไม่บันทึกรายละเอียดวีซ่าที่ตกค้าง', () => {
    const record = formToLeader(
      { ...foreignForm(), visaStatus: 'none', visaNumber: 'V-1', visaExpiresAt: '2027-01-01' },
      BUILD,
    );
    assert.equal(record.visaStatus, 'none');
    assert.equal(record.visaNumber, undefined);
    assert.equal(record.visaExpiresAt, undefined);
  });

  test('วันหมดอายุก่อนวันที่ออก → error · หมดอายุแล้ว → warning (บันทึกได้)', () => {
    const bad = validateLeaderForm({ ...foreignForm(), passportExpiresAt: '2023-01-01' }, VCTX);
    assert.ok(bad.errors.some((e) => e.field === 'passportExpiresAt'));

    const expired = validateLeaderForm({ ...foreignForm(), passportExpiresAt: '2026-01-01' }, VCTX);
    assert.ok(expired.ok, 'เอกสารหมดอายุต้องไม่บล็อกการบันทึก');
    assert.ok(expired.warnings.some((w) => w.field === 'passportExpiresAt'));
  });

  test('ใกล้หมดอายุ (ภายใน 120 วัน) → warning', () => {
    const soon = validateLeaderForm({ ...foreignForm(), passportExpiresAt: '2026-08-01' }, VCTX);
    assert.ok(soon.ok);
    const warning = soon.warnings.find((w) => w.field === 'passportExpiresAt');
    assert.ok(warning);
    assert.match(warning.message, /หมดอายุในอีก/);
  });

  test('ชื่อที่แสดงใช้ชื่อตามหนังสือเดินทางเมื่อไม่มีชื่อไทย', () => {
    const record = formToLeader(foreignForm(), BUILD);
    assert.equal(record.firstName, 'John');
    assert.equal(record.lastName, "O'Brien");
    assert.equal(record.passportNumber, 'xxxxx4567');
  });
});

/* ------------------------------ การสลับประเภทบุคคล ------------------------------ */

describe('สลับประเภทบุคคล', () => {
  test('บันทึกเป็นต่างชาติ → ข้อมูลคนไทยที่ตกค้างไม่ถูกส่งไป และกลับกัน', () => {
    const mixed: LeaderFormState = {
      ...foreignForm(),
      nationalIdNumber: '1234567890123',
      nationalIdExpiresAt: '2030-01-01',
      idCardSameAsCurrent: true,
    };
    const record = formToLeader(mixed, BUILD);
    assert.equal(record.nationalIdNumber, undefined);
    assert.equal(record.idCardAddress, undefined);
    assert.equal(record.idCardAddressSameAsCurrent, undefined);
    assert.equal(record.personType, 'foreigner');
  });

  test('ข้อมูลส่วนกลาง (รูป / รหัส / ช่องทางติดต่อ) ไม่ถูกล้างตอนเปลี่ยนประเภท', () => {
    const withPhoto: LeaderFormState = { ...thaiForm(), photoUrl: 'data:image/png;base64,AAA' };
    const record = formToLeader({ ...withPhoto, personType: 'foreigner' }, BUILD);
    assert.equal(record.photoUrl, 'data:image/png;base64,AAA');
    assert.equal(record.id, 'TL-900');
    assert.equal(record.contacts.length, 1);
  });

  test('leaderToForm → formToLeader วนกลับได้โดยข้อมูลไม่เพี้ยน', () => {
    const record = formToLeader(thaiForm(), BUILD);
    const roundTrip = formToLeader(leaderToForm(record), { ...BUILD, existing: record });
    assert.equal(roundTrip.personType, record.personType);
    assert.equal(roundTrip.nationalIdNumber, record.nationalIdNumber);
    assert.deepEqual(roundTrip.idCardAddress, record.idCardAddress);
  });
});

/* ------------------------------- การคัดลอกที่อยู่ ------------------------------- */

describe('ที่อยู่ตามบัตรประชาชน', () => {
  test('ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" → บันทึกสำเนาที่อยู่ปัจจุบัน', () => {
    const record = formToLeader(thaiForm(), BUILD);
    assert.equal(record.idCardAddressSameAsCurrent, true);
    assert.deepEqual(record.idCardAddress, record.address);
  });

  test('ติ๊กไว้ → แก้ที่อยู่ปัจจุบันแล้วที่อยู่ตามบัตรตามไปด้วย', () => {
    const form = thaiForm();
    const moved: LeaderFormState = {
      ...form,
      address: { ...form.address, province: 'เชียงใหม่' },
    };
    const record = formToLeader(moved, BUILD);
    assert.equal(record.idCardAddress?.province, 'เชียงใหม่');
  });

  test('§5 ไม่ติ๊ก + เว้นว่างที่อยู่ตามบัตร → ไม่บังคับ ไม่มี error', () => {
    const fields = generalErrors({
      ...thaiForm(),
      idCardSameAsCurrent: false,
      idCardAddress: { houseNo: '', countryId: 'C-TH' },
    });
    assert.ok(!fields.some((f) => f.startsWith('idCard')));
  });

  test('§4 ที่อยู่ตามบัตร: กรอกไปรษณีย์ไม่ครบ 5 หลัก → error เฉพาะช่องนั้น', () => {
    const fields = generalErrors({
      ...thaiForm(),
      idCardSameAsCurrent: false,
      idCardAddress: { houseNo: '99', postalCode: '123', countryId: 'C-TH' },
    });
    assert.ok(fields.includes('idCardPostalCode'));
    assert.ok(!fields.includes('idCardHouseNo')); // ช่องอื่นที่เว้นว่างไม่ error
  });

});

/* --------------------------- ที่อยู่ในประเทศต้นทาง (สวิตช์) --------------------------- */

describe('ที่อยู่ในประเทศต้นทาง (ข้อมูลเสริม)', () => {
  const filledHome = (): LeaderFormState => ({
    ...foreignForm(),
    hasHomeCountryAddress: true,
    homeCountryAddress: {
      houseNo: '2-1 Nishi-Shinjuku',
      district: 'Tokyo',
      province: 'Kanto',
      postalCode: '100-0001',
      countryId: 'C-JP',
    },
  });

  test('ค่าเริ่มต้นของสวิตช์เป็น "ปิด"', () => {
    assert.equal(emptyLeaderForm('TL-901', TODAY).hasHomeCountryAddress, false);
  });

  test('สวิตช์ปิด → validation ไม่ตรวจช่องที่ถูกซ่อน', () => {
    // แม้มีข้อมูลค้างอยู่ในฟอร์ม แต่สวิตช์ปิด ต้องไม่มี error และบันทึกได้
    const off: LeaderFormState = { ...filledHome(), hasHomeCountryAddress: false };
    assert.deepEqual(generalErrors(off), []);
    assert.ok(validateLeaderForm(off, VCTX).ok);
  });

  test('สวิตช์ปิด → ไม่ส่งที่อยู่ประเทศต้นทางไปใน payload', () => {
    const record = formToLeader({ ...filledHome(), hasHomeCountryAddress: false }, BUILD);
    assert.equal(record.homeCountryAddress, undefined);
    // ที่อยู่ปัจจุบันในประเทศไทยเป็นคนละส่วน ต้องไม่ถูกกระทบ
    assert.equal(record.address.province, 'ภูเก็ต');
  });

  test('สวิตช์เปิด → บังคับ "ที่อยู่" และ "ประเทศ" เท่านั้น', () => {
    const empty: LeaderFormState = {
      ...foreignForm(),
      hasHomeCountryAddress: true,
      homeCountryAddress: { houseNo: '', countryId: '' },
    };
    assert.deepEqual(generalErrors(empty), ['homeAddressLine', 'homeCountry']);

    // เมือง / รัฐ / รหัสไปรษณีย์ ไม่บังคับ
    const minimal: LeaderFormState = {
      ...foreignForm(),
      hasHomeCountryAddress: true,
      homeCountryAddress: { houseNo: '2-1 Nishi-Shinjuku', countryId: 'C-JP' },
    };
    assert.deepEqual(generalErrors(minimal), []);
  });

  test('สวิตช์เปิด → บันทึกที่อยู่ประเทศต้นทางลง payload ครบ', () => {
    const record = formToLeader(filledHome(), BUILD);
    assert.equal(record.homeCountryAddress?.houseNo, '2-1 Nishi-Shinjuku');
    assert.equal(record.homeCountryAddress?.countryId, 'C-JP');
    assert.equal(record.homeCountryAddress?.postalCode, '100-0001');
  });

  test('ยืนยันแล้วล้างข้อมูล → ทั้งสวิตช์และข้อมูลถูกล้าง ไม่นำไปบันทึก', () => {
    // จำลองผลของการกด "ยกเลิกและล้างข้อมูล" ใน dialog
    const cleared: LeaderFormState = {
      ...filledHome(),
      hasHomeCountryAddress: false,
      homeCountryAddress: { houseNo: '', countryId: '' },
    };
    const record = formToLeader(cleared, BUILD);
    assert.equal(record.homeCountryAddress, undefined);
    assert.deepEqual(generalErrors(cleared), []);
  });

  test('ยกเลิก dialog → สวิตช์ยังเปิดและข้อมูลเดิมยังอยู่', () => {
    // ไม่มีการเปลี่ยน state ใด ๆ — ฟอร์มยังต้องบันทึกที่อยู่เดิมได้
    const record = formToLeader(filledHome(), BUILD);
    assert.equal(filledHome().hasHomeCountryAddress, true);
    assert.equal(record.homeCountryAddress?.district, 'Tokyo');
  });

  test('สลับกลับเป็นบุคคลสัญชาติไทย → ไม่บันทึกที่อยู่ประเทศต้นทาง', () => {
    const record = formToLeader({ ...filledHome(), personType: 'thai' }, BUILD);
    assert.equal(record.homeCountryAddress, undefined);
  });
});

/* ------------------------------- กลุ่มช่องชื่อ ------------------------------- */

describe('ชื่อภาษาไทย / ภาษาอังกฤษ', () => {
  test('คำนำหน้าไทยมี 4 ตัวเลือก · คำนำหน้า EN มี 6 ตัวเลือก', () => {
    assert.deepEqual(TITLE_OPTIONS, ['นาย', 'นาง', 'นางสาว', 'อื่น ๆ']);
    assert.deepEqual(TITLE_OPTIONS_EN, ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Other']);
  });

  test('เลือกคำนำหน้าไทย → เติมคำนำหน้าอังกฤษให้อัตโนมัติ', () => {
    assert.equal(TITLE_TH_TO_EN['นาย'], 'Mr.');
    assert.equal(TITLE_TH_TO_EN['นาง'], 'Mrs.');
    assert.equal(TITLE_TH_TO_EN['นางสาว'], 'Miss');
    assert.equal(TITLE_TH_TO_EN['อื่น ๆ'], 'Other');
  });

  test('แก้คำนำหน้าอังกฤษเองแล้วค่านั้นถูกบันทึก (ไม่ถูกทับด้วยค่าที่แปลงจากไทย)', () => {
    const record = formToLeader({ ...thaiForm(), title: 'นาย', titleEn: 'Dr.' }, BUILD);
    assert.equal(record.title, 'นาย');
    assert.equal(record.titleEn, 'Dr.');
  });

  test('ข้อมูลเดิมที่ยังไม่มีคำนำหน้าอังกฤษ → แปลงจากคำนำหน้าไทยตอนโหลดเข้าฟอร์ม', () => {
    const record = formToLeader(thaiForm(), BUILD);
    const reloaded = leaderToForm({ ...record, title: 'นางสาว', titleEn: undefined });
    assert.equal(reloaded.titleEn, 'Miss');
  });

  test('ชื่อไทยรองรับอักษรไทย ช่องว่าง จุด และขีด — ปฏิเสธอักษรอังกฤษและตัวเลข', () => {
    assert.deepEqual(generalErrors({ ...thaiForm(), firstName: 'ณัฐ-ชนก' }), []);
    assert.deepEqual(generalErrors({ ...thaiForm(), lastName: 'ศรี สุข' }), []);
    assert.ok(generalErrors({ ...thaiForm(), firstName: 'Somchai' }).includes('firstName'));
    assert.ok(generalErrors({ ...thaiForm(), lastName: 'ทดสอบ123' }).includes('lastName'));
  });

  test('ชื่ออังกฤษรองรับ ตัวอักษร ช่องว่าง จุด ขีด และ apostrophe', () => {
    assert.deepEqual(generalErrors({ ...thaiForm(), firstNameEn: "O'Brien-Smith Jr." }), []);
    assert.ok(generalErrors({ ...thaiForm(), firstNameEn: 'สมชาย' }).includes('firstNameEn'));
  });

  test('ชื่อเล่นไม่บังคับทั้งไทยและอังกฤษ', () => {
    const noNickname: LeaderFormState = { ...thaiForm(), nickname: '', nicknameEn: '' };
    assert.deepEqual(generalErrors(noNickname), []);
    const record = formToLeader(noNickname, BUILD);
    assert.equal(record.nickname, '');
    assert.equal(record.nicknameEn, undefined);
  });

  test('ชื่อเล่นอังกฤษถูกตรวจรูปแบบเมื่อกรอกแล้ว และถูกบันทึก', () => {
    assert.ok(generalErrors({ ...thaiForm(), nicknameEn: 'ชาย' }).includes('nicknameEn'));
    const record = formToLeader({ ...thaiForm(), nicknameEn: 'Chai' }, BUILD);
    assert.equal(record.nicknameEn, 'Chai');
  });

  test('บุคคลสัญชาติไทย: ชื่อ-นามสกุลไทยบังคับ · ชื่ออังกฤษไม่บังคับ', () => {
    const fields = generalErrors({
      ...thaiForm(),
      firstName: '',
      lastName: '',
      firstNameEn: '',
      lastNameEn: '',
    });
    assert.ok(fields.includes('firstName'));
    assert.ok(fields.includes('lastName'));
    assert.ok(!fields.includes('firstNameEn'));
    assert.ok(!fields.includes('lastNameEn'));
  });
});

/* ------------------- ที่อยู่: จังหวัด → อำเภอ → ตำบล → ไปรษณีย์ ------------------- */

describe('Autocomplete จังหวัด / อำเภอ / ตำบล', () => {
  const bangkok = () => findProvinceByName('กรุงเทพมหานคร')!;
  const chiangMai = () => findProvinceByName('เชียงใหม่')!;
  const huaiKhwang = () => districtsOf('10').find((d) => d.nameTh === 'ห้วยขวาง')!;
  const watthana = () => districtsOf('10').find((d) => d.nameTh === 'วัฒนา')!;

  test('ค้นหาได้ทั้งชื่อไทย ชื่ออังกฤษ และบางส่วนของชื่อ', () => {
    assert.ok(searchProvinces('เชียง').some((p) => p.nameTh === 'เชียงใหม่'));
    assert.ok(searchProvinces('chiang').some((p) => p.nameTh === 'เชียงราย'));
    assert.ok(searchProvinces('PHUKET').some((p) => p.nameTh === 'ภูเก็ต'));
    assert.ok(searchProvinces('ภูเก').some((p) => p.nameTh === 'ภูเก็ต'));
  });

  test('ค่าว่าง = แสดงจังหวัดทั้งหมด (77) · พิมพ์แล้วไม่พบ = รายการว่าง', () => {
    assert.equal(searchProvinces('').length, 77);
    assert.deepEqual(searchProvinces('zzz'), []);
  });

  test('เลือกจากรายการเท่านั้น — ข้อความที่ไม่อยู่ในรายการถูกปฏิเสธ', () => {
    const typed: LeaderFormState = {
      ...thaiForm(),
      address: { ...thaiForm().address, province: 'จังหวัดที่ไม่มีจริง', provinceCode: undefined },
    };
    assert.ok(generalErrors(typed).includes('province'));

    const picked: LeaderFormState = {
      ...thaiForm(),
      address: { ...thaiForm().address, province: 'ภูเก็ต', provinceCode: '83' },
    };
    assert.ok(!generalErrors(picked).includes('province'));
  });

  test('เลือกจังหวัด → เก็บทั้งรหัสและชื่อ', () => {
    const next = selectProvince({ houseNo: '1', countryId: 'C-TH' }, chiangMai());
    assert.equal(next.province, 'เชียงใหม่');
    assert.equal(next.provinceCode, '50');
  });

  test('เปลี่ยนจังหวัด → ล้างอำเภอ/ตำบล/รหัสไปรษณีย์ที่ไม่สัมพันธ์กัน', () => {
    let addr = selectProvince({ houseNo: '1', countryId: 'C-TH' }, bangkok());
    addr = selectDistrict(addr, huaiKhwang());
    addr = selectSubdistrict(addr, subdistrictsOf('1009').find((s) => s.nameTh === 'ห้วยขวาง')!);
    assert.equal(addr.district, 'ห้วยขวาง');
    assert.equal(addr.postalCode, '10310');

    const moved = selectProvince(addr, chiangMai());
    assert.equal(moved.province, 'เชียงใหม่');
    assert.equal(moved.district, '');
    assert.equal(moved.districtCode, undefined);
    assert.equal(moved.subdistrict, '');
    assert.equal(moved.postalCode, '');
  });

  test('เลือกจังหวัดเดิมซ้ำ → ไม่ล้างข้อมูลที่กรอกไว้', () => {
    let addr = selectProvince({ houseNo: '1', countryId: 'C-TH' }, bangkok());
    addr = selectDistrict(addr, watthana());
    const again = selectProvince(addr, bangkok());
    assert.equal(again.district, 'วัฒนา');
  });

  test('เปลี่ยนอำเภอ → ล้างตำบลและรหัสไปรษณีย์', () => {
    let addr = selectProvince({ houseNo: '1', countryId: 'C-TH' }, bangkok());
    addr = selectDistrict(addr, huaiKhwang());
    addr = selectSubdistrict(addr, subdistrictsOf('1009').find((s) => s.nameTh === 'บางกะปิ')!);
    const moved = selectDistrict(addr, watthana());
    assert.equal(moved.district, 'วัฒนา');
    assert.equal(moved.subdistrict, '');
    assert.equal(moved.postalCode, '');
  });

  test('อำเภอถูกจำกัดเฉพาะจังหวัดที่เลือก', () => {
    const bkk = districtsOf('10');
    assert.ok(bkk.every((d) => d.provinceCode === '10'));
    assert.ok(bkk.some((d) => d.nameTh === 'ห้วยขวาง'));
    assert.ok(!bkk.some((d) => d.nameTh === 'หาดใหญ่'));
    assert.deepEqual(districtsOf(undefined), [], 'ยังไม่เลือกจังหวัด = ยังไม่มีอำเภอให้เลือก');
  });

  test('ตำบลถูกจำกัดเฉพาะอำเภอที่เลือก', () => {
    assert.ok(subdistrictsOf('1009').every((s) => s.districtCode === '1009'));
    assert.deepEqual(subdistrictsOf(undefined), [], 'ยังไม่เลือกอำเภอ = ยังไม่มีตำบลให้เลือก');
  });

  test('รหัสไปรษณีย์: ตำบลที่มีรหัสเดียว → เติมให้ · หลายรหัส → ให้ผู้ใช้เลือก', () => {
    const single = selectSubdistrict(
      { houseNo: '1', countryId: 'C-TH', districtCode: '1009' },
      subdistrictsOf('1009').find((s) => s.nameTh === 'ห้วยขวาง')!,
    );
    assert.equal(single.postalCode, '10310');

    const multi = selectSubdistrict(
      { houseNo: '1', countryId: 'C-TH', districtCode: '1009' },
      subdistrictsOf('1009').find((s) => s.nameTh === 'สามเสนนอก')!,
    );
    assert.equal(multi.postalCode, '', 'มีหลายรหัส — ต้องไม่เดาแทนผู้ใช้');
    assert.deepEqual(postalCodesOf('1009', 'สามเสนนอก'), ['10310', '10320']);
  });

  test('กรุงเทพฯ ใช้ "เขต / แขวง" · จังหวัดอื่นใช้ "อำเภอ / ตำบล"', () => {
    assert.equal(districtLabel('10'), 'เขต');
    assert.equal(subdistrictLabel('10'), 'แขวง');
    assert.equal(districtLabel('50'), 'อำเภอ');
    assert.equal(subdistrictLabel('50'), 'ตำบล');
  });

  test('คีย์บอร์ด: ลูกศรลง/ขึ้นวนรอบรายการ', () => {
    assert.equal(nextHighlight(-1, 'ArrowDown', 3), 0);
    assert.equal(nextHighlight(0, 'ArrowDown', 3), 1);
    assert.equal(nextHighlight(2, 'ArrowDown', 3), 0, 'ท้ายสุด → วนกลับรายการแรก');
    assert.equal(nextHighlight(0, 'ArrowUp', 3), 2, 'รายการแรก → วนไปท้ายสุด');
    assert.equal(nextHighlight(1, 'Home', 3), 0);
    assert.equal(nextHighlight(1, 'End', 3), 2);
    assert.equal(nextHighlight(0, 'ArrowDown', 0), -1, 'รายการว่าง = ไม่มีอะไรให้ไฮไลต์');
  });

  test('ข้อมูลเดิมที่มีแต่ชื่อจังหวัด → เติมรหัสให้ตอนโหลดเข้าฟอร์ม', () => {
    const record = formToLeader(thaiForm(), BUILD);
    const reloaded = leaderToForm({ ...record, address: { ...record.address, provinceCode: undefined } });
    assert.equal(reloaded.address.provinceCode, '10', 'กรุงเทพมหานคร → รหัส 10');
  });
});

/* -------------------------------- ช่องทางติดต่อ -------------------------------- */

describe('ช่องทางติดต่อ', () => {
  const list = (): ContactChannel[] => [
    { id: 'CC-1', type: 'phone', value: '081-234-5678', isPrimary: true },
    { id: 'CC-2', type: 'email', value: 'a@b.com', isPrimary: false },
    { id: 'CC-3', type: 'line', value: 'line_id', isPrimary: false },
  ];

  test('กำหนดช่องทางหลักได้ครั้งละหนึ่งรายการ', () => {
    const next = setPrimaryContact(list(), 'CC-2');
    assert.deepEqual(
      next.map((c) => c.isPrimary),
      [false, true, false],
    );
  });

  test('ลบช่องทางหลัก → รายการแรกที่เหลือถูกยกขึ้นเป็นหลัก', () => {
    const next = removeContact(setPrimaryContact(list(), 'CC-2'), 'CC-2');
    assert.equal(next.length, 2);
    assert.equal(next.filter((c) => c.isPrimary).length, 1);
    assert.equal(next[0].isPrimary, true);
  });

  test('ลบจนหมด → ไม่มีช่องทางหลักค้าง', () => {
    let next = list();
    for (const c of list()) next = removeContact(next, c.id);
    assert.deepEqual(next, []);
  });

  test('validation เปลี่ยนตามประเภทช่องทาง', () => {
    const check = (type: ContactChannel['type'], value: string) =>
      validateContactValue({ id: 'x', type, value, isPrimary: false });

    assert.equal(check('phone', '081-234-5678'), undefined);
    assert.equal(check('phone', '+66 81-234-5678'), undefined, 'รองรับรหัสประเทศ');
    assert.ok(check('phone', 'abc'));
    assert.equal(check('email', 'name@example.com'), undefined);
    assert.ok(check('email', 'name@'));
    assert.equal(check('instagram', '@username'), undefined);
    assert.equal(check('instagram', 'https://instagram.com/user'), undefined);
    assert.equal(check('line', 'any_line_id'), undefined, 'LINE ID ไม่บังคับรูปแบบ');
  });

  test('ต้องมีช่องทางติดต่ออย่างน้อย 1 รายการ และมีช่องทางหลัก 1 รายการ', () => {
    const noContacts = validateLeaderForm({ ...thaiForm(), contacts: [] }, VCTX);
    assert.ok(noContacts.errors.some((e) => e.field === 'contacts' && e.step === 'contact'));

    const noPrimary = validateLeaderForm(
      { ...thaiForm(), contacts: [{ ...phone(), isPrimary: false }] },
      VCTX,
    );
    assert.ok(noPrimary.errors.some((e) => e.field === 'contacts'));
  });
});

/* ---------------------------- รูปแบบการร่วมงาน ---------------------------- */

describe('รูปแบบการร่วมงาน (รายละเอียดตามรูปแบบ)', () => {
  const regular = (): LeaderFormState => ({
    ...thaiForm(),
    leaderType: 'regular',
    employeeCode: 'EMP-0125',
    // ต้องไม่อยู่ก่อนวันที่เริ่มร่วมงาน (joinedAt = วันนี้)
    typeStartDate: TODAY,
    team: 'ทีมยุโรป',
    workStatus: 'active',
  });

  const freelance = (): LeaderFormState => ({
    ...thaiForm(),
    leaderType: 'freelance',
    payType: 'fixed',
    payRate: '3500',
    payUnit: 'per_day',
  });

  const agent = (): LeaderFormState => ({
    ...thaiForm(),
    leaderType: 'agent',
    agencyName: 'Bangkok Travel Agency',
    agencyContactName: 'คุณเอ',
    agencyContactPhone: '081-234-5678',
    agencyContactEmail: 'contact@agency.com',
    agencyRefCode: 'AG-2026-014',
  });

  test('"ทั่วไป" ไม่มีข้อมูลเพิ่มเติม และไม่บังคับช่องใด', () => {
    const form = { ...thaiForm(), leaderType: 'general' as const };
    assert.deepEqual(generalErrors(form), []);
    const record = formToLeader(form, BUILD);
    assert.equal(record.employeeCode, undefined);
    assert.equal(record.payType, undefined);
    assert.equal(record.agencyName, undefined);
  });

  /**
   * Card “รายละเอียดการร่วมงาน (หัวหน้าทัวร์ประจำ)” ถูกนำออกจากหน้าจอแล้ว
   * รหัสพนักงาน · วันที่เริ่มรูปแบบนี้ · หน่วยงาน/ทีม · สถานะการร่วมงาน จึงต้องไม่บังคับกรอก
   * (เดิมบังคับทั้งสามช่อง — บังคับต่อไปจะบันทึกไม่ได้เพราะไม่มีช่องกรอกบนหน้าจอ)
   */
  test('ประจำ: ไม่บังคับรหัสพนักงาน / วันที่เริ่มรูปแบบนี้ / สถานะการร่วมงาน', () => {
    const empty: LeaderFormState = {
      ...thaiForm(),
      leaderType: 'regular',
      employeeCode: '',
      typeStartDate: '',
      workStatus: undefined,
    };
    assert.deepEqual(generalErrors(empty), []);
    assert.deepEqual(generalErrors(regular()), []);
  });

  test('ฟรีแลนซ์: บังคับรูปแบบค่าจ้าง · อัตราไม่บังคับ แต่ถ้ากรอกต้องมีหน่วยและมากกว่า 0', () => {
    const noPayType: LeaderFormState = { ...freelance(), payType: undefined, payRate: '', payUnit: undefined };
    assert.deepEqual(generalErrors(noPayType), ['payType']);

    const rateNoUnit: LeaderFormState = { ...freelance(), payUnit: undefined };
    assert.deepEqual(generalErrors(rateNoUnit), ['payUnit']);

    const badRate: LeaderFormState = { ...freelance(), payRate: '0' };
    assert.deepEqual(generalErrors(badRate), ['payRate']);

    assert.deepEqual(generalErrors(freelance()), []);
  });

  test('เอเจนท์: บังคับชื่อเอเจนซี่ / ผู้ติดต่อ / เบอร์โทร · อีเมลตรวจรูปแบบเมื่อกรอก', () => {
    const empty: LeaderFormState = {
      ...agent(),
      agencyName: '',
      agencyContactName: '',
      agencyContactPhone: '',
      agencyContactEmail: '',
    };
    assert.deepEqual(generalErrors(empty), [
      'agencyName',
      'agencyContactName',
      'agencyContactPhone',
    ]);

    assert.deepEqual(generalErrors({ ...agent(), agencyContactEmail: 'not-an-email' }), [
      'agencyContactEmail',
    ]);
    assert.deepEqual(generalErrors({ ...agent(), agencyContactPhone: 'abc' }), [
      'agencyContactPhone',
    ]);
    assert.deepEqual(generalErrors(agent()), []);
  });

  test('ฟิลด์ของรูปแบบที่ซ่อนอยู่ ไม่ถูกตรวจและไม่ขัดขวางการบันทึก', () => {
    // เลือก "ทั่วไป" แต่มีข้อมูลของรูปแบบอื่นค้างอยู่ → ต้องไม่มี error
    const stale: LeaderFormState = {
      ...thaiForm(),
      leaderType: 'general',
      employeeCode: 'EMP-1',
      payRate: '0',
      agencyContactPhone: 'abc',
    };
    assert.deepEqual(generalErrors(stale), []);
    assert.ok(validateLeaderForm(stale, VCTX).ok);
  });

  test('บันทึกเฉพาะรายละเอียดของรูปแบบที่เลือก — ของรูปแบบอื่นไม่ถูกส่งใน payload', () => {
    const mixed: LeaderFormState = {
      ...regular(),
      // ข้อมูลของฟรีแลนซ์/เอเจนท์ที่ตกค้าง
      payType: 'fixed',
      payRate: '3500',
      payUnit: 'per_day',
      agencyName: 'Bangkok Travel Agency',
      agencyContactPhone: '081-234-5678',
    };
    const record = formToLeader(mixed, BUILD);
    assert.equal(record.employeeCode, 'EMP-0125');
    assert.equal(record.team, 'ทีมยุโรป');
    assert.equal(record.workStatus, 'active');
    assert.equal(record.payType, undefined);
    assert.equal(record.payRate, undefined);
    assert.equal(record.agencyName, undefined);
    assert.equal(record.agencyContactPhone, undefined);
  });

  test('ฟรีแลนซ์: อัตราค่าจ้างถูกบันทึกเป็นตัวเลข ไม่ใช่ข้อความ', () => {
    const record = formToLeader(freelance(), BUILD);
    assert.equal(record.payRate, 3500);
    assert.equal(typeof record.payRate, 'number');
    assert.equal(record.payUnit, 'per_day');
  });

  test('เอเจนท์: บันทึกข้อมูลเอเจนซี่ครบ และไม่มีข้อมูลของประจำ/ฟรีแลนซ์ปน', () => {
    const record = formToLeader(agent(), BUILD);
    assert.equal(record.agencyName, 'Bangkok Travel Agency');
    assert.equal(record.agencyContactEmail, 'contact@agency.com');
    assert.equal(record.agencyRefCode, 'AG-2026-014');
    assert.equal(record.employeeCode, undefined);
    assert.equal(record.payType, undefined);
  });

  test('เปลี่ยนรูปแบบแล้วล้างข้อมูลเดิม → ข้อมูลส่วนกลางยังอยู่ครบ', () => {
    // จำลองผลของการกด "เปลี่ยนและล้างข้อมูล": ล้างเฉพาะรายละเอียดของรูปแบบเดิม
    const switched: LeaderFormState = {
      ...regular(),
      leaderType: 'agent',
      employeeCode: '',
      team: '',
      workStatus: undefined,
      agencyName: 'Bangkok Travel Agency',
      agencyContactName: 'คุณเอ',
      agencyContactPhone: '081-234-5678',
    };
    const record = formToLeader(switched, BUILD);
    assert.equal(record.leaderType, 'agent');
    assert.equal(record.employeeCode, undefined);
    // ข้อมูลส่วนกลางต้องไม่ถูกแตะ
    assert.equal(record.firstName, 'สมชาย');
    assert.equal(record.contacts.length, 1);
    assert.equal(record.address.province, 'กรุงเทพมหานคร');
    assert.deepEqual(generalErrors(switched), []);
  });
});

/* --------------------------- สถานะข้อมูลและหมายเหตุ --------------------------- */

describe('สถานะข้อมูล (เปิดใช้งาน / ระงับการใช้งาน)', () => {
  test('รายการใหม่เริ่มต้นเป็น "เปิดใช้งาน"', () => {
    assert.equal(emptyLeaderForm('TL-999', TODAY).active, true);
  });

  test('เปิดใช้งาน → บันทึกเป็น active: true', () => {
    const record = formToLeader({ ...thaiForm(), active: true }, BUILD);
    assert.equal(record.active, true);
  });

  test('ระงับการใช้งาน → บันทึกเป็น active: false แต่ข้อมูลเดิมไม่ถูกลบ', () => {
    const form: LeaderFormState = {
      ...thaiForm(),
      active: false,
      generalNote: 'หมายเหตุเดิม',
      cautions: 'แพ้อาหารทะเล',
    };
    const record = formToLeader(form, BUILD);
    assert.equal(record.active, false);
    // ประวัติ / ข้อมูลเดิมยังอยู่ครบ
    assert.equal(record.generalNote, 'หมายเหตุเดิม');
    assert.equal(record.cautions, 'แพ้อาหารทะเล');
    assert.equal(record.contacts.length, 1);
    assert.equal(record.nationalIdNumber, 'xxxxxxxxx0123');
  });

  test('ระงับการใช้งานไม่ทำให้ฟอร์มบันทึกไม่ได้ (ไม่ใช่ error)', () => {
    assert.ok(validateLeaderForm({ ...thaiForm(), active: false }, VCTX).ok);
  });

  test('สลับกลับมาเปิดใช้งาน → ข้อมูลเดิมยังอยู่ครบ', () => {
    const off = formToLeader({ ...thaiForm(), active: false }, BUILD);
    const on = formToLeader({ ...leaderToForm(off), active: true }, { ...BUILD, existing: off });
    assert.equal(on.active, true);
    assert.equal(on.id, off.id);
    assert.deepEqual(on.contacts, off.contacts);
  });

  test('หมายเหตุยาวเกินขีดจำกัด → error บอกให้ย่อข้อความ', () => {
    const long = 'ก'.repeat(NOTE_MAX_LENGTH.cautions + 1);
    const result = validateLeaderForm({ ...thaiForm(), cautions: long }, VCTX);
    const error = result.errors.find((e) => e.field === 'cautions');
    assert.ok(error);
    assert.match(error.message, /ยาวเกิน/);
  });

  test('หมายเหตุภายในความยาวปกติ → ไม่มี error และถูกบันทึก', () => {
    const form: LeaderFormState = { ...thaiForm(), internalNote: 'ตรวจสอบเอกสารเพิ่ม' };
    assert.deepEqual(generalErrors(form), []);
    assert.equal(formToLeader(form, BUILD).internalNote, 'ตรวจสอบเอกสารเพิ่ม');
  });
});

/* --------------------------------- ขั้นตอนฟอร์ม -------------------------------- */

describe('ขั้นตอนของฟอร์ม', () => {
  test('ข้อผิดพลาดถูกจัดกลุ่มตามขั้นตอน เพื่อให้ UI ตรวจเฉพาะขั้นตอนที่ผู้ใช้ไปถึง', () => {
    const result = validateLeaderForm(base(), VCTX);
    const steps = new Set(result.errors.map((e) => e.step));
    assert.ok(steps.has('general'));
    assert.ok(steps.has('contact'));
    assert.ok(result.firstStep === 'general', 'ข้อผิดพลาดแรกต้องอยู่ขั้นตอนแรก');
  });

  test('รหัสหัวหน้าทัวร์ห้ามซ้ำกับที่มีอยู่', () => {
    const existing = formToLeader(thaiForm(), BUILD);
    const result = validateLeaderForm(thaiForm(), {
      existingLeaders: [existing],
      isNew: true,
      today: TODAY,
    });
    assert.ok(result.errors.some((e) => e.field === 'id'));
  });
});
