/**
 * ตรรกะของวิซาร์ด "เพิ่มหัวหน้าทัวร์ใหม่" แบบ 5 แท็บ — ฟังก์ชันบริสุทธิ์ ไม่มี UI
 *
 *   1. ข้อมูลส่วนตัว        (ข้อมูลพื้นฐาน / ข้อมูลติดต่อ / ข้อมูลที่อยู่)
 *   2. ประสบการณ์ทำงาน
 *   3. ความรู้ความสามารถด้านภาษา
 *   4. ความถนัดในการออกทัวร์
 *   5. เอกสารประจำตัว
 *   6. เอกสารเพิ่มเติม (เอกสารประวัติอาชญากรรม ฯลฯ)
 *
 * แท็บนี้มีชุดฟิลด์เฉพาะของตัวเอง แล้ว map กลับเป็น `LeaderFormState` ตอนบันทึก
 * เพื่อใช้ pipeline เดิม (formToLeader / repository / audit / server code) ทั้งหมด
 */

import type { LanguageStandard, LeaderType } from '@/types';
import { LEADER_TYPE, LEADER_TYPE_ORDER } from '@/lib/labels';
import { levelOption, standardForLanguageCode } from '@/data/leaders/languageStandards';
import type { ExpertiseScope as LeaderExpertiseScope } from '@/lib/logic/expertiseScope';
import {
  DOC_ID_PREFIX,
  emptyDocData,
  isExpiryBeforeIssue,
  type DocData,
  type DocKind,
} from '@/data/leaders/documentSchemas';
import {
  DEFAULT_LEADER_TYPE,
  NAME_EN_PATTERN,
  NATIONAL_ID_PATTERN,
  NOTE_MAX_LENGTH,
  POSTAL_CODE_PATTERN,
} from './constants';
import { emptyLeaderForm, type LeaderFormState } from './mappers';
import { newChildId } from './utils';
import { formatDuration, mergeRanges, toMonthIndex, type MonthRange } from './experience';
import { emptyPhone, isPhoneEmpty, isPhoneValid, type PhoneValue } from '@/lib/phone';

/* --------------------------------- แท็บ --------------------------------- */

export const WIZARD_TABS = [
  { key: 'personal', label: 'ข้อมูลส่วนตัว', short: 'ส่วนตัว' },
  { key: 'experience', label: 'ประสบการณ์ทำงาน', short: 'ประสบการณ์' },
  { key: 'language', label: 'ทักษะด้านภาษา', short: 'ภาษา' },
  { key: 'expertise', label: 'ความถนัดในการออกทัวร์', short: 'ความถนัด' },
  { key: 'documents', label: 'เอกสารประจำตัว', short: 'เอกสาร' },
  { key: 'additional', label: 'เอกสารเพิ่มเติม', short: 'เพิ่มเติม' },
] as const;

export type WizardTabKey = (typeof WIZARD_TABS)[number]['key'];

export const WIZARD_TAB_KEYS = WIZARD_TABS.map((t) => t.key) as WizardTabKey[];

/* ------------------------------ ตัวเลือกต่าง ๆ ------------------------------ */

export const WIZARD_TITLES = ['นาย', 'นาง', 'นางสาว'];
export const WIZARD_TITLES_EN = ['Mr.', 'Mrs.', 'Ms.'];

/** เลือกคำนำหน้าไทย → เติมคำนำหน้าอังกฤษให้อัตโนมัติ (ผู้ใช้แก้เองได้) */
export const WIZARD_TITLE_TH_TO_EN: Record<string, string> = {
  นาย: 'Mr.',
  นาง: 'Mrs.',
  นางสาว: 'Ms.',
};

/** สัญชาติ — เลือกได้เฉพาะไทย/ต่างชาติ */
export type WizardNationality = 'thai' | 'foreign';
export const WIZARD_NATIONALITIES: { value: WizardNationality; label: string }[] = [
  { value: 'thai', label: 'ไทย' },
  { value: 'foreign', label: 'ต่างชาติ' },
];

/** รูปโปรไฟล์ — รองรับ JPG/PNG ขนาดไม่เกิน 5 MB */
export const WIZARD_PHOTO_MAX_MB = 5;
export const WIZARD_PHOTO_TYPES = ['image/jpeg', 'image/png'];

/** รูปแบบการร่วมงานที่เลือกในวิซาร์ด (ค่าเดียวกับ LEADER_TYPE ของระบบ) */
/**
 * รูปแบบการร่วมงาน — ใช้ค่าและป้ายชุดเดียวกับทั้งระบบ (LEADER_TYPE ใน lib/labels)
 * เดิมวิซาร์ดมี enum ของตัวเอง (permanent/ทั่วไป/เอเจ้นท์) ทำให้ค่ากับป้ายไม่ตรงกับหน้าอื่น
 * ตอนนี้เลิกใช้ชุดนั้นแล้ว — ไม่ต้อง map ค่าอีกต่อไป
 */
export const WIZARD_LEADER_TYPES: { code: LeaderType; label: string }[] =
  LEADER_TYPE_ORDER.map((code) => ({ code, label: LEADER_TYPE[code].label }));

/* ------------------------------ ข้อมูลติดต่อ (ตาราง) ------------------------------ */

export type WizardContactType =
  | 'mobile'
  | 'phone_alt'
  | 'call'
  | 'email'
  | 'line'
  | 'whatsapp'
  | 'other';

export const WIZARD_CONTACT_TYPES: { value: WizardContactType; label: string }[] = [
  { value: 'mobile', label: 'โทรศัพท์มือถือ' },
  { value: 'phone_alt', label: 'โทรศัพท์สำรอง' },
  { value: 'call', label: 'โทรศัพท์ (คน Call)' },
  { value: 'email', label: 'อีเมล' },
  { value: 'line', label: 'LINE ID' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'อื่น ๆ' },
];

export interface WizardContactRow {
  id: string;
  type: WizardContactType;
  value: string;
  isPrimary: boolean;
  note: string;
  // เฉพาะประเภท 'call' (โทรศัพท์ (คน Call)) — เก็บแยกเพื่อไม่ให้ข้อมูลหายเมื่อสลับประเภท
  callName: string;
  callPhone: PhoneValue;
}

export function newContactRow(type: WizardContactType = 'mobile'): WizardContactRow {
  return {
    id: newChildId('WC'),
    type,
    value: '',
    isPrimary: false,
    note: '',
    callName: '',
    callPhone: emptyPhone(),
  };
}

/** เบอร์คน Call ของแถว (ทนต่อ state เก่าที่ยังไม่มีฟิลด์) */
export function contactRowCallPhone(row: WizardContactRow): PhoneValue {
  return row.callPhone ?? emptyPhone();
}

/** แถวติดต่อมีข้อมูลกรอกไว้หรือยัง (call: ดูชื่อ/เบอร์คน Call · อื่น ๆ: ดู value) */
export function contactRowFilled(row: WizardContactRow): boolean {
  if (row.type === 'call') {
    return (row.callName ?? '').trim() !== '' || !isPhoneEmpty(contactRowCallPhone(row));
  }
  return row.value.trim() !== '';
}

/** ชนิด input ตามประเภทการติดต่อ (โทรศัพท์=tel · อีเมล=email · อื่น ๆ=text) */
export function contactInputType(type: WizardContactType): 'tel' | 'email' | 'text' {
  if (type === 'mobile' || type === 'phone_alt') return 'tel';
  if (type === 'email') return 'email';
  return 'text';
}

/** Placeholder ตามประเภทการติดต่อ */
export function contactPlaceholder(type: WizardContactType): string {
  switch (type) {
    case 'mobile':
      return '081-234-5678';
    case 'phone_alt':
      return '02-123-4567';
    case 'email':
      return 'name@example.com';
    case 'line':
      return '@lineid หรือ lineid';
    case 'whatsapp':
      return '+66 81-234-5678';
    default:
      return 'ข้อมูลติดต่อ';
  }
}

/** กำหนดรายการติดต่อหลัก — รายการอื่นถูกยกเลิก isPrimary */
export function setPrimaryContactRow(
  rows: WizardContactRow[],
  id: string,
): WizardContactRow[] {
  return rows.map((r) => ({ ...r, isPrimary: r.id === id }));
}

/** ลบแถว — ไม่เลื่อนรายการหลักอัตโนมัติ (ให้ผู้ใช้เลือกใหม่ตามข้อกำหนด) */
export function removeContactRow(rows: WizardContactRow[], id: string): WizardContactRow[] {
  return rows.filter((r) => r.id !== id);
}

/* ------------------------------ ประสบการณ์ทำงาน (ตาราง) ------------------------------ */

/** ตัวอย่างตำแหน่งสำหรับ datalist (พิมพ์เองได้) */
export const WIZARD_POSITIONS = [
  'หัวหน้าทัวร์',
  'ผู้ช่วยหัวหน้าทัวร์',
  'มัคคุเทศก์',
  'Tour Coordinator',
];

/** จำนวนแถวเริ่มต้นของตารางประสบการณ์ (แบบ Excel) */
export const WIZARD_EXPERIENCE_MIN_ROWS = 5;

/** คอลัมน์ที่โฟกัสได้ในตาราง (ใช้กับ keyboard navigation) */
export const EXPERIENCE_GRID_COLS = 4; // company, position, startDate, endDate

export interface WizardExperienceRow {
  id: string;
  company: string;
  position: string;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD หรือ null (ยังทำงานอยู่/ยังไม่ระบุ)
  isCurrent: boolean;
  // รายละเอียด (กรอกผ่าน Modal)
  responsibilities: string;
  routes: string;
  region: string;
  paxApprox: string;
  achievements: string;
}

export function newExperienceRow(): WizardExperienceRow {
  return {
    id: newChildId('WE'),
    company: '',
    position: '',
    startDate: '',
    endDate: null,
    isCurrent: false,
    responsibilities: '',
    routes: '',
    region: '',
    paxApprox: '',
    achievements: '',
  };
}

/** แถวนี้มีข้อมูลกรอกไว้แล้วหรือยัง (ใช้ตัดสินว่าต้อง validate / บันทึก) */
export function experienceRowFilled(row: WizardExperienceRow): boolean {
  return (
    row.company.trim() !== '' ||
    row.position.trim() !== '' ||
    Boolean(row.startDate) ||
    Boolean(row.endDate)
  );
}

/** อ่าน ปี/เดือน จากวันที่ YYYY-MM-DD (ใช้คำนวณช่วงประสบการณ์ระดับเดือน) */
function parseDateYM(value: string): { year: number; month: number } | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/**
 * เปลี่ยนวันที่เริ่ม → ถ้าวันที่เริ่มใหม่มากกว่าวันที่สิ้นสุดเดิม ให้ล้างวันที่สิ้นสุด
 * (ฟังก์ชันบริสุทธิ์ ใช้ทั้งใน UI และทดสอบ)
 */
export function experienceStartPatch(
  row: WizardExperienceRow,
  startDate: string,
): Partial<WizardExperienceRow> {
  if (row.endDate && startDate && startDate > row.endDate) {
    return { startDate, endDate: null };
  }
  return { startDate };
}

/**
 * ตั้งสถานะ "ยังทำงานอยู่" แบบเลือกได้รายการเดียว
 *  • เลือกแถวใหม่ → ยกเลิกสถานะของแถวอื่นทั้งหมดอัตโนมัติ + ล้างวันที่สิ้นสุดของแถวนั้น
 *  • ยกเลิกแถวเดิม → ปิดสถานะเฉพาะแถวนั้น
 */
export function setCurrentExperience(
  rows: WizardExperienceRow[],
  id: string,
  isCurrent: boolean,
): WizardExperienceRow[] {
  return rows.map((r) => {
    if (r.id === id) return { ...r, isCurrent, endDate: isCurrent ? null : r.endDate };
    return isCurrent ? { ...r, isCurrent: false } : r;
  });
}

/** แถวนี้กรอกครบพร้อมบันทึกหรือยัง (ใช้แสดงเครื่องหมายถูก) */
export function experienceRowComplete(row: WizardExperienceRow): boolean {
  if (!row.company.trim() || !row.position.trim() || !DATE_RE.test(row.startDate)) return false;
  if (row.isCurrent) return true;
  const end = row.endDate ?? '';
  return DATE_RE.test(end) && end >= row.startDate;
}

/** จำนวนรายการประสบการณ์ที่กรอกแล้ว (มีชื่อบริษัท) */
export function countFilledExperiences(rows: WizardExperienceRow[]): number {
  return rows.filter((r) => r.company.trim() !== '').length;
}

/**
 * คำนวณเซลล์ปลายทางของการเลื่อนด้วยคีย์บอร์ดแบบ Excel (ฟังก์ชันบริสุทธิ์)
 *  Enter → แถวถัดไปคอลัมน์เดิม (ถึงแถวสุดท้าย = ขอเพิ่มแถว) · ลูกศรขึ้น/ลง/ซ้าย/ขวา = เซลล์ข้างเคียง
 */
export function nextGridCell(
  pos: { r: number; c: number },
  key: string,
  rowCount: number,
  colCount: number,
): { r: number; c: number; addRow?: boolean } | null {
  const { r, c } = pos;
  switch (key) {
    case 'Enter':
      return r + 1 >= rowCount ? { r: rowCount, c, addRow: true } : { r: r + 1, c };
    case 'ArrowDown':
      return r + 1 < rowCount ? { r: r + 1, c } : null;
    case 'ArrowUp':
      return r - 1 >= 0 ? { r: r - 1, c } : null;
    case 'ArrowRight':
      if (c + 1 < colCount) return { r, c: c + 1 };
      return r + 1 < rowCount ? { r: r + 1, c: 0 } : null;
    case 'ArrowLeft':
      if (c - 1 >= 0) return { r, c: c - 1 };
      return r - 1 >= 0 ? { r: r - 1, c: colCount - 1 } : null;
    default:
      return null;
  }
}

/** แถวนี้มีรายละเอียด (จาก Modal) กรอกไว้หรือยัง */
export function experienceHasDetails(row: WizardExperienceRow): boolean {
  return Boolean(
    row.responsibilities.trim() ||
      row.routes.trim() ||
      row.region.trim() ||
      row.paxApprox.trim() ||
      row.achievements.trim(),
  );
}

/** ช่วงเวลาของประสบการณ์หนึ่งรายการ (คืน null ถ้าข้อมูลไม่พอ) */
export function experienceRowRange(
  row: WizardExperienceRow,
  today: string,
): MonthRange | null {
  const start = parseDateYM(row.startDate);
  if (!start) return null;
  const startIndex = toMonthIndex(start.year, start.month);
  const [ty, tm] = today.split('-').map(Number);
  const nowIndex = toMonthIndex(ty, tm);
  let endIndex: number | null;
  if (row.isCurrent) {
    endIndex = nowIndex;
  } else {
    const end = parseDateYM(row.endDate ?? '');
    endIndex = end ? toMonthIndex(end.year, end.month) : null;
  }
  if (endIndex === null || endIndex < startIndex) return null;
  return { start: startIndex, end: endIndex };
}

/** ประสบการณ์รวม (ไม่นับเดือนที่ซ้อนทับซ้ำ) */
export function summarizeWizardExperience(
  rows: WizardExperienceRow[],
  today: string,
): { totalMonths: number; label: string } {
  const ranges = rows
    .map((r) => experienceRowRange(r, today))
    .filter((r): r is MonthRange => r !== null);
  const merged = mergeRanges(ranges);
  const totalMonths = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  return { totalMonths, label: formatDuration(totalMonths) };
}

/** เรียงประสบการณ์ล่าสุดไว้บน (งานปัจจุบันก่อน → วันเริ่มล่าสุด → เก่าสุด) */
export function sortExperienceRows(rows: WizardExperienceRow[]): WizardExperienceRow[] {
  return [...rows].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    // YYYY-MM-DD เรียงตามตัวอักษร = เรียงตามเวลา · ค่าว่างไปท้ายสุด
    return (b.startDate || '').localeCompare(a.startDate || '');
  });
}

/** ตัวเลือกภาษาหลักที่รองรับ (มีมาตรฐานวัดระดับเฉพาะของตัวเอง) + ระบุเพิ่มเติมได้ */
export const WIZARD_LANGUAGES = [
  'อังกฤษ',
  'จีนกลาง',
  'ญี่ปุ่น',
  'เกาหลี',
];
export const WIZARD_LANGUAGE_OTHER = 'อื่น ๆ';

/** ชื่อภาษาในวิซาร์ด → รหัส Master Data — ใช้หามาตรฐานวัดระดับของภาษานั้น (ไม่ผูกกับ master.languages ตรง ๆ) */
const WIZARD_LANGUAGE_CODE: Record<string, string> = {
  อังกฤษ: 'EN',
  จีนกลาง: 'ZH',
  ญี่ปุ่น: 'JA',
  เกาหลี: 'KO',
};

/** มาตรฐานวัดระดับของภาษาที่เลือกในวิซาร์ด — "อื่น ๆ" หรือภาษาที่ไม่รู้จักใช้ GENERAL */
export function wizardLanguageStandard(language: string): LanguageStandard {
  const code = WIZARD_LANGUAGE_CODE[language];
  return code ? standardForLanguageCode(code) : 'GENERAL';
}

/** ความถนัดในการออกทัวร์ — เลือกได้หลายรายการ (checkbox) */
export const WIZARD_TOUR_TYPES = [
  { code: 'walk_in', label: 'กรุ๊ปหน้าร้าน' },
  { code: 'charter', label: 'กรุ๊ปเหมา' },
  { code: 'sales', label: 'เน้นทำยอด' },
  { code: 'vip', label: 'กรุ๊ป VIP' },
  { code: 'entertain', label: 'เน้นเอนเตอร์เทน' },
  { code: 'history', label: 'เน้นประวัติศาสตร์' },
  { code: 'other', label: 'อื่น ๆ โปรดระบุ' },
] as const;

export const WIZARD_TOUR_TYPE_CODES = WIZARD_TOUR_TYPES.map((t) => t.code) as string[];

/** เลือกครบทุกข้อหรือยัง (ใช้กับ "เลือกทั้งหมด") */
export function isAllTourTypesSelected(codes: string[]): boolean {
  return WIZARD_TOUR_TYPE_CODES.every((c) => codes.includes(c));
}

/** เลือกบางส่วน (สถานะ indeterminate ของ "เลือกทั้งหมด") */
export function isTourTypesIndeterminate(codes: string[]): boolean {
  return codes.length > 0 && !isAllTourTypesSelected(codes);
}

/** สกุลเงินสำหรับ "เน้นทำยอด" */
export const WIZARD_CURRENCIES = [
  { code: 'THB', label: 'บาทไทย' },
  { code: 'USD', label: 'ดอลลาร์สหรัฐ' },
  { code: 'EUR', label: 'ยูโร' },
  { code: 'GBP', label: 'ปอนด์สเตอร์ลิง' },
  { code: 'JPY', label: 'เยนญี่ปุ่น' },
  { code: 'CNY', label: 'หยวนจีน' },
  { code: 'KRW', label: 'วอนเกาหลี' },
  { code: 'SGD', label: 'ดอลลาร์สิงคโปร์' },
  { code: 'other', label: 'อื่น ๆ' },
] as const;

/** ความยาวสูงสุดของช่อง "ระบุความถนัดอื่น" */
export const WIZARD_EXPERTISE_OTHER_MAX = 200;

/* ----------------- ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น) ----------------- */

export interface WizardRoute {
  id: string;
  /** รหัสประเทศ (ใช้ค่า id ของ Country เช่น C-JP) */
  countryCode: string;
  /** รหัสสนามบิน IATA เช่น NRT, CTS, KIX */
  iataCode: string;
  nameTh: string;
  nameEn: string;
  keywords: string[];
  isCustom?: boolean;
}

/** เส้นทางบินหลายจุด เช่น BKK → NRT → CTS */
export interface WizardFlightRoute {
  id: string;
  airportCodes: string[];
}

export type CountryRouteScope = 'all_routes' | 'selected_routes';

export interface WizardCountryExpertise {
  id: string;
  countryCode: string;
  countryNameTh: string;
  countryNameEn: string;
  routeScope: CountryRouteScope;
  /** สนามบิน/จุดหมายปลายทางที่เชี่ยวชาญ */
  routes: WizardRoute[];
  /** เส้นทางบินหลายจุด (ข้อมูลเสริม ไม่บังคับ) */
  flightRoutes: WizardFlightRoute[];
  /** การ์ดย่อ/ขยาย */
  expanded: boolean;
}

export type ExpertiseScope = 'all_countries' | 'selected_countries';

/** รหัสประเทศยอดนิยม (ปุ่มเลือกด่วน) — กรองตามที่มีจริงในฐานข้อมูลอีกชั้น */
export const WIZARD_POPULAR_COUNTRY_CODES = ['JP', 'CN', 'KR', 'VN', 'SG', 'FR', 'IT'];

export function newCountryExpertise(country?: {
  id: string;
  nameTh: string;
  nameEn: string;
}): WizardCountryExpertise {
  return {
    id: newChildId('CE'),
    countryCode: country?.id ?? '',
    countryNameTh: country?.nameTh ?? '',
    countryNameEn: country?.nameEn ?? '',
    routeScope: 'all_routes',
    routes: [],
    flightRoutes: [],
    expanded: true,
  };
}

/** จำนวนสนามบินที่เลือกทั้งหมด (ใช้ในส่วนสรุป) */
export function countSelectedRoutes(list: WizardCountryExpertise[]): number {
  return list.reduce((n, c) => n + (c.routeScope === 'selected_routes' ? c.routes.length : 0), 0);
}

/* --------------------------- ตัวสร้างเส้นทางบิน --------------------------- */

export function newFlightRoute(): WizardFlightRoute {
  return { id: newChildId('FR'), airportCodes: [] };
}

/** แสดงเส้นทางบินแบบอ่านง่าย เช่น "BKK → NRT → CTS" */
export function flightRoutePreview(codes: string[]): string {
  return codes.join(' → ');
}

/** เพิ่มสนามบินต่อท้ายได้หรือไม่ (กันรหัสซ้ำติดกัน) */
export function canAppendAirport(codes: string[], code: string): boolean {
  return codes.length === 0 || codes[codes.length - 1] !== code;
}

/** เส้นทางบินสมบูรณ์หรือยัง (ต้องมีอย่างน้อย 2 จุด) */
export function isFlightRouteValid(route: WizardFlightRoute): boolean {
  return route.airportCodes.length >= 2;
}

/** สลับตำแหน่งในอาเรย์ (ฟังก์ชันบริสุทธิ์ — ใช้กับการเรียงลำดับ/ลาก) */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** สร้างสนามบิน/เส้นทางที่ผู้ใช้เพิ่มเอง (isCustom = รอตรวจสอบ) */
export function makeCustomRoute(countryCode: string, name: string): WizardRoute {
  const clean = name.trim();
  return {
    id: newChildId('RT'),
    countryCode,
    iataCode: clean.toUpperCase(),
    nameTh: clean,
    nameEn: clean,
    keywords: [],
    isCustom: true,
  };
}

/**
 * ค้นเส้นทาง — ต้องพิมพ์ ≥ 2 ตัวอักษร · ตรงชื่อไทย/อังกฤษ/keyword (บางส่วนได้)
 * และตัดเส้นทางที่เลือกไปแล้วออกจากผลลัพธ์
 */
export function filterRoutes(
  pool: WizardRoute[],
  query: string,
  excludeIds: string[] = [],
): WizardRoute[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const exclude = new Set(excludeIds);
  return pool.filter((r) => {
    if (exclude.has(r.id)) return false;
    const hay = [r.iataCode, r.nameTh, r.nameEn, ...r.keywords].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/** ชื่อเส้นทางซ้ำหรือไม่ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) */
export function isDuplicateRouteName(routes: WizardRoute[], name: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return routes.some(
    (r) => r.nameTh.trim().toLowerCase() === key || r.nameEn.trim().toLowerCase() === key,
  );
}

/** ประเทศซ้ำในรายการหรือไม่ */
export function isDuplicateCountry(
  list: WizardCountryExpertise[],
  countryCode: string,
  ignoreId?: string,
): boolean {
  return list.some((c) => c.countryCode === countryCode && c.id !== ignoreId);
}

/* ------------------------------ ไฟล์แนบเอกสาร ------------------------------ */

export const WIZARD_MAX_FILE_MB = 5;
export const WIZARD_ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
/** สำหรับ attribute `accept` ของ input file */
export const WIZARD_FILE_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  /** Data URL (Base64) — Demo เก็บใน memory เท่านั้น ไม่อัปโหลดขึ้น Server */
  dataUrl: string;
}

/** ตรวจไฟล์แนบ — ชนิดและขนาด (คืนข้อความ error หรือ undefined ถ้าผ่าน) */
export function validateUploadFile(file: { type: string; size: number }): string | undefined {
  if (!WIZARD_ACCEPTED_FILE_TYPES.includes(file.type)) {
    return 'รองรับเฉพาะไฟล์ JPG, JPEG, PNG และ PDF';
  }
  if (file.size > WIZARD_MAX_FILE_MB * 1024 * 1024) {
    return `ไฟล์ต้องมีขนาดไม่เกิน ${WIZARD_MAX_FILE_MB} MB`;
  }
  return undefined;
}

/* --------------- เอกสารแนบ + โครงสร้างรองรับ OCR (ยังไม่เชื่อมบริการ) --------------- */
/**
 * นิยาม "ช่องข้อมูลของเอกสาร" (DocKind / DOC_SCHEMAS / emptyDocData / isExpiryBeforeIssue)
 * ย้ายไปอยู่ที่ @/data/leaders/documentSchemas เพื่อให้ส่วนอื่นใช้ร่วมได้
 * — ที่นี่เหลือเฉพาะ "สถานะการกรอกในวิซาร์ด" คือไฟล์แนบ · ผล OCR · การยืนยันข้อมูล
 */

/** สถานะการอ่านข้อมูลจากไฟล์ (OCR) */
export type DocOcrStatus = 'idle' | 'reading' | 'done' | 'unsupported' | 'error';

/**
 * รายการเอกสาร 1 ชิ้น — แยก extractedData (จาก OCR) กับ verifiedData (ผู้ใช้ตรวจ/แก้)
 * อย่างชัดเจน ตามข้อกำหนด "ต้องยืนยันก่อนบันทึก"
 */
export interface DocEntry {
  id: string;
  kind: DocKind;
  file: UploadedFile | null;
  ocrStatus: DocOcrStatus;
  /** ข้อมูลดิบจาก OCR — null = ยังไม่อ่าน/อ่านไม่ได้ (ไม่เดาข้อมูล) */
  extractedData: DocData | null;
  /** ข้อมูลที่ผู้ใช้ตรวจสอบ/แก้ไข — ใช้ลง payload */
  verifiedData: DocData;
  /** ความมั่นใจต่อช่อง (0..1) เมื่อ OCR รองรับ */
  confidence: Record<string, number>;
  /** ผู้ใช้กด "ยืนยันข้อมูล" แล้ว */
  verified: boolean;
}

/** สร้างรายการเอกสารใหม่ (id ไม่ซ้ำ กันข้อมูลสลับเมื่อเพิ่ม/ลบ) */
export function newDocEntry(kind: DocKind): DocEntry {
  return {
    id: newChildId(DOC_ID_PREFIX[kind]),
    kind,
    file: null,
    ocrStatus: 'idle',
    extractedData: null,
    verifiedData: emptyDocData(kind),
    confidence: {},
    verified: false,
  };
}

/** มีข้อมูลกรอก/อ่านไว้หรือไม่ (ใช้ตัดสินว่าจะถามลบข้อมูลตอนลบไฟล์) */
export function docEntryHasData(entry: DocEntry): boolean {
  return entry.extractedData !== null || Object.values(entry.verifiedData).some((v) => v.trim() !== '');
}

/** คีย์ error ต่อช่องของเอกสาร — ใช้ร่วมกันระหว่าง validate และ UI (กันข้อมูลสลับ) */
export function docFieldErrorKey(kind: DocKind, id: string, fieldKey: string): string {
  if (kind === 'id_card') return `idCard_${fieldKey}`;
  if (kind === 'criminal_record') return `criminal_${fieldKey}`;
  const prefix = kind === 'passport' ? 'passport' : kind === 'visa' ? 'visa' : 'tourCard';
  return `${prefix}_${id}_${fieldKey}`;
}


/* ------------------------------- ชนิดของฟอร์ม ------------------------------- */

export interface WizardAddress {
  houseNo: string;
  villageNo: string;
  building: string;
  alley: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
}

export interface WizardLanguageRow {
  id: string;
  /** ชื่อภาษาที่เลือก (หรือ WIZARD_LANGUAGE_OTHER) */
  language: string;
  /** ชื่อภาษาที่ระบุเอง เมื่อเลือก "อื่น ๆ" */
  customLanguage: string;
  isNativeLanguage: boolean;
  /** รหัสระดับตามมาตรฐานของภาษานี้ (ดู wizardLanguageStandard) — '' = ไม่ระบุ */
  levelCode: string;
}

export interface WizardForm {
  /** รหัสตัวอย่างที่แสดงบนหน้าจอ — รหัสจริงออกจากเซิร์ฟเวอร์ตอนบันทึก */
  code: string;

  // 1. ข้อมูลส่วนตัว — ข้อมูลพื้นฐาน
  photoUrl: string | null;
  title: string;
  titleEn: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  nickname: string;
  nicknameEn: string;
  birthDate: string;
  /** เลขบัตรประชาชน (ใช้เมื่อสัญชาติไทย) */
  nationalId: string;
  /** เลขที่หนังสือเดินทาง (ใช้เมื่อสัญชาติต่างชาติ) */
  passportNo: string;
  /** สัญชาติ — ไทย/ต่างชาติ (ค่าเริ่มต้นไทย) */
  nationality: WizardNationality;
  leaderType: LeaderType | '';

  // 1. ข้อมูลส่วนตัว — ข้อมูลติดต่อ (ตารางเพิ่มแถวได้ · รวมประเภท "โทรศัพท์ (คน Call)")
  contacts: WizardContactRow[];

  // 1. ข้อมูลส่วนตัว — ข้อมูลที่อยู่
  address: WizardAddress;
  idCardSameAsCurrent: boolean;
  idCardAddress: WizardAddress;

  // 2. ประสบการณ์ทำงาน
  experiences: WizardExperienceRow[];

  // 3. ความรู้ความสามารถด้านภาษา
  languages: WizardLanguageRow[];
  languageWorkDetail: string;

  // 4. ความถนัดในการออกทัวร์
  tourTypes: string[];
  // เงื่อนไข "เน้นทำยอด" (sales)
  salesAmount: string;
  salesCurrency: string;
  salesCurrencyOther: string;
  salesMonth: string; // YYYY-MM
  salesDetails: string;
  // เงื่อนไข "อื่น ๆ โปรดระบุ"
  expertiseOther: string;
  // ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น)
  expertiseScope: ExpertiseScope;
  expertiseCountries: WizardCountryExpertise[];
  extraSkills: string;

  // 5. เอกสารประจำตัว (แต่ละชิ้นมี "ข้อมูลจากเอกสาร" รองรับ OCR)
  idCard: DocEntry; // ด้านหน้าบัตรประชาชน — รายการเดียว (บังคับแนบไฟล์)
  passports: DocEntry[]; // หนังสือเดินทาง — หลายเล่ม
  visas: DocEntry[]; // Visa — หลายรายการ
  tourCards: DocEntry[]; // บัตรหัวหน้าทัวร์ — หลายใบ
  criminalRecord: DocEntry; // เอกสารประวัติอาชญากรรม — รายการเดียว
}

function emptyAddress(): WizardAddress {
  return {
    houseNo: '',
    villageNo: '',
    building: '',
    alley: '',
    road: '',
    subdistrict: '',
    district: '',
    province: '',
    postalCode: '',
  };
}

export function newLanguageRow(language = ''): WizardLanguageRow {
  return {
    id: newChildId('WL'),
    language,
    customLanguage: '',
    isNativeLanguage: false,
    levelCode: '',
  };
}

export function emptyWizardForm(code: string): WizardForm {
  return {
    code,
    photoUrl: null,
    title: WIZARD_TITLES[0],
    titleEn: WIZARD_TITLE_TH_TO_EN[WIZARD_TITLES[0]] ?? '',
    firstName: '',
    lastName: '',
    firstNameEn: '',
    lastNameEn: '',
    nickname: '',
    nicknameEn: '',
    birthDate: '',
    nationalId: '',
    passportNo: '',
    nationality: 'thai',
    leaderType: '',

    // ค่าเริ่มต้น: มือถือ (หลัก) / อีเมล / LINE ID
    contacts: [
      { ...newContactRow('mobile'), isPrimary: true },
      newContactRow('email'),
      newContactRow('line'),
    ],

    address: emptyAddress(),
    // ค่าเริ่มต้น: ที่อยู่ตามบัตรใช้ข้อมูลเดียวกับที่อยู่ปัจจุบัน (ติ๊กไว้)
    idCardSameAsCurrent: true,
    idCardAddress: emptyAddress(),

    // ตารางประสบการณ์แบบ Excel — เริ่มต้น 5 แถวว่าง (ยังไม่ validate)
    experiences: Array.from({ length: WIZARD_EXPERIENCE_MIN_ROWS }, () => newExperienceRow()),

    languages: [newLanguageRow('อังกฤษ')],
    languageWorkDetail: '',

    tourTypes: [],
    salesAmount: '',
    salesCurrency: '',
    salesCurrencyOther: '',
    salesMonth: '',
    salesDetails: '',
    expertiseOther: '',
    expertiseScope: 'all_countries',
    expertiseCountries: [],
    extraSkills: '',

    idCard: newDocEntry('id_card'),
    passports: [],
    visas: [],
    tourCards: [],
    criminalRecord: newDocEntry('criminal_record'),
  };
}

/* -------------------------------- Validation -------------------------------- */

export interface WizardError {
  tab: WizardTabKey;
  field: string;
  message: string;
}

export interface WizardValidation {
  ok: boolean;
  errors: WizardError[];
  byField: Record<string, string>;
  byTab: Record<WizardTabKey, number>;
  firstTab?: WizardTabKey;
  firstField?: string;
}

const PHONE_RE = /^\+?[0-9][0-9\-() ]{7,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** เลขที่หนังสือเดินทาง — อักษรอังกฤษ/ตัวเลข 6–20 ตัว */
const PASSPORT_PATTERN = /^[A-Za-z0-9]{6,20}$/;
/** YYYY-MM-DD */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ตรวจรูปแบบข้อมูลติดต่อตามประเภท (โทรศัพท์/อีเมลตรวจรูปแบบ · อื่น ๆ เป็นข้อความอิสระ) */
export function validateContactRowValue(
  type: WizardContactType,
  value: string,
): string | undefined {
  const v = value.trim();
  if (!v) return 'กรุณากรอกข้อมูลติดต่อ';
  if (type === 'mobile' || type === 'phone_alt') {
    return PHONE_RE.test(v) ? undefined : 'รูปแบบเบอร์โทรไม่ถูกต้อง (เช่น 081-234-5678)';
  }
  if (type === 'email') {
    return EMAIL_RE.test(v) ? undefined : 'รูปแบบอีเมลไม่ถูกต้อง (เช่น name@example.com)';
  }
  return undefined;
}

/** ชื่อภาษาที่ใช้จริงของแถว (รองรับ "อื่น ๆ" ที่ระบุเอง) */
export function resolvedLanguageName(row: WizardLanguageRow): string {
  return row.language === WIZARD_LANGUAGE_OTHER ? row.customLanguage.trim() : row.language.trim();
}

function checkAddress(
  address: WizardAddress,
  prefix: string,
  push: (field: string, message: string) => void,
  labelSuffix: string,
) {
  if (!address.houseNo.trim()) push(`${prefix}houseNo`, `กรุณากรอกบ้านเลขที่${labelSuffix}`);
  if (!address.subdistrict.trim()) push(`${prefix}subdistrict`, `กรุณากรอกแขวง / ตำบล${labelSuffix}`);
  if (!address.district.trim()) push(`${prefix}district`, `กรุณากรอกเขต / อำเภอ${labelSuffix}`);
  if (!address.province.trim()) push(`${prefix}province`, `กรุณากรอกจังหวัด${labelSuffix}`);
  if (!address.postalCode.trim()) {
    push(`${prefix}postalCode`, `กรุณากรอกรหัสไปรษณีย์${labelSuffix}`);
  } else if (!POSTAL_CODE_PATTERN.test(address.postalCode.trim())) {
    push(`${prefix}postalCode`, 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก');
  }
}

/** ตรวจทั้งฟอร์ม จัดกลุ่ม error ตามแท็บ */
export function validateWizard(form: WizardForm): WizardValidation {
  const errors: WizardError[] = [];
  const on = (tab: WizardTabKey) => (field: string, message: string) =>
    errors.push({ tab, field, message });

  /* 1. ข้อมูลส่วนตัว — ข้อมูลพื้นฐาน + ติดต่อ + ที่อยู่ */
  {
    const add = on('personal');

    // ข้อมูลพื้นฐาน — คำนำหน้า/ชื่อ/นามสกุล
    // สัญชาติไทย: บังคับชื่อไทย + อังกฤษ · ต่างชาติ: บังคับเฉพาะชื่ออังกฤษ (ชื่อไทยถูกซ่อน)
    const EN_NAME_HINT = 'ใช้ได้เฉพาะอักษรอังกฤษ ช่องว่าง จุด อัญประกาศเดี่ยว และขีดกลาง';
    const wantsThaiName = form.nationality === 'thai';

    if (wantsThaiName) {
      if (!form.title.trim()) add('title', 'กรุณาเลือกคำนำหน้า (ไทย)');
      if (!form.firstName.trim()) add('firstName', 'กรุณากรอกชื่อ (ไทย)');
      if (!form.lastName.trim()) add('lastName', 'กรุณากรอกนามสกุล (ไทย)');
    }

    if (!form.titleEn.trim()) add('titleEn', 'กรุณาเลือกคำนำหน้า (อังกฤษ)');

    if (!form.firstNameEn.trim()) {
      add('firstNameEn', 'กรุณากรอกชื่อ (อังกฤษ)');
    } else if (!NAME_EN_PATTERN.test(form.firstNameEn.trim())) {
      add('firstNameEn', EN_NAME_HINT);
    }
    if (!form.lastNameEn.trim()) {
      add('lastNameEn', 'กรุณากรอกนามสกุล (อังกฤษ)');
    } else if (!NAME_EN_PATTERN.test(form.lastNameEn.trim())) {
      add('lastNameEn', EN_NAME_HINT);
    }

    // ชื่อเล่นภาษาอังกฤษไม่บังคับ — แต่ถ้ากรอกต้องเป็นอักษรอังกฤษ
    if (form.nicknameEn.trim() && !NAME_EN_PATTERN.test(form.nicknameEn.trim())) {
      add('nicknameEn', EN_NAME_HINT);
    }

    if (!form.birthDate) add('birthDate', 'กรุณาระบุวันเดือนปีเกิด');

    // เอกสารประจำตัวตามสัญชาติ — ไทย = เลขบัตรประชาชน · ต่างชาติ = เลขหนังสือเดินทาง
    // (ตรวจเฉพาะช่องของสัญชาติที่เลือก · อีกช่องถูกซ่อนและไม่ validate)
    if (form.nationality === 'foreign') {
      if (!PASSPORT_PATTERN.test(form.passportNo.trim())) {
        add(
          'passportNo',
          'กรุณากรอกเลขที่หนังสือเดินทางเป็นตัวอักษรอังกฤษหรือตัวเลข 6–20 ตัว',
        );
      }
    } else {
      if (!NATIONAL_ID_PATTERN.test(form.nationalId.trim())) {
        add('nationalId', 'กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก');
      }
    }

    if (!form.nationality) add('nationality', 'กรุณาเลือกสัญชาติ');
    if (!form.leaderType) add('leaderType', 'กรุณาเลือกรูปแบบการร่วมงาน');

    // ข้อมูลติดต่อ (ตาราง) — ตรวจรูปแบบรายแถว, ห้ามซ้ำ, ต้องมีมือถือ + รายการหลัก
    const filledContacts = form.contacts.filter(contactRowFilled);
    if (filledContacts.length === 0) {
      add('contacts', 'กรุณากรอกข้อมูลติดต่ออย่างน้อย 1 รายการ');
    }
    if (!form.contacts.some((c) => c.type === 'mobile' && c.value.trim() !== '')) {
      add('contacts', 'ต้องมีเบอร์โทรศัพท์มือถืออย่างน้อย 1 รายการ');
    }
    const seenContact = new Map<string, string>();
    for (const c of filledContacts) {
      // "โทรศัพท์ (คน Call)" — ตรวจเบอร์ตามประเทศ (E.164) ไม่ตรวจ value/ซ้ำแบบช่องทางทั่วไป
      if (c.type === 'call') {
        const phone = contactRowCallPhone(c);
        if (!isPhoneEmpty(phone) && !isPhoneValid(phone)) {
          add(c.id, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้องสำหรับประเทศที่เลือก');
        }
        continue;
      }
      const message = validateContactRowValue(c.type, c.value);
      if (message) add(c.id, message);
      const key = c.value.trim().toLowerCase();
      if (seenContact.has(key)) add(c.id, 'ข้อมูลติดต่อนี้ซ้ำกับรายการอื่น');
      else seenContact.set(key, c.id);
    }
    const primaryContacts = filledContacts.filter((c) => c.isPrimary).length;
    if (filledContacts.length > 0 && primaryContacts === 0) {
      add('contacts', 'กรุณาเลือกรายการติดต่อหลัก 1 รายการ');
    } else if (primaryContacts > 1) {
      add('contacts', 'กำหนดรายการติดต่อหลักได้เพียง 1 รายการ');
    }

    // ข้อมูลที่อยู่
    checkAddress(form.address, '', add, 'ที่อยู่ปัจจุบัน');
    if (!form.idCardSameAsCurrent) {
      checkAddress(form.idCardAddress, 'idCard_', add, 'ตามบัตรประชาชน');
    }
  }

  /* 2. ประสบการณ์ทำงาน (ตาราง) — ต้องมีอย่างน้อย 1 รายการ, ตรวจแต่ละแถวที่กรอก */
  {
    const add = on('experience');
    const filled = form.experiences.filter(experienceRowFilled);
    if (filled.length === 0) {
      add('experiences', 'กรุณาเพิ่มประสบการณ์ทำงานอย่างน้อย 1 รายการ');
    }
    // เลือก "ยังทำงานอยู่" ได้ไม่เกิน 1 รายการ
    if (form.experiences.filter((e) => e.isCurrent).length > 1) {
      add('experiences', 'เลือก “ยังทำงานอยู่” ได้เพียง 1 รายการ');
    }
    for (const e of filled) {
      if (!e.company.trim()) {
        add(e.id, 'กรุณากรอกบริษัท/หน่วยงาน');
      } else if (!e.position.trim()) {
        add(e.id, 'กรุณากรอกตำแหน่ง');
      } else if (!e.startDate) {
        add(e.id, 'กรุณาระบุวันที่เริ่ม');
      } else if (!DATE_RE.test(e.startDate)) {
        add(e.id, 'รูปแบบวันที่เริ่มไม่ถูกต้อง');
      } else if (!e.isCurrent) {
        if (!e.endDate) {
          add(e.id, 'กรุณาระบุวันที่สิ้นสุด');
        } else if (!DATE_RE.test(e.endDate)) {
          add(e.id, 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง');
        } else if (e.endDate < e.startDate) {
          add(e.id, 'วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่ม');
        }
      }
    }
  }

  /* 3. ความรู้ความสามารถด้านภาษา */
  {
    const add = on('language');
    const named = form.languages.filter((l) => resolvedLanguageName(l) !== '');
    if (named.length === 0) {
      add('languages', 'กรุณาเพิ่มภาษาอย่างน้อย 1 ภาษา');
    }
    const seen = new Set<string>();
    for (const row of form.languages) {
      if (row.language === WIZARD_LANGUAGE_OTHER && !row.customLanguage.trim()) {
        add(row.id, 'กรุณาระบุชื่อภาษาที่เลือก “อื่น ๆ”');
        continue;
      }
      const name = resolvedLanguageName(row);
      if (!name) {
        add(row.id, 'กรุณาเลือกภาษา');
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) add(row.id, `ภาษา “${name}” ถูกเพิ่มซ้ำ`);
      seen.add(key);
    }
  }

  /* 4. ความถนัดในการออกทัวร์ — เลือกได้หลายข้อ + เงื่อนไข "เน้นทำยอด" / "อื่น ๆ" */
  {
    const add = on('expertise');
    if (form.tourTypes.length === 0) {
      add('tourTypes', 'กรุณาเลือกความถนัดในการออกทัวร์อย่างน้อย 1 รายการ');
    }
    // เน้นทำยอด → ยอดขายและสกุลเงินบังคับ
    if (form.tourTypes.includes('sales')) {
      const salesAmount = (form.salesAmount ?? '').trim();
      const amount = Number(salesAmount);
      if (!salesAmount) {
        add('salesAmount', 'กรุณากรอกยอดขายสูงสุดที่เคยทำได้');
      } else if (!Number.isFinite(amount) || amount <= 0) {
        add('salesAmount', 'ยอดขายต้องเป็นตัวเลขมากกว่า 0');
      }
      if (!form.salesCurrency) {
        add('salesCurrency', 'กรุณาเลือกสกุลเงิน');
      } else if (form.salesCurrency === 'other' && !(form.salesCurrencyOther ?? '').trim()) {
        add('salesCurrencyOther', 'กรุณาระบุสกุลเงิน');
      }
    }
    // อื่น ๆ โปรดระบุ → บังคับกรอก ≤ 200 ตัวอักษร
    if (form.tourTypes.includes('other')) {
      const other = (form.expertiseOther ?? '').trim();
      if (!other) {
        add('expertiseOther', 'กรุณาระบุความถนัดอื่น');
      } else if (other.length > WIZARD_EXPERTISE_OTHER_MAX) {
        add('expertiseOther', `ระบุได้ไม่เกิน ${WIZARD_EXPERTISE_OTHER_MAX} ตัวอักษร`);
      }
    }

    // ประเทศ/เส้นทางที่เชี่ยวชาญ — ตรวจเฉพาะเมื่อเลือก "ระบุประเทศและเส้นทาง"
    if (form.expertiseScope === 'selected_countries') {
      const list = form.expertiseCountries ?? [];
      const filled = list.filter((c) => c.countryCode || c.routes.length > 0);
      if (filled.length === 0) {
        add('expertiseCountries', 'ต้องเลือกประเทศที่เชี่ยวชาญอย่างน้อย 1 รายการ');
      }
      const seen = new Set<string>();
      for (const c of filled) {
        if (!c.countryCode) {
          add(c.id, 'กรุณาเลือกประเทศ');
          continue;
        }
        if (seen.has(c.countryCode)) add(c.id, 'ประเทศนี้ถูกเพิ่มซ้ำ');
        seen.add(c.countryCode);
        if (c.routeScope === 'selected_routes' && c.routes.length === 0) {
          add(c.id, 'กรุณาเลือกสนามบินหรือจุดหมายปลายทางอย่างน้อย 1 รายการ');
        }
      }
    }
  }

  /* 5. เอกสารประจำตัว */
  {
    const add = on('documents');
    if (!form.idCard.file) add('idCard', 'กรุณาอัปโหลดด้านหน้าบัตรประชาชน');
    // เลขบัตรประชาชนจากเอกสาร (ถ้ากรอก) ต้องเป็น 13 หลัก
    const idNumber = form.idCard.verifiedData.idNumber?.trim() ?? '';
    if (idNumber && !NATIONAL_ID_PATTERN.test(idNumber)) {
      add(docFieldErrorKey('id_card', form.idCard.id, 'idNumber'), 'เลขบัตรประชาชนต้องมี 13 หลัก');
    }
    // วันหมดอายุต้องไม่ก่อนวันที่ออก (ทุกเอกสารที่มีสองช่องนี้)
    const expiryChecks: DocEntry[] = [form.idCard, ...form.passports, ...form.visas, ...form.tourCards];
    for (const e of expiryChecks) {
      if (isExpiryBeforeIssue(e.verifiedData.issuedDate, e.verifiedData.expiryDate)) {
        add(docFieldErrorKey(e.kind, e.id, 'expiryDate'), 'วันหมดอายุต้องไม่ก่อนวันที่ออก');
      }
    }
  }

  /* 6. เอกสารเพิ่มเติม — เอกสารประวัติอาชญากรรม (ไม่บังคับ · ตรวจวันหมดอายุไม่ก่อนวันออก) */
  {
    const add = on('additional');
    const cr = form.criminalRecord;
    if (isExpiryBeforeIssue(cr.verifiedData.issuedDate, cr.verifiedData.expiryDate)) {
      add(docFieldErrorKey(cr.kind, cr.id, 'expiryDate'), 'วันหมดอายุต้องไม่ก่อนวันที่ออก');
    }
  }

  const byField: Record<string, string> = {};
  for (const e of errors) if (!byField[e.field]) byField[e.field] = e.message;

  const byTab = WIZARD_TAB_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: errors.filter((e) => e.tab === key).length }),
    {} as Record<WizardTabKey, number>,
  );

  return {
    ok: errors.length === 0,
    errors,
    byField,
    byTab,
    firstTab: errors[0]?.tab,
    firstField: errors[0]?.field,
  };
}

/** ตรวจเฉพาะแท็บเดียว (ใช้ตอนกด "ถัดไป") */
export function validateWizardTab(form: WizardForm, tab: WizardTabKey): WizardError[] {
  return validateWizard(form).errors.filter((e) => e.tab === tab);
}

/* --------------------------- แปลงเป็น LeaderFormState --------------------------- */

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function mapAddress(address: WizardAddress): LeaderFormState['address'] {
  return {
    houseNo: address.houseNo.trim(),
    villageNo: address.villageNo.trim() || undefined,
    building: address.building.trim() || undefined,
    alley: address.alley.trim() || undefined,
    road: address.road.trim() || undefined,
    subdistrict: address.subdistrict.trim() || undefined,
    district: address.district.trim() || undefined,
    province: address.province.trim() || undefined,
    postalCode: address.postalCode.trim() || undefined,
    countryId: 'C-TH',
  };
}

/**
 * ความเชี่ยวชาญจากวิซาร์ด → ExpertiseScope[] (โครงสร้างเดียวกับหน้าแก้ไข §15)
 *
 * ต้องบันทึกลง Expertise Scope Store ด้วย ไม่ใช่แค่ routeSkills เดิม
 * เพราะคอลัมน์ "โซน / ประเทศ / เส้นทาง" ในหน้ารายชื่อ · หน้า Schedule · หน้าภาพรวม
 * อ่านจาก Store นี้จุดเดียว — ถ้าไม่เขียน หัวหน้าทัวร์ที่เพิ่งสร้างจะไม่มีความเชี่ยวชาญแสดงเลย
 *
 * วิซาร์ดยังไม่มีการเลือก "โซน" จึงบันทึกเป็นระดับประเทศ (zoneId = null) ตามที่ผู้ใช้กรอกจริง
 * ประเทศแรกถูกตั้งเป็นรายการหลัก · ไม่เดาข้อมูลที่ผู้ใช้ไม่ได้เลือก
 */
export function wizardToExpertiseScopes(form: WizardForm): LeaderExpertiseScope[] {
  if (form.expertiseScope !== 'selected_countries') return [];
  return (form.expertiseCountries ?? [])
    .filter((c) => c.countryCode)
    .map((c, i) => {
      const codes = c.routes
        .map((r) => r.iataCode.trim().toUpperCase())
        .filter(Boolean);
      const specific = c.routeScope === 'selected_routes' && codes.length > 0;
      return {
        id: newChildId('ES'),
        zoneId: null,
        countryId: c.countryCode,
        countryScope: 'specific' as const,
        routeScope: specific ? ('specific' as const) : ('all_routes' as const),
        routeCodes: specific ? codes : [],
        isPrimaryZone: false,
        isPrimaryCountry: i === 0,
        primaryRouteCodes: [],
        displayOrder: i,
      };
    });
}

/**
 * แปลงข้อมูลวิซาร์ดเป็น `LeaderFormState` เพื่อบันทึกผ่าน pipeline เดิม
 * (formToLeader จะปิดบังเลขบัตร/พาสปอร์ต และสร้าง record ที่สมบูรณ์)
 */
export function wizardToLeaderForm(
  form: WizardForm,
  code: string,
  today: string,
): LeaderFormState {
  const base = emptyLeaderForm(code, today);

  /* ช่องทางติดต่อ — จากตาราง (บันทึกเฉพาะแถวที่กรอกค่าแล้ว) */
  const contactChannelType: Record<WizardContactType, LeaderFormState['contacts'][number]['type']> = {
    mobile: 'phone',
    phone_alt: 'phone',
    call: 'phone',
    email: 'email',
    line: 'line',
    whatsapp: 'whatsapp',
    other: 'other',
  };
  const contactTypeLabel: Record<WizardContactType, string> = {
    mobile: 'เบอร์มือถือ',
    phone_alt: 'เบอร์สำรอง',
    call: 'โทรศัพท์ (คน Call)',
    email: 'อีเมล',
    line: 'LINE ID',
    whatsapp: 'WhatsApp',
    other: 'อื่น ๆ',
  };
  // ช่องทางติดต่อทั่วไป (ไม่รวม "โทรศัพท์ (คน Call)" ซึ่งเก็บเป็นผู้ติดต่อฉุกเฉิน)
  const contacts: LeaderFormState['contacts'] = form.contacts
    .filter((c) => c.type !== 'call' && c.value.trim() !== '')
    .map((c) => ({
      id: newChildId('CC'),
      type: contactChannelType[c.type],
      label: c.note.trim() || contactTypeLabel[c.type],
      value: c.value.trim(),
      isPrimary: c.isPrimary,
      note: c.note.trim() || undefined,
    }));

  /*
    ภาษา — แปลงเข้าโครงสร้างปัจจุบัน (มาตรฐานตามภาษา + ระดับ)

    ข้ามแถวที่มีแต่ชื่อภาษาแต่ผู้ใช้ยังไม่ได้ระบุระดับหรือติ๊กภาษาแม่เลย
    (ฟอร์มมีแถวเริ่มต้น "อังกฤษ" ไว้ให้กรอก — ถ้าไม่ได้แตะ ต้องไม่กลายเป็นข้อมูลจริง)
  */
  const hasLanguageInput = (l: WizardLanguageRow) => l.levelCode !== '' || l.isNativeLanguage;
  const namedLanguages = form.languages.filter(
    (l) => resolvedLanguageName(l) !== '' && hasLanguageInput(l),
  );
  const languages: LeaderFormState['languages'] = namedLanguages.map((row) => {
    const languageName = resolvedLanguageName(row);
    const languageCode = row.language === WIZARD_LANGUAGE_OTHER ? 'OTHER' : (WIZARD_LANGUAGE_CODE[row.language] ?? 'OTHER');
    const standard = wizardLanguageStandard(row.language);
    const opt = !row.isNativeLanguage && row.levelCode ? levelOption(standard, row.levelCode) : undefined;

    return {
      id: newChildId('L'),
      languageCode,
      languageName,
      isNativeLanguage: row.isNativeLanguage,
      standard,
      levelCode: opt ? opt.code : null,
      levelName: opt ? opt.name : null,
      levelRank: opt ? opt.rank : null,
    };
  });

  /* ความถนัดในการออกทัวร์ → ทักษะการทำงาน ("อื่น ๆ" ใช้ข้อความที่ระบุเป็นชื่อ) */
  const tourSkills: LeaderFormState['tourSkills'] = form.tourTypes.map((typeCode) => {
    const def = WIZARD_TOUR_TYPES.find((t) => t.code === typeCode);
    const otherName = (form.expertiseOther ?? '').trim();
    const name = typeCode === 'other' && otherName ? otherName : def?.label ?? typeCode;
    return {
      id: newChildId('TS'),
      masterId: `WT-${typeCode}`,
      category: 'work_skill' as const,
      code: typeCode,
      name,
      level: 'good' as const,
    };
  });

  /* ประสบการณ์ทำงาน (หลายรายการ) → ประวัติการทำงาน (เก็บเฉพาะแถวที่มีชื่อบริษัท) */
  const employmentHistory: LeaderFormState['employmentHistory'] = form.experiences
    .filter((e) => e.company.trim() !== '')
    .map((e) => {
      const start = parseDateYM(e.startDate);
      const end = e.isCurrent ? null : parseDateYM(e.endDate ?? '');
      const description = [
        e.responsibilities.trim() ? `หน้าที่: ${e.responsibilities.trim()}` : '',
        e.routes.trim() ? `เส้นทางที่เคยดูแล: ${e.routes.trim()}` : '',
        e.region.trim() ? `ประเทศ/ภูมิภาค: ${e.region.trim()}` : '',
        e.paxApprox.trim() ? `จำนวนลูกทัวร์โดยประมาณ: ${e.paxApprox.trim()}` : '',
        e.achievements.trim() ? `ผลงานที่เกี่ยวข้อง: ${e.achievements.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        id: newChildId('EH'),
        tourLeaderId: code,
        employerName: e.company.trim(),
        position: e.position.trim() || '(ไม่ระบุ)',
        currency: 'THB',
        startMonth: start?.month ?? 1,
        startYear: start?.year ?? 0,
        endMonth: end?.month,
        endYear: end?.year,
        isCurrentJob: e.isCurrent,
        jobDescription: description || undefined,
        reasonForLeaving: undefined,
        createdAt: `${today}T09:00`,
        updatedAt: `${today}T09:00`,
      };
    });

  /*
   * เอกสารประจำตัว → รายการเอกสาร (ใช้ verifiedData ที่ผู้ใช้ตรวจแล้ว · เลขบัตร/พาสปอร์ตถูกปิดบังใน formToLeader)
   * verifyStatus = 'verified' เมื่อผู้ใช้กดยืนยัน มิฉะนั้น 'pending'
   */
  const documents: LeaderFormState['documents'] = [];
  const pushDoc = (
    entry: DocEntry,
    base: {
      kind: LeaderFormState['documents'][number]['kind'];
      name: string;
      number: string;
      issuingCountryId?: string;
      issuedAt: string;
      expiresAt: string | null;
      note?: string;
    },
  ) => {
    if (!entry.file) return;
    documents.push({
      id: newChildId('DOC'),
      ...base,
      fileName: entry.file.name,
      verifyStatus: entry.verified ? 'verified' : 'pending',
    });
  };

  {
    const d = form.idCard.verifiedData;
    pushDoc(form.idCard, {
      kind: 'national_id',
      name: 'บัตรประชาชน (ด้านหน้า)',
      number: (d.idNumber || form.nationalId).trim(),
      issuedAt: d.issuedDate || '',
      expiresAt: d.expiryDate || null,
      note: [d.title, d.firstName, d.lastName].filter(Boolean).join(' ') || undefined,
    });
  }
  form.passports.forEach((p, i) => {
    const d = p.verifiedData;
    pushDoc(p, {
      kind: 'passport',
      name: form.passports.length > 1 ? `หนังสือเดินทาง #${i + 1}` : 'หนังสือเดินทาง',
      number: d.number.trim(),
      issuingCountryId: d.issuingCountryId || undefined,
      issuedAt: d.issuedDate || '',
      expiresAt: d.expiryDate || null,
      note: [d.nationality, [d.firstName, d.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || undefined,
    });
  });
  form.visas.forEach((v, i) => {
    const d = v.verifiedData;
    pushDoc(v, {
      kind: 'visa',
      name: d.visaType ? `วีซ่า (${d.visaType})` : form.visas.length > 1 ? `วีซ่า #${i + 1}` : 'วีซ่า',
      number: d.number.trim(),
      issuingCountryId: d.countryId || undefined,
      issuedAt: d.issuedDate || '',
      expiresAt: d.expiryDate || null,
      note: [d.visaType, d.entries, d.duration].filter(Boolean).join(' · ') || undefined,
    });
  });
  form.tourCards.forEach((c, i) => {
    const d = c.verifiedData;
    pushDoc(c, {
      kind: 'license',
      name: d.cardType ? `บัตรหัวหน้าทัวร์ (${d.cardType})` : form.tourCards.length > 1 ? `บัตรหัวหน้าทัวร์ #${i + 1}` : 'บัตรหัวหน้าทัวร์',
      number: d.number.trim(),
      issuedAt: d.issuedDate || '',
      expiresAt: d.expiryDate || null,
      note: [d.holderName, d.issuer ? `ออกโดย ${d.issuer}` : ''].filter(Boolean).join(' · ') || undefined,
    });
  });
  {
    const d = form.criminalRecord.verifiedData;
    pushDoc(form.criminalRecord, {
      /* เหลือเฉพาะวันที่ — ช่องข้อความของเอกสารประวัติอาชญากรรมถูกตัดออกแล้ว (ตัวไฟล์คือเอกสาร) */
      kind: 'other',
      name: 'เอกสารประวัติอาชญากรรม',
      number: '',
      issuedAt: d.issuedDate || '',
      expiresAt: d.expiryDate || null,
    });
  }

  /* ประเทศ/เส้นทางที่เชี่ยวชาญ → routeSkills (custom route เก็บชื่อไว้ใน note) */
  const routeSkills: LeaderFormState['routeSkills'] =
    form.expertiseScope === 'selected_countries'
      ? (form.expertiseCountries ?? [])
          .filter((c) => c.countryCode)
          .map((c) => {
            const customNames = c.routes.filter((r) => r.isCustom).map((r) => r.iataCode || r.nameTh);
            const flightPreviews = c.flightRoutes
              .filter(isFlightRouteValid)
              .map((fr) => flightRoutePreview(fr.airportCodes));
            const noteParts = [
              customNames.length ? `สนามบินที่เพิ่มเอง (รอตรวจสอบ): ${customNames.join(', ')}` : '',
              flightPreviews.length ? `เส้นทางบิน: ${flightPreviews.join(' · ')}` : '',
            ].filter(Boolean);
            return {
              id: newChildId('RS'),
              countryId: c.countryCode,
              coverage:
                c.routeScope === 'all_routes' ? ('all_routes' as const) : ('selected_routes' as const),
              routeIds:
                c.routeScope === 'selected_routes'
                  ? c.routes.filter((r) => !r.isCustom).map((r) => r.id)
                  : [],
              skillLevel: 'can_lead' as const,
              note: noteParts.length ? noteParts.join(' · ') : undefined,
            };
          })
      : [];

  /* สรุปยอดขายสูงสุด (เมื่อเลือก "เน้นทำยอด") */
  const salesAmount = (form.salesAmount ?? '').trim();
  const salesDetails = (form.salesDetails ?? '').trim();
  const salesCurrencyLabel =
    form.salesCurrency === 'other'
      ? (form.salesCurrencyOther ?? '').trim()
      : WIZARD_CURRENCIES.find((c) => c.code === form.salesCurrency)?.code ?? form.salesCurrency ?? '';
  const salesNote =
    form.tourTypes.includes('sales') && salesAmount
      ? `ยอดขายสูงสุด ${salesAmount} ${salesCurrencyLabel}` +
        `${form.salesMonth ? ` (${form.salesMonth})` : ''}` +
        `${salesDetails ? ` — ${salesDetails}` : ''}`
      : '';

  /* หมายเหตุทั่วไป — เก็บข้อมูลเชิงบรรยายที่ไม่มีช่องเฉพาะ */
  const expSummary = summarizeWizardExperience(form.experiences, today);
  const generalNote = truncate(
    [
      expSummary.totalMonths > 0 ? `ประสบการณ์รวม ${expSummary.label}` : '',
      salesNote,
      form.expertiseScope === 'all_countries' ? 'เชี่ยวชาญทุกประเทศและทุกเส้นทาง' : '',
      form.extraSkills.trim() ? `ทักษะเพิ่มเติม: ${form.extraSkills.trim()}` : '',
      form.languageWorkDetail.trim() ? `การใช้ภาษาในงาน: ${form.languageWorkDetail.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    NOTE_MAX_LENGTH.generalNote,
  );

  const isThai = form.nationality === 'thai';

  // ประเภท "โทรศัพท์ (คน Call)" → ผู้ติดต่อฉุกเฉิน (เก็บเบอร์เป็น E.164 · note ระบุประเภท)
  const emergencyContacts: LeaderFormState['emergencyContacts'] = form.contacts
    .filter((c) => c.type === 'call' && contactRowFilled(c))
    .map((c, i) => {
      const phone = contactRowCallPhone(c);
      return {
        id: newChildId('EC'),
        name: (c.callName ?? '').trim(),
        relation: '',
        phone: phone.phoneE164 || phone.displayPhone.trim(),
        isPrimary: i === 0,
        note: 'โทรศัพท์ (คน Call)',
      };
    });

  return {
    ...base,
    id: code,
    // สัญชาติไทย = บุคคลไทย (เก็บเลขบัตร) · ต่างชาติ = บุคคลต่างชาติ
    personType: isThai ? 'thai' : 'foreigner',
    nationalityCountryId: isThai ? 'C-TH' : '',
    leaderType: form.leaderType || DEFAULT_LEADER_TYPE,
    title: form.title,
    titleEn: form.titleEn.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    firstNameEn: form.firstNameEn.trim(),
    lastNameEn: form.lastNameEn.trim(),
    nickname: form.nickname.trim(),
    nicknameEn: form.nicknameEn.trim(),
    birthDate: form.birthDate,
    photoUrl: form.photoUrl,
    // เลขบัตรใช้เมื่อไทย · เลขหนังสือเดินทางใช้เมื่อต่างชาติ (formToLeader ปิดบังให้)
    nationalIdNumber: isThai ? form.nationalId.trim() : '',
    passportNumber: isThai ? '' : form.passportNo.trim(),

    address: mapAddress(form.address),
    idCardSameAsCurrent: form.idCardSameAsCurrent,
    idCardAddress: form.idCardSameAsCurrent
      ? { houseNo: '', countryId: 'C-TH' }
      : mapAddress(form.idCardAddress),

    contacts,
    emergencyContacts,
    languages,
    tourSkills,
    routeSkills,
    employmentHistory,
    documents,
    generalNote,
  };
}
