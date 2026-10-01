/**
 * สรุปความเชี่ยวชาญ (โซน→ประเทศ→เส้นทาง) สำหรับหน้า Schedule (§4/§5/§6/§10)
 * อ่านจากข้อมูลชุดเดียวกับ Card "โซน ประเทศ และเส้นทางที่เชี่ยวชาญ" (Expertise Scope) — ไม่คัดลอกซ้ำ (§2)
 *
 * ลำดับความสำคัญของ headline (§5): ประเทศหลัก → เส้นทางหลัก → โซนหลัก → display_order
 */

import { zoneById } from '@/data/leaders/zoneMaster';
import { airportByIata } from '@/data/airports';
import type { ExpertiseScope } from '@/lib/logic/expertiseScope';
import type { Country } from '@/types';

export interface ExpertiseRef { id: string; code: string; nameTh: string; nameEn: string; }
export interface ExpertiseSummary {
  hasData: boolean;
  /** บรรทัดโซน (§2) — null = ไม่มีโซน (ซ่อนบรรทัด) · อาจต่อท้าย " +N" */
  zoneLine: string | null;
  zoneTooltip: string;
  /** บรรทัดประเทศ (เส้นทาง) (§3) — อาจต่อท้าย " +N" */
  countryLine: string;
  countryTooltip: string;
  /** ข้อความ 1 บรรทัด (คงไว้เพื่อใช้ที่อื่น/ทดสอบ) */
  displayText: string;
  tooltipText: string;
  primaryZone: ExpertiseRef | null;
  primaryCountry: ExpertiseRef | null;
  primaryRoutes: { code: string; name: string }[];
  routeScope: 'all_routes' | 'selected_routes' | null;
}

/** §6 ข้อความเมื่อไม่มีข้อมูล */
export const EXPERTISE_EMPTY_TEXT = 'ยังไม่ระบุโซน ประเทศ หรือเส้นทาง';

/** หนึ่งบรรทัดในคอลัมน์ "โซน / ประเทศ / เส้นทาง" ของหน้ารายชื่อ */
export interface ExpertiseLine {
  key: string;
  /** บรรทัดแรก: "Asia · Japan" · "Europe" · "Georgia" */
  headline: string;
  /** บรรทัดสอง: "NRT, KIX" · "ทุกเส้นทาง" · "ทุกประเทศ / ทุกเส้นทาง" · null = ไม่มี */
  detail: string | null;
  isPrimary: boolean;
}

/**
 * แปลง Expertise Scope → บรรทัดแสดงผล โซน → ประเทศ → เส้นทาง
 *
 * ⚠️ ต้องอ่านจาก Expertise Scope ที่ผู้ใช้กำหนดเองเท่านั้น
 *    ห้ามสรุปจากประวัติการนำทัวร์ (routeSkills / employmentHistory / tourJobs)
 *
 * กติกา
 *   • มีโซน + ประเทศ  → "Zone · Country"
 *   • มีโซนอย่างเดียว  → "Zone" + รายละเอียด "ทุกประเทศ" (ต่อ " / ทุกเส้นทาง" เมื่อเลือกทุกเส้นทาง)
 *   • มีประเทศอย่างเดียว → "Country"
 *   • เส้นทาง: ทุกเส้นทาง → "ทุกเส้นทาง" · เจาะจง → รหัสสนามบินตัวพิมพ์ใหญ่ (เส้นทางหลักขึ้นก่อน)
 *   • เรียง: รายการหลักก่อน → displayOrder
 */
export function expertiseLines(scopes: ExpertiseScope[], countries: Country[]): ExpertiseLine[] {
  return [...scopes]
    .sort((a, b) => {
      const pa = a.isPrimaryCountry || a.isPrimaryZone ? 0 : 1;
      const pb = b.isPrimaryCountry || b.isPrimaryZone ? 0 : 1;
      return pa - pb || a.displayOrder - b.displayOrder;
    })
    .map((s, i) => {
      const country = countryOf(countries, s.countryId);
      const zone = zoneById(s.zoneId);
      if (!country && !zone) return null;

      const headline = [zone?.nameEn, country?.nameEn].filter(Boolean).join(' · ');

      let detail: string | null;
      if (!country && zone) {
        // เลือกทั้งโซน — ไม่ได้เจาะจงประเทศ
        detail = s.routeScope === 'all_routes' ? 'ทุกประเทศ / ทุกเส้นทาง' : 'ทุกประเทศ';
      } else if (s.routeScope === 'all_routes') {
        detail = 'ทุกเส้นทาง';
      } else {
        detail = orderedRoutes(s).map((c) => c.toUpperCase()).join(', ') || null;
      }

      return {
        key: s.id || `${s.zoneId ?? ''}-${s.countryId ?? ''}-${i}`,
        headline,
        detail,
        isPrimary: s.isPrimaryCountry || s.isPrimaryZone,
      };
    })
    .filter((l): l is ExpertiseLine => l !== null);
}

const EMPTY: ExpertiseSummary = {
  hasData: false,
  zoneLine: null,
  zoneTooltip: '',
  countryLine: '',
  countryTooltip: '',
  displayText: EXPERTISE_EMPTY_TEXT,
  tooltipText: '',
  primaryZone: null,
  primaryCountry: null,
  primaryRoutes: [],
  routeScope: null,
};

/** ตัดรายการเหลือ ≤max แล้วต่อ +N (§2/§3) */
function formatList(items: string[], max: number): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max}`;
}

const countryOf = (countries: Country[], id: string | null) => (id ? countries.find((c) => c.id === id) : undefined);

/** เรียงเส้นทาง: เส้นทางหลักก่อน (§5) */
function orderedRoutes(scope: ExpertiseScope): string[] {
  const primary = scope.primaryRouteCodes.filter((c) => scope.routeCodes.includes(c));
  const rest = scope.routeCodes.filter((c) => !primary.includes(c));
  return [...primary, ...rest];
}

function routePart(scope: ExpertiseScope): string {
  return scope.routeScope === 'all_routes' ? 'ทุกเส้นทาง' : orderedRoutes(scope).join(', ');
}

/** ข้อความ headline ของ 1 scope (§4/§6) */
export function formatHeadline(scope: ExpertiseScope, countries: Country[]): string {
  const zoneName = scope.zoneId ? (zoneById(scope.zoneId)?.nameEn ?? scope.zoneId) : null;
  const rp = routePart(scope);
  if (scope.countryScope === 'all_zone_countries') {
    return `${zoneName} · ทุกประเทศ · ${rp}`;
  }
  const countryName = countryOf(countries, scope.countryId)?.nameEn ?? scope.countryId ?? '—';
  return zoneName ? `${zoneName} › ${countryName} · ${rp}` : `${countryName} · ${rp}`;
}

/** เลือก scope เด่นตามลำดับ §5 */
function pickHeadline(scopes: ExpertiseScope[]): ExpertiseScope {
  return (
    scopes.find((s) => s.isPrimaryCountry) ??
    scopes.find((s) => s.primaryRouteCodes.length > 0) ??
    scopes.find((s) => s.isPrimaryZone) ??
    scopes[0]
  );
}

/** Tooltip แบบลำดับชั้นเต็ม (§6) */
function buildTooltip(scopes: ExpertiseScope[], countries: Country[]): string {
  const lines: string[] = [];
  const byZone = new Map<string, ExpertiseScope[]>();
  const noZone: ExpertiseScope[] = [];
  for (const s of scopes) {
    if (s.zoneId) { if (!byZone.has(s.zoneId)) byZone.set(s.zoneId, []); byZone.get(s.zoneId)!.push(s); }
    else noZone.push(s);
  }
  const countryLine = (s: ExpertiseScope) => {
    const name = s.countryScope === 'all_zone_countries' ? 'ทุกประเทศ' : (countryOf(countries, s.countryId)?.nameEn ?? s.countryId ?? '—');
    return `- ${name}: ${routePart(s)}`;
  };
  for (const [zoneId, list] of byZone) {
    lines.push(zoneById(zoneId)?.nameEn ?? zoneId);
    for (const s of list) lines.push(countryLine(s));
  }
  for (const s of noZone) {
    const name = countryOf(countries, s.countryId)?.nameEn ?? s.countryId ?? '—';
    lines.push(`${name}: ${routePart(s)}`);
  }
  return lines.join('\n');
}

/** สรุปความเชี่ยวชาญของหัวหน้าทัวร์ 1 คน (§5/§10) */
export function buildExpertiseSummary(scopes: ExpertiseScope[], countries: Country[]): ExpertiseSummary {
  if (!scopes || scopes.length === 0) return EMPTY;

  const headline = pickHeadline(scopes);
  const extra = scopes.length - 1;
  const displayText = formatHeadline(headline, countries) + (extra > 0 ? ` +${extra}` : '');

  const pz = scopes.find((s) => s.isPrimaryZone);
  const pc = scopes.find((s) => s.isPrimaryCountry);
  const zoneRef = (zoneId: string): ExpertiseRef | null => {
    const z = zoneById(zoneId);
    return z ? { id: z.id, code: z.id, nameTh: z.nameTh, nameEn: z.nameEn } : null;
  };
  const countryRef = (countryId: string): ExpertiseRef | null => {
    const c = countryOf(countries, countryId);
    return c ? { id: c.id, code: c.alpha2 ?? c.code ?? '', nameTh: c.nameTh, nameEn: c.nameEn } : null;
  };

  const primaryRouteScope = scopes.find((s) => s.primaryRouteCodes.length > 0) ?? headline;
  const primaryRoutes = (primaryRouteScope.primaryRouteCodes.length > 0 ? primaryRouteScope.primaryRouteCodes : orderedRoutes(headline))
    .map((code) => ({ code, name: airportByIata(code)?.nameTh ?? airportByIata(code)?.cityTh ?? code }));

  /* ---------- บรรทัดโซน (§2) — โซนหลักก่อน · ≤2 · +N ---------- */
  const zoneOrder: { id: string; name: string; primary: boolean }[] = [];
  const seenZone = new Set<string>();
  for (const s of scopes) {
    if (!s.zoneId || seenZone.has(s.zoneId)) continue;
    seenZone.add(s.zoneId);
    zoneOrder.push({
      id: s.zoneId,
      name: zoneById(s.zoneId)?.nameEn ?? s.zoneId,
      primary: scopes.some((x) => x.zoneId === s.zoneId && x.isPrimaryZone),
    });
  }
  zoneOrder.sort((a, z) => Number(z.primary) - Number(a.primary)); // โซนหลักก่อน (stable)
  const zoneNames = zoneOrder.map((z) => z.name);
  const zoneLine = zoneNames.length > 0 ? formatList(zoneNames, 2) : null;

  /* ---------- บรรทัดประเทศ (เส้นทาง) (§3) — ประเทศหลักก่อน · ≤2 · +N ---------- */
  const countryEntry = (s: ExpertiseScope): string => {
    const name = s.countryScope === 'all_zone_countries' ? 'ทุกประเทศ' : (countryOf(countries, s.countryId)?.nameEn ?? s.countryId ?? '—');
    return `${name} (${routePart(s)})`;
  };
  const orderedScopes = [...scopes].sort((a, z) => Number(z.isPrimaryCountry) - Number(a.isPrimaryCountry)); // ประเทศหลักก่อน
  const countryEntries = orderedScopes.map(countryEntry);
  const countryLine = formatList(countryEntries, 2);

  return {
    hasData: true,
    zoneLine,
    zoneTooltip: zoneNames.join(', '),
    countryLine,
    countryTooltip: countryEntries.join('\n'),
    displayText,
    tooltipText: buildTooltip(scopes, countries),
    primaryZone: pz?.zoneId ? zoneRef(pz.zoneId) : null,
    primaryCountry: pc?.countryId ? countryRef(pc.countryId) : null,
    primaryRoutes,
    routeScope: headline.routeScope === 'all_routes' ? 'all_routes' : 'selected_routes',
  };
}

/** ข้อความค้นหาจากความเชี่ยวชาญ (§11) — โซน/ประเทศ/รหัส/สนามบิน/เมือง */
export function expertiseSearchText(scopes: ExpertiseScope[], countries: Country[]): string {
  const parts: string[] = [];
  for (const s of scopes) {
    if (s.zoneId) { const z = zoneById(s.zoneId); if (z) parts.push(z.nameEn, z.nameTh, z.id); }
    if (s.countryId) {
      const c = countryOf(countries, s.countryId);
      if (c) parts.push(c.nameEn, c.nameTh, c.alpha2 ?? '', c.alpha3 ?? '', c.code ?? '');
    }
    for (const code of s.routeCodes) {
      parts.push(code);
      const a = airportByIata(code);
      if (a) parts.push(a.nameEn, a.nameTh, a.cityTh, a.cityEn);
    }
  }
  return parts.filter(Boolean).join(' ');
}
