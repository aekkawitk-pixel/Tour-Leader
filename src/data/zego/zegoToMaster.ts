/**
 * แปลงข้อมูลที่นำเข้าจาก Zego API → Tour Period Master (§2/§14)
 *
 * ทำให้ข้อมูลโปรแกรมทัวร์จาก Zego กลายเป็น "ข้อมูลกลาง" ชุดเดียวกับที่ทุกเมนูอ่านอยู่แล้ว
 * (ตารางจัดสเก็ต · ปฏิทินงาน · Master รายการทัวร์ · รายงาน · แจ้งเตือน NO SELL)
 * โดยไม่ต้องแก้หน้าจอไหนเลย เพราะทุกหน้าเรียกผ่าน services/tourPeriodMaster.ts จุดเดียว
 *
 * ⚠️ กติกา: ฟิลด์ที่ Zego ไม่ได้ส่งมา ต้องเป็น null / ค่าว่าง ห้ามเดาหรือคำนวณขึ้นมาเอง
 *    ทุกจุดที่ข้อมูลไม่ครบจะบันทึกไว้ใน validationMessages ให้ตรวจสอบย้อนหลังได้
 */

import { splitFlightLegs } from '@/lib/logic/guideBoard';
import { resolveZegoCountry } from '@/lib/logic/zegoCountry';
import type { TourPeriodMaster, TourSector, ValidationStatus } from '@/data/schedule/masterTypes';
import type { SaleStatus } from '@/data/schedule/types';
import type { ZegoFlight, ZegoPeriod, ZegoProgram } from './types';

/**
 * สถานะขายของ Zego → สถานะขายกลาง (SELL / NO_SELL / CLOSED)
 *
 * Zego ใช้คำต่างจากระบบเรา (เช่น "Book" = ยังรับจองอยู่) จึงเทียบด้วยคำสำคัญ
 * ค่าที่ไม่รู้จักถือเป็น SELL ตามหลักเดียวกับฝั่ง CSV (ไม่ระบุว่าปิด = ยังขายอยู่)
 * และค่าดิบยังถูกเก็บไว้ใน sourceSellStatus เสมอ จึงตรวจย้อนได้ว่าต้นทางเขียนว่าอะไร
 */
export function zegoSaleStatus(raw: string): SaleStatus {
  const s = raw.trim().toUpperCase();
  if (s.includes('NO SELL') || s.includes('NOSELL') || s.includes('NO_SELL')) return 'NO_SELL';
  if (s.includes('CLOSE') || s.includes('FULL')) return 'CLOSED';
  return 'SELL';
}

/** "BKK-CAN" → { from: 'BKK', to: 'CAN' } · รูปแบบอื่นคืน null ทั้งคู่ ไม่เดา */
export function splitRoute(route: string): { from: string; to: string } | null {
  const m = route.trim().toUpperCase().match(/^([A-Z]{3})\s*[-–/]\s*([A-Z]{3})$/);
  return m ? { from: m[1], to: m[2] } : null;
}

/**
 * เที่ยวบินของโปรแกรม → Sector
 *
 * ⚠️ Zego ส่งมาเป็น "เวลาประจำเที่ยวบิน" (เช่น 02:30:00) ไม่ใช่วันที่-เวลาเต็ม
 *    จึงตั้ง departureDateTime/arrivalDateTime = null ไม่เอาวันเดินทางของพีเรียดมาต่อเอง
 *    (เที่ยวบินตี 2 ครึ่งอาจออกคนละวันกับวันเริ่มทัวร์ — เดาแล้วได้วันที่ผิด)
 *    ส่วนตัวเวลาเก็บไว้ใน departureTime/arrivalTime ซึ่งเป็นเวลาล้วน ไม่ได้อ้างวันที่
 */
export function zegoSectors(flights: ZegoFlight[]): TourSector[] {
  const rows = flights.map((f, i) => {
    const leg = splitRoute(f.route);
    return {
      sectorSequence: i + 1,
      // ตั้งชั่วคราว แล้วแก้ให้ตรงขาไป/ขากลับจริงอีกทีด้านล่าง (ทัวร์เข้าเมืองหนึ่งออกอีกเมืองมีได้หลายช่วงต่อขา)
      sectorType: 'OUTBOUND' as TourSector['sectorType'],
      airlineCode: f.airlineCode,
      flightNumber: f.flightNo,
      fromAirportCode: leg?.from ?? '',
      toAirportCode: leg?.to ?? '',
      departureDateTime: null,
      arrivalDateTime: null,
      departureTime: hhmm(f.departureTime),
      arrivalTime: hhmm(f.arrivalTime),
    } satisfies TourSector;
  });

  const { inbound } = splitFlightLegs(rows);
  const inboundFrom = rows.length - inbound.length;
  return rows.map((r, i) => (i >= inboundFrom && inbound.length > 0 ? { ...r, sectorType: 'INBOUND' as const } : r));
}

/** "02:30:00" → "02:30" · รูปแบบอื่นคืนค่าเดิม · ว่าง → null (วินาทีจาก Zego เป็น 00 เสมอ) */
function hhmm(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}:\d{2}):\d{2}$/);
  return m ? m[1] : t;
}

/** จำนวนคืน — คำนวณจากวันจริงเมื่อมีครบ ไม่มีก็ใช้ค่าของโปรแกรม ไม่มีอีกก็ 0 */
function nightsOf(period: ZegoPeriod, program: ZegoProgram | undefined): number {
  if (period.startDate && period.endDate) {
    const ms = Date.parse(`${period.endDate}T00:00:00Z`) - Date.parse(`${period.startDate}T00:00:00Z`);
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 86_400_000);
  }
  return program?.durationNights ?? 0;
}

export interface ZegoMasterInput {
  programs: ZegoProgram[];
  periods: ZegoPeriod[];
  /** เวลาที่กดนำเข้า (ISO) — ใช้เป็น importedAt/updatedAt/lastSyncedAt ของทุกแถว */
  importedAt: string;
  /** เวลาที่ Zego แจ้งว่าข้อมูลถูกแก้ล่าสุด — ใส่ไว้ในชื่อแหล่งข้อมูลให้ตรวจย้อนได้ */
  sourceUpdatedAt?: string | null;
}

/**
 * แปลงข้อมูลที่นำเข้าทั้งชุด → Tour Period Master
 * เรียงตามวันเดินทางเพื่อให้ลำดับคงที่ ไม่ขึ้นกับลำดับที่ API ส่งมา
 */
export function zegoToTourPeriodMaster(input: ZegoMasterInput): TourPeriodMaster[] {
  const programById = new Map(input.programs.map((p) => [p.programCode, p]));
  const sourceFile = input.sourceUpdatedAt
    ? `Zego API v1.5 (ข้อมูลต้นทาง ${input.sourceUpdatedAt})`
    : 'Zego API v1.5';

  return input.periods
    .map((d, i) => toMaster(d, programById.get(d.programCode), input, sourceFile, i))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.groupCode.localeCompare(b.groupCode));
}

function toMaster(
  d: ZegoPeriod,
  program: ZegoProgram | undefined,
  input: ZegoMasterInput,
  sourceFile: string,
  index: number,
): TourPeriodMaster {
  /* คำเตือนตอนแปลงข้อมูลติดมาด้วย เพื่อไม่ให้ปัญหาหายไประหว่างทาง */
  const messages = [...d.importWarnings];

  const flights = program?.flights ?? [];
  const sectors = zegoSectors(flights);
  const outbound = sectors[0] ?? null;
  const inbound = sectors[sectors.length - 1] ?? null;

  const nights = nightsOf(d, program);
  const saleStatus = zegoSaleStatus(d.saleStatus);

  /*
    ประเภทกรุ๊ป INC/COL — Zego ไม่มีฟิลด์นี้
    ใช้กติกาเดิมของระบบ "ไม่ใช่ INC ก็เป็น COL" แทนการกุค่าขึ้นมาใหม่ และบันทึกไว้ให้รู้ว่าไม่ได้มาจากต้นทาง
  */
  if (d.missingSince) messages.push(`ไม่พบพีเรียดนี้ในข้อมูลที่ดึงจาก Zego ตั้งแต่ ${d.missingSince.slice(0, 10)} — คงไว้เพื่อให้งานที่ผูกไว้ยังแสดงได้`);
  messages.push('Zego API ไม่มีข้อมูลประเภทกรุ๊ป (INC/COL) — ระบบตั้งเป็น COL ตามค่าเริ่มต้น');

  // ประเทศจาก Zego บางโปรแกรมระบุผิด (เช่น กรุ๊ปจีนเป็น AMERICA) — ตรวจกับปลายทางตามหัวรหัสกรุ๊ป (ดู zegoCountry)
  const country = resolveZegoCountry(d.country, d.countryCode, d.groupCode);
  if (country.correctedFrom) {
    messages.push(`ประเทศจาก Zego "${country.correctedFrom}" ไม่ตรงกับปลายทางของกรุ๊ป — ระบบใช้ ${country.countryName} ตามรหัสกรุ๊ป (ควรแก้ที่ Zego ต้นทาง)`);
  }

  const validationStatus: ValidationStatus = d.importWarnings.length > 0 || country.correctedFrom ? 'WARNING' : 'VALID';

  return {
    /* ---- SchedulePeriod ---- */
    id: d.groupCode || d.id,
    internalId: d.id,
    countryName: country.countryName,
    tourCode: d.groupCode,
    programCode: d.programCode || null,
    bus: d.bus,
    tourName: program?.programName ?? d.rawProgramName,
    displayName: program?.programName ?? d.rawProgramName,
    incName: null,
    periodStatus: 'COL',
    systemNote: d.remark,
    startDate: d.startDate,
    endDate: d.endDate,
    durationDays: program?.durationDays ?? (nights > 0 ? nights + 1 : 0),
    price: d.salePrice,
    seat: d.totalSeats,
    bookingBalance: d.remainingSeats,
    bookingCount: d.bookedSeats,
    // Zego API v1.5 ไม่มีราคาวีซ่าแยก และไม่มีคอมมิชชันมาตรฐานในรูปแบบที่ระบบนี้ใช้
    visaRegularPrice: null,
    comStandard: null,
    saleStatus,
    airlineCode: d.airlineCode ?? outbound?.airlineCode ?? null,

    /* ---- อ้างอิง ---- */
    sourceSystem: 'REST',
    sourceRecordId: `zego:${d.id}`,
    groupCode: d.groupCode.trim().toUpperCase(),
    countryCode: country.countryCode || null,
    programId: program?.id ?? null,

    /* ---- การเดินทาง ---- */
    startDateTime: d.startDateTime,
    endDateTime: d.endDateTime,
    durationNights: nights,
    departureAirportCode: outbound?.fromAirportCode || null,
    arrivalAirportCode: outbound?.toAirportCode || (inbound?.fromAirportCode || null),
    firstSectorAirlineCode: outbound?.airlineCode || null,
    airlineSource: outbound ? 'sector' : (d.airlineCode ? 'source' : null),
    route: outbound && outbound.fromAirportCode && outbound.toAirportCode
      ? `${outbound.fromAirportCode}-${outbound.toAirportCode}`
      : null,

    sectors,

    /* ---- สถานะ ---- */ // periodStatus อยู่ในส่วน SchedulePeriod ด้านบนแล้ว
    sourceTourStatus: d.saleStatus,
    sourceSellStatus: d.saleStatus,

    /* ---- ราคา ---- */
    originalPrice: d.originalPrice,
    visaPrice: null,
    currency: 'THB',

    /* ---- ที่นั่ง ---- */
    seatTotal: d.totalSeats,
    seatBooked: d.bookedSeats,
    seatRemaining: d.remainingSeats,

    /* ---- เพิ่มเติม ---- */
    periodStatusDetail: null,
    commission: null,
    remark: d.remark,

    /* ---- ระบบ ---- */
    // ไม่พบในการดึงรอบล่าสุด — เก็บไว้ให้งานที่ผูกไว้ยังแสดงได้ แต่ห้ามนำไปจัดงานใหม่ (getAssignablePeriods กรองออก)
    dataStatus: d.missingSince ? 'MISSING_FROM_SOURCE' : 'ACTIVE',
    isActive: !d.missingSince,
    importedAt: input.importedAt,
    updatedAt: input.importedAt,
    lastSyncedAt: input.importedAt,
    sourceFileName: sourceFile,
    sourceRowNumber: index + 1,
    validationStatus,
    validationMessages: messages,
  };
}
