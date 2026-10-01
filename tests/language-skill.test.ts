/**
 * เทสต์ตรรกะ "ทักษะด้านภาษา" — migration (มาตรฐานตามภาษา), มุมมองย่อ, ตัวกรองระดับขั้นต่ำ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { migrateLanguageSkill } from '@/modules/tour-leaders/languageMigration';
import { hasLanguageAtLeast, languageSummaryShort, orderedLanguages } from '@/lib/logic/leaderProfile';
import { levelsForStandard, maxRankOf } from '@/data/leaders/languageStandards';
import type { LanguageSkill, TourLeader } from '@/types';

/* -------------------------------- ตัวช่วย -------------------------------- */

const skill = (over: Partial<LanguageSkill> & { id: string; languageName: string }): LanguageSkill => ({
  languageCode: over.languageName,
  isNativeLanguage: false,
  standard: 'GENERAL',
  levelCode: 'G3',
  levelName: 'ปานกลาง',
  levelRank: 3,
  ...over,
});

const leaderWith = (languages: LanguageSkill[]) => ({ languages }) as TourLeader;

/* ------------------------------- Migration ------------------------------- */

describe('migrateLanguageSkill — มาตรฐานตามภาษา', () => {
  test('ภาษาที่มีมาตรฐานเฉพาะ ได้ standard ที่ถูกต้องตามภาษา', () => {
    assert.equal(migrateLanguageSkill({ id: 'L1', language: 'อังกฤษ', overall: 'b2' }).standard, 'CEFR');
    assert.equal(migrateLanguageSkill({ id: 'L2', language: 'จีนกลาง', overall: 'b2' }).standard, 'HSK');
    assert.equal(migrateLanguageSkill({ id: 'L3', language: 'ญี่ปุ่น', overall: 'b2' }).standard, 'JLPT');
    assert.equal(migrateLanguageSkill({ id: 'L4', language: 'เกาหลี', overall: 'b2' }).standard, 'TOPIK');
  });

  test('ภาษาที่ไม่มีมาตรฐานเฉพาะ (หรือไม่รู้จัก) ตกไปมาตรฐานทั่วไป', () => {
    assert.equal(migrateLanguageSkill({ id: 'L5', language: 'ลาว', overall: 'b1' }).standard, 'GENERAL');
    assert.equal(migrateLanguageSkill({ id: 'L6', language: 'ภาษาที่ไม่มีในระบบ', overall: 'b1' }).standard, 'GENERAL');
  });

  test('แปลงระดับ CEFR เดิม → เทียบสัดส่วนไปยังมาตรฐานที่ถูกต้องของภาษานั้น', () => {
    // 'c2' = อันดับ CEFR สูงสุด (6/6) → ควรได้อันดับสูงสุดของมาตรฐานปลายทางด้วย
    const jlpt = migrateLanguageSkill({ id: 'L7', language: 'ญี่ปุ่น', overall: 'c2' });
    assert.equal(jlpt.levelCode, 'N1'); // อันดับสูงสุดของ JLPT
    assert.equal(jlpt.levelRank, maxRankOf('JLPT'));

    // 'a1' = อันดับ CEFR ต่ำสุด (1/6) → เทียบสัดส่วนไปยัง HSK (9 อันดับ): round((1/6)*9) = 2
    const hsk = migrateLanguageSkill({ id: 'L8', language: 'จีนกลาง', overall: 'a1' });
    assert.equal(hsk.levelCode, 'HSK2');
    assert.equal(hsk.levelRank, 2);
  });

  test('แปลงสเกล 6 ขั้นเดิม (basic/working/…) ได้เช่นกัน', () => {
    const migrated = migrateLanguageSkill({ id: 'L9', language: 'อังกฤษ', overall: 'working' });
    assert.equal(migrated.standard, 'CEFR');
    assert.equal(migrated.levelCode, 'B2'); // working → b2 (อันดับ 4/6) → CEFR อันดับ 4 = B2
  });

  test('ภาษาแม่ไม่มีระดับ (levelCode/levelName/levelRank เป็น null)', () => {
    const migrated = migrateLanguageSkill({ id: 'L10', language: 'เกาหลี', overall: 'native' });
    assert.equal(migrated.isNativeLanguage, true);
    assert.equal(migrated.levelCode, null);
    assert.equal(migrated.levelName, null);
    assert.equal(migrated.levelRank, null);
  });

  test('ไม่ทำข้อมูลเดิมหาย (ชื่อภาษายังอยู่)', () => {
    const migrated = migrateLanguageSkill({ id: 'L11', language: 'เกาหลี', overall: 'b1' });
    assert.equal(migrated.languageName, 'เกาหลี');
    assert.equal(migrated.id, 'L11');
  });

  test('ข้อมูลรุ่นปัจจุบัน (มี levelCode ของมาตรฐานถูกต้องอยู่แล้ว) ผ่านตรง ๆ ไม่แปลงซ้ำ', () => {
    const migrated = migrateLanguageSkill({
      id: 'L12',
      languageCode: 'JA',
      languageName: 'ญี่ปุ่น',
      isNativeLanguage: false,
      standard: 'JLPT',
      levelCode: 'N2',
      levelName: 'ใช้งานได้ดี',
      levelRank: 4,
    });
    assert.equal(migrated.levelCode, 'N2');
    assert.equal(migrated.levelRank, 4);
  });
});

/* ------------------------------ มุมมองย่อ -------------------------------- */

describe('languageSummaryShort / orderedLanguages', () => {
  test('เรียงภาษาแม่ก่อน + แสดงรหัสระดับ', () => {
    const leader = leaderWith([
      skill({ id: 'a', languageName: 'จีนกลาง', standard: 'HSK', levelCode: 'HSK2', levelName: 'ระดับพื้นฐาน', levelRank: 2 }),
      skill({ id: 'b', languageName: 'อังกฤษ', isNativeLanguage: true, levelCode: null, levelName: null, levelRank: null }),
    ]);
    // ภาษาแม่ (อังกฤษ) ต้องขึ้นก่อนเสมอ ไม่ว่าระดับของภาษาอื่นจะสูงแค่ไหน
    assert.equal(languageSummaryShort(leader), 'อังกฤษ ภาษาแม่ · จีนกลาง HSK2');
  });

  test('เกิน 2 ภาษา → +N ภาษา', () => {
    const leader = leaderWith([
      skill({ id: 'a', languageName: 'อังกฤษ', standard: 'CEFR', levelCode: 'B2', levelName: 'ใช้งานได้ดี', levelRank: 4 }),
      skill({ id: 'b', languageName: 'จีนกลาง', standard: 'HSK', levelCode: 'HSK2', levelName: 'ระดับพื้นฐาน', levelRank: 2 }),
      skill({ id: 'c', languageName: 'ญี่ปุ่น', standard: 'JLPT', levelCode: 'N3', levelName: 'ระดับกลาง', levelRank: 3 }),
      skill({ id: 'd', languageName: 'เกาหลี', standard: 'TOPIK', levelCode: 'LEVEL1', levelName: 'ระดับเริ่มต้น', levelRank: 1 }),
    ]);
    // เรียงตามสัดส่วนอันดับของมาตรฐานตัวเอง สูง→ต่ำ: อังกฤษ(4/6=.67) → ญี่ปุ่น(3/5=.6) → …
    assert.equal(languageSummaryShort(leader), 'อังกฤษ B2 · ญี่ปุ่น N3 · +2 ภาษา');
  });

  test('ไม่มีภาษา → ค่าว่าง', () => {
    assert.equal(languageSummaryShort(leaderWith([])), '');
  });

  test('orderedLanguages เรียงภาษาแม่ก่อน แล้วสัดส่วนระดับสูง→ต่ำ', () => {
    const leader = leaderWith([
      skill({ id: 'a', languageName: 'A', standard: 'CEFR', levelCode: 'A2', levelName: '-', levelRank: 2 }),
      skill({ id: 'b', languageName: 'B', standard: 'CEFR', levelCode: 'C1', levelName: '-', levelRank: 5 }),
      skill({ id: 'c', languageName: 'C', isNativeLanguage: true, levelCode: null, levelName: null, levelRank: null }),
    ]);
    assert.deepEqual(
      orderedLanguages(leader).map((l) => l.id),
      ['c', 'b', 'a'],
    );
  });
});

/* ---------------------------- ตัวกรองระดับขั้นต่ำ ---------------------------- */

describe('hasLanguageAtLeast', () => {
  const leader = leaderWith([
    skill({ id: 'a', languageName: 'ญี่ปุ่น', standard: 'JLPT', levelCode: 'N2', levelName: 'ใช้งานได้ดี', levelRank: 4 }),
    skill({ id: 'b', languageName: 'ไทย', isNativeLanguage: true, levelCode: null, levelName: null, levelRank: null }),
  ]);

  test('ผ่านเมื่อระดับ ≥ ที่กำหนด (ตีความรหัสระดับตามมาตรฐานของภาษานั้น)', () => {
    assert.equal(hasLanguageAtLeast(leader, 'ญี่ปุ่น', 'N3'), true); // N2 (rank4) >= N3 (rank3)
    assert.equal(hasLanguageAtLeast(leader, 'ญี่ปุ่น', 'N1'), false); // N2 (rank4) < N1 (rank5)
    assert.equal(hasLanguageAtLeast(leader, 'ญี่ปุ่น', null), true); // ไม่กรอง
    assert.equal(hasLanguageAtLeast(leader, 'จีนกลาง', 'HSK1'), false); // ไม่มีภาษานี้เลย
  });

  test('ภาษาแม่ผ่านทุกระดับที่กำหนด', () => {
    assert.equal(hasLanguageAtLeast(leader, 'ไทย', 'G6'), true);
  });
});

/* -------------------------- มาตรฐานระดับภาษา -------------------------- */

describe('ตารางระดับของแต่ละมาตรฐาน', () => {
  test('ทุกมาตรฐานเรียงอันดับจากน้อยไปมาก เริ่มที่ 1 ไม่มีช่องว่าง', () => {
    for (const std of ['CEFR', 'HSK', 'JLPT', 'TOPIK', 'GENERAL'] as const) {
      const levels = levelsForStandard(std);
      assert.ok(levels.length > 0);
      levels.forEach((l, i) => assert.equal(l.rank, i + 1));
      assert.equal(maxRankOf(std), levels[levels.length - 1].rank);
    }
  });
});
