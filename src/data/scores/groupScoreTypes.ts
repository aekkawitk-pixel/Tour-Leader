/**
 * คะแนนแบบสอบถามระดับกรุ๊ป — โครงสร้างข้อมูลกลาง (ใช้ร่วมทั้ง "รายละเอียดกรุ๊ป" และ "ผลแบบสอบถาม")
 *
 * หลักการ (สำคัญ):
 *   • เก็บ "คำตอบแบบสอบถามรายฉบับ" ชุดเดียว — คะแนนเฉลี่ยทุกระดับคำนวณจากคำตอบนี้เสมอ
 *     ห้ามเก็บคะแนนสรุปซ้ำอีกชุด (กันข้อมูล 2 ที่ไม่ตรงกัน)
 *   • เชื่อมกับระบบอื่นด้วย periodId (Tour Period Master) · groupCode · tourLeaderId · surveyResponseId
 *   • หัวข้อที่ไม่มีคำตอบ = ไม่มีคะแนน (null) ห้ามตีความเป็น 0
 */

/** หัวข้อคะแนนในแบบสอบถาม (ลำดับตามที่แสดงในตาราง) */
export type ScoreCategory = 'TL' | 'GUIDE' | 'PROGRAM' | 'HOTEL' | 'BUS' | 'DRIVER' | 'AIRLINE';

export const SCORE_CATEGORIES: ScoreCategory[] = ['TL', 'GUIDE', 'PROGRAM', 'HOTEL', 'BUS', 'DRIVER', 'AIRLINE'];

/** ป้ายหัวคอลัมน์ — ใช้ตัวเดียวกันทุกตาราง */
export const SCORE_CATEGORY_LABEL: Record<ScoreCategory, string> = {
  TL: 'TL',
  GUIDE: 'Guide',
  PROGRAM: 'Program',
  HOTEL: 'Hotel',
  BUS: 'Bus',
  DRIVER: 'Driver',
  AIRLINE: 'Airline',
};

/** คำอธิบายเต็ม (ใช้ใน Drawer / tooltip) */
export const SCORE_CATEGORY_FULL: Record<ScoreCategory, string> = {
  TL: 'หัวหน้าทัวร์',
  GUIDE: 'ไกด์ท้องถิ่น',
  PROGRAM: 'รายการทัวร์',
  HOTEL: 'ที่พัก',
  BUS: 'รถโค้ช',
  DRIVER: 'พนักงานขับรถ',
  AIRLINE: 'สายการบิน',
};

/** คำตอบ 1 หัวข้อในแบบสอบถาม 1 ฉบับ */
export interface SurveyAnswer {
  category: ScoreCategory;
  /** คะแนนตามสเกลของแบบสอบถามต้นทาง */
  score: number;
}

/** แบบสอบถาม 1 ฉบับ (1 ผู้เดินทาง) */
export interface SurveyResponse {
  surveyResponseId: string;
  /** อ้าง Tour Period Master */
  periodId: string;
  groupCode: string;
  answers: SurveyAnswer[];
  /** ข้อเสนอแนะ/ความคิดเห็นจากลูกค้า */
  comment: string | null;
  submittedAt: string | null; // ISO
}

/**
 * จำนวนผู้เดินทางจริงของกรุ๊ป (เมื่อไฟล์ต้นทางระบุมาเอง)
 * ถ้าไม่มี ระบบจะใช้ยอดจองจาก Tour Period Master แทน — ไม่คาดเดาตัวเลขเอง
 */
export interface GroupTravelerCount {
  periodId: string;
  travelers: number;
}

/** ค่าสเกลคะแนนของแบบสอบถาม (ใช้แสดงกำกับใน Drawer) */
export interface ScoreScale {
  max: number;
  label: string;
}
