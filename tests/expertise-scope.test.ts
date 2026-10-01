import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE_MASTER, NORDIC_ZONE, zoneById, zoneCountries,
} from '../src/data/leaders/zoneMaster';
import {
  emptyScope, formatScope, validateScopes, coverageWarnings, scopeKey,
  setPrimaryZone, setPrimaryCountry, scoreExpertiseMatch,
  type ExpertiseScope, type ScopeValidationContext,
} from '../src/lib/logic/expertiseScope';
import type { Country } from '../src/types';

/* ------------------------------- ตัวช่วย ------------------------------- */
const country = (alpha2: string, region: string, subregion: string, nameEn: string, nameTh: string): Country =>
  ({ id: `C-${alpha2}`, code: alpha2, alpha2, alpha3: alpha2 + 'X', nameEn, nameTh, region, subregion, isActive: true } as Country);

const COUNTRIES: Country[] = [
  country('JP', 'เอเชีย', 'เอเชียตะวันออก', 'JAPAN', 'ญี่ปุ่น'),
  country('GE', 'เอเชีย', 'เอเชียตะวันตก', 'GEORGIA', 'จอร์เจีย'),
  country('FR', 'ยุโรป', 'ยุโรปตะวันตก', 'FRANCE', 'ฝรั่งเศส'),
  country('DK', 'ยุโรป', 'ยุโรปเหนือ', 'DENMARK', 'เดนมาร์ก'),
  country('NO', 'ยุโรป', 'ยุโรปเหนือ', 'NORWAY', 'นอร์เวย์'),
  country('SE', 'ยุโรป', 'ยุโรปเหนือ', 'SWEDEN', 'สวีเดน'),
  country('FI', 'ยุโรป', 'ยุโรปเหนือ', 'FINLAND', 'ฟินแลนด์'),
  country('IS', 'ยุโรป', 'ยุโรปเหนือ', 'ICELAND', 'ไอซ์แลนด์'),
];

const mk = (over: Partial<ExpertiseScope> & { id: string }): ExpertiseScope => ({ ...emptyScope(), ...over });

// route→country map สำหรับ ctx
const ROUTE_COUNTRY: Record<string, string> = {
  NRT: 'C-JP', KIX: 'C-JP', ARN: 'C-SE', GOT: 'C-SE', OSL: 'C-NO', BGO: 'C-NO', CPH: 'C-DK', TBS: 'C-GE',
};
const ctx: ScopeValidationContext = {
  countryExists: (id) => COUNTRIES.some((c) => c.id === id),
  routeInCountry: (code, countryId) => ROUTE_COUNTRY[code] === countryId,
  zoneCovers: (zoneId, countryId) => {
    const z = zoneById(zoneId);
    if (!z) return false;
    return zoneCountries(z, COUNTRIES).some((c) => c.id === countryId);
  },
};

/* ------------------------------- §5 Zone Master ------------------------------- */
describe('§5 Zone Master — Scandinavia ≠ Nordic', () => {
  test('Scandinavia = DK/NO/SE เท่านั้น (ไม่รวม FI/IS)', () => {
    const scan = zoneById('Z-SCANDINAVIA')!;
    const members = zoneCountries(scan, COUNTRIES).map((c) => c.alpha2).sort();
    assert.deepEqual(members, ['DK', 'NO', 'SE']);
    assert.ok(!members.includes('FI'));
    assert.ok(!members.includes('IS'));
  });

  test('Nordic = DK/NO/SE/FI/IS (แยกจาก Scandinavia)', () => {
    assert.deepEqual([...NORDIC_ZONE.members!].sort(), ['DK', 'FI', 'IS', 'NO', 'SE']);
    assert.notEqual(NORDIC_ZONE.id, 'Z-SCANDINAVIA');
  });

  test('มีครบ 8 โซนเริ่มต้น + ชื่อไทยสแกนดิเนเวีย', () => {
    assert.equal(ZONE_MASTER.length, 8);
    assert.equal(zoneById('Z-SCANDINAVIA')!.nameTh, 'สแกนดิเนเวีย');
  });

  test('Asia ครอบคลุมญี่ปุ่นและจอร์เจีย · Europe ครอบคลุมฝรั่งเศส', () => {
    assert.ok(zoneCountries(zoneById('Z-ASIA')!, COUNTRIES).some((c) => c.alpha2 === 'JP'));
    assert.ok(zoneCountries(zoneById('Z-ASIA')!, COUNTRIES).some((c) => c.alpha2 === 'GE'));
    assert.ok(zoneCountries(zoneById('Z-EUROPE')!, COUNTRIES).some((c) => c.alpha2 === 'FR'));
  });
});

/* ------------------------------- §8 การแสดงผล ------------------------------- */
describe('§8 formatScope — ตรงกับตัวอย่างทั้ง 7', () => {
  const cases: [ExpertiseScope, { zoneName?: string; countryName?: string }, string][] = [
    [mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'] }), { zoneName: 'Asia', countryName: 'Japan' }, 'Asia › Japan › NRT, KIX'],
    [mk({ id: '2', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes' }), { zoneName: 'Asia', countryName: 'Japan' }, 'Asia › Japan › ทุกเส้นทาง'],
    [mk({ id: '3', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' }), { zoneName: 'Europe' }, 'Europe › ทุกประเทศ › ทุกเส้นทาง'],
    [mk({ id: '4', zoneId: null, countryId: 'C-GE', countryScope: 'specific', routeScope: 'all_routes' }), { countryName: 'Georgia' }, 'Georgia › ทุกเส้นทาง'],
    [mk({ id: '5', zoneId: 'Z-SCANDINAVIA', countryScope: 'all_zone_countries', routeScope: 'all_routes' }), { zoneName: 'Scandinavia' }, 'Scandinavia › ทุกประเทศ › ทุกเส้นทาง'],
    [mk({ id: '6', zoneId: 'Z-SCANDINAVIA', countryId: 'C-NO', countryScope: 'specific', routeScope: 'all_routes' }), { zoneName: 'Scandinavia', countryName: 'Norway' }, 'Scandinavia › Norway › ทุกเส้นทาง'],
    [mk({ id: '7', zoneId: 'Z-SCANDINAVIA', countryId: 'C-SE', countryScope: 'specific', routeScope: 'specific', routeCodes: ['ARN', 'GOT'] }), { zoneName: 'Scandinavia', countryName: 'Sweden' }, 'Scandinavia › Sweden › ARN, GOT'],
  ];
  for (const [scope, names, expected] of cases) {
    test(expected, () => assert.equal(formatScope(scope, names), expected));
  }
});

/* ------------------------------- §12 Validation ------------------------------- */
describe('§12 validateScopes', () => {
  test('เฉพาะเส้นทางแต่ไม่เลือกเส้นทาง → error', () => {
    const issues = validateScopes([mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: [] })], ctx);
    assert.ok(issues.some((i) => i.field === 'routes'));
  });

  test('ไม่เลือกโซน + ไม่เลือกประเทศ → error', () => {
    const issues = validateScopes([mk({ id: '1', zoneId: null, countryScope: 'specific', countryId: null })], ctx);
    assert.ok(issues.some((i) => i.field === 'country'));
  });

  test('ทุกประเทศในโซน (มีโซน) → ผ่าน · ไม่ต้องเลือกประเทศ', () => {
    const issues = validateScopes([mk({ id: '1', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' })], ctx);
    assert.deepEqual(issues, []);
  });

  test('สนามบินไม่อยู่ในประเทศ → error', () => {
    const issues = validateScopes([mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['ARN'] })], ctx);
    assert.ok(issues.some((i) => i.field === 'routes' && /ARN/.test(i.message)));
  });

  test('เส้นทางหลักต้องอยู่ในเส้นทางที่เชี่ยวชาญ', () => {
    const bad = validateScopes([mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT'], primaryRouteCodes: ['KIX'] })], ctx);
    assert.ok(bad.some((i) => i.field === 'primary'));
    const good = validateScopes([mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'], primaryRouteCodes: ['NRT'] })], ctx);
    assert.ok(!good.some((i) => i.field === 'primary'));
  });

  test('โซนหลัก/ประเทศหลัก ได้อย่างละ ≤1', () => {
    const scopes = [
      mk({ id: '1', zoneId: 'Z-ASIA', countryScope: 'all_zone_countries', isPrimaryZone: true }),
      mk({ id: '2', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', isPrimaryZone: true }),
    ];
    assert.ok(validateScopes(scopes, ctx).some((i) => /โซนหลักได้เพียง 1/.test(i.message)));
  });

  test('§13 rule ซ้ำสมบูรณ์ → duplicate', () => {
    const s = { zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific' as const, routeScope: 'all_routes' as const };
    const issues = validateScopes([mk({ id: '1', ...s }), mk({ id: '2', ...s })], ctx);
    assert.ok(issues.some((i) => i.field === 'duplicate'));
  });

  test('scopeKey เท่ากันเมื่อเส้นทางชุดเดียวกัน (คนละลำดับ)', () => {
    const a = mk({ id: '1', countryId: 'C-SE', countryScope: 'specific', routeScope: 'specific', routeCodes: ['ARN', 'GOT'] });
    const b = mk({ id: '2', countryId: 'C-SE', countryScope: 'specific', routeScope: 'specific', routeCodes: ['GOT', 'ARN'] });
    assert.equal(scopeKey(a), scopeKey(b));
  });
});

/* ------------------------------- §13 Coverage ------------------------------- */
describe('§13 coverageWarnings', () => {
  const names = (s: ExpertiseScope) => ({
    zoneName: zoneById(s.zoneId ?? '')?.nameEn,
    countryName: COUNTRIES.find((c) => c.id === s.countryId)?.nameEn,
  });

  test('Japan ทุกเส้นทาง + Japan เฉพาะ NRT/KIX → เตือน', () => {
    const w = coverageWarnings([
      mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes' }),
      mk({ id: '2', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'] }),
    ], ctx, names);
    assert.ok(w.some((x) => /ทุกเส้นทางแล้ว/.test(x.message)));
  });

  test('Europe ทุกประเทศทุกเส้นทาง ครอบคลุม France → เตือน · อนุญาตเมื่อมีเหตุผล', () => {
    const base = [
      mk({ id: '1', zoneId: 'Z-EUROPE', countryScope: 'all_zone_countries', routeScope: 'all_routes' }),
      mk({ id: '2', countryId: 'C-FR', countryScope: 'specific', routeScope: 'all_routes' }),
    ];
    const w = coverageWarnings(base, ctx, names);
    const fr = w.find((x) => /FRANCE/i.test(x.message));
    assert.ok(fr);
    assert.equal(fr!.allowWithReason, false); // ไม่มีเหตุผลเฉพาะ

    base[1] = { ...base[1], isPrimaryCountry: true };
    const w2 = coverageWarnings(base, ctx, names);
    assert.equal(w2.find((x) => /FRANCE/i.test(x.message))!.allowWithReason, true);
  });
});

/* ------------------------------- §9 primary ------------------------------- */
describe('§9 setPrimaryZone / setPrimaryCountry — ยกเลิกของเดิมอัตโนมัติ', () => {
  test('เปลี่ยนโซนหลัก → โซนหลักเดิมถูกยกเลิก', () => {
    const scopes = [mk({ id: '1', isPrimaryZone: true }), mk({ id: '2' })];
    const next = setPrimaryZone(scopes, '2');
    assert.equal(next.find((s) => s.id === '1')!.isPrimaryZone, false);
    assert.equal(next.find((s) => s.id === '2')!.isPrimaryZone, true);
  });

  test('เปลี่ยนประเทศหลัก → ประเทศหลักเดิมถูกยกเลิก', () => {
    const scopes = [mk({ id: '1', isPrimaryCountry: true }), mk({ id: '2' })];
    const next = setPrimaryCountry(scopes, '2');
    assert.equal(next.filter((s) => s.isPrimaryCountry).length, 1);
    assert.equal(next.find((s) => s.id === '2')!.isPrimaryCountry, true);
  });
});

/* ------------------------------- §14 match ------------------------------- */
describe('§14 scoreExpertiseMatch — ลำดับความเหมาะสม', () => {
  const zc = { zoneCovers: ctx.zoneCovers };

  test('งาน NRT: Asia›Japan›NRT ได้คะแนนสูงกว่า Asia›ทุกประเทศ›ทุกเส้นทาง', () => {
    const specific = [mk({ id: '1', zoneId: 'Z-ASIA', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT', 'KIX'] })];
    const broad = [mk({ id: '2', zoneId: 'Z-ASIA', countryScope: 'all_zone_countries', routeScope: 'all_routes' })];
    const target = { countryId: 'C-JP', routeCode: 'NRT' };
    assert.ok(scoreExpertiseMatch(specific, target, zc) > scoreExpertiseMatch(broad, target, zc));
  });

  test('งาน Norway: Scandinavia›Norway›ทุกเส้นทาง สูงกว่า Scandinavia›ทุกประเทศ›ทุกเส้นทาง', () => {
    const norway = [mk({ id: '1', zoneId: 'Z-SCANDINAVIA', countryId: 'C-NO', countryScope: 'specific', routeScope: 'all_routes' })];
    const allScan = [mk({ id: '2', zoneId: 'Z-SCANDINAVIA', countryScope: 'all_zone_countries', routeScope: 'all_routes' })];
    const target = { countryId: 'C-NO', routeCode: 'OSL' };
    assert.ok(scoreExpertiseMatch(norway, target, zc) > scoreExpertiseMatch(allScan, target, zc));
  });

  test('เส้นทางหลักได้คะแนนสูงสุด (6)', () => {
    const primary = [mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'specific', routeCodes: ['NRT'], primaryRouteCodes: ['NRT'] })];
    assert.equal(scoreExpertiseMatch(primary, { countryId: 'C-JP', routeCode: 'NRT' }, zc), 6);
  });

  test('ไม่ตรงประเทศ → 0', () => {
    const jp = [mk({ id: '1', countryId: 'C-JP', countryScope: 'specific', routeScope: 'all_routes' })];
    assert.equal(scoreExpertiseMatch(jp, { countryId: 'C-FR', routeCode: 'CDG' }, zc), 0);
  });
});
