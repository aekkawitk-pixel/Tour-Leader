/**
 * Passport Book (§3/§5/§7/§10) — เล่มหนังสือเดินทางของหัวหน้าทัวร์ (รองรับหลายเล่ม · เล่มหลัก 1 เล่ม)
 *
 * แยกเก็บ 2 ชุดเสมอ (§10) เพื่อให้ตรวจย้อนหลังได้ว่าค่าใดมาจาก OCR และค่าใดผู้ใช้แก้:
 *   • ocrOriginal — ค่าที่ OCR อ่านได้ "ครั้งแรก" + ระดับความมั่นใจรายช่อง (ห้ามแก้ทับ)
 *   • fields      — ค่าปัจจุบันที่ผู้ใช้ตรวจสอบ/แก้ไขและยืนยัน
 *
 * รูปต้นฉบับเก็บแยกใน Private Storage (IndexedDB) อ้างด้วย imageId เท่านั้น (§9)
 * ห้ามเก็บเลขหนังสือเดินทางลง Audit Log (§9 — สอดคล้องกับ passportAudit เดิม)
 */

import {
  DOCUMENT_LIFECYCLE_LABEL,
  type DocumentEntryMethod,
  type DocumentHistoryEntry,
  type DocumentLifecycle,
  type DocumentStatus,
  type FieldOrigin as DocumentFieldOrigin,
  type OcrConfidence as DocumentOcrConfidence,
  type OcrField as DocumentOcrField,
  type OcrFieldSource as DocumentOcrFieldSource,
} from './documentRecordTypes';

/** ช่องข้อมูลที่ต้องอ่านจาก Passport (§1-§4) — ตรงกับข้อความบนหน้าเล่มจริง */
export type PassportFieldKey =
  // Section A: ข้อมูลหนังสือเดินทาง
  | 'passportType'
  | 'issuingCountry'
  | 'passportNo'
  | 'issueDate'
  | 'expiryDate'
  | 'issuingAuthority'
  | 'placeOfIssue'
  // Section B: ชื่อตาม Passport (อังกฤษตามเล่ม + ไทย)
  | 'titleName'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'titleNameTh'
  | 'firstNameTh'
  | 'lastNameTh'
  | 'fullNameTh'
  | 'nameInThaiRaw'
  // Section C: ข้อมูลส่วนบุคคล
  | 'nationality'
  | 'dateOfBirth'
  | 'gender'
  | 'placeOfBirth'
  | 'nationalId'
  | 'height'
  // MRZ
  | 'mrzLine1'
  | 'mrzLine2';

/** ลำดับช่องสำหรับแสดงในฟอร์ม (§6 — เรียงตาม Section A→B→C→MRZ) */
export const PASSPORT_FIELD_ORDER: PassportFieldKey[] = [
  'passportType', 'issuingCountry', 'passportNo', 'issueDate', 'expiryDate', 'issuingAuthority', 'placeOfIssue',
  'titleName', 'firstName', 'lastName', 'fullName',
  'titleNameTh', 'firstNameTh', 'lastNameTh', 'fullNameTh', 'nameInThaiRaw',
  'nationality', 'dateOfBirth', 'gender', 'placeOfBirth', 'nationalId', 'height',
  'mrzLine1', 'mrzLine2',
];

export const PASSPORT_FIELD_LABEL: Record<PassportFieldKey, string> = {
  passportType: 'ประเภทหนังสือเดินทาง',
  issuingCountry: 'รหัสประเทศผู้ออก',
  passportNo: 'เลขหนังสือเดินทาง',
  issueDate: 'วันที่ออก',
  expiryDate: 'วันที่หมดอายุ',
  issuingAuthority: 'หน่วยงานผู้ออก',
  placeOfIssue: 'สถานที่ออก',
  titleName: 'คำนำหน้า (Title)',
  firstName: 'ชื่อ (Given Name)',
  lastName: 'นามสกุล (Surname)',
  fullName: 'ชื่อเต็ม (Full name)',
  titleNameTh: 'คำนำหน้า (ไทย)',
  firstNameTh: 'ชื่อ (ไทย)',
  lastNameTh: 'นามสกุล (ไทย)',
  fullNameTh: 'ชื่อเต็ม (ไทย)',
  nameInThaiRaw: 'ชื่อไทยตามเล่ม (Name in Thai)',
  nationality: 'สัญชาติ',
  dateOfBirth: 'วันเกิด',
  gender: 'เพศ',
  placeOfBirth: 'สถานที่เกิด',
  nationalId: 'เลขประจำตัวประชาชน',
  height: 'ส่วนสูง',
  mrzLine1: 'MRZ บรรทัดที่ 1',
  mrzLine2: 'MRZ บรรทัดที่ 2',
};

/** กลุ่มช่องกรอก 1 กลุ่มบนหน้าเล่ม */
export interface PassportFormGroup {
  title: string;
  note?: string;
  /** จำนวนคอลัมน์บนจอใหญ่ */
  cols: 1 | 2 | 3;
  keys: PassportFieldKey[];
}

/**
 * ผังฟอร์มหนังสือเดินทาง — เรียงตามตำแหน่งบนหน้าข้อมูลในเล่มจริง
 *
 * ใช้ร่วมกันทั้งฟอร์มเพิ่ม (ตรวจข้อมูลจาก OCR) และฟอร์มแก้ไข เพื่อให้สองหน้าจอ
 * วางช่องเหมือนกันเป๊ะ — ผู้กรอกถือเล่มจริงแล้วไล่ตามที่ตาเห็นได้ทั้งสองที่
 *
 * ⚠️ มีเทสต์ตรวจว่าผังนี้ครอบคลุม PASSPORT_FIELD_ORDER ครบทุกช่อง
 */
export const PASSPORT_FORM_GROUPS: PassportFormGroup[] = [
  {
    title: 'ข้อมูลหนังสือเดินทาง',
    cols: 3,
    keys: ['passportType', 'issuingCountry', 'passportNo', 'issueDate', 'expiryDate', 'issuingAuthority', 'placeOfIssue'],
  },
  {
    title: 'ชื่อตามหน้าเล่ม (อังกฤษ)',
    note: 'ต้องตรงกับที่พิมพ์บนเล่ม ห้ามใช้ชื่อไทยหรือชื่อเล่นแทน',
    cols: 2,
    keys: ['titleName', 'firstName', 'lastName', 'fullName'],
  },
  {
    title: 'ชื่อภาษาไทยตามหน้าเล่ม',
    cols: 2,
    keys: ['titleNameTh', 'firstNameTh', 'lastNameTh', 'fullNameTh', 'nameInThaiRaw'],
  },
  {
    title: 'ข้อมูลส่วนบุคคล',
    cols: 3,
    keys: ['nationality', 'dateOfBirth', 'gender', 'placeOfBirth', 'nationalId', 'height'],
  },
  {
    title: 'MRZ',
    note: 'แถบอ่านด้วยเครื่องท้ายหน้าเล่ม — พิมพ์ตามที่เห็นทุกตัวอักษร',
    cols: 1,
    keys: ['mrzLine1', 'mrzLine2'],
  },
];

/* -------------------------------------------------------------------------
 * ช่องที่ค่ามีชุดตายตัวตามที่พิมพ์บนเล่ม — ให้เลือกจากรายการแทนพิมพ์เอง
 * พิมพ์เองแล้วพิมพ์ต่างกันคนละแบบ (M/m/ชาย/Male) ทำให้ค้นหาและตรวจสอบไม่ตรงกัน
 * ค่าที่บันทึกเป็นตัวอักษรตามที่พิมพ์บนเล่มจริง ส่วนคำอธิบายไทยอยู่ที่ label
 * ----------------------------------------------------------------------- */

/** ประเภทหนังสือเดินทางตามมาตรฐาน ICAO 9303 (ช่อง Type บนหน้าเล่ม) */
export const PASSPORT_TYPE_OPTIONS = [
  { value: 'P', label: 'P — บุคคลทั่วไป (Ordinary)' },
  { value: 'D', label: 'D — ทูต (Diplomatic)' },
  { value: 'S', label: 'S — ราชการ (Official/Service)' },
  { value: 'E', label: 'E — ฉุกเฉิน (Emergency)' },
];

/** เพศตามที่พิมพ์บนเล่ม (ICAO 9303 — X = ไม่ระบุ) */
export const PASSPORT_GENDER_OPTIONS = [
  { value: 'M', label: 'M — ชาย' },
  { value: 'F', label: 'F — หญิง' },
  { value: 'X', label: 'X — ไม่ระบุ' },
];

/** คำนำหน้าบนหน้าเล่ม — ต้องตรงกับชุดคำนำหน้าของเอกสารอื่นในระบบ */
export const PASSPORT_TITLE_TH_OPTIONS = ['นาย', 'นาง', 'นางสาว'].map((t) => ({ value: t, label: t }));
/* ข้อมูลนำเข้าจากต้นทางเก็บโดยไม่มีจุด (MR ไม่ใช่ MR.) — ใช้รูปแบบเดียวกันเพื่อให้ค่าเดิมตรงกับรายการ */
export const PASSPORT_TITLE_EN_OPTIONS = ['MR', 'MRS', 'MISS'].map((t) => ({ value: t, label: t }));

/** ช่องที่ต้องเลือกจากรายการ → ชุดตัวเลือกของช่องนั้น */
export const PASSPORT_CHOICE_OPTIONS: Partial<Record<PassportFieldKey, { value: string; label: string }[]>> = {
  passportType: PASSPORT_TYPE_OPTIONS,
  gender: PASSPORT_GENDER_OPTIONS,
  titleNameTh: PASSPORT_TITLE_TH_OPTIONS,
  titleName: PASSPORT_TITLE_EN_OPTIONS,
};

/** ช่องที่เก็บเป็นวันที่ (ISO ภายใน · แสดง dd/mm/yy §9) */
export const PASSPORT_DATE_FIELDS: PassportFieldKey[] = ['dateOfBirth', 'issueDate', 'expiryDate'];

/** ช่องข้อมูลอ่อนไหว — ปิดบังเป็นค่าเริ่มต้น แสดงเต็มเฉพาะผู้มีสิทธิ์ (§3) */
export const PASSPORT_SENSITIVE_FIELDS: PassportFieldKey[] = ['passportNo', 'nationalId'];

/* ---------------------------------------------------------------------------
 * ชนิดข้อมูลร่วมของเอกสารทุกประเภท ย้ายไปอยู่ที่ documentRecordTypes แล้ว
 * ที่นี่ประกาศเป็นชื่อเดิมต่อ (alias) เพื่อให้โค้ดหนังสือเดินทางเดิมใช้ได้เหมือนเดิม
 * ------------------------------------------------------------------------- */

/** ระดับความมั่นใจของ OCR (§5) */
export type OcrConfidence = DocumentOcrConfidence;

/** แหล่งที่มาของค่าแต่ละช่อง (§2 — MRZ เป็นแหล่งหลัก) */
export type OcrFieldSource = DocumentOcrFieldSource;

/** ค่าที่ OCR อ่านได้รายช่อง พร้อมหลักฐานประกอบ (§5/§10) */
export type OcrField = DocumentOcrField;

export type PassportFieldValues = Record<PassportFieldKey, string>;
export type PassportOcrFields = Record<PassportFieldKey, OcrField>;

/** สถานะของค่าปัจจุบันในแต่ละช่อง (§5 — เปลี่ยนเมื่อผู้ใช้แก้) */
export type FieldOrigin = DocumentFieldOrigin;

/** สถานะการบันทึก — ฉบับร่าง (§4) หรือยืนยันแล้ว */
export type PassportBookStatus = DocumentStatus;

/**
 * สถานะการใช้งานของเล่ม — แยกจากวันหมดอายุ (ซึ่งคำนวณจากวันที่)
 * ใช้กับกรณีที่เล่มใช้ไม่ได้ทั้งที่ยังไม่หมดอายุ
 */
export type PassportLifecycle = DocumentLifecycle;

export const PASSPORT_LIFECYCLE_LABEL: Record<PassportLifecycle, string> = DOCUMENT_LIFECYCLE_LABEL;

/** วิธีที่ข้อมูลเข้าสู่ระบบ (§1) */
export type PassportEntryMethod = DocumentEntryMethod;

/**
 * รายการประวัติการแก้ไข (§10)
 * เหมือน DocumentHistoryEntry ทุกประการ ต่างแค่ระบุชนิดของ changedFields ให้แคบลง
 * เป็นชื่อช่องของหนังสือเดินทาง เพื่อให้ UI เอาไปเปิด PASSPORT_FIELD_LABEL ได้ตรง ๆ
 */
export interface PassportBookHistoryEntry extends Omit<DocumentHistoryEntry, 'changedFields'> {
  /** ช่องที่เปลี่ยน (เฉพาะ USER_EDIT) — เก็บชื่อช่อง ไม่เก็บค่าที่อ่อนไหวลง log กลาง */
  changedFields?: PassportFieldKey[];
}

/**
 * ข้อมูลเฉพาะของหนังสือเดินทางเมื่อเก็บเป็นเอกสารกลาง (LeaderDocumentRecord.extra)
 * ชนิดอื่นไม่มีส่วนนี้ — จึงไม่ยัดลงโครงร่างกลาง
 */
export interface PassportRecordExtra {
  mrzCheck: MrzCheckSummary | null;
}

/** ผลตรวจ MRZ Check Digit (§4) */
export interface MrzCheckSummary {
  parsed: boolean;
  passportNoValid: boolean | null;
  dateOfBirthValid: boolean | null;
  expiryValid: boolean | null;
  compositeValid: boolean | null;
  /** §4 MRZ ไม่ตรงกับข้อความบนหน้าเล่ม (OCR VIZ) */
  vizMismatch?: boolean;
}

/** สถานะการตรวจสอบ MRZ ที่แสดงต่อผู้ใช้ (§4) */
export type MrzValidationStatus = 'PASSED' | 'MISMATCH' | 'UNVERIFIABLE';

export const MRZ_VALIDATION_LABEL: Record<MrzValidationStatus, { label: string; tone: string }> = {
  PASSED: { label: 'ตรวจสอบ MRZ ผ่าน', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  MISMATCH: { label: 'MRZ ไม่ตรงกับข้อมูลบนเล่ม', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  UNVERIFIABLE: { label: 'ไม่สามารถตรวจสอบ MRZ ได้', tone: 'bg-slate-100 text-slate-600 ring-slate-300' },
};

/** เล่มหนังสือเดินทาง 1 เล่ม */
export interface PassportBook {
  bookId: string;
  tourLeaderId: string;
  isPrimary: boolean; // §7 มีได้ไม่เกิน 1 เล่มต่อคน
  status: PassportBookStatus;
  /** สถานะการใช้งานของเล่ม (ยกเลิก/สูญหาย/ปิดใช้งาน) — ค่าเริ่มต้น ACTIVE */
  lifecycle: PassportLifecycle;
  entryMethod: PassportEntryMethod;

  /** ค่าปัจจุบัน (ผู้ใช้ตรวจสอบ/แก้ไขแล้ว) */
  fields: PassportFieldValues;
  /** สถานะรายช่อง — OCR / ผู้ใช้ตรวจสอบแล้ว (§5) */
  fieldOrigin: Record<PassportFieldKey, FieldOrigin>;

  /** §10 ค่าที่ OCR อ่านได้ครั้งแรก — ห้ามแก้ทับ (null เมื่อกรอกเอง) */
  ocrOriginal: PassportOcrFields | null;
  /** §9 ข้อความ OCR ดิบทั้งหน้า — เก็บไว้ตรวจย้อนหลัง (เช่น รูปแบบวันที่ต้นฉบับ "15 JAN 2025") */
  ocrRawText: string | null;
  /** §5 ไฟล์ต้นฉบับที่ใช้ทำ OCR + รูปที่แยกได้ (Private Storage อ้างด้วย imageId) */
  imageId: string | null;
  /** §5 รูปบุคคล/ลายเซ็นที่แยกจากเล่ม (ถ้าระบบแยกได้) */
  portraitImageId: string | null;
  signatureImageId: string | null;
  sourceFileName: string | null;
  mrzCheck: MrzCheckSummary | null;

  /** หมายเหตุของผู้ดูแล (§4 การตั้งค่า) */
  note: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** ผู้ยืนยันข้อมูล (§4 ยืนยันและบันทึก) */
  verifiedBy: string | null;
  verifiedAt: string | null;

  history: PassportBookHistoryEntry[];
}

/** ค่าว่างของทุกช่อง — ใช้เริ่มฟอร์มกรอกเอง (§8) */
export function emptyPassportFields(): PassportFieldValues {
  return PASSPORT_FIELD_ORDER.reduce((acc, k) => { acc[k] = ''; return acc; }, {} as PassportFieldValues);
}

/** สถานะเริ่มต้นของทุกช่องเมื่อกรอกเอง */
export function manualFieldOrigin(): Record<PassportFieldKey, FieldOrigin> {
  return PASSPORT_FIELD_ORDER.reduce((acc, k) => { acc[k] = 'MANUAL'; return acc; }, {} as Record<PassportFieldKey, FieldOrigin>);
}
