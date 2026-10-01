/**
 * แปลงผล OCR ดิบ → ช่องข้อมูล Passport (§2.6/§2.7/§3/§5)
 *
 * หลักการสำคัญ (สอดคล้องกฎโปรเจกต์ "ห้ามสร้างข้อมูลเอง"):
 *   • MRZ เป็นแหล่งข้อมูลหลัก (§2.5) — มี Check Digit ยืนยันได้จริง
 *   • ค่าที่อ่านไม่ได้ → เว้นว่าง + confidence = UNREADABLE (ห้ามเดา/เติมแทน §5)
 *   • เทียบ MRZ กับข้อความที่พิมพ์บนเล่ม (VIZ) → ตั้งธง mismatch (§2.6)
 *   • ชื่อ/นามสกุลเก็บอังกฤษตามเล่ม ห้ามแปลงรูปแบบ (§3)
 *
 * เป็นตรรกะล้วน แยกจาก engine เพื่อให้ทดสอบได้และสลับ OCR provider ได้ (§ออกแบบเผื่อ REST API)
 */

import { parseMrzTd3, findMrzLines, type MrzParsed } from './mrz';
import {
  PASSPORT_FIELD_ORDER,
  type MrzCheckSummary, type OcrConfidence, type OcrField,
  type PassportFieldKey, type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';

/** ข้อความ + คะแนนความมั่นใจรายบรรทัดที่ได้จาก engine */
export interface OcrLine {
  text: string;
  confidence: number; // 0-100
}

export interface OcrRawInput {
  /** ข้อความทั้งหน้า (VIZ) */
  vizText: string;
  vizLines: OcrLine[];
  /** ข้อความจากโซน MRZ (อ่านแยกด้วยชุดอักขระจำกัด) */
  mrzText: string;
  mrzConfidence: number;
  todayISO: string;
}

/** เกณฑ์แปลงคะแนน engine → ระดับความมั่นใจ (§5) */
export function scoreToConfidence(score: number | null): OcrConfidence {
  if (score === null) return 'UNREADABLE';
  if (score >= 85) return 'HIGH';
  if (score >= 65) return 'MEDIUM';
  return 'LOW';
}

function field(value: string, score: number | null, source: OcrField['source'], extra: Partial<OcrField> = {}): OcrField {
  const trimmed = value.trim();
  if (!trimmed) return { value: '', confidence: 'UNREADABLE', score: null, source: 'NONE', ...extra };
  return { value: trimmed, confidence: scoreToConfidence(score), score, source, ...extra };
}

const UNREADABLE: OcrField = { value: '', confidence: 'UNREADABLE', score: null, source: 'NONE' };

/** ทำให้ข้อความเทียบกันได้ (ตัดช่องว่าง/เครื่องหมาย) สำหรับตรวจ mismatch MRZ vs VIZ */
function comparable(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** หาว่าข้อความบนเล่มมีค่านี้ปรากฏอยู่หรือไม่ (ยืนยัน MRZ ด้วย VIZ §2.6) */
function vizContains(vizText: string, value: string): boolean {
  if (!value) return false;
  return comparable(vizText).includes(comparable(value));
}

/* ---------------------------------------------------------------------------
 * วันที่บนหน้าเล่ม (VIZ) — ใช้หา "วันที่ออก" ที่ไม่มีใน MRZ
 * ------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * ดึงวันที่ทั้งหมดที่พบในข้อความหน้าเล่ม
 * รองรับ 2 รูปแบบที่พบบน Passport: "12 AUG 1974" และ "12/08/1974"
 */
export function extractVizDates(vizText: string): string[] {
  const found: string[] = [];
  const upper = vizText.toUpperCase();

  const reMonthName = /\b(\d{1,2})\s*[.\-/ ]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[.\-/ ]?\s*(\d{4})\b/g;
  for (const m of upper.matchAll(reMonthName)) {
    const dd = Number(m[1]); const mm = MONTHS[m[2]]; const yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31) found.push(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  }

  const reNumeric = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
  for (const m of upper.matchAll(reNumeric)) {
    const dd = Number(m[1]); const mm = Number(m[2]); const yyyy = Number(m[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) found.push(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  }

  return [...new Set(found)];
}

/**
 * อนุมาน "วันที่ออก" จากวันที่บนหน้าเล่ม (§3)
 * เงื่อนไขที่ยอมรับ: ต้องอยู่หลังวันเกิด · ไม่เกินวันนี้ · ก่อนวันหมดอายุ
 * ถ้าเหลือผู้เข้าข่ายมากกว่า 1 ค่า → คืน null (ไม่เดา ให้ผู้ใช้กรอกเอง)
 */
export function inferIssueDate(
  vizDates: string[], dateOfBirth: string | null, expiryDate: string | null, todayISO: string,
): string | null {
  const candidates = vizDates.filter((d) =>
    d <= todayISO
    && (!dateOfBirth || d > dateOfBirth)
    && (!expiryDate || d < expiryDate)
    && d !== dateOfBirth
    && d !== expiryDate,
  );
  if (candidates.length !== 1) return null;
  return candidates[0];
}

/* ---------------------------------------------------------------------------
 * ค่าที่มีเฉพาะบนหน้าเล่ม (ไม่มีใน MRZ) — หาโดยอิงคำกำกับ (label) เท่านั้น
 * ------------------------------------------------------------------------- */

/**
 * อ่านค่าที่อยู่หลังคำกำกับ เช่น "PLACE OF ISSUE  BANGKOK"
 * ไม่พบคำกำกับ → คืน null (เว้นว่าง ไม่เดา §5)
 */
export function valueAfterLabel(lines: OcrLine[], labels: string[]): { value: string; confidence: number } | null {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < lines.length; i++) {
    const text = norm(lines[i].text);
    for (const label of labels) {
      const idx = text.indexOf(label);
      if (idx === -1) continue;
      // ค่าอยู่ท้ายบรรทัดเดียวกัน
      const sameLine = text.slice(idx + label.length).trim();
      if (sameLine.length >= 2) return { value: sameLine, confidence: lines[i].confidence };
      // หรืออยู่บรรทัดถัดไป
      const next = lines[i + 1];
      if (next && norm(next.text).length >= 2) return { value: norm(next.text), confidence: next.confidence };
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * ประกอบผลลัพธ์
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * §3 ค่าที่มีเฉพาะบนหน้าเล่มไทย — เลขบัตร ปชช. · ส่วนสูง · ชื่อไทย
 * ------------------------------------------------------------------------- */

/** ดึงเลขประจำตัวประชาชน 13 หลักจากข้อความ (Thai ID) — ไม่พบคืน null */
export function extractNationalId(vizText: string): string | null {
  // เลขไทย 13 หลัก อาจมีขีดคั่น เช่น 0-1234-56789-13-5
  const compact = vizText.replace(/[\s฀-๿]/g, ' ');
  const m = compact.match(/(\d[\d\s-]{11,20}\d)/g);
  if (!m) return null;
  for (const cand of m) {
    const digits = cand.replace(/\D/g, '');
    if (digits.length === 13) return digits;
  }
  return null;
}

/**
 * ดึงส่วนสูงจากคำกำกับ HEIGHT เช่น "1.66M" / "166 CM"
 * ค้นจากข้อความดิบ (ไม่ผ่าน valueAfterLabel ที่ตัดตัวเลขทิ้ง) โดยดูใกล้คำว่า HEIGHT ก่อน
 */
export function extractHeight(lines: OcrLine[], vizText: string): string | null {
  const HEIGHT_VALUE = /(\d(?:[.,]\d{1,2})?\s?M(?:ETER)?\b|\d{2,3}\s?CM\b)/i;
  // 1) บรรทัดที่มีคำว่า HEIGHT — ค้นค่าจากข้อความดิบของบรรทัดนั้น
  const heightLine = lines.find((l) => /HEIGHT/i.test(l.text));
  if (heightLine) {
    const after = heightLine.text.replace(/.*HEIGHT/i, '');
    const m = after.match(HEIGHT_VALUE);
    if (m) return m[1].replace(/\s+/g, '').replace(',', '.').toUpperCase();
  }
  // 2) fallback: ค้นทั้งหน้าใกล้คำ HEIGHT
  const near = vizText.match(/HEIGHT[^0-9]{0,12}(\d(?:[.,]\d{1,2})?\s?M(?:ETER)?\b|\d{2,3}\s?CM\b)/i);
  if (near) return near[1].replace(/\s+/g, '').replace(',', '.').toUpperCase();
  return null;
}

/** อักขระไทย */
const THAI_RE = /[฀-๿]/;
const THAI_TITLES = ['นางสาว', 'นาง', 'นาย', 'เด็กชาย', 'เด็กหญิง', 'ด.ช.', 'ด.ญ.'];

/**
 * ดึงชื่อไทยตามเล่ม (Name in Thai) จากบรรทัดที่มีอักษรไทย
 * แยกคำนำหน้า/ชื่อ/นามสกุลแบบระมัดระวัง — เก็บ raw ไว้เสมอ ไม่แปลจากอังกฤษ
 */
export function extractThaiName(lines: OcrLine[]): { raw: string; title: string; first: string; last: string; confidence: number } | null {
  // เลือกบรรทัดไทยที่ยาวที่สุด (มักเป็นชื่อ-สกุล) และไม่ใช่คำกำกับล้วน
  const thaiLines = lines
    .filter((l) => THAI_RE.test(l.text) && l.text.replace(/[^฀-๿]/g, '').length >= 3)
    .sort((a, b) => b.text.length - a.text.length);
  if (thaiLines.length === 0) return null;

  const raw = thaiLines[0].text.replace(/\s+/g, ' ').trim();
  let rest = raw;
  let title = '';
  for (const t of THAI_TITLES) {
    if (rest.startsWith(t)) { title = t; rest = rest.slice(t.length).trim(); break; }
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts.slice(1).join(' ');
  return { raw, title, first, last, confidence: thaiLines[0].confidence };
}

export interface MappedOcr {
  fields: PassportOcrFields;
  mrz: MrzParsed | null;
  mrzCheck: MrzCheckSummary;
  /** เหตุผลที่อ่านไม่สำเร็จ (§8) — ว่างเปล่าเมื่อสำเร็จ */
  failureReasons: string[];
  /** อ่านข้อมูลที่จำเป็นได้พอที่จะกรอกฟอร์มหรือไม่ */
  succeeded: boolean;
}

function emptyFields(): PassportOcrFields {
  return PASSPORT_FIELD_ORDER.reduce((acc, k) => { acc[k] = { ...UNREADABLE }; return acc; }, {} as PassportOcrFields);
}

/** ชื่อเต็มตาม Passport = คำนำหน้า + ชื่อ + นามสกุล (§3 · ผู้ใช้แก้ได้) */
export function composeFullName(title: string, first: string, last: string): string {
  return [title, first, last].map((s) => s.trim()).filter(Boolean).join(' ');
}

/** 1 แถวของตารางเทียบข้อมูลปัจจุบันกับ OCR ใหม่ (§5) */
export interface OcrCompareRow {
  key: PassportFieldKey;
  current: string;
  ocr: string;
  /** true = ค่าใหม่ต่างจากค่าปัจจุบัน (ต้องให้ผู้ใช้เลือก) */
  differs: boolean;
  /** OCR อ่านช่องนี้ได้หรือไม่ */
  ocrReadable: boolean;
}

/**
 * เทียบค่าปัจจุบันกับผล OCR รอบใหม่ (§5) — คืนเฉพาะช่องที่ OCR อ่านได้
 * ไม่เขียนทับค่าใด ๆ · ผู้เรียกเป็นผู้ตัดสินใจนำค่าใหม่มาใช้หรือคงค่าเดิม
 */
export function buildOcrComparison(
  current: Record<PassportFieldKey, string>,
  ocr: PassportOcrFields,
  keys: PassportFieldKey[],
): OcrCompareRow[] {
  return keys
    .map((key) => {
      const ocrValue = ocr[key]?.value ?? '';
      const currentValue = current[key] ?? '';
      return {
        key,
        current: currentValue,
        ocr: ocrValue,
        differs: ocrValue.trim() !== currentValue.trim(),
        ocrReadable: ocrValue.trim() !== '',
      };
    })
    .filter((r) => r.ocrReadable); // แสดงเฉพาะช่องที่ OCR อ่านได้จริง
}

/**
 * แปลงผล OCR ดิบเป็นช่องข้อมูลพร้อมระดับความมั่นใจ
 * ห้ามคืนค่าที่ไม่ได้อ่านมาจริง — ช่องที่อ่านไม่ได้จะเป็น UNREADABLE เสมอ
 */
export function mapOcrToFields(raw: OcrRawInput): MappedOcr {
  const fields = emptyFields();
  const failureReasons: string[] = [];

  /* ---- 1) MRZ (แหล่งหลัก §2.5) ---- */
  const lines = findMrzLines(raw.mrzText) ?? findMrzLines(raw.vizText);
  const mrz = lines ? parseMrzTd3(lines.line1, lines.line2, raw.todayISO) : null;

  const mrzCheck: MrzCheckSummary = mrz
    ? {
      parsed: true,
      passportNoValid: mrz.checks.passportNo,
      dateOfBirthValid: mrz.checks.dateOfBirth,
      expiryValid: mrz.checks.expiry,
      compositeValid: mrz.checks.composite,
    }
    : { parsed: false, passportNoValid: null, dateOfBirthValid: null, expiryValid: null, compositeValid: null };

  if (!mrz) failureReasons.push('ไม่พบแถบ MRZ ด้านล่างหนังสือเดินทาง — อาจถ่ายไม่ครบหน้า หรือภาพไม่ชัดพอ');

  if (lines) {
    fields.mrzLine1 = field(lines.line1, raw.mrzConfidence, 'MRZ');
    fields.mrzLine2 = field(lines.line2, raw.mrzConfidence, 'MRZ');
  }

  if (mrz) {
    /**
     * ค่าที่มี Check Digit ผ่าน → ยกระดับเป็น HIGH ได้ เพราะยืนยันความถูกต้องเชิงคณิตศาสตร์แล้ว
     * ไม่ผ่าน → จำกัดไม่เกิน LOW เพื่อบังคับให้ผู้ใช้ตรวจ (§5)
     */
    const gradeByCheck = (ok: boolean | null, base: number): number | null => {
      if (ok === true) return Math.max(base, 90);
      if (ok === false) return Math.min(base, 50);
      return base;
    };

    const vizText = raw.vizText;
    const mk = (value: string, checkOk: boolean | null, key: PassportFieldKey) => {
      if (!value) return UNREADABLE;
      const confirmedByViz = vizContains(vizText, value);
      const score = gradeByCheck(checkOk, confirmedByViz ? Math.max(raw.mrzConfidence, 88) : raw.mrzConfidence);
      const f = field(value, score, confirmedByViz ? 'MRZ_VIZ' : 'MRZ');
      // §2.6 อ่านได้จาก MRZ แต่ไม่พบบนหน้าเล่ม → เตือนให้ตรวจ
      if (!confirmedByViz && key !== 'gender') {
        f.mismatch = true;
        f.note = 'ค่าจาก MRZ ไม่ตรง/ไม่พบในข้อความบนหน้าเล่ม — โปรดตรวจสอบ';
      }
      return f;
    };

    fields.passportNo = mk(mrz.passportNo, mrz.checks.passportNo, 'passportNo');
    fields.lastName = mk(mrz.lastName, null, 'lastName');
    fields.firstName = mk(mrz.firstName, null, 'firstName');
    fields.nationality = mk(mrz.nationality, null, 'nationality');
    fields.issuingCountry = mk(mrz.issuingCountry, null, 'issuingCountry');
    fields.gender = mk(mrz.gender, null, 'gender');
    fields.passportType = mrz.documentCode
      ? field(mrz.documentCode + (mrz.documentSubType || ''), raw.mrzConfidence, 'MRZ')
      : UNREADABLE;

    if (mrz.dateOfBirth) {
      fields.dateOfBirth = field(mrz.dateOfBirth, gradeByCheck(mrz.checks.dateOfBirth, raw.mrzConfidence), 'MRZ');
    }
    if (mrz.expiryDate) {
      fields.expiryDate = field(mrz.expiryDate, gradeByCheck(mrz.checks.expiry, raw.mrzConfidence), 'MRZ');
    }
  }

  /* ---- 2) ค่าที่มีเฉพาะบนหน้าเล่ม (§3) ---- */
  const vizDates = extractVizDates(raw.vizText);
  const issue = inferIssueDate(vizDates, fields.dateOfBirth.value || null, fields.expiryDate.value || null, raw.todayISO);
  if (issue) {
    // อนุมานจากวันที่ที่อ่านได้จริงบนเล่ม — ระดับกลาง เพราะไม่มี Check Digit ยืนยัน
    fields.issueDate = { value: issue, confidence: 'MEDIUM', score: 70, source: 'VIZ', note: 'อนุมานจากวันที่บนหน้าเล่ม — โปรดตรวจสอบ' };
  }

  const authority = valueAfterLabel(raw.vizLines, ['ISSUING AUTHORITY', 'AUTHORITY']);
  if (authority) fields.issuingAuthority = field(authority.value, authority.confidence, 'VIZ');

  const placeOfIssue = valueAfterLabel(raw.vizLines, ['PLACE OF ISSUE', 'ISSUED AT']);
  if (placeOfIssue) fields.placeOfIssue = field(placeOfIssue.value, placeOfIssue.confidence, 'VIZ');

  const placeOfBirth = valueAfterLabel(raw.vizLines, ['PLACE OF BIRTH', 'BIRTH PLACE']);
  if (placeOfBirth) fields.placeOfBirth = field(placeOfBirth.value, placeOfBirth.confidence, 'VIZ');

  // §3 เลขประจำตัวประชาชน (13 หลัก) · ส่วนสูง
  const nationalId = extractNationalId(raw.vizText);
  if (nationalId) fields.nationalId = field(nationalId, 78, 'VIZ');

  const height = extractHeight(raw.vizLines, raw.vizText);
  if (height) fields.height = field(height, 72, 'VIZ');

  // §2 ชื่อไทยตามเล่ม (Name in Thai) — เก็บ raw + แยกส่วน (ไม่แปลจากอังกฤษ)
  const thaiName = extractThaiName(raw.vizLines);
  if (thaiName) {
    fields.nameInThaiRaw = field(thaiName.raw, thaiName.confidence, 'VIZ');
    if (thaiName.title) fields.titleNameTh = field(thaiName.title, thaiName.confidence, 'VIZ');
    if (thaiName.first) fields.firstNameTh = field(thaiName.first, thaiName.confidence, 'VIZ');
    if (thaiName.last) fields.lastNameTh = field(thaiName.last, thaiName.confidence, 'VIZ');
    const fullTh = [thaiName.title, thaiName.first, thaiName.last].filter(Boolean).join(' ').trim();
    if (fullTh) fields.fullNameTh = { value: fullTh, confidence: 'MEDIUM', score: null, source: 'DERIVED', note: 'ประกอบจากชื่อไทยที่อ่านได้ — แก้ไขได้' };
  }

  /* ---- 3) ชื่อเต็มตาม Passport — ประกอบจากส่วนที่อ่านได้ (§3) ---- */
  const full = composeFullName(fields.titleName.value, fields.firstName.value, fields.lastName.value);
  if (full) {
    fields.fullName = {
      value: full,
      confidence: fields.firstName.confidence === 'HIGH' && fields.lastName.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
      score: null,
      source: 'DERIVED',
      note: 'ประกอบจาก คำนำหน้า + ชื่อ + นามสกุล — แก้ไขได้',
    };
  }

  /* ---- 4) สรุปผล (§4/§8) ---- */
  // §4 MRZ ขัดกับข้อความบนหน้าเล่มหรือไม่ (มีช่องใดถูกตั้งธง mismatch)
  if (mrz) {
    mrzCheck.vizMismatch = (['passportNo', 'lastName', 'firstName', 'dateOfBirth', 'expiryDate', 'nationality'] as PassportFieldKey[])
      .some((k) => fields[k].mismatch === true);
  }
  if (mrz && !mrz.allChecksPassed) {
    failureReasons.push('ตรวจ Check Digit ของ MRZ ไม่ผ่านบางรายการ — ตัวเลขบางตัวอาจอ่านผิด โปรดตรวจสอบก่อนบันทึก');
  }
  const readable = PASSPORT_FIELD_ORDER.filter((k) => fields[k].value).length;
  const succeeded = !!mrz || readable >= 3;
  if (!succeeded) failureReasons.push('อ่านข้อมูลจากรูปไม่ได้เลย — โปรดอัปโหลดรูปใหม่ที่ชัดขึ้น หรือกรอกข้อมูลด้วยตนเอง');

  return { fields, mrz, mrzCheck, failureReasons, succeeded };
}
