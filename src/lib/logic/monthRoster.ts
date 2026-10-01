/**
 * ตรรกะรายชื่อประจำเดือน (§2/§5/§12) — จัดกลุ่ม/เรียง/แนะนำ/กรอง · ตรรกะล้วน ทดสอบได้
 */

import type { LeaderType } from '@/types';

/** ข้อมูลย่อของหัวหน้าทัวร์ที่ตรรกะนี้ต้องใช้ (แยกจาก type จริงเพื่อทดสอบง่าย) */
export interface RosterLeaderInfo {
  id: string;
  /** มีงานในเดือนที่ดูหรือไม่ */
  hasJob: boolean;
  /** วันเริ่มงานที่เร็วที่สุดในเดือน (ISO) — ไม่มีงาน = null */
  firstJobDate: string | null;
  /** จำนวนงานในเดือน */
  jobCount: number;
  /** พร้อมรับงาน */
  available: boolean;
  /** มีวันลา/ช่วงไม่พร้อมในเดือน */
  hasLeave: boolean;
  /** สถานะใช้งานไม่ได้ (พักงาน/ระงับ) */
  unavailableStatus: boolean;
}

export type RosterGroupKey = 'roster' | 'outsideWithJob' | 'temporary';

export interface RosterGroups<T> {
  roster: T[];
  outsideWithJob: T[];
  temporary: T[];
}

/**
 * จัดหัวหน้าทัวร์ที่ "มองเห็นได้" (ผ่านตัวกรองแล้ว) เป็น 3 กลุ่มตามลำดับ (§2)
 *   1) รายชื่อเดือนนี้ (ตามลำดับใน roster)
 *   2) มีงานในเดือนนี้แต่ไม่อยู่ใน roster (แสดงอัตโนมัติ กันงานถูกซ่อน)
 *   3) เพิ่มชั่วคราวจากการค้นหา
 */
export function groupLeadersByRoster<T>(
  leaders: T[],
  idOf: (l: T) => string,
  hasJobOf: (l: T) => boolean,
  rosterIdsOrdered: string[],
  temporaryIds: Set<string>,
): RosterGroups<T> {
  const rosterOrder = new Map(rosterIdsOrdered.map((id, i) => [id, i]));
  const rosterSet = new Set(rosterIdsOrdered);
  const byId = new Map(leaders.map((l) => [idOf(l), l]));

  // กลุ่ม 1: เรียงตามลำดับใน roster · ข้ามคนที่ถูกกรองออก (ไม่อยู่ใน leaders)
  const roster: T[] = [];
  for (const id of rosterIdsOrdered) { const l = byId.get(id); if (l) roster.push(l); }

  const outsideWithJob: T[] = [];
  const temporary: T[] = [];
  for (const l of leaders) {
    const id = idOf(l);
    if (rosterSet.has(id)) continue;
    if (hasJobOf(l)) outsideWithJob.push(l); // §2/§8/§9 มีงานแต่ไม่อยู่ในชุด → กลุ่ม 2 อัตโนมัติ
    else if (temporaryIds.has(id)) temporary.push(l); // §6/§7 แสดงชั่วคราว
  }

  void rosterOrder;
  return { roster, outsideWithJob, temporary };
}

/* -------------------------------- การเรียง (§12) -------------------------------- */

export type RosterSortKey = 'custom' | 'name' | 'jobCount' | 'startSoon' | 'freeFirst';

/**
 * เรียงภายในกลุ่ม (§12) — ค่าเริ่มต้น 'custom' = ตามลำดับที่ผู้ใช้กำหนด (คงลำดับเดิม)
 * เกณฑ์อื่นใช้ข้อมูลจริงของเดือนที่ดู
 */
export function sortRosterLeaders<T>(
  leaders: T[],
  info: (l: T) => RosterLeaderInfo,
  nameOf: (l: T) => string,
  sortKey: RosterSortKey,
): T[] {
  if (sortKey === 'custom') return leaders; // คงลำดับ roster/ผู้ใช้กำหนด
  const arr = [...leaders];
  switch (sortKey) {
    case 'name':
      return arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'th'));
    case 'jobCount':
      return arr.sort((a, b) => info(b).jobCount - info(a).jobCount);
    case 'startSoon':
      return arr.sort((a, b) => {
        const da = info(a).firstJobDate; const db = info(b).firstJobDate;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      });
    case 'freeFirst':
      return arr.sort((a, b) => Number(info(a).hasJob) - Number(info(b).hasJob));
    default:
      return arr;
  }
}

/**
 * ลำดับความสำคัญเริ่มต้นตาม §12 (ใช้เมื่อไม่มีลำดับที่ผู้ใช้กำหนด เช่น กลุ่มนอกชุด)
 *   1 มีงานต้นเดือน → 2 มีงานในเดือน → 3 พร้อมรับงาน → 4 ยังไม่มีงาน → 5 มีวันลา → 6 ไม่พร้อม
 */
export function defaultRosterRank(i: RosterLeaderInfo): number {
  if (i.unavailableStatus) return 6;
  if (i.hasLeave && !i.hasJob) return 5;
  if (i.hasJob) return 0; // มีงาน (ต้นเดือนจัดก่อนด้วย firstJobDate เป็น tiebreak)
  if (i.available) return 2;
  return 3;
}

export function sortByDefaultRank<T>(leaders: T[], info: (l: T) => RosterLeaderInfo): T[] {
  return [...leaders].sort((a, b) => {
    const ra = defaultRosterRank(info(a)); const rb = defaultRosterRank(info(b));
    if (ra !== rb) return ra - rb;
    // ในกลุ่มมีงาน: วันเริ่มงานเร็วสุดก่อน (ต้นเดือน)
    const da = info(a).firstJobDate; const db = info(b).firstJobDate;
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return 0;
  });
}

/* -------------------- ตัวกรองหน้ากำหนดรายชื่อ — รูปแบบการร่วมงาน -------------------- */

/**
 * ตัวกรองฝั่งซ้ายของหน้ากำหนดรายชื่อ — ใช้ "รูปแบบการร่วมงาน" (leaderType) เท่านั้น
 * ห้ามใช้สถานะพร้อมรับงาน/วันลา/การมีงานมาแทน และห้ามสร้างชุดประเภทใหม่
 * (ค่าเดียวกับ LEADER_TYPE ใน labels.ts ที่ใช้ทั้งระบบ)
 */
export type RosterTypeFilter = 'all' | LeaderType;

/** ค่าเริ่มต้นทุกครั้งที่เปิดหน้าต่างกำหนดรายชื่อ = หัวหน้าทัวร์ประจำ */
export const ROSTER_TYPE_FILTER_DEFAULT: RosterTypeFilter = 'regular';

/**
 * กรองรายชื่อผู้สมัครด้วยคำค้นหา + รูปแบบการร่วมงาน
 * คำค้นหาเทียบกับ searchText (ชื่อ · ชื่อเล่น · รหัส · ประเทศ · เส้นทางที่เชี่ยวชาญ)
 */
export function filterRosterCandidates<T>(
  candidates: T[],
  search: string,
  typeFilter: RosterTypeFilter,
  searchTextOf: (c: T) => string,
  typeOf: (c: T) => LeaderType,
): T[] {
  const q = search.trim().toLowerCase();
  return candidates.filter((c) => {
    if (q && !searchTextOf(c).toLowerCase().includes(q)) return false;
    if (typeFilter !== 'all' && typeOf(c) !== typeFilter) return false;
    return true;
  });
}

/**
 * จำนวนต่อตัวกรอง (§10) — นับจากข้อมูลจริงหลังใช้คำค้นหาแล้ว เพื่อให้ตัวเลขบน chip
 * ตรงกับจำนวนที่จะแสดงเมื่อกดตัวกรองนั้น
 */
export function countRosterCandidatesByType<T>(
  candidates: T[],
  search: string,
  searchTextOf: (c: T) => string,
  typeOf: (c: T) => LeaderType,
): Record<RosterTypeFilter, number> {
  const matched = filterRosterCandidates(candidates, search, 'all', searchTextOf, typeOf);
  const counts: Record<RosterTypeFilter, number> = {
    all: matched.length, general: 0, regular: 0, freelance: 0, agent: 0,
  };
  for (const c of matched) counts[typeOf(c)] += 1;
  return counts;
}

/* ------------------------------ รายชื่อแนะนำ (§5) ------------------------------ */

/**
 * แนะนำรายชื่อจากข้อมูลจริง (§5) — ตัวช่วย ผู้ใช้ต้องกดบันทึกเอง
 * เกณฑ์: มีงานในเดือน · หรือเคยอยู่รายชื่อเดือนก่อน · โดยต้องใช้งานได้ + ไม่ลาทั้งเดือน
 */
export function suggestRoster(
  leaders: RosterLeaderInfo[],
  previousMonthIds: Set<string>,
  fullMonthLeaveIds: Set<string>,
): string[] {
  return leaders
    .filter((l) => !l.unavailableStatus)
    .filter((l) => !fullMonthLeaveIds.has(l.id)) // ไม่ลาครอบคลุมทั้งเดือน
    .filter((l) => l.hasJob || previousMonthIds.has(l.id) || l.available)
    .sort((a, b) => defaultRosterRank(a) - defaultRosterRank(b))
    .map((l) => l.id);
}
