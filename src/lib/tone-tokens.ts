/**
 * แผนที่ "โทนสถานะ" (ToneKey จาก @/lib/labels) → class/สีของ zego-design-system
 *
 * zego-design-system.css มี badge สำเร็จรูปแค่ 4 โทน (success/warning/info/danger) แต่ระบบนี้
 * ใช้ ToneKey 10 โทนจริงเพื่อแยกสถานะ/ระดับที่ต่างกันให้เห็นชัด (เช่น languageLevelTone ไล่เฉด
 * slate→sky→blue→indigo→violet→teal 6 ขั้น) ถ้ายุบเหลือ 4 โทนของ zego สถานะที่เคยแยกสีกันได้
 * จะดูเหมือนกันไปหมด — จึงคง 10 โทนไว้ครบ: 4 โทนที่ตรงกับของ zego ใช้ modifier เดิมของ zego ตรง ๆ
 * ส่วนอีก 6 โทนเพิ่ม modifier ใหม่ในสไตล์เดียวกัน (พาสเทล ตัวหนังสือเข้ม กรอบสีอ่อน) ไว้ที่
 * src/styles/zego-overrides.css แทนการเขียน style เอง
 */

import type { ToneKey } from './labels';

/** class ต่อท้าย .zego-badge — ใช้กับ StatusBadge/Pill/Callout */
export const TONE_ZEGO_BADGE: Record<ToneKey, string> = {
  slate: 'zego-badge--slate',
  blue: 'zego-badge--info',
  sky: 'zego-badge--sky',
  indigo: 'zego-badge--indigo',
  green: 'zego-badge--success',
  amber: 'zego-badge--warning',
  orange: 'zego-badge--orange',
  red: 'zego-badge--danger',
  violet: 'zego-badge--violet',
  teal: 'zego-badge--teal',
};

/** สี CSS ต่อโทน (currentColor-friendly) — ใช้กับจุด/เส้นทึบ เช่น Timeline dot, ไอคอน Callout */
export const TONE_ZEGO_COLOR: Record<ToneKey, string> = {
  slate: 'var(--zego-text-tertiary)',
  blue: 'var(--zego-info)',
  sky: '#0f7490',
  indigo: '#4c3fa6',
  green: 'var(--zego-success)',
  amber: 'var(--zego-warning)',
  orange: '#b5570f',
  red: 'var(--zego-danger)',
  violet: '#7d3aa6',
  teal: '#0f8073',
};
