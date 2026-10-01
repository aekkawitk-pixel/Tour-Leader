import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_EXPERTISE_TYPES, normalizeGroupExpertise, toggleGroupExpertise,
  isAllGroups, groupExpertiseCountLabel, matchesGroupType,
  SPECIFIC_GROUP_CODES,
} from '../src/lib/logic/groupExpertise';

describe('§8 Master group_expertise_types', () => {
  test('มีครบทุกประเภทตามลำดับที่แสดงบนหน้าจอ', () => {
    assert.deepEqual(GROUP_EXPERTISE_TYPES.map((t) => t.code), [
      'ALL', 'RETAIL', 'PRIVATE', 'SALES', 'VIP', 'ENTERTAIN', 'HISTORY',
    ]);
  });

  test('ทุกประเภทมีชื่อและคำอธิบาย', () => {
    for (const t of GROUP_EXPERTISE_TYPES) {
      assert.ok(t.nameTh.trim(), `${t.code} ไม่มีชื่อ`);
      assert.ok(t.descTh.trim(), `${t.code} ไม่มีคำอธิบาย`);
    }
  });

  /* ประเภทเฉพาะต้องอ่านจาก Master เสมอ — เพิ่มรายการใหม่แล้วตรรกะต้องนับตามทันที */
  test('ประเภทเฉพาะ = ทุกรายการที่ไม่ใช่ "ทุกประเภท"', () => {
    const expected = GROUP_EXPERTISE_TYPES.map((t) => t.code).filter((c) => c !== 'ALL');
    assert.deepEqual(SPECIFIC_GROUP_CODES, expected);
  });
});

describe('§3/§8 normalizeGroupExpertise — กันซ้ำ ALL', () => {
  test('ALL อยู่คนเดียวเสมอ (ตัด RETAIL/PRIVATE)', () => {
    assert.deepEqual(normalizeGroupExpertise(['ALL', 'RETAIL', 'PRIVATE']), ['ALL']);
    assert.deepEqual(normalizeGroupExpertise(['ALL']), ['ALL']);
  });
  test('เลือกครบทุกประเภทเฉพาะ → แปลงเป็น ALL', () => {
    assert.deepEqual(normalizeGroupExpertise([...SPECIFIC_GROUP_CODES]), ['ALL']);
  });
  test('เลือกไม่ครบ → คงไว้ตามที่เลือก (ไม่เหมาเป็นทุกประเภท)', () => {
    assert.deepEqual(normalizeGroupExpertise(['RETAIL', 'PRIVATE']), ['RETAIL', 'PRIVATE']);
  });
  test('เลือกเฉพาะอย่างเดียว → คงไว้', () => {
    assert.deepEqual(normalizeGroupExpertise(['RETAIL']), ['RETAIL']);
    assert.deepEqual(normalizeGroupExpertise(['PRIVATE']), ['PRIVATE']);
    assert.deepEqual(normalizeGroupExpertise([]), []);
  });
});

describe('§3 toggleGroupExpertise', () => {
  test('เลือก ALL → เฉพาะ ALL', () => {
    assert.deepEqual(toggleGroupExpertise([], 'ALL'), ['ALL']);
    assert.deepEqual(toggleGroupExpertise(['RETAIL'], 'ALL'), ['ALL']);
  });
  test('ยกเลิก ALL → ว่าง', () => {
    assert.deepEqual(toggleGroupExpertise(['ALL'], 'ALL'), []);
  });
  test('เลือกเฉพาะหลังเลือก ALL → ยกเลิก ALL แล้วเหลือเฉพาะ', () => {
    assert.deepEqual(toggleGroupExpertise(['ALL'], 'RETAIL'), ['RETAIL']);
  });
  test('เลือกทีละประเภทจนครบทุกประเภท → กลายเป็น ALL อัตโนมัติ', () => {
    const step1 = toggleGroupExpertise([], 'RETAIL');
    assert.deepEqual(step1, ['RETAIL']);
    const last = SPECIFIC_GROUP_CODES.reduce(
      (acc, code) => (code === 'RETAIL' ? acc : toggleGroupExpertise(acc, code)),
      step1,
    );
    assert.deepEqual(last, ['ALL']); // §3 ครบทุกประเภท → ทุกประเภท
  });
  test('เอา RETAIL ออกจาก [RETAIL, PRIVATE]-เทียบเท่า ALL → toggle ทำงานถูก', () => {
    // จาก ALL กด PRIVATE → เหลือ PRIVATE (ยกเลิก ALL)
    assert.deepEqual(toggleGroupExpertise(['ALL'], 'PRIVATE'), ['PRIVATE']);
  });
});

describe('§6 การแสดงผล', () => {
  test('isAllGroups', () => {
    assert.equal(isAllGroups(['ALL']), true);
    assert.equal(isAllGroups([...SPECIFIC_GROUP_CODES]), true); // ครบทุกประเภท → normalize เป็น ALL
    assert.equal(isAllGroups(['RETAIL', 'PRIVATE']), false); // ยังไม่ครบทุกประเภท
    assert.equal(isAllGroups(['RETAIL']), false);
  });
  test('countLabel: ALL → ครอบคลุมทุกประเภท · เฉพาะ → "N ประเภท"', () => {
    assert.equal(groupExpertiseCountLabel(['ALL']), `ครอบคลุม ${SPECIFIC_GROUP_CODES.length} ประเภท`);
    assert.equal(groupExpertiseCountLabel(['RETAIL']), '1 ประเภท');
    assert.equal(groupExpertiseCountLabel(['RETAIL', 'VIP']), '2 ประเภท');
    assert.equal(groupExpertiseCountLabel([]), 'ยังไม่ระบุ');
  });
});

describe('§7 matchesGroupType', () => {
  test('งาน RETAIL: RETAIL/ALL เหมาะ · PRIVATE ไม่ตรง', () => {
    assert.equal(matchesGroupType(['RETAIL'], 'RETAIL'), true);
    assert.equal(matchesGroupType(['ALL'], 'RETAIL'), true);
    assert.equal(matchesGroupType(['PRIVATE'], 'RETAIL'), false);
  });
  test('งาน PRIVATE: PRIVATE/ALL เหมาะ', () => {
    assert.equal(matchesGroupType(['PRIVATE'], 'PRIVATE'), true);
    assert.equal(matchesGroupType(['ALL'], 'PRIVATE'), true);
    assert.equal(matchesGroupType(['RETAIL'], 'PRIVATE'), false);
  });
  test('ไม่มีข้อมูล → null (ไม่ตัดออก)', () => {
    assert.equal(matchesGroupType([], 'RETAIL'), null);
    assert.equal(matchesGroupType([], 'PRIVATE'), null);
  });
});

/* ------------- รายการที่เพิ่มเข้ามาใหม่ ------------- */

describe('ประเภทที่ผู้ใช้กำหนดเพิ่ม — ใช้กติกาเดียวกับรายการเดิม', () => {
  test('เลือกประเภทใดก็ได้ เก็บตามที่เลือก', () => {
    assert.deepEqual(normalizeGroupExpertise(['VIP']), ['VIP']);
    assert.deepEqual(normalizeGroupExpertise(['SALES', 'HISTORY']), ['SALES', 'HISTORY']);
  });

  test('เรียงตามลำดับใน Master ไม่ใช่ตามลำดับที่กด', () => {
    assert.deepEqual(normalizeGroupExpertise(['HISTORY', 'RETAIL']), ['RETAIL', 'HISTORY']);
  });

  test('เลือกครบทุกประเภทเฉพาะ → กลายเป็นทุกประเภท', () => {
    assert.deepEqual(normalizeGroupExpertise([...SPECIFIC_GROUP_CODES]), ['ALL']);
  });

  test('เลือกประเภทใหม่หลังเลือกทุกประเภท → ยกเลิกทุกประเภท', () => {
    assert.deepEqual(toggleGroupExpertise(['ALL'], 'VIP'), ['VIP']);
  });
});
