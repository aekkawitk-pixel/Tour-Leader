/**
 * เทสต์ Document Schemas (นิยามช่องข้อมูลของเอกสารประจำตัว)
 *   - schema ครบทุกชนิดเอกสาร และ key ไม่ซ้ำในชนิดเดียวกัน
 *   - ทุกชนิดต้องมีช่องวันหมดอายุที่อ้าง issuedDate → ตรวจ "หมดอายุก่อนวันออก" ได้เสมอ
 *   - ช่อง select ต้องมีตัวเลือก (กันฟอร์มว่างเปล่า)
 *   - emptyDocData คืน key ครบตาม schema
 *   - DOC_TITLE_VALUES ต้องตรงกับ WIZARD_TITLES (ประกาศแยกชั้น data/modules — กันค่าเพี้ยนกัน)
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DOC_SCHEMAS,
  docFieldPlaceholder,
  DOC_ID_PREFIX,
  DOC_TITLE_VALUES,
  DOC_TITLE_EN_BY_TH,
  TOUR_CARD_TYPES,
  tourCardTitle,
  emptyDocData,
  isExpiryBeforeIssue,
  type DocKind,
} from '@/data/leaders/documentSchemas';
import { WIZARD_TITLES } from '@/modules/tour-leaders/newLeaderWizard';
import { PASSPORT_FIELD_LABEL } from '@/data/leaders/passportBookTypes';
import { TOUR_CARD_FORM_FIELD_KEYS } from '@/components/leaders/documents/TourCardForm';
import { ID_CARD_FORM_FIELD_KEYS } from '@/components/leaders/documents/IdCardForm';
import { VISA_FORM_FIELD_KEYS } from '@/components/leaders/documents/VisaForm';

const KINDS: DocKind[] = [
  'id_card', 'passport', 'visa', 'tour_card',
  'criminal_record', 'certificate', 'other',
];

/* ------------------------------- โครงของ schema ------------------------------- */

describe('Document Schemas — โครงสร้างของแต่ละชนิดเอกสาร', () => {
  test('มี schema ครบทุกชนิด และไม่มีชนิดเกิน', () => {
    assert.deepEqual(Object.keys(DOC_SCHEMAS).sort(), [...KINDS].sort());
  });

  test('ทุกชนิดมีรหัสนำหน้า id ไม่ซ้ำกัน', () => {
    const prefixes = KINDS.map((k) => DOC_ID_PREFIX[k]);
    assert.equal(new Set(prefixes).size, prefixes.length);
  });

  for (const kind of KINDS) {
    test(`${kind} — key ของช่องไม่ซ้ำ และมีครบทุกช่อง`, () => {
      const keys = DOC_SCHEMAS[kind].map((f) => f.key);
      assert.ok(keys.length > 0, 'ต้องมีอย่างน้อย 1 ช่อง');
      assert.equal(new Set(keys).size, keys.length, `พบ key ซ้ำใน ${kind}`);
    });

    /*
     * วันหมดอายุต้องผูกกับวันที่ก่อนหน้าเสมอ เพื่อกันการกรอกวันย้อนหลัง
     * เอกสารส่วนใหญ่อ้าง "วันที่ออก" ส่วนวีซ่าอ้าง "วันที่เริ่มใช้" ตามที่พิมพ์คู่กันบนสติกเกอร์
     * ที่ต้องเหมือนกันทุกชนิดคือ minKey ต้องชี้ไปยังช่องวันที่ที่มีอยู่จริงใน schema เดียวกัน
     */
    test(`${kind} — ช่องวันหมดอายุอ้างช่องวันที่ที่มีอยู่จริง (ตรวจย้อนวันได้)`, () => {
      const expiry = DOC_SCHEMAS[kind].find((f) => f.key === 'expiryDate');
      assert.ok(expiry, `${kind} ต้องมีช่องวันหมดอายุ`);
      assert.equal(expiry.type, 'date');
      assert.ok(expiry.minKey, `${kind} ต้องระบุ minKey ให้ช่องวันหมดอายุ`);

      const ref = DOC_SCHEMAS[kind].find((f) => f.key === expiry.minKey);
      assert.ok(ref, `${kind}: minKey "${expiry.minKey}" ไม่มีอยู่ใน schema`);
      assert.equal(ref.type, 'date', `${kind}: minKey ต้องชี้ไปยังช่องวันที่`);
    });

    test(`${kind} — ช่องแบบเลือกต้องมีตัวเลือก`, () => {
      for (const f of DOC_SCHEMAS[kind]) {
        if (f.type !== 'select') continue;
        assert.ok(f.options && f.options.length > 0, `${kind}.${f.key} ไม่มีตัวเลือก`);
      }
    });

    test(`${kind} — emptyDocData คืน key ครบตาม schema และค่าว่างทั้งหมด`, () => {
      const empty = emptyDocData(kind);
      assert.deepEqual(Object.keys(empty).sort(), DOC_SCHEMAS[kind].map((f) => f.key).sort());
      assert.ok(Object.values(empty).every((v) => v === ''));
    });
  }
});

/* ------------------------------ ตรวจความสอดคล้องวันที่ ----------------------------- */

describe('isExpiryBeforeIssue — วันหมดอายุห้ามก่อนวันที่ออก', () => {
  test('หมดอายุก่อนวันออก = ผิด', () => {
    assert.equal(isExpiryBeforeIssue('2025-01-01', '2024-12-31'), true);
  });

  test('หมดอายุหลังวันออก = ผ่าน', () => {
    assert.equal(isExpiryBeforeIssue('2025-01-01', '2030-01-01'), false);
  });

  test('วันเดียวกัน = ผ่าน (ไม่ถือว่าก่อน)', () => {
    assert.equal(isExpiryBeforeIssue('2025-01-01', '2025-01-01'), false);
  });

  test('ข้อมูลไม่ครบ = ยังไม่ตัดสิน', () => {
    assert.equal(isExpiryBeforeIssue('', '2024-12-31'), false);
    assert.equal(isExpiryBeforeIssue('2025-01-01', ''), false);
  });
});

/* --------------------------- ค่าที่ประกาศแยกสองชั้นต้องตรงกัน --------------------------- */

describe('DOC_TITLE_VALUES ต้องตรงกับ WIZARD_TITLES', () => {
  test('รายการคำนำหน้าเหมือนกันทั้งค่าและลำดับ', () => {
    assert.deepEqual([...DOC_TITLE_VALUES], WIZARD_TITLES);
  });

  test('ตัวเลือกคำนำหน้าใน schema ใช้ค่าชุดเดียวกัน', () => {
    for (const kind of ['id_card', 'passport'] as DocKind[]) {
      const title = DOC_SCHEMAS[kind].find((f) => f.key === 'title');
      assert.ok(title?.options, `${kind} ต้องมีช่องคำนำหน้าแบบเลือก`);
      assert.deepEqual(title.options.map((o) => o.value), [...DOC_TITLE_VALUES]);
    }
  });
});

/* ------------------- ฟอร์มรูปบัตรต้องวางช่องครบตาม schema ------------------- */

describe('TourCardForm — ฟอร์มรูปบัตรผู้นำเที่ยว', () => {
  test('วางช่องครบทุกช่องของ schema — ไม่มีช่องไหนหายจากฟอร์ม', () => {
    const inForm: string[] = [...TOUR_CARD_FORM_FIELD_KEYS];
    const inSchema = DOC_SCHEMAS.tour_card.map((f) => f.key);

    const missing = inSchema.filter((k) => !inForm.includes(k));
    assert.deepEqual(missing, [], 'ช่องเหล่านี้อยู่ใน schema แต่ไม่ได้วางในฟอร์ม จึงกรอกไม่ได้');
  });

  test('ไม่วางช่องที่ไม่มีใน schema (กันช่องผีที่บันทึกไม่ลง)', () => {
    const inSchema = DOC_SCHEMAS.tour_card.map((f) => f.key);
    const unknown = (TOUR_CARD_FORM_FIELD_KEYS as readonly string[]).filter((k) => !inSchema.includes(k));
    assert.deepEqual(unknown, []);
  });

  test('ไม่วางช่องซ้ำ', () => {
    const keys = [...TOUR_CARD_FORM_FIELD_KEYS];
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('คำนำหน้าอังกฤษบนบัตรประชาชน', () => {
  test('คำนำหน้าไทยทุกค่ามีคู่ภาษาอังกฤษ — ไม่งั้นเติมให้อัตโนมัติไม่ได้', () => {
    for (const th of DOC_TITLE_VALUES) {
      assert.ok(DOC_TITLE_EN_BY_TH[th]?.trim(), `${th} ไม่มีคำนำหน้าอังกฤษคู่กัน`);
    }
  });

  test('ไม่มีคู่ที่เกินมาจากรายการคำนำหน้าไทย', () => {
    assert.deepEqual(Object.keys(DOC_TITLE_EN_BY_TH).sort(), [...DOC_TITLE_VALUES].sort());
  });

  test('ตัวเลือกในช่องคำนำหน้าอังกฤษตรงกับคู่ที่กำหนดไว้', () => {
    const options = DOC_SCHEMAS.id_card.find((f) => f.key === 'titleEn')?.options ?? [];
    assert.deepEqual(
      options.map((o) => o.value),
      DOC_TITLE_VALUES.map((th) => DOC_TITLE_EN_BY_TH[th]),
    );
  });
});

describe('ที่อยู่บนบัตรประชาชน — แยกช่องและอ้างอิงเขตปกครอง', () => {
  const keys = DOC_SCHEMAS.id_card.map((f) => f.key);

  test('แยกเป็น แขวง/ตำบล · เขต/อำเภอ · จังหวัด · รหัสไปรษณีย์ ครบ', () => {
    for (const k of ['addressLine', 'subdistrict', 'district', 'province', 'postalCode']) {
      assert.ok(keys.includes(k), `ไม่มีช่อง ${k}`);
    }
  });

  test('เก็บรหัสจังหวัด/อำเภอคู่กับชื่อ — เปิดแก้ไขแล้วต้องรู้ว่าเลือกอะไรอยู่', () => {
    for (const k of ['provinceCode', 'districtCode']) {
      const f = DOC_SCHEMAS.id_card.find((x) => x.key === k);
      assert.ok(f, `ไม่มีช่อง ${k}`);
      assert.equal(f?.hidden, true, `${k} ต้องซ่อนจากฟอร์มที่เรนเดอร์จาก schema ตรง ๆ`);
    }
  });

  test('ไม่เหลือช่องที่อยู่ก้อนเดียวใน schema แล้ว (ข้อมูลเก่ายังอ่านได้จาก record)', () => {
    assert.ok(!keys.includes('address'));
  });
});

describe('IdCardForm — ฟอร์มรูปบัตรประชาชน', () => {
  test('วางช่องครบทุกช่องของ schema — ไม่มีช่องไหนหายจากฟอร์ม', () => {
    const inForm: string[] = [...ID_CARD_FORM_FIELD_KEYS];
    const inSchema = DOC_SCHEMAS.id_card.map((f) => f.key);

    const missing = inSchema.filter((k) => !inForm.includes(k));
    assert.deepEqual(missing, [], 'ช่องเหล่านี้อยู่ใน schema แต่ไม่ได้วางในฟอร์ม จึงกรอกไม่ได้');
  });

  test('ไม่วางช่องที่ไม่มีใน schema (กันช่องผีที่บันทึกไม่ลง)', () => {
    const inSchema = DOC_SCHEMAS.id_card.map((f) => f.key);
    const unknown = (ID_CARD_FORM_FIELD_KEYS as readonly string[]).filter((k) => !inSchema.includes(k));
    assert.deepEqual(unknown, []);
  });

  test('ไม่วางช่องซ้ำ', () => {
    const keys = [...ID_CARD_FORM_FIELD_KEYS];
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('VisaForm — ฟอร์มรูปสติกเกอร์วีซ่า', () => {
  test('วางช่องครบทุกช่องของ schema — ไม่มีช่องไหนหายจากฟอร์ม', () => {
    const inForm: string[] = [...VISA_FORM_FIELD_KEYS];
    const inSchema = DOC_SCHEMAS.visa.map((f) => f.key);

    const missing = inSchema.filter((k) => !inForm.includes(k));
    assert.deepEqual(missing, [], 'ช่องเหล่านี้อยู่ใน schema แต่ไม่ได้วางในฟอร์ม จึงกรอกไม่ได้');
  });

  test('ไม่วางช่องที่ไม่มีใน schema (กันช่องผีที่บันทึกไม่ลง)', () => {
    const inSchema = DOC_SCHEMAS.visa.map((f) => f.key);
    const unknown = (VISA_FORM_FIELD_KEYS as readonly string[]).filter((k) => !inSchema.includes(k));
    assert.deepEqual(unknown, []);
  });

  test('ไม่วางช่องซ้ำ', () => {
    const keys = [...VISA_FORM_FIELD_KEYS];
    assert.equal(new Set(keys).size, keys.length);
  });

  test('วันหมดอายุอ้างวันที่เริ่มใช้ — บนสติกเกอร์พิมพ์คู่กันว่า From/Until', () => {
    const expiry = DOC_SCHEMAS.visa.find((f) => f.key === 'expiryDate');
    assert.equal(expiry?.minKey, 'startDate');
  });

  /* ลำดับตามป้ายกำกับบนสติกเกอร์วีซ่าไทย 1-15 */
  /* 13 Remarks และ 15 แถบ MRZ ตัดออกตามที่ผู้ใช้สั่ง — ไม่ต้องเก็บสองช่องนี้ */
  test('มีช่องที่พิมพ์บนสติกเกอร์จริงครบตามที่ตกลง', () => {
    const keys = DOC_SCHEMAS.visa.map((f) => f.key);
    const onSticker = [
      'issuedPlace',   // 1 Place of Issue
      'startDate',     // 2 Valid From
      'expiryDate',    // 3 Valid Until
      'visaType',      // 4 Type of Visa
      'category',      // 5 Category
      'entries',       // 6 No. of Entry
      'holderLastName', 'holderFirstName', // 7 Surname, Given Name (แยกช่อง)
      'birthDate',     // 8 Date of Birth
      'nationality',   // 9 Nationality
      'passportNo',    // 10 Passport Number
      'sex',           // 11 Sex
      'authorizedBy',  // 12 Authorized Signature
      'number',        // 14 เลขที่วีซ่า
    ];
    const missing = onSticker.filter((k) => !keys.includes(k));
    assert.deepEqual(missing, [], 'ช่องเหล่านี้อยู่บนสติกเกอร์จริงแต่ระบบยังไม่มีที่เก็บ');
  });

  test('สัญชาติอ้าง Country Master — พิมพ์เองไม่ได้', () => {
    assert.equal(DOC_SCHEMAS.visa.find((f) => f.key === 'nationality')?.type, 'nationality');
  });

  test('ขอบเขตที่ใช้ได้เป็นรายการให้เลือก ไม่ใช่พิมพ์เอง', () => {
    const validFor = DOC_SCHEMAS.visa.find((f) => f.key === 'validFor');
    assert.equal(validFor?.type, 'select');
    assert.ok((validFor?.options?.length ?? 0) > 0, 'ต้องมีตัวเลือกให้เลือก');
    for (const o of validFor?.options ?? []) {
      assert.ok(o.value.trim() && o.label.trim());
    }
  });

  test('เพศเป็นรายการให้เลือก และเก็บเป็นคำเต็มตามที่พิมพ์บนสติกเกอร์', () => {
    const sex = DOC_SCHEMAS.visa.find((f) => f.key === 'sex');
    assert.equal(sex?.type, 'select');
    assert.deepEqual(sex?.options?.map((o) => o.value), ['MALE', 'FEMALE']);
  });
});

/* --------------------- ชื่อหัวบัตรตามประเภทบัตร --------------------- */

describe('tourCardTitle — หัวบัตรเปลี่ยนตามประเภทที่เลือก', () => {
  test('ทุกประเภทในรายการมีชื่อหัวบัตรครบทั้งไทยและอังกฤษ', () => {
    for (const t of TOUR_CARD_TYPES) {
      assert.ok(t.titleTh.trim(), `${t.value} ไม่มีชื่อไทย`);
      assert.ok(t.titleEn.trim(), `${t.value} ไม่มีชื่ออังกฤษ`);
    }
  });

  test('ตัวเลือกในช่องประเภทบัตรตรงกับรายการประเภททั้งหมด', () => {
    const options = DOC_SCHEMAS.tour_card.find((f) => f.key === 'cardType')?.options ?? [];
    assert.deepEqual(options.map((o) => o.value), TOUR_CARD_TYPES.map((t) => t.value));
  });

  test('เลือกประเภทไหน ได้หัวบัตรของประเภทนั้น', () => {
    for (const t of TOUR_CARD_TYPES) {
      assert.deepEqual(tourCardTitle(t.value), { th: t.titleTh, en: t.titleEn });
    }
  });

  test('ยังไม่เลือก / ประเภทที่ไม่รู้จัก → ใช้ชื่อของประเภทแรกเป็นค่าตั้งต้น', () => {
    const fallback = { th: TOUR_CARD_TYPES[0].titleTh, en: TOUR_CARD_TYPES[0].titleEn };
    assert.deepEqual(tourCardTitle(''), fallback);
    assert.deepEqual(tourCardTitle(undefined), fallback);
    assert.deepEqual(tourCardTitle('บัตรที่ไม่มีในรายการ'), fallback);
  });

  test('ตัดช่องว่างหัวท้ายก่อนเทียบ (ค่าที่นำเข้ามาอาจมีช่องว่างติดมา)', () => {
    const first = TOUR_CARD_TYPES[0];
    assert.deepEqual(tourCardTitle(`  ${first.value}  `), { th: first.titleTh, en: first.titleEn });
  });
});

/* ------------------- ข้อความชี้นำในช่องกรอก ------------------- */

describe('docFieldPlaceholder — ข้อความชี้นำเหมือนกันทุกช่อง', () => {
  test('เป็น "ระบุ" + ชื่อช่อง', () => {
    assert.equal(docFieldPlaceholder({ label: 'เลขที่บัตร' }), 'ระบุเลขที่บัตร');
    assert.equal(docFieldPlaceholder({ label: 'นามสกุล (Surname)' }), 'ระบุนามสกุล (Surname)');
  });

  test('ช่องที่ระบุข้อความไว้เองใน schema ใช้ค่านั้น (บอกรูปแบบ ไม่ใช่ตัวอย่างค่า)', () => {
    assert.equal(docFieldPlaceholder({ label: 'เลขบัตรประชาชน', placeholder: '13 หลัก' }), '13 หลัก');
  });

  test('ไม่มี schema ช่องไหนยกตัวอย่างค่าจริงไว้แล้ว', () => {
    const examples: string[] = [];
    for (const kind of KINDS) {
      for (const f of DOC_SCHEMAS[kind]) {
        if (f.placeholder?.includes('เช่น')) examples.push(`${kind}.${f.key}`);
      }
    }
    assert.deepEqual(examples, [], 'ช่องเหล่านี้ยังยกตัวอย่างค่าอยู่ ให้ใช้ "ระบุ<ชื่อช่อง>" แทน');
  });

  test('ทุกช่องได้ข้อความชี้นำที่ไม่ว่าง', () => {
    for (const kind of KINDS) {
      for (const f of DOC_SCHEMAS[kind]) {
        assert.ok(docFieldPlaceholder(f).trim(), `${kind}.${f.key} ไม่มีข้อความชี้นำ`);
      }
    }
  });
});

/* --------------- คำเรียกชื่อ-นามสกุลภาษาอังกฤษต้องเหมือนกันทั้งระบบ --------------- */

describe('ป้ายกำกับชื่อภาษาอังกฤษ — ใช้คำเดียวกันทุกฟอร์ม', () => {
  /**
   * มาตรฐานที่เลือก: Surname / Given Name ตาม ICAO 9303 (หนังสือเดินทางและวีซ่าใช้คำนี้)
   * ห้ามใช้คำอื่นที่ความหมายเดียวกัน เพราะผู้กรอกจะไม่แน่ใจว่าช่องไหนคือชื่อ ช่องไหนคือนามสกุล
   * ใช้ทั้งในฟอร์มและบนหน้าเอกสารจำลองทุกชนิด — ตัวอักษรต้องตรงกันเป๊ะ
   */
  const BANNED = ['Last name', 'Family name', 'First name', 'Name (', 'Fore name', 'Forename'];
  const allLabels = [
    ...KINDS.flatMap((k) => DOC_SCHEMAS[k].map((f) => `${k}.${f.key}: ${f.label}`)),
    ...Object.entries(PASSPORT_FIELD_LABEL).map(([k, v]) => `passportBook.${k}: ${v}`),
  ];

  test('ไม่มีป้ายกำกับไหนใช้คำที่ห้ามใช้', () => {
    const offenders = allLabels.filter((l) => BANNED.some((b) => l.includes(b)));
    assert.deepEqual(offenders, [], 'ให้ใช้ Surname / Given name ตามมาตรฐานที่ตกลงไว้');
  });

  test('ช่องนามสกุลอักษรโรมันใช้คำว่า Surname', () => {
    assert.match(DOC_SCHEMAS.id_card.find((f) => f.key === 'lastNameEn')!.label, /Surname/);
    assert.match(DOC_SCHEMAS.visa.find((f) => f.key === 'holderLastName')!.label, /Surname/);
    assert.match(DOC_SCHEMAS.passport.find((f) => f.key === 'lastName')!.label, /Surname/);
    assert.match(PASSPORT_FIELD_LABEL.lastName, /Surname/);
  });

  test('ช่องชื่อตัวอักษรโรมันใช้คำว่า Given Name', () => {
    assert.match(DOC_SCHEMAS.id_card.find((f) => f.key === 'firstNameEn')!.label, /Given Name/);
    assert.match(DOC_SCHEMAS.visa.find((f) => f.key === 'holderFirstName')!.label, /Given Name/);
    assert.match(DOC_SCHEMAS.passport.find((f) => f.key === 'firstName')!.label, /Given Name/);
    assert.match(PASSPORT_FIELD_LABEL.firstName, /Given Name/);
  });

  /* หน้าเอกสารจำลองเขียนป้ายกำกับไว้ในไฟล์ component จึงตรวจจากตัวไฟล์ */
  test('หน้าเอกสารจำลองทุกชนิดก็ใช้คำเดียวกัน', () => {
    const faces = [
      'src/components/leaders/documents/IdCardTemplate.tsx',
      'src/components/leaders/documents/VisaTemplate.tsx',
      'src/components/leaders/passport/PassportDataPage.tsx',
    ];
    for (const file of faces) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      const offenders = BANNED.filter((b) => src.includes(b));
      assert.deepEqual(offenders, [], `${file} ยังใช้คำที่ห้ามใช้`);
      assert.ok(src.includes('Surname'), `${file} ต้องมีคำว่า Surname`);
      assert.ok(src.includes('Given Name'), `${file} ต้องมีคำว่า Given Name`);
    }
  });

  test('ช่องอักษรไทยระบุ (ไทย) ไม่ปนกับช่องอักษรโรมัน', () => {
    for (const key of ['title', 'firstName', 'lastName'] as const) {
      assert.match(DOC_SCHEMAS.id_card.find((f) => f.key === key)!.label, /(ไทย)/);
    }
    for (const key of ['titleNameTh', 'firstNameTh', 'lastNameTh', 'fullNameTh'] as const) {
      assert.match(PASSPORT_FIELD_LABEL[key], /(ไทย)/);
    }
  });
});
