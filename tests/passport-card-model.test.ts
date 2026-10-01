import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  masterIdentityToCard, bookToCard, buildPassportCards,
} from '../src/lib/logic/passportCardModel';
import { emptyPassportFields, type PassportBook } from '../src/data/leaders/passportBookTypes';
import type { TourLeaderIdentityDocument, TourLeaderProfile } from '../src/data/leaders/masterTypes';

const TODAY = '2026-07-13';

function identity(over: Partial<TourLeaderIdentityDocument> = {}): TourLeaderIdentityDocument {
  return {
    tourLeaderId: 'TL-1', passportType: 'P', passportNo: 'AA1111111', personalID: null,
    dateOfBirth: '1990-01-01', placeOfBirth: 'BANGKOK', passportIssueDate: '2021-01-01',
    passportExpiryDate: '2031-01-01', issuingAuthority: 'MFA', authorityRemark: null, ...over,
  };
}

function profile(over: Partial<TourLeaderProfile> = {}): TourLeaderProfile {
  return {
    tourLeaderId: 'TL-1', titleNameEN: 'MR', firstNameEN: 'SOMCHAI', lastNameEN: 'JAIDEE',
    nationality: 'THAI', countryCode: 'THA', gender: 'M',
    fullNameEN: '', firstNameTH: null, lastNameTH: null, titleNameTH: null, fullNameTH: '',
    nickName: null, displayName: '', contactNumberRaw: null, contactNumberNormalized: null,
    country: null, activeStatus: 'ACTIVE', employmentStatus: 'NOT_SPECIFIED',
    availabilityStatus: 'AVAILABLE', statusNeedsReview: false, languages: [], skilledCountries: [],
    skilledRoutes: [], guideGroups: [], canHandlePrivateGroup: null, yearsOfExperience: null,
    specialSkills: [], workRestrictions: [], sourceFileName: '', sourceRowNumber: 1,
    importedAt: '', updatedAt: '', validationStatus: 'VALID', validationMessages: [],
    duplicateStatus: 'NEW_RECORD', ...over,
  };
}

function book(over: Partial<PassportBook> & { bookId: string }): PassportBook {
  const fields = emptyPassportFields();
  fields.passportNo = over.bookId.toUpperCase();
  fields.expiryDate = '2032-01-01';
  return {
    tourLeaderId: 'TL-1', isPrimary: false, status: 'CONFIRMED', note: '',
    lifecycle: 'ACTIVE', entryMethod: 'OCR', fieldOrigin: {} as never, ocrOriginal: null,
    ocrRawText: null, imageId: null, portraitImageId: null, signatureImageId: null,
    sourceFileName: null, mrzCheck: null, createdBy: 'x', createdAt: '', updatedAt: '',
    verifiedBy: null, verifiedAt: null, history: [], ...over,
    fields: over.fields ?? fields,
  };
}

describe('masterIdentityToCard — เล่มจากไฟล์ต้นทาง', () => {
  test('รวมข้อมูลของเล่มเดียวไว้ครบทุก Section', () => {
    const card = masterIdentityToCard(profile(), identity(), TODAY);
    assert.ok(card);
    assert.equal(card.source, 'MASTER');
    // จัดการได้ (แก้/ลบ) — แต่ยังไม่มีเล่มในระบบ ผู้เรียกต้องคัดลอกมาเป็นเล่มก่อนแก้
    assert.equal(card.manageable, true);
    assert.equal(card.bookId, null, 'เล่มนำเข้ายังไม่มีเล่มในระบบให้แก้โดยตรง');
    assert.equal(card.fields.passportNo, 'AA1111111');
    assert.equal(card.fields.firstName, 'SOMCHAI');
    assert.equal(card.fields.lastName, 'JAIDEE');
    assert.equal(card.fields.fullName, 'MR SOMCHAI JAIDEE');
    assert.equal(card.fields.nationality, 'THAI');
    assert.equal(card.fields.placeOfBirth, 'BANGKOK');
    assert.equal(card.fields.issueDate, '2021-01-01');
    assert.equal(card.fields.expiryDate, '2031-01-01');
    assert.equal(card.status, 'VALID');
  });

  test('ไม่มีร่องรอยเล่มจริง → ไม่สร้าง Card ว่าง', () => {
    assert.equal(masterIdentityToCard(profile(), null, TODAY), null);
    const empty = identity({ passportNo: null, passportExpiryDate: null, passportIssueDate: null });
    assert.equal(masterIdentityToCard(profile(), empty, TODAY), null);
  });

  test('เล่มจาก Master ไม่เป็นเล่มหลัก (เล่มหลักกำหนดจากเล่มในระบบ)', () => {
    assert.equal(masterIdentityToCard(profile(), identity(), TODAY)?.isPrimary, false);
  });
});

describe('bookToCard', () => {
  test('เล่มในระบบจัดการได้ + ผูก bookId', () => {
    const card = bookToCard(book({ bookId: 'B1', isPrimary: true }), TODAY);
    assert.equal(card.source, 'BOOK');
    assert.equal(card.manageable, true);
    assert.equal(card.bookId, 'B1');
    assert.equal(card.isPrimary, true);
  });

  test('เล่มปิดใช้งาน → สถานะ INACTIVE ไม่ว่าจะยังไม่หมดอายุ', () => {
    const card = bookToCard(book({ bookId: 'B1', lifecycle: 'INACTIVE' }), TODAY);
    assert.equal(card.status, 'INACTIVE');
  });
});

describe('buildPassportCards — 1 เล่ม = 1 Card', () => {
  test('รวมเล่มในระบบ + เล่มจาก Master เป็นรายการเดียว', () => {
    const cards = buildPassportCards([book({ bookId: 'B1' })], masterIdentityToCard(profile(), identity(), TODAY), TODAY);
    assert.equal(cards.length, 2);
    // เล่มในระบบ (ใช้งานได้ หมดอายุ 2032) ควรมาก่อนเล่ม Master (หมดอายุ 2031)
    assert.equal(cards[0].source, 'BOOK');
    assert.equal(cards[1].source, 'MASTER');
  });

  test('เล่มหลักขึ้นก่อนเสมอ (§5)', () => {
    const cards = buildPassportCards(
      [book({ bookId: 'B1' }), book({ bookId: 'B2', isPrimary: true })],
      null, TODAY,
    );
    assert.equal(cards[0].bookId, 'B2');
  });

  test('เล่ม Master ที่เลขซ้ำกับเล่มในระบบ → ตัดออก (กัน Card ซ้ำ)', () => {
    const dupBook = book({ bookId: 'B1' });
    dupBook.fields.passportNo = 'AA1111111'; // ตรงกับ Master
    const cards = buildPassportCards([dupBook], masterIdentityToCard(profile(), identity(), TODAY), TODAY);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].source, 'BOOK');
  });

  test('ไม่มีเล่มเลย → รายการว่าง', () => {
    assert.equal(buildPassportCards([], null, TODAY).length, 0);
  });

  test('เรียงกลุ่มสถานะ: ใช้งานได้ → หมดอายุ/ปิดใช้งาน', () => {
    const active = book({ bookId: 'active' });
    const inactive = book({ bookId: 'inactive', lifecycle: 'INACTIVE' });
    const cards = buildPassportCards([inactive, active], null, TODAY);
    assert.equal(cards[0].bookId, 'active');
    assert.equal(cards[1].bookId, 'inactive');
  });
});
