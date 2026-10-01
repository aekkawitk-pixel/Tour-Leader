/**
 * ตรรกะเกี่ยวกับโปรไฟล์หัวหน้าทัวร์ — แยกจาก UI ทั้งหมด
 *
 * กติกาสำคัญของ "ความเชี่ยวชาญเส้นทาง":
 *   • coverage = 'all_routes'      → ถือว่าเชี่ยวชาญ **ทุกเส้นทางย่อย** ของประเทศนั้น
 *                                    (เลือก JAPAN ทุกเส้นทาง → ตรงกับ NRT, KIX และเส้นทางย่อยทั้งหมด)
 *   • coverage = 'selected_routes' → ตรงเฉพาะเส้นทางที่ระบุใน routeIds เท่านั้น
 *                                    (เลือกเฉพาะ NRT → ไม่ถือว่าเชี่ยวชาญ KIX)
 */

import type {
  ContactChannel,
  ContactType,
  Country,
  ExperienceLevelFilter,
  LanguageSkill,
  TourJob,
  TourLeader,
  TourLeaderRouteSkill,
  TourRoute,
  TourSkillLevel,
} from '@/types';
import { routeSkillRank, tourSkillRank } from '@/lib/labels';
import { ALL_CUSTOMER_GROUPS_CODE, ALL_WORK_SKILLS_CODE } from '@/data/master';
import { levelOption, maxRankOf } from '@/data/leaders/languageStandards';
import { diffDays } from '@/lib/format';
import { summarizeExperience } from '@/modules/tour-leaders/experience';

/* --------------------------------- ติดต่อ -------------------------------- */

export function primaryContact(
  leader: TourLeader,
  type?: ContactType,
): ContactChannel | undefined {
  const pool = type ? leader.contacts.filter((c) => c.type === type) : leader.contacts;
  return pool.find((c) => c.isPrimary) ?? pool[0];
}

export function leaderPhone(leader: TourLeader): string {
  return primaryContact(leader, 'phone')?.value ?? '—';
}

export function leaderEmail(leader: TourLeader): string {
  return primaryContact(leader, 'email')?.value ?? '—';
}

/** LINE ID จากช่องทางติดต่อจริงของหัวหน้าทัวร์ — ไม่มีข้อมูลคืน null (ให้ผู้เรียกตัดสินใจข้อความแทน) */
export function leaderLineId(leader: TourLeader): string | null {
  return primaryContact(leader, 'line')?.value?.trim() || null;
}

/** ข้อความค้นหารวมของหัวหน้าทัวร์ (ใช้ทั้งช่องค้นหาบน Header และหน้ารายการ) */
export function leaderSearchText(leader: TourLeader): string {
  return [
    leader.id,
    leader.firstName,
    leader.lastName,
    leader.nickname,
    ...leader.contacts.map((c) => c.value),
  ]
    .join(' ')
    .toLowerCase();
}

/** สร้าง URL สำหรับช่องทางที่เปิดเป็นลิงก์ได้ */
export function contactHref(channel: ContactChannel): string | null {
  const value = channel.value.trim();
  switch (channel.type) {
    case 'phone':
      return `tel:${value.replace(/[^0-9+]/g, '')}`;
    case 'email':
      return `mailto:${value}`;
    case 'website':
    case 'facebook':
    case 'instagram':
    case 'tiktok':
      return /^https?:\/\//i.test(value) ? value : `https://${value}`;
    default:
      return null;
  }
}

/* --------------------------------- ภาษา ---------------------------------- */

/** อันดับระดับของภาษานี้เป็นสัดส่วน 0..1 ของมาตรฐานตัวเอง — ใช้เทียบ/เรียงข้ามภาษาที่คนละมาตรฐานกันแบบคร่าว ๆ เท่านั้น */
function levelFraction(skill: LanguageSkill): number {
  if (skill.isNativeLanguage) return 1;
  if (skill.levelRank === null) return 0;
  return skill.levelRank / maxRankOf(skill.standard);
}

/**
 * พูดภาษานี้ (ตามชื่อ) ได้ในระดับอย่างน้อยเท่าที่กำหนดหรือไม่
 * minLevelCode ตีความตามมาตรฐานของภาษานั้นเอง (เช่น 'B2' สำหรับอังกฤษ, 'N2' สำหรับญี่ปุ่น)
 * null = ไม่กรองระดับ · ภาษาแม่ถือว่าผ่านทุกระดับที่กำหนด
 */
export function hasLanguageAtLeast(
  leader: TourLeader,
  language: string,
  minLevelCode: string | null,
): boolean {
  const skill = leader.languages.find((l) => l.languageName === language);
  if (!skill) return false;
  if (!minLevelCode) return true;
  if (skill.isNativeLanguage) return true;
  const min = levelOption(skill.standard, minLevelCode);
  if (!min || skill.levelRank === null) return false;
  return skill.levelRank >= min.rank;
}

/**
 * ข้อความสรุปภาษาแบบย่อ สำหรับตาราง/การ์ด เช่น "อังกฤษ B2 · ญี่ปุ่น N2 · +2 ภาษา"
 * เรียงภาษาแม่ขึ้นก่อน แล้วแสดงสูงสุด `limit` ภาษา ที่เหลือย่อเป็น "+N ภาษา"
 */
export function languageSummaryShort(leader: TourLeader, limit = 2): string {
  const ordered = orderedLanguages(leader);
  if (ordered.length === 0) return '';
  const shown = ordered
    .slice(0, limit)
    .map((l) => `${l.languageName} ${l.isNativeLanguage ? 'ภาษาแม่' : (l.levelCode ?? '')}`.trim());
  const rest = ordered.length - limit;
  if (rest > 0) shown.push(`+${rest} ภาษา`);
  return shown.join(' · ');
}

/** ภาษาเรียงตามลำดับแสดงผล: ภาษาแม่ก่อน แล้วตามระดับสูง→ต่ำ (เทียบเป็นสัดส่วนของมาตรฐานตัวเอง) */
export function orderedLanguages(leader: TourLeader): LanguageSkill[] {
  return [...leader.languages].sort((a, b) => levelFraction(b) - levelFraction(a));
}

/* -------------------------- ประสบการณ์ทำงาน (รวม) ------------------------- */

/** จำนวนเดือนประสบการณ์รวม (ไม่นับช่วงที่ซ้อนกันซ้ำ · งานปัจจุบันนับถึงวันนี้) */
export function leaderExperienceMonths(leader: TourLeader, today: string): number {
  return summarizeExperience(leader.employmentHistory, today).totalMonths;
}

/** ช่วงระดับประสบการณ์ (นับปีเต็ม) — ใช้ร่วมกันทั้งตัวกรองและกราฟ */
export function experienceBandOf(
  months: number,
): Exclude<ExperienceLevelFilter, 'any'> {
  if (months <= 0) return 'none';
  const years = Math.floor(months / 12);
  if (years === 0) return 'lt1';
  if (years <= 3) return '1to3';
  if (years <= 6) return '4to6';
  if (years <= 10) return '7to10';
  return 'gt10';
}

/* --------------------- ประเทศที่เชี่ยวชาญ (เรียงระดับสูงสุด) --------------------- */

export interface ExpertCountry {
  /** key สำหรับ React (route skill id) */
  key: string;
  /** ชื่อประเทศ (อังกฤษ) หรือรหัสประเทศ */
  label: string;
  /** รหัส ISO alpha-2 ใช้แสดงเป็น Badge สั้น */
  code: string;
}

/** ประเทศที่เชี่ยวชาญ เรียงจากระดับความเชี่ยวชาญสูง→ต่ำ (ประเทศเด่นก่อน) */
export function expertCountries(leader: TourLeader, countries: Country[]): ExpertCountry[] {
  return [...leader.routeSkills]
    .sort((a, b) => routeSkillRank(b.skillLevel) - routeSkillRank(a.skillLevel))
    .map((s) => {
      const country = countries.find((c) => c.id === s.countryId);
      return {
        key: s.id,
        label: country ? country.nameEn : s.countryId,
        code: country?.code ?? s.countryId,
      };
    });
}

/* ---------------------------- ประเทศและเส้นทาง ---------------------------- */

export function routesOfCountry(routes: TourRoute[], countryId: string): TourRoute[] {
  return routes
    .filter((r) => r.countryId === countryId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function countryByName(countries: Country[], name: string): Country | undefined {
  const key = name.trim().toLowerCase();
  return countries.find(
    (c) =>
      c.nameTh.toLowerCase() === key ||
      c.nameEn.toLowerCase() === key ||
      c.code.toLowerCase() === key,
  );
}

/** หัวหน้าทัวร์มีความเชี่ยวชาญประเทศนี้หรือไม่ (ไม่ว่า coverage แบบไหน) */
export function skillForCountry(
  leader: TourLeader,
  countryId: string,
): TourLeaderRouteSkill | undefined {
  return leader.routeSkills.find((s) => s.countryId === countryId);
}

/**
 * ครอบคลุมเส้นทางย่อยนี้หรือไม่
 * — all_routes ครอบคลุมทุกเส้นทางของประเทศ
 * — selected_routes ครอบคลุมเฉพาะที่ระบุ
 */
export function coversRoute(leader: TourLeader, route: TourRoute): boolean {
  const skill = skillForCountry(leader, route.countryId);
  if (!skill) return false;
  if (skill.coverage === 'all_routes') return true;
  return skill.routeIds.includes(route.id);
}

/** ครอบคลุมรหัสสนามบินนี้หรือไม่ (เช่น NRT / KIX) */
export function coversAirport(
  leader: TourLeader,
  routes: TourRoute[],
  airportCode: string,
): boolean {
  const code = airportCode.trim().toUpperCase();
  const airports = routes.filter((r) => r.routeType === 'airport' && r.code === code);
  return airports.some((airport) => coversRoute(leader, airport));
}

/** รายชื่อเส้นทางย่อยทั้งหมดที่หัวหน้าทัวร์คนนี้ครอบคลุม (ใช้แสดงผลและค้นหา) */
export function coveredRoutes(leader: TourLeader, routes: TourRoute[]): TourRoute[] {
  return routes.filter((route) => coversRoute(leader, route));
}

/** ชื่อประเทศที่เชี่ยวชาญ (ใช้แสดงในตาราง/การ์ด) */
export function leaderCountryNames(leader: TourLeader, countries: Country[]): string[] {
  return leader.routeSkills
    .map((s) => countries.find((c) => c.id === s.countryId)?.nameTh)
    .filter((n): n is string => Boolean(n));
}

/** ข้อความสรุปความครอบคลุมของหนึ่งประเทศ เช่น "ญี่ปุ่น — ทุกเส้นทาง" */
export function coverageLabel(
  skill: TourLeaderRouteSkill,
  countries: Country[],
  routes: TourRoute[],
): string {
  const country = countries.find((c) => c.id === skill.countryId);
  const countryName = country ? `${country.nameEn} (${country.nameTh})` : skill.countryId;
  if (skill.coverage === 'all_routes') return `${countryName} — ทุกเส้นทาง`;
  const names = skill.routeIds
    .map((id) => routes.find((r) => r.id === id))
    .filter((r): r is TourRoute => Boolean(r))
    .map((r) => (r.code ? `${r.code}` : r.nameTh));
  return `${countryName} — ${names.join(', ') || 'ยังไม่ได้เลือกเส้นทาง'}`;
}

/** ค้นหาข้อความอิสระในความเชี่ยวชาญเส้นทาง (ประเทศ เมือง ชื่อเส้นทาง หรือรหัสสนามบิน) */
export function matchesRouteQuery(
  leader: TourLeader,
  countries: Country[],
  routes: TourRoute[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  for (const skill of leader.routeSkills) {
    const country = countries.find((c) => c.id === skill.countryId);
    if (
      country &&
      (country.nameTh.toLowerCase().includes(q) ||
        country.nameEn.toLowerCase().includes(q) ||
        country.code.toLowerCase() === q)
    ) {
      return true;
    }
  }

  // ตรวจเส้นทางย่อยที่ "ครอบคลุมจริง" — all_routes จึงตรงกับทุกเส้นทางในประเทศนั้น
  return coveredRoutes(leader, routes).some(
    (route) =>
      route.nameTh.toLowerCase().includes(q) ||
      (route.nameEn ?? '').toLowerCase().includes(q) ||
      (route.code ?? '').toLowerCase() === q,
  );
}

/* --------------------------- ประเภททัวร์และความถนัด ----------------------- */

/** ถนัดกลุ่มลูกค้านี้หรือไม่ — "ได้ทุกประเภท" ตรงกับทุกกลุ่ม */
export function hasCustomerGroup(
  leader: TourLeader,
  code: string,
  minLevel: TourSkillLevel | 'any' = 'any',
): boolean {
  const pool = leader.tourSkills.filter((s) => s.category === 'customer_group');
  const matched = pool.filter((s) => s.code === code || s.code === ALL_CUSTOMER_GROUPS_CODE);
  if (matched.length === 0) return false;
  if (minLevel === 'any') return true;
  return matched.some((s) => tourSkillRank(s.level) >= tourSkillRank(minLevel));
}

/** มีทักษะการทำงานนี้หรือไม่ — "ได้ทุกประเภท" ตรงกับทุกทักษะ */
export function hasWorkSkill(
  leader: TourLeader,
  code: string,
  minLevel: TourSkillLevel | 'any' = 'any',
): boolean {
  const pool = leader.tourSkills.filter((s) => s.category === 'work_skill');
  const matched = pool.filter((s) => s.code === code || s.code === ALL_WORK_SKILLS_CODE);
  if (matched.length === 0) return false;
  if (minLevel === 'any') return true;
  return matched.some((s) => tourSkillRank(s.level) >= tourSkillRank(minLevel));
}

/* --------------------------------- เอกสาร -------------------------------- */

/** วันหมดอายุพาสปอร์ต — อ่านจากรายการเอกสาร (ไม่มีฟิลด์แยกอีกต่อไป) */
export function passportExpiryOf(leader: TourLeader): string | null {
  const passport = leader.documents
    .filter((d) => d.kind === 'passport')
    .sort((a, b) => (b.expiresAt ?? '').localeCompare(a.expiresAt ?? ''))[0];
  return passport?.expiresAt ?? null;
}

/** เอกสารเดินทางยังใช้ได้ ณ วันที่อ้างอิง (พาสปอร์ตต้องเหลืออายุ ≥ 6 เดือน) */
export function documentsValidOn(leader: TourLeader, referenceDate: string): boolean {
  const expiry = passportExpiryOf(leader);
  if (!expiry) return false; // ไม่มีพาสปอร์ต = ยังเดินทางไม่ได้
  return diffDays(referenceDate, expiry) >= 183;
}

export function passportExpired(leader: TourLeader, referenceDate: string): boolean {
  const expiry = passportExpiryOf(leader);
  if (!expiry) return true;
  return diffDays(referenceDate, expiry) < 0;
}

/* ------------------------------ ประเทศประจำ ------------------------------ */

/** ประเทศประจำหลัก */
export function primaryAssignedCountry(leader: TourLeader): string | null {
  const primary = leader.assignedCountries.find((c) => c.isPrimary);
  return primary?.countryId ?? leader.assignedCountries[0]?.countryId ?? null;
}

export function primaryAssignedCountryName(
  leader: TourLeader,
  countries: Country[],
): string {
  const id = primaryAssignedCountry(leader);
  if (!id) return '—';
  const country = countries.find((c) => c.id === id);
  return country ? country.nameEn : id;
}

/* ------------------------------ บัญชีธนาคาร ------------------------------ */

export function primaryBankAccount(leader: TourLeader) {
  return (
    leader.bankAccounts.find((b) => b.isPrimary && b.active) ??
    leader.bankAccounts.find((b) => b.active) ??
    leader.bankAccounts[0]
  );
}

/* ------------------------------ งานของหัวหน้าทัวร์ ------------------------ */

export function jobsOfLeader(jobs: TourJob[], leaderId: string): TourJob[] {
  return jobs.filter(
    (j) => j.leaderId === leaderId || j.assistantLeaderIds.includes(leaderId),
  );
}

/** ดึงรหัสสนามบินจากข้อมูลเที่ยวบินของงาน เช่น "BKK – HND" → HND */
export function jobAirportCodes(job: TourJob): string[] {
  const codes = new Set<string>();
  const collect = (routeText: string) => {
    for (const token of routeText.split(/[^A-Za-z]+/)) {
      const code = token.trim().toUpperCase();
      if (code.length === 3 && code !== 'BKK' && code !== 'DMK') codes.add(code);
    }
  };
  collect(job.outboundFlight.route);
  collect(job.inboundFlight.route);
  return Array.from(codes);
}

/** ระดับความเชี่ยวชาญสูงสุดของภาษาที่ตรงกับรายการที่ต้องการ (เทียบเป็นสัดส่วนของมาตรฐานตัวเอง) */
export function bestLanguageAmong(
  leader: TourLeader,
  wanted: string[],
): LanguageSkill | undefined {
  return leader.languages
    .filter((l) => wanted.includes(l.languageName))
    .sort((a, b) => levelFraction(b) - levelFraction(a))[0];
}

export function routeSkillRankOf(skill: TourLeaderRouteSkill): number {
  return routeSkillRank(skill.skillLevel);
}
