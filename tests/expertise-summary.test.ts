import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildExpertiseSummary, expertiseSearchText } from '../src/lib/logic/expertiseSummary';
import { emptyScope, type ExpertiseScope } from '../src/lib/logic/expertiseScope';
import type { Country } from '../src/types';

const country = (alpha2: string, nameEn: string, nameTh: string): Country =>
  ({ id: `C-${alpha2}`, code: alpha2, alpha2, alpha3: alpha2 + 'X', nameEn, nameTh, region: '', subregion: '', isActive: true } as Country);

const COUNTRIES: Country[] = [
  country('JP', 'JAPAN', 'ญี่ปุ่น'),
  country('KR', 'SOUTH KOREA', 'เกาหลีใต้'),
  country('GE', 'GEORGIA', 'จอร์เจีย'),
  country('NO', 'NORWAY', 'นอร์เวย์'),
];

const mk = (over: Partial<ExpertiseScope> & { id: string }): ExpertiseScope => ({ ...emptyScope(), ...over });

describe('§4/§5 buildExpertiseSummary — displayText', () => {
  test('ตัวอย่าง 1: Asia[โซนหลัก] Japan[ประเทศหลัก] ทุกเส้นทาง → "Asia › JAPAN · ทุกเส้นทาง"', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes', isPrimaryZone: true, isPrimaryCountry: true }),
    ], COUNTRIES);
    assert.equal(s.displayText, 'Asia › JAPAN · ทุกเส้นทาง');
    assert.equal(s.primaryCountry?.nameEn, 'JAPAN');
    assert.equal(s.routeScope, 'all_routes');
  });

  test('ตัวอย่าง 2: Japan + NRT,KIX เส้นทางหลัก → "Asia › JAPAN · NRT, KIX"', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'], primaryRouteCodes: ['NRT', 'KIX'] }),
    ], COUNTRIES);
    assert.equal(s.displayText, 'Asia › JAPAN · NRT, KIX');
    assert.deepEqual(s.primaryRoutes.map((r) => r.code), ['NRT', 'KIX']);
  });

  test('ตัวอย่าง 3: Europe ทุกประเทศ ทุกเส้นทาง → "Europe · ทุกประเทศ · ทุกเส้นทาง"', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.displayText, 'Europe · ทุกประเทศ · ทุกเส้นทาง');
  });

  test('ตัวอย่าง 4: Georgia ทุกเส้นทาง (ไม่มีโซน) → "GEORGIA · ทุกเส้นทาง"', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: null, countryId: 'C-GE', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.displayText, 'GEORGIA · ทุกเส้นทาง');
  });

  test('ตัวอย่าง 5: Scandinavia Norway OSL,BGO → "Scandinavia › NORWAY · OSL, BGO"', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-SCANDINAVIA', countryId: 'C-NO', countryScope: 'specific', routeScope: 'specific', routeCodes: ['OSL', 'BGO'], primaryRouteCodes: ['OSL', 'BGO'] }),
    ], COUNTRIES);
    assert.equal(s.displayText, 'Scandinavia › NORWAY · OSL, BGO');
  });

  test('§6/§13.1 ไม่มีข้อมูล → "ยังไม่ระบุโซน ประเทศ หรือเส้นทาง"', () => {
    const s = buildExpertiseSummary([], COUNTRIES);
    assert.equal(s.hasData, false);
    assert.equal(s.displayText, 'ยังไม่ระบุโซน ประเทศ หรือเส้นทาง');
  });
});

describe('§5 ลำดับความสำคัญ headline', () => {
  test('ประเทศหลักถูกเลือกก่อนโซนหลัก (§13.3)', () => {
    const s = buildExpertiseSummary([
      mk({ id: 'z', zoneId: 'Z-ASIA', countryScope: 'all_zone_countries', routeScope: 'all_routes', isPrimaryZone: true }),
      mk({ id: 'c', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes', isPrimaryCountry: true }),
    ], COUNTRIES);
    assert.ok(s.displayText.startsWith('Asia › JAPAN'));
  });

  test('§6 มีหลายรายการ → ต่อท้าย +N', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'], primaryRouteCodes: ['NRT', 'KIX'] }),
      mk({ id: '2', zoneId: 'Z-ASIA', countryId: 'C-KR', countryScope: 'specific', routeScope: 'all_routes' }),
      mk({ id: '3', zoneId: null, countryId: 'C-GE', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.ok(s.displayText.endsWith('+2'), s.displayText);
    assert.ok(s.tooltipText.includes('Asia'));
    assert.ok(s.tooltipText.includes('SOUTH KOREA: ทุกเส้นทาง'));
  });
});

describe('§2/§3/§4 zoneLine + countryLine (3 บรรทัด)', () => {
  test('ตัวอย่าง 1: Asia / JAPAN (NRT, KIX)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'], isPrimaryZone: true, isPrimaryCountry: true, primaryRouteCodes: ['NRT', 'KIX'] }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, 'Asia');
    assert.equal(s.countryLine, 'JAPAN (NRT, KIX)');
  });

  test('ตัวอย่าง 2: Asia / JAPAN (ทุกเส้นทาง)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, 'Asia');
    assert.equal(s.countryLine, 'JAPAN (ทุกเส้นทาง)');
  });

  test('ตัวอย่าง 3: Europe / ทุกประเทศ (ทุกเส้นทาง)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, 'Europe');
    assert.equal(s.countryLine, 'ทุกประเทศ (ทุกเส้นทาง)');
  });

  test('ตัวอย่าง 4: Georgia ระบุตรง → ไม่มีบรรทัดโซน', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: null, countryId: 'C-GE', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, null);
    assert.equal(s.countryLine, 'GEORGIA (ทุกเส้นทาง)');
  });

  test('ตัวอย่าง 5: Scandinavia / NORWAY (ทุกเส้นทาง)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-SCANDINAVIA', countryId: 'C-NO', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, 'Scandinavia');
    assert.equal(s.countryLine, 'NORWAY (ทุกเส้นทาง)');
  });

  test('§2 หลายโซน → "Asia, Europe +1" (โซนหลักก่อน)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
      mk({ id: '2', zoneId: 'Z-SCANDINAVIA', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
      mk({ id: '3', zoneId: 'Z-ASIA', countryScope: 'all_zone_countries', routeScope: 'all_routes', isPrimaryZone: true }),
    ], COUNTRIES);
    assert.equal(s.zoneLine, 'Asia, Europe +1'); // Asia (หลัก) ก่อน · แล้ว Europe (insertion แรก) · Scandinavia = +1
    assert.ok(s.zoneTooltip.includes('Scandinavia'));
  });

  test('§3 หลายประเทศ → countryLine ต่อ +N (ประเทศหลักก่อน)', () => {
    const s = buildExpertiseSummary([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-KR', countryScope: 'specific', routeScope: 'specific', routeCodes: ['ICN'] }),
      mk({ id: '2', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'], isPrimaryCountry: true, primaryRouteCodes: ['NRT', 'KIX'] }),
      mk({ id: '3', zoneId: null, countryId: 'C-GE', countryScope: 'specific', routeScope: 'all_routes' }),
    ], COUNTRIES);
    assert.ok(s.countryLine.startsWith('JAPAN (NRT, KIX)'), s.countryLine); // ประเทศหลักก่อน
    assert.ok(s.countryLine.endsWith('+1'), s.countryLine);
  });

  test('§6 ไม่มีข้อมูล → zoneLine null · countryLine ว่าง · hasData false', () => {
    const s = buildExpertiseSummary([], COUNTRIES);
    assert.equal(s.hasData, false);
    assert.equal(s.zoneLine, null);
    assert.equal(s.countryLine, '');
  });
});

describe('§11 expertiseSearchText', () => {
  test('ค้นได้จากโซน/ประเทศ/รหัส/สนามบิน', () => {
    const txt = expertiseSearchText([
      mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT'] }),
      mk({ id: '2', zoneId: 'Z-SCANDINAVIA', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
    ], COUNTRIES).toLowerCase();
    assert.ok(txt.includes('asia'));
    assert.ok(txt.includes('japan'));
    assert.ok(txt.includes('ญี่ปุ่น'));
    assert.ok(txt.includes('jp'));
    assert.ok(txt.includes('nrt'));
    assert.ok(txt.includes('scandinavia'));
  });
});
