/**
 * Document Readiness — ตอบคำถามเดียวที่ทั้งระบบถามบ่อยที่สุด
 * "หัวหน้าทัวร์คนนี้ เอกสารพร้อมออกเดินทางกรุ๊ปนี้หรือยัง"
 *
 * ทุกหน้าจอ (จัดสเก็ต · เลือกหัวหน้าทัวร์ · จับคู่งาน · ก่อนเซ็นสัญญา) ต้องเรียกฟังก์ชันนี้
 * ห้ามต่างคนต่างเช็ค เพราะกฎอย่าง "หนังสือเดินทางต้องเหลือ 6 เดือน" ถ้าเขียนซ้ำหลายที่
 * จะเพี้ยนกันเองเมื่อมีคนแก้ที่เดียว
 *
 * ตรรกะบริสุทธิ์ — รับรายการเอกสารเข้ามา ไม่อ่าน store เอง (ทดสอบได้ · เรียกจาก SSR ได้)
 *
 * กฎสำคัญที่มักเข้าใจผิด:
 *   • อายุหนังสือเดินทางเทียบกับ "วันเดินทางกลับ" ไม่ใช่วันนี้ และไม่ใช่วันออกเดินทาง
 *   • เอกสารที่ยังเป็นฉบับร่าง หรือแจ้งสูญหาย/ยกเลิก ถือว่าใช้ไม่ได้ แม้ยังไม่หมดอายุ
 *   • วีซ่าติดอยู่ในเล่มหนังสือเดินทาง — เปลี่ยนเล่มแล้วต้องพกเล่มเก่าไปด้วย
 */

import { documentExpiryFieldKey, documentIssueFieldKey } from '@/data/leaders/documentFieldKeys';
import type { DocKind } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import type { VisaRecordExtra } from '@/data/leaders/visaRecordTypes';
import { parseDate, toISODate } from '@/lib/format';
import { DOC_KIND_DISPLAY_NAME } from './documentView';

/* --------------------------------- นโยบาย --------------------------------- */

export interface ReadinessPolicy {
  /** หนังสือเดินทางต้องเหลืออายุกี่เดือน นับจาก "วันเดินทางกลับ" (มาตรฐานสากล = 6) */
  passportMonthsAfterReturn: number;
  /** กรุ๊ปนี้ต้องใช้วีซ่าหรือไม่ — ผู้เรียกตัดสินจากประเทศปลายทาง */
  visaRequired: boolean;
  /** ต้องมีบัตรหัวหน้าทัวร์ที่ยังไม่หมดอายุหรือไม่ */
  tourCardRequired: boolean;
  /**
   * เอกสารตรวจประวัติอาชญากรรมใช้ได้กี่วันนับจากวันที่ออก (0 = ไม่บังคับ)
   * บนกระดาษมักไม่ระบุวันหมดอายุ แต่ผู้รับเอกสารมักรับเฉพาะที่ออกไม่เกิน 3–6 เดือน
   */
  criminalRecordValidDays: number;
  /** เตือนล่วงหน้าเมื่อเอกสารจะหมดอายุภายในกี่วันหลังกลับ */
  warnWithinDaysAfterReturn: number;
}

export const DEFAULT_READINESS_POLICY: ReadinessPolicy = {
  passportMonthsAfterReturn: 6,
  visaRequired: false,
  tourCardRequired: true,
  criminalRecordValidDays: 0,
  warnWithinDaysAfterReturn: 60,
};

/**
 * รวมนโยบายที่ผู้เรียกส่งมากับค่าเริ่มต้น
 * ⚠️ ใช้ spread ตรง ๆ ไม่ได้ — ค่า undefined ที่ติดมากับ object จะไปทับค่าเริ่มต้นจนกลายเป็น undefined
 * (เกิดขึ้นง่ายมากเมื่อผู้เรียกแตก object แล้วประกอบใหม่ เช่นใน hook ของหน้าจอ)
 */
export function resolvePolicy(policy: Partial<ReadinessPolicy> = {}): ReadinessPolicy {
  const merged = { ...DEFAULT_READINESS_POLICY };
  for (const key of Object.keys(DEFAULT_READINESS_POLICY) as (keyof ReadinessPolicy)[]) {
    const value = policy[key];
    if (value !== undefined) {
      // แต่ละคีย์มีชนิดของตัวเอง — assign ผ่านตัวกลางเพื่อคงชนิดไว้
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/* -------------------------------- ช่วงเดินทาง -------------------------------- */

export interface TripWindow {
  /** วันออกเดินทาง (ISO date) */
  departDate: string;
  /** วันเดินทางกลับ (ISO date) — ใช้เป็นฐานคำนวณอายุเอกสารทั้งหมด */
  returnDate: string;
  /** ประเทศปลายทาง (Country Master id) — ใช้จับคู่วีซ่าให้ตรงประเทศ */
  countryId?: string;
  /** ชื่อประเทศสำหรับข้อความ */
  countryName?: string;
}

/* --------------------------------- ผลลัพธ์ --------------------------------- */

export type ReadinessSeverity = 'blocking' | 'warning';

export type ReadinessIssueCode =
  | 'passport_missing'
  | 'passport_unconfirmed'
  | 'passport_inactive'
  | 'passport_no_expiry'
  | 'passport_expired'
  | 'passport_validity_short'
  | 'passport_expiring_soon'
  | 'visa_missing'
  | 'visa_expired'
  | 'visa_other_passport'
  | 'visa_passport_unknown'
  | 'tour_card_missing'
  | 'tour_card_expired'
  | 'criminal_record_missing'
  | 'criminal_record_stale'
  | 'id_card_expired';

export interface ReadinessIssue {
  code: ReadinessIssueCode;
  severity: ReadinessSeverity;
  kind: DocKind;
  /** เอกสารที่เกี่ยวข้อง (null = ไม่มีเอกสารชนิดนี้เลย) */
  docId: string | null;
  /** ข้อความพร้อมแสดงต่อผู้ใช้ */
  message: string;
}

export interface ReadinessResult {
  /** พร้อมเดินทาง = ไม่มีปัญหาระดับบล็อก */
  ready: boolean;
  blocking: ReadinessIssue[];
  warning: ReadinessIssue[];
  /** ปัญหาทั้งหมด เรียงระดับบล็อกขึ้นก่อน */
  issues: ReadinessIssue[];
  /** เล่มหนังสือเดินทางที่ระบบเลือกใช้ตรวจ (null = ไม่มีเล่มที่ใช้ได้) */
  passportDocId: string | null;
}

/* --------------------------------- ตัวช่วย --------------------------------- */

/**
 * บวกเดือนโดยคงวันที่เดิม และหดให้พอดีเมื่อเดือนปลายทางสั้นกว่า
 * (31 ส.ค. + 6 เดือน = 28/29 ก.พ. ไม่ใช่ 3 มี.ค.)
 * ต่างจาก addMonths ใน lib/format ที่คืนวันแรกของเดือนเสมอ
 */
export function addMonthsKeepDay(isoDate: string, months: number): string {
  const d = parseDate(isoDate);
  const day = d.getDate();
  const shifted = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return toISODate(shifted);
}

/** เอกสารใช้งานได้อยู่หรือไม่ (ไม่นับวันหมดอายุ — ตรวจแยกเพื่อบอกสาเหตุได้ตรง) */
function isUsable(doc: AnyLeaderDocumentRecord): boolean {
  return doc.lifecycle === 'ACTIVE' && doc.status === 'CONFIRMED';
}

function expiryOf(doc: AnyLeaderDocumentRecord): string | null {
  return doc.fields[documentExpiryFieldKey()]?.trim() || null;
}

function issuedOf(doc: AnyLeaderDocumentRecord): string | null {
  return doc.fields[documentIssueFieldKey(doc.kind)]?.trim() || null;
}

/** เลือกเอกสารที่ควรใช้ของชนิดนั้น — ฉบับหลักก่อน แล้วเลือกฉบับที่หมดอายุช้าที่สุด */
function pickBest(docs: AnyLeaderDocumentRecord[]): AnyLeaderDocumentRecord | null {
  if (docs.length === 0) return null;
  return [...docs].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (expiryOf(b) ?? '').localeCompare(expiryOf(a) ?? '');
  })[0];
}

const issue = (
  code: ReadinessIssueCode,
  severity: ReadinessSeverity,
  kind: DocKind,
  docId: string | null,
  message: string,
): ReadinessIssue => ({ code, severity, kind, docId, message });

/* -------------------------------- ตัวตรวจหลัก -------------------------------- */

/**
 * ตรวจความพร้อมของเอกสารสำหรับกรุ๊ปหนึ่ง
 * @param records เอกสารทั้งหมดของหัวหน้าทัวร์คนนั้น (จาก documentStore)
 */
export function checkDocumentReadiness(
  records: readonly AnyLeaderDocumentRecord[],
  trip: TripWindow,
  policy: Partial<ReadinessPolicy> = {},
): ReadinessResult {
  const rules = resolvePolicy(policy);
  const issues: ReadinessIssue[] = [];

  const byKind = (kind: DocKind) => records.filter((d) => d.kind === kind);
  const usableOf = (kind: DocKind) => byKind(kind).filter(isUsable);

  /* ------------------------------ หนังสือเดินทาง ------------------------------ */

  const passports = byKind('passport');
  const usablePassports = usableOf('passport');
  const passport = pickBest(usablePassports);

  if (passports.length === 0) {
    issues.push(issue('passport_missing', 'blocking', 'passport', null, 'ยังไม่มีหนังสือเดินทางในระบบ'));
  } else if (!passport) {
    // มีเล่มแต่ใช้ไม่ได้ — บอกสาเหตุให้ตรงเพื่อให้แก้ถูกจุด
    const draft = passports.find((d) => d.lifecycle === 'ACTIVE' && d.status !== 'CONFIRMED');
    if (draft) {
      issues.push(issue('passport_unconfirmed', 'blocking', 'passport', draft.docId,
        'หนังสือเดินทางยังเป็นฉบับร่าง — ต้องตรวจสอบและยืนยันก่อนใช้จัดงาน'));
    } else {
      const blocked = passports[0];
      issues.push(issue('passport_inactive', 'blocking', 'passport', blocked.docId,
        'หนังสือเดินทางที่มีอยู่ใช้งานไม่ได้ (สูญหาย/ยกเลิก/ปิดใช้งาน)'));
    }
  } else {
    const expiry = expiryOf(passport);
    if (!expiry) {
      issues.push(issue('passport_no_expiry', 'warning', 'passport', passport.docId,
        'หนังสือเดินทางไม่ได้ระบุวันหมดอายุ — ตรวจอายุคงเหลือไม่ได้'));
    } else if (expiry < trip.returnDate) {
      issues.push(issue('passport_expired', 'blocking', 'passport', passport.docId,
        `หนังสือเดินทางหมดอายุ ${expiry} ก่อนวันเดินทางกลับ ${trip.returnDate}`));
    } else {
      const required = addMonthsKeepDay(trip.returnDate, rules.passportMonthsAfterReturn);
      if (expiry < required) {
        issues.push(issue('passport_validity_short', 'blocking', 'passport', passport.docId,
          `หนังสือเดินทางต้องเหลืออายุอย่างน้อย ${rules.passportMonthsAfterReturn} เดือนหลังวันเดินทางกลับ `
          + `(ต้องหมดอายุไม่ก่อน ${required} แต่หมดอายุ ${expiry})`));
      } else if (expiry < isoPlusDays(required, rules.warnWithinDaysAfterReturn)) {
        // ผ่านเกณฑ์แบบเฉียดฉิว — กรุ๊ปถัดไปมีโอกาสไม่ผ่าน ควรเตือนให้วางแผนต่ออายุ
        issues.push(issue('passport_expiring_soon', 'warning', 'passport', passport.docId,
          `หนังสือเดินทางผ่านเกณฑ์แบบเฉียดฉิว (หมดอายุ ${expiry}) — ควรวางแผนต่ออายุก่อนรับกรุ๊ปถัดไป`));
      }
    }
  }

  /* ---------------------------------- วีซ่า ---------------------------------- */

  if (rules.visaRequired) {
    const destination = trip.countryName ?? 'ประเทศปลายทาง';
    const visas = usableOf('visa').filter(
      (d) => !trip.countryId || (d.fields.countryId?.trim() || '') === trip.countryId,
    );
    const visa = pickBest(visas);

    if (!visa) {
      issues.push(issue('visa_missing', 'blocking', 'visa', null, `ยังไม่มีวีซ่าที่ใช้ได้สำหรับ${destination}`));
    } else {
      const expiry = expiryOf(visa);
      if (expiry && expiry < trip.returnDate) {
        issues.push(issue('visa_expired', 'blocking', 'visa', visa.docId,
          `วีซ่าหมดอายุ ${expiry} ก่อนวันเดินทางกลับ ${trip.returnDate}`));
      }

      // วีซ่าติดอยู่ในเล่มไหน — เปลี่ยนเล่มแล้วต้องพกเล่มเก่าไปด้วย
      const boundTo = (visa.extra as VisaRecordExtra | null)?.passportDocId ?? null;
      if (!boundTo) {
        issues.push(issue('visa_passport_unknown', 'warning', 'visa', visa.docId,
          'ไม่ได้ระบุว่าวีซ่าติดอยู่ในหนังสือเดินทางเล่มใด — ตรวจก่อนออกเดินทาง'));
      } else if (passport && boundTo !== passport.docId) {
        issues.push(issue('visa_other_passport', 'warning', 'visa', visa.docId,
          'วีซ่าติดอยู่ในหนังสือเดินทางคนละเล่มกับเล่มที่จะใช้เดินทาง — ต้องพกเล่มเดิมไปด้วย'));
      }
    }
  }

  /* ------------------------------ บัตรหัวหน้าทัวร์ ------------------------------ */

  if (rules.tourCardRequired) {
    const card = pickBest(usableOf('tour_card'));
    if (!card) {
      issues.push(issue('tour_card_missing', 'blocking', 'tour_card', null, 'ยังไม่มีบัตรหัวหน้าทัวร์ที่ใช้ได้'));
    } else {
      const expiry = expiryOf(card);
      if (expiry && expiry < trip.returnDate) {
        issues.push(issue('tour_card_expired', 'blocking', 'tour_card', card.docId,
          `บัตรหัวหน้าทัวร์หมดอายุ ${expiry} ก่อนวันเดินทางกลับ ${trip.returnDate}`));
      }
    }
  }

  /* --------------------------- เอกสารตรวจประวัติอาชญากรรม -------------------------- */

  if (rules.criminalRecordValidDays > 0) {
    const cr = pickBest(usableOf('criminal_record'));
    if (!cr) {
      issues.push(issue('criminal_record_missing', 'blocking', 'criminal_record', null,
        'ยังไม่มีเอกสารตรวจประวัติอาชญากรรมที่ใช้ได้'));
    } else {
      const issued = issuedOf(cr);
      const docExpiry = expiryOf(cr);
      // ใช้วันหมดอายุบนเอกสารถ้ามี ไม่มีก็คิดจากวันที่ออก + อายุตามนโยบาย
      const validUntil = docExpiry ?? (issued ? isoPlusDays(issued, rules.criminalRecordValidDays) : null);
      if (validUntil && validUntil < trip.departDate) {
        issues.push(issue('criminal_record_stale', 'blocking', 'criminal_record', cr.docId,
          `เอกสารตรวจประวัติอาชญากรรมเกินอายุที่รับได้ (ใช้ได้ถึง ${validUntil} · ออกเดินทาง ${trip.departDate})`));
      }
    }
  }

  /* -------------------------------- บัตรประชาชน ------------------------------- */

  const idCard = pickBest(usableOf('id_card'));
  if (idCard) {
    const expiry = expiryOf(idCard);
    if (expiry && expiry < trip.returnDate) {
      issues.push(issue('id_card_expired', 'warning', 'id_card', idCard.docId,
        `บัตรประชาชนหมดอายุ ${expiry} ก่อนวันเดินทางกลับ — ไม่กระทบการเดินทาง แต่ควรต่ออายุ`));
    }
  }

  /* --------------------------------- สรุปผล --------------------------------- */

  const blocking = issues.filter((i) => i.severity === 'blocking');
  const warning = issues.filter((i) => i.severity === 'warning');

  return {
    ready: blocking.length === 0,
    blocking,
    warning,
    issues: [...blocking, ...warning],
    passportDocId: passport?.docId ?? null,
  };
}

/** บวกวันแบบ ISO (แยกไว้เพื่อไม่ต้องพึ่ง addDays ที่ผูกกับรูปแบบอื่น) */
function isoPlusDays(isoDate: string, days: number): string {
  const d = parseDate(isoDate);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/* -------------------------------- ข้อความสรุป -------------------------------- */

/** ข้อความสรุปหนึ่งบรรทัดสำหรับแสดงบน Card/ตาราง */
export function readinessSummary(result: ReadinessResult): string {
  if (result.blocking.length > 0) return `เอกสารไม่พร้อม ${result.blocking.length} รายการ`;
  if (result.warning.length > 0) return `พร้อมเดินทาง · มีข้อควรตรวจ ${result.warning.length} รายการ`;
  return 'เอกสารพร้อมเดินทาง';
}

/** ชื่อเอกสารของปัญหาแต่ละข้อ — ใช้จัดกลุ่มในหน้าจอ */
export function issueDocumentName(issue: ReadinessIssue): string {
  return DOC_KIND_DISPLAY_NAME[issue.kind];
}
