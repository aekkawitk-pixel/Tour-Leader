/**
 * มาตรฐานวัดระดับภาษา — แต่ละภาษาใช้มาตรฐานของตัวเอง (ดูที่มาที่ types/index.ts LanguageStandard)
 * ไฟล์นี้เป็นชั้นข้อมูลบริสุทธิ์ — รายการระดับต่อมาตรฐาน + ตารางภาษา→มาตรฐาน + ฟังก์ชันช่วยค้นหา
 *
 * ⚠️ ห้าม import จาก modules/ หรือ components/ — ชั้น data ต้องไม่ผูกกับชั้นบน
 */

import type { LanguageStandard } from '@/types';

export interface LanguageLevelOption {
  code: string;
  name: string;
  /** อันดับภายในมาตรฐานนี้ (1 = ต่ำสุด) — เทียบข้ามมาตรฐานกันไม่ได้ */
  rank: number;
}

const CEFR_LEVELS: LanguageLevelOption[] = [
  { code: 'A1', name: 'เริ่มต้น', rank: 1 },
  { code: 'A2', name: 'สื่อสารพื้นฐานได้', rank: 2 },
  { code: 'B1', name: 'ใช้งานทั่วไปได้', rank: 3 },
  { code: 'B2', name: 'ใช้งานได้ดี', rank: 4 },
  { code: 'C1', name: 'ใช้งานระดับสูง', rank: 5 },
  { code: 'C2', name: 'เชี่ยวชาญ', rank: 6 },
];

const HSK_LEVELS: LanguageLevelOption[] = [
  { code: 'HSK1', name: 'ระดับเริ่มต้น', rank: 1 },
  { code: 'HSK2', name: 'ระดับพื้นฐาน', rank: 2 },
  { code: 'HSK3', name: 'สื่อสารในชีวิตประจำวันได้', rank: 3 },
  { code: 'HSK4', name: 'ใช้งานทั่วไปได้ดี', rank: 4 },
  { code: 'HSK5', name: 'ใช้งานระดับสูง', rank: 5 },
  { code: 'HSK6', name: 'ใช้งานได้คล่อง', rank: 6 },
  { code: 'HSK7', name: 'ระดับสูง', rank: 7 },
  { code: 'HSK8', name: 'ระดับสูงมาก', rank: 8 },
  { code: 'HSK9', name: 'เชี่ยวชาญ', rank: 9 },
];

const JLPT_LEVELS: LanguageLevelOption[] = [
  { code: 'N5', name: 'ระดับเริ่มต้น', rank: 1 },
  { code: 'N4', name: 'ระดับพื้นฐาน', rank: 2 },
  { code: 'N3', name: 'ระดับกลาง', rank: 3 },
  { code: 'N2', name: 'ใช้งานได้ดี', rank: 4 },
  { code: 'N1', name: 'ระดับสูง', rank: 5 },
];

const TOPIK_LEVELS: LanguageLevelOption[] = [
  { code: 'LEVEL1', name: 'ระดับเริ่มต้น', rank: 1 },
  { code: 'LEVEL2', name: 'ระดับพื้นฐาน', rank: 2 },
  { code: 'LEVEL3', name: 'ระดับกลาง', rank: 3 },
  { code: 'LEVEL4', name: 'ใช้งานได้ดี', rank: 4 },
  { code: 'LEVEL5', name: 'ระดับสูง', rank: 5 },
  { code: 'LEVEL6', name: 'เชี่ยวชาญ', rank: 6 },
];

/** ภาษาที่ยังไม่มีมาตรฐานเฉพาะในระบบ — ใช้ระดับกลางแทน */
const GENERAL_LEVELS: LanguageLevelOption[] = [
  { code: 'G1', name: 'เริ่มต้น', rank: 1 },
  { code: 'G2', name: 'พื้นฐาน', rank: 2 },
  { code: 'G3', name: 'ปานกลาง', rank: 3 },
  { code: 'G4', name: 'ดี', rank: 4 },
  { code: 'G5', name: 'ดีมาก', rank: 5 },
  { code: 'G6', name: 'เชี่ยวชาญ', rank: 6 },
];

export const LANGUAGE_LEVELS_BY_STANDARD: Record<LanguageStandard, LanguageLevelOption[]> = {
  CEFR: CEFR_LEVELS,
  HSK: HSK_LEVELS,
  JLPT: JLPT_LEVELS,
  TOPIK: TOPIK_LEVELS,
  GENERAL: GENERAL_LEVELS,
};

/** ป้ายชื่อมาตรฐาน — ใช้แสดงเป็น badge เช่น [CEFR] [HSK] (GENERAL ไม่มีป้ายมาตรฐานที่เป็นศัพท์เทคนิค) */
export const LANGUAGE_STANDARD_LABEL: Record<LanguageStandard, string> = {
  CEFR: 'CEFR',
  HSK: 'HSK',
  JLPT: 'JLPT',
  TOPIK: 'TOPIK',
  GENERAL: 'ทั่วไป',
};

/**
 * ภาษา (รหัส Master Data เช่น EN/JA) → มาตรฐานที่ใช้วัดระดับ
 * ภาษาที่ไม่อยู่ในตารางนี้ (รวม 'OTHER' และภาษาที่ระบุเอง) ใช้ GENERAL โดยอัตโนมัติ
 */
export const LANGUAGE_STANDARD_BY_CODE: Record<string, LanguageStandard> = {
  EN: 'CEFR',
  FR: 'CEFR',
  DE: 'CEFR',
  ES: 'CEFR',
  ZH: 'HSK',
  JA: 'JLPT',
  KO: 'TOPIK',
};

/** ภาษาหลักที่ให้เลือกก่อน (มีมาตรฐานวัดระดับเฉพาะของตัวเอง) — ภาษาอื่นเลือกผ่าน "อื่น ๆ (ระบุเอง)" */
export const MAIN_LANGUAGE_CODES = ['EN', 'ZH', 'JA', 'KO'] as const;

export function standardForLanguageCode(languageCode: string): LanguageStandard {
  return LANGUAGE_STANDARD_BY_CODE[languageCode] ?? 'GENERAL';
}

/**
 * ค่า standard ที่มาถึงฟังก์ชันเหล่านี้อาจมาจาก localStorage ของเบราว์เซอร์ผู้ใช้จริง (ข้อมูลเก่าค้าง /
 * แก้ไฟล์นอกระบบ) — TypeScript รับประกันได้แค่ตอน compile ไม่ได้รับประกันค่าจริงตอน runtime
 * จึงกันไว้ด้วย GENERAL เป็นค่า fallback แทนที่จะปล่อยให้พังทั้งหน้า (undefined.length)
 */
function levelsFor(standard: LanguageStandard): LanguageLevelOption[] {
  return LANGUAGE_LEVELS_BY_STANDARD[standard] ?? GENERAL_LEVELS;
}

export function levelsForStandard(standard: LanguageStandard): LanguageLevelOption[] {
  return levelsFor(standard);
}

export function levelOption(standard: LanguageStandard, levelCode: string): LanguageLevelOption | undefined {
  return levelsFor(standard).find((l) => l.code === levelCode);
}

/** อันดับสูงสุดที่มาตรฐานนี้มี — ใช้ทำแถบ/สัดส่วนคร่าว ๆ เท่านั้น (ห้ามเทียบ rank ตรง ๆ ข้ามมาตรฐาน) */
export function maxRankOf(standard: LanguageStandard): number {
  const levels = levelsFor(standard);
  return levels[levels.length - 1].rank;
}
