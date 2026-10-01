/**
 * Data Normalizer — แปลง RawPeriod (ดิบจาก CSV) → SchedulePeriod (พร้อมแสดง)
 * แยกจาก CSV Loader และ Schedule Table · แปลงวันที่ d/m/yyyy → ISO · คำนวณ bookingCount + สายการบิน
 */

import type { PeriodStatus, RawPeriod, SchedulePeriod } from './types';
import { getSaleStatus } from './saleStatus';
import { diffDays } from '@/lib/format';

/**
 * สถานะพีเรียดจาก "ข้อความจริง" ใน IncName เท่านั้น (ไม่ดู tourStatus/sellStatus/tourName หรือแค่มีค่า)
 *   ขึ้นต้น "INC :" → INC · ขึ้นต้น "COL :" → COL · อื่น ๆ → null (ไม่ใช่สถานะพีเรียด)
 */
export function getPeriodStatus(value: string | null | undefined): PeriodStatus | null {
  const t = String(value ?? '').trim();
  if (/^INC\s*:/i.test(t)) return 'INC';
  if (/^COL\s*:/i.test(t)) return 'COL';
  return null;
}

/**
 * ประเภทกรุ๊ป — มีแค่ INC กับ COL เท่านั้น ไม่มีค่าว่าง
 *   IncName ระบุ "INC :" → INC · นอกนั้นทั้งหมด → COL
 *
 * แยกแกนกับ "สถานะขาย" (SELL / NO SELL / CLOSED) โดยสิ้นเชิง —
 * ทุกสถานะขายเกิดกับประเภทกรุ๊ปใดก็ได้ จึงห้ามเอาสถานะขายมาตัดสินประเภทกรุ๊ป
 *
 * COL ส่วนใหญ่มาจากกฎนี้ ไม่ได้มาจาก CSV — ข้อความเต็ม (periodStatusDetail)
 * จึงมีเฉพาะรายการที่ IncName ระบุ INC:/COL: จริงเท่านั้น
 */
export function resolvePeriodStatus(incName: string | null | undefined): PeriodStatus {
  return getPeriodStatus(incName) === 'INC' ? 'INC' : 'COL';
}

/** d/m/yyyy → ISO yyyy-mm-dd (คืน '' เมื่อผิดรูป) */
function dmyToISO(s: string): string {
  const m = (s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** รหัสสายการบิน = ท้าย tourCode เช่น CAN-260910E-AQ → AQ */
export function airlineFromTourCode(tourCode: string): string | null {
  const parts = (tourCode ?? '').split('-');
  const code = parts.length >= 3 ? parts[parts.length - 1] : null;
  return code && /^[A-Z0-9]{2,3}$/.test(code) ? code : null;
}

/** แยก Program Code (ส่วนหน้า " : ") + ชื่อที่ตัด [STATUS] ออกจาก tourName */
export function splitTourName(tourName: string): { programCode: string | null; displayName: string } {
  const s = (tourName ?? '').trim();
  const i = s.indexOf(' : ');
  let programCode: string | null = null;
  let name = s;
  if (i > 0) {
    const pre = s.slice(0, i).trim();
    if (/^[A-Za-z0-9-]{3,}$/.test(pre)) { programCode = pre; name = s.slice(i + 3); }
  }
  // ตัดแท็กสถานะที่ฝังในชื่อ เช่น "[ NO SELL ]", "[SELL]", "[ CLOSE ]"
  name = name.replace(/^\s*\[\s*(NO\s*SELL|SELL|CLOSE|OPEN)\s*\]\s*/i, '').trim();
  return { programCode, displayName: name || s };
}

export function normalizePeriod(raw: RawPeriod): Omit<SchedulePeriod, 'internalId'> {
  const startDate = dmyToISO(raw.startDate);
  const endDate = dmyToISO(raw.endDate);
  const { programCode, displayName } = splitTourName(raw.tourName);
  const saleStatus = getSaleStatus(raw);
  const statusFromText = getPeriodStatus(raw.incName); // มาจากข้อความจริงเท่านั้น
  const periodStatus = resolvePeriodStatus(raw.incName);
  const incRaw = String(raw.incName ?? '').trim();
  return {
    id: raw.tourCode,
    countryName: raw.countryName,
    tourCode: raw.tourCode,
    programCode,
    bus: raw.bus,
    tourName: raw.tourName,
    displayName,
    incName: raw.incName,
    periodStatus,
    // เทียบกับ "ข้อความจริง" ไม่ใช่ periodStatus ที่อนุมานมา — ไม่งั้น COL ที่อนุมานจะกลืนหมายเหตุหายไป
    systemNote: !statusFromText && incRaw ? incRaw : null, // ข้อความอื่น = หมายเหตุจากระบบ
    startDate,
    endDate,
    durationDays: startDate && endDate ? diffDays(startDate, endDate) + 1 : 0,
    price: raw.price,
    seat: raw.seat,
    bookingBalance: raw.bookingBalance,
    bookingCount: raw.seat != null && raw.bookingBalance != null ? raw.seat - raw.bookingBalance : null,
    visaRegularPrice: raw.visaRegularPrice,
    comStandard: raw.comStandard,
    saleStatus,
    airlineCode: airlineFromTourCode(raw.tourCode),
  };
}
