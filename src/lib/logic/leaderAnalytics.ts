/**
 * รวมข้อมูลวิเคราะห์หัวหน้าทัวร์สำหรับหน้า "ภาพรวม" — ฟังก์ชันบริสุทธิ์ ไม่มี UI
 *
 * กติกาสำคัญ (ตามข้อกำหนด):
 *  • ทุกฟังก์ชันรับ "ลิสต์ที่กรอง/ใช้งานอยู่แล้ว" เป็น input — แหล่งเดียวกับตาราง
 *  • หนึ่งคนมีสถานะเดียว (นับครั้งเดียวในกลุ่มสถานะ)
 *  • ภาษา/ประเทศ นับหนึ่งคนได้หลายหมวด (ห้ามรวมเป็น 100%)
 *  • ประสบการณ์ใช้ค่ารวมที่คำนวณจากประวัติงาน (ไม่นับช่วงซ้อนซ้ำ · งานปัจจุบันถึงวันนี้)
 */

import type { Country, ExperienceLevelFilter, LeaderStatus, TourLeader } from '@/types';
import { TONE_HEX } from '@/lib/labels';
import type { LeaderTrip } from './leaderTrips';
import { experienceBandOf, leaderExperienceMonths } from './leaderProfile';

/* ------------------------------- กลุ่มสถานะ ------------------------------- */

/** กลุ่มตามมิติ “ความพร้อมรับงาน” (2 ค่า) — สถานะการใช้งานเป็นอีกมิติ ดู usageBlockedCount */
export type StatusGroupKey = 'available' | 'unavailable';

export interface StatusGroup {
  key: StatusGroupKey;
  label: string;
  statuses: LeaderStatus[];
  /** สี hex สำหรับ donut (ใช้ status palette ของแอป) */
  color: string;
}

/** กลุ่มความพร้อมรับงานสำหรับ donut — คลิกเพื่อกรองด้วย statusIn ได้ตรง ๆ */
export const STATUS_GROUPS: StatusGroup[] = [
  { key: 'available', label: 'พร้อมรับงาน', statuses: ['available'], color: TONE_HEX.green },
  { key: 'unavailable', label: 'ไม่พร้อมรับงาน', statuses: ['unavailable'], color: TONE_HEX.slate },
];

/** ความพร้อมรับงานที่ไม่รับงานใหม่ (ใช้กรองจากการ์ด KPI) */
export const PAUSED_INACTIVE_STATUSES: LeaderStatus[] = ['unavailable'];

export interface StatusGroupCount extends StatusGroup {
  count: number;
}

export function statusGroupCounts(leaders: TourLeader[]): StatusGroupCount[] {
  return STATUS_GROUPS.map((g) => ({
    ...g,
    count: leaders.filter((l) => g.statuses.includes(l.status)).length,
  }));
}

/* --------------------------------- KPI ---------------------------------- */

/**
 * “ติดงาน” เป็นสถานะประกอบ — นับจากกรุ๊ปที่จัดหัวหน้าทัวร์จริง (เมนูการจัดสเก็ต) ที่ครอบวันที่อ้างอิง
 * ไม่ใช่จากสถานะหลักของหัวหน้าทัวร์
 */
export function onJobLeaderCount(leaders: TourLeader[], trips: LeaderTrip[], today: string): number {
  const ids = new Set(trips.filter((t) => t.start <= today && t.end >= today).map((t) => t.leaderId));
  return leaders.filter((l) => ids.has(l.id)).length;
}

/** จำนวนคนที่สถานะการใช้งานไม่ใช่ “ใช้งาน” (ระงับการใช้งาน + สิ้นสุดการใช้งาน) */
export function usageBlockedCount(leaders: TourLeader[]): number {
  return leaders.filter((l) => l.usageStatus !== 'active').length;
}

export interface LeaderKpis {
  total: number;
  /** ความพร้อมรับงาน = พร้อมรับงาน */
  available: number;
  /** คำนวณจากงานที่ได้รับมอบหมาย ไม่ใช่ค่าที่ตั้งเอง */
  onJob: number;
  /** สถานะการใช้งาน = ระงับการใช้งาน หรือ สิ้นสุดการใช้งาน */
  usageBlocked: number;
}

export function leaderKpis(leaders: TourLeader[], trips: LeaderTrip[], today: string): LeaderKpis {
  return {
    total: leaders.length,
    available: leaders.filter((l) => l.status === 'available').length,
    onJob: onJobLeaderCount(leaders, trips, today),
    usageBlocked: usageBlockedCount(leaders),
  };
}

/* --------------------------------- ภาษา --------------------------------- */

export interface LanguageCount {
  language: string;
  count: number;
  /** จำนวนคนที่ใช้ภาษานี้เป็นภาษาแม่ (ใช้ตัดสินลำดับเมื่อจำนวนเท่ากัน) */
  nativeCount: number;
}

/** นับจำนวนคนต่อภาษา (หนึ่งคนนับได้หลายภาษา) เรียงมาก→น้อย · เท่ากันให้ภาษาแม่ก่อน */
export function languageCounts(leaders: TourLeader[]): LanguageCount[] {
  const map = new Map<string, { count: number; nativeCount: number }>();
  for (const leader of leaders) {
    const seen = new Set<string>(); // กันนับซ้ำภายในคนเดียว
    for (const lang of leader.languages) {
      if (!lang.languageName || seen.has(lang.languageName)) continue;
      seen.add(lang.languageName);
      const entry = map.get(lang.languageName) ?? { count: 0, nativeCount: 0 };
      entry.count += 1;
      if (lang.isNativeLanguage) entry.nativeCount += 1;
      map.set(lang.languageName, entry);
    }
  }
  return [...map.entries()]
    .map(([language, e]) => ({ language, count: e.count, nativeCount: e.nativeCount }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.nativeCount - a.nativeCount ||
        a.language.localeCompare(b.language, 'th'),
    );
}

/* ------------------------------- ประเทศ --------------------------------- */

export interface CountryCount {
  countryId: string;
  name: string;
  count: number;
}

/** นับจำนวนคนต่อประเทศที่เชี่ยวชาญ (หนึ่งคนนับได้หลายประเทศ) — ชื่อจาก Country Master */
export function countryCounts(leaders: TourLeader[], countries: Country[]): CountryCount[] {
  const map = new Map<string, number>();
  for (const leader of leaders) {
    const seen = new Set<string>();
    for (const skill of leader.routeSkills) {
      if (seen.has(skill.countryId)) continue;
      seen.add(skill.countryId);
      map.set(skill.countryId, (map.get(skill.countryId) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([countryId, count]) => {
      const country = countries.find((c) => c.id === countryId);
      return { countryId, name: country ? country.nameEn : countryId, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* ----------------------------- ประสบการณ์ ------------------------------- */

export type ExperienceBand = Exclude<ExperienceLevelFilter, 'any'>;

/** ลำดับและป้ายของช่วงประสบการณ์ (ใช้ร่วมกันทั้งกราฟและตัวกรอง) */
export const EXPERIENCE_BAND_ORDER: ExperienceBand[] = [
  'none',
  'lt1',
  '1to3',
  '4to6',
  '7to10',
  'gt10',
];

export const EXPERIENCE_BAND_LABEL: Record<ExperienceBand, string> = {
  none: 'ยังไม่มีข้อมูล',
  lt1: 'น้อยกว่า 1 ปี',
  '1to3': '1–3 ปี',
  '4to6': '4–6 ปี',
  '7to10': '7–10 ปี',
  gt10: 'มากกว่า 10 ปี',
};

export interface ExperienceBandCount {
  key: ExperienceBand;
  label: string;
  count: number;
}

/** จำนวนคนในแต่ละช่วงประสบการณ์ (คงทุกช่วงไว้แม้เป็น 0 เพื่อให้กราฟครบ) */
export function experienceBandCounts(leaders: TourLeader[], today: string): ExperienceBandCount[] {
  const counts = new Map<ExperienceBand, number>();
  for (const leader of leaders) {
    const band = experienceBandOf(leaderExperienceMonths(leader, today));
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return EXPERIENCE_BAND_ORDER.map((key) => ({
    key,
    label: EXPERIENCE_BAND_LABEL[key],
    count: counts.get(key) ?? 0,
  }));
}
