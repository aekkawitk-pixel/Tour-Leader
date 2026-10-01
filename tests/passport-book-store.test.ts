/**
 * เทสต์พฤติกรรมของ Passport Book Store (§4/§6/§7/§8/§10)
 *
 * เขียนไว้ "ก่อน" ย้ายฐานไปใช้ Document Store กลาง เพื่อล็อกพฤติกรรมเดิมทุกข้อ
 * ถ้ารีแฟกเตอร์แล้วเทสต์ชุดนี้ยังเขียว = พฤติกรรมที่ผู้ใช้เห็นไม่เปลี่ยน
 *
 * ครอบคลุม:
 *   • เล่มแรก = เล่มหลักอัตโนมัติ · เล่มหลักมีได้ไม่เกิน 1 เล่มต่อคน (§7)
 *   • ลำดับการแสดง: เล่มหลักขึ้นก่อน แล้วเรียงตามวันหมดอายุล่าสุด
 *   • แก้ค่า → ช่องที่เปลี่ยนกลายเป็น USER_VERIFIED + ลงประวัติ (§10)
 *   • เปลี่ยนสถานะเป็นใช้ไม่ได้ → ถูกปลดจากเล่มหลักอัตโนมัติ (§6)
 *   • อัปโหลด/OCR ใหม่ → ค่าที่ OCR อ่านครั้งแรกต้องไม่ถูกทับ (§10)
 *   • ค้นเลขหนังสือเดินทางซ้ำทั้งระบบ (§6)
 *
 * รันด้วย: npm test
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  blankBookDraft,
  createPassportBook,
  deletePassportBook,
  findBooksByPassportNo,
  getPassportBook,
  getPassportBooks,
  getPrimaryBook,
  replaceBookSource,
  savePassportEdit,
  setBookLifecycle,
  setPrimaryBook,
  updatePassportBook,
  type CreateBookInput,
} from '@/services/passportBookStore';
import {
  emptyPassportFields,
  manualFieldOrigin,
  type MrzCheckSummary,
  type PassportBook,
  type PassportFieldValues,
  type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';

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

function fields(over: Partial<PassportFieldValues> = {}): PassportFieldValues {
  return { ...emptyPassportFields(), ...over };
}

function addBook(over: Partial<CreateBookInput> = {}): PassportBook {
  return createPassportBook({
    tourLeaderId: LEADER,
    fields: fields({ passportNo: 'AA1234567', expiryDate: '2030-01-01' }),
    fieldOrigin: manualFieldOrigin(),
    entryMethod: 'MANUAL',
    status: 'CONFIRMED',
    ocrOriginal: null,
    mrzCheck: null,
    imageId: null,
    sourceFileName: null,
    makePrimary: false,
    by: 'ผู้ทดสอบ',
    at: '2026-01-01T00:00:00.000Z',
    ...over,
  });
}

const actionsOf = (b: PassportBook) => b.history.map((h) => h.action);

/* ------------------------------ เล่มหลัก (§7/§8) ----------------------------- */

describe('Passport Book — กติกาเล่มหลัก', () => {
  test('เล่มแรกของหัวหน้าทัวร์เป็นเล่มหลักอัตโนมัติ แม้ไม่ได้สั่ง', () => {
    const b = addBook({ makePrimary: false });
    assert.equal(b.isPrimary, true);
    assert.ok(actionsOf(b).includes('SET_PRIMARY'));
  });

  test('เล่มที่สองไม่สั่งเป็นเล่มหลัก → เล่มแรกยังเป็นเล่มหลัก', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }) });
    assert.equal(second.isPrimary, false);
    assert.equal(getPrimaryBook(LEADER)?.bookId, first.bookId);
  });

  test('เล่มที่สองสั่งเป็นเล่มหลัก → เล่มเดิมถูกลดเป็นเล่มรองพร้อมลงประวัติ', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }), makePrimary: true });

    assert.equal(second.isPrimary, true);
    const demoted = getPassportBook(first.bookId);
    assert.equal(demoted?.isPrimary, false);
    assert.ok(actionsOf(demoted!).includes('UNSET_PRIMARY'));
    assert.equal(getPassportBooks(LEADER).filter((b) => b.isPrimary).length, 1);
  });

  test('ข้อความในประวัติเรียกหน่วยว่า “เล่ม” ไม่ใช่คำกลาง', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }), makePrimary: true });

    const created = first.history.find((h) => h.action === 'SET_PRIMARY');
    assert.equal(created?.note, 'เล่มแรกของหัวหน้าทัวร์ — ตั้งเป็นเล่มหลักอัตโนมัติ');

    const demoted = getPassportBook(first.bookId)!.history.find((h) => h.action === 'UNSET_PRIMARY');
    assert.equal(demoted?.note, 'ถูกแทนที่ด้วยเล่มใหม่');

    setPrimaryBook(first.bookId, 'ผู้ทดสอบ', '2026-02-01T00:00:00.000Z');
    const swapped = getPassportBook(second.bookId)!.history.filter((h) => h.action === 'UNSET_PRIMARY').at(-1);
    assert.equal(swapped?.note, 'ถูกแทนที่ด้วยเล่มอื่น');
  });

  test('setPrimaryBook สลับเล่มหลัก และเหลือเล่มหลักเพียงเล่มเดียว', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }) });

    setPrimaryBook(second.bookId, 'ผู้ทดสอบ', '2026-02-01T00:00:00.000Z');

    assert.equal(getPassportBook(second.bookId)?.isPrimary, true);
    assert.equal(getPassportBook(first.bookId)?.isPrimary, false);
    assert.equal(getPassportBooks(LEADER).filter((b) => b.isPrimary).length, 1);
  });

  test('เล่มหลักแยกกันคนละหัวหน้าทัวร์ — ไม่ตีกัน', () => {
    const mine = addBook();
    const theirs = addBook({ tourLeaderId: OTHER_LEADER, fields: fields({ passportNo: 'CC1112223' }) });

    assert.equal(mine.isPrimary, true);
    assert.equal(theirs.isPrimary, true);
    assert.equal(getPrimaryBook(LEADER)?.bookId, mine.bookId);
    assert.equal(getPrimaryBook(OTHER_LEADER)?.bookId, theirs.bookId);
  });

  test('getPassportBooks — เล่มหลักขึ้นก่อน แล้วเรียงวันหมดอายุจากใหม่ไปเก่า', () => {
    addBook({ fields: fields({ passportNo: 'AA0000001', expiryDate: '2028-01-01' }) }); // เล่มหลัก
    addBook({ fields: fields({ passportNo: 'AA0000002', expiryDate: '2032-01-01' }) });
    addBook({ fields: fields({ passportNo: 'AA0000003', expiryDate: '2030-01-01' }) });

    const rows = getPassportBooks(LEADER);
    assert.equal(rows[0].fields.passportNo, 'AA0000001'); // เล่มหลักมาก่อนเสมอ
    assert.deepEqual(rows.slice(1).map((b) => b.fields.expiryDate), ['2032-01-01', '2030-01-01']);
  });

  test('เล่มของคนอื่นไม่ปนในรายการ', () => {
    addBook();
    addBook({ tourLeaderId: OTHER_LEADER, fields: fields({ passportNo: 'CC1112223' }) });
    assert.equal(getPassportBooks(LEADER).length, 1);
  });
});

/* ------------------------------ สร้างเล่ม (§4) ------------------------------ */

describe('Passport Book — การสร้างเล่มและประวัติเริ่มต้น', () => {
  test('กรอกเอง + ยืนยัน → ประวัติ MANUAL_ENTRY แล้วตามด้วย CONFIRM · บันทึกผู้ยืนยัน', () => {
    const b = addBook({ entryMethod: 'MANUAL', status: 'CONFIRMED' });
    assert.deepEqual(actionsOf(b).slice(0, 2), ['MANUAL_ENTRY', 'CONFIRM']);
    assert.equal(b.verifiedBy, 'ผู้ทดสอบ');
    assert.equal(b.verifiedAt, '2026-01-01T00:00:00.000Z');
  });

  test('อ่านด้วย OCR + บันทึกร่าง → ประวัติ OCR_IMPORT แล้ว SAVE_DRAFT · ยังไม่มีผู้ยืนยัน', () => {
    const b = addBook({ entryMethod: 'OCR', status: 'DRAFT' });
    assert.deepEqual(actionsOf(b).slice(0, 2), ['OCR_IMPORT', 'SAVE_DRAFT']);
    assert.equal(b.verifiedBy, null);
    assert.equal(b.verifiedAt, null);
  });

  test('เล่มใหม่เริ่มที่สถานะใช้งานอยู่เสมอ', () => {
    assert.equal(addBook().lifecycle, 'ACTIVE');
  });

  test('blankBookDraft — ทุกช่องว่างและเป็นการกรอกเอง', () => {
    const draft = blankBookDraft();
    assert.ok(Object.values(draft.fields).every((v) => v === ''));
    assert.ok(Object.values(draft.fieldOrigin).every((o) => o === 'MANUAL'));
  });
});

/* ------------------------------ แก้ไขค่า (§10) ----------------------------- */

describe('Passport Book — การแก้ไขและประวัติ', () => {
  test('แก้ค่า → ช่องที่เปลี่ยนเป็น USER_VERIFIED และลงประวัติเฉพาะช่องนั้น', () => {
    const b = addBook();
    const after = updatePassportBook(
      b.bookId,
      { placeOfIssue: 'กรุงเทพมหานคร' },
      { by: 'ผู้แก้ไข', at: '2026-03-01T00:00:00.000Z' },
    );

    assert.equal(after?.fields.placeOfIssue, 'กรุงเทพมหานคร');
    assert.equal(after?.fieldOrigin.placeOfIssue, 'USER_VERIFIED');
    const edit = after!.history.find((h) => h.action === 'USER_EDIT');
    assert.deepEqual(edit?.changedFields, ['placeOfIssue']);
  });

  test('ค่าเดิมไม่เปลี่ยน → ไม่เพิ่มประวัติซ้ำ', () => {
    const b = addBook();
    const before = b.history.length;
    const after = updatePassportBook(
      b.bookId,
      { passportNo: b.fields.passportNo },
      { by: 'ผู้แก้ไข', at: '2026-03-01T00:00:00.000Z' },
    );
    assert.equal(after?.history.length, before);
  });

  test('savePassportEdit — เก็บค่าก่อน→หลังไว้ในประวัติ', () => {
    const b = addBook({ fields: fields({ passportNo: 'AA1234567', placeOfIssue: 'เดิม' }) });
    const after = savePassportEdit(
      b.bookId,
      { fields: fields({ passportNo: 'AA1234567', placeOfIssue: 'ใหม่' }), note: '', makePrimary: false },
      { by: 'ผู้แก้ไข', at: '2026-04-01T00:00:00.000Z' },
    );

    const edit = after!.history.find((h) => h.action === 'USER_EDIT');
    assert.ok(edit?.note?.includes('เดิม'));
    assert.ok(edit?.note?.includes('ใหม่'));
  });

  test('savePassportEdit — ตั้งเป็นเล่มหลักพร้อมกับแก้ไข ก็ลดเล่มเดิมให้เอง', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }) });

    savePassportEdit(
      second.bookId,
      { fields: second.fields, note: 'เล่มใหม่', makePrimary: true },
      { by: 'ผู้แก้ไข', at: '2026-04-01T00:00:00.000Z' },
    );

    assert.equal(getPassportBook(second.bookId)?.isPrimary, true);
    assert.equal(getPassportBook(first.bookId)?.isPrimary, false);
  });

  test('แก้ไขเล่มไม่กระทบเล่มอื่นของคนเดียวกัน', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321', placeOfIssue: 'คงเดิม' }) });

    updatePassportBook(first.bookId, { placeOfIssue: 'เปลี่ยน' }, { by: 'x', at: '2026-05-01T00:00:00.000Z' });

    assert.equal(getPassportBook(second.bookId)?.fields.placeOfIssue, 'คงเดิม');
  });

  test('แก้เล่มที่ไม่มีอยู่ → คืน null ไม่โยน error', () => {
    assert.equal(updatePassportBook('PPBOOK-ไม่มีจริง', { placeOfIssue: 'x' }, { by: 'x', at: '2026-01-01T00:00:00.000Z' }), null);
    assert.equal(setPrimaryBook('PPBOOK-ไม่มีจริง', 'x', '2026-01-01T00:00:00.000Z'), null);
  });
});

/* --------------------------- สถานะการใช้งานของเล่ม (§6) -------------------------- */

describe('Passport Book — สถานะการใช้งาน', () => {
  test('แจ้งสูญหาย → ถูกปลดจากการเป็นเล่มหลักอัตโนมัติ', () => {
    const b = addBook();
    const after = setBookLifecycle(b.bookId, 'LOST', { by: 'ผู้ดูแล', at: '2026-06-01T00:00:00.000Z' });

    assert.equal(after?.lifecycle, 'LOST');
    assert.equal(after?.isPrimary, false);
    assert.ok(actionsOf(after!).includes('LIFECYCLE_CHANGE'));
    assert.ok(actionsOf(after!).includes('UNSET_PRIMARY'));
    assert.equal(getPrimaryBook(LEADER), null);

    assert.equal(after!.history.find((h) => h.action === 'LIFECYCLE_CHANGE')?.note, 'เปลี่ยนสถานะเป็น “สูญหาย”');
    assert.equal(after!.history.find((h) => h.action === 'UNSET_PRIMARY')?.note, 'เล่มใช้งานไม่ได้แล้ว');
  });

  test('เปลี่ยนกลับเป็นใช้งานอยู่ ไม่ตั้งเป็นเล่มหลักให้เอง', () => {
    const b = addBook();
    setBookLifecycle(b.bookId, 'REVOKED', { by: 'x', at: '2026-06-01T00:00:00.000Z' });
    const back = setBookLifecycle(b.bookId, 'ACTIVE', { by: 'x', at: '2026-07-01T00:00:00.000Z' });
    assert.equal(back?.isPrimary, false);
  });
});

/* ------------------------ อัปโหลด/OCR ใหม่ (§6/§10) ------------------------ */

describe('Passport Book — แทนที่ไฟล์ต้นฉบับ', () => {
  const ocr = (value: string): PassportOcrFields =>
    ({ passportNo: { value, confidence: 'HIGH', score: 99, source: 'MRZ' } } as unknown as PassportOcrFields);
  const mrz: MrzCheckSummary = {
    parsed: true, passportNoValid: true, dateOfBirthValid: true, expiryValid: true, compositeValid: true,
  };

  test('OCR ใหม่ไม่ทับค่าที่ OCR อ่านครั้งแรก', () => {
    const b = addBook({ entryMethod: 'OCR', ocrOriginal: ocr('ครั้งแรก') });
    const after = replaceBookSource(
      b.bookId,
      { imageId: 'IMG-2', sourceFileName: 'ใหม่.jpg', ocrOriginal: ocr('ครั้งที่สอง'), mrzCheck: mrz },
      { by: 'x', at: '2026-08-01T00:00:00.000Z', reOcr: true },
    );

    assert.equal(after?.ocrOriginal?.passportNo.value, 'ครั้งแรก');
    assert.equal(after?.imageId, 'IMG-2');
    assert.ok(actionsOf(after!).includes('RE_OCR'));
  });

  test('เล่มที่กรอกเอง (ยังไม่มีค่า OCR) — รอบแรกที่อ่านได้ถูกเก็บไว้', () => {
    const b = addBook({ entryMethod: 'MANUAL', ocrOriginal: null });
    const after = replaceBookSource(
      b.bookId,
      { imageId: 'IMG-1', sourceFileName: 'สแกน.jpg', ocrOriginal: ocr('อ่านได้'), mrzCheck: null },
      { by: 'x', at: '2026-08-01T00:00:00.000Z', reOcr: false },
    );

    assert.equal(after?.ocrOriginal?.passportNo.value, 'อ่านได้');
    assert.ok(actionsOf(after!).includes('REPLACE_IMAGE'));
  });
});

/* --------------------------- ตรวจเลขซ้ำ / ลบเล่ม (§2/§6) -------------------------- */

describe('Passport Book — เลขซ้ำและการลบ', () => {
  test('ค้นเลขหนังสือเดินทางซ้ำได้ข้ามหัวหน้าทัวร์ และไม่สนตัวพิมพ์/ช่องว่าง', () => {
    addBook({ fields: fields({ passportNo: 'AA1234567' }) });
    addBook({ tourLeaderId: OTHER_LEADER, fields: fields({ passportNo: 'AA1234567' }) });

    assert.equal(findBooksByPassportNo('  aa1234567  ').length, 2);
  });

  test('ยกเว้นเล่มของตัวเองตอนแก้ไข', () => {
    const b = addBook({ fields: fields({ passportNo: 'AA1234567' }) });
    assert.equal(findBooksByPassportNo('AA1234567', b.bookId).length, 0);
  });

  test('ค่าว่างไม่ถือว่าซ้ำ', () => {
    addBook({ fields: fields({ passportNo: '' }) });
    assert.equal(findBooksByPassportNo('   ').length, 0);
  });

  test('ลบเล่มแล้วหายจากรายการ · เล่มอื่นไม่ถูกแตะ', () => {
    const first = addBook();
    const second = addBook({ fields: fields({ passportNo: 'BB7654321' }) });

    deletePassportBook(first.bookId);

    assert.equal(getPassportBook(first.bookId), null);
    assert.equal(getPassportBook(second.bookId)?.bookId, second.bookId);
  });
});

/* ------------------------------ คงอยู่หลังรีเฟรช ----------------------------- */

describe('Passport Book — ข้อมูลคงอยู่', () => {
  test('บันทึกแล้วอ่านกลับได้ครบทุกช่อง (จำลองรีเฟรชหน้า)', () => {
    const b = addBook({ fields: fields({ passportNo: 'AA1234567', firstName: 'SOMCHAI', mrzLine1: 'P<THA...' }) });

    const again = getPassportBook(b.bookId);
    assert.equal(again?.fields.firstName, 'SOMCHAI');
    assert.equal(again?.fields.mrzLine1, 'P<THA...');
    assert.equal(again?.tourLeaderId, LEADER);
  });
});
