/**
 * การคำนวณคะแนนกรุ๊ป (§3/§4/§5-11) — ตรรกะล้วน ทดสอบได้
 *
 * กฎที่ต้องไม่พลาด:
 *   • หัวข้อที่ไม่มีคำตอบ → null (แสดง "—") ห้ามคืน 0 เพราะจะอ่านว่าได้คะแนนศูนย์
 *   • คะแนนรวม = เฉลี่ยจาก "หัวข้อที่ถูกประเมินจริง" เท่านั้น (ไม่นับหัวข้อที่ไม่มีคำตอบเป็น 0)
 *   • เปอร์เซ็นต์การตอบคำนวณสดเสมอ ห้ามใช้ค่าคงที่
 */

import {
  SCORE_CATEGORIES,
  type ScoreCategory, type SurveyResponse,
} from '@/data/scores/groupScoreTypes';

/** คะแนนรายหัวข้อของกรุ๊ป (null = ไม่มีการประเมินหัวข้อนั้น) */
export type CategoryScores = Record<ScoreCategory, number | null>;

/** ค่าเริ่มต้น: ทุกหัวข้อยังไม่มีคะแนน */
export function emptyCategoryScores(): CategoryScores {
  return SCORE_CATEGORIES.reduce((acc, c) => { acc[c] = null; return acc; }, {} as CategoryScores);
}

/**
 * คะแนนเฉลี่ยรายหัวข้อจากคำตอบทุกฉบับของกรุ๊ป
 * หัวข้อที่ไม่มีใครตอบ → null
 */
export function categoryAverages(responses: SurveyResponse[]): CategoryScores {
  const sum = {} as Record<ScoreCategory, number>;
  const count = {} as Record<ScoreCategory, number>;

  for (const res of responses) {
    for (const a of res.answers) {
      if (!SCORE_CATEGORIES.includes(a.category)) continue;
      if (!Number.isFinite(a.score)) continue; // ข้อมูลเสีย → ไม่นับ (ไม่เดาแทน)
      sum[a.category] = (sum[a.category] ?? 0) + a.score;
      count[a.category] = (count[a.category] ?? 0) + 1;
    }
  }

  const out = emptyCategoryScores();
  for (const c of SCORE_CATEGORIES) {
    if (count[c] > 0) out[c] = sum[c] / count[c];
  }
  return out;
}

/**
 * คะแนนรวมของกรุ๊ป = เฉลี่ยของหัวข้อที่มีคะแนนจริง
 * ไม่มีหัวข้อใดถูกประเมินเลย → null
 */
export function overallScore(scores: CategoryScores): number | null {
  const values = SCORE_CATEGORIES.map((c) => scores[c]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * เปอร์เซ็นต์การตอบแบบสอบถาม = ผู้ตอบ ÷ ผู้เดินทางทั้งหมด × 100
 * ไม่ทราบจำนวนผู้เดินทาง หรือเป็น 0 → null (หารไม่ได้)
 */
export function responseRate(respondents: number | null, travelers: number | null): number | null {
  if (respondents === null || travelers === null) return null;
  if (travelers <= 0) return null;
  return (respondents / travelers) * 100;
}

/** คะแนนแสดงทศนิยม 2 ตำแหน่ง · ไม่มีข้อมูล → "—" (ห้ามแสดง 0.00) */
export function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

/** เปอร์เซ็นต์ทศนิยม 2 ตำแหน่ง · ไม่มีข้อมูล → "—" */
export function formatRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

/** สัดส่วนผู้ตอบ/ผู้เดินทาง เช่น "7/19" · ไม่มีผู้ตอบ → "—" */
export function formatRespondents(respondents: number | null, travelers: number | null): string {
  if (respondents === null) return '—';
  return `${respondents}/${travelers ?? '—'}`;
}

/**
 * รหัสเส้นทางของกรุ๊ป — ส่วนหน้าของ Group Code (เช่น CKG-260801A-HU → CKG)
 * เป็นการอ่านจากรหัสจริง ไม่ใช่การกำหนดค่าเอง · รูปแบบไม่ตรง → null
 */
export function routeCodeFromGroupCode(groupCode: string): string | null {
  const head = groupCode.trim().toUpperCase().split('-')[0];
  return /^[A-Z]{3}$/.test(head) ? head : null;
}
