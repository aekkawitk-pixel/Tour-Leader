/**
 * Tour Leader Master — นำเข้าจริงจากไฟล์ + normalize + dedup + passport + mask + validate
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TOUR_LEADER_PROFILES, TOUR_LEADER_IDENTITIES, TOUR_LEADER_IMPORT_META } from '@/data/leaders/tourLeaderMaster.seed';
import { profileToTourLeader } from '@/data/leaders/adapter';
import {
  displayNameOf, passportStatus, maskPassport, maskPersonalId, validateProfile,
} from '@/lib/logic/tourLeaderMaster';
import {
  getTourLeaderProfiles, getTourLeaderById, getIdentityDocument, getPassportExpiry, getPassportWarnings, getImportMeta,
} from '@/services/tourLeaderMaster';

const TODAY = '2026-07-13';

describe('Tour Leader Master — นำเข้าจริง (§1/§2/§20)', () => {
  test('352 รายการ · tourLeaderId (PK) ไม่ซ้ำ · แยก Profile/Identity ตรงกัน', () => {
    assert.equal(TOUR_LEADER_PROFILES.length, 352);
    assert.equal(TOUR_LEADER_IDENTITIES.length, 352);
    assert.equal(new Set(TOUR_LEADER_PROFILES.map((p) => p.tourLeaderId)).size, 352);
    assert.match(TOUR_LEADER_PROFILES[0].tourLeaderId, /^TL-\d{6}$/);
    // ทุก identity มี profile คู่กัน
    const ids = new Set(TOUR_LEADER_PROFILES.map((p) => p.tourLeaderId));
    for (const d of TOUR_LEADER_IDENTITIES) assert.ok(ids.has(d.tourLeaderId));
  });

  test('§1 ห้ามใช้ passportNo/personalID เป็น PK — เก็บใน Identity แยก · Profile ไม่มี passport', () => {
    for (const p of TOUR_LEADER_PROFILES.slice(0, 20)) {
      assert.ok(!('passportNo' in p));
      assert.ok(!('dateOfBirth' in p));
    }
  });

  test('§5 วันที่ ISO · §6 เบอร์เป็น String เก็บเลข 0 หน้า', () => {
    for (const d of TOUR_LEADER_IDENTITIES) {
      if (d.passportExpiryDate) assert.match(d.passportExpiryDate, /^\d{4}-\d{2}-\d{2}$/);
      if (d.dateOfBirth) assert.match(d.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
    }
    const withPhone = TOUR_LEADER_PROFILES.find((p) => p.contactNumberNormalized);
    assert.equal(typeof withPhone?.contactNumberNormalized, 'string');
    assert.ok(withPhone!.contactNumberNormalized!.startsWith('0')); // คงเลข 0 หน้า
  });

  test('§4 displayName: nickName ?? firstNameTH ?? firstNameEN · ไม่สร้างชื่อเล่นอัตโนมัติ', () => {
    // ส่วนใหญ่ไม่มีชื่อเล่น → ใช้ชื่อไทย
    const noNick = TOUR_LEADER_PROFILES.filter((p) => p.nickName === null);
    assert.ok(noNick.length > 100);
    for (const p of noNick.slice(0, 30)) assert.equal(displayNameOf(p), p.firstNameTH ?? p.firstNameEN ?? 'ไม่ระบุชื่อ');
    assert.equal(displayNameOf({ nickName: 'ฟิล์ม', firstNameTH: 'x', firstNameEN: 'y' }), 'ฟิล์ม');
    assert.equal(displayNameOf({ nickName: null, firstNameTH: null, firstNameEN: null }), 'ไม่ระบุชื่อ');
  });

  test('§7 Import Report: 0 exact dup · มี possible-duplicate → WARNING · 0 invalid', () => {
    const m = TOUR_LEADER_IMPORT_META;
    assert.equal(m.imported, 352);
    assert.equal(m.exactDuplicates, 0);
    assert.ok(m.possibleDuplicates > 0);
    assert.equal(m.invalid, 0);
    // possible duplicate ต้องมีสถานะ validation = WARNING
    for (const p of TOUR_LEADER_PROFILES.filter((x) => x.duplicateStatus === 'POSSIBLE_DUPLICATE')) {
      assert.equal(p.validationStatus, 'WARNING');
    }
  });
});

describe('Tour Leader Master — Passport (§15) + Mask (§8)', () => {
  test('passportStatus 6 ระดับ (§5)', () => {
    assert.equal(passportStatus(null, TODAY), 'UNKNOWN');
    assert.equal(passportStatus('2026-07-12', TODAY), 'EXPIRED');
    assert.equal(passportStatus('2026-08-01', TODAY), 'EXPIRING_WITHIN_30_DAYS');
    assert.equal(passportStatus('2026-09-15', TODAY), 'EXPIRING_WITHIN_90_DAYS');
    assert.equal(passportStatus('2026-12-01', TODAY), 'EXPIRING_WITHIN_180_DAYS');
    assert.equal(passportStatus('2030-01-01', TODAY), 'VALID');
  });

  test('mask เลขหนังสือเดินทาง/บัตรประชาชน', () => {
    assert.equal(maskPassport('AC1221695'), 'AC*****95');
    assert.equal(maskPassport(null), '-');
    // เก็บหลักสุดท้าย + คงเครื่องหมายคั่น
    const masked = maskPersonalId('1-2345-67890-12-3');
    assert.ok(masked.endsWith('3'));
    assert.ok(!/\d/.test(masked.slice(0, -1))); // ตัวเลขอื่นถูกปิด
  });

  test('validateProfile — INVALID เมื่อไม่มีชื่อเลย / dob อนาคต', () => {
    const base = TOUR_LEADER_PROFILES[0];
    const id0 = TOUR_LEADER_IDENTITIES[0];
    assert.equal(validateProfile({ ...base, firstNameTH: null, lastNameTH: null, firstNameEN: null, lastNameEN: null }, id0, TODAY).status, 'INVALID');
    assert.equal(validateProfile(base, { ...id0, dateOfBirth: '2999-01-01' }, TODAY).status, 'INVALID');
  });
});

describe('Tour Leader Master Service (§14) + Adapter', () => {
  test('getTourLeaderProfiles + ค้นหา (ชื่อไทย/อังกฤษ/ชื่อเล่น/เบอร์)', () => {
    assert.equal(getTourLeaderProfiles().length, 352);
    const one = TOUR_LEADER_PROFILES[0];
    assert.ok(getTourLeaderProfiles({ search: one.firstNameTH ?? '' }).some((p) => p.tourLeaderId === one.tourLeaderId));
    if (one.contactNumberNormalized) assert.ok(getTourLeaderProfiles({ search: one.contactNumberNormalized }).length >= 1);
    assert.ok(getTourLeaderProfiles({ validationStatus: 'WARNING' }).every((p) => p.validationStatus === 'WARNING'));
  });

  test('getTourLeaderById + getIdentityDocument ตรวจสิทธิ์ (§8/§9)', () => {
    const one = TOUR_LEADER_PROFILES[0];
    assert.equal(getTourLeaderById(one.tourLeaderId)?.tourLeaderId, one.tourLeaderId);
    assert.equal(getIdentityDocument(one.tourLeaderId, false), null); // ไม่มีสิทธิ์ → null
    assert.ok(getIdentityDocument(one.tourLeaderId, true)); // มีสิทธิ์ → ได้เอกสาร
    assert.equal(getPassportExpiry(one.tourLeaderId), TOUR_LEADER_IDENTITIES[0].passportExpiryDate);
  });

  test('adapter: profile → TourLeader อ้างอิงด้วย tourLeaderId · ไม่มี passport/ประสบการณ์ (§2/§13)', () => {
    const tl = profileToTourLeader(TOUR_LEADER_PROFILES[0], 0);
    assert.equal(tl.id, TOUR_LEADER_PROFILES[0].tourLeaderId);
    assert.equal(tl.birthDate, ''); // วันเกิดจริงอยู่ใน Identity เท่านั้น
    assert.deepEqual(tl.languages, []);
    assert.deepEqual(tl.documents, []);
    assert.deepEqual(tl.tourSkills, []);
  });

  test('getPassportWarnings + getImportMeta', () => {
    const w = getPassportWarnings(TODAY);
    assert.ok(w.expired >= 0 && w.within30 >= 0 && w.within90 >= 0);
    assert.equal(getImportMeta().sourceFileName, 'tour-leader-name.xlsx');
  });
});
