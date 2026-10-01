/**
 * เทสต์ Document Store — ที่เก็บเอกสารประจำตัวรวมทุกชนิด
 *
 * จุดที่ต่างจากของเดิม (ซึ่งมีแต่หนังสือเดินทาง) และต้องพิสูจน์:
 *   • ฉบับหลักนับแยกตาม "ชนิดเอกสาร" — มีหนังสือเดินทางหลัก + Visa หลัก + บัตรหลัก พร้อมกันได้
 *   • เอกสารต่างชนิดของคนเดียวกันไม่แย่งสถานะฉบับหลักกัน
 *   • ตรวจเลขซ้ำแยกตามชนิด (เลขบัตรซ้ำกับเลขหนังสือเดินทางไม่ถือว่าชน)
 *   • ช่องข้อมูลของแต่ละชนิดถูกเติมให้ครบตาม schema ของชนิดนั้น
 *   • ย้ายข้อมูลหนังสือเดินทางจากคีย์เดิมได้ครบ และไม่ย้ำซ้ำ
 *
 * รันด้วย: npm test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  addDocumentBlockedReason,
  blankDocumentDraft,
  createDocument,
  deleteDocument,
  findDocumentsByFieldValue,
  getDocument,
  getDocuments,
  getPrimaryDocument,
  saveDocumentEdit,
  setDocumentLifecycle,
  setPrimaryDocument,
  updateDocumentFields,
  type CreateDocumentInput,
} from '@/services/documentStore';
import { documentFieldKeys, documentNumberFieldKey } from '@/data/leaders/documentFieldKeys';
import { DOC_SCHEMAS, type DocKind } from '@/data/leaders/documentSchemas';
import { isDocumentUsableOn, type AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

/* ------------------ localStorage จำลอง (เทสต์รันนอกเบราว์เซอร์) ------------------ */

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function fakeStorage(): FakeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

const globalWithWindow = globalThis as { window?: { localStorage: FakeStorage } };
let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  globalWithWindow.window = { localStorage: storage };
});
afterEach(() => { delete globalWithWindow.window; });

/* --------------------------------- ตัวช่วย --------------------------------- */

const LEADER = 'TL-000001';
const OTHER_LEADER = 'TL-000002';

function addDoc(kind: DocKind, over: Partial<CreateDocumentInput> = {}): AnyLeaderDocumentRecord {
  return createDocument({
    tourLeaderId: LEADER,
    kind,
    fields: {},
    fieldOrigin: {},
    entryMethod: 'MANUAL',
    status: 'CONFIRMED',
    ocrOriginal: null,
    imageId: null,
    sourceFileName: null,
    makePrimary: false,
    by: 'ผู้ทดสอบ',
    at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as AnyLeaderDocumentRecord;
}

/* ------------------------ ฉบับหลักแยกตามชนิดเอกสาร ------------------------ */

describe('Document Store — ฉบับหลักนับแยกตามชนิดเอกสาร', () => {
  test('เอกสารชนิดต่างกันเป็นฉบับหลักพร้อมกันได้', () => {
    const passport = addDoc('passport');
    const visa = addDoc('visa');
    const card = addDoc('tour_card');

    assert.equal(passport.isPrimary, true);
    assert.equal(visa.isPrimary, true);
    assert.equal(card.isPrimary, true);
  });

  test('เพิ่ม Visa ใบที่สองไม่กระทบหนังสือเดินทางหลัก', () => {
    const passport = addDoc('passport');
    addDoc('visa');
    addDoc('visa', { makePrimary: true });

    assert.equal(getPrimaryDocument(LEADER, 'passport')?.docId, passport.docId);
    assert.equal(getDocuments(LEADER, 'visa').filter((d) => d.isPrimary).length, 1);
  });

  test('ตั้งฉบับหลักใหม่ลดเฉพาะฉบับหลักของชนิดเดียวกัน', () => {
    const passport = addDoc('passport');
    const visa1 = addDoc('visa');
    const visa2 = addDoc('visa');

    setPrimaryDocument(visa2.docId, 'ผู้ทดสอบ', '2026-02-01T00:00:00.000Z');

    assert.equal(getDocument(visa2.docId)?.isPrimary, true);
    assert.equal(getDocument(visa1.docId)?.isPrimary, false);
    assert.equal(getDocument(passport.docId)?.isPrimary, true, 'หนังสือเดินทางต้องไม่ถูกแตะ');
  });

  test('แจ้งสูญหายเฉพาะชนิดหนึ่ง ไม่ทำให้ชนิดอื่นเสียฉบับหลัก', () => {
    const passport = addDoc('passport');
    const visa = addDoc('visa');

    setDocumentLifecycle(visa.docId, 'LOST', { by: 'x', at: '2026-03-01T00:00:00.000Z' });

    assert.equal(getPrimaryDocument(LEADER, 'visa'), null);
    assert.equal(getPrimaryDocument(LEADER, 'passport')?.docId, passport.docId);
  });

  test('ฉบับหลักแยกกันคนละหัวหน้าทัวร์', () => {
    const mine = addDoc('visa');
    const theirs = addDoc('visa', { tourLeaderId: OTHER_LEADER });

    assert.equal(mine.isPrimary, true);
    assert.equal(theirs.isPrimary, true);
    assert.equal(getPrimaryDocument(OTHER_LEADER, 'visa')?.docId, theirs.docId);
  });
});

/* ------------------------------ การอ่านรายการ ------------------------------ */

describe('Document Store — การอ่านรายการ', () => {
  test('กรองตามชนิดได้ และไม่ระบุชนิด = ได้ทุกชนิดของคนนั้น', () => {
    addDoc('passport');
    addDoc('visa');
    addDoc('visa');

    assert.equal(getDocuments(LEADER).length, 3);
    assert.equal(getDocuments(LEADER, 'visa').length, 2);
    assert.equal(getDocuments(LEADER, 'criminal_record').length, 0);
  });

  test('ฉบับหลักขึ้นก่อน แล้วเรียงวันหมดอายุจากใหม่ไปเก่า', () => {
    addDoc('visa', { fields: { number: 'V1', expiryDate: '2027-01-01' } }); // ฉบับหลัก
    addDoc('visa', { fields: { number: 'V2', expiryDate: '2031-01-01' } });
    addDoc('visa', { fields: { number: 'V3', expiryDate: '2029-01-01' } });

    const rows = getDocuments(LEADER, 'visa');
    assert.deepEqual(rows.map((d) => d.fields.number), ['V1', 'V2', 'V3']);
  });

  test('getDocument ของ id ที่ไม่มี → null', () => {
    assert.equal(getDocument('ไม่มีจริง'), null);
  });
});

/* --------------------------- ช่องข้อมูลตาม schema --------------------------- */

describe('Document Store — ช่องข้อมูลของแต่ละชนิด', () => {
  const KINDS: DocKind[] = ['id_card', 'passport', 'visa', 'tour_card', 'criminal_record'];

  for (const kind of KINDS) {
    test(`${kind} — เอกสารที่อ่านกลับมามีช่องครบตาม schema ของชนิดนั้น`, () => {
      const doc = addDoc(kind);
      const stored = getDocument(doc.docId)!;
      for (const key of documentFieldKeys(kind)) {
        assert.ok(key in stored.fields, `ขาดช่อง ${key}`);
      }
    });
  }

  test('หนังสือเดินทางใช้ชุดช่องเต็ม (มี MRZ) ไม่ใช่ชุดย่อของวิซาร์ด', () => {
    const keys = documentFieldKeys('passport');
    assert.ok(keys.includes('mrzLine1'), 'ต้องมีช่อง MRZ');
    assert.ok(keys.length > DOC_SCHEMAS.passport.length, 'ชุดเต็มต้องมีช่องมากกว่าชุดย่อในวิซาร์ด');
  });

  test('blankDocumentDraft — ทุกช่องว่างและเป็นการกรอกเอง', () => {
    const draft = blankDocumentDraft('visa');
    assert.deepEqual(Object.keys(draft.fields).sort(), [...documentFieldKeys('visa')].sort());
    assert.ok(Object.values(draft.fields).every((v) => v === ''));
    assert.ok(Object.values(draft.fieldOrigin).every((o) => o === 'MANUAL'));
  });

  test('แก้ค่า → ช่องที่เปลี่ยนกลายเป็น USER_VERIFIED', () => {
    const doc = addDoc('tour_card');
    const after = updateDocumentFields(doc.docId, { issuer: 'กรมการท่องเที่ยว' }, { by: 'x', at: '2026-04-01T00:00:00.000Z' });

    assert.equal(after?.fields.issuer, 'กรมการท่องเที่ยว');
    assert.equal(after?.fieldOrigin.issuer, 'USER_VERIFIED');
  });
});

/* -------------------------------- เลขซ้ำแยกชนิด ------------------------------- */

describe('Document Store — ตรวจเลขซ้ำแยกตามชนิด', () => {
  test('เลขเดียวกันแต่คนละชนิดเอกสาร ไม่ถือว่าซ้ำ', () => {
    addDoc('passport', { fields: { passportNo: 'AA1234567' } });
    addDoc('visa', { fields: { number: 'AA1234567' } });

    assert.equal(findDocumentsByFieldValue('passport', documentNumberFieldKey('passport'), 'AA1234567').length, 1);
    assert.equal(findDocumentsByFieldValue('visa', documentNumberFieldKey('visa'), 'AA1234567').length, 1);
  });

  test('เลขซ้ำในชนิดเดียวกันเจอทั้งระบบ ข้ามหัวหน้าทัวร์', () => {
    addDoc('tour_card', { fields: { number: 'GD-11-2345' } });
    addDoc('tour_card', { tourLeaderId: OTHER_LEADER, fields: { number: 'gd-11-2345' } });

    assert.equal(findDocumentsByFieldValue('tour_card', 'number', '  GD-11-2345 ').length, 2);
  });

  test('ค่าว่างไม่ถือว่าซ้ำ', () => {
    addDoc('visa', { fields: { number: '' } });
    assert.equal(findDocumentsByFieldValue('visa', 'number', '  ').length, 0);
  });
});

/* ----------------------------- เอกสารพร้อมใช้หรือไม่ ---------------------------- */

describe('isDocumentUsableOn — เอกสารใช้ได้ ณ วันที่กำหนดหรือไม่', () => {
  const base = { lifecycle: 'ACTIVE', status: 'CONFIRMED', fields: { expiryDate: '2026-12-31' } } as const;

  test('ยังไม่หมดอายุ = ใช้ได้', () => {
    assert.equal(isDocumentUsableOn(base, '2026-08-18'), true);
  });

  test('หมดอายุก่อนวันเดินทาง = ใช้ไม่ได้', () => {
    assert.equal(isDocumentUsableOn(base, '2027-01-01'), false);
  });

  test('หมดอายุวันเดียวกับวันที่ตรวจ = ยังใช้ได้', () => {
    assert.equal(isDocumentUsableOn(base, '2026-12-31'), true);
  });

  test('ยังเป็นฉบับร่าง = ใช้ไม่ได้ แม้ยังไม่หมดอายุ', () => {
    assert.equal(isDocumentUsableOn({ ...base, status: 'DRAFT' }, '2026-08-18'), false);
  });

  test('แจ้งสูญหาย = ใช้ไม่ได้ แม้ยังไม่หมดอายุ', () => {
    assert.equal(isDocumentUsableOn({ ...base, lifecycle: 'LOST' }, '2026-08-18'), false);
  });

  test('ไม่มีวันหมดอายุ = ใช้ได้ตลอด', () => {
    assert.equal(isDocumentUsableOn({ ...base, fields: { expiryDate: '' } }, '2099-01-01'), true);
  });
});

/* ---------------------------- ย้ายข้อมูลหนังสือเดินทางเดิม --------------------------- */

describe('Document Store — ย้ายข้อมูลจากคีย์ passportBooks เดิม', () => {
  const legacyBook = (bookId: string, over: Record<string, unknown> = {}) => ({
    bookId,
    tourLeaderId: LEADER,
    isPrimary: true,
    status: 'CONFIRMED',
    lifecycle: 'ACTIVE',
    entryMethod: 'MANUAL',
    fields: { passportNo: 'AA1234567', expiryDate: '2030-01-01' },
    fieldOrigin: {},
    ocrOriginal: null,
    ocrRawText: null,
    imageId: null,
    portraitImageId: null,
    signatureImageId: null,
    sourceFileName: null,
    mrzCheck: { parsed: true, passportNoValid: true, dateOfBirthValid: true, expiryValid: true, compositeValid: true },
    note: '',
    createdBy: 'ระบบ',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    verifiedBy: null,
    verifiedAt: null,
    history: [],
    ...over,
  });

  test('เล่มเดิมถูกย้ายมาเป็นเอกสารชนิด passport พร้อมข้อมูลครบ', () => {
    storage.data.set('passportBooks', JSON.stringify([legacyBook('PPBOOK-เก่า1')]));

    const doc = getDocument('PPBOOK-เก่า1');
    assert.equal(doc?.kind, 'passport');
    assert.equal(doc?.fields.passportNo, 'AA1234567');
    assert.equal(doc?.isPrimary, true);
    assert.equal(doc?.createdBy, 'ระบบ');
  });

  test('ผล MRZ ย้ายไปอยู่ใน extra และอ่านผ่าน passportBookStore ได้เหมือนเดิม', async () => {
    storage.data.set('passportBooks', JSON.stringify([legacyBook('PPBOOK-เก่า2')]));

    const { getPassportBook } = await import('@/services/passportBookStore');
    const book = getPassportBook('PPBOOK-เก่า2');
    assert.equal(book?.mrzCheck?.parsed, true);
    assert.equal(book?.fields.passportNo, 'AA1234567');
  });

  test('ย้ายครั้งเดียว — อ่านซ้ำหลายรอบไม่เกิดรายการซ้ำ', () => {
    storage.data.set('passportBooks', JSON.stringify([legacyBook('PPBOOK-เก่า3')]));

    getDocuments(LEADER);
    getDocuments(LEADER);
    getDocuments(LEADER);

    assert.equal(getDocuments(LEADER, 'passport').length, 1);
  });

  test('ข้อมูลเดิมไม่ถูกลบทิ้ง (ยังกู้คืนได้ถ้าจำเป็น)', () => {
    storage.data.set('passportBooks', JSON.stringify([legacyBook('PPBOOK-เก่า4')]));
    getDocuments(LEADER);
    assert.ok(storage.data.get('passportBooks')?.includes('PPBOOK-เก่า4'));
  });

  test('เอกสารที่สร้างใหม่หลังย้ายแล้ว อยู่ร่วมกับเล่มเดิมได้', () => {
    storage.data.set('passportBooks', JSON.stringify([legacyBook('PPBOOK-เก่า5')]));
    getDocuments(LEADER); // กระตุ้นให้ย้าย

    addDoc('visa', { fields: { number: 'V-001' } });

    assert.equal(getDocuments(LEADER).length, 2);
    assert.equal(getDocuments(LEADER, 'passport').length, 1);
    assert.equal(getDocuments(LEADER, 'visa').length, 1);
  });

  test('ไม่มีข้อมูลเดิม → ไม่สร้างอะไรขึ้นมาเอง', () => {
    assert.equal(getDocuments(LEADER).length, 0);
  });
});

/* ------------------------------------ ลบ ------------------------------------ */

describe('Document Store — การลบ', () => {
  test('ลบเอกสารแล้วหายจากรายการ · ชนิดอื่นไม่ถูกแตะ', () => {
    const visa = addDoc('visa');
    const passport = addDoc('passport');

    deleteDocument(visa.docId);

    assert.equal(getDocument(visa.docId), null);
    assert.equal(getDocument(passport.docId)?.docId, passport.docId);
  });
});

/* ------------------ บัตรประชาชน — มีได้ครั้งละใบเดียว ------------------ */

describe('Document Store — บัตรประชาชนถือได้ครั้งละ 1 ใบ', () => {
  const NOW = '2026-08-18T00:00';
  const idCard = (fields: Record<string, string> = {}, over: Partial<CreateDocumentInput> = {}) =>
    addDoc('id_card', { at: NOW, fields: { idNumber: '1234567890123', ...fields }, ...over });

  test('ยังไม่มีบัตร → เพิ่มใบแรกได้ปกติ', () => {
    assert.equal(addDocumentBlockedReason(LEADER, 'id_card', NOW), null, 'ยังไม่มีบัตร ต้องไม่ถูกบล็อก');
    assert.ok(idCard({ expiryDate: '2030-01-01' }));
    assert.ok(addDocumentBlockedReason(LEADER, 'id_card', NOW), 'มีบัตรแล้ว ต้องบล็อกใบถัดไป');
  });

  test('ยังถือใบเดิมที่ใช้งานได้ → เพิ่มใบที่สองไม่ได้ แม้เลขบัตรคนละเลข', () => {
    idCard({ expiryDate: '2030-01-01' });

    assert.throws(
      () => idCard({ idNumber: '9999999999999', expiryDate: '2031-01-01' }),
      (e: Error) => e.name === 'DocumentRuleError' && /มีได้ครั้งละ 1/.test(e.message),
    );
    assert.equal(getDocuments(LEADER, 'id_card').length, 1, 'ต้องไม่มีใบใหม่ถูกบันทึก');
  });

  test('บัตรตลอดชีพ (ไม่ระบุวันหมดอายุ) ก็ยังนับว่าถืออยู่', () => {
    idCard({});
    assert.throws(() => idCard({ idNumber: '9999999999999' }), (e: Error) => e.name === 'DocumentRuleError');
  });

  test('ใบเดิมหมดอายุแล้ว → ทำใบใหม่ได้ และใบเก่ายังอยู่เป็นประวัติ', () => {
    idCard({ expiryDate: '2026-01-01' }); // หมดอายุก่อนวันที่ทำรายการ
    assert.ok(idCard({ expiryDate: '2032-01-01' }));
    assert.equal(getDocuments(LEADER, 'id_card').length, 2);
  });

  test('แจ้งสูญหาย/ยกเลิกใบเดิม → ทำใบใหม่ได้', () => {
    const first = idCard({ expiryDate: '2030-01-01' });
    setDocumentLifecycle(first.docId, 'LOST', { by: 'x', at: NOW });

    assert.equal(addDocumentBlockedReason(LEADER, 'id_card', NOW), null);
    assert.ok(idCard({ expiryDate: '2032-01-01' }));
  });

  test('เหตุผลที่เพิ่มไม่ได้ต้องบอกทางออกให้ผู้ใช้', () => {
    idCard({ expiryDate: '2030-01-01' });
    const reason = addDocumentBlockedReason(LEADER, 'id_card', NOW);
    assert.match(reason ?? '', /บัตรประชาชน/);
    assert.match(reason ?? '', /แจ้งสูญหาย|ยกเลิก|ปิดใช้งาน/);
  });

  test('คนละหัวหน้าทัวร์ ถือคนละใบได้', () => {
    idCard({ expiryDate: '2030-01-01' });
    assert.ok(idCard({ expiryDate: '2030-01-01' }, { tourLeaderId: OTHER_LEADER }));
  });

  test('แก้ไขใบเดิมของตัวเองได้ตามปกติ (ไม่ไปชนกับตัวเอง)', () => {
    const doc = idCard({ expiryDate: '2030-01-01' });
    const saved = saveDocumentEdit(
      doc.docId,
      { fields: { ...doc.fields, expiryDate: '2035-01-01' }, note: '', makePrimary: false },
      { by: 'x', at: NOW },
    );
    assert.equal(saved?.fields.expiryDate, '2035-01-01');
  });
});

/* ------------------ บัตรหัวหน้าทัวร์ — ถือประเภทเดียวกันซ้ำไม่ได้ ------------------ */

describe('Document Store — บัตรหัวหน้าทัวร์ประเภทเดียวกันซ้ำไม่ได้', () => {
  const TYPE_A = 'บัตรผู้นำเที่ยว (Tour Leader Licence)';
  const TYPE_B = 'บัตรมัคคุเทศก์ทั่วไป (ไทย)';
  const NOW = '2026-08-18T00:00';

  const card = (cardType: string, over: Partial<CreateDocumentInput> = {}, fields: Record<string, string> = {}) =>
    addDoc('tour_card', {
      at: NOW,
      fields: { cardType, number: `TC-${cardType.length}${Object.keys(fields).length}`, ...fields },
      ...over,
    });

  test('ใบแรกของประเภทหนึ่ง เพิ่มได้ปกติ', () => {
    const c = card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    assert.equal(c.fields.cardType, TYPE_A);
  });

  test('ประเภทเดียวกันที่ยังไม่หมดอายุ → เพิ่มซ้ำไม่ได้ พร้อมบอกเหตุผล', () => {
    card(TYPE_A, {}, { expiryDate: '2030-01-01' });

    assert.throws(
      () => card(TYPE_A, {}, { expiryDate: '2031-01-01', number: 'TC-ใหม่' }),
      (e: Error) => e.name === 'DocumentRuleError' && /เพิ่มใบประเภทเดียวกันไม่ได้/.test(e.message),
    );
    assert.equal(getDocuments(LEADER, 'tour_card').length, 1, 'ต้องไม่มีใบใหม่ถูกบันทึก');
  });

  test('คนละประเภท → เพิ่มพร้อมกันได้', () => {
    card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    card(TYPE_B, {}, { expiryDate: '2030-01-01' });
    assert.equal(getDocuments(LEADER, 'tour_card').length, 2);
  });

  test('ใบเดิมหมดอายุแล้ว → เพิ่มใบใหม่ประเภทเดิมได้', () => {
    card(TYPE_A, {}, { expiryDate: '2026-01-01' }); // หมดอายุก่อนวันที่ทำรายการ
    const next = card(TYPE_A, {}, { expiryDate: '2031-01-01', number: 'TC-ต่ออายุ' });

    assert.equal(next.fields.number, 'TC-ต่ออายุ');
    assert.equal(getDocuments(LEADER, 'tour_card').length, 2, 'ใบเก่ายังอยู่ในประวัติ');
  });

  test('ใบเดิมถูกยกเลิก/ปิดใช้งาน → เพิ่มใบใหม่ประเภทเดิมได้', () => {
    const first = card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    setDocumentLifecycle(first.docId, 'REVOKED', { by: 'x', at: NOW });

    const next = card(TYPE_A, {}, { expiryDate: '2031-01-01', number: 'TC-แทนใบยกเลิก' });
    assert.equal(next.fields.number, 'TC-แทนใบยกเลิก');
  });

  test('ใบเดิมแจ้งสูญหาย → เพิ่มใบใหม่ประเภทเดิมได้', () => {
    const first = card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    setDocumentLifecycle(first.docId, 'LOST', { by: 'x', at: NOW });
    assert.ok(card(TYPE_A, {}, { expiryDate: '2031-01-01', number: 'TC-แทนใบหาย' }));
  });

  test('ยังไม่ระบุประเภท → ไม่บล็อก (ยังตัดสินไม่ได้ว่าซ้ำกับใบไหน)', () => {
    card('', {}, { expiryDate: '2030-01-01' });
    assert.ok(card('', {}, { expiryDate: '2030-01-01', number: 'TC-2' }));
  });

  test('คนละหัวหน้าทัวร์ ถือประเภทเดียวกันได้', () => {
    card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    assert.ok(card(TYPE_A, { tourLeaderId: OTHER_LEADER }, { expiryDate: '2030-01-01' }));
  });

  test('แก้ไขใบเดิมให้ไปชนประเภทที่ยังถืออยู่ → ถูกปฏิเสธ', () => {
    card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    const second = card(TYPE_B, {}, { expiryDate: '2030-01-01' });

    assert.throws(
      () => saveDocumentEdit(
        second.docId,
        { fields: { ...second.fields, cardType: TYPE_A }, note: '', makePrimary: false },
        { by: 'x', at: NOW },
      ),
      (e: Error) => e.name === 'DocumentRuleError',
    );
    assert.equal(getDocument(second.docId)?.fields.cardType, TYPE_B, 'ค่าเดิมต้องไม่ถูกแก้');
  });

  test('แก้ไขใบเดิมโดยไม่เปลี่ยนประเภท → ทำได้ปกติ (ไม่ชนตัวเอง)', () => {
    const c = card(TYPE_A, {}, { expiryDate: '2030-01-01' });
    const after = saveDocumentEdit(
      c.docId,
      { fields: { ...c.fields, issuer: 'กรมการท่องเที่ยว' }, note: '', makePrimary: false },
      { by: 'x', at: NOW },
    );
    assert.equal(after?.fields.issuer, 'กรมการท่องเที่ยว');
  });

  test('ชนิดอื่น (วีซ่า) ไม่ติดกติกานี้', () => {
    addDoc('visa', { fields: { number: 'V1', visaType: 'Tourist' } });
    assert.ok(addDoc('visa', { fields: { number: 'V2', visaType: 'Tourist' } }));
  });
});
