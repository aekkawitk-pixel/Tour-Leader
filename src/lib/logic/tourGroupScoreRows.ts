/**
 * สร้างแถวของตารางคะแนนกรุ๊ป (§ความสัมพันธ์ของข้อมูล)
 *
 * เชื่อมข้อมูล 3 ฝั่งเข้าด้วยกัน — ไม่สร้างข้อมูลใหม่:
 *   Tour Period Master (พีเรียด/กรุ๊ปจริง) × Guide Assignment (หัวหน้าทัวร์ที่ได้รับมอบหมาย) × แบบสอบถาม
 * เชื่อมด้วย periodId · groupCode · tourLeaderId · surveyResponseId
 *
 * ตรรกะล้วน (รับข้อมูลเป็นพารามิเตอร์) เพื่อให้ทดสอบได้และใช้ซ้ำได้ทั้ง 2 ตาราง
 */

import {
  categoryAverages, overallScore, responseRate, routeCodeFromGroupCode,
  emptyCategoryScores, type CategoryScores,
} from './groupScore';
import type { SurveyResponse } from '@/data/scores/groupScoreTypes';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { SaleStatus } from '@/data/schedule/types';

/** 1 แถวในตารางคะแนนกรุ๊ป */
export interface TourGroupScoreRow {
  /** key สำหรับ React (พีเรียดเดียวอาจมีหัวหน้าทัวร์หลายคน) */
  key: string;
  periodId: string;
  groupCode: string;
  /** ชื่อโปรแกรมที่ตัดรหัส/สถานะออกแล้ว — แสดงคู่กับ Group Code */
  programName: string;
  countryName: string;
  /** รหัสเส้นทาง เช่น CKG (อ่านจาก Group Code) */
  routeCode: string | null;
  /** วันเดินทาง (ISO) — null = ต้นทางไม่ระบุ */
  departDate: string | null;
  returnDate: string | null;
  /** สถานะขายจาก Master — แสดงเป็นป้ายในคอลัมน์กรุ๊ป */
  saleStatus: SaleStatus;
  /** null = ไม่ได้ระบุวันอ้างอิงมา · false = ยังไม่ถึงวันเดินทาง (แถวรอข้อมูล) */
  travelled: boolean | null;

  /** หัวหน้าทัวร์ที่รับผิดชอบกรุ๊ปนี้ */
  tourLeaderId: string | null;
  leaderName: string | null;

  /** จำนวนผู้เดินทาง (จากไฟล์แบบสอบถาม ถ้าไม่มีใช้ยอดจองจาก Master) · null = ไม่ทราบ */
  travelers: number | null;
  /** จำนวนผู้ตอบแบบสอบถาม (นับจริง · 0 เมื่อยังไม่มีแบบสอบถาม) */
  respondents: number;
  /** % การตอบ (คำนวณสด) · null = ไม่ทราบจำนวนผู้เดินทางจึงหารไม่ได้ */
  responseRatePct: number | null;

  scores: CategoryScores;
  overall: number | null;

  /** คำตอบรายฉบับ — ใช้ในหน้ารายละเอียด */
  responses: SurveyResponse[];
  /** ข้อเสนอแนะจากลูกค้า (เฉพาะที่มีข้อความ) */
  comments: { surveyResponseId: string; comment: string }[];
}

export interface BuildRowsInput {
  periods: TourPeriodMaster[];
  /** การมอบหมาย: periodId → หัวหน้าทัวร์ */
  assignments: { periodId: string; tourLeaderId: string }[];
  /** ชื่อหัวหน้าทัวร์สำหรับแสดงผล */
  leaderNameById: Map<string, string>;
  responsesByPeriod: Map<string, SurveyResponse[]>;
  travelerCountByPeriod: Map<string, number>;
  /** จำกัดเฉพาะหัวหน้าทัวร์คนนี้ (ใช้กับแท็บ "ผลแบบสอบถาม") */
  tourLeaderId?: string;
  /** นับเฉพาะกรุ๊ปที่เดินทางแล้ว (วันเดินทาง <= วันนี้) — "เดินทางจริง" ตามสเปก */
  travelledOnAsOf?: string;
  /**
   * วันที่ใช้ตัดสินว่าแถวไหน "เดินทางแล้ว" โดยไม่กรองแถวออก
   * ใช้กับแท็บ "ผลแบบสอบถาม" ที่สร้างแถวตั้งแต่มีงาน แล้วรอคะแนนมาเติมทีหลัง
   */
  markTravelledAsOf?: string;
}

/**
 * สร้างแถวจากการมอบหมายจริง — กรุ๊ปที่ไม่มีหัวหน้าทัวร์จะไม่ปรากฏในแท็บ "ผลแบบสอบถาม"
 * แต่ปรากฏใน "รายละเอียดกรุ๊ป" ได้ (เมื่อไม่ส่ง tourLeaderId)
 */
export function buildGroupScoreRows(input: BuildRowsInput): TourGroupScoreRow[] {
  const periodById = new Map(input.periods.map((p) => [p.internalId, p]));
  const asOf = input.markTravelledAsOf ?? input.travelledOnAsOf ?? null;
  const rows: TourGroupScoreRow[] = [];

  const makeRow = (period: TourPeriodMaster, tourLeaderId: string | null): TourGroupScoreRow => {
    const responses = input.responsesByPeriod.get(period.internalId) ?? [];
    const scores = responses.length > 0 ? categoryAverages(responses) : emptyCategoryScores();
    // จำนวนผู้ตอบเป็นค่านับจริงเสมอ (0 เมื่อยังไม่มีแบบสอบถาม) → แสดง "0/Pax · 0.00%" ไม่ใช่ "—"
    const respondents = responses.length;
    // ผู้เดินทาง: ไฟล์แบบสอบถามมาก่อน → ไม่มีก็ใช้ยอดจองจริงจาก Master
    const travelers = input.travelerCountByPeriod.get(period.internalId) ?? period.bookingCount ?? null;

    return {
      key: tourLeaderId ? `${period.internalId}::${tourLeaderId}` : period.internalId,
      periodId: period.internalId,
      groupCode: period.groupCode,
      programName: period.displayName,
      countryName: period.countryName,
      routeCode: routeCodeFromGroupCode(period.groupCode),
      departDate: period.startDate || null,
      returnDate: period.endDate || null,
      saleStatus: period.saleStatus,
      travelled: asOf ? Boolean(period.startDate) && period.startDate <= asOf : null,
      tourLeaderId,
      leaderName: tourLeaderId ? (input.leaderNameById.get(tourLeaderId) ?? tourLeaderId) : null,
      travelers,
      respondents,
      responseRatePct: responseRate(respondents, travelers),
      scores,
      overall: overallScore(scores),
      responses,
      comments: responses
        .filter((r) => r.comment && r.comment.trim())
        .map((r) => ({ surveyResponseId: r.surveyResponseId, comment: r.comment!.trim() })),
    };
  };

  if (input.tourLeaderId) {
    // ผลแบบสอบถาม — เฉพาะกรุ๊ปที่หัวหน้าทัวร์คนนี้ได้รับมอบหมาย
    for (const a of input.assignments) {
      if (a.tourLeaderId !== input.tourLeaderId) continue;
      const period = periodById.get(a.periodId);
      if (!period) continue; // พีเรียดหายจากต้นทาง — ไม่เดาข้อมูลแทน
      rows.push(makeRow(period, a.tourLeaderId));
    }
  } else {
    // รายละเอียดกรุ๊ป — ทุกกรุ๊ป (แนบหัวหน้าทัวร์ที่มอบหมายไว้ ถ้ามี)
    const leaderByPeriod = new Map(input.assignments.map((a) => [a.periodId, a.tourLeaderId]));
    for (const period of input.periods) {
      rows.push(makeRow(period, leaderByPeriod.get(period.internalId) ?? null));
    }
  }

  const cutoff = input.travelledOnAsOf;
  const result = cutoff ? rows.filter((r) => r.departDate !== null && r.departDate <= cutoff) : rows;

  // ค่าเริ่มต้น: วันเดินทางล่าสุดก่อน
  return result.sort((a, b) => (b.departDate ?? '').localeCompare(a.departDate ?? ''));
}

/* ------------------------------- ตัวกรอง ------------------------------- */

export interface GroupScoreFilters {
  country?: string;
  routeCode?: string;
  /** ค้นแบบ substring — ตรงกับ "ชื่อโปรแกรมทัวร์" หรือ "รหัสกรุ๊ป" อย่างใดอย่างหนึ่ง */
  keyword?: string;
  year?: string;
  /** เดือนที่เดินทาง '01'–'12' — เลือกได้หลายเดือน (ว่าง/ไม่ส่ง = ทั้งปี) */
  months?: string[];
  /** 'scored' = มีคะแนนแล้ว · 'unscored' = ยังไม่มีคะแนน */
  scoreState?: 'all' | 'scored' | 'unscored';
}

export function filterGroupScoreRows(rows: TourGroupScoreRow[], f: GroupScoreFilters): TourGroupScoreRow[] {
  const keyword = f.keyword?.trim().toLowerCase() ?? '';
  const months = f.months && f.months.length > 0 ? new Set(f.months) : null;
  return rows.filter((r) => {
    if (f.country && r.countryName !== f.country) return false;
    if (f.routeCode && r.routeCode !== f.routeCode) return false;
    if (keyword) {
      const haystack = `${r.groupCode} ${r.programName}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (f.year && (r.departDate ?? '').slice(0, 4) !== f.year) return false;
    if (months && !months.has((r.departDate ?? '').slice(5, 7))) return false;
    if (f.scoreState === 'scored' && r.overall === null) return false;
    if (f.scoreState === 'unscored' && r.overall !== null) return false;
    return true;
  });
}

/** ตัวเลือกของตัวกรอง — สร้างจากข้อมูลจริงที่มีในตาราง (ไม่ hard-code) */
export function groupScoreFilterOptions(rows: TourGroupScoreRow[]): {
  countries: string[]; routes: string[]; years: string[];
} {
  const countries = new Set<string>();
  const routes = new Set<string>();
  const years = new Set<string>();
  for (const r of rows) {
    if (r.countryName) countries.add(r.countryName);
    if (r.routeCode) routes.add(r.routeCode);
    const y = (r.departDate ?? '').slice(0, 4);
    if (y) years.add(y);
  }
  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    routes: [...routes].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort((a, b) => b.localeCompare(a)),
  };
}
