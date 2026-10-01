/**
 * เทสต์ Document View — การฉายเอกสารจริง (LeaderDocumentRecord) ให้เป็นรูปแบน (LeaderDocument)
 *
 * ครอบคลุม:
 *   • จับคู่ชนิดเอกสารครบทุกชนิด และตรงกับชนิดที่รูปแบนรองรับ
 *   • เลขเอกสารอ่อนไหวต้องถูกปิดบังในรูปแบน (ห้ามรั่วเลขเต็มไปหน้าจอเก่า)
 *   • วันที่ออก/หมดอายุอ่านจากชื่อช่องที่ถูกต้องของแต่ละชนิด (passport ใช้ issueDate ไม่ใช่ issuedDate)
 *   • สถานะฉบับร่าง/ยืนยัน → verifyStatus · สถานะสูญหาย/ยกเลิกไม่หายไปเงียบ ๆ
 *   • รวมสองแหล่งแล้วไม่นับซ้ำ และรายการเดิมที่ไม่ซ้ำต้องไม่หาย
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOC_KIND_TO_LEGACY,
  isMasterDocumentId,
  masterPassportToRecord,
  mergeLeaderDocuments,
  toLeaderDocument,
} from '@/lib/logic/documentView';
import { documentFieldKeys } from '@/data/leaders/documentFieldKeys';
import type { DocKind } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import type { LeaderDocument } from '@/types';

/* --------------------------------- ตัวช่วย --------------------------------- */

function record(kind: DocKind, over: Partial<AnyLeaderDocumentRecord> = {}): AnyLeaderDocumentRecord {
  const fields = documentFieldKeys(kind).reduce<Record<string, string>>((acc, k) => { acc[k] = ''; return acc; }, {});
  return {
    docId: `DOC-${kind}`,
    tourLeaderId: 'TL-000001',
    kind,
    isPrimary: true,
    status: 'CONFIRMED',
    lifecycle: 'ACTIVE',
    entryMethod: 'MANUAL',
    fieldOrigin: {},
    ocrOriginal: null,
    ocrRawText: null,
    imageId: null,
    portraitImageId: null,
    signatureImageId: null,
    sourceFileName: null,
    extra: null,
    note: '',
    createdBy: 'ผู้ทดสอบ',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    verifiedBy: null,
    verifiedAt: null,
    history: [],
    ...over,
    fields: { ...fields, ...(over.fields ?? {}) },
  };
}

const legacyDoc = (over: Partial<LeaderDocument> = {}): LeaderDocument => ({
  id: 'LEGACY-1',
  kind: 'license',
  name: 'บัตรมัคคุเทศก์ (บัตรบรอนซ์)',
  number: 'GD-11-2345',
  issuedAt: '2023-06-01',
  expiresAt: '2028-05-31',
  fileName: 'guide_license_demo.pdf',
  verifyStatus: 'verified',
  ...over,
});

/* ------------------------------ จับคู่ชนิดเอกสาร ------------------------------ */

describe('Document View — จับคู่ชนิดเอกสาร', () => {
  const KINDS: DocKind[] = ['id_card', 'passport', 'visa', 'tour_card', 'criminal_record'];

  test('ทุกชนิดของ record มีชนิดปลายทางในรูปแบน', () => {
    for (const kind of KINDS) {
      assert.ok(DOC_KIND_TO_LEGACY[kind], `${kind} ยังไม่ได้จับคู่`);
    }
  });

  test('บัตรหัวหน้าทัวร์ลงเป็น license · เอกสารประวัติอาชญากรรมลงเป็น other', () => {
    assert.equal(DOC_KIND_TO_LEGACY.tour_card, 'license');
    assert.equal(DOC_KIND_TO_LEGACY.criminal_record, 'other');
  });

  test('บัตรประชาชนลงเป็น national_id (ชื่อคนละแบบระหว่างสองระบบ)', () => {
    assert.equal(DOC_KIND_TO_LEGACY.id_card, 'national_id');
  });
});

/* -------------------------------- การฉายภาพ -------------------------------- */

describe('Document View — ฉายเอกสาร 1 ฉบับ', () => {
  test('หนังสือเดินทาง — เลขถูกปิดบัง และวันที่อ่านจาก issueDate/expiryDate', () => {
    const doc = toLeaderDocument(record('passport', {
      fields: { passportNo: 'AA1234567', issueDate: '2024-02-01', expiryDate: '2029-01-31' },
    }));

    assert.equal(doc.kind, 'passport');
    assert.equal(doc.name, 'หนังสือเดินทาง');
    assert.ok(!doc.number.includes('AA1234'), 'ห้ามมีเลขเต็มในรูปแบน');
    assert.ok(doc.number.endsWith('4567'), 'ต้องเหลือเลขท้าย 4 ตัวให้อ้างอิงได้');
    assert.equal(doc.issuedAt, '2024-02-01');
    assert.equal(doc.expiresAt, '2029-01-31');
  });

  test('บัตรประชาชน — เลขถูกปิดบังเช่นกัน', () => {
    const doc = toLeaderDocument(record('id_card', { fields: { idNumber: '1234567890123' } }));
    assert.ok(!doc.number.includes('123456789'), 'ห้ามมีเลขบัตรเต็ม');
    assert.ok(doc.number.endsWith('0123'));
  });

  test('บัตรหัวหน้าทัวร์ — ไม่ใช่เอกสารอ่อนไหว จึงแสดงเลขเต็ม', () => {
    const doc = toLeaderDocument(record('tour_card', {
      fields: { number: 'GD-11-2345', issuedDate: '2023-06-01', expiryDate: '2028-05-31' },
    }));
    assert.equal(doc.number, 'GD-11-2345');
    assert.equal(doc.issuedAt, '2023-06-01', 'ชนิดอื่นใช้ issuedDate ไม่ใช่ issueDate');
  });

  test('วีซ่า — เติมประเภทวีซ่าในชื่อ และเก็บประเทศไว้', () => {
    const doc = toLeaderDocument(record('visa', {
      fields: { number: 'V123456', visaType: 'Tourist', countryId: 'C-CN' },
    }));
    assert.equal(doc.name, 'วีซ่า (Tourist)');
    assert.equal(doc.issuingCountryId, 'C-CN');
  });

  test('ไม่มีวันหมดอายุ → expiresAt เป็น null (ไม่ใช่ค่าว่าง)', () => {
    const doc = toLeaderDocument(record('criminal_record', { fields: { documentNumber: 'CR-001' } }));
    assert.equal(doc.expiresAt, null);
  });

  test('ฉบับร่าง → รอตรวจสอบ · ยืนยันแล้ว → ตรวจสอบแล้ว', () => {
    assert.equal(toLeaderDocument(record('visa', { status: 'DRAFT' })).verifyStatus, 'pending');
    assert.equal(toLeaderDocument(record('visa', { status: 'CONFIRMED' })).verifyStatus, 'verified');
  });

  test('เอกสารสูญหาย/ยกเลิก — สถานะไม่หายไปเงียบ ๆ (ติดมาในหมายเหตุ)', () => {
    const lost = toLeaderDocument(record('passport', { lifecycle: 'LOST' }));
    assert.ok(lost.note?.includes('สูญหาย'));

    const withNote = toLeaderDocument(record('passport', { lifecycle: 'REVOKED', note: 'แจ้งความแล้ว' }));
    assert.ok(withNote.note?.includes('ถูกยกเลิก'));
    assert.ok(withNote.note?.includes('แจ้งความแล้ว'));
  });

  test('เอกสารปกติ — หมายเหตุว่างไม่กลายเป็นข้อความเปล่า', () => {
    assert.equal(toLeaderDocument(record('visa')).note, undefined);
  });

  test('รหัสเอกสารเดิมถูกใช้เป็น id เพื่อให้ React key ไม่ชน', () => {
    assert.equal(toLeaderDocument(record('visa', { docId: 'VS-abc123' })).id, 'VS-abc123');
  });
});

/* ------------------------------- รวมสองแหล่ง ------------------------------- */

describe('Document View — รวมเอกสารจาก store กับรายการเดิม', () => {
  test('ไม่มีเอกสารใน store → ได้รายการเดิมครบ ไม่ตกหล่น', () => {
    const legacy = [legacyDoc(), legacyDoc({ id: 'LEGACY-2', kind: 'health', number: 'HL-9999' })];
    assert.deepEqual(mergeLeaderDocuments(legacy, []), legacy);
  });

  test('เอกสารจาก store ขึ้นก่อนรายการเดิม', () => {
    const merged = mergeLeaderDocuments([legacyDoc()], [record('visa', { fields: { number: 'V123456' } })]);
    assert.equal(merged[0].kind, 'visa');
    assert.equal(merged[1].id, 'LEGACY-1');
  });

  test('รายการเดิมที่เป็นใบเดียวกันถูกตัดออก ไม่ถูกนับสองครั้ง', () => {
    const merged = mergeLeaderDocuments(
      [legacyDoc({ number: 'GD-11-2345' })],
      [record('tour_card', { fields: { number: 'GD-11-2345' } })],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].kind, 'license');
  });

  test('เทียบใบเดียวกันได้แม้ฝั่งหนึ่งเป็นเลขที่ปิดบังแล้ว', () => {
    const merged = mergeLeaderDocuments(
      [legacyDoc({ kind: 'passport', number: 'xxxxx4567' })],
      [record('passport', { fields: { passportNo: 'AA1234567' } })],
    );
    assert.equal(merged.length, 1, 'เลขปิดบังกับเลขเต็มของเล่มเดียวกันต้องถือเป็นใบเดียวกัน');
  });

  test('คนละชนิดแต่เลขท้ายเหมือนกัน ไม่ถือว่าซ้ำ', () => {
    const merged = mergeLeaderDocuments(
      [legacyDoc({ kind: 'health', number: 'HL-4567' })],
      [record('passport', { fields: { passportNo: 'AA1234567' } })],
    );
    assert.equal(merged.length, 2);
  });

  test('เลขสั้นเกินไป/ไม่มีเลข — เก็บรายการเดิมไว้เสมอ ดีกว่าตัดผิด', () => {
    const merged = mergeLeaderDocuments(
      [legacyDoc({ number: '' }), legacyDoc({ id: 'LEGACY-3', number: 'AB' })],
      [record('tour_card', { fields: { number: '' } })],
    );
    assert.equal(merged.filter((d) => d.id.startsWith('LEGACY')).length, 2);
  });

  test('เอกสารหลายใบใน store แสดงครบทุกใบ', () => {
    const merged = mergeLeaderDocuments([], [
      record('visa', { docId: 'VS-1', fields: { number: 'V001' } }),
      record('visa', { docId: 'VS-2', fields: { number: 'V002' } }),
      record('passport', { docId: 'PP-1', fields: { passportNo: 'AA1111111' } }),
    ]);
    assert.equal(merged.length, 3);
    assert.deepEqual(merged.map((d) => d.id), ['VS-1', 'VS-2', 'PP-1']);
  });
});

/* --------------------- หนังสือเดินทางจากไฟล์นำเข้าต้นทาง --------------------- */

describe('masterPassportToRecord — แปลงข้อมูลนำเข้าเป็นเอกสารเสมือน', () => {
  test('มีวันหมดอายุ → ได้เอกสารชนิด passport ที่พร้อมใช้ตรวจความพร้อม', () => {
    const rec = masterPassportToRecord('TL-000009', '2029-01-31');

    assert.ok(rec);
    assert.equal(rec.kind, 'passport');
    assert.equal(rec.tourLeaderId, 'TL-000009');
    assert.equal(rec.fields.expiryDate, '2029-01-31');
    assert.equal(rec.status, 'CONFIRMED', 'ข้อมูลนำเข้าถือว่ายืนยันแล้ว ไม่ใช่ฉบับร่าง');
    assert.equal(rec.lifecycle, 'ACTIVE');
  });

  test('ไม่มีวันหมดอายุ → ไม่สร้างเอกสารเสมือน (ไม่เดาข้อมูล)', () => {
    assert.equal(masterPassportToRecord('TL-000009', null), null);
    assert.equal(masterPassportToRecord('TL-000009', ''), null);
  });

  test('ไม่ใส่เลขหนังสือเดินทาง — เปิดเผยได้เฉพาะวันหมดอายุ', () => {
    const rec = masterPassportToRecord('TL-000009', '2029-01-31')!;
    assert.equal(rec.fields.passportNo, '');
  });

  test('ไม่ใช่เล่มหลัก — เล่มที่บันทึกในระบบต้องชนะเสมอ', () => {
    assert.equal(masterPassportToRecord('TL-000009', '2029-01-31')!.isPrimary, false);
  });

  test('รหัสแยกออกได้ว่ามาจากไฟล์นำเข้า (แก้ไขในระบบไม่ได้)', () => {
    const rec = masterPassportToRecord('TL-000009', '2029-01-31')!;
    assert.equal(isMasterDocumentId(rec.docId), true);
    assert.equal(isMasterDocumentId('PPBOOK-abc'), false);
  });
});
