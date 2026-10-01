/**
 * ฟังก์ชันช่วยของโมดูลหัวหน้าทัวร์ — ฟังก์ชันบริสุทธิ์ ไม่มี UI
 * (ตรวจซ้ำ / เปลี่ยนรายการหลัก / ปิดบังข้อมูล / สร้างรหัส / ตรวจความสัมพันธ์เส้นทาง)
 */

import type {
  AssignedCountry,
  ContactChannel,
  Country,
  LeaderAddress,
  LeaderBankAccount,
  LeaderDocument,
  TourLeader,
  TourLeaderRouteSkill,
  TourRoute,
  TourTypeSkill,
} from '@/types';
import { SENSITIVE_DOCUMENT_KINDS } from '@/lib/labels';
import { LEADER_CODE_DIGITS, LEADER_CODE_PREFIX } from './constants';

/* ------------------------------ สร้าง ID ที่คงที่ ----------------------------- */

let seq = 0;

/** ID ของ child record ต้องคงที่และไม่ใช้ index ของ array */
export function newChildId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/* -------------------------------- รหัสหัวหน้าทัวร์ ------------------------------ */

/** อ่านลำดับตัวเลขจากรหัส เช่น "TL-0012" → 12 (คืน null ถ้ารูปแบบไม่ตรง) */
export function parseLeaderCodeNumber(code: string): number | null {
  const match = code.trim().toUpperCase().match(new RegExp(`^${LEADER_CODE_PREFIX}-(\\d+)$`));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isNaN(n) ? null : n;
}

/** จัดรูปแบบลำดับเป็นรหัส เช่น 12 → "TL-0012" (เติมศูนย์ให้ครบ 4 หลัก) */
export function formatLeaderCode(sequence: number): string {
  return `${LEADER_CODE_PREFIX}-${String(sequence).padStart(LEADER_CODE_DIGITS, '0')}`;
}

/** หารหัสถัดไปจากชุดรหัสที่มีอยู่ — เพิ่มลำดับจากค่าสูงสุดขึ้น 1 */
export function nextLeaderCodeFromCodes(codes: Iterable<string>): string {
  let max = 0;
  for (const code of codes) {
    const n = parseLeaderCodeNumber(code);
    if (n !== null && n > max) max = n;
  }
  return formatLeaderCode(max + 1);
}

/** สร้างรหัสถัดไปที่ไม่ซ้ำ เช่น TL-0013 (ใช้พรีวิวบนหน้าจอ) */
export function generateLeaderCode(existing: TourLeader[]): string {
  return nextLeaderCodeFromCodes(existing.map((l) => l.id));
}

export function isLeaderCodeUnique(
  code: string,
  existing: TourLeader[],
  ignoreId?: string,
): boolean {
  const key = code.trim().toLowerCase();
  return !existing.some((l) => l.id.toLowerCase() === key && l.id !== ignoreId);
}

/**
 * ตัวจ่ายรหัสหัวหน้าทัวร์ — ใช้ที่ชั้น service (จำลองเซิร์ฟเวอร์/ฐานข้อมูล)
 * `allocate()` สร้างและ "จอง" รหัสในจังหวะเดียวแบบ synchronous ก่อนมี await ใด ๆ
 * → เมื่อมีผู้ใช้กดบันทึกพร้อมกัน แต่ละคำขอจะได้รหัสไม่ซ้ำกัน
 */
export interface LeaderCodeAllocator {
  /** ออกรหัสถัดไปที่ไม่ซ้ำ พร้อมจองไว้ทันที */
  allocate(): string;
  /** รหัสนี้ถูกใช้/จองไปแล้วหรือยัง */
  has(code: string): boolean;
  /**
   * เพิ่มรหัสที่มีอยู่จริงเข้าชุดที่ถูกใช้ โดย **ไม่ลบรหัสที่จองไว้แล้ว**
   * ใช้ซิงก์กับข้อมูลที่บันทึกไว้ (localStorage/แท็บอื่น) ก่อนออกรหัสใหม่
   */
  add(codes: Iterable<string>): void;
  /** ล้างและตั้งชุดรหัสตั้งต้นใหม่ (ใช้ตอนรีเซ็ตข้อมูล Demo) */
  reset(seedCodes: Iterable<string>): void;
}

export function createLeaderCodeAllocator(
  seedCodes: Iterable<string> = [],
): LeaderCodeAllocator {
  const used = new Set<string>();
  const norm = (code: string) => code.trim().toUpperCase();
  const seed = (codes: Iterable<string>) => {
    for (const code of codes) {
      if (code.trim()) used.add(norm(code));
    }
  };
  seed(seedCodes);

  return {
    allocate() {
      const code = nextLeaderCodeFromCodes(used);
      used.add(norm(code));
      return code;
    },
    has(code) {
      return used.has(norm(code));
    },
    add(codes) {
      seed(codes);
    },
    reset(codes) {
      used.clear();
      seed(codes);
    },
  };
}

/* --------------------------------- ปิดบังข้อมูล -------------------------------- */

/** ปิดบังเลขบัญชีธนาคาร: เก็บเฉพาะ 4 ตัวท้าย */
export function maskAccountNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return 'xxx-x-xxxxx-x';
  const tail = digits.slice(-4);
  return `xxx-x-x${tail}-x`;
}

/** ปิดบังเลขเอกสารอ่อนไหว (บัตรประชาชน / พาสปอร์ต) */
export function maskDocumentNumber(kind: LeaderDocument['kind'], raw: string): string {
  if (!SENSITIVE_DOCUMENT_KINDS.includes(kind)) return raw.trim();
  const clean = raw.trim();
  if (clean.length <= 4) return clean ? `xxxx${clean}` : 'xxxxxxxx';
  return `${'x'.repeat(Math.max(2, clean.length - 4))}${clean.slice(-4)}`;
}

/** ปิดบังค่าที่จะบันทึกลงประวัติการเปลี่ยนแปลง */
export function maskForAudit(value: string): string {
  const clean = value.trim();
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}

/* ----------------------------- รายการหลัก (Primary) ---------------------------- */

/** กำหนดช่องทางติดต่อหลัก — ยกเลิก isPrimary ของรายการเดิมทั้งหมด */
export function setPrimaryContact(
  contacts: ContactChannel[],
  id: string,
): ContactChannel[] {
  return contacts.map((c) => ({ ...c, isPrimary: c.id === id }));
}

/** ลบช่องทางติดต่อ — ถ้าลบรายการหลัก ให้เลื่อนรายการแรกขึ้นแทน */
export function removeContact(contacts: ContactChannel[], id: string): ContactChannel[] {
  const next = contacts.filter((c) => c.id !== id);
  if (next.length > 0 && !next.some((c) => c.isPrimary)) {
    next[0] = { ...next[0], isPrimary: true };
  }
  return next;
}

/** กำหนดบัญชีธนาคารหลัก — ยกเลิกบัญชีหลักเดิม */
export function setPrimaryBankAccount(
  accounts: LeaderBankAccount[],
  id: string,
): LeaderBankAccount[] {
  return accounts.map((a) => ({ ...a, isPrimary: a.id === id }));
}

export function removeBankAccount(
  accounts: LeaderBankAccount[],
  id: string,
): LeaderBankAccount[] {
  const next = accounts.filter((a) => a.id !== id);
  if (next.length > 0 && !next.some((a) => a.isPrimary)) {
    next[0] = { ...next[0], isPrimary: true };
  }
  return next;
}

/** กำหนดประเทศประจำหลัก — ได้เพียงหนึ่งประเทศ */
export function setPrimaryAssignedCountry(
  list: AssignedCountry[],
  id: string,
): AssignedCountry[] {
  return list.map((c) => ({ ...c, isPrimary: c.id === id }));
}

export function removeAssignedCountry(list: AssignedCountry[], id: string): AssignedCountry[] {
  const next = list.filter((c) => c.id !== id);
  if (next.length > 0 && !next.some((c) => c.isPrimary)) {
    next[0] = { ...next[0], isPrimary: true };
  }
  return next;
}

/* ------------------------------- ตรวจข้อมูลซ้ำ -------------------------------- */

export function hasDuplicateAssignedCountry(
  list: AssignedCountry[],
  countryId: string,
): boolean {
  return list.some((c) => c.countryId === countryId);
}

export function hasDuplicateRouteCountry(
  skills: TourLeaderRouteSkill[],
  countryId: string,
): boolean {
  return skills.some((s) => s.countryId === countryId);
}

export function hasDuplicateTourSkill(
  skills: TourTypeSkill[],
  masterId: string,
  category: TourTypeSkill['category'],
): boolean {
  return skills.some((s) => s.masterId === masterId && s.category === category);
}

/* --------------------------- ความสัมพันธ์ประเทศ ↔ เส้นทาง --------------------------- */

/**
 * เมื่อเปลี่ยนประเทศของรายการความเชี่ยวชาญ ต้องล้างเส้นทางที่ไม่อยู่ในประเทศใหม่
 * และเมื่อเลือก "ทุกเส้นทาง" ต้องไม่บันทึก routeIds
 */
export function normalizeRouteSkill(
  skill: TourLeaderRouteSkill,
  routes: TourRoute[],
): TourLeaderRouteSkill {
  if (skill.coverage === 'all_routes') {
    return { ...skill, routeIds: [] };
  }
  const validIds = new Set(
    routes.filter((r) => r.countryId === skill.countryId).map((r) => r.id),
  );
  return {
    ...skill,
    // ตัดเส้นทางที่ไม่อยู่ในประเทศนี้ออก และตัดรายการซ้ำ
    routeIds: Array.from(new Set(skill.routeIds.filter((id) => validIds.has(id)))),
  };
}

export function normalizeAllRouteSkills(
  skills: TourLeaderRouteSkill[],
  routes: TourRoute[],
): TourLeaderRouteSkill[] {
  return skills.map((s) => normalizeRouteSkill(s, routes));
}

/* ----------------------------------- เอกสาร ---------------------------------- */

/** หนังสือเดินทางที่ใช้อยู่ (ใบล่าสุดตามวันหมดอายุ) */
export function passportOf(leader: TourLeader): LeaderDocument | undefined {
  return leader.documents
    .filter((d) => d.kind === 'passport')
    .sort((a, b) => (b.expiresAt ?? '').localeCompare(a.expiresAt ?? ''))[0];
}

/** วันหมดอายุพาสปอร์ต — ใช้แทนฟิลด์ passportExpiry เดิม */
export function passportExpiryOf(leader: TourLeader): string | null {
  return passportOf(leader)?.expiresAt ?? null;
}

/* --------------------------------- อายุ / ที่อยู่ -------------------------------- */

/**
 * คำนวณอายุจากวันเกิด ณ วันที่อ้างอิง
 * ⚠️ ไม่เก็บอายุลงฐานข้อมูล เพราะอายุเปลี่ยนตามเวลา — คำนวณตอนแสดงผลเท่านั้น
 */
export function calculateAge(birthDate: string, referenceDate: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ry, rm, rd] = referenceDate.split('-').map(Number);
  if (!by || !ry) return null;

  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/** ที่อยู่แบบรวมสำหรับแสดงผล — เว้นส่วนที่ไม่มีข้อมูล */
export function formatAddress(address: LeaderAddress, countries: Country[]): string {
  const country = countries.find((c) => c.id === address.countryId);
  const parts = [
    address.houseNo,
    address.building,
    address.villageNo ? `หมู่ ${address.villageNo}` : '',
    address.alley ? `ซอย${address.alley}` : '',
    address.road ? `ถนน${address.road}` : '',
    address.subdistrict,
    address.district,
    address.province,
    address.postalCode,
    country && country.id !== 'C-TH' ? country.nameTh : '',
  ].filter((p) => p && p.trim() !== '');

  return parts.length > 0 ? parts.join(' ') : '—';
}

export const EMPTY_ADDRESS: LeaderAddress = {
  houseNo: '',
  countryId: 'C-TH',
};

/* ------------------------------- ชื่อและ Avatar ------------------------------- */

export function fullNameTh(leader: TourLeader): string {
  return `${leader.firstName} ${leader.lastName}`.trim();
}

export function fullNameEn(leader: TourLeader): string {
  return `${leader.firstNameEn} ${leader.lastNameEn}`.trim();
}

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.slice(0, 1)}${lastName.slice(0, 1)}` || '—';
}
