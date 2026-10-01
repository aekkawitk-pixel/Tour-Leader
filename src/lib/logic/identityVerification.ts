/**
 * ตรวจสอบความสอดคล้อง "ข้อมูลทั่วไป ↔ ข้อมูล Passport" (§8/§9/§10)
 *
 * • สถานะ Passport คำนวณอัตโนมัติจากวันหมดอายุ — ผู้ใช้เลือกเองไม่ได้ (§8)
 * • เปรียบเทียบชื่อแบบตัดช่องว่างส่วนเกิน + ไม่สนตัวพิมพ์ แต่คงอักขระอื่นไว้ (§10)
 * • ไม่แก้ข้อมูลอัตโนมัติ — แจ้งเตือนให้ผู้ใช้ตัดสินใจเท่านั้น (§10)
 */

import { diffDays } from '@/lib/format';

export type CheckState = 'ok' | 'warn' | 'error' | 'unknown';

export interface IdentityCheck {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
  /** Card ปลายทางของปุ่ม "ตรวจสอบและแก้ไข" (§9) */
  target: 'general' | 'passport';
}

/* ------------------------------ สถานะ Passport (§8) ------------------------------ */

export type PassportDataState = 'valid' | 'expiring' | 'expired' | 'none' | 'incomplete';

export const PASSPORT_DATA_STATE: Record<PassportDataState, { label: string; tone: string }> = {
  valid: { label: 'ใช้งานได้', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  expiring: { label: 'ใกล้หมดอายุ', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  expired: { label: 'หมดอายุ', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  none: { label: 'ยังไม่มีข้อมูล', tone: 'bg-slate-100 text-slate-600 ring-slate-300' },
  incomplete: { label: 'ข้อมูลไม่ครบ', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

/** เหลืออายุไม่เกิน 6 เดือน = ใกล้หมดอายุ (§8) */
export const PASSPORT_EXPIRING_DAYS = 183;

/** ช่องที่ถือว่า "ข้อมูลครบ" ของ 1 เล่ม */
export const REQUIRED_PASSPORT_FIELDS = [
  'passportNo', 'issuingCountry', 'issueDate', 'expiryDate', 'firstName', 'lastName', 'dateOfBirth',
] as const;

export type PassportFieldsInput = Partial<Record<string, string | undefined>> | null;

const val = (f: PassportFieldsInput, k: string) => (f?.[k] ?? '').trim();

/** สถานะ Passport จากข้อมูลจริง (§8) — ลำดับ: ไม่มี → หมดอายุ → ใกล้หมดอายุ → ไม่ครบ → ใช้งานได้ */
export function passportDataStatus(fields: PassportFieldsInput, today: string): PassportDataState {
  if (!fields) return 'none';
  const no = val(fields, 'passportNo');
  const expiry = val(fields, 'expiryDate');
  if (!no && !expiry) return 'none';
  if (expiry) {
    const left = diffDays(today, expiry);
    if (left < 0) return 'expired';
    if (left <= PASSPORT_EXPIRING_DAYS) return 'expiring';
  }
  const missing = REQUIRED_PASSPORT_FIELDS.filter((k) => !val(fields, k));
  if (missing.length > 0) return 'incomplete';
  return 'valid';
}

/** "เหลือ 148 วัน" / "หมดอายุแล้ว 32 วัน" (§8) */
export function passportDaysText(expiry: string | undefined | null, today: string): string {
  if (!expiry?.trim()) return '—';
  const left = diffDays(today, expiry.trim());
  return left < 0 ? `หมดอายุแล้ว ${Math.abs(left)} วัน` : `เหลือ ${left} วัน`;
}

/** ช่องที่ยังขาดของเล่ม (ใช้กับ Empty/Incomplete State §15) */
export function missingPassportFields(fields: PassportFieldsInput): string[] {
  return REQUIRED_PASSPORT_FIELDS.filter((k) => !val(fields, k));
}

/* ------------------------------ เปรียบเทียบข้อมูล (§10) ------------------------------ */

/** ตัดช่องว่างส่วนเกิน + ไม่สนตัวพิมพ์ (คงเครื่องหมาย/อักขระสำคัญ §10) */
export const normalizeName = (v: string | undefined | null): string =>
  (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const sameName = (a: string | undefined | null, b: string | undefined | null): boolean =>
  normalizeName(a) === normalizeName(b);

/** เพศ: male/female (โปรไฟล์) ↔ M/F (Passport) */
const genderKey = (v: string | undefined | null): string => {
  const s = (v ?? '').trim().toLowerCase();
  if (s.startsWith('m') || s === 'ชาย') return 'm';
  if (s.startsWith('f') || s === 'หญิง') return 'f';
  return '';
};
export const sameGender = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const ka = genderKey(a); const kb = genderKey(b);
  return ka !== '' && ka === kb;
};

export interface VerifyInput {
  personal: {
    firstNameEn?: string;
    lastNameEn?: string;
    birthDate?: string;
    gender?: string;
    /** alpha-3 ของสัญชาติในโปรไฟล์ (เช่น THA) */
    nationalityAlpha3?: string;
  };
  /** ข้อมูลเล่มหลัก — null = ยังไม่มี Passport */
  passport: PassportFieldsInput;
  /** มีไฟล์/รูปสำเนาแนบหรือไม่ */
  hasFile: boolean;
  today: string;
}

/** เทียบ 1 ช่อง → ok / warn (ไม่ตรง) / unknown (ข้อมูลไม่พอ) */
function compare(label: string, key: string, a: string | undefined, b: string | undefined, eq: (x?: string, y?: string) => boolean): IdentityCheck {
  if (!(a ?? '').trim() || !(b ?? '').trim()) {
    return { key, label, state: 'unknown', detail: 'ข้อมูลไม่พอสำหรับเปรียบเทียบ', target: 'general' };
  }
  return eq(a, b)
    ? { key, label, state: 'ok', target: 'general' }
    : { key, label, state: 'warn', detail: `โปรไฟล์: ${a} · Passport: ${b}`, target: 'general' };
}

/** รายการตรวจสอบทั้งหมด (§9) */
export function verifyIdentity(input: VerifyInput): IdentityCheck[] {
  const { personal, passport, hasFile, today } = input;
  const checks: IdentityCheck[] = [];

  if (!passport) {
    return [{ key: 'passport-missing', label: 'ยังไม่มีข้อมูล Passport', state: 'unknown', detail: 'เพิ่มข้อมูล Passport เพื่อเริ่มตรวจสอบ', target: 'passport' }];
  }

  checks.push(compare('ชื่อภาษาอังกฤษตรงกับ Passport', 'firstNameEn', personal.firstNameEn, val(passport, 'firstName'), sameName));
  checks.push(compare('นามสกุลภาษาอังกฤษตรงกับ Passport', 'lastNameEn', personal.lastNameEn, val(passport, 'lastName'), sameName));
  checks.push(compare('วันเกิดตรงกัน', 'dateOfBirth', personal.birthDate, val(passport, 'dateOfBirth'), (x, y) => (x ?? '') === (y ?? '')));
  checks.push(compare('เพศตรงกัน', 'gender', personal.gender, val(passport, 'gender'), sameGender));
  checks.push(compare('สัญชาติตรงกัน', 'nationality', personal.nationalityAlpha3, val(passport, 'nationality'), sameName));

  // สถานะวันหมดอายุ
  const expiry = val(passport, 'expiryDate');
  if (!expiry) {
    checks.push({ key: 'expiry', label: 'วันหมดอายุ Passport', state: 'unknown', detail: 'ยังไม่ได้ระบุวันหมดอายุ', target: 'passport' });
  } else {
    const left = diffDays(today, expiry);
    if (left < 0) checks.push({ key: 'expiry', label: 'Passport หมดอายุแล้ว', state: 'error', detail: passportDaysText(expiry, today), target: 'passport' });
    else if (left <= PASSPORT_EXPIRING_DAYS) checks.push({ key: 'expiry', label: 'Passport จะหมดอายุภายใน 6 เดือน', state: 'warn', detail: passportDaysText(expiry, today), target: 'passport' });
    else checks.push({ key: 'expiry', label: 'Passport ยังไม่หมดอายุ', state: 'ok', detail: passportDaysText(expiry, today), target: 'passport' });
  }

  // ไฟล์สำเนา
  checks.push(hasFile
    ? { key: 'file', label: 'มีไฟล์สำเนา Passport', state: 'ok', target: 'passport' }
    : { key: 'file', label: 'ยังไม่ได้แนบไฟล์สำเนา Passport', state: 'error', target: 'passport' });

  // ความครบถ้วน
  const missing = missingPassportFields(passport);
  checks.push(missing.length === 0
    ? { key: 'complete', label: 'กรอกข้อมูล Passport ครบ', state: 'ok', target: 'passport' }
    : { key: 'complete', label: 'ข้อมูล Passport ยังไม่ครบ', state: 'warn', detail: `ยังขาดข้อมูล ${missing.length} รายการ`, target: 'passport' });

  return checks;
}
