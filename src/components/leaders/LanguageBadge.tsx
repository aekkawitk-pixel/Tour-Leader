'use client';

/**
 * แสดงระดับภาษาให้เข้าใจง่าย — Badge รหัสระดับ (ตามมาตรฐานของภาษานั้น) + คำอธิบายภาษาไทย
 * ใช้ร่วมกันทุกที่ (ตาราง / รายละเอียด / ฟอร์ม) เพื่อรูปแบบเดียวกัน
 *   • ไม่สื่อความหมายด้วยสีเพียงอย่างเดียว — มีรหัส + ข้อความกำกับเสมอ
 *   • แต่ละภาษาใช้มาตรฐานของตัวเอง (CEFR/HSK/JLPT/TOPIK/GENERAL) — ดู languageStandards.ts
 */

import { cx } from '@/components/ui/Primitives';
import { NATIVE_LANGUAGE_TONE, languageLevelTone } from '@/lib/labels';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';
import { LANGUAGE_STANDARD_LABEL, maxRankOf } from '@/data/leaders/languageStandards';
import type { LanguageSkill } from '@/types';

type LevelInput = Pick<LanguageSkill, 'isNativeLanguage' | 'standard' | 'levelCode' | 'levelName' | 'levelRank'>;

/** ข้อความ tooltip เช่น "JLPT N2 — ใช้งานได้ดี" หรือ "ภาษาแม่" (GENERAL ไม่ใส่ชื่อมาตรฐานนำหน้า) */
export function languageLevelTitle(skill: LevelInput): string {
  if (skill.isNativeLanguage) return 'ภาษาแม่';
  const standardLabel = LANGUAGE_STANDARD_LABEL[skill.standard];
  const prefix = standardLabel === 'ทั่วไป' ? '' : `${standardLabel} `;
  return `${prefix}${skill.levelCode} — ${skill.levelName}`;
}

/** Badge รหัสระดับ (มีข้อความกำกับเสมอ) + คำอธิบายไทยต่อท้าย */
export function LanguageLevelTag({
  skill,
  showDesc = true,
  size = 'sm',
}: {
  skill: LevelInput;
  /** แสดงคำอธิบายไทยต่อท้าย Badge */
  showDesc?: boolean;
  size?: 'sm' | 'md';
}) {
  const tone = skill.isNativeLanguage ? NATIVE_LANGUAGE_TONE : languageLevelTone(skill.levelRank ?? 0, maxRankOf(skill.standard));
  const code = skill.isNativeLanguage ? 'ภาษาแม่' : (skill.levelCode ?? '—');
  return (
    <span className="inline-flex items-center gap-1.5" title={languageLevelTitle(skill)}>
      <span className={cx('zego-badge font-semibold', size === 'sm' && 'zego-badge--sm', TONE_ZEGO_BADGE[tone])}>
        {code}
      </span>
      {showDesc && !skill.isNativeLanguage && (
        <span className={cx('zego-text-secondary', size === 'sm' ? 'text-xs' : 'text-sm')}>{skill.levelName}</span>
      )}
    </span>
  );
}

/**
 * ชิปภาษาแบบย่อสำหรับพื้นที่จำกัด (เช่น ตาราง) — "อังกฤษ N2" หรือ "ไทย ภาษาแม่"
 * hover แสดงชื่อภาษาเต็ม + มาตรฐาน + ระดับ + คำอธิบายไทย
 */
export function LanguageChip({
  language,
  skill,
}: {
  language: string;
  skill: LevelInput;
}) {
  const tone = skill.isNativeLanguage ? NATIVE_LANGUAGE_TONE : languageLevelTone(skill.levelRank ?? 0, maxRankOf(skill.standard));
  const code = skill.isNativeLanguage ? 'ภาษาแม่' : (skill.levelCode ?? '—');
  return (
    <span
      title={`${language} · ${languageLevelTitle(skill)}`}
      className={cx('zego-badge max-w-full', TONE_ZEGO_BADGE[tone])}
    >
      <span className="truncate">{language}</span>
      <span className="shrink-0 font-semibold">{code}</span>
    </span>
  );
}
