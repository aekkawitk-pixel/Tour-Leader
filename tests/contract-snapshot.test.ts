/**
 * เทสต์ Contract Snapshot — "ภาพ ณ วันเซ็น" ของสัญญาจ้างรายกรุ๊ป
 *
 * ครอบคลุม:
 *   • ชื่ออังกฤษยึดตามหน้าหนังสือเดินทางก่อน ถ้าไม่มีเล่มจึงใช้ชื่อในระบบ
 *   • เลขหนังสือเดินทางในสัญญาต้องเป็นเลขที่ปิดบังแล้ว (ห้ามเก็บเลขเต็ม)
 *   • ตัดเวลาออกจากวันที่ให้เหลือเฉพาะวัน
 *   • ตรวจได้ว่าข้อมูลปัจจุบันเปลี่ยนไปจากตอนเซ็นตรงไหน
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPartySnapshot,
  buildPeriodSnapshot,
  diffPartySnapshot,
} from '@/lib/logic/contractSnapshot';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import type { TourLeader } from '@/types';

/* --------------------------------- ตัวช่วย --------------------------------- */

const leader = {
  id: 'TL-000001',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  firstNameEn: 'SOMCHAI',
  lastNameEn: 'JAIDEE',
} as unknown as TourLeader;

function passportRecord(fields: Record<string, string>, docId = 'PPBOOK-abc'): AnyLeaderDocumentRecord {
  return {
    docId,
    tourLeaderId: 'TL-000001',
    kind: 'passport',
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
  };
}

/* ------------------------------ ข้อมูลคู่สัญญา ------------------------------ */

describe('buildPartySnapshot — ข้อมูลคู่สัญญา ณ วันเซ็น', () => {
  test('ใช้ชื่ออังกฤษตามหน้าหนังสือเดินทางก่อนเสมอ', () => {
    const snap = buildPartySnapshot(leader, passportRecord({
      firstName: 'SOMCHAI', lastName: 'JAIDEE-SMITH', passportNo: 'AA1234567', expiryDate: '2030-01-01',
    }));
    assert.equal(snap.leaderNameEn, 'SOMCHAI JAIDEE-SMITH', 'ชื่อบนเล่มต้องชนะชื่อในระบบ');
  });

  test('ไม่มีเล่มในระบบ → ใช้ชื่ออังกฤษในระบบแทน และไม่มีเลขหนังสือเดินทาง', () => {
    const snap = buildPartySnapshot(leader, null);
    assert.equal(snap.leaderNameEn, 'SOMCHAI JAIDEE');
    assert.equal(snap.passportDocId, null);
    assert.equal(snap.passportNoMasked, '');
    assert.equal(snap.passportExpiresAt, null);
  });

  test('เล่มมีอยู่แต่ชื่อบนเล่มว่าง → ถอยไปใช้ชื่อในระบบ ไม่ปล่อยให้ชื่อว่าง', () => {
    const snap = buildPartySnapshot(leader, passportRecord({ firstName: '', lastName: '', passportNo: 'AA1234567' }));
    assert.equal(snap.leaderNameEn, 'SOMCHAI JAIDEE');
  });

  test('เลขหนังสือเดินทางถูกปิดบัง — ห้ามเก็บเลขเต็มลงสัญญา', () => {
    const snap = buildPartySnapshot(leader, passportRecord({ passportNo: 'AA1234567' }));
    assert.ok(!snap.passportNoMasked.includes('AA1234'), 'ห้ามมีเลขเต็ม');
    assert.ok(snap.passportNoMasked.endsWith('4567'));
  });

  test('ชื่อไทยประกอบจากชื่อ-นามสกุลในระบบ', () => {
    assert.equal(buildPartySnapshot(leader, null).leaderNameTh, 'สมชาย ใจดี');
  });

  test('บันทึกเล่มที่ใช้ยืนยันตัวตนไว้ด้วย (ไว้เทียบภายหลังว่าเปลี่ยนเล่มหรือยัง)', () => {
    const snap = buildPartySnapshot(leader, passportRecord({ passportNo: 'AA1234567' }, 'PPBOOK-xyz'));
    assert.equal(snap.passportDocId, 'PPBOOK-xyz');
  });
});

/* -------------------------------- ข้อมูลกรุ๊ป -------------------------------- */

describe('buildPeriodSnapshot — ข้อมูลกรุ๊ป ณ วันเซ็น', () => {
  test('ตัดเวลาออกจาก ISO datetime ให้เหลือเฉพาะวันที่', () => {
    const snap = buildPeriodSnapshot({
      groupCode: 'CKG-260805A-HU',
      startDateTime: '2026-08-05T06:30:00.000Z',
      endDateTime: '2026-08-09T22:15:00.000Z',
      route: 'CKG',
    }, 'จีน');

    assert.equal(snap.startDate, '2026-08-05');
    assert.equal(snap.endDate, '2026-08-09');
  });

  test('พีเรียดที่ไม่มีวันเวลา → เก็บเป็น null ไม่ใช่ค่าว่าง', () => {
    const snap = buildPeriodSnapshot({
      groupCode: 'X', startDateTime: null, endDateTime: null, route: null,
    }, 'ไม่ระบุ');

    assert.equal(snap.startDate, null);
    assert.equal(snap.endDate, null);
    assert.equal(snap.route, null);
  });

  test('เก็บรหัสกรุ๊ปและชื่อประเทศตามที่ผู้เรียกแปลงมาแล้ว', () => {
    const snap = buildPeriodSnapshot({
      groupCode: 'HKG-260901A', startDateTime: null, endDateTime: null, route: ' HKG ',
    }, 'ฮ่องกง');

    assert.equal(snap.groupCode, 'HKG-260901A');
    assert.equal(snap.countryName, 'ฮ่องกง');
    assert.equal(snap.route, 'HKG', 'ตัดช่องว่างหัวท้าย');
  });
});

/* ------------------------- เทียบกับข้อมูลปัจจุบัน ------------------------- */

describe('diffPartySnapshot — ตรวจว่าข้อมูลเปลี่ยนไปจากตอนเซ็นหรือไม่', () => {
  const atSigning = buildPartySnapshot(leader, passportRecord({
    firstName: 'SOMCHAI', lastName: 'JAIDEE', passportNo: 'AA1234567', expiryDate: '2030-01-01',
  }, 'PPBOOK-old'));

  test('ข้อมูลยังเหมือนเดิม → ไม่มีคำเตือน', () => {
    assert.deepEqual(diffPartySnapshot(atSigning, atSigning), []);
  });

  test('ต่อเล่มใหม่ → เตือนทั้งเรื่องเล่มและเลขที่', () => {
    const now = buildPartySnapshot(leader, passportRecord({
      firstName: 'SOMCHAI', lastName: 'JAIDEE', passportNo: 'BB9998887', expiryDate: '2035-01-01',
    }, 'PPBOOK-new'));

    const diffs = diffPartySnapshot(atSigning, now);
    assert.equal(diffs.length, 2);
    assert.ok(diffs.some((d) => d.includes('ไม่ใช่เล่มเดิม')));
    assert.ok(diffs.some((d) => d.includes('เลขหนังสือเดินทางเปลี่ยน')));
  });

  test('เปลี่ยนนามสกุล (เช่น แต่งงาน) → เตือนเรื่องชื่อ', () => {
    const now = buildPartySnapshot(leader, passportRecord({
      firstName: 'SOMCHAI', lastName: 'SMITH', passportNo: 'AA1234567', expiryDate: '2030-01-01',
    }, 'PPBOOK-old'));

    const diffs = diffPartySnapshot(atSigning, now);
    assert.equal(diffs.length, 1);
    assert.ok(diffs[0].includes('ชื่อภาษาอังกฤษเปลี่ยน'));
  });
});
