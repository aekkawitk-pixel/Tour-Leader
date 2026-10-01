/**
 * Tour Leader Master Service (§14) — จุดเดียวที่ทุกหน้าเรียกใช้ข้อมูลหัวหน้าทัวร์ (Master)
 *
 * แหล่งข้อมูล = ไฟล์นำเข้าจริง (tourLeaderMaster.seed) · เปลี่ยนเป็น REST/DB ได้ที่ Service นี้จุดเดียว
 * ข้อมูลเอกสารสำคัญเข้าถึงผ่าน getIdentityDocument() ที่ตรวจสิทธิ์ (§8/§9)
 */

import {
  TOUR_LEADER_PROFILES, TOUR_LEADER_IDENTITIES, TOUR_LEADER_IMPORT_META,
} from '@/data/leaders/tourLeaderMaster.seed';
import { passportStatus } from '@/lib/logic/tourLeaderMaster';
import type {
  LeaderImportMeta, LeaderValidationStatus, PassportStatus, TourLeaderIdentityDocument, TourLeaderProfile,
} from '@/data/leaders/masterTypes';

export interface LeaderMasterFilters {
  search?: string; // ชื่อไทย/อังกฤษ/ชื่อเล่น/เบอร์
  validationStatus?: LeaderValidationStatus;
  activeOnly?: boolean;
  passportStatus?: PassportStatus;
  today?: string; // สำหรับกรองตามสถานะหนังสือเดินทาง
}

const identityById = new Map(TOUR_LEADER_IDENTITIES.map((d) => [d.tourLeaderId, d]));

/** ดึงโปรไฟล์หัวหน้าทัวร์ (ผ่านตัวกรอง) — Master กลาง */
export function getTourLeaderProfiles(filters: LeaderMasterFilters = {}): TourLeaderProfile[] {
  let rows = TOUR_LEADER_PROFILES;
  const f = filters;
  if (f.activeOnly) rows = rows.filter((p) => p.activeStatus === 'ACTIVE');
  if (f.validationStatus) rows = rows.filter((p) => p.validationStatus === f.validationStatus);
  if (f.passportStatus && f.today) {
    rows = rows.filter((p) => passportStatus(identityById.get(p.tourLeaderId)?.passportExpiryDate ?? null, f.today!) === f.passportStatus);
  }
  if (f.search) {
    const q = f.search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    rows = rows.filter((p) =>
      [p.fullNameTH, p.fullNameEN, p.firstNameTH ?? '', p.lastNameTH ?? '', p.firstNameEN ?? '', p.lastNameEN ?? '', p.nickName ?? '', p.displayName].join(' ').toLowerCase().includes(q) ||
      (digits.length >= 3 && (p.contactNumberNormalized ?? '').includes(digits)),
    );
  }
  return rows;
}

/** ดึงตาม tourLeaderId (PK) */
export function getTourLeaderById(tourLeaderId: string): TourLeaderProfile | null {
  return TOUR_LEADER_PROFILES.find((p) => p.tourLeaderId === tourLeaderId) ?? null;
}

/**
 * ข้อมูลเอกสารสำคัญ (§8/§9) — ต้องส่ง canViewFull ที่ผ่านการตรวจสิทธิ์แล้ว
 *   canViewFull=false → คืน null (ผู้เรียกต้อง Mask จาก field ที่จำเป็นเท่านั้น)
 */
export function getIdentityDocument(tourLeaderId: string, canViewFull: boolean): TourLeaderIdentityDocument | null {
  if (!canViewFull) return null;
  return identityById.get(tourLeaderId) ?? null;
}

/** วันหมดอายุหนังสือเดินทาง (เปิดเผยได้เฉพาะวันหมดอายุ — ใช้แจ้งเตือน §15 · ไม่ใช่เลขเอกสาร) */
export function getPassportExpiry(tourLeaderId: string): string | null {
  return identityById.get(tourLeaderId)?.passportExpiryDate ?? null;
}

/** สรุปคำเตือนหนังสือเดินทาง (§15) */
export function getPassportWarnings(today: string): { expired: number; within30: number; within90: number; within180: number } {
  let expired = 0, within30 = 0, within90 = 0, within180 = 0;
  for (const p of TOUR_LEADER_PROFILES) {
    const st = passportStatus(identityById.get(p.tourLeaderId)?.passportExpiryDate ?? null, today);
    if (st === 'EXPIRED') expired++;
    else if (st === 'EXPIRING_WITHIN_30_DAYS') within30++;
    else if (st === 'EXPIRING_WITHIN_90_DAYS') within90++;
    else if (st === 'EXPIRING_WITHIN_180_DAYS') within180++;
  }
  return { expired, within30, within90, within180 };
}

/** เมทาดาทาการนำเข้า (§16 Import Report) */
export function getImportMeta(): LeaderImportMeta {
  return TOUR_LEADER_IMPORT_META;
}

/** โปรไฟล์ทั้งหมด (ให้ adapter/สโตร์ใช้ป้อนเข้าเมนู/ตารางจัด) */
export function getAllTourLeaderProfiles(): TourLeaderProfile[] {
  return TOUR_LEADER_PROFILES;
}
