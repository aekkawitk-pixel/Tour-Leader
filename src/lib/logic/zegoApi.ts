/**
 * Zego API v1.5 — ชนิดข้อมูลดิบและตัวแปลงเป็นโครงสร้างภายในระบบ
 * เอกสาร: https://www.zegoapi.com/document/v1.5
 *
 * ตรรกะล้วน ไม่แตะเครือข่าย/เบราว์เซอร์ — ทดสอบได้ตรง ๆ
 *
 * ⚠️ ชื่อฟิลด์ทุกตัวมาจากเอกสาร ไม่ได้เดาเอง แต่ "ความหมาย" ของ GroupSize/Book/Seat
 *    ยังไม่ได้ยืนยันกับ Response จริง (ยังไม่มี Token) — ระบบจึงบันทึกเป็น importWarnings
 *    เมื่อตัวเลขขัดกันเอง แทนที่จะกลืนความไม่ตรงแล้วแสดงเลขที่อาจผิด
 */

import type { ZegoFlight, ZegoPeriod, ZegoProgram } from '@/data/zego/types';

/* ----------------------------- ชนิดข้อมูลดิบจาก API ----------------------------- */

/** 1 พีเรียด (กรุ๊ป) ตามที่ API ส่งมา — ฟิลด์ที่ระบบนี้ใช้เท่านั้น ที่เหลือปล่อยผ่าน */
export interface ZegoApiPeriod {
  PeriodID?: number | string;
  PeriodCode?: string;
  Bus?: string | null;
  PeriodStartDate?: string;
  PeriodEndDate?: string;
  CountryCode?: string;
  CountryName?: string;
  GroupSize?: number | string | null;
  Book?: number | string | null;
  Seat?: number | string | null;
  AirlineCode?: string;
  AirlineName?: string;
  Airport?: string;
  PeriodStatus?: string;
  PeriodConfirm?: string | number | boolean | null;
  PeriodNew?: string | number | boolean | null;
  PeriodNote?: string | null;
  Price?: number | string | null;
  Deposit?: number | string | null;
  UpdateDate?: string;
}

/** 1 เที่ยวบินตามที่ API ส่งมา */
export interface ZegoApiFlight {
  AirlineCode?: string;
  AirlineName?: string;
  FlightNo?: string;
  Route?: string;
  DepartureTime?: string;
  ArrivalTime?: string;
}

/** 1 โปรแกรมทัวร์ตามที่ API ส่งมา (endpoint /programtours คืนเป็น Array ตรง ๆ ไม่มี envelope) */
export interface ZegoApiProgram {
  ProductID?: number | string;
  ProductCode?: string;
  ProductName?: string;
  CountryCode?: string;
  CountryName?: string;
  CountryCodeISO2?: string;
  CountryCodeISO3?: string;
  Days?: number | string | null;
  Nights?: number | string | null;
  Periods?: ZegoApiPeriod[];
  Flights?: ZegoApiFlight[];
}

/** ผลของ GET /programtours/updatelastesttime */
export interface ZegoApiUpdatedAt {
  PeriodUpdateDate?: string;
}

/* -------------------------------- ตัวช่วยแปลงค่า -------------------------------- */

/** ตัวเลขที่อาจมาเป็น string — แปลงไม่ได้ = null (ไม่ใช่ 0 เพราะ 0 คือ "มีข้อมูลและเป็นศูนย์") */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * วันที่จาก API มาได้ทั้ง "2026-08-12" และ "2026-08-12 04:29:49"
 * คืนส่วนวันที่ (ISO) กับส่วนเวลาแยกกัน — เวลา 00:00:00 ถือว่า "ไม่ได้ระบุเวลา"
 * เพราะทั้งระบบใช้เกณฑ์เดียวกันว่าเวลา 00:00 = ยังไม่รู้เวลาเริ่มงานจริง
 */
export function splitDateTime(value: unknown): { date: string | null; time: string | null } {
  if (typeof value !== 'string' || value.trim() === '') return { date: null, time: null };
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/);
  if (!m) return { date: null, time: null };
  const time = m[2] && m[2] !== '00:00' ? m[2] : null;
  return { date: m[1], time };
}

/** ค่าที่ API ใช้แทน "จริง" ได้หลายแบบ (1 / "1" / true / "Y") — เทียบให้ครบแทนการเดาแบบเดียว */
function truthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['1', 'y', 'yes', 'true'].includes(value.trim().toLowerCase());
  return false;
}

/* --------------------------------- ตัวแปลงหลัก --------------------------------- */

/** ผลการแปลง 1 ครั้ง — โปรแกรม/พีเรียด พร้อมรายการที่แปลงไม่ได้ (ไม่ทิ้งเงียบ) */
export interface ZegoNormalizeResult {
  programs: ZegoProgram[];
  periods: ZegoPeriod[];
  /** โปรแกรมที่ข้ามไปเพราะไม่มี ProductCode — ระบุจำนวนและเหตุผลไว้ให้เห็น */
  skipped: string[];
}

/**
 * แปลง Response จาก /programtours → โครงสร้างภายใน (ZegoProgram / ZegoPeriod)
 *
 * โปรแกรมที่ไม่มี ProductCode จะถูกข้าม เพราะทั้งระบบใช้ programCode เป็นตัวจับคู่
 * (ปล่อยผ่านเข้าไปจะกลายเป็นรายการไร้รหัสที่จับคู่กับอะไรไม่ได้เลย)
 */
export function normalizeZegoPrograms(raw: unknown): ZegoNormalizeResult {
  const list: ZegoApiProgram[] = Array.isArray(raw) ? raw : [];
  const programs: ZegoProgram[] = [];
  const periods: ZegoPeriod[] = [];
  const skipped: string[] = [];
  let seq = 0;

  for (const p of list) {
    const programCode = (p.ProductCode ?? '').toString().trim();
    if (!programCode) {
      skipped.push(`โปรแกรม ProductID ${p.ProductID ?? '(ไม่ระบุ)'} ไม่มี ProductCode`);
      continue;
    }
    const programId = `ZEGO-${programCode}`;
    const programName = (p.ProductName ?? '').toString().trim() || null;
    const country = (p.CountryName ?? '').toString().trim();
    const countryCode = (p.CountryCode ?? '').toString().trim();
    const rawPeriods = Array.isArray(p.Periods) ? p.Periods : [];
    const flights = normalizeFlights(p.Flights);

    programs.push({
      id: programId,
      programCode,
      programName,
      rawProgramName: programName ?? programCode,
      country,
      countryCode,
      durationDays: toNumber(p.Days),
      durationNights: toNumber(p.Nights),
      periodCount: rawPeriods.length,
      createdFromSampleFile: false,
      flights,
    });

    for (const d of rawPeriods) {
      seq += 1;
      periods.push(normalizePeriod(d, { seq, programId, programCode, programName, country, countryCode }));
    }
  }

  return { programs, periods, skipped };
}

function normalizePeriod(
  d: ZegoApiPeriod,
  ctx: { seq: number; programId: string; programCode: string; programName: string | null; country: string; countryCode: string },
): ZegoPeriod {
  const warnings: string[] = [];
  const start = splitDateTime(d.PeriodStartDate);
  const end = splitDateTime(d.PeriodEndDate);
  if (!start.date) warnings.push('ไม่มีวันเดินทางไป (PeriodStartDate) ในข้อมูลที่ได้รับ');
  if (!end.date) warnings.push('ไม่มีวันเดินทางกลับ (PeriodEndDate) ในข้อมูลที่ได้รับ');

  /*
    GroupSize = ที่นั่งทั้งหมด · Book = จองแล้ว · Seat = ที่นั่งคงเหลือ
    ถ้าสามค่านี้ไม่สอดคล้องกัน แปลว่าเข้าใจความหมายฟิลด์ผิด — บันทึกไว้ ไม่กลบด้วยการคำนวณใหม่
  */
  const total = toNumber(d.GroupSize);
  const booked = toNumber(d.Book);
  const remaining = toNumber(d.Seat);
  if (total !== null && booked !== null && remaining !== null && total - booked !== remaining) {
    warnings.push(`ที่นั่งไม่สอดคล้อง: GroupSize ${total} − Book ${booked} ≠ Seat ${remaining}`);
  }

  const tags: string[] = [];
  if (truthy(d.PeriodNew)) tags.push('NEW');

  const groupCode = (d.PeriodCode ?? '').toString().trim();
  if (!groupCode) warnings.push('ไม่มีรหัสกรุ๊ป (PeriodCode) ในข้อมูลที่ได้รับ');

  const deposit = toNumber(d.Deposit);

  return {
    /*
      PeriodID ของ Zego = id ถาวร · ไม่มี PeriodID ใช้ "โปรแกรม + รหัสกรุ๊ป + วันไป" (ไม่ขึ้นกับลำดับในรายการ)
      ลำดับ (seq) ใช้เป็นทางสุดท้ายเมื่อไม่มีรหัสกรุ๊ป — ลำดับเปลี่ยนได้ทุกครั้งที่ดึง งานที่ผูกไว้จะชี้ผิดกรุ๊ป
    */
    id: `ZEGO-PD-${d.PeriodID ?? (groupCode ? `${ctx.programCode}-${groupCode.toUpperCase()}-${start.date ?? ''}` : `${ctx.programCode}-${ctx.seq}`)}`,
    seq: ctx.seq,
    programId: ctx.programId,
    programCode: ctx.programCode,
    groupCode,
    bus: (d.Bus ?? '').toString().trim() || null,
    country: (d.CountryName ?? '').toString().trim() || ctx.country,
    countryCode: (d.CountryCode ?? '').toString().trim() || ctx.countryCode,
    startDate: start.date ?? '',
    endDate: end.date ?? '',
    startDateTime: start.date && start.time ? `${start.date}T${start.time}` : null,
    endDateTime: end.date && end.time ? `${end.date}T${end.time}` : null,
    hasExactWorkTime: Boolean(start.time && end.time),
    saleStatus: (d.PeriodStatus ?? '').toString().trim() || 'SELL',
    confirmStatus: truthy(d.PeriodConfirm) ? 'CONFIRMED' : 'NOT_SPECIFIED',
    periodTags: tags,
    // API v1.5 ไม่มีเส้นตายออกตั๋ว — ปล่อยว่างไว้ ไม่คาดเดาจากวันเดินทาง
    ticketDeadline: null,
    ticketDeadlineText: null,
    paymentText: deposit !== null ? `มัดจำ ${deposit.toLocaleString('th-TH')} บาท` : null,
    originalPrice: null,
    salePrice: toNumber(d.Price),
    totalSeats: total,
    bookedSeats: booked,
    remainingSeats: remaining,
    rawRemainingValue: d.Seat === null || d.Seat === undefined ? '' : String(d.Seat),
    isOverbooked: remaining !== null && remaining < 0,
    overbookedSeats: remaining !== null && remaining < 0 ? Math.abs(remaining) : 0,
    // API v1.5 ไม่มีข้อมูลหัวหน้าทัวร์ — ทุกพีเรียดจึงเป็น "ยังไม่จัด" ไม่ใช่กุชื่อขึ้นมา
    assignedTourLeaderName: null,
    assignedTourLeaderType: null,
    assignmentStatus: 'UNASSIGNED',
    remark: (d.PeriodNote ?? '').toString().trim() || null,
    rawProgramName: ctx.programName ?? ctx.programCode,
    airlineCode: text(d.AirlineCode) || undefined,
    airlineName: text(d.AirlineName) || undefined,
    airport: text(d.Airport) || undefined,
    rawText: '',
    sourcePage: 0,
    importWarnings: warnings,
  };
}

/** ข้อความจาก API ที่อาจเป็น null/ตัวเลข — คืนเป็น string ที่ตัดช่องว่างแล้วเสมอ */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * เที่ยวบินของโปรแกรม — เก็บเฉพาะรายการที่มีเลขเที่ยวบินหรือเส้นทาง
 * (รายการที่ว่างทั้งแถวไม่มีอะไรให้ดู แสดงไปก็เป็นบรรทัดเปล่า)
 */
export function normalizeFlights(raw: unknown): ZegoFlight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f: ZegoApiFlight) => ({
      airlineCode: text(f.AirlineCode),
      airlineName: text(f.AirlineName),
      flightNo: text(f.FlightNo),
      route: text(f.Route),
      departureTime: text(f.DepartureTime),
      arrivalTime: text(f.ArrivalTime),
    }))
    .filter((f) => f.flightNo !== '' || f.route !== '');
}

/** อ่านเวลาอัปเดตล่าสุดจาก /programtours/updatelastesttime */
export function readUpdatedAt(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as ZegoApiUpdatedAt).PeriodUpdateDate;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
