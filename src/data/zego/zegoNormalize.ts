/**
 * Data Normalizer — แปลง ZegoPeriod (ดิบจาก PDF) → ScheduleRow (พร้อมแสดงในตาราง)
 * แยกจากทั้ง Source และ Display · ช่องที่ไม่มีในไฟล์คืน null → หน้าจอแสดง "ไม่ระบุ" (ไม่กุข้อมูล §5)
 *
 * สายการบิน: รหัส IATA อยู่ท้าย Group Code จริงในไฟล์ (เช่น CKG-260801A-HU → HU) จึงดึงมาแสดงได้
 * ชื่อสายการบินเป็นข้อมูลอ้างอิงมาตรฐานจากรหัส IATA (ไม่ใช่การสุ่มสร้าง) — รหัสไหนไม่รู้จักแสดงรหัสอย่างเดียว
 */

import type { ZegoPeriod } from './types';
import { diffDays } from '@/lib/format';

/** ชื่อสายการบินจากรหัส IATA (อ้างอิงมาตรฐาน) — เท่าที่พบในไฟล์ */
const AIRLINE_NAME: Record<string, string> = {
  HU: 'ไห่หนานแอร์ไลน์',
  MU: 'ไชน่าอีสเทิร์น',
  '9C': 'สปริงแอร์ไลน์',
  VZ: 'ไทยเวียตเจ็ท',
  UQ: 'อุรุมชีแอร์',
  CX: 'คาเธ่ย์แปซิฟิก',
  EK: 'เอมิเรตส์',
  XJ: 'ไทยแอร์เอเชีย เอกซ์',
  MM: 'พีช เอวิเอชัน',
  SQ: 'สิงคโปร์แอร์ไลน์',
  JX: 'สตาร์ลักซ์',
  CI: 'ไชน่าแอร์ไลน์',
  VN: 'เวียดนามแอร์ไลน์',
};

/** รหัส/ชื่อสายการบินจาก Group Code (ท้ายรหัสคือ IATA) */
export function airlineFromGroupCode(groupCode: string): { code: string | null; name: string | null } {
  const parts = groupCode.split('-');
  const code = parts.length >= 3 ? parts[parts.length - 1] : null;
  if (!code || !/^[A-Z0-9]{2}$/.test(code)) return { code: null, name: null };
  return { code, name: AIRLINE_NAME[code] ?? null };
}

export interface ScheduleRow {
  id: string;
  seq: number;
  programCode: string;
  groupCode: string;
  programName: string;
  country: string;
  route: string | null; // ไม่มีในไฟล์ PDF
  airlineCode: string | null;
  airlineName: string | null;
  flightNo: string | null; // ไม่มีในไฟล์ PDF
  startDate: string; // ISO
  endDate: string; // ISO
  durationDays: number;
  totalSeats: number | null;
  bookedSeats: number | null;
  remainingSeats: number | null;
  overbookedSeats: number;
  isOverbooked: boolean;
  originalPrice: number | null;
  salePrice: number | null;
  saleStatus: string;
  ticketDeadlineText: string | null;
}

export function toScheduleRow(p: ZegoPeriod): ScheduleRow {
  const air = airlineFromGroupCode(p.groupCode);
  return {
    id: p.id,
    seq: p.seq,
    programCode: p.programCode,
    groupCode: p.groupCode,
    programName: p.rawProgramName || p.programCode,
    country: p.country,
    route: null,
    airlineCode: air.code,
    airlineName: air.name,
    flightNo: null,
    startDate: p.startDate,
    endDate: p.endDate,
    durationDays: diffDays(p.startDate, p.endDate) + 1,
    totalSeats: p.totalSeats,
    bookedSeats: p.bookedSeats,
    remainingSeats: p.remainingSeats,
    overbookedSeats: p.overbookedSeats,
    isOverbooked: p.isOverbooked,
    originalPrice: p.originalPrice,
    salePrice: p.salePrice,
    saleStatus: p.saleStatus,
    ticketDeadlineText: p.ticketDeadlineText,
  };
}
