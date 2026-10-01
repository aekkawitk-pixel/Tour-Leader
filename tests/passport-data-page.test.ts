/**
 * เทสต์ผังหน้าเล่มหนังสือเดินทาง (PassportDataPage)
 *
 * ผังนี้ใช้ร่วมกันทั้งตอน "อ่าน" (การ์ด) และตอน "แก้ไข" (ฟอร์มในการ์ดใบเดิม)
 * ถ้าช่องไหนหลุดจากผังและไม่ได้ไปอยู่ในกลุ่มช่องนอกหน้าเล่ม ช่องนั้นจะกรอกไม่ได้เลย
 * เทสต์ชุดนี้จึงกันไว้ทั้งสองทาง
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSPORT_PAGE_ROWS,
  PASSPORT_PAGE_MRZ_KEYS,
  PASSPORT_PAGE_FIELD_KEYS,
  PASSPORT_OFF_PAGE_FIELD_KEYS,
  PASSPORT_OCR_ONLY_FIELD_KEYS,
  PASSPORT_PROFILE_FIELD_KEYS,
} from '@/components/leaders/passport/PassportDataPage';
import {
  PASSPORT_CHOICE_OPTIONS,
  PASSPORT_FIELD_ORDER,
  PASSPORT_FIELD_LABEL,
  PASSPORT_DATE_FIELDS,
  PASSPORT_SENSITIVE_FIELDS,
  type PassportFieldKey,
} from '@/data/leaders/passportBookTypes';

describe('PassportDataPage — ผังหน้าเล่ม', () => {
  const all = [...PASSPORT_PAGE_FIELD_KEYS, ...PASSPORT_OFF_PAGE_FIELD_KEYS];

  test('ช่องบนหน้าเล่ม + ช่องนอกหน้าเล่ม = ทุกช่องของเล่มพอดี', () => {
    assert.deepEqual([...all].sort(), [...PASSPORT_FIELD_ORDER].sort());
  });

  test('ไม่มีช่องซ้ำ (ช่องเดียวกันโผล่สองที่ = แก้แล้วทับกันเอง)', () => {
    assert.equal(new Set(all).size, all.length);
  });

  test('ไม่มีช่องที่ไม่มีอยู่จริงในเล่ม', () => {
    const unknown = all.filter((k) => !PASSPORT_FIELD_ORDER.includes(k));
    assert.deepEqual(unknown, []);
  });

  test('ช่องอ่อนไหวอยู่บนหน้าเล่ม (ต้องตรวจได้ แม้ถูกปิดบังตอนแสดง)', () => {
    for (const key of PASSPORT_SENSITIVE_FIELDS as PassportFieldKey[]) {
      assert.ok(PASSPORT_PAGE_FIELD_KEYS.includes(key), `${key} หายจากหน้าเล่ม`);
    }
  });

  test('MRZ อยู่แถบท้ายเล่ม 2 บรรทัดตามเล่มจริง', () => {
    assert.deepEqual(PASSPORT_PAGE_MRZ_KEYS, ['mrzLine1', 'mrzLine2']);
  });

  test('ทุกแถวมีช่องอย่างน้อย 1 ช่อง และมีป้ายกำกับสองภาษาครบ', () => {
    for (const row of PASSPORT_PAGE_ROWS) {
      assert.ok(row.slots.length > 0, 'แถวว่างไม่ควรมีอยู่ในผัง');
      for (const slot of row.slots) {
        assert.ok(slot.en.trim(), `${slot.key} ไม่มีป้ายภาษาอังกฤษ`);
        assert.ok(slot.th.trim(), `${slot.key} ไม่มีป้ายภาษาไทย`);
      }
    }
  });

  test('เลขเล่มและเลขประจำตัวประชาชนใช้ฟอนต์ความกว้างเท่ากัน (อ่านทีละตัวไม่สับสน)', () => {
    const slots = PASSPORT_PAGE_ROWS.flatMap((r) => r.slots);
    for (const key of ['passportNo', 'nationalId'] as PassportFieldKey[]) {
      assert.equal(slots.find((s) => s.key === key)?.mono, true, `${key} ควรเป็น mono`);
    }
  });
});

/* ------------------- ช่องที่ต้องเลือกจากรายการ ------------------- */

describe('PASSPORT_CHOICE_OPTIONS — ช่องที่มีค่าตายตัวต้องเลือก ไม่ใช่พิมพ์เอง', () => {
  const keys = Object.keys(PASSPORT_CHOICE_OPTIONS) as PassportFieldKey[];

  test('ครอบคลุมช่องที่ค่ามีชุดจำกัดจริง ๆ', () => {
    for (const k of ['passportType', 'gender', 'titleName', 'titleNameTh'] as PassportFieldKey[]) {
      assert.ok(keys.includes(k), `${PASSPORT_FIELD_LABEL[k]} ควรเลือกจากรายการ`);
    }
  });

  test('ทุก key มีอยู่จริงในเล่ม และไม่ใช่ช่องวันที่', () => {
    for (const k of keys) {
      assert.ok(PASSPORT_FIELD_ORDER.includes(k), `${k} ไม่มีอยู่ในเล่ม`);
      assert.ok(!PASSPORT_DATE_FIELDS.includes(k), `${k} เป็นช่องวันที่ ไม่ควรเป็นรายการเลือก`);
    }
  });

  test('ทุกตัวเลือกมีค่าและป้ายกำกับ ไม่ซ้ำกันภายในช่องเดียวกัน', () => {
    for (const k of keys) {
      const options = PASSPORT_CHOICE_OPTIONS[k]!;
      assert.ok(options.length > 0, `${k} ไม่มีตัวเลือก`);
      for (const o of options) {
        assert.ok(o.value.trim(), `${k} มีตัวเลือกที่ไม่มีค่า`);
        assert.ok(o.label.trim(), `${k} มีตัวเลือกที่ไม่มีป้ายกำกับ`);
      }
      const values = options.map((o) => o.value);
      assert.equal(new Set(values).size, values.length, `${k} มีค่าซ้ำ`);
    }
  });

  test('ค่าที่บันทึกเป็นตัวอักษรตามที่พิมพ์บนเล่ม (เพศ M/F/X · ประเภท P/D/S/E)', () => {
    assert.deepEqual(PASSPORT_CHOICE_OPTIONS.gender?.map((o) => o.value), ['M', 'F', 'X']);
    assert.deepEqual(PASSPORT_CHOICE_OPTIONS.passportType?.map((o) => o.value), ['P', 'D', 'S', 'E']);
  });
});


/* ------------- ข้อมูลของเล่ม vs ข้อมูลของตัวบุคคล ------------- */

describe('ช่องนอกหน้าเล่ม — แยกว่าอันไหนของเล่ม อันไหนของตัวบุคคล', () => {
  test('สองกลุ่มรวมกัน = ช่องนอกหน้าเล่มทั้งหมด ไม่ขาดไม่เกิน', () => {
    const both = [...PASSPORT_OCR_ONLY_FIELD_KEYS, ...PASSPORT_PROFILE_FIELD_KEYS];
    assert.deepEqual([...both].sort(), [...PASSPORT_OFF_PAGE_FIELD_KEYS].sort());
  });

  test('ไม่มีช่องไหนอยู่สองกลุ่มพร้อมกัน', () => {
    const overlap = PASSPORT_OCR_ONLY_FIELD_KEYS.filter((k) => PASSPORT_PROFILE_FIELD_KEYS.includes(k));
    assert.deepEqual(overlap, []);
  });

  /*
   * ชื่อไทยแยกคำ/ชื่อเต็ม/คำนำหน้า มาจากประวัติส่วนตัวของหัวหน้าทัวร์ (ดู masterIdentityToCard)
   * ถ้าเผลอย้ายกลับมาให้กรอกในฟอร์มเล่ม จะได้ชื่อคนละชุดกับประวัติส่วนตัวทันที
   */
  test('ชื่อที่มาจากประวัติส่วนตัวต้องไม่อยู่ในกลุ่มข้อมูลของเล่ม', () => {
    const fromProfile: PassportFieldKey[] = [
      'titleName', 'fullName', 'titleNameTh', 'firstNameTh', 'lastNameTh', 'nameInThaiRaw',
    ];
    for (const key of fromProfile) {
      assert.ok(PASSPORT_PROFILE_FIELD_KEYS.includes(key), `${key} ควรเป็นข้อมูลของตัวบุคคล`);
      assert.ok(!PASSPORT_OCR_ONLY_FIELD_KEYS.includes(key), `${key} ไม่ใช่ช่องที่ระบบเติมเอง`);
    }
  });

  test('สถานที่ออกเป็นช่องที่ระบบเติมจาก OCR — ไม่มีช่องให้กรอกในฟอร์ม', () => {
    assert.ok(PASSPORT_OCR_ONLY_FIELD_KEYS.includes('placeOfIssue'));
  });
});
