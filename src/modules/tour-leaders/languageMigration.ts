/**
 * แปลง/ทำให้เป็นมาตรฐาน (normalize) ข้อมูลภาษาให้เข้ากับโครงสร้างปัจจุบัน
 * (languageCode/languageName/standard/levelCode/levelName/levelRank/isNativeLanguage)
 *
 * รองรับข้อมูลเดิม 2 รุ่น:
 *   • รุ่นก่อนหน้า — CEFR ตัวเดียวใช้กับทุกภาษา (overall/listening/…/language)
 *   • รุ่นก่อนหน้านั้นอีก — สเกล 6 ขั้น (basic/working/…)
 * แปลงเป็นมาตรฐานที่ถูกต้องของแต่ละภาษา (CEFR/HSK/JLPT/TOPIK/GENERAL) โดยเทียบสัดส่วน
 * อันดับ CEFR เดิม (1-6) ไปยังอันดับของมาตรฐานใหม่ — ไม่ทำข้อมูลสูญหาย แค่ปัดเข้าระดับที่ใกล้เคียงที่สุด
 *
 * ⚠️ ฟังก์ชันบริสุทธิ์ ไม่มี side-effect และไม่ใช้ Date.now()/random
 *    (ปลอดภัยกับ SSR/hydration — id ของ record ใช้ id เดิมของภาษานั้น)
 */

import { masterData } from '@/data/master';
import {
  levelOption,
  levelsForStandard,
  maxRankOf,
  standardForLanguageCode,
} from '@/data/leaders/languageStandards';
import type { LanguageSkill } from '@/types';

/** ค่าดิบที่ยอมรับได้ — อาจเป็นรูปแบบเดิม (language/overall) หรือรูปแบบปัจจุบันก็ได้ */
type RawLanguageSkill = Partial<LanguageSkill> & {
  language?: string;
  overall?: string;
};

const NAME_TO_CODE = new Map(masterData.languages.map((l) => [l.name, l.code]));

/** เดารหัสภาษาจากชื่อ — ใช้เมื่อข้อมูลเดิมไม่มี languageCode เก็บไว้ */
function guessLanguageCode(name: string): string {
  return NAME_TO_CODE.get(name) ?? 'OTHER';
}

const LEGACY_LEVEL_TO_CEFR_RANK: Record<string, number> = {
  a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6,
  basic: 2, conversational: 3, working: 4, fluent: 5, near_native: 6,
};

/** แปลงค่าระดับเดิม (CEFR หรือสเกล 6 ขั้น) → อันดับ CEFR (1-6) · คืน null เมื่อไม่มีข้อมูล/เป็นภาษาแม่ */
function legacyOverallToCefrRank(value: unknown): number | null {
  if (typeof value !== 'string' || !value || value === 'native') return null;
  return LEGACY_LEVEL_TO_CEFR_RANK[value.toLowerCase()] ?? null;
}

/** ทำให้ LanguageSkill หนึ่งรายการเป็นมาตรฐานปัจจุบัน — ยอมรับข้อมูลรูปแบบเดิมได้ทั้งหมด */
export function migrateLanguageSkill(raw: RawLanguageSkill): LanguageSkill {
  const languageName = raw.languageName ?? raw.language ?? '';
  const languageCode = raw.languageCode || guessLanguageCode(languageName) || 'OTHER';
  const standard = standardForLanguageCode(languageCode);

  const isNativeLanguage = raw.isNativeLanguage ?? raw.overall === 'native';

  let levelCode: string | null = null;
  let levelName: string | null = null;
  let levelRank: number | null = null;

  if (!isNativeLanguage) {
    // มีรหัสระดับของมาตรฐานนี้อยู่แล้ว (ข้อมูลรุ่นปัจจุบัน) — ใช้ตรง ๆ
    const existing = raw.levelCode ? levelOption(standard, raw.levelCode) : undefined;
    if (existing) {
      levelCode = existing.code;
      levelName = existing.name;
      levelRank = existing.rank;
    } else {
      // ข้อมูลเดิม (CEFR หรือสเกล 6 ขั้น) — เทียบสัดส่วนอันดับ CEFR (1-6) ไปยังมาตรฐานที่ถูกต้องของภาษานี้
      const cefrRank = legacyOverallToCefrRank(raw.overall) ?? legacyOverallToCefrRank(raw.levelCode ?? undefined);
      const targetMax = maxRankOf(standard);
      const rank = cefrRank !== null
        ? Math.min(targetMax, Math.max(1, Math.round((cefrRank / 6) * targetMax)))
        : 1; // ไม่มีข้อมูลระดับเลย — ตั้งค่าเริ่มต้นเป็นระดับต่ำสุด กันฟิลด์ required ว่าง
      const opt = levelsForStandard(standard).find((l) => l.rank === rank) ?? levelsForStandard(standard)[0];
      levelCode = opt.code;
      levelName = opt.name;
      levelRank = opt.rank;
    }
  }

  return {
    id: raw.id ?? '',
    languageCode,
    languageName: languageName || languageCode,
    isNativeLanguage,
    standard,
    levelCode,
    levelName,
    levelRank,
  };
}

/** แปลงทั้งลิสต์ภาษาของหัวหน้าทัวร์หนึ่งคน */
export function migrateLanguages(languages: RawLanguageSkill[] | undefined): LanguageSkill[] {
  if (!Array.isArray(languages)) return [];
  return languages.map(migrateLanguageSkill);
}
