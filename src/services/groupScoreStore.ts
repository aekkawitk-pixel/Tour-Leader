/**
 * Group Score Service — จุดเดียวที่ทุกหน้าเรียกใช้ "คำตอบแบบสอบถามกรุ๊ป"
 *
 * ทั้ง "รายละเอียดกรุ๊ป" และ "ผลแบบสอบถาม" อ่านผ่านไฟล์นี้เท่านั้น
 * → คะแนนที่เห็นทั้งสองที่มาจากชุดข้อมูลเดียวกันเสมอ (ไม่มีการเก็บซ้ำ)
 *
 * เปลี่ยนไปใช้ REST API: แก้เฉพาะไฟล์นี้ ส่วน UI/ตรรกะการคำนวณไม่ต้องแก้
 */

import {
  SURVEY_RESPONSES, GROUP_TRAVELER_COUNTS, SCORE_SCALE, SURVEY_SOURCE_FILE,
} from '@/data/scores/groupScores.seed';
import type { ScoreScale, SurveyResponse } from '@/data/scores/groupScoreTypes';

/** คำตอบทั้งหมด (ว่างเมื่อยังไม่นำเข้าไฟล์จริง) */
export function getSurveyResponses(): SurveyResponse[] {
  return SURVEY_RESPONSES;
}

/** คำตอบของพีเรียดหนึ่ง */
export function getResponsesByPeriodId(periodId: string): SurveyResponse[] {
  return SURVEY_RESPONSES.filter((r) => r.periodId === periodId);
}

/** จัดกลุ่มคำตอบตาม periodId — ใช้สร้างตารางทีเดียวโดยไม่วนซ้ำ */
export function groupResponsesByPeriod(): Map<string, SurveyResponse[]> {
  const map = new Map<string, SurveyResponse[]>();
  for (const r of SURVEY_RESPONSES) {
    const list = map.get(r.periodId);
    if (list) list.push(r);
    else map.set(r.periodId, [r]);
  }
  return map;
}

/** จำนวนผู้เดินทางที่ต้นทางระบุมาเอง (ถ้ามี) — ไม่มี → ใช้ยอดจองจาก Tour Period Master */
export function getTravelerCountMap(): Map<string, number> {
  return new Map(GROUP_TRAVELER_COUNTS.map((g) => [g.periodId, g.travelers]));
}

/** สเกลคะแนนของแบบสอบถาม */
export function getScoreScale(): ScoreScale {
  return SCORE_SCALE;
}

/** มีข้อมูลแบบสอบถามในระบบแล้วหรือยัง — ใช้แสดงคำอธิบายในหน้าจอ */
export function hasSurveyData(): boolean {
  return SURVEY_RESPONSES.length > 0;
}

/** ชื่อไฟล์ต้นทาง (null = ยังไม่นำเข้า) */
export function getSurveySourceFile(): string | null {
  return SURVEY_SOURCE_FILE;
}
