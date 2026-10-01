/**
 * เทสต์ตรรกะวิซาร์ด "เพิ่มหัวหน้าทัวร์ใหม่" (5 แท็บ)
 *   - validation รายแท็บและช่องบังคับ (แท็บ 1 รวม ข้อมูลพื้นฐาน/ติดต่อ/ที่อยู่)
 *   - ระดับภาษา "ไม่ระบุ" + ตรวจไฟล์แนบ (ชนิด/ขนาด)
 *   - map เป็น LeaderFormState แล้วบันทึกผ่าน pipeline เดิมได้ครบ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  emptyWizardForm,
  newLanguageRow,
  resolvedLanguageName,
  wizardLanguageStandard,
  validateUploadFile,
  validateWizard,
  validateWizardTab,
  wizardToLeaderForm,
  newDocEntry,
  docFieldErrorKey,
  type DocEntry,
  WIZARD_TABS,
  WIZARD_LEADER_TYPES,
  WIZARD_TOUR_TYPES,
  isAllTourTypesSelected,
  isTourTypesIndeterminate,
  WIZARD_EXPERTISE_OTHER_MAX,
  newCountryExpertise,
  makeCustomRoute,
  filterRoutes,
  isDuplicateRouteName,
  isDuplicateCountry,
  countSelectedRoutes,
  WIZARD_POPULAR_COUNTRY_CODES,
  newFlightRoute,
  flightRoutePreview,
  canAppendAirport,
  isFlightRouteValid,
  moveItem,
  type WizardRoute,
  type WizardCountryExpertise,
  WIZARD_MAX_FILE_MB,
  newContactRow,
  WIZARD_CONTACT_TYPES,
  setPrimaryContactRow,
  removeContactRow,
  validateContactRowValue,
  newExperienceRow,
  summarizeWizardExperience,
  sortExperienceRows,
  experienceStartPatch,
  setCurrentExperience,
  experienceRowComplete,
  countFilledExperiences,
  nextGridCell,
  WIZARD_EXPERIENCE_MIN_ROWS,
  type UploadedFile,
  type WizardForm,
  type WizardContactRow,
  type WizardContactType,
  type WizardExperienceRow,
} from '@/modules/tour-leaders/newLeaderWizard';
import { formToLeader } from '@/modules/tour-leaders/mappers';
import { computePhone, isPhoneValid } from '@/lib/phone';

const TODAY = '2026-07-14';
const BUILD = { routes: [], actor: 'tester', now: '2026-07-14T10:00:00Z', today: TODAY };

const file = (name: string, type = 'image/jpeg'): UploadedFile => ({
  name,
  type,
  size: 1024,
  dataUrl: `data:${type};base64,AAAA`,
});

/** สร้างแถวติดต่อพร้อม default ครบ (รวมช่องคน Call) */
const mkContact = (
  o: Partial<WizardContactRow> & { type: WizardContactType },
): WizardContactRow => ({ ...newContactRow(o.type), ...o });

/** ฟอร์มที่กรอกครบทุกแท็บและผ่าน validation */
const fullForm = (): WizardForm => ({
  ...emptyWizardForm('TL-0013'),
  firstName: 'สมชาย',
  lastName: 'ทดสอบ',
  firstNameEn: 'Somchai',
  lastNameEn: 'Thodsob',
  birthDate: '1990-01-01',
  nationalId: '1234567890123',
  passportNo: '',
  nationality: 'thai',
  leaderType: 'regular',
  contacts: [
    mkContact({ id: 'c1', type: 'mobile', value: '081-234-5678', isPrimary: true }),
    mkContact({ id: 'c2', type: 'phone_alt', value: '02-123-4567' }),
    mkContact({ id: 'c3', type: 'email', value: 'somchai@example.com' }),
    mkContact({ id: 'c4', type: 'line', value: '@somchai' }),
  ],
  address: {
    houseNo: '99/1',
    villageNo: '4',
    building: 'บ้านสวนดอกไม้',
    alley: 'ลาดพร้าว 1',
    road: 'ลาดพร้าว',
    subdistrict: 'จอมพล',
    district: 'จตุจักร',
    province: 'กรุงเทพมหานคร',
    postalCode: '10900',
  },
  idCardSameAsCurrent: true,
  experiences: [
    {
      id: 'e1',
      company: 'JourneyPro Travel',
      position: 'หัวหน้าทัวร์อาวุโส',
      startDate: '2018-01-15',
      endDate: null,
      isCurrent: true,
      responsibilities: '',
      routes: '',
      region: '',
      paxApprox: '',
      achievements: '',
    },
  ],
  languages: [{ ...newLanguageRow('อังกฤษ'), levelCode: 'C1' }],
  tourTypes: ['walk_in', 'charter'],
  idCard: { ...newDocEntry('id_card'), file: file('front.jpg') },
});

/** สร้างรายการเอกสารพร้อมไฟล์ + ข้อมูล (verifiedData) สำหรับทดสอบ */
const docEntry = (kind: Parameters<typeof newDocEntry>[0], data: Record<string, string> = {}): DocEntry => {
  const e = newDocEntry(kind);
  return { ...e, file: file('doc.jpg'), verifiedData: { ...e.verifiedData, ...data } };
};

const fields = (form: WizardForm, tab: Parameters<typeof validateWizardTab>[1]) =>
  validateWizardTab(form, tab).map((e) => e.field);

/* ------------------------------- โครงสร้าง 5 แท็บ ------------------------------- */

describe('โครงสร้างวิซาร์ด', () => {
  test('มี 6 แท็บตามลำดับ (เพิ่ม "เอกสารเพิ่มเติม" ต่อจากเอกสารประจำตัว)', () => {
    assert.deepEqual(
      WIZARD_TABS.map((t) => t.key),
      ['personal', 'experience', 'language', 'expertise', 'documents', 'additional'],
    );
  });

  test('ฟอร์มที่กรอกครบผ่าน validation ทั้งหมด', () => {
    assert.ok(validateWizard(fullForm()).ok);
  });

  test('ค่าเริ่มต้น "เหมือนกับที่อยู่ปัจจุบัน" ถูกติ๊กไว้ (true)', () => {
    assert.equal(emptyWizardForm('TL-0013').idCardSameAsCurrent, true);
  });

  test('ติ๊กเป็นค่าเริ่มต้น → ไม่บังคับกรอกที่อยู่ตามบัตร (validate ผ่าน)', () => {
    // ฟอร์มใหม่ที่กรอกครบ (idCardSameAsCurrent = true) ต้องไม่มี error ของช่อง idCard_*
    const errs = validateWizard(fullForm()).errors.filter((e) => e.field.startsWith('idCard_'));
    assert.deepEqual(errs, []);
  });
});

/* ---------------------- แท็บ 1: ข้อมูลส่วนตัว (พื้นฐาน/ติดต่อ/ที่อยู่) ---------------------- */

describe('แท็บ 1 — ข้อมูลส่วนตัว', () => {
  test('ช่องบังคับพื้นฐาน ติดต่อ และที่อยู่ อยู่ในแท็บเดียวกัน', () => {
    const f = fields(emptyWizardForm('TL-0013'), 'personal');
    // ข้อมูลพื้นฐาน (ชื่อไทยและอังกฤษบังคับ)
    assert.ok(f.includes('firstName'));
    assert.ok(f.includes('lastName'));
    assert.ok(f.includes('firstNameEn'));
    assert.ok(f.includes('lastNameEn'));
    assert.ok(f.includes('birthDate'));
    assert.ok(f.includes('nationalId'));
    assert.ok(f.includes('leaderType'));
    // ข้อมูลติดต่อ (ตาราง — ยังไม่กรอก → error รวมที่ field "contacts")
    assert.ok(f.includes('contacts'));
    // ข้อมูลที่อยู่
    assert.ok(f.includes('houseNo'));
    assert.ok(f.includes('subdistrict'));
    assert.ok(f.includes('district'));
    assert.ok(f.includes('province'));
    assert.ok(f.includes('postalCode'));
  });

  test('ฟิลด์ทั้ง 4 กลุ่มการ์ด (ระบบ/ไทย/อังกฤษ/ส่วนบุคคล) validate ในแท็บเดียวกัน', () => {
    // จำลองฟอร์มที่กรอกครบ แล้วล้างช่องบังคับของแต่ละกลุ่มทีละกลุ่ม → ต้องได้ error ในแท็บ personal
    const groups: Record<string, Partial<WizardForm>> = {
      // 01 ระบบและประเภท
      leaderType: { leaderType: '' },
      // 02 ชื่อไทย
      firstName: { firstName: '' },
      lastName: { lastName: '' },
      // 03 ชื่ออังกฤษ
      titleEn: { titleEn: '' },
      firstNameEn: { firstNameEn: '' },
      lastNameEn: { lastNameEn: '' },
      // 04 ส่วนบุคคล
      birthDate: { birthDate: '' },
      nationalId: { nationalId: '' },
    };
    for (const [field, patch] of Object.entries(groups)) {
      const errs = validateWizard({ ...fullForm(), ...patch }).errors;
      const hit = errs.find((e) => e.field === field);
      assert.ok(hit, `ควรมี error ของช่อง ${field}`);
      assert.equal(hit.tab, 'personal', `${field} ต้องอยู่แท็บ personal`);
    }
  });

  test('ชื่อ/นามสกุลอังกฤษรับเฉพาะอักษรอังกฤษ จุด อัญประกาศเดี่ยว และขีดกลาง', () => {
    assert.deepEqual(fields({ ...fullForm(), lastNameEn: "O'Brien-Smith" }, 'personal'), []);
    assert.ok(fields({ ...fullForm(), firstNameEn: 'สมชาย' }, 'personal').includes('firstNameEn'));
    assert.ok(fields({ ...fullForm(), lastNameEn: 'Smith123' }, 'personal').includes('lastNameEn'));
  });

  test('คำนำหน้าอังกฤษบังคับ', () => {
    assert.ok(fields({ ...fullForm(), titleEn: '' }, 'personal').includes('titleEn'));
  });

  test('สัญชาติไทย → บังคับชื่อไทย (คำนำหน้า/ชื่อ/นามสกุล)', () => {
    const f = fields({ ...fullForm(), title: '', firstName: '', lastName: '' }, 'personal');
    assert.ok(f.includes('title'));
    assert.ok(f.includes('firstName'));
    assert.ok(f.includes('lastName'));
  });

  test('สัญชาติต่างชาติ → ไม่บังคับชื่อไทย แต่ยังบังคับชื่ออังกฤษ', () => {
    const foreign: WizardForm = {
      ...fullForm(),
      nationality: 'foreign',
      passportNo: 'AB1234567',
      title: '',
      firstName: '',
      lastName: '',
    };
    const f = fields(foreign, 'personal');
    // ไม่แจ้งเตือนชื่อไทย
    assert.ok(!f.includes('title'));
    assert.ok(!f.includes('firstName'));
    assert.ok(!f.includes('lastName'));
    // ฟอร์มผ่าน validation ทั้งหมด (ชื่ออังกฤษ + เลขหนังสือเดินทางครบ)
    assert.ok(validateWizard(foreign).ok);

    // แต่ถ้าชื่ออังกฤษว่าง ต้องยังแจ้งเตือน
    const noEn = fields({ ...foreign, firstNameEn: '', lastNameEn: '' }, 'personal');
    assert.ok(noEn.includes('firstNameEn'));
    assert.ok(noEn.includes('lastNameEn'));
  });

  test('เปลี่ยนต่างชาติ→ไทย ข้อมูลชื่อไทยที่กรอกไว้ยังอยู่ (map ได้)', () => {
    // ผู้ใช้กรอกชื่อไทยไว้ แล้วเคยสลับสัญชาติ — ค่ายังคงอยู่ใน state และ validate ได้เมื่อกลับเป็นไทย
    const kept: WizardForm = { ...fullForm(), nationality: 'thai', firstName: 'สมชาย', lastName: 'ทดสอบ' };
    assert.deepEqual(fields(kept, 'personal'), []);
  });

  test('ชื่อเล่นอังกฤษไม่บังคับ แต่ถ้ากรอกต้องเป็นอักษรอังกฤษ', () => {
    // ว่างได้
    assert.deepEqual(fields({ ...fullForm(), nicknameEn: '' }, 'personal'), []);
    // อักษรอังกฤษ/ขีดกลาง/อัญประกาศ ผ่าน
    assert.deepEqual(fields({ ...fullForm(), nicknameEn: "Chai-O'Neil" }, 'personal'), []);
    // อักษรไทยไม่ผ่าน
    assert.ok(fields({ ...fullForm(), nicknameEn: 'ชาย' }, 'personal').includes('nicknameEn'));
  });

  test('เลขบัตรประชาชนต้องครบ 13 หลัก', () => {
    assert.ok(fields({ ...fullForm(), nationalId: '123' }, 'personal').includes('nationalId'));
    assert.deepEqual(fields({ ...fullForm(), nationalId: '1234567890123' }, 'personal'), []);
  });

  test('เอกสารประจำตัวสลับตามสัญชาติ: ไทย = เลขบัตร · ต่างชาติ = หนังสือเดินทาง', () => {
    // ไทย: บังคับเลขบัตร · ไม่ validate หนังสือเดินทาง (แม้ว่าง)
    const thai: WizardForm = { ...fullForm(), nationality: 'thai', nationalId: '', passportNo: '' };
    let f = fields(thai, 'personal');
    assert.ok(f.includes('nationalId'));
    assert.ok(!f.includes('passportNo'));

    // ต่างชาติ: บังคับหนังสือเดินทาง · ไม่ validate เลขบัตร (แม้ว่าง)
    const foreign: WizardForm = { ...fullForm(), nationality: 'foreign', nationalId: '', passportNo: '' };
    f = fields(foreign, 'personal');
    assert.ok(f.includes('passportNo'));
    assert.ok(!f.includes('nationalId'));
  });

  test('เลขที่หนังสือเดินทาง: อังกฤษ/ตัวเลข 6–20 ตัวเท่านั้น', () => {
    const foreign = (passportNo: string): WizardForm => ({ ...fullForm(), nationality: 'foreign', passportNo });
    assert.deepEqual(fields(foreign('AB1234567'), 'personal'), []); // ถูกต้อง
    assert.ok(fields(foreign('AB12'), 'personal').includes('passportNo')); // สั้นเกินไป
    assert.ok(fields(foreign('AB 123 456'), 'personal').includes('passportNo')); // มีช่องว่าง
    assert.ok(fields(foreign(''), 'personal').includes('passportNo')); // ว่าง
  });

  test('สัญชาติเริ่มต้นเป็นไทย และประเภทหัวหน้าทัวร์บังคับเลือก', () => {
    const empty = emptyWizardForm('TL-0013');
    assert.equal(empty.nationality, 'thai');
    assert.equal(empty.titleEn, 'Mr.'); // เติมจากคำนำหน้าไทย "นาย"
    assert.equal(empty.leaderType, ''); // ค่าเริ่มต้นยังไม่เลือก
    const f = fields(empty, 'personal');
    assert.ok(f.includes('leaderType'));
    // เลือกประเภทแล้วไม่มี error ของ leaderType
    assert.ok(!fields({ ...fullForm(), leaderType: 'agent' }, 'personal').includes('leaderType'));
  });

  test('ประเภทหัวหน้าทัวร์มี 4 ตัวเลือกตามที่กำหนด (value/label)', () => {
    assert.deepEqual(
      WIZARD_LEADER_TYPES.map((t) => t.code),
      ['general', 'regular', 'freelance', 'agent'],
    );
    assert.deepEqual(
      WIZARD_LEADER_TYPES.map((t) => t.label),
      ['หัวหน้าทัวร์ทั่วไป', 'หัวหน้าทัวร์ประจำ', 'หัวหน้าทัวร์ฟรีแลนซ์', 'หัวหน้าทัวร์เอเจนท์'],
    );
    // ทุกตัวเลือกผ่าน validation ของช่องประเภท
    for (const t of WIZARD_LEADER_TYPES) {
      assert.ok(!fields({ ...fullForm(), leaderType: t.code }, 'personal').includes('leaderType'));
    }
  });

  test('ยังไม่เลือกรูปแบบการร่วมงาน → error "กรุณาเลือกรูปแบบการร่วมงาน"', () => {
    const errs = validateWizardTab({ ...fullForm(), leaderType: '' }, 'personal');
    const hit = errs.find((e) => e.field === 'leaderType');
    assert.ok(hit);
    assert.equal(hit.message, 'กรุณาเลือกรูปแบบการร่วมงาน');
  });

  test('ตารางติดต่อ: ตรวจรูปแบบเบอร์/อีเมลรายแถว และรายการหลัก', () => {
    const base = fullForm();
    // เบอร์มือถือผิดรูปแบบ → error ที่ id ของแถวนั้น
    const badPhone: WizardForm = {
      ...base,
      contacts: base.contacts.map((c) => (c.id === 'c1' ? { ...c, value: 'abc' } : c)),
    };
    assert.ok(fields(badPhone, 'personal').includes('c1'));

    // อีเมลผิดรูปแบบ
    const badEmail: WizardForm = {
      ...base,
      contacts: base.contacts.map((c) => (c.id === 'c3' ? { ...c, value: 'not-an-email' } : c)),
    };
    assert.ok(fields(badEmail, 'personal').includes('c3'));

    // ไม่มีรายการหลัก → error รวม "contacts"
    const noPrimary: WizardForm = {
      ...base,
      contacts: base.contacts.map((c) => ({ ...c, isPrimary: false })),
    };
    assert.ok(fields(noPrimary, 'personal').includes('contacts'));
  });

  test('รหัสไปรษณีย์ต้องเป็นเลข 5 หลัก · หมู่/อาคาร/ซอย ไม่บังคับ', () => {
    const bad = { ...fullForm(), address: { ...fullForm().address, postalCode: '123' } };
    assert.ok(fields(bad, 'personal').includes('postalCode'));
    // หมู่/อาคาร/ซอย/ถนน ว่างได้
    const noOptional = {
      ...fullForm(),
      address: { ...fullForm().address, villageNo: '', building: '', alley: '', road: '' },
    };
    assert.deepEqual(fields(noOptional, 'personal'), []);
  });

  test('ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" → ไม่บังคับที่อยู่ตามบัตร', () => {
    assert.deepEqual(fields({ ...fullForm(), idCardSameAsCurrent: true }, 'personal'), []);
  });

  test('ไม่ติ๊ก → ที่อยู่ตามบัตรบังคับครบ', () => {
    const notSame: WizardForm = {
      ...fullForm(),
      idCardSameAsCurrent: false,
      idCardAddress: {
        houseNo: '',
        villageNo: '',
        building: '',
        alley: '',
        road: '',
        subdistrict: '',
        district: '',
        province: '',
        postalCode: '',
      },
    };
    const f = fields(notSame, 'personal');
    assert.ok(f.includes('idCard_houseNo'));
    assert.ok(f.includes('idCard_province'));
    assert.ok(f.includes('idCard_postalCode'));
  });
});

/* ------------------------ ตารางข้อมูลติดต่อ ------------------------ */

describe('ตารางข้อมูลติดต่อ', () => {
  test('ค่าเริ่มต้น 3 แถว: มือถือ(หลัก) / อีเมล / LINE', () => {
    const c = emptyWizardForm('TL-0013').contacts;
    assert.equal(c.length, 3);
    assert.equal(c[0].type, 'mobile');
    assert.equal(c[0].isPrimary, true);
    assert.equal(c[1].type, 'email');
    assert.equal(c[2].type, 'line');
    assert.equal(c[1].isPrimary, false);
  });

  test('เพิ่มแถวใหม่ต้องมี id ไม่ซ้ำกัน', () => {
    const a = newContactRow();
    const b = newContactRow();
    assert.notEqual(a.id, b.id);
    assert.equal(a.type, 'mobile');
    assert.equal(a.isPrimary, false);
  });

  test('เลือกรายการหลัก → มีรายการหลักได้เพียงหนึ่ง', () => {
    const rows: WizardContactRow[] = [
      mkContact({ id: 'a', type: 'mobile', value: '1', isPrimary: true }),
      mkContact({ id: 'b', type: 'email', value: 'x@y.com' }),
    ];
    const next = setPrimaryContactRow(rows, 'b');
    assert.deepEqual(
      next.map((r) => r.isPrimary),
      [false, true],
    );
  });

  test('ลบแถว → เอาออกตาม id และไม่เลื่อนรายการหลักอัตโนมัติ', () => {
    const rows: WizardContactRow[] = [
      mkContact({ id: 'a', type: 'mobile', value: '1', isPrimary: true }),
      mkContact({ id: 'b', type: 'email', value: 'x@y.com' }),
    ];
    const next = removeContactRow(rows, 'a');
    assert.equal(next.length, 1);
    assert.equal(next[0].id, 'b');
    assert.equal(next[0].isPrimary, false, 'ต้องไม่เลื่อนหลักอัตโนมัติ (ให้ผู้ใช้เลือกใหม่)');
  });

  test('ตรวจรูปแบบตามประเภท (เบอร์/อีเมล) · LINE/WhatsApp เป็นข้อความอิสระ', () => {
    assert.equal(validateContactRowValue('mobile', '081-234-5678'), undefined);
    assert.ok(validateContactRowValue('mobile', 'abc'));
    assert.equal(validateContactRowValue('phone_alt', '02-123-4567'), undefined);
    assert.equal(validateContactRowValue('email', 'a@b.com'), undefined);
    assert.ok(validateContactRowValue('email', 'a@'));
    assert.equal(validateContactRowValue('line', 'any_line_id'), undefined);
    assert.equal(validateContactRowValue('whatsapp', 'anything'), undefined);
    assert.ok(validateContactRowValue('mobile', ''), 'ค่าว่างต้องแจ้งเตือน');
  });

  test('ต้องมีเบอร์มือถืออย่างน้อย 1 รายการ', () => {
    const base = fullForm();
    const noMobile: WizardForm = {
      ...base,
      contacts: base.contacts.map((c) =>
        c.type === 'mobile' ? { ...c, type: 'email', value: 'a@b.com' } : c,
      ),
    };
    assert.ok(fields(noMobile, 'personal').includes('contacts'));
  });

  test('ป้องกันข้อมูลติดต่อซ้ำ → error ที่แถวซ้ำ', () => {
    const base = fullForm();
    const dup: WizardForm = {
      ...base,
      contacts: base.contacts.map((c) => (c.id === 'c2' ? { ...c, value: '081-234-5678' } : c)),
    };
    const hit = validateWizardTab(dup, 'personal').find((e) => e.field === 'c2');
    assert.ok(hit);
    assert.match(hit.message, /ซ้ำ/);
  });
});

/* ---------------------------- แท็บ 2: ประสบการณ์ทำงาน ---------------------------- */

describe('แท็บ 2 — ประสบการณ์ทำงาน (ตาราง)', () => {
  const exp = (patch: Partial<WizardExperienceRow>): WizardExperienceRow => ({
    ...newExperienceRow(),
    id: 'e1',
    ...patch,
  });
  const withExp = (rows: WizardExperienceRow[]): WizardForm => ({ ...fullForm(), experiences: rows });

  test('เริ่มต้นมี 5 แถวว่าง · id ไม่ซ้ำ · แถวว่างไม่แสดง error รายแถว', () => {
    const rows = emptyWizardForm('TL-0013').experiences;
    assert.equal(rows.length, WIZARD_EXPERIENCE_MIN_ROWS);
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map((r) => r.id)).size, 5, 'id ไม่ซ้ำ');
    // แถวว่างทั้งหมด → ไม่มี error รายแถว (เหลือเฉพาะ "ต้องมีอย่างน้อย 1")
    const rowErrors = validateWizardTab(emptyWizardForm('TL-0013'), 'experience').filter(
      (e) => e.field !== 'experiences',
    );
    assert.deepEqual(rowErrors, []);
  });

  test('ต้องมีประสบการณ์อย่างน้อย 1 รายการ (ฟอร์มเปล่า)', () => {
    assert.ok(fields(emptyWizardForm('TL-0013'), 'experience').includes('experiences'));
  });

  test('บริษัท / ตำแหน่ง / วันที่เริ่ม เป็นข้อมูลบังคับ (error ในแถว)', () => {
    // มีชื่อบริษัทแต่ไม่มีตำแหน่ง → error ที่แถวนั้น (id 'e1')
    assert.ok(
      fields(withExp([exp({ company: 'ABC', position: '', startDate: '2020-01-01' })]), 'experience').includes('e1'),
    );
    // มีบริษัท+ตำแหน่ง แต่ไม่มีวันเริ่ม → ข้อความ "กรุณาระบุวันที่เริ่ม"
    const noStart = validateWizardTab(
      withExp([exp({ company: 'ABC', position: 'มัคคุเทศก์', startDate: '' })]),
      'experience',
    ).find((x) => x.field === 'e1');
    assert.ok(noStart);
    assert.equal(noStart.message, 'กรุณาระบุวันที่เริ่ม');
  });

  test('ไม่ใช่งานปัจจุบัน → ต้องระบุวันสิ้นสุด และห้ามอยู่ก่อนวันเริ่ม', () => {
    // ไม่มีวันสิ้นสุด → "กรุณาระบุวันที่สิ้นสุด"
    const noEnd = validateWizardTab(
      withExp([exp({ company: 'ABC', position: 'มัคคุเทศก์', startDate: '2018-01-01', isCurrent: false, endDate: '' })]),
      'experience',
    ).find((x) => x.field === 'e1');
    assert.ok(noEnd);
    assert.equal(noEnd.message, 'กรุณาระบุวันที่สิ้นสุด');

    // สิ้นสุดก่อนเริ่ม → "วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่ม"
    const reversed = withExp([exp({ company: 'ABC', position: 'มัคคุเทศก์', startDate: '2020-01-01', isCurrent: false, endDate: '2019-01-01' })]);
    const hit = validateWizardTab(reversed, 'experience').find((x) => x.field === 'e1');
    assert.ok(hit);
    assert.equal(hit.message, 'วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่ม');

    const ok = withExp([exp({ company: 'ABC', position: 'มัคคุเทศก์', startDate: '2018-01-01', isCurrent: false, endDate: '2022-06-30' })]);
    assert.deepEqual(fields(ok, 'experience'), []);
  });

  test('เพิ่มแถวใหม่ต้องมี id ไม่ซ้ำ · ค่าเริ่มต้นว่าง (startDate/endDate)', () => {
    const a = newExperienceRow();
    const b = newExperienceRow();
    assert.notEqual(a.id, b.id);
    assert.equal(a.company, '');
    assert.equal(a.startDate, '');
    assert.equal(a.endDate, null);
    assert.equal(a.isCurrent, false);
  });

  test('เลือก "ยังทำงานอยู่" → ไม่ต้องมีวันสิ้นสุด', () => {
    const current = withExp([exp({ company: 'ABC', position: 'หัวหน้าทัวร์', startDate: '2018-01-01', isCurrent: true, endDate: '' })]);
    assert.deepEqual(fields(current, 'experience'), []);
  });

  test('เปลี่ยนวันที่เริ่มจนมากกว่าวันสิ้นสุดเดิม → ล้างวันที่สิ้นสุด', () => {
    const row: WizardExperienceRow = { ...newExperienceRow(), startDate: '2018-01-01', endDate: '2019-01-01' };
    // วันเริ่มใหม่ก่อนวันสิ้นสุด → คงวันสิ้นสุดไว้
    assert.deepEqual(experienceStartPatch(row, '2018-06-01'), { startDate: '2018-06-01' });
    // วันเริ่มใหม่หลังวันสิ้นสุด → ล้างวันสิ้นสุด
    assert.deepEqual(experienceStartPatch(row, '2020-01-01'), { startDate: '2020-01-01', endDate: null });
  });
});

/* -------------------- ตาราง Excel: ครบ/นับ/คีย์บอร์ด -------------------- */

describe('ตารางประสบการณ์แบบ Excel', () => {
  test('experienceRowComplete: ครบเมื่อมีบริษัท+ตำแหน่ง+วันเริ่ม และ (ปัจจุบัน หรือ วันสิ้นสุดถูกต้อง)', () => {
    const base = { ...newExperienceRow(), company: 'A', position: 'มัคคุเทศก์', startDate: '2018-01-01' };
    assert.equal(experienceRowComplete({ ...base, isCurrent: true }), true);
    assert.equal(experienceRowComplete({ ...base, endDate: '2020-01-01' }), true);
    assert.equal(experienceRowComplete({ ...base, endDate: null }), false, 'ยังไม่มีวันสิ้นสุด');
    assert.equal(experienceRowComplete({ ...base, endDate: '2017-01-01' }), false, 'สิ้นสุดก่อนเริ่ม');
    assert.equal(experienceRowComplete({ ...base, company: '' }), false);
    assert.equal(experienceRowComplete(newExperienceRow()), false, 'แถวว่าง');
  });

  test('countFilledExperiences: นับเฉพาะแถวที่มีชื่อบริษัท', () => {
    const rows = [
      { ...newExperienceRow(), company: 'A' },
      { ...newExperienceRow(), company: '' },
      { ...newExperienceRow(), company: 'B' },
      newExperienceRow(),
    ];
    assert.equal(countFilledExperiences(rows), 2);
  });

  test('nextGridCell: Enter ไปแถวถัดไปคอลัมน์เดิม · แถวสุดท้าย = ขอเพิ่มแถว', () => {
    assert.deepEqual(nextGridCell({ r: 0, c: 1 }, 'Enter', 5, 4), { r: 1, c: 1 });
    assert.deepEqual(nextGridCell({ r: 4, c: 2 }, 'Enter', 5, 4), { r: 5, c: 2, addRow: true });
  });

  test('nextGridCell: ลูกศรขึ้น/ลง/ซ้าย/ขวา ไปเซลล์ข้างเคียง', () => {
    assert.deepEqual(nextGridCell({ r: 1, c: 0 }, 'ArrowDown', 5, 4), { r: 2, c: 0 });
    assert.deepEqual(nextGridCell({ r: 1, c: 0 }, 'ArrowUp', 5, 4), { r: 0, c: 0 });
    assert.deepEqual(nextGridCell({ r: 0, c: 0 }, 'ArrowRight', 5, 4), { r: 0, c: 1 });
    assert.deepEqual(nextGridCell({ r: 0, c: 1 }, 'ArrowLeft', 5, 4), { r: 0, c: 0 });
    // ขอบเขต
    assert.equal(nextGridCell({ r: 0, c: 0 }, 'ArrowUp', 5, 4), null);
    assert.deepEqual(nextGridCell({ r: 0, c: 3 }, 'ArrowRight', 5, 4), { r: 1, c: 0 }, 'ท้ายแถว → ขึ้นต้นแถวถัดไป');
  });

  test('ล้าง/ลบ: ล้างแถวรีเซ็ตเป็นแถวว่าง (คง id เดิม)', () => {
    const rows: WizardExperienceRow[] = [
      { ...newExperienceRow(), id: 'x', company: 'A', position: 'ก', startDate: '2018-01-01', isCurrent: true },
      newExperienceRow(),
    ];
    // จำลองการ "ล้าง" = แทนที่ด้วยแถวว่างที่ใช้ id เดิม
    const cleared = rows.map((r) => (r.id === 'x' ? { ...newExperienceRow(), id: 'x' } : r));
    const x = cleared.find((r) => r.id === 'x')!;
    assert.equal(x.company, '');
    assert.equal(x.isCurrent, false);
    assert.equal(x.endDate, null);
    assert.equal(cleared[1].id, rows[1].id, 'ไม่กระทบแถวอื่น');
  });
});

/* --------------- Layout ตาราง Excel (โครงสร้าง) --------------- */

describe('Layout ตาราง Excel ประสบการณ์', () => {
  const src = readFileSync('src/components/leaders/NewLeaderWizard.tsx', 'utf8');

  test('ใช้ Toggle switch (role="switch") สำหรับงานปัจจุบัน + ป้าย "ปัจจุบัน"/"สิ้นสุดแล้ว"', () => {
    assert.ok(src.includes('role="switch"'));
    assert.ok(src.includes('สิ้นสุดแล้ว'));
  });

  test('Header sticky + คอลัมน์เลขแถว (#) + สรุป "กรอกแล้ว N รายการ"', () => {
    assert.ok(src.includes('[&_th]:sticky'), 'header ต้อง sticky');
    assert.ok(src.includes('กรอกแล้ว '), 'มีสรุปจำนวนที่กรอกแล้ว');
    assert.ok(src.includes('data-cell='), 'เซลล์มี data-cell สำหรับ keyboard navigation');
  });

  test('มีคอลัมน์ “สลับลำดับ” + Drag & Drop และไม่เรียงตามวันที่อัตโนมัติ', () => {
    assert.ok(src.includes('สลับลำดับ'), 'มีหัวคอลัมน์สลับลำดับ');
    assert.ok(src.includes('useDragReorder'), 'ใช้ hook สลับลำดับ');
    assert.ok(src.includes('DragHandle'), 'มีไอคอนลากในแต่ละแถว');
    assert.ok(!src.includes('onBlur={resort}'), 'ไม่เรียงตามวันที่อัตโนมัติแล้ว (คงลำดับที่ผู้ใช้จัด)');
  });

  test('ตารางใช้ความกว้างเต็ม + min-width + เลื่อนแนวนอนภายในตาราง (ไม่ใช่ทั้งหน้า)', () => {
    assert.ok(src.includes('overflow-x-auto'), 'ตารางมี overflow-x-auto');
    assert.ok(/min-w-\[\d+px\]/.test(src), 'ตารางกำหนด min-width');
    assert.ok(src.includes('w-full min-w-['), 'ตารางใช้ w-full + min-width');
  });
});

/* --------------- Layout กว้างขึ้น (1440px) --------------- */

describe('Layout เนื้อหากว้างขึ้น 1440px', () => {
  const shell = readFileSync('src/components/layout/AppShell.tsx', 'utf8');
  const wizard = readFileSync('src/components/leaders/NewLeaderWizard.tsx', 'utf8');

  test('AppShell ใช้ .zego-main (กว้างสุด 1660px ตาม token ของ zego) แทนสูตร calc 1440px เดิม', () => {
    assert.ok(shell.includes('zego-main'), 'เนื้อหาหลักใช้ class zego-main ของ zego-design-system');
    assert.ok(!shell.includes('min(calc(100%_-_32px),1440px)'), 'ไม่ใช้สูตร calc 1440px แบบเดิมแล้ว (ใช้ token --zego-max ของ zego แทน)');
    assert.ok(!shell.includes('max-w-7xl'), 'ไม่ใช้ max-w-7xl (1280px) เดิมแล้ว');
  });

  test('Wizard เต็มความกว้างเนื้อหา (ไม่จำกัด max-w-4xl เดิม)', () => {
    assert.ok(!wizard.includes('max-w-4xl'), 'เอา max-w-4xl (896px) ออกแล้ว');
  });
});

/* --------------- Layout ความถนัด (checkbox card + เลือกทั้งหมด) --------------- */

describe('Layout ความถนัดในการออกทัวร์', () => {
  const src = readFileSync('src/components/leaders/NewLeaderWizard.tsx', 'utf8');

  test('ใช้ checkbox (ไม่ใช่ radio) + "เลือกทั้งหมด" แบบ indeterminate + ตัวนับ', () => {
    // การ์ดตัวเลือกใช้ checkbox
    assert.ok(src.includes('toggleTourType(t.code)'));
    assert.ok(src.includes('IndeterminateCheckbox'), 'มี checkbox เลือกทั้งหมดแบบ indeterminate');
    assert.ok(src.includes('toggleAllTourTypes'));
    assert.ok(src.includes('เลือกแล้ว {form.tourTypes.length} จาก'), 'แสดงจำนวนที่เลือก');
  });

  test('การ์ดตัวเลือก 3/2/1 คอลัมน์ + เงื่อนไข sales/other', () => {
    assert.ok(src.includes("form.tourTypes.includes('sales')"), 'มีเงื่อนไข เน้นทำยอด');
    assert.ok(src.includes("form.tourTypes.includes('other')"), 'มีเงื่อนไข อื่น ๆ');
    assert.ok(/grid gap-2 sm:grid-cols-2 lg:grid-cols-3/.test(src), '3/2/1 คอลัมน์');
  });

  test('IndeterminateCheckbox ตั้ง .indeterminate ผ่าน ref + aria-checked mixed', () => {
    assert.ok(src.includes('ref.current.indeterminate = indeterminate'));
    assert.ok(src.includes("aria-checked={indeterminate ? 'mixed'"));
  });

  test('ประเทศ/เส้นทาง: Radio ขอบเขต + Combobox ประเทศ + Multi-select เส้นทาง + Modal ยืนยัน', () => {
    assert.ok(src.includes('RouteExpertiseEditor'));
    assert.ok(src.includes('RouteMultiSelect'), 'มี autocomplete multi-select');
    assert.ok(src.includes('CountryCombobox'), 'มี combobox ค้นหาประเทศ');
    assert.ok(src.includes('name="expertise-scope"'), 'radio ขอบเขตหลัก');
    assert.ok(src.includes('เชี่ยวชาญทุกประเทศและทุกเส้นทาง'), 'สรุปทุกประเทศ');
    assert.ok(src.includes('ทุกเส้นทางในประเทศ'), 'badge ทุกเส้นทาง');
    // เพิ่มเส้นทางเอง + backspace ลบ tag ล่าสุด
    assert.ok(src.includes('makeCustomRoute'));
    assert.ok(src.includes("e.key === 'Backspace'"), 'Backspace ลบ tag ล่าสุด');
    assert.ok(src.includes('HighlightText'), 'ไฮไลต์คำค้น');
  });

  test('ดีไซน์การ์ด: multi-select ประเทศ + ปุ่มยอดนิยม + การ์ดย่อ/ขยาย + สรุป', () => {
    // เพิ่มประเทศแล้วสร้างการ์ดอัตโนมัติ (combobox onSelect + ปุ่มยอดนิยม)
    assert.ok(src.includes('onSelect={addCountry}'), 'เพิ่มประเทศจาก combobox');
    assert.ok(src.includes('addCountry(c)'), 'ปุ่มยอดนิยมเพิ่มประเทศ');
    assert.ok(src.includes('WIZARD_POPULAR_COUNTRY_CODES'), 'มีปุ่มประเทศยอดนิยม');
    assert.ok(src.includes('expanded: !row.expanded'), 'การ์ดย่อ/ขยายได้');
    assert.ok(src.includes('สรุปความเชี่ยวชาญ'), 'มีส่วนสรุป');
    assert.ok(src.includes('เลือกแล้ว {value.length} ประเทศ'), 'สรุปจำนวนประเทศ/เส้นทาง');
    // เส้นทางกรองด้วย countryCode (poolFor) — ไม่ใช่ชื่อประเทศ
    assert.ok(src.includes('poolFor(row.countryCode)'), 'กรองเส้นทางด้วย countryCode');
    // การ์ด 2 คอลัมน์บนจอใหญ่
    assert.ok(src.includes('grid gap-3 lg:grid-cols-2'), 'การ์ด 2 คอลัมน์บนจอใหญ่');
  });
});

/* -------------------- "ยังทำงานอยู่" (เลือกได้รายการเดียว) -------------------- */

describe('สถานะยังทำงานอยู่', () => {
  const mkRows = (): WizardExperienceRow[] => [
    { ...newExperienceRow(), id: 'a', company: 'A', position: 'มัคคุเทศก์', startDate: '2015-01-01', endDate: '2016-01-01', isCurrent: false },
    { ...newExperienceRow(), id: 'b', company: 'B', position: 'มัคคุเทศก์', startDate: '2018-01-01', endDate: '2020-01-01', isCurrent: true },
  ];

  test('เลือกแถวใหม่ → ยกเลิกแถวเดิม + ล้างวันสิ้นสุดของแถวที่เลือก', () => {
    const next = setCurrentExperience(mkRows(), 'a', true);
    const a = next.find((r) => r.id === 'a')!;
    const b = next.find((r) => r.id === 'b')!;
    assert.equal(a.isCurrent, true);
    assert.equal(a.endDate, null, 'ล้างวันสิ้นสุดของแถวที่เลือก');
    assert.equal(b.isCurrent, false, 'แถวเดิมถูกยกเลิกอัตโนมัติ');
  });

  test('มีสถานะยังทำงานอยู่ได้ไม่เกิน 1 รายการเสมอ', () => {
    const next = setCurrentExperience(mkRows(), 'a', true);
    assert.equal(next.filter((r) => r.isCurrent).length, 1);
  });

  test('ยกเลิกแถว → ปิดเฉพาะแถวนั้น (ไม่มีรายการปัจจุบัน)', () => {
    const next = setCurrentExperience(mkRows(), 'b', false);
    assert.equal(next.filter((r) => r.isCurrent).length, 0);
  });

  test('มีมากกว่า 1 รายการปัจจุบัน → validation แจ้งเตือน', () => {
    const twoCurrent: WizardForm = {
      ...fullForm(),
      experiences: [
        { ...newExperienceRow(), id: 'a', company: 'A', position: 'ก', startDate: '2015-01-01', isCurrent: true },
        { ...newExperienceRow(), id: 'b', company: 'B', position: 'ข', startDate: '2018-01-01', isCurrent: true },
      ],
    };
    const hit = validateWizardTab(twoCurrent, 'experience').find((e) => e.field === 'experiences');
    assert.ok(hit);
    assert.match(hit.message, /ได้เพียง 1 รายการ/);
  });

  test('เรียงลำดับ: รายการปัจจุบันบนสุด · ปีใหม่เหนือปีเก่า', () => {
    const rows: WizardExperienceRow[] = [
      { ...newExperienceRow(), company: 'เก่า', startDate: '2010-01-01', endDate: '2012-01-01' },
      { ...newExperienceRow(), company: 'ปัจจุบัน', startDate: '2016-01-01', isCurrent: true },
      { ...newExperienceRow(), company: 'ใหม่', startDate: '2021-01-01', endDate: '2023-01-01' },
    ];
    const sorted = sortExperienceRows(rows);
    assert.deepEqual(
      sorted.map((r) => r.company),
      ['ปัจจุบัน', 'ใหม่', 'เก่า'],
    );
    // ไม่แก้ไข array ต้นฉบับ
    assert.equal(rows[0].company, 'เก่า');
  });
});

/* --------------------- คำนวณประสบการณ์รวม (ไม่นับซ้อนทับ) --------------------- */

describe('คำนวณประสบการณ์รวม', () => {
  const row = (startDate: string, endDate: string, isCurrent = false): WizardExperienceRow => ({
    ...newExperienceRow(),
    company: 'X',
    position: 'มัคคุเทศก์',
    startDate,
    endDate,
    isCurrent,
  });

  test('รวมช่วงต่อเนื่องเป็นจำนวนเดือนที่ถูกต้อง', () => {
    // ม.ค.2018 – ธ.ค.2019 = 24 เดือน = 2 ปี
    const s = summarizeWizardExperience([row('2018-01-01', '2019-12-31')], TODAY);
    assert.equal(s.totalMonths, 24);
    assert.equal(s.label, '2 ปี');
  });

  test('ช่วงที่ซ้อนทับกันไม่ถูกนับซ้ำ', () => {
    // 2018-01..2019-12 (24) ซ้อนกับ 2019-01..2020-12 (24) → รวมจริง 2018-01..2020-12 = 36 เดือน
    const s = summarizeWizardExperience(
      [row('2018-01-01', '2019-12-31'), row('2019-01-01', '2020-12-31')],
      TODAY,
    );
    assert.equal(s.totalMonths, 36);
    assert.equal(s.label, '3 ปี');
  });

  test('เรียงประสบการณ์ล่าสุดไว้บน (งานปัจจุบันก่อน)', () => {
    const older = row('2015-01-01', '2016-01-01');
    older.company = 'เก่า';
    const newer = row('2020-01-01', '2021-01-01');
    newer.company = 'ใหม่';
    const current = row('2022-01-01', '', true);
    current.company = 'ปัจจุบัน';
    const sorted = sortExperienceRows([older, newer, current]);
    assert.deepEqual(
      sorted.map((r) => r.company),
      ['ปัจจุบัน', 'ใหม่', 'เก่า'],
    );
  });
});

/* --------------------------- แท็บ 3: ความสามารถด้านภาษา --------------------------- */

describe('แท็บ 3 — ความสามารถด้านภาษา', () => {
  test('ต้องมีอย่างน้อย 1 ภาษา', () => {
    const none: WizardForm = { ...fullForm(), languages: [] };
    assert.ok(fields(none, 'language').includes('languages'));
  });

  test('ระดับเริ่มต้นเป็น "ไม่ระบุ" (ค่าว่าง) และยังไม่ติ๊กภาษาแม่', () => {
    const row = newLanguageRow('ไทย');
    assert.equal(row.levelCode, '');
    assert.equal(row.isNativeLanguage, false);
  });

  test('ห้ามเพิ่มภาษาซ้ำ', () => {
    const dup: WizardForm = {
      ...fullForm(),
      languages: [newLanguageRow('อังกฤษ'), newLanguageRow('อังกฤษ')],
    };
    assert.ok(validateWizardTab(dup, 'language').some((e) => /ถูกเพิ่มซ้ำ/.test(e.message)));
  });

  test('เลือก "อื่น ๆ" ต้องระบุชื่อภาษา', () => {
    const other: WizardForm = {
      ...fullForm(),
      languages: [{ ...newLanguageRow('อื่น ๆ'), customLanguage: '' }],
    };
    assert.ok(validateWizardTab(other, 'language').length > 0);

    const named: WizardForm = {
      ...fullForm(),
      languages: [{ ...newLanguageRow('อื่น ๆ'), customLanguage: 'เวียดนาม' }],
    };
    assert.deepEqual(fields(named, 'language'), []);
    assert.equal(resolvedLanguageName(named.languages[0]), 'เวียดนาม');
  });

  test('มาตรฐานระดับภาษาเปลี่ยนตามภาษาที่เลือกอัตโนมัติ', () => {
    assert.equal(wizardLanguageStandard('อังกฤษ'), 'CEFR');
    assert.equal(wizardLanguageStandard('จีนกลาง'), 'HSK');
    assert.equal(wizardLanguageStandard('ญี่ปุ่น'), 'JLPT');
    assert.equal(wizardLanguageStandard('เกาหลี'), 'TOPIK');
    assert.equal(wizardLanguageStandard('ไทย'), 'GENERAL');
    assert.equal(wizardLanguageStandard('อื่น ๆ'), 'GENERAL');
  });
});

/* -------------------------- แท็บ 4: ความถนัดในการออกทัวร์ -------------------------- */

describe('แท็บ 4 — ความถนัดในการออกทัวร์', () => {
  const codes = WIZARD_TOUR_TYPES.map((t) => t.code);

  test('มี 7 ตัวเลือกตามที่กำหนด', () => {
    assert.deepEqual(codes, ['walk_in', 'charter', 'sales', 'vip', 'entertain', 'history', 'other']);
  });

  test('ต้องเลือกอย่างน้อย 1 รายการ · เลือก 1/หลาย/ทุกข้อได้', () => {
    assert.ok(fields({ ...fullForm(), tourTypes: [] }, 'expertise').includes('tourTypes'));
    // เลือก 1 ข้อ
    assert.deepEqual(fields({ ...fullForm(), tourTypes: ['vip'] }, 'expertise'), []);
    // เลือกหลายข้อ
    assert.deepEqual(fields({ ...fullForm(), tourTypes: ['walk_in', 'charter', 'vip'] }, 'expertise'), []);
  });

  test('"เลือกทั้งหมด": isAllTourTypesSelected / isTourTypesIndeterminate', () => {
    assert.equal(isAllTourTypesSelected(codes), true);
    assert.equal(isAllTourTypesSelected(['vip']), false);
    assert.equal(isTourTypesIndeterminate(['vip']), true, 'บางข้อ = กึ่งเลือก');
    assert.equal(isTourTypesIndeterminate([]), false, 'ยังไม่เลือก = ไม่กึ่งเลือก');
    assert.equal(isTourTypesIndeterminate(codes), false, 'ครบทุกข้อ = ไม่กึ่งเลือก');
  });

  test('เลือกทุกข้อพร้อมกันได้ (แต่ต้องกรอก sales + other จึงจะผ่าน)', () => {
    const all = (patch: Partial<WizardForm> = {}): WizardForm => ({
      ...fullForm(),
      tourTypes: [...codes],
      salesAmount: '2500000',
      salesCurrency: 'THB',
      expertiseOther: 'ทัวร์เดินป่า',
      ...patch,
    });
    assert.deepEqual(fields(all(), 'expertise'), []);
    // ขาด sales → error
    assert.ok(fields(all({ salesAmount: '' }), 'expertise').includes('salesAmount'));
    assert.ok(fields(all({ salesCurrency: '' }), 'expertise').includes('salesCurrency'));
    // ขาด other → error
    assert.ok(fields(all({ expertiseOther: '' }), 'expertise').includes('expertiseOther'));
  });

  test('"เน้นทำยอด": บังคับยอดขาย + สกุลเงิน · สกุลเงินอื่นต้องระบุ', () => {
    const sales = (patch: Partial<WizardForm> = {}): WizardForm => ({
      ...fullForm(),
      tourTypes: ['sales'],
      salesAmount: '1000000',
      salesCurrency: 'USD',
      ...patch,
    });
    assert.deepEqual(fields(sales(), 'expertise'), []);
    assert.ok(fields(sales({ salesAmount: '' }), 'expertise').includes('salesAmount'));
    assert.ok(fields(sales({ salesAmount: '-5' }), 'expertise').includes('salesAmount'));
    assert.ok(fields(sales({ salesCurrency: '' }), 'expertise').includes('salesCurrency'));
    // สกุลเงิน "อื่น ๆ" ต้องระบุ
    assert.ok(fields(sales({ salesCurrency: 'other', salesCurrencyOther: '' }), 'expertise').includes('salesCurrencyOther'));
    assert.deepEqual(fields(sales({ salesCurrency: 'other', salesCurrencyOther: 'AUD' }), 'expertise'), []);
  });

  test('"อื่น ๆ": บังคับระบุ ≤ 200 ตัวอักษร', () => {
    const other = (v: string): WizardForm => ({ ...fullForm(), tourTypes: ['other'], expertiseOther: v });
    assert.deepEqual(fields(other('ทัวร์เดินป่า'), 'expertise'), []);
    assert.ok(fields(other(''), 'expertise').includes('expertiseOther'));
    assert.ok(fields(other('ก'.repeat(WIZARD_EXPERTISE_OTHER_MAX + 1)), 'expertise').includes('expertiseOther'));
  });

  test('ทนทานต่อ state เก่าที่ไม่มีฟิลด์ sales/other (ไม่ crash)', () => {
    // จำลอง state ที่สร้างก่อนเพิ่มฟิลด์ (undefined) แล้วเลือก sales + other
    const stale = { ...fullForm(), tourTypes: ['sales', 'other'] } as Record<string, unknown>;
    delete stale.salesAmount;
    delete stale.salesCurrency;
    delete stale.salesCurrencyOther;
    delete stale.expertiseOther;
    const result = validateWizard(stale as unknown as WizardForm);
    // ต้องไม่ throw และแจ้ง error ของช่องที่ขาด
    const f = result.errors.filter((e) => e.tab === 'expertise').map((e) => e.field);
    assert.ok(f.includes('salesAmount'));
    assert.ok(f.includes('salesCurrency'));
    assert.ok(f.includes('expertiseOther'));
  });

  test('ไม่เลือก sales/other → ไม่ตรวจข้อมูลเพิ่มเติมของสองข้อนั้น', () => {
    // เลือกเฉพาะ vip → ไม่มี error ของ salesAmount/expertiseOther แม้ค่าว่าง
    const f = fields({ ...fullForm(), tourTypes: ['vip'], salesAmount: '', expertiseOther: '' }, 'expertise');
    assert.ok(!f.includes('salesAmount'));
    assert.ok(!f.includes('expertiseOther'));
  });

  test('map: "อื่น ๆ" ใช้ข้อความที่ระบุเป็นชื่อทักษะ', () => {
    const r = formToLeader(
      wizardToLeaderForm(
        { ...fullForm(), tourTypes: ['vip', 'other'], expertiseOther: 'ทัวร์ถ่ายภาพ' },
        'TL-0013',
        TODAY,
      ),
      BUILD,
    );
    const otherSkill = r.tourSkills.find((s) => s.code === 'other');
    assert.ok(otherSkill);
    assert.equal(otherSkill.name, 'ทัวร์ถ่ายภาพ');
  });
});

/* ---------------- ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น) ---------------- */

describe('ประเทศ/เส้นทางที่เชี่ยวชาญ', () => {
  const JP = { id: 'C-JP', nameTh: 'ญี่ปุ่น', nameEn: 'JAPAN' };
  const pool: WizardRoute[] = [
    { id: 'R-JP-A1', countryCode: 'C-JP', iataCode: 'NRT', nameTh: 'โตเกียว / นาริตะ', nameEn: 'Tokyo / Narita', keywords: ['โตเกียว', 'ญี่ปุ่น'] },
    { id: 'R-JP-A3', countryCode: 'C-JP', iataCode: 'KIX', nameTh: 'โอซาก้า / คันไซ', nameEn: 'Osaka / Kansai', keywords: ['โอซาก้า'] },
    { id: 'R-JP-R1', countryCode: 'C-JP', iataCode: 'CTS', nameTh: 'ซัปโปโร / ชิโตเสะ', nameEn: 'Sapporo / Chitose', keywords: ['ฮอกไกโด'] },
  ];

  test('ค่าเริ่มต้น expertiseScope = all_countries → validate ผ่าน', () => {
    assert.deepEqual(fields(fullForm(), 'expertise'), []);
    assert.equal(emptyWizardForm('TL-0013').expertiseScope, 'all_countries');
  });

  test('"ทุกประเทศ ทุกเส้นทาง" → generalNote มีข้อความสรุป', () => {
    const r = formToLeader(wizardToLeaderForm(fullForm(), 'TL-0013', TODAY), BUILD);
    assert.match(r.generalNote, /เชี่ยวชาญทุกประเทศและทุกเส้นทาง/);
  });

  test('selected_countries: ต้องมีประเทศอย่างน้อย 1 · แต่ละแถวต้องเลือกประเทศ · ห้ามซ้ำ', () => {
    // ไม่มีประเทศเลย
    const none: WizardForm = { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [] };
    assert.ok(fields(none, 'expertise').includes('expertiseCountries'));

    // แถวว่าง (ยังไม่เลือกประเทศ) ไม่ error รายแถว แต่ยัง error รวม
    const empty = newCountryExpertise();
    const withEmpty: WizardForm = { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [empty] };
    assert.ok(fields(withEmpty, 'expertise').includes('expertiseCountries'));

    // ประเทศซ้ำ
    const a = newCountryExpertise(JP);
    const b = newCountryExpertise(JP);
    const dup: WizardForm = { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [a, b] };
    const errs = validateWizardTab(dup, 'expertise');
    assert.ok(errs.some((e) => /ถูกเพิ่มซ้ำ/.test(e.message)));
  });

  test('"เฉพาะเส้นทาง" ต้องมีเส้นทางอย่างน้อย 1 · "ทุกเส้นทาง" ไม่ต้อง', () => {
    const selNoRoute: WizardCountryExpertise = { ...newCountryExpertise(JP), routeScope: 'selected_routes', routes: [] };
    const f1: WizardForm = { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [selNoRoute] };
    assert.ok(validateWizardTab(f1, 'expertise').some((e) => /สนามบินหรือจุดหมายปลายทางอย่างน้อย/.test(e.message)));

    const allRoutes: WizardCountryExpertise = { ...newCountryExpertise(JP), routeScope: 'all_routes', routes: [] };
    const f2: WizardForm = { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [allRoutes] };
    assert.deepEqual(fields(f2, 'expertise'), []);
  });

  test('filterRoutes: ค้นรหัส IATA/ชื่อไทย/อังกฤษ/keyword · ต้อง ≥ 2 ตัวอักษร · ตัดที่เลือกแล้ว', () => {
    assert.equal(filterRoutes(pool, 'ก', []).length, 0, 'ตัวอักษรเดียวไม่ค้น');
    assert.deepEqual(filterRoutes(pool, 'nrt', []).map((r) => r.id), ['R-JP-A1'], 'ค้นด้วยรหัส IATA');
    assert.deepEqual(filterRoutes(pool, 'cts', []).map((r) => r.id), ['R-JP-R1'], 'ค้นรหัส IATA (CTS)');
    assert.deepEqual(filterRoutes(pool, 'โตเกียว', []).map((r) => r.id), ['R-JP-A1'], 'ค้นชื่อเมืองไทย');
    assert.deepEqual(filterRoutes(pool, 'osaka', []).map((r) => r.id), ['R-JP-A3'], 'ค้นชื่อสนามบินอังกฤษ');
    assert.deepEqual(filterRoutes(pool, 'ฮอกไกโด', []).map((r) => r.id), ['R-JP-R1'], 'ค้น keyword');
    // ตัดที่เลือกแล้ว
    assert.deepEqual(filterRoutes(pool, 'sapporo', ['R-JP-R1']).map((r) => r.id), [], 'ที่เลือกแล้วถูกตัดออก');
  });

  test('makeCustomRoute + isDuplicateRouteName (ไม่สนตัวพิมพ์)', () => {
    const custom = makeCustomRoute('C-JP', ' โตเกียว–ฟูจิ ');
    assert.equal(custom.isCustom, true);
    assert.equal(custom.nameTh, 'โตเกียว–ฟูจิ');
    assert.equal(custom.countryCode, 'C-JP');
    assert.equal(custom.iataCode, 'โตเกียว–ฟูจิ'.toUpperCase(), 'iataCode = ชื่อที่พิมพ์ (uppercase)');
    assert.ok(isDuplicateRouteName([custom], 'โตเกียว–ฟูจิ'));
    assert.ok(isDuplicateRouteName(pool, 'SAPPORO / CHITOSE'), 'ไม่สนตัวพิมพ์ (nameEn)');
    assert.ok(!isDuplicateRouteName(pool, 'เชียงใหม่'));
  });

  test('isDuplicateCountry ตรวจประเทศซ้ำ (ยกเว้นแถวตัวเอง)', () => {
    const a = newCountryExpertise(JP);
    assert.ok(isDuplicateCountry([a], 'C-JP'));
    assert.ok(!isDuplicateCountry([a], 'C-JP', a.id), 'ยกเว้นแถวตัวเอง');
    assert.ok(!isDuplicateCountry([a], 'C-KR'));
  });

  test('การ์ดใหม่: ค่าเริ่มต้น routeScope=all_routes · expanded=true · id ไม่ซ้ำ', () => {
    const a = newCountryExpertise(JP);
    const b = newCountryExpertise(JP);
    assert.equal(a.routeScope, 'all_routes');
    assert.equal(a.expanded, true);
    assert.equal(a.countryCode, 'C-JP');
    assert.notEqual(a.id, b.id);
  });

  test('countSelectedRoutes: นับเฉพาะเส้นทางของประเทศที่เลือก "เฉพาะเส้นทาง"', () => {
    const all = { ...newCountryExpertise(JP), routeScope: 'all_routes' as const, routes: [pool[0]] };
    const sel: WizardCountryExpertise = {
      ...newCountryExpertise({ id: 'C-KR', nameTh: 'เกาหลีใต้', nameEn: 'KOREA' }),
      routeScope: 'selected_routes',
      routes: [pool[0], pool[1]],
    };
    assert.equal(countSelectedRoutes([all, sel]), 2, 'นับเฉพาะ selected_routes');
  });

  test('ประเทศยอดนิยม 7 รายการตามที่กำหนด', () => {
    assert.deepEqual(WIZARD_POPULAR_COUNTRY_CODES, ['JP', 'CN', 'KR', 'VN', 'SG', 'FR', 'IT']);
  });

  test('map: selected_countries → routeSkills (custom route เก็บใน note)', () => {
    const jp: WizardCountryExpertise = {
      ...newCountryExpertise(JP),
      routeScope: 'selected_routes',
      routes: [pool[0], makeCustomRoute('C-JP', 'โตเกียว–ฟูจิ')],
    };
    // ตรวจที่ LeaderFormState โดยตรง (formToLeader จะ normalize routeIds ตาม master routes)
    const lf = wizardToLeaderForm(
      { ...fullForm(), expertiseScope: 'selected_countries', expertiseCountries: [jp] },
      'TL-0013',
      TODAY,
    );
    const skill = lf.routeSkills.find((s) => s.countryId === 'C-JP');
    assert.ok(skill);
    assert.equal(skill.coverage, 'selected_routes');
    assert.ok(skill.routeIds.includes('R-JP-A1'), 'เส้นทาง master ถูกเก็บใน routeIds');
    assert.match(skill.note ?? '', /เพิ่มเอง.*โตเกียว–ฟูจิ/);
  });
});

/* ---------------- เส้นทางบิน (Flight Route Builder) ---------------- */

describe('เส้นทางบินจากสนามบินที่เลือก', () => {
  test('newFlightRoute: id ไม่ซ้ำ · เริ่มต้นไม่มีสนามบิน', () => {
    const a = newFlightRoute();
    const b = newFlightRoute();
    assert.deepEqual(a.airportCodes, []);
    assert.notEqual(a.id, b.id);
  });

  test('flightRoutePreview: ต่อรหัสด้วยลูกศร', () => {
    assert.equal(flightRoutePreview(['BKK', 'NRT', 'CTS']), 'BKK → NRT → CTS');
    assert.equal(flightRoutePreview(['BKK']), 'BKK');
    assert.equal(flightRoutePreview([]), '');
  });

  test('canAppendAirport: ห้ามซ้ำสนามบินติดกัน · ต่อสนามบินอื่นได้', () => {
    assert.ok(canAppendAirport([], 'BKK'), 'ว่างเปล่าเพิ่มได้');
    assert.ok(canAppendAirport(['BKK'], 'NRT'), 'ต่อสนามบินอื่นได้');
    assert.ok(!canAppendAirport(['BKK'], 'BKK'), 'ห้ามซ้ำติดกัน');
    assert.ok(canAppendAirport(['BKK', 'NRT'], 'BKK'), 'ซ้ำไม่ติดกันได้ (ไป-กลับ)');
  });

  test('isFlightRouteValid: ต้องมีอย่างน้อย 2 สนามบิน', () => {
    assert.ok(!isFlightRouteValid({ id: 'FR1', airportCodes: [] }));
    assert.ok(!isFlightRouteValid({ id: 'FR1', airportCodes: ['BKK'] }));
    assert.ok(isFlightRouteValid({ id: 'FR1', airportCodes: ['BKK', 'NRT'] }));
  });

  test('moveItem: ย้ายตำแหน่ง (ไม่กลายพันธุ์ต้นฉบับ)', () => {
    const src = ['A', 'B', 'C', 'D'];
    assert.deepEqual(moveItem(src, 0, 2), ['B', 'C', 'A', 'D']);
    assert.deepEqual(moveItem(src, 3, 0), ['D', 'A', 'B', 'C']);
    assert.deepEqual(src, ['A', 'B', 'C', 'D'], 'ต้นฉบับไม่เปลี่ยน');
    assert.deepEqual(moveItem(src, 1, 1), ['A', 'B', 'C', 'D'], 'ที่เดิม = ไม่เปลี่ยน');
  });
});

/* ---------------------------- แท็บ 5: เอกสารประจำตัว ---------------------------- */

describe('แท็บ 5 — เอกสารประจำตัว', () => {
  test('ด้านหน้าบัตรประชาชนบังคับอัปโหลด', () => {
    const f = fields({ ...fullForm(), idCard: newDocEntry('id_card') }, 'documents');
    assert.ok(f.includes('idCard'));
  });

  test('เลขบัตรประชาชนจากเอกสารต้อง 13 หลัก (ถ้ากรอก)', () => {
    const badId = fields({ ...fullForm(), idCard: docEntry('id_card', { idNumber: '123' }) }, 'documents');
    assert.ok(badId.includes(docFieldErrorKey('id_card', 'x', 'idNumber')));
    const okId = fields(
      { ...fullForm(), idCard: docEntry('id_card', { idNumber: '1234567890123' }) },
      'documents',
    );
    assert.ok(!okId.includes(docFieldErrorKey('id_card', 'x', 'idNumber')));
  });

  test('หนังสือเดินทาง/วีซ่า/บัตรหัวหน้าทัวร์ = เพิ่มได้หลายรายการและไม่บังคับ', () => {
    const f = fields(
      { ...fullForm(), passports: [], visas: [], tourCards: [], criminalRecord: newDocEntry('criminal_record') },
      'documents',
    );
    assert.ok(!f.some((k) => k.startsWith('passport_') || k.startsWith('visa_') || k.startsWith('tourCard_')));
  });

  test('วันหมดอายุต้องไม่ก่อนวันที่ออก (ต่อรายการ หนังสือเดินทาง/วีซ่า/บัตร)', () => {
    const p = docEntry('passport', { issuedDate: '2030-01-10', expiryDate: '2030-01-01' });
    const badPassport = fields({ ...fullForm(), passports: [p] }, 'documents');
    assert.ok(badPassport.includes(docFieldErrorKey('passport', p.id, 'expiryDate')));

    const v = docEntry('visa', { issuedDate: '2030-01-10', expiryDate: '2030-01-01' });
    const badVisa = fields({ ...fullForm(), visas: [v] }, 'documents');
    assert.ok(badVisa.includes(docFieldErrorKey('visa', v.id, 'expiryDate')));

    const c = docEntry('tour_card', { issuedDate: '2030-01-10', expiryDate: '2030-01-01' });
    const badCard = fields({ ...fullForm(), tourCards: [c] }, 'documents');
    assert.ok(badCard.includes(docFieldErrorKey('tour_card', c.id, 'expiryDate')));

    const okP = docEntry('passport', { issuedDate: '2030-01-01', expiryDate: '2035-01-01' });
    const ok = fields({ ...fullForm(), passports: [okP] }, 'documents');
    assert.ok(!ok.includes(docFieldErrorKey('passport', okP.id, 'expiryDate')));
  });
});

/* --------------------------- แท็บ 6: เอกสารเพิ่มเติม --------------------------- */

describe('แท็บ 6 — เอกสารเพิ่มเติม', () => {
  test('เอกสารประวัติอาชญากรรมถูก validate ในแท็บ "additional" ไม่ใช่ "documents"', () => {
    const cr = docEntry('criminal_record', { issuedDate: '2030-01-10', expiryDate: '2030-01-01' });
    const key = docFieldErrorKey('criminal_record', cr.id, 'expiryDate');
    // อยู่ในแท็บ additional
    assert.ok(fields({ ...fullForm(), criminalRecord: cr }, 'additional').includes(key));
    // ไม่อยู่ในแท็บ documents
    assert.ok(!fields({ ...fullForm(), criminalRecord: cr }, 'documents').includes(key));
  });

  test('เอกสารประวัติอาชญากรรม (ยืนยันแล้ว) → เข้า payload พร้อมวันหมดอายุ', () => {
    const cr = docEntry('criminal_record', {
      documentNumber: 'CR-77',
      issuedDate: '2026-01-01',
      expiryDate: '2027-01-01',
      result: 'ไม่พบประวัติ',
    });
    cr.verified = true;
    const state = wizardToLeaderForm({ ...fullForm(), criminalRecord: cr }, 'TL-0013', TODAY);
    const doc = formToLeader(state, BUILD).documents.find((d) => d.name === 'เอกสารประวัติอาชญากรรม');
    assert.ok(doc && doc.kind === 'other');
    assert.equal(doc.expiresAt, '2027-01-01');
    assert.equal(doc.verifyStatus, 'verified');
  });
});

/* -------------- ประเภทการติดต่อ "โทรศัพท์ (คน Call)" — เบอร์โทรระหว่างประเทศ -------------- */

/** แถวติดต่อประเภทคน Call พร้อมข้อมูล */
const callContact = (over: Partial<WizardContactRow> = {}): WizardContactRow =>
  mkContact({ id: 'call1', type: 'call', callName: 'สมหญิง ใจดี', callPhone: computePhone('0812345678', 'TH'), ...over });

describe('ประเภทการติดต่อ "โทรศัพท์ (คน Call)"', () => {
  test('computePhone: เบอร์ไทย → E.164 +66 · ค่าเริ่มต้น TH', () => {
    const p = computePhone('081-234-5678', 'TH');
    assert.equal(p.phoneE164, '+66812345678');
    assert.equal(p.dialCode, '+66');
    assert.equal(p.countryCode, 'TH');
    assert.ok(isPhoneValid(p));
  });

  test('วางเบอร์สากลนำหน้าด้วยรหัสประเทศ → สลับประเทศ กันรหัสซ้ำ', () => {
    const p = computePhone('+81 90-1234-5678', 'TH');
    assert.equal(p.countryCode, 'JP');
    assert.equal(p.phoneE164, '+819012345678');
  });

  test('เบอร์ไม่ถูกต้อง → isPhoneValid = false', () => {
    assert.equal(isPhoneValid(computePhone('123', 'TH')), false);
  });

  test('"โทรศัพท์ (คน Call)" เป็นตัวเลือกในรายการประเภทการติดต่อ (ไม่ซ้ำ)', () => {
    const calls = WIZARD_CONTACT_TYPES.filter((t) => t.value === 'call');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].label, 'โทรศัพท์ (คน Call)');
  });

  test('validateWizard: แถวคน Call เบอร์ผิด → error รายแถว · เบอร์ถูก → ผ่าน', () => {
    const bad = validateWizard({
      ...fullForm(),
      contacts: [...fullForm().contacts, callContact({ callPhone: computePhone('12', 'TH') })],
    });
    assert.ok(bad.errors.some((e) => e.field === 'call1'));
    assert.ok(validateWizard({ ...fullForm(), contacts: [...fullForm().contacts, callContact()] }).ok);
  });

  test('mapper: แถวคน Call → emergencyContacts (E.164 · note ระบุประเภท) · ไม่เป็นช่องทางติดต่อทั่วไป', () => {
    const state = wizardToLeaderForm(
      { ...fullForm(), contacts: [...fullForm().contacts, callContact()] },
      'TL-0013',
      TODAY,
    );
    assert.equal(state.emergencyContacts.length, 1);
    assert.equal(state.emergencyContacts[0].name, 'สมหญิง ใจดี');
    assert.equal(state.emergencyContacts[0].relation, '');
    assert.equal(state.emergencyContacts[0].phone, '+66812345678');
    assert.equal(state.emergencyContacts[0].note, 'โทรศัพท์ (คน Call)');
    // ไม่ถูกเก็บเป็นช่องทางติดต่อทั่วไป
    assert.ok(!state.contacts.some((c) => c.value === '+66812345678'));
  });

  test('mapper: ไม่มีแถวคน Call → ไม่มี emergencyContacts', () => {
    assert.equal(wizardToLeaderForm(fullForm(), 'TL-0013', TODAY).emergencyContacts.length, 0);
  });
});

/* -------------------------------- ตรวจไฟล์แนบ -------------------------------- */

describe('ตรวจไฟล์แนบ', () => {
  const MB = 1024 * 1024;
  test('รับเฉพาะ JPG / PNG / PDF', () => {
    assert.equal(validateUploadFile({ type: 'image/jpeg', size: MB }), undefined);
    assert.equal(validateUploadFile({ type: 'image/png', size: MB }), undefined);
    assert.equal(validateUploadFile({ type: 'application/pdf', size: MB }), undefined);
    assert.ok(validateUploadFile({ type: 'image/gif', size: MB }));
    assert.ok(validateUploadFile({ type: 'text/plain', size: MB }));
  });

  test(`จำกัดขนาดไม่เกิน ${WIZARD_MAX_FILE_MB} MB`, () => {
    assert.equal(validateUploadFile({ type: 'image/png', size: WIZARD_MAX_FILE_MB * MB }), undefined);
    assert.ok(validateUploadFile({ type: 'image/png', size: WIZARD_MAX_FILE_MB * MB + 1 }));
  });
});

/* --------------------------- map เป็น LeaderFormState --------------------------- */

describe('wizardToLeaderForm → formToLeader', () => {
  const record = () => formToLeader(wizardToLeaderForm(fullForm(), 'TL-0013', TODAY), BUILD);

  test('ข้อมูลพื้นฐานและรหัสถูกต้อง (บุคคลสัญชาติไทย)', () => {
    const r = record();
    assert.equal(r.id, 'TL-0013');
    assert.equal(r.firstName, 'สมชาย');
    assert.equal(r.lastName, 'ทดสอบ');
    assert.equal(r.firstNameEn, 'Somchai');
    assert.equal(r.lastNameEn, 'Thodsob');
    assert.equal(r.titleEn, 'Mr.');
    assert.equal(r.personType, 'thai');
  });

  test('ชื่อเล่นไทยและอังกฤษถูกบันทึก', () => {
    const r = formToLeader(
      wizardToLeaderForm({ ...fullForm(), nickname: 'ชาย', nicknameEn: 'Chai' }, 'TL-0013', TODAY),
      BUILD,
    );
    assert.equal(r.nickname, 'ชาย');
    assert.equal(r.nicknameEn, 'Chai');
  });

  test('สัญชาติต่างชาติ → บุคคลต่างชาติ', () => {
    const r = formToLeader(
      wizardToLeaderForm({ ...fullForm(), nationality: 'foreign' }, 'TL-0013', TODAY),
      BUILD,
    );
    assert.equal(r.personType, 'foreigner');
  });

  test('เลขบัตรประชาชนถูกปิดบังก่อนบันทึก', () => {
    assert.equal(record().nationalIdNumber, 'xxxxxxxxx0123');
  });

  test('สัญชาติไทย → บันทึกเลขบัตร ไม่บันทึกเลขหนังสือเดินทาง', () => {
    const r = record();
    assert.equal(r.nationalIdNumber, 'xxxxxxxxx0123');
    assert.equal(r.passportNumber, undefined);
  });

  test('สัญชาติต่างชาติ → บันทึกเลขหนังสือเดินทาง (ปิดบัง) ไม่บันทึกเลขบัตร', () => {
    const r = formToLeader(
      wizardToLeaderForm(
        { ...fullForm(), nationality: 'foreign', passportNo: 'AB1234567' },
        'TL-0013',
        TODAY,
      ),
      BUILD,
    );
    assert.equal(r.personType, 'foreigner');
    assert.equal(r.nationalIdNumber, undefined);
    assert.equal(r.passportNumber, 'xxxxx4567'); // ปิดบัง เหลือ 4 ตัวท้าย
  });

  test('สัญชาติไทย → บุคคลไทย · รูปแบบการร่วมงานใช้ค่าเดียวกับระบบ (regular)', () => {
    const r = record();
    assert.equal(r.personType, 'thai');
    assert.equal(r.nationalityCountryId, 'C-TH');
    assert.equal(r.leaderType, 'regular');
  });

  test('รูปแบบการร่วมงานทั้ง 4 ค่าถูกบันทึกตรงตัว ไม่ต้อง map ข้ามชุดค่าอีกต่อไป', () => {
    const map: Record<string, string> = {
      general: 'general',
      regular: 'regular',
      freelance: 'freelance',
      agent: 'agent',
    };
    for (const [code, expected] of Object.entries(map)) {
      const r = formToLeader(
        wizardToLeaderForm({ ...fullForm(), leaderType: code as never }, 'TL-0013', TODAY),
        BUILD,
      );
      assert.equal(r.leaderType, expected, `${code} → ${expected}`);
    }
  });

  test('ที่อยู่: เก็บ หมู่/อาคาร/ซอย ครบ และที่อยู่ตามบัตรเท่ากับปัจจุบัน', () => {
    const r = record();
    assert.equal(r.address.province, 'กรุงเทพมหานคร');
    assert.equal(r.address.villageNo, '4');
    assert.equal(r.address.building, 'บ้านสวนดอกไม้');
    assert.equal(r.address.alley, 'ลาดพร้าว 1');
    assert.equal(r.idCardAddressSameAsCurrent, true);
    assert.deepEqual(r.idCardAddress, r.address);
  });

  test('ช่องทางติดต่อ: เบอร์หลักเป็นช่องทางหลัก + อีเมล/LINE/เบอร์สำรอง', () => {
    const contacts = record().contacts;
    assert.equal(contacts.length, 4);
    const primary = contacts.find((c) => c.isPrimary);
    assert.equal(primary?.type, 'phone');
    assert.equal(primary?.value, '081-234-5678');
    assert.ok(contacts.some((c) => c.type === 'email'));
    assert.ok(contacts.some((c) => c.type === 'line'));
  });

  test('ภาษา: เก็บมาตรฐานและระดับที่เลือกไว้ถูกต้อง', () => {
    const lang = record().languages[0];
    assert.equal(lang.languageName, 'อังกฤษ');
    assert.equal(lang.isNativeLanguage, false);
    assert.equal(lang.standard, 'CEFR');
    assert.equal(lang.levelCode, 'C1');
  });

  test('ความถนัด → ทักษะการทำงานตามจำนวนที่เลือก', () => {
    const skills = record().tourSkills;
    assert.equal(skills.length, 2);
    assert.ok(skills.every((s) => s.category === 'work_skill'));
  });

  test('เอกสาร: ด้านหน้าบัตรถูกบันทึก และเลขบัตรถูกปิดบัง (ไม่มีด้านหลังแล้ว)', () => {
    const docs = record().documents;
    const front = docs.find((d) => d.name.includes('ด้านหน้า'));
    assert.ok(front);
    assert.equal(front.fileName, 'front.jpg');
    assert.ok(!front.number.includes('12345'));
    // ไม่มีเอกสารบัตรประชาชนด้านหลังอีกต่อไป
    assert.ok(!docs.some((d) => d.name.includes('ด้านหลัง')));
  });

  test('เอกสาร: บัตรหัวหน้าทัวร์ + วีซ่า + ประวัติอาชญากรรม → บันทึกเป็นเอกสารตามชนิด (ใช้ verifiedData)', () => {
    const card = docEntry('tour_card', { cardType: '' });
    card.file = { name: 'card.png', type: 'image/png', size: 1024, dataUrl: 'data:image/png;base64,AA' };
    card.verified = true;
    const visa = docEntry('visa', { countryId: 'C-JP', visaType: 'Tourist', number: 'V123' });
    visa.file = { name: 'visa.pdf', type: 'application/pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AA' };
    const crime = docEntry('criminal_record', { documentNumber: 'CR-9', result: 'ไม่พบประวัติ' });
    crime.file = { name: 'crime.pdf', type: 'application/pdf', size: 2048, dataUrl: 'data:application/pdf;base64,AA' };

    const withExtra = wizardToLeaderForm(
      { ...fullForm(), tourCards: [card], visas: [visa], criminalRecord: crime },
      'TL-0013',
      TODAY,
    );
    const docs = formToLeader(withExtra, BUILD).documents;
    const cardDoc = docs.find((d) => d.name === 'บัตรหัวหน้าทัวร์');
    const visaDoc = docs.find((d) => d.kind === 'visa');
    const crimeDoc = docs.find((d) => d.name === 'เอกสารประวัติอาชญากรรม');
    assert.ok(cardDoc && cardDoc.kind === 'license' && cardDoc.fileName === 'card.png');
    assert.ok(cardDoc && cardDoc.verifyStatus === 'verified', 'กดยืนยันแล้ว → verifyStatus = verified');
    assert.ok(visaDoc && visaDoc.name === 'วีซ่า (Tourist)' && visaDoc.issuingCountryId === 'C-JP');
    assert.ok(visaDoc && visaDoc.verifyStatus === 'pending', 'ยังไม่ยืนยัน → pending');
    assert.ok(crimeDoc && crimeDoc.kind === 'other' && crimeDoc.fileName === 'crime.pdf');
  });

  test('มีพาสปอร์ต → เพิ่มเอกสารหนังสือเดินทาง (เลขถูกปิดบัง)', () => {
    const p = docEntry('passport', {
      number: 'AA1234567',
      issuingCountryId: 'C-JP',
      issuedDate: '2021-01-01',
      expiryDate: '2031-01-01',
    });
    const withPassport = wizardToLeaderForm({ ...fullForm(), passports: [p] }, 'TL-0013', TODAY);
    const r = formToLeader(withPassport, BUILD);
    const passport = r.documents.find((d) => d.kind === 'passport');
    assert.ok(passport);
    assert.equal(passport.expiresAt, '2031-01-01');
    assert.equal(passport.number, 'xxxxx4567');
  });

  test('ประสบการณ์ล่าสุด → ประวัติการทำงาน 1 รายการ (งานปัจจุบัน)', () => {
    const emp = record().employmentHistory;
    assert.equal(emp.length, 1);
    assert.equal(emp[0].employerName, 'JourneyPro Travel');
    assert.equal(emp[0].isCurrentJob, true);
    assert.equal(emp[0].startYear, 2018);
  });
});

/* ------------------------------ validateWizard รวม ------------------------------ */

describe('validateWizard (รวมทุกแท็บ)', () => {
  test('ฟอร์มเปล่าชี้แท็บแรกที่มีปัญหาเป็น personal', () => {
    const result = validateWizard(emptyWizardForm('TL-0013'));
    assert.equal(result.ok, false);
    assert.equal(result.firstTab, 'personal');
    assert.ok(result.byTab.personal > 0);
    assert.ok(result.byTab.documents > 0);
  });
});

/* --------------- Layout ข้อมูลพื้นฐาน (โครงสร้างการ์ดชื่อ) --------------- */

describe('Layout การ์ดชื่อไทย/อังกฤษ', () => {
  const src = readFileSync('src/components/leaders/NewLeaderWizard.tsx', 'utf8');
  const countOf = (sub: string) => src.split(sub).length - 1;

  test('ชื่อเล่นภาษาไทยอยู่หลังนามสกุลภาษาไทย', () => {
    assert.ok(
      src.indexOf('data-field="lastName"') < src.indexOf('data-field="nickname"'),
      'ช่องชื่อเล่นไทยต้องอยู่หลังนามสกุลไทย',
    );
  });

  test('ชื่อเล่นภาษาอังกฤษอยู่หลังนามสกุลภาษาอังกฤษ', () => {
    assert.ok(
      src.indexOf('data-field="lastNameEn"') < src.indexOf('data-field="nicknameEn"'),
      'ช่องชื่อเล่นอังกฤษต้องอยู่หลังนามสกุลอังกฤษ',
    );
  });

  test('มีช่องชื่อเล่นอย่างละ 1 ช่อง (ไม่ซ้ำ)', () => {
    assert.equal(countOf('value={form.nickname}'), 1);
    assert.equal(countOf('value={form.nicknameEn}'), 1);
  });

  test('การ์ดข้อมูลส่วนบุคคลไม่มีช่องชื่อเล่น เหลือแค่วันเกิด/เลขบัตร', () => {
    const g = src.slice(src.indexOf('title="ข้อมูลส่วนบุคคล"'));
    assert.ok(!g.includes('value={form.nickname}'), 'การ์ดส่วนบุคคลต้องไม่มีชื่อเล่นไทย');
    assert.ok(!g.includes('value={form.nicknameEn}'), 'การ์ดส่วนบุคคลต้องไม่มีชื่อเล่นอังกฤษ');
    assert.ok(g.includes('data-field="birthDate"'));
    assert.ok(g.includes('data-field="nationalId"'));
  });

  test('ใช้ CSS Grid template สัดส่วนที่กำหนดสำหรับการ์ดชื่อ', () => {
    assert.ok(src.includes('minmax(105px,0.48fr)_1fr_1fr_minmax(145px,0.72fr)'));
  });

  test('ช่องวันที่ประสบการณ์ใช้ DateInputBase และ end มี min = start', () => {
    assert.ok(src.includes('aria-label={`วันที่เริ่ม แถวที่'));
    assert.ok(src.includes('aria-label={`วันที่สิ้นสุด แถวที่'));
    // ช่องวันที่เริ่ม/สิ้นสุดของประสบการณ์ใช้ component วันที่ร่วม (แสดง dd/mm/yy)
    assert.ok(src.includes('DateInputBase'));
    // วันที่สิ้นสุดกำหนด min เท่ากับวันที่เริ่ม
    assert.ok(src.includes('min={row.startDate'));
  });

  test('เมื่อยังทำงานอยู่ แสดง "ถึงปัจจุบัน" แทนช่องวันที่สิ้นสุด', () => {
    assert.ok(src.includes('ถึงปัจจุบัน'), 'ต้องมีข้อความ "ถึงปัจจุบัน" แทนช่องวันสิ้นสุด');
    // ใช้ตัวเลือกแบบเลือกได้รายการเดียว (setCurrent)
    assert.ok(src.includes('setCurrent(row.id'));
  });

  test('การ์ดชื่อไทยซ่อนด้วย hidden (ไม่ลบ DOM) และ disable ช่องเมื่อไม่ใช่ไทย', () => {
    assert.ok(src.includes('hidden={!isThaiNationality}'), 'ต้องใช้ hidden ผูกกับสัญชาติ');
    assert.ok(src.includes('disabled={!isThaiNationality}'), 'ช่องชื่อไทยต้อง disabled เมื่อต่างชาติ');
  });

  test('ชื่อไทยและชื่ออังกฤษอยู่ในการ์ด 02 ใบเดียวกัน · การ์ดส่วนบุคคลเป็น 03 เสมอ', () => {
    const card = src.slice(src.indexOf('title="ชื่อ-นามสกุล"'), src.indexOf('title="ข้อมูลส่วนบุคคล"'));
    assert.match(src, /no="02"\s+title="ชื่อ-นามสกุล"/, 'การ์ดชื่อ-นามสกุลต้องเป็นเลข 02');
    assert.ok(card.includes('data-field="firstName"') && card.includes('data-field="firstNameEn"'), 'ชื่อไทยและอังกฤษต้องอยู่ในการ์ดเดียวกัน');
    assert.match(src, /no="03"\s+title="ข้อมูลส่วนบุคคล"/, 'การ์ดส่วนบุคคลต้องเป็นเลข 03');
  });
});
