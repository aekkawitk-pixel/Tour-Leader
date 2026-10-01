/**
 * ความเชี่ยวชาญแบบลำดับชั้น โซน → ประเทศ → เส้นทาง (§8/§12/§13/§14)
 *
 * โมเดล 1 แถว (Rule) = ExpertiseScope:
 *   - zoneId=null          → ระบุประเทศตรง (ไม่ผ่านโซน)
 *   - countryScope='all'   → ทุกประเทศในโซน (countryId=null)
 *   - routeScope='all'     → ทุกเส้นทางของประเทศ/โซน
 * เก็บด้วย Master ID จริง (zoneId / countryId / IATA code) — ไม่เก็บข้อความตัวอย่าง (§12)
 */

import { ALL_ZONES_ID } from '@/data/leaders/zoneMaster';

export type CountryScope = 'all_zone_countries' | 'specific';
export type RouteScope = 'all_routes' | 'specific';

export interface ExpertiseScope {
  id: string;
  zoneId: string | null;
  countryId: string | null;
  countryScope: CountryScope;
  routeScope: RouteScope;
  /** IATA codes เมื่อ routeScope='specific' */
  routeCodes: string[];
  isPrimaryZone: boolean;
  isPrimaryCountry: boolean;
  /** เส้นทางหลัก (§9 ได้หลาย) — ต้องอยู่ในขอบเขตเส้นทางของรายการ */
  primaryRouteCodes: string[];
  displayOrder: number;
  note?: string;
}

export function emptyScope(order = 0): ExpertiseScope {
  return {
    id: '',
    zoneId: null,
    countryId: null,
    countryScope: 'specific',
    routeScope: 'all_routes',
    routeCodes: [],
    isPrimaryZone: false,
    isPrimaryCountry: false,
    primaryRouteCodes: [],
    displayOrder: order,
  };
}

/**
 * "ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง" — เก็บเป็น Rule เดียวที่อ้างโซนเสมือน ALL_ZONES_ID (ดู zoneMaster)
 * จึงผ่าน validation / การแสดงผล / การจับคู่งานเดิมได้ทั้งหมดโดยไม่ต้องมีฟิลด์ใหม่
 */
export function allZonesScope(id: string): ExpertiseScope {
  return { ...emptyScope(0), id, zoneId: ALL_ZONES_ID, countryScope: 'all_zone_countries', routeScope: 'all_routes' };
}

export function isAllZonesScope(s: Pick<ExpertiseScope, 'zoneId'>): boolean {
  return s.zoneId === ALL_ZONES_ID;
}

/* --------------------------------- การแสดงผล (§8) --------------------------------- */

export interface ScopeNames {
  zoneName?: string;   // ชื่อโซน (แสดง)
  countryName?: string; // ชื่อประเทศ (แสดง)
}

/** "Asia › Japan › NRT, KIX" / "Georgia › ทุกเส้นทาง" / "Europe › ทุกประเทศ › ทุกเส้นทาง" */
export function formatScope(scope: ExpertiseScope, names: ScopeNames): string {
  const parts: string[] = [];
  if (scope.zoneId) parts.push(names.zoneName ?? scope.zoneId);
  parts.push(scope.countryScope === 'all_zone_countries' ? 'ทุกประเทศ' : (names.countryName ?? scope.countryId ?? '—'));
  parts.push(scope.routeScope === 'all_routes' ? 'ทุกเส้นทาง' : scope.routeCodes.join(', '));
  return parts.join(' › ');
}

/* --------------------------------- Validation (§12) --------------------------------- */

export interface ScopeIssue {
  scopeId: string;
  field: 'zone' | 'country' | 'routes' | 'primary' | 'duplicate';
  message: string;
  /** true = เตือน (บันทึกต่อได้) · false = error (บล็อก) */
  warning?: boolean;
}

export interface ScopeValidationContext {
  /** ประเทศนี้มี Master หรือไม่ */
  countryExists: (countryId: string) => boolean;
  /** IATA นี้มี Master และอยู่ในประเทศที่ระบุหรือไม่ */
  routeInCountry: (code: string, countryId: string) => boolean;
  /** ประเทศนี้อยู่ในโซนหรือไม่ (ใช้ตรวจ coverage §13) */
  zoneCovers: (zoneId: string, countryId: string) => boolean;
}

/** คีย์ระบุ Rule ซ้ำ (§13) — โซน+ประเทศ+ขอบเขต+เส้นทาง */
export function scopeKey(s: ExpertiseScope): string {
  const routes = s.routeScope === 'all_routes' ? 'ALL' : [...s.routeCodes].sort().join(',');
  return `${s.zoneId ?? '-'}|${s.countryScope}|${s.countryId ?? '-'}|${s.routeScope}|${routes}`;
}

export function validateScopes(scopes: ExpertiseScope[], ctx: ScopeValidationContext): ScopeIssue[] {
  const issues: ScopeIssue[] = [];
  const seen = new Map<string, ExpertiseScope>();

  for (const s of scopes) {
    // §12 ไม่เลือกโซน → ต้องเลือกประเทศ (specific)
    if (!s.zoneId && (s.countryScope !== 'specific' || !s.countryId)) {
      issues.push({ scopeId: s.id, field: 'country', message: 'ไม่ได้เลือกโซน — ต้องเลือกประเทศอย่างน้อย 1 ประเทศสำหรับรายการนี้' });
    }
    // §12 ทุกประเทศในโซน → ต้องมีโซน
    if (s.countryScope === 'all_zone_countries' && !s.zoneId) {
      issues.push({ scopeId: s.id, field: 'zone', message: 'เลือก “ทุกประเทศในโซน” ต้องระบุโซน' });
    }
    // §12 ประเทศต้องมาจาก Master
    if (s.countryScope === 'specific' && s.countryId && !ctx.countryExists(s.countryId)) {
      issues.push({ scopeId: s.id, field: 'country', message: 'ประเทศต้องมาจาก Country Master' });
    }
    // §12 เฉพาะเส้นทาง → ต้องเลือก ≥1 · ทุกเส้นทาง → ต้องไม่มีรายการเส้นทาง
    if (s.routeScope === 'specific') {
      if (s.routeCodes.length === 0) {
        issues.push({ scopeId: s.id, field: 'routes', message: 'เลือก “เฉพาะเส้นทาง” ต้องเลือกอย่างน้อย 1 เส้นทาง' });
      }
      // §12 สนามบินต้องสัมพันธ์กับประเทศ (เฉพาะกรณีประเทศเจาะจง)
      if (s.countryScope === 'specific' && s.countryId) {
        for (const code of s.routeCodes) {
          if (!ctx.routeInCountry(code, s.countryId)) {
            issues.push({ scopeId: s.id, field: 'routes', message: `เส้นทาง ${code} ไม่อยู่ในประเทศที่เลือก` });
          }
        }
      }
    }
    // §9/§12 เส้นทางหลักต้องอยู่ในขอบเขตเส้นทางของรายการ
    for (const code of s.primaryRouteCodes) {
      const inScope = s.routeScope === 'all_routes'
        ? (s.countryScope === 'specific' && s.countryId ? ctx.routeInCountry(code, s.countryId) : true)
        : s.routeCodes.includes(code);
      if (!inScope) {
        issues.push({ scopeId: s.id, field: 'primary', message: `กำหนดเส้นทางหลัก ${code} ไม่ได้ — ไม่อยู่ในเส้นทางที่เชี่ยวชาญของรายการนี้` });
      }
    }

    // §13 ซ้ำสมบูรณ์
    const key = scopeKey(s);
    if (seen.has(key)) {
      issues.push({ scopeId: s.id, field: 'duplicate', message: 'รายการนี้ซ้ำกับรายการอื่น — รวมเป็นรายการเดียว' });
    } else {
      seen.set(key, s);
    }
  }

  // §9 โซนหลัก/ประเทศหลัก ได้อย่างละ ≤1
  if (scopes.filter((s) => s.isPrimaryZone).length > 1) {
    issues.push({ scopeId: '', field: 'primary', message: 'กำหนดโซนหลักได้เพียง 1 โซน' });
  }
  if (scopes.filter((s) => s.isPrimaryCountry).length > 1) {
    issues.push({ scopeId: '', field: 'primary', message: 'กำหนดประเทศหลักได้เพียง 1 ประเทศ' });
  }

  return issues;
}

/* --------------------------- ซ้ำ / ครอบคลุมกัน (§13) --------------------------- */

export interface CoverageWarning {
  scopeId: string;
  message: string;
  /** ครอบคลุมแต่ยังบันทึกได้ (มีเงื่อนไขเฉพาะ) */
  allowWithReason?: boolean;
}

/** ตรวจ coverage: ประเทศทุกเส้นทางทับกับเฉพาะเส้นทาง · โซนทุกประเทศทับกับประเทศเจาะจง */
export function coverageWarnings(scopes: ExpertiseScope[], ctx: ScopeValidationContext, names: (s: ExpertiseScope) => ScopeNames): CoverageWarning[] {
  const warnings: CoverageWarning[] = [];

  for (const s of scopes) {
    if (s.countryScope !== 'specific' || !s.countryId) continue;

    // (ก) ประเทศเดียวกัน: มี all_routes อยู่แล้ว แต่รายการนี้ระบุเฉพาะเส้นทาง
    if (s.routeScope === 'specific') {
      const hasAll = scopes.some((o) => o !== s && o.countryScope === 'specific' && o.countryId === s.countryId && o.routeScope === 'all_routes');
      if (hasAll) {
        const cn = names(s).countryName ?? s.countryId;
        warnings.push({
          scopeId: s.id,
          message: `${cn} ถูกกำหนดเป็นทุกเส้นทางแล้ว ไม่จำเป็นต้องเพิ่ม ${s.routeCodes.join(', ')} ซ้ำ กรุณาเลือกว่าจะใช้ทุกเส้นทางหรือเฉพาะเส้นทาง`,
        });
      }
    }

    // (ข) โซนทุกประเทศทุกเส้นทาง ครอบคลุมประเทศเจาะจงนี้อยู่แล้ว
    const coveringZone = scopes.find((o) =>
      o !== s && o.zoneId && o.countryScope === 'all_zone_countries' && o.routeScope === 'all_routes'
      && ctx.zoneCovers(o.zoneId, s.countryId!));
    if (coveringZone) {
      const cn = names(s).countryName ?? s.countryId;
      // §13 อนุญาตให้บันทึกได้ถ้ามีเงื่อนไขเฉพาะ: ประเทศหลัก / มีเส้นทางหลัก / มีหมายเหตุ
      const allowWithReason = s.isPrimaryCountry || s.primaryRouteCodes.length > 0 || Boolean(s.note?.trim());
      warnings.push({
        scopeId: s.id,
        message: `${cn} ถูกครอบคลุมโดยโซน${names(coveringZone).zoneName ?? coveringZone.zoneId} (ทุกประเทศ ทุกเส้นทาง) อยู่แล้ว`,
        allowWithReason,
      });
    }
  }

  return warnings;
}

/* --------------------------- การกำหนดรายการหลัก (§9) --------------------------- */

/** ตั้งโซนหลัก — ยกเลิกโซนหลักเดิมอัตโนมัติ */
export function setPrimaryZone(scopes: ExpertiseScope[], scopeId: string): ExpertiseScope[] {
  return scopes.map((s) => ({ ...s, isPrimaryZone: s.id === scopeId }));
}

/** ตั้งประเทศหลัก — ยกเลิกประเทศหลักเดิมอัตโนมัติ */
export function setPrimaryCountry(scopes: ExpertiseScope[], scopeId: string): ExpertiseScope[] {
  return scopes.map((s) => ({ ...s, isPrimaryCountry: s.id === scopeId }));
}

/* --------------------------- การจับคู่งาน (§14) --------------------------- */

export interface MatchTarget {
  countryId: string;
  routeCode?: string;
}

/** คะแนนความเหมาะสมของ 1 rule ต่องาน — สูง = ตรงมาก (0 = ไม่ตรง) */
export function scoreScope(scope: ExpertiseScope, target: MatchTarget, ctx: Pick<ScopeValidationContext, 'zoneCovers'>): number {
  // ประเทศตรงหรือไม่
  const countryMatch = scope.countryScope === 'specific'
    ? scope.countryId === target.countryId
    : Boolean(scope.zoneId) && ctx.zoneCovers(scope.zoneId!, target.countryId);
  if (!countryMatch) return 0;

  const routeGiven = Boolean(target.routeCode);
  const routeMatch = !routeGiven
    ? false
    : scope.routeScope === 'all_routes'
      ? true
      : scope.routeCodes.includes(target.routeCode!);
  const routeIsPrimary = routeGiven && scope.primaryRouteCodes.includes(target.routeCode!);

  // §14 ลำดับความเหมาะสม (6 = สูงสุด)
  if (routeMatch) {
    if (routeIsPrimary) return 6;                              // 1. เส้นทางหลัก
    if (scope.routeScope === 'specific') return 5;            // 2. เส้นทางที่เชี่ยวชาญ
    // routeScope all_routes:
    if (scope.countryScope === 'specific') return scope.isPrimaryCountry ? 4 : 3; // 3/4 ประเทศหลัก / ประเทศทุกเส้นทาง
    return scope.isPrimaryZone ? 2 : 1;                        // 5/6 โซนหลัก / โซนทุกอย่าง
  }

  // ไม่ระบุเส้นทางเป้าหมาย → ให้คะแนนตามระดับประเทศ/โซน
  if (scope.countryScope === 'specific') return scope.isPrimaryCountry ? 4 : 3;
  return scope.isPrimaryZone ? 2 : 1;
}

/** คะแนนสูงสุดของหัวหน้าทัวร์ต่องาน (§14) */
export function scoreExpertiseMatch(scopes: ExpertiseScope[], target: MatchTarget, ctx: Pick<ScopeValidationContext, 'zoneCovers'>): number {
  return scopes.reduce((max, s) => Math.max(max, scoreScope(s, target, ctx)), 0);
}
