/**
 * คอลัมน์ "โซน / ประเทศ / เส้นทาง" ในหน้ารายชื่อ
 *
 * ต้นเหตุเดิม: คอลัมน์อ่านจาก leader.routeSkills (ฟิลด์ประวัติการนำทัวร์เดิม) ซึ่งไม่มีอะไร
 * เขียนแล้ว ขณะที่ฟอร์มบันทึกลง Expertise Scope Store คนละที่ → คอลัมน์ว่างเสมอ
 *
 * เทสต์นี้ล็อกการแปลง Scope → บรรทัดแสดงผล โซน → ประเทศ → เส้นทาง
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { expertiseLines, EXPERTISE_EMPTY_TEXT } from '@/lib/logic/expertiseSummary';
import { emptyScope, type ExpertiseScope } from '@/lib/logic/expertiseScope';
import type { Country } from '@/types';

const country = (alpha2: string, nameEn: string, nameTh: string): Country =>
  ({ id: `C-${alpha2}`, code: alpha2, alpha2, alpha3: `${alpha2}X`, nameEn, nameTh,
    region: 'เอเชีย', subregion: 'เอเชียตะวันออก', isActive: true } as Country);

const COUNTRIES: Country[] = [
  country('JP', 'JAPAN', 'ญี่ปุ่น'),
  country('KR', 'SOUTH KOREA', 'เกาหลีใต้'),
  country('GE', 'GEORGIA', 'จอร์เจีย'),
  country('IT', 'ITALY', 'อิตาลี'),
];

const scope = (over: Partial<ExpertiseScope> & { id: string }): ExpertiseScope =>
  ({ ...emptyScope(), ...over });

describe('โซน / ประเทศ / เส้นทาง — แปลง Expertise Scope เป็นบรรทัดแสดงผล', () => {
  test('ไม่มีข้อมูล → ไม่มีบรรทัด (ให้ UI ขึ้นข้อความว่าง)', () => {
    assert.deepEqual(expertiseLines([], COUNTRIES), []);
    assert.equal(EXPERTISE_EMPTY_TEXT, 'ยังไม่ระบุโซน ประเทศ หรือเส้นทาง');
  });

  test('โซน + ประเทศ + เส้นทางเจาะจง → "Asia · Japan" / "NRT, KIX" (เส้นทางหลักก่อน)', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific',
        routeScope: 'specific', routeCodes: ['KIX', 'NRT'], primaryRouteCodes: ['NRT'],
        isPrimaryCountry: true }),
    ], COUNTRIES);
    assert.equal(line.headline, 'Asia · JAPAN');
    assert.equal(line.detail, 'NRT, KIX');
    assert.equal(line.isPrimary, true);
  });

  test('เลือกเฉพาะโซน (ทุกประเทศ + ทุกเส้นทาง) → "ทุกประเทศ / ทุกเส้นทาง"', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', zoneId: 'Z-EUROPE', countryId: null,
        countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(line.headline, 'Europe');
    assert.equal(line.detail, 'ทุกประเทศ / ทุกเส้นทาง');
  });

  test('เลือกเฉพาะโซน แต่เส้นทางเจาะจง → "ทุกประเทศ"', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', zoneId: 'Z-SCANDINAVIA', countryId: null,
        countryScope: 'all_zone_countries', routeScope: 'specific', routeCodes: ['CPH'] }),
    ], COUNTRIES);
    assert.equal(line.headline, 'Scandinavia');
    assert.equal(line.detail, 'ทุกประเทศ');
  });

  test('เลือกประเทศโดยไม่เลือกโซน → แสดงชื่อประเทศอย่างเดียว', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', zoneId: null, countryId: 'C-GE', countryScope: 'specific',
        routeScope: 'all_routes', isPrimaryCountry: true }),
    ], COUNTRIES);
    assert.equal(line.headline, 'GEORGIA');
    assert.equal(line.detail, 'ทุกเส้นทาง');
    assert.equal(line.isPrimary, true);
  });

  test('ไม่ได้เลือกเส้นทางเลย → ไม่มีบรรทัดที่สอง', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', zoneId: 'Z-ASIA', countryId: 'C-KR', countryScope: 'specific',
        routeScope: 'specific', routeCodes: [] }),
    ], COUNTRIES);
    assert.equal(line.headline, 'Asia · SOUTH KOREA');
    assert.equal(line.detail, null);
  });

  test('รหัสเส้นทางเป็นตัวพิมพ์ใหญ่เสมอ', () => {
    const [line] = expertiseLines([
      scope({ id: 'E1', countryId: 'C-KR', countryScope: 'specific',
        routeScope: 'specific', routeCodes: ['icn'] }),
    ], COUNTRIES);
    assert.equal(line.detail, 'ICN');
  });

  test('รายการหลักเรียงขึ้นก่อน แม้ displayOrder จะอยู่หลัง', () => {
    const lines = expertiseLines([
      scope({ id: 'E1', displayOrder: 0, zoneId: 'Z-EUROPE', countryId: 'C-IT', countryScope: 'specific' }),
      scope({ id: 'E2', displayOrder: 9, zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific',
        isPrimaryCountry: true }),
    ], COUNTRIES);
    assert.deepEqual(lines.map((l) => l.headline), ['Asia · JAPAN', 'Europe · ITALY']);
  });

  test('หลายโซน/หลายประเทศ → คงทุกบรรทัดไว้ (UI เป็นคนตัดเหลือ 2 + "+N รายการ")', () => {
    const lines = expertiseLines([
      scope({ id: 'E1', displayOrder: 0, zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific' }),
      scope({ id: 'E2', displayOrder: 1, zoneId: 'Z-ASIA', countryId: 'C-KR', countryScope: 'specific' }),
      scope({ id: 'E3', displayOrder: 2, zoneId: 'Z-EUROPE', countryId: 'C-IT', countryScope: 'specific' }),
    ], COUNTRIES);
    assert.equal(lines.length, 3);
  });

  test('รายการที่ไม่มีทั้งโซนและประเทศ → ข้ามไป ไม่สร้างบรรทัดว่าง', () => {
    assert.deepEqual(expertiseLines([scope({ id: 'E1', zoneId: null, countryId: null })], COUNTRIES), []);
  });

  test('ประเทศที่ไม่มีใน Country Master → ไม่พัง (ข้ามรายการนั้น)', () => {
    const lines = expertiseLines([
      scope({ id: 'E1', zoneId: null, countryId: 'C-ZZ', countryScope: 'specific' }),
      scope({ id: 'E2', displayOrder: 1, countryId: 'C-IT', countryScope: 'specific' }),
    ], COUNTRIES);
    assert.deepEqual(lines.map((l) => l.headline), ['ITALY']);
  });
});
