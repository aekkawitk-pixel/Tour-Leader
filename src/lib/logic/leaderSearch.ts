/** ตรรกะค้นหาและกรองหัวหน้าทัวร์ — แยกจาก UI ทั้งหมด */

import type {
  Country,
  LeaderFilter,
  LeaderStatus,
  TourJob,
  TourLeader,
  TourRoute,
} from '@/types';

/** ความพร้อมรับงานที่ซ่อนจากรายการปกติ (เว้นแต่ผู้ใช้ขอแสดง) */
const UNAVAILABLE_STATUSES = new Set<LeaderStatus>(['unavailable']);
import { routeSkillRank } from '@/lib/labels';
import { findConflictsForLeader } from './conflicts';
import {
  coversAirport,
  coversRoute,
  documentsValidOn,
  hasCustomerGroup,
  hasLanguageAtLeast,
  hasWorkSkill,
  experienceBandOf,
  leaderExperienceMonths,
  leaderSearchText,
  matchesRouteQuery,
  skillForCountry,
} from './leaderProfile';
import type { ExperienceLevelFilter } from '@/types';

function matchesExperienceLevel(months: number, level: ExperienceLevelFilter): boolean {
  if (level === 'any') return true;
  return experienceBandOf(months) === level;
}

export const EMPTY_LEADER_FILTER: LeaderFilter = {
  query: '',
  status: 'all',
  leaderType: 'all',
  statusIn: [],
  assignedCountryId: 'all',
  province: 'all',
  availableBy: '',
  activeOnly: true,
  showUnavailable: false,
  sortBy: 'updatedAt',
  sortDir: 'desc',
  languages: [],
  minLevelCode: null,
  experienceLevel: 'any',
  countryIds: [],
  routeId: 'all',
  airportCode: '',
  customerGroupCode: 'all',
  workSkillCode: 'all',
  minRouteLevel: 'any',
  minTripCount: '',
  minRating: '',
  documentsValid: false,
  freeFrom: '',
  freeTo: '',
};

export function isFilterActive(filter: LeaderFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.status !== 'all' ||
    filter.statusIn.length > 0 ||
    filter.leaderType !== 'all' ||
    filter.assignedCountryId !== 'all' ||
    filter.province !== 'all' ||
    filter.availableBy !== '' ||
    !filter.activeOnly ||
    filter.showUnavailable ||
    filter.languages.length > 0 ||
    filter.minLevelCode !== null ||
    filter.experienceLevel !== 'any' ||
    filter.countryIds.length > 0 ||
    filter.routeId !== 'all' ||
    filter.airportCode.trim() !== '' ||
    filter.customerGroupCode !== 'all' ||
    filter.workSkillCode !== 'all' ||
    filter.minRouteLevel !== 'any' ||
    filter.minTripCount.trim() !== '' ||
    filter.minRating.trim() !== '' ||
    filter.documentsValid ||
    (filter.freeFrom !== '' && filter.freeTo !== '')
  );
}

/** จำนวนตัวกรองที่กำลังใช้งาน — ใช้แสดงบนปุ่ม "ตัวกรอง (N)" (ไม่นับช่องค้นหา) */
export function countActiveFilters(filter: LeaderFilter): number {
  let n = 0;
  if (filter.status !== 'all') n++;
  if (filter.statusIn.length > 0) n++;
  if (filter.leaderType !== 'all') n++;
  if (filter.assignedCountryId !== 'all') n++;
  if (filter.province !== 'all') n++;
  if (filter.availableBy !== '') n++;
  if (!filter.activeOnly) n++;
  if (filter.showUnavailable) n++;
  if (filter.languages.length > 0) n++;
  if (filter.minLevelCode !== null) n++;
  if (filter.experienceLevel !== 'any') n++;
  if (filter.countryIds.length > 0) n++;
  if (filter.routeId !== 'all') n++;
  if (filter.airportCode.trim() !== '') n++;
  if (filter.customerGroupCode !== 'all') n++;
  if (filter.workSkillCode !== 'all') n++;
  if (filter.minRouteLevel !== 'any') n++;
  if (filter.minTripCount.trim() !== '') n++;
  if (filter.minRating.trim() !== '') n++;
  if (filter.documentsValid) n++;
  if (filter.freeFrom !== '' && filter.freeTo !== '') n++;
  return n;
}

export interface SearchContext {
  countries: Country[];
  routes: TourRoute[];
  jobs: TourJob[];
  today: string;
  /**
   * ข้อความค้นหาจากความเชี่ยวชาญ (โซน / ประเทศ / รหัสสนามบิน) ของหัวหน้าทัวร์รายนั้น
   * ผู้เรียกเป็นคนอ่านจาก Expertise Scope Store แล้วส่งเข้ามา — โมดูลนี้จึงไม่ต้องผูกกับ storage
   * ไม่ส่งมา = ไม่ค้นจากความเชี่ยวชาญ (ยังค้นชื่อ/รหัส/ช่องทางติดต่อได้ตามเดิม)
   */
  expertiseTextOf?: (leaderId: string) => string;
}

export function filterLeaders(
  leaders: TourLeader[],
  filter: LeaderFilter,
  ctx: SearchContext,
): TourLeader[] {
  const filtered = leaders.filter((leader) => {
    /* ---- สถานะข้อมูล (ปิดใช้งาน = ไม่ลบ แต่ซ่อนจากรายการปกติ) ---- */
    if (filter.activeOnly && !leader.active) return false;

    /* ---- ชื่อ / รหัส / ชื่อเล่น / โทรศัพท์ / อีเมล / เส้นทาง ---- */
    const q = filter.query.trim().toLowerCase();
    if (q) {
      const inProfile = leaderSearchText(leader).includes(q);
      const inRoute = matchesRouteQuery(leader, ctx.countries, ctx.routes, q);
      // ค้นจากความเชี่ยวชาญที่ผู้ใช้กำหนดเอง — โซน / ประเทศ / รหัสสนามบิน
      const inExpertise = (ctx.expertiseTextOf?.(leader.id) ?? '').toLowerCase().includes(q);
      if (!inProfile && !inRoute && !inExpertise) return false;
    }

    /* ---- ประเภทหัวหน้าทัวร์ (แยกจากสถานะรับงาน) ---- */
    if (filter.leaderType !== 'all' && leader.leaderType !== filter.leaderType) return false;

    /* ---- ประเทศประจำ ---- */
    if (
      filter.assignedCountryId !== 'all' &&
      !leader.assignedCountries.some((a) => a.countryId === filter.assignedCountryId)
    ) {
      return false;
    }

    /* ---- จังหวัดที่พักอาศัย ---- */
    if (filter.province !== 'all' && leader.address.province !== filter.province) return false;

    /* ---- พร้อมเริ่มงานภายในวันที่ ---- */
    if (filter.availableBy && leader.availableStartDate > filter.availableBy) return false;

    /* ---- สถานะพร้อมรับงาน ---- */
    if (filter.status !== 'all' && leader.status !== filter.status) return false;

    /* ---- ชุดสถานะ (กลุ่มจากหน้าภาพรวม) ---- */
    if (filter.statusIn.length > 0 && !filter.statusIn.includes(leader.status)) return false;

    /* ---- ซ่อนคนที่ไม่พร้อมรับงาน (ลาพัก/ระงับ/ไม่พร้อม) เมื่อไม่ได้เจาะจงสถานะ ----
       เปลี่ยนสถานะเป็นค่าเหล่านี้ → หายจากรายการปกติทันที
       (ยังหาเจอได้ด้วยตัวกรองสถานะ หรือติ๊ก "แสดงคนที่ไม่พร้อมรับงานด้วย") */
    if (
      !filter.showUnavailable &&
      filter.status === 'all' &&
      filter.statusIn.length === 0 &&
      UNAVAILABLE_STATUSES.has(leader.status)
    ) {
      return false;
    }

    /* ---- ภาษา + ระดับขั้นต่ำ ----
       เลือกหลายภาษา = ผ่านถ้ามี "อย่างน้อย 1 ภาษา" ที่เข้าเงื่อนไขระดับ
       minLevelCode ตีความตามมาตรฐานของแต่ละภาษาเอง (เทียบข้ามมาตรฐานกันตรง ๆ ไม่ได้) */
    if (filter.languages.length > 0) {
      if (!filter.languages.some((lang) => hasLanguageAtLeast(leader, lang, filter.minLevelCode))) {
        return false;
      }
    }

    /* ---- ระดับประสบการณ์ทำงานรวม ---- */
    if (
      filter.experienceLevel !== 'any' &&
      !matchesExperienceLevel(leaderExperienceMonths(leader, ctx.today), filter.experienceLevel)
    ) {
      return false;
    }

    /* ---- ประเทศ (เลือกได้หลายประเทศ — เชี่ยวชาญประเทศใดประเทศหนึ่งก็ผ่าน) ---- */
    const countrySkills = filter.countryIds
      .map((id) => skillForCountry(leader, id))
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (filter.countryIds.length > 0 && countrySkills.length === 0) return false;

    /* ---- เส้นทางย่อย (all_routes ต้องครอบคลุมด้วย) ---- */
    if (filter.routeId !== 'all') {
      const route = ctx.routes.find((r) => r.id === filter.routeId);
      if (!route || !coversRoute(leader, route)) return false;
    }

    /* ---- รหัสสนามบิน ---- */
    if (filter.airportCode.trim()) {
      if (!coversAirport(leader, ctx.routes, filter.airportCode)) return false;
    }

    /* ---- ระดับความเชี่ยวชาญขั้นต่ำ / จำนวนครั้งขั้นต่ำ ---- */
    if (filter.minRouteLevel !== 'any' || filter.minTripCount.trim()) {
      // จำกัดที่ประเทศที่เลือกไว้ ถ้าไม่ได้เลือกประเทศจึงดูจากทุกเส้นทางที่ถนัด
      const pool = countrySkills.length > 0 ? countrySkills : leader.routeSkills;
      if (pool.length === 0) return false;

      const passLevel =
        filter.minRouteLevel === 'any'
          ? true
          : pool.some(
              (s) => routeSkillRank(s.skillLevel) >= routeSkillRank(filter.minRouteLevel as never),
            );
      if (!passLevel) return false;

      const minTrips = Number(filter.minTripCount);
      if (filter.minTripCount.trim() && !Number.isNaN(minTrips)) {
        if (!pool.some((s) => (s.tripCount ?? 0) >= minTrips)) return false;
      }
    }

    /* ---- ประเภทกลุ่มลูกค้า / ทักษะ ---- */
    if (filter.customerGroupCode !== 'all' && !hasCustomerGroup(leader, filter.customerGroupCode))
      return false;
    if (filter.workSkillCode !== 'all' && !hasWorkSkill(leader, filter.workSkillCode)) return false;

    /* ---- คะแนนประเมินขั้นต่ำ ---- */
    const minRating = Number(filter.minRating);
    if (filter.minRating.trim() && !Number.isNaN(minRating) && leader.rating < minRating)
      return false;

    /* ---- เอกสารเดินทางยังไม่หมดอายุ ---- */
    if (filter.documentsValid && !documentsValidOn(leader, ctx.today)) return false;

    /* ---- ไม่มีงานซ้อนในช่วงเวลาที่ระบุ ---- */
    if (filter.freeFrom && filter.freeTo) {
      const probe = {
        id: '__probe__',
        departDate: filter.freeFrom,
        returnDate: filter.freeTo,
      } as TourJob;
      if (findConflictsForLeader(leader.id, probe, ctx.jobs).length > 0) return false;
    }

    return true;
  });

  return sortLeaders(filtered, filter, ctx.today);
}

/** เรียงลำดับ: ชื่อ / คะแนน / จำนวนงาน / ประสบการณ์ / วันที่แก้ไขล่าสุด */
export function sortLeaders(
  leaders: TourLeader[],
  filter: LeaderFilter,
  today?: string,
): TourLeader[] {
  const dir = filter.sortDir === 'asc' ? 1 : -1;
  return [...leaders].sort((a, b) => {
    switch (filter.sortBy) {
      case 'name':
        return dir * `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'th');
      case 'rating':
        return dir * (a.rating - b.rating);
      case 'jobs':
        return dir * (a.totalJobs - b.totalJobs);
      case 'experience': {
        const am = today ? leaderExperienceMonths(a, today) : 0;
        const bm = today ? leaderExperienceMonths(b, today) : 0;
        return dir * (am - bm);
      }
      case 'updatedAt':
      default:
        return dir * a.updatedAt.localeCompare(b.updatedAt);
    }
  });
}
