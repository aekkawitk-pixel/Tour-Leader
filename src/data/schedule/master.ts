/**
 * Tour Period Master builder — ประกอบ TourPeriodMaster จากข้อมูลต้นทาง (CSV) (§4/§5)
 *
 * ขั้นตอน: Load ดิบ → Normalize (trim/uppercase Group Code, ISO date, number) → คำนวณ → Validate (§13)
 * ไม่มี Logic อ่าน CSV/Normalize อยู่ใน Component — ทุกหน้าเรียกผ่าน Service กลาง (services/tourPeriodMaster)
 */

import { rawPeriods } from './periods.seed';
import { normalizePeriod, airlineFromTourCode, getPeriodStatus } from './normalize';
import type { TourPeriodMaster, ValidationResult, ValidationStatus } from './masterTypes';

/** ชื่อไฟล์ต้นทาง (เก็บไว้ตรวจย้อนหลัง §4) */
export const SOURCE_FILE = 'Query All Period Aug To Sep 2026.csv';
/** เวลานำเข้า (Demo คงที่ให้ deterministic · runtime จริงใช้เวลานำเข้าจริง) */
export const IMPORT_TS = '2026-07-13T08:00:00';

/** Composite Key กันข้อมูลซ้ำ (§6) — sourceSystem + groupCode + programCode + startDate + endDate */
export function compositeKey(m: Pick<TourPeriodMaster, 'sourceSystem' | 'groupCode' | 'programCode' | 'startDate' | 'endDate'>): string {
  return [m.sourceSystem, m.groupCode, m.programCode ?? '', m.startDate, m.endDate].join('|');
}

/** ตรวจสอบข้อมูล 1 พีเรียด → VALID / WARNING / INVALID + ข้อความ (§13) */
export function validateTourPeriodRecord(m: TourPeriodMaster): ValidationResult {
  const messages: string[] = [];
  let invalid = false;
  let warn = false;

  // INVALID — ข้อมูลผิดจนนำไปจัดหัวหน้าทัวร์ไม่ได้
  if (!m.groupCode) { messages.push('ไม่มี Group Code'); invalid = true; }
  if (m.startDate && m.endDate && m.startDate > m.endDate) { messages.push('วันเริ่มเดินทางมากกว่าวันสิ้นสุด'); invalid = true; }
  if (m.seatTotal != null && m.seatTotal < 0) { messages.push('ที่นั่งทั้งหมดติดลบ'); invalid = true; }
  if (m.seatBooked != null && m.seatBooked < 0) { messages.push('จำนวนจองติดลบ'); invalid = true; }
  if (!['SELL', 'NO_SELL', 'CLOSED'].includes(m.saleStatus)) { messages.push(`สถานะขายไม่ถูกต้อง (${m.saleStatus})`); invalid = true; }
  if (!['INC', 'COL'].includes(m.periodStatus)) { messages.push('ประเภทกรุ๊ปไม่ถูกต้อง (ต้องเป็น INC หรือ COL)'); invalid = true; }

  // WARNING — ผิดปกติแต่ยังเป็นข้อมูลจริง (เช่นยอดจองเกิน) หรือควรตรวจ
  if (m.seatRemaining != null && m.seatRemaining < 0) { messages.push('ที่นั่งคงเหลือติดลบ (ยอดจองเกินจริง)'); warn = true; }
  if (m.seatTotal != null && m.seatRemaining != null && m.seatRemaining > m.seatTotal) { messages.push('ที่นั่งคงเหลือมากกว่าที่นั่งทั้งหมด'); warn = true; }
  if (m.price == null) { messages.push('ไม่มีราคา'); warn = true; }
  if (m.firstSectorAirlineCode && !/^[A-Z0-9]{2,3}$/.test(m.firstSectorAirlineCode)) { messages.push('รูปแบบรหัสสายการบินผิด'); warn = true; }

  const status: ValidationStatus = invalid ? 'INVALID' : warn ? 'WARNING' : 'VALID';
  return { status, messages };
}

/**
 * ประกอบ Tour Period Master ทั้งหมดจากไฟล์ต้นทาง (memoized)
 *   - Group Code = trim + uppercase (§5.1)
 *   - รหัสสายการบิน Sector 1: CSV ไม่มี Sector → Fallback ท้าย Group Code (ระบุ airlineSource) (§5.5)
 *   - PK จริง = internalId (Group Code อาจซ้ำได้ §1)
 */
let cache: TourPeriodMaster[] | null = null;

export function buildTourPeriodMaster(): TourPeriodMaster[] {
  if (cache) return cache;
  cache = rawPeriods.map((raw, i) => {
    const base = normalizePeriod(raw);
    const internalId = `${base.tourCode}-${base.programCode ?? ''}-${base.startDate}-${i}`;
    const groupCode = (base.tourCode ?? '').trim().toUpperCase();
    const airline = airlineFromTourCode(groupCode);
    const durationNights = base.durationDays > 0 ? base.durationDays - 1 : 0;

    const rec: TourPeriodMaster = {
      ...base,
      internalId,
      // อ้างอิง
      sourceSystem: 'CSV',
      sourceRecordId: `${SOURCE_FILE}#${i + 2}`,
      groupCode,
      countryCode: null, // CSV ไม่มีรหัสประเทศ · เชื่อม Country Master ภายหลัง (§5.2)
      programId: null, // ยังไม่แยก Program Master (§7)
      // การเดินทาง
      startDateTime: null, // CSV ไม่มีเวลา (§5.3)
      endDateTime: null,
      durationNights,
      departureAirportCode: null, // CSV ไม่มี Sector (§5.5)
      arrivalAirportCode: null,
      firstSectorAirlineCode: airline,
      airlineSource: airline ? 'derived_from_group_code' : null,
      route: null,
      sectors: [],
      // สถานะ
      sourceTourStatus: raw.tourStatus ?? '',
      sourceSellStatus: raw.sellStatus ?? '',
      // ราคา
      originalPrice: null,
      visaPrice: base.visaRegularPrice,
      currency: 'THB',
      // ที่นั่ง
      seatTotal: base.seat,
      seatBooked: base.bookingCount,
      seatRemaining: base.bookingBalance,
      // เพิ่มเติม
      // ข้อความเต็มมีเฉพาะรายการที่ IncName ระบุ INC:/COL: จริง — COL ที่ระบบอนุมานให้ไม่มีข้อความ
      periodStatusDetail: getPeriodStatus(base.incName) ? base.incName : null,
      commission: base.comStandard,
      remark: null,
      // ระบบ
      dataStatus: 'ACTIVE',
      isActive: true,
      importedAt: IMPORT_TS,
      updatedAt: IMPORT_TS,
      lastSyncedAt: IMPORT_TS,
      sourceFileName: SOURCE_FILE,
      sourceRowNumber: i + 2,
      validationStatus: 'VALID',
      validationMessages: [],
    };

    const v = validateTourPeriodRecord(rec);
    rec.validationStatus = v.status;
    rec.validationMessages = v.messages;
    return rec;
  });
  return cache;
}
