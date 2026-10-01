'use client';

/**
 * ป้ายบอกความพร้อมของเอกสารสำหรับกรุ๊ปหนึ่ง — ใช้ในหน้าจอจัดหัวหน้าทัวร์
 *
 * แยกสามสถานะให้ชัด (สำคัญ — ถ้ารวมกันจะเตือนผิดจนคนเลิกสนใจ):
 *   • แดง   = ตรวจแล้วไม่ผ่าน มีข้อที่ต้องแก้ก่อนออกเดินทาง
 *   • เหลือง = เดินทางได้ แต่มีข้อควรตรวจก่อน
 *   • เขียว  = ผ่านทุกเกณฑ์
 *   • เทา   = ยังไม่มีข้อมูลเอกสารให้ตรวจ (ไม่ใช่ "ไม่ผ่าน")
 *
 * รายละเอียดทุกข้ออยู่ใน title เพื่อให้เอาเมาส์ชี้แล้วอ่านได้ทันทีโดยไม่ต้องเปิดหน้าอื่น
 */

import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import type { LeaderReadiness } from '@/lib/useDocumentReadiness';

type Tone = 'ok' | 'warn' | 'block' | 'unknown';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'zego-badge--success',
  warn: 'zego-badge--warning',
  block: 'zego-badge--danger',
  unknown: 'zego-badge--slate',
};

const TONE_ICON: Record<Tone, 'check' | 'warning' | 'file'> = {
  ok: 'check',
  warn: 'warning',
  block: 'warning',
  unknown: 'file',
};

function toneOf(readiness: LeaderReadiness): Tone {
  if (!readiness.hasData) return 'unknown';
  if (readiness.result.blocking.length > 0) return 'block';
  if (readiness.result.warning.length > 0) return 'warn';
  return 'ok';
}

function labelOf(readiness: LeaderReadiness, tone: Tone, compact: boolean): string {
  if (tone === 'unknown') return compact ? 'ไม่มีข้อมูลเอกสาร' : 'ยังไม่มีข้อมูลเอกสาร';
  if (tone === 'block') return `เอกสารไม่พร้อม ${readiness.result.blocking.length}`;
  if (tone === 'warn') return `ควรตรวจ ${readiness.result.warning.length}`;
  return 'เอกสารพร้อม';
}

/** ข้อความเต็มทุกข้อ — ใช้เป็น tooltip */
function detailOf(readiness: LeaderReadiness, tone: Tone): string {
  if (tone === 'unknown') {
    return 'ยังไม่มีหนังสือเดินทางหรือเอกสารอื่นบันทึกไว้ในระบบ จึงยังตรวจความพร้อมไม่ได้';
  }
  if (readiness.result.issues.length === 0) return 'เอกสารผ่านทุกเกณฑ์สำหรับกรุ๊ปนี้';
  return readiness.result.issues
    .map((i) => `${i.severity === 'blocking' ? '•' : '–'} ${i.message}`)
    .join('\n');
}

export function DocumentReadinessBadge({
  readiness,
  compact = false,
  className,
}: {
  readiness: LeaderReadiness;
  /** แบบย่อ — ใช้ในตารางเปรียบเทียบที่พื้นที่จำกัด */
  compact?: boolean;
  className?: string;
}) {
  const tone = toneOf(readiness);

  return (
    <span
      title={detailOf(readiness, tone)}
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-medium border',
        compact ? 'text-[11px]' : 'text-xs',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon name={TONE_ICON[tone]} className="h-3 w-3 shrink-0" />
      <span className="truncate">{labelOf(readiness, tone, compact)}</span>
    </span>
  );
}
