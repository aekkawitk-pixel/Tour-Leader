/**
 * สถานะและการเรียงลำดับของ Passport Card (§2/§5) — ตรรกะล้วน ทดสอบได้
 *
 * สถานะที่แสดงบนหัว Card มี 6 แบบ:
 *   ใช้งานได้ · ใกล้หมดอายุ · หมดอายุ · ถูกยกเลิก · สูญหาย · ปิดใช้งาน
 * สถานะการใช้งาน (ยกเลิก/สูญหาย/ปิดใช้งาน) มีน้ำหนักเหนือวันหมดอายุเสมอ
 * เพราะเล่มที่ถูกยกเลิกแล้วใช้ไม่ได้ ต่อให้ยังไม่หมดอายุ
 */

import type { MrzCheckSummary, MrzValidationStatus, PassportLifecycle } from '@/data/leaders/passportBookTypes';
import { passportStatus } from './tourLeaderMaster';

export type PassportCardStatus =
  | 'VALID' | 'EXPIRING' | 'EXPIRED' | 'REVOKED' | 'LOST' | 'INACTIVE' | 'UNKNOWN';

export const PASSPORT_CARD_STATUS_META: Record<PassportCardStatus, { label: string; tone: string }> = {
  VALID: { label: 'ใช้งานได้', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  EXPIRING: { label: 'ใกล้หมดอายุ', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  EXPIRED: { label: 'หมดอายุ', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  REVOKED: { label: 'ถูกยกเลิก', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  LOST: { label: 'สูญหาย', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  INACTIVE: { label: 'ปิดใช้งาน', tone: 'bg-slate-100 text-slate-600 ring-slate-300' },
  UNKNOWN: { label: 'ไม่ทราบสถานะ', tone: 'bg-slate-100 text-slate-600 ring-slate-300' },
};

/** สถานะที่แสดงบนหัว Card */
export function passportCardStatus(
  lifecycle: PassportLifecycle, expiryISO: string | null, todayISO: string,
): PassportCardStatus {
  if (lifecycle === 'REVOKED') return 'REVOKED';
  if (lifecycle === 'LOST') return 'LOST';
  if (lifecycle === 'INACTIVE') return 'INACTIVE';

  const st = passportStatus(expiryISO, todayISO);
  if (st === 'UNKNOWN') return 'UNKNOWN';
  if (st === 'EXPIRED') return 'EXPIRED';
  if (st === 'VALID') return 'VALID';
  return 'EXPIRING'; // EXPIRING_WITHIN_30/90/180_DAYS
}

/** ใช้เป็นเล่มหลักได้หรือไม่ (§7 เดิม + สถานะการใช้งาน) */
export function canBePrimary(status: PassportCardStatus): boolean {
  return status === 'VALID' || status === 'EXPIRING';
}

/**
 * สถานะการตรวจสอบ MRZ ที่แสดงต่อผู้ใช้ (§4)
 *   • ไม่ได้อ่าน MRZ → ไม่สามารถตรวจสอบ MRZ ได้
 *   • อ่านได้ + Check Digit ผ่าน + ไม่ขัดกับหน้าเล่ม → ตรวจสอบ MRZ ผ่าน
 *   • อ่านได้แต่ Check Digit ไม่ผ่าน หรือขัดกับหน้าเล่ม → MRZ ไม่ตรงกับข้อมูลบนเล่ม
 */
export function mrzValidationStatus(mrz: MrzCheckSummary | null): MrzValidationStatus {
  if (!mrz || !mrz.parsed) return 'UNVERIFIABLE';
  const checksOk = mrz.passportNoValid !== false
    && mrz.dateOfBirthValid !== false
    && mrz.expiryValid !== false
    && mrz.compositeValid !== false;
  if (checksOk && !mrz.vizMismatch) return 'PASSED';
  return 'MISMATCH';
}

/**
 * ลำดับกลุ่มสำหรับการเรียง (§5)
 *   0 = ใช้งานได้ · 1 = ใกล้หมดอายุ · 2 = หมดอายุ/ปิดใช้งาน/ยกเลิก/สูญหาย
 */
export function statusOrder(status: PassportCardStatus): number {
  switch (status) {
    case 'VALID': return 0;
    case 'EXPIRING': return 1;
    default: return 2;
  }
}

export interface SortableCard {
  isPrimary: boolean;
  status: PassportCardStatus;
  expiryDate: string | null;
}

/** ผลตรวจว่า Action หนึ่งใช้ได้หรือไม่ + เหตุผลเมื่อใช้ไม่ได้ (§2 Disable + Tooltip) */
export interface ActionGate {
  enabled: boolean;
  reason?: string;
}

export interface CardActionEligibility {
  setPrimary: ActionGate;
  deactivate: ActionGate;
  delete: ActionGate;
}

/**
 * เงื่อนไขการใช้งาน Action ของแต่ละ Card (§2)
 * @param card เล่มปัจจุบัน
 * @param otherBookCount จำนวนเล่มอื่นของหัวหน้าทัวร์คนเดียวกัน
 * @param referenced ถูกอ้างอิงในงานทัวร์/เอกสาร/วีซ่า/ตั๋วหรือไม่
 */
export function cardActionEligibility(
  card: { isPrimary: boolean; status: PassportCardStatus; lifecycle: PassportLifecycle },
  otherBookCount: number,
  referenced: boolean,
): CardActionEligibility {
  // เล่มหลักที่ยังมีเล่มอื่น → ต้องตั้งเล่มใหม่เป็นหลักก่อน จึงปิดใช้งาน/ลบได้
  const primaryLocked = card.isPrimary && otherBookCount > 0;
  const primaryLockReason = 'ตั้งเล่มอื่นเป็นเล่มหลักก่อน จึงจะปิดใช้งานหรือลบเล่มนี้ได้';

  return {
    setPrimary: card.isPrimary
      ? { enabled: false, reason: 'เล่มนี้เป็นเล่มหลักอยู่แล้ว' }
      : canBePrimary(card.status)
        ? { enabled: true }
        : { enabled: false, reason: 'เล่มที่หมดอายุหรือใช้งานไม่ได้ ตั้งเป็นเล่มหลักไม่ได้' },

    deactivate: primaryLocked
      ? { enabled: false, reason: primaryLockReason }
      : { enabled: true },

    delete: referenced
      ? { enabled: false, reason: 'เล่มนี้ถูกอ้างอิงในงานทัวร์/เอกสาร/วีซ่า/ตั๋ว จึงลบไม่ได้' }
      : primaryLocked
        ? { enabled: false, reason: primaryLockReason }
        : { enabled: true },
  };
}

/**
 * เรียงตาม §5: เล่มหลัก → ใช้งานได้ (หมดอายุช้าสุดก่อน) → ใกล้หมดอายุ → หมดอายุ/ปิดใช้งาน
 * ไม่แก้ไขอาร์เรย์เดิม
 */
export function sortPassportCards<T extends SortableCard>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const order = statusOrder(a.status) - statusOrder(b.status);
    if (order !== 0) return order;
    // วันหมดอายุล่าสุด (ไกลที่สุด) ขึ้นก่อน · ไม่มีวันหมดอายุไปท้ายสุด
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return b.expiryDate.localeCompare(a.expiryDate);
  });
}
