/**
 * ตัวช่วยเบอร์โทรศัพท์ระหว่างประเทศ — ห่อ libphonenumber-js ไว้ที่เดียว
 * ใช้ร่วมกันทั้ง UI (PhoneInput) และ logic (validate/mapper) เพื่อไม่เขียนกฎความยาวเบอร์แยกแต่ละประเทศเอง
 *
 * ใช้ entry `libphonenumber-js/core` + ส่ง metadata เอง เพื่อให้ทำงานได้ทั้งใน Next และ test runner (tsx)
 * (บาง bundler ห่อ JSON ไว้ใน { default } — จึง unwrap ให้เรียบร้อย)
 *
 * แยกค่าที่แสดง (displayPhone) กับค่าที่ใช้บันทึก (phoneE164) ตามข้อกำหนด
 */

import {
  AsYouType,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/core';
import rawMetadata from 'libphonenumber-js/metadata.min.json';
import rawExamples from 'libphonenumber-js/examples.mobile.json';

/** unwrap โมดูล JSON ที่บาง bundler ห่อไว้ใน { default } */
function unwrap<T>(mod: T): T {
  return mod && typeof mod === 'object' && 'default' in mod ? (mod as { default: T }).default : mod;
}
const metadata = unwrap(rawMetadata);
const examples = unwrap(rawExamples);

/** ค่าเบอร์โทรที่เก็บใน state — แยกค่าที่แสดงกับค่าที่บันทึกชัดเจน */
export interface PhoneValue {
  /** รหัสประเทศ ISO alpha-2 เช่น 'TH' */
  countryCode: string;
  /** รหัสโทรศัพท์ เช่น '+66' */
  dialCode: string;
  /** ค่าที่แสดง/ผู้ใช้พิมพ์ เช่น '081-234-5678' */
  displayPhone: string;
  /** ค่ามาตรฐาน E.164 เช่น '+66812345678' ('' เมื่อยังไม่สมบูรณ์) */
  phoneE164: string;
}

/** ประเทศเริ่มต้น = ไทย */
export const DEFAULT_PHONE_COUNTRY = 'TH';

/** ประเทศนี้รองรับหรือไม่ (มีรหัสโทรศัพท์) */
export function isSupportedPhoneCountry(countryCode: string): boolean {
  return isSupportedCountry(countryCode as CountryCode, metadata);
}

/** รหัสโทรศัพท์ของประเทศ เช่น 'TH' → '+66' */
export function dialCodeOf(countryCode: string): string {
  try {
    if (!isSupportedCountry(countryCode as CountryCode, metadata)) return '';
    return `+${getCountryCallingCode(countryCode as CountryCode, metadata)}`;
  } catch {
    return '';
  }
}

/** ตัวอย่างหมายเลข (national format) ของประเทศ เช่น 'TH' → '081 234 5678' */
export function exampleNationalNumber(countryCode: string): string {
  try {
    const ex = getExampleNumber(countryCode as CountryCode, examples, metadata);
    return ex ? ex.formatNational() : '';
  } catch {
    return '';
  }
}

/** ค่าเบอร์ว่างของประเทศหนึ่ง (ค่าเริ่มต้น = ไทย +66) */
export function emptyPhone(countryCode: string = DEFAULT_PHONE_COUNTRY): PhoneValue {
  return { countryCode, dialCode: dialCodeOf(countryCode), displayPhone: '', phoneE164: '' };
}

/** เก็บเฉพาะอักขระที่อนุญาต: + ตัวเลข ช่องว่าง - และวงเล็บ */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+\s()\-]/g, '');
}

/**
 * ประมวลผลค่าที่พิมพ์ + ประเทศที่เลือก → PhoneValue
 * - จัดรูปแบบระหว่างพิมพ์ (AsYouType)
 * - ถ้าพิมพ์/วางเบอร์นำหน้าด้วยรหัสประเทศ (เช่น +81…) จะสลับประเทศให้อัตโนมัติ (กันรหัสซ้ำ)
 * - แปลงเป็น E.164 อัตโนมัติ
 */
export function computePhone(rawInput: string, selectedCountry: string): PhoneValue {
  const input = sanitizePhoneInput(rawInput);
  const formatter = new AsYouType(selectedCountry as CountryCode, metadata);
  const displayPhone = formatter.input(input);
  const parsed = formatter.getNumber();
  const countryCode = parsed?.country ?? selectedCountry;
  return {
    countryCode,
    dialCode: dialCodeOf(countryCode),
    displayPhone,
    phoneE164: parsed?.number ?? '',
  };
}

/** เปลี่ยนประเทศ โดยคงหมายเลขเดิม แล้วคำนวณใหม่ */
export function changePhoneCountry(value: PhoneValue, countryCode: string): PhoneValue {
  const next = computePhone(value.displayPhone, countryCode);
  // ถ้าหมายเลขไม่ได้ระบุรหัสประเทศเอง ให้ยึดประเทศที่ผู้ใช้เลือก
  return value.displayPhone.trim().startsWith('+')
    ? next
    : { ...next, countryCode, dialCode: dialCodeOf(countryCode) };
}

/** เบอร์ว่างหรือไม่ */
export function isPhoneEmpty(value: PhoneValue): boolean {
  return value.displayPhone.trim() === '';
}

/** เบอร์ถูกต้องตามประเทศหรือไม่ (ว่าง = ถือว่าผ่าน เพราะไม่บังคับ) */
export function isPhoneValid(value: PhoneValue): boolean {
  if (isPhoneEmpty(value)) return true;
  const parsed = parsePhoneNumberFromString(value.displayPhone, value.countryCode as CountryCode, metadata);
  return Boolean(parsed?.isValid());
}
