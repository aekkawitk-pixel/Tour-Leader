/**
 * ตรวจสอบข้อมูล Passport ก่อนบันทึก (§6) + กติกาการตั้งเล่มหลัก (§7)
 * เป็นตรรกะล้วน — ไม่แตะ storage/DOM เพื่อให้ทดสอบได้
 */

import type { Country } from '@/types';
import {
  PASSPORT_FIELD_LABEL,
  type MrzCheckSummary, type OcrConfidence,
  type PassportFieldKey, type PassportFieldValues,
} from '@/data/leaders/passportBookTypes';

export type IssueLevel = 'ERROR' | 'WARNING';

export interface ValidationIssue {
  field: PassportFieldKey | null;
  level: IssueLevel;
  message: string;
}

/** ฟิลด์บังคับก่อน "ยืนยันและบันทึก" (§7) */
export const REQUIRED_FIELDS: PassportFieldKey[] = [
  'passportType', 'issuingCountry', 'passportNo',
  'lastName', 'firstName', 'nationality', 'dateOfBirth', 'gender',
  'issueDate', 'expiryDate', 'issuingAuthority',
];

/** ชื่อ/นามสกุลต้องเป็นอังกฤษตาม Passport (§6) — อนุญาต A-Z ช่องว่าง ' - */
const LATIN_NAME_RE = /^[A-Za-z][A-Za-z '\-.]*$/;
/** เลขหนังสือเดินทาง: อังกฤษ+ตัวเลขเท่านั้น (§6) */
const PASSPORT_NO_RE = /^[A-Za-z0-9]+$/;

/** ค้นประเทศจาก Country Master ด้วยรหัส alpha-3 / alpha-2 / ชื่อ (§6) */
export function resolveCountry(value: string, countries: Country[]): Country | null {
  const q = value.trim().toUpperCase();
  if (!q) return null;
  return (
    countries.find((c) => (c.alpha3 ?? '').toUpperCase() === q)
    ?? countries.find((c) => (c.alpha2 ?? c.code ?? '').toUpperCase() === q)
    ?? countries.find((c) => (c.nationality ?? '').toUpperCase() === q)
    ?? countries.find((c) => c.nameEn.toUpperCase() === q)
    ?? countries.find((c) => c.nameTh === value.trim())
    ?? null
  );
}

export interface ValidateInput {
  fields: PassportFieldValues;
  countries: Country[];
  todayISO: string;
  mrzCheck: MrzCheckSummary | null;
  /** ระดับความมั่นใจรายช่องจาก OCR (ใช้เตือนช่องที่ยังไม่ถูกตรวจ §5) */
  confidence?: Partial<Record<PassportFieldKey, OcrConfidence>>;
  /** ช่องที่ผู้ใช้ยืนยัน/แก้ไขแล้ว (§5) */
  verifiedFields?: PassportFieldKey[];
  /** เล่มอื่นในระบบที่ใช้เลขนี้อยู่ (§6 ตรวจซ้ำ) */
  duplicates?: { tourLeaderId: string; leaderName: string }[];
  /** ผู้ใช้ยืนยันแล้วว่าจะบันทึกแม้เลขซ้ำ (§6) */
  duplicateAcknowledged?: boolean;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** กด "ยืนยันและบันทึก" ได้หรือไม่ (§5 ท้ายข้อ) */
  canConfirm: boolean;
}

/** ตรวจข้อมูลทั้งชุดตาม §6 */
export function validatePassportFields(input: ValidateInput): ValidationResult {
  const { fields: f, countries, todayISO } = input;
  const issues: ValidationIssue[] = [];
  const err = (field: PassportFieldKey | null, message: string) => issues.push({ field, level: 'ERROR', message });
  const warn = (field: PassportFieldKey | null, message: string) => issues.push({ field, level: 'WARNING', message });

  /* ---- ช่องบังคับ ---- */
  for (const key of REQUIRED_FIELDS) {
    if (!f[key].trim()) err(key, `${PASSPORT_FIELD_LABEL[key]}ต้องไม่ว่าง`);
  }

  /* ---- เลขหนังสือเดินทาง ---- */
  const no = f.passportNo.trim();
  if (no && !PASSPORT_NO_RE.test(no)) {
    err('passportNo', 'เลขหนังสือเดินทางรองรับเฉพาะตัวอักษรภาษาอังกฤษและตัวเลข');
  }

  /* ---- ชื่อ/นามสกุลภาษาอังกฤษต้องเป็นตัวพิมพ์อังกฤษตามเล่ม (§8) ---- */
  for (const key of ['firstName', 'lastName'] as const) {
    const v = f[key].trim();
    if (v && !LATIN_NAME_RE.test(v)) {
      err(key, `${PASSPORT_FIELD_LABEL[key]}ต้องเป็นภาษาอังกฤษตามหนังสือเดินทาง (ห้ามใช้ภาษาไทย)`);
    }
  }

  /* ---- เลขประจำตัวประชาชน (ถ้ากรอก) 13 หลัก ---- */
  const nid = f.nationalId.replace(/\D/g, '');
  if (f.nationalId.trim() && nid.length !== 13) {
    warn('nationalId', 'เลขประจำตัวประชาชนควรมี 13 หลัก — โปรดตรวจสอบ');
  }

  /* ---- ประเทศผู้ออก / สัญชาติ ต้องอ้างอิง Country Master ---- */
  for (const key of ['issuingCountry', 'nationality'] as const) {
    const v = f[key].trim();
    if (!v) continue;
    const country = resolveCountry(v, countries);
    if (!country) {
      err(key, `${PASSPORT_FIELD_LABEL[key]} “${v}” ไม่พบใน Country Master — เลือกจากรายการที่มี`);
    } else if (!country.isActive) {
      warn(key, `${PASSPORT_FIELD_LABEL[key]} “${country.nameTh}” ถูกปิดใช้งานใน Country Master`);
    }
  }

  /* ---- วันที่ ---- */
  const dob = f.dateOfBirth.trim();
  const issue = f.issueDate.trim();
  const expiry = f.expiryDate.trim();

  if (dob && dob > todayISO) err('dateOfBirth', 'วันเกิดต้องไม่มากกว่าวันปัจจุบัน');
  if (issue && issue > todayISO) err('issueDate', 'วันที่ออกต้องไม่มากกว่าวันปัจจุบัน');
  if (issue && expiry && expiry <= issue) err('expiryDate', 'วันที่หมดอายุต้องมากกว่าวันที่ออก');
  if (dob && expiry && expiry <= dob) err('expiryDate', 'วันที่หมดอายุต้องมากกว่าวันเกิด');
  if (expiry && expiry < todayISO) warn('expiryDate', 'หนังสือเดินทางเล่มนี้หมดอายุแล้ว — ตั้งเป็นเล่มหลักไม่ได้');

  /* ---- ตรวจข้อมูลกับ MRZ เมื่ออ่าน MRZ ได้ (§8) ---- */
  const mrz = input.mrzCheck;
  if (mrz?.parsed) {
    if (mrz.passportNoValid === false) warn('passportNo', 'Check Digit ของเลขหนังสือเดินทางใน MRZ ไม่ตรง — โปรดตรวจสอบตัวเลข');
    if (mrz.dateOfBirthValid === false) warn('dateOfBirth', 'Check Digit ของวันเกิดใน MRZ ไม่ตรง — โปรดตรวจสอบ');
    if (mrz.expiryValid === false) warn('expiryDate', 'Check Digit ของวันหมดอายุใน MRZ ไม่ตรง — โปรดตรวจสอบ');
    if (mrz.compositeValid === false) warn('mrzLine2', 'Check Digit รวมของ MRZ ไม่ตรง — ข้อมูลบางส่วนอาจอ่านผิด');
    // §8 ข้อมูล OCR หน้าเล่มไม่ตรงกับ MRZ → ต้องให้ผู้ใช้ตรวจก่อนบันทึก (บล็อกจนกว่าจะยืนยัน)
    if (mrz.vizMismatch && !(input.verifiedFields ?? []).includes('mrzLine1')) {
      err('mrzLine1', 'ข้อมูลจาก MRZ ไม่ตรงกับข้อความบนหน้าเล่ม — โปรดตรวจสอบและยืนยันค่าที่ถูกต้องก่อนบันทึก');
    }
  }

  /* ---- เลขซ้ำในระบบ (§6) ---- */
  const dups = input.duplicates ?? [];
  if (dups.length > 0) {
    const names = dups.map((d) => `${d.leaderName} (${d.tourLeaderId})`).join(', ');
    if (input.duplicateAcknowledged) {
      warn('passportNo', `เลขหนังสือเดินทางนี้ซ้ำกับ ${names} — ผู้ใช้ยืนยันบันทึกแล้ว`);
    } else {
      err('passportNo', `เลขหนังสือเดินทางนี้มีอยู่แล้วของ ${names} — ต้องยืนยันก่อนจึงจะบันทึกซ้ำได้`);
    }
  }

  /* ---- ช่องความมั่นใจต่ำที่ยังไม่ถูกตรวจ (§5) ---- */
  const verified = new Set(input.verifiedFields ?? []);
  for (const [key, conf] of Object.entries(input.confidence ?? {}) as [PassportFieldKey, OcrConfidence][]) {
    if (verified.has(key)) continue;
    if (conf === 'LOW' && f[key].trim()) {
      err(key, `${PASSPORT_FIELD_LABEL[key]}: ระบบอ่านได้ไม่ชัดเจน — กรุณาตรวจสอบและยืนยันก่อนบันทึก`);
    }
  }

  const errors = issues.filter((i) => i.level === 'ERROR');
  return {
    issues,
    errors,
    warnings: issues.filter((i) => i.level === 'WARNING'),
    canConfirm: errors.length === 0,
  };
}

/* ---------------------------------------------------------------------------
 * §7 กติกาการตั้งเล่มหลัก
 * ------------------------------------------------------------------------- */

export type PrimaryDecision =
  | { allowed: false; reason: string }
  | { allowed: true; needsConfirm: boolean; warning: string | null; confirmMessage: string | null };

/**
 * ตรวจว่าตั้งเล่มนี้เป็นเล่มหลักได้หรือไม่ (§7)
 *   • หมดอายุแล้ว → ไม่อนุญาต
 *   • เหลือน้อยกว่า 180 วัน → เตือนก่อน
 *   • มีเล่มหลักอยู่แล้ว → ต้องยืนยัน (เล่มเดิมจะถูกลดเป็นเล่มรอง)
 */
export function evaluateSetPrimary(
  expiryISO: string, todayISO: string, currentPrimary: { label: string } | null,
): PrimaryDecision {
  if (!expiryISO) {
    return { allowed: false, reason: 'ยังไม่ระบุวันหมดอายุ — ตั้งเป็นเล่มหลักไม่ได้' };
  }
  if (expiryISO < todayISO) {
    return { allowed: false, reason: 'หนังสือเดินทางหมดอายุแล้ว — ตั้งเป็นเล่มหลักไม่ได้' };
  }

  const daysLeft = Math.round(
    (Date.UTC(+expiryISO.slice(0, 4), +expiryISO.slice(5, 7) - 1, +expiryISO.slice(8, 10))
      - Date.UTC(+todayISO.slice(0, 4), +todayISO.slice(5, 7) - 1, +todayISO.slice(8, 10))) / 86_400_000,
  );

  return {
    allowed: true,
    needsConfirm: currentPrimary !== null,
    warning: daysLeft < 180 ? `หนังสือเดินทางเหลืออายุ ${daysLeft} วัน (น้อยกว่า 180 วัน) — ตรวจสอบก่อนตั้งเป็นเล่มหลัก` : null,
    confirmMessage: currentPrimary
      ? `หัวหน้าทัวร์รายนี้มีเล่มหลักอยู่แล้ว (${currentPrimary.label}) — เมื่อยืนยัน เล่มเดิมจะถูกเปลี่ยนเป็นเล่มรองโดยอัตโนมัติ`
      : null,
  };
}
