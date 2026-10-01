/**
 * เทสต์ Document Readiness — "หัวหน้าทัวร์คนนี้เอกสารพร้อมออกกรุ๊ปนี้หรือยัง"
 *
 * เน้นกฎที่พลาดง่ายและมีผลจริงกับการขึ้นเครื่อง:
 *   • อายุหนังสือเดินทางเทียบกับ "วันเดินทางกลับ" ไม่ใช่วันนี้หรือวันออกเดินทาง
 *   • เกณฑ์ 6 เดือนต้องนับแบบคงวันที่ และหดให้พอดีเมื่อเดือนปลายทางสั้นกว่า
 *   • ฉบับร่าง / สูญหาย / ยกเลิก = ใช้ไม่ได้ แม้ยังไม่หมดอายุ
 *   • วีซ่าต้องตรงประเทศ และรู้ว่าติดอยู่ในเล่มไหน
 *   • เอกสารตรวจประวัติอาชญากรรมมีอายุตามนโยบายบริษัท แม้บนกระดาษไม่ระบุ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonthsKeepDay,
  checkDocumentReadiness,
  readinessSummary,
  resolvePolicy,
  type ReadinessIssueCode,
  type TripWindow,
} from '@/lib/logic/documentReadiness';
import type { DocKind } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';

/* --------------------------------- ตัวช่วย --------------------------------- */

let seq = 0;

function doc(
  kind: DocKind,
  fields: Record<string, string>,
  over: Partial<AnyLeaderDocumentRecord> = {},
): AnyLeaderDocumentRecord {
  seq += 1;
  return {
    docId: `${kind.toUpperCase()}-${seq}`,
    tourLeaderId: 'TL-000001',
    kind,
    isPrimary: true,
    status: 'CONFIRMED',
    lifecycle: 'ACTIVE',
    entryMethod: 'MANUAL',
    fields,
    fieldOrigin: {},
    ocrOriginal: null,
    ocrRawText: null,
    imageId: null,
    portraitImageId: null,
    signatureImageId: null,
    sourceFileName: null,
    extra: null,
    note: '',
    createdBy: 'x',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    verifiedBy: null,
    verifiedAt: null,
    history: [],
    ...over,
  };
}

/** กรุ๊ปจีน 5–9 ส.ค. 2026 */
const TRIP: TripWindow = {
  departDate: '2026-08-05',
  returnDate: '2026-08-09',
  countryId: 'C-CN',
  countryName: 'จีน',
};

const passport = (expiry: string, over: Partial<AnyLeaderDocumentRecord> = {}) =>
  doc('passport', { passportNo: 'AA1234567', issueDate: '2020-01-01', expiryDate: expiry }, over);

const tourCard = (expiry = '2030-01-01') =>
  doc('tour_card', { number: 'GD-11-2345', issuedDate: '2022-01-01', expiryDate: expiry });

/** ชุดเอกสารที่ผ่านทุกเกณฑ์พื้นฐาน */
const okDocs = () => [passport('2030-01-01'), tourCard()];

const codes = (result: { issues: { code: ReadinessIssueCode }[] }) => result.issues.map((i) => i.code);

/* ------------------------------ การบวกเดือน ------------------------------ */

describe('addMonthsKeepDay — บวกเดือนแบบคงวันที่', () => {
  test('กรณีปกติ คงวันที่เดิม', () => {
    assert.equal(addMonthsKeepDay('2026-08-09', 6), '2027-02-09');
  });

  test('เดือนปลายทางสั้นกว่า → หดให้พอดี ไม่ล้นไปเดือนถัดไป', () => {
    assert.equal(addMonthsKeepDay('2026-08-31', 6), '2027-02-28');
  });

  test('ปีอธิกสุรทิน → ได้ 29 ก.พ.', () => {
    assert.equal(addMonthsKeepDay('2027-08-31', 6), '2028-02-29');
  });

  test('ข้ามปีได้ถูกต้อง', () => {
    assert.equal(addMonthsKeepDay('2026-10-15', 6), '2027-04-15');
  });
});

/* -------------------------------- กรณีผ่าน -------------------------------- */

describe('Readiness — ชุดเอกสารที่พร้อมเดินทาง', () => {
  test('หนังสือเดินทางเหลือเกิน 6 เดือน + มีบัตรหัวหน้าทัวร์ → พร้อม', () => {
    const r = checkDocumentReadiness(okDocs(), TRIP);
    assert.equal(r.ready, true);
    assert.deepEqual(r.blocking, []);
    assert.equal(readinessSummary(r), 'เอกสารพร้อมเดินทาง');
  });

  test('คืนเล่มที่ระบบเลือกใช้ตรวจ เพื่อให้หน้าจออ้างอิงต่อได้', () => {
    const p = passport('2030-01-01');
    const r = checkDocumentReadiness([p, tourCard()], TRIP);
    assert.equal(r.passportDocId, p.docId);
  });

  test('มีหลายเล่ม — เลือกเล่มหลักก่อน', () => {
    const primary = passport('2029-01-01', { isPrimary: true });
    const other = passport('2035-01-01', { isPrimary: false });
    const r = checkDocumentReadiness([other, primary, tourCard()], TRIP);
    assert.equal(r.passportDocId, primary.docId, 'เล่มหลักต้องมาก่อน แม้เล่มอื่นหมดอายุช้ากว่า');
  });
});

/* ------------------------- เกณฑ์อายุหนังสือเดินทาง ------------------------- */

describe('Readiness — เกณฑ์ 6 เดือนของหนังสือเดินทาง', () => {
  test('หมดอายุพอดี 6 เดือนหลังวันกลับ → ผ่าน', () => {
    const r = checkDocumentReadiness([passport('2027-02-09'), tourCard()], TRIP);
    assert.equal(r.ready, true);
  });

  test('ขาดไปวันเดียว → บล็อก พร้อมบอกวันที่ต้องการ', () => {
    const r = checkDocumentReadiness([passport('2027-02-08'), tourCard()], TRIP);
    assert.equal(r.ready, false);
    assert.ok(codes(r).includes('passport_validity_short'));
    assert.ok(r.blocking[0].message.includes('2027-02-09'), 'ต้องบอกวันที่ต้องหมดอายุไม่ก่อน');
  });

  test('ยังไม่หมดอายุ ณ วันกลับ แต่ไม่ถึงเกณฑ์ → บล็อก (ไม่ใช่แค่เตือน)', () => {
    const r = checkDocumentReadiness([passport('2026-09-01'), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_validity_short'));
    assert.equal(r.ready, false);
  });

  test('หมดอายุก่อนวันกลับ → บล็อกด้วยเหตุผลหมดอายุ ไม่ใช่เหตุผลอายุไม่พอ', () => {
    const r = checkDocumentReadiness([passport('2026-08-08'), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_expired'));
    assert.ok(!codes(r).includes('passport_validity_short'));
  });

  test('หมดอายุระหว่างเดินทาง (หลังออก ก่อนกลับ) → บล็อก', () => {
    const r = checkDocumentReadiness([passport('2026-08-07'), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_expired'));
  });

  test('ผ่านแบบเฉียดฉิว → ผ่านแต่มีคำเตือนให้วางแผนต่ออายุ', () => {
    const r = checkDocumentReadiness([passport('2027-03-01'), tourCard()], TRIP);
    assert.equal(r.ready, true);
    assert.ok(codes(r).includes('passport_expiring_soon'));
  });

  test('ปรับนโยบายเป็น 3 เดือนได้ — เล่มเดิมกลับมาผ่าน', () => {
    const r = checkDocumentReadiness([passport('2026-12-01'), tourCard()], TRIP, { passportMonthsAfterReturn: 3 });
    assert.equal(r.ready, true);
  });

  test('ไม่ระบุวันหมดอายุ → เตือน ไม่บล็อก (ตรวจไม่ได้ ไม่ใช่ผิด)', () => {
    const r = checkDocumentReadiness([passport(''), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_no_expiry'));
    assert.equal(r.ready, true);
  });
});

/* --------------------------- เอกสารที่ใช้ไม่ได้ --------------------------- */

describe('Readiness — เอกสารที่ยังใช้ไม่ได้', () => {
  test('ไม่มีหนังสือเดินทางเลย → บล็อก', () => {
    const r = checkDocumentReadiness([tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_missing'));
    assert.equal(r.passportDocId, null);
  });

  test('มีเล่มแต่ยังเป็นฉบับร่าง → บล็อกพร้อมบอกให้ไปยืนยันก่อน', () => {
    const r = checkDocumentReadiness([passport('2030-01-01', { status: 'DRAFT' }), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_unconfirmed'));
    assert.ok(r.blocking.some((i) => i.message.includes('ฉบับร่าง')));
  });

  test('เล่มแจ้งสูญหาย → บล็อก แม้ยังไม่หมดอายุ', () => {
    const r = checkDocumentReadiness([passport('2030-01-01', { lifecycle: 'LOST' }), tourCard()], TRIP);
    assert.ok(codes(r).includes('passport_inactive'));
  });

  test('เล่มสูญหาย 1 เล่ม แต่ยังมีเล่มที่ใช้ได้ → ผ่าน', () => {
    const r = checkDocumentReadiness([
      passport('2030-01-01', { lifecycle: 'LOST', isPrimary: false }),
      passport('2031-01-01'),
      tourCard(),
    ], TRIP);
    assert.equal(r.ready, true);
  });
});

/* ----------------------------------- วีซ่า ---------------------------------- */

describe('Readiness — วีซ่า', () => {
  const withVisa = (fields: Record<string, string>, over: Partial<AnyLeaderDocumentRecord> = {}) =>
    doc('visa', { number: 'V123', countryId: 'C-CN', issuedDate: '2026-01-01', expiryDate: '2026-12-01', ...fields }, over);

  test('กรุ๊ปที่ไม่ต้องใช้วีซ่า → ไม่ตรวจวีซ่าเลย', () => {
    const r = checkDocumentReadiness(okDocs(), TRIP);
    assert.ok(!codes(r).some((c) => c.startsWith('visa')));
  });

  test('ต้องใช้วีซ่าแต่ไม่มี → บล็อก พร้อมบอกชื่อประเทศ', () => {
    const r = checkDocumentReadiness(okDocs(), TRIP, { visaRequired: true });
    assert.ok(codes(r).includes('visa_missing'));
    assert.ok(r.blocking.some((i) => i.message.includes('จีน')));
  });

  test('มีวีซ่าแต่คนละประเทศ → ถือว่าไม่มี', () => {
    const r = checkDocumentReadiness(
      [...okDocs(), withVisa({ countryId: 'C-JP' })],
      TRIP,
      { visaRequired: true },
    );
    assert.ok(codes(r).includes('visa_missing'));
  });

  test('วีซ่าหมดอายุก่อนวันกลับ → บล็อก', () => {
    const r = checkDocumentReadiness(
      [...okDocs(), withVisa({ expiryDate: '2026-08-08' }, { extra: { passportDocId: null } })],
      TRIP,
      { visaRequired: true },
    );
    assert.ok(codes(r).includes('visa_expired'));
  });

  test('วีซ่าติดอยู่คนละเล่มกับเล่มที่จะใช้ → เตือนให้พกเล่มเดิมไปด้วย', () => {
    const p = passport('2030-01-01');
    const r = checkDocumentReadiness(
      [p, tourCard(), withVisa({}, { extra: { passportDocId: 'PPBOOK-เล่มเก่า' } })],
      TRIP,
      { visaRequired: true },
    );
    assert.ok(codes(r).includes('visa_other_passport'));
    assert.equal(r.ready, true, 'พกเล่มเก่าไปด้วยได้ จึงเป็นคำเตือน ไม่ใช่บล็อก');
  });

  test('วีซ่าติดอยู่ในเล่มเดียวกับที่จะใช้ → ไม่เตือน', () => {
    const p = passport('2030-01-01');
    const r = checkDocumentReadiness(
      [p, tourCard(), withVisa({}, { extra: { passportDocId: p.docId } })],
      TRIP,
      { visaRequired: true },
    );
    assert.ok(!codes(r).some((c) => c.startsWith('visa')));
  });

  test('ไม่ได้ระบุว่าวีซ่าอยู่เล่มไหน → เตือนให้ไปตรวจ', () => {
    const r = checkDocumentReadiness([...okDocs(), withVisa({})], TRIP, { visaRequired: true });
    assert.ok(codes(r).includes('visa_passport_unknown'));
  });
});

/* ------------------------------ บัตรหัวหน้าทัวร์ ------------------------------ */

describe('Readiness — บัตรหัวหน้าทัวร์', () => {
  test('ไม่มีบัตร → บล็อก', () => {
    const r = checkDocumentReadiness([passport('2030-01-01')], TRIP);
    assert.ok(codes(r).includes('tour_card_missing'));
  });

  test('บัตรหมดอายุก่อนวันกลับ → บล็อก', () => {
    const r = checkDocumentReadiness([passport('2030-01-01'), tourCard('2026-08-08')], TRIP);
    assert.ok(codes(r).includes('tour_card_expired'));
  });

  test('ปิดข้อบังคับบัตรได้ (เช่น กรุ๊ปที่ไม่ต้องใช้)', () => {
    const r = checkDocumentReadiness([passport('2030-01-01')], TRIP, { tourCardRequired: false });
    assert.equal(r.ready, true);
  });
});

/* --------------------------- เอกสารตรวจประวัติอาชญากรรม -------------------------- */

describe('Readiness — เอกสารตรวจประวัติอาชญากรรม', () => {
  const cr = (issued: string, expiry = '') =>
    doc('criminal_record', { documentNumber: 'CR-1', issuedDate: issued, expiryDate: expiry });

  test('ไม่บังคับตามค่าเริ่มต้น', () => {
    const r = checkDocumentReadiness(okDocs(), TRIP);
    assert.ok(!codes(r).some((c) => c.startsWith('criminal')));
  });

  test('บังคับแล้วไม่มีเอกสาร → บล็อก', () => {
    const r = checkDocumentReadiness(okDocs(), TRIP, { criminalRecordValidDays: 180 });
    assert.ok(codes(r).includes('criminal_record_missing'));
  });

  test('เอกสารออกมานานเกินอายุที่รับได้ → บล็อก แม้บนกระดาษไม่ระบุวันหมดอายุ', () => {
    const r = checkDocumentReadiness(
      [...okDocs(), cr('2025-01-01')],
      TRIP,
      { criminalRecordValidDays: 180 },
    );
    assert.ok(codes(r).includes('criminal_record_stale'));
  });

  test('เอกสารออกใหม่พอ → ผ่าน', () => {
    const r = checkDocumentReadiness(
      [...okDocs(), cr('2026-06-01')],
      TRIP,
      { criminalRecordValidDays: 180 },
    );
    assert.equal(r.ready, true);
  });

  test('ถ้ากระดาษระบุวันหมดอายุไว้ ให้ยึดวันบนกระดาษก่อนนโยบาย', () => {
    const r = checkDocumentReadiness(
      [...okDocs(), cr('2025-01-01', '2027-01-01')],
      TRIP,
      { criminalRecordValidDays: 180 },
    );
    assert.equal(r.ready, true, 'วันบนเอกสารยังไม่หมด จึงไม่ควรถูกตัดด้วยนโยบาย');
  });
});

/* -------------------------------- บัตรประชาชน ------------------------------- */

describe('Readiness — บัตรประชาชน', () => {
  test('หมดอายุ → เตือนเท่านั้น ไม่บล็อกการเดินทาง', () => {
    const r = checkDocumentReadiness([
      ...okDocs(),
      doc('id_card', { idNumber: '1234567890123', issuedDate: '2016-01-01', expiryDate: '2026-01-01' }),
    ], TRIP);

    assert.ok(codes(r).includes('id_card_expired'));
    assert.equal(r.ready, true);
  });
});

/* --------------------------------- การสรุปผล -------------------------------- */

describe('Readiness — การจัดลำดับและสรุป', () => {
  test('ปัญหาระดับบล็อกขึ้นก่อนคำเตือนเสมอ', () => {
    const r = checkDocumentReadiness([passport(''), doc('id_card', { expiryDate: '2020-01-01' })], TRIP);
    const firstWarningAt = r.issues.findIndex((i) => i.severity === 'warning');
    const lastBlockingAt = r.issues.map((i) => i.severity).lastIndexOf('blocking');
    assert.ok(lastBlockingAt < firstWarningAt, 'บล็อกต้องอยู่ก่อนคำเตือนทั้งหมด');
  });

  test('ข้อความสรุปสะท้อนสถานะจริง', () => {
    const blocked = checkDocumentReadiness([], TRIP);
    assert.match(readinessSummary(blocked), /เอกสารไม่พร้อม/);

    const warned = checkDocumentReadiness([passport(''), tourCard()], TRIP);
    assert.match(readinessSummary(warned), /ข้อควรตรวจ/);
  });

  test('ไม่มีเอกสารเลย → บล็อกทั้งหนังสือเดินทางและบัตร', () => {
    const r = checkDocumentReadiness([], TRIP);
    assert.deepEqual(codes(r).sort(), ['passport_missing', 'tour_card_missing']);
  });
});

/* ------------------------- การรวมนโยบายกับค่าเริ่มต้น ------------------------- */

describe('resolvePolicy — ค่า undefined ต้องไม่ทับค่าเริ่มต้น', () => {
  test('ส่งเฉพาะบางคีย์ → คีย์อื่นยังเป็นค่าเริ่มต้น', () => {
    const p = resolvePolicy({ tourCardRequired: false });
    assert.equal(p.tourCardRequired, false);
    assert.equal(p.passportMonthsAfterReturn, 6);
  });

  test('ส่ง undefined มาตรง ๆ → ยังได้ค่าเริ่มต้น (กันบั๊กจากการแตก object แล้วประกอบใหม่)', () => {
    const p = resolvePolicy({ passportMonthsAfterReturn: undefined, visaRequired: undefined });
    assert.equal(p.passportMonthsAfterReturn, 6);
    assert.equal(p.visaRequired, false);
  });

  test('ค่า 0 และ false ต้องไม่ถูกมองว่าไม่ได้ส่งมา', () => {
    const p = resolvePolicy({ criminalRecordValidDays: 0, tourCardRequired: false });
    assert.equal(p.criminalRecordValidDays, 0);
    assert.equal(p.tourCardRequired, false);
  });

  test('ตรวจจริงด้วยนโยบายที่มี undefined ปน → ยังใช้เกณฑ์ 6 เดือนได้ถูกต้อง', () => {
    const r = checkDocumentReadiness(
      [passport('2029-02-12')],
      TRIP,
      { passportMonthsAfterReturn: undefined, tourCardRequired: false },
    );
    assert.equal(r.ready, true);
    assert.equal(r.issues.length, 0, 'ต้องไม่มีข้อความที่มี undefined/NaN');
  });
});
