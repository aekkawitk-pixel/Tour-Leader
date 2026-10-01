/**
 * Tour Leader Master — ตรรกะแสดงผล/ตรวจสอบ (แยกจากข้อมูล)
 *   displayName (§4) · Passport Status (§15) · Mask ข้อมูลสำคัญ (§8) · Validation (§18)
 */

import { addDays } from '@/lib/format';
import type {
  LeaderValidationStatus, PassportStatus, TourLeaderIdentityDocument, TourLeaderProfile,
} from '@/data/leaders/masterTypes';

/** ชื่อที่ใช้แสดง (§4) — nickName ?? firstNameTH ?? firstNameEN ?? "ไม่ระบุชื่อ" */
export function displayNameOf(p: Pick<TourLeaderProfile, 'nickName' | 'firstNameTH' | 'firstNameEN'>): string {
  return p.nickName ?? p.firstNameTH ?? p.firstNameEN ?? 'ไม่ระบุชื่อ';
}

/* ------------------------------ Passport Status (§15) ------------------------------ */

export type PassportTone = 'red' | 'orange' | 'amber' | 'sky' | 'green' | 'slate';
export const PASSPORT_STATUS_META: Record<PassportStatus, { label: string; tone: PassportTone }> = {
  EXPIRED: { label: 'หมดอายุแล้ว', tone: 'red' },
  EXPIRING_WITHIN_30_DAYS: { label: 'ใกล้หมดอายุภายใน 30 วัน', tone: 'orange' },
  EXPIRING_WITHIN_90_DAYS: { label: 'ใกล้หมดอายุภายใน 90 วัน', tone: 'amber' },
  EXPIRING_WITHIN_180_DAYS: { label: 'ใกล้หมดอายุภายใน 180 วัน', tone: 'sky' },
  VALID: { label: 'ใช้งานได้', tone: 'green' },
  UNKNOWN: { label: 'ไม่ทราบสถานะ', tone: 'slate' },
};

/** คลาสสีของแต่ละสถานะ (VALID เขียว · 180 ฟ้า · 90 เหลือง · 30 ส้ม · EXPIRED แดง · UNKNOWN เทา §5) */
export const PASSPORT_TONE_CLASS: Record<PassportTone, string> = {
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** สถานะหนังสือเดินทางเทียบกับวันนี้ (6 ระดับ §5) — หมดอายุห้ามลบ/ห้ามตัดสิทธิ์อัตโนมัติ */
export function passportStatus(expiryISO: string | null, today: string): PassportStatus {
  if (!expiryISO) return 'UNKNOWN';
  if (expiryISO < today) return 'EXPIRED';
  if (expiryISO <= addDays(today, 30)) return 'EXPIRING_WITHIN_30_DAYS';
  if (expiryISO <= addDays(today, 90)) return 'EXPIRING_WITHIN_90_DAYS';
  if (expiryISO <= addDays(today, 180)) return 'EXPIRING_WITHIN_180_DAYS';
  return 'VALID';
}

/**
 * บล็อกการจัดสเก็ตงาน (มอบหมาย/ย้าย) เมื่อหนังสือเดินทางหมดอายุหรือเหลืออายุไม่ถึง 6 เดือน —
 * ขอบเขตแคบเฉพาะการจัดงานใหม่เท่านั้น ไม่กระทบสิทธิ์อื่นของหัวหน้าทัวร์ (ดูเจตนาการออกแบบที่ passportStatus ด้านบน)
 */
export function passportBlocksScheduling(status: PassportStatus): boolean {
  return status === 'EXPIRED' || status === 'EXPIRING_WITHIN_30_DAYS' || status === 'EXPIRING_WITHIN_90_DAYS' || status === 'EXPIRING_WITHIN_180_DAYS';
}

/** ข้อความอายุคงเหลือ/เกิน เช่น "เหลือ 45 วัน" หรือ "หมดอายุแล้ว 12 วัน" */
export function passportRemainingText(expiryISO: string | null, today: string): string {
  if (!expiryISO) return 'ไม่ทราบ';
  const days = daysBetweenISO(today, expiryISO);
  if (days < 0) return `หมดอายุแล้ว ${Math.abs(days)} วัน`;
  return `เหลือ ${days} วัน`;
}

function daysBetweenISO(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/* ------------------------------ Mask ข้อมูลสำคัญ (§8) ------------------------------ */

/** เลขหนังสือเดินทาง: เก็บ 2 ตัวหน้า/ท้าย · ที่เหลือเป็น * เช่น AC1221695 → AC*****95 */
export function maskPassport(no: string | null | undefined): string {
  if (!no) return '-';
  const s = no.trim();
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${s.slice(0, 2)}${'*'.repeat(s.length - 4)}${s.slice(-2)}`;
}

/** เลขบัตรประชาชน: แสดงเฉพาะหลักสุดท้าย · คงเครื่องหมายคั่น เช่น *-****-*****-**-3 */
export function maskPersonalId(id: string | null | undefined): string {
  if (!id) return '-';
  const chars = id.split('');
  let lastDigit = -1;
  for (let i = chars.length - 1; i >= 0; i--) if (/\d/.test(chars[i])) { lastDigit = i; break; }
  return chars.map((c, i) => (/\d/.test(c) && i !== lastDigit ? '*' : c)).join('');
}

/** วันเกิด: แสดงเฉพาะผู้มีสิทธิ์ (§8) — ไม่มีสิทธิ์คืน mask */
export function maskDob(): string {
  return '••/••/••';
}

/* ------------------------------ Passport name / checks (§3/§6) ------------------------------ */

/** ชื่อเต็มตาม Passport (อังกฤษ) = titleNameEN + firstNameEN + lastNameEN — ตามข้อมูลจริง ไม่แก้สะกด/ตัวพิมพ์ */
export function passportFullName(p: Pick<TourLeaderProfile, 'titleNameEN' | 'firstNameEN' | 'lastNameEN'>): string {
  return [p.titleNameEN, p.firstNameEN, p.lastNameEN].filter(Boolean).join(' ').trim();
}

/** ตรวจข้อมูลหนังสือเดินทาง (§6) — คืนรายการคำเตือน (ไม่แก้อัตโนมัติ) */
export function passportChecks(p: TourLeaderProfile, identity: TourLeaderIdentityDocument | undefined, today: string): string[] {
  const w: string[] = [];
  if (!identity?.passportNo) w.push('ไม่มีเลขหนังสือเดินทาง');
  else if (/[^A-Z0-9]/.test(identity.passportNo)) w.push('เลขหนังสือเดินทางมีอักขระที่ไม่ควรมี');
  if (identity?.passportIssueDate && identity?.passportExpiryDate && identity.passportIssueDate > identity.passportExpiryDate) w.push('วันที่ออกมากกว่าวันหมดอายุ');
  if (identity?.dateOfBirth && identity.dateOfBirth > today) w.push('วันเกิดเป็นวันในอนาคต');
  if (!(p.firstNameEN && p.lastNameEN)) w.push('ชื่อภาษาอังกฤษไม่ครบ (firstNameEN/lastNameEN)');
  if (!identity?.placeOfBirth) w.push('ไม่มีสถานที่เกิด');
  if (!identity?.issuingAuthority) w.push('ไม่มีหน่วยงานผู้ออก');
  const st = passportStatus(identity?.passportExpiryDate ?? null, today);
  if (st === 'EXPIRED') w.push('หนังสือเดินทางหมดอายุแล้ว');
  else if (st.startsWith('EXPIRING')) w.push(`หนังสือเดินทางใกล้หมดอายุ (${passportRemainingText(identity?.passportExpiryDate ?? null, today)})`);
  return w;
}

/* ------------------------------ Validation (§18) ------------------------------ */

export const LEADER_VALIDATION_META: Record<LeaderValidationStatus, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  VALID: { label: 'ถูกต้อง', tone: 'green' },
  WARNING: { label: 'ควรตรวจสอบ', tone: 'amber' },
  INVALID: { label: 'ไม่ถูกต้อง', tone: 'red' },
};

/** ตรวจสอบข้อมูล 1 รายการ (ใช้ตรวจซ้ำ/แสดงผล) — คืนสถานะ + ข้อความ (§18) */
export function validateProfile(p: TourLeaderProfile, identity: TourLeaderIdentityDocument | undefined, today: string): { status: LeaderValidationStatus; messages: string[] } {
  const messages: string[] = [];
  let invalid = false;
  let warn = false;
  const hasTH = !!(p.firstNameTH && p.lastNameTH);
  const hasEN = !!(p.firstNameEN && p.lastNameEN);
  if (!hasTH && !hasEN) { messages.push('ต้องมีชื่อไทยหรือชื่ออังกฤษอย่างน้อยหนึ่งชุด'); invalid = true; }
  if (identity?.passportIssueDate && identity?.passportExpiryDate && identity.passportIssueDate > identity.passportExpiryDate) {
    messages.push('วันออกมากกว่าวันหมดอายุหนังสือเดินทาง'); invalid = true;
  }
  if (identity?.dateOfBirth && identity.dateOfBirth > today) { messages.push('วันเกิดเป็นวันในอนาคต'); invalid = true; }
  if (!identity?.passportNo) { messages.push('ไม่มีเลขหนังสือเดินทาง'); warn = true; }
  if (p.duplicateStatus === 'POSSIBLE_DUPLICATE') { messages.push('อาจซ้ำกับรายการอื่น — ต้อง Review'); warn = true; }
  if (p.gender && !/^(M|F)$/i.test(p.gender)) { messages.push(`เพศไม่ใช่ M/F (${p.gender})`); warn = true; }
  return { status: invalid ? 'INVALID' : warn ? 'WARNING' : 'VALID', messages };
}
