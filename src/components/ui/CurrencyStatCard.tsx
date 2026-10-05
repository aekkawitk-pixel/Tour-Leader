'use client';

/**
 * การ์ดสรุปยอดเงินหลายสกุล — ตัวเลขหลัก = จำนวนใบ · ใต้ลงมาเป็นรายการยอดแยกสกุล (ไม่แปลงเป็นบาท)
 *
 * ของจริงมีหลายสกุลมาก ต่อเป็นบรรทัดเดียวอ่านไม่ออก → เรียงบรรทัดละสกุล (บาทก่อน แล้วตามรหัสสกุล)
 * แสดง 3 สกุลแรก ที่เหลือพับไว้ "+ อีก N สกุล" กดดูครบได้ในการ์ด · สูงเท่ากันทุกใบตอนพับ
 */

import { useState } from 'react';
import { cx } from '@/components/ui/Primitives';
import { TONE_ZEGO_COLOR } from '@/lib/tone-tokens';

const PREVIEW = 3;
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CurrencyStatCard({
  label,
  count,
  unit = 'ใบ',
  totals,
  hint,
  tone = 'blue',
}: {
  label: string;
  count: number;
  unit?: string;
  totals: { amount: number; currency: string }[];
  hint?: string;
  tone?: 'blue' | 'green' | 'slate' | 'amber' | 'red' | 'violet';
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...totals].filter((t) => t.amount !== 0)
    .sort((a, b) => Number(b.currency === 'THB') - Number(a.currency === 'THB') || a.currency.localeCompare(b.currency));
  const shown = expanded ? sorted : sorted.slice(0, PREVIEW);
  const more = sorted.length - PREVIEW;
  const valueColor = { slate: 'zego-text', blue: 'zego-text-info', green: 'zego-text-success', amber: 'zego-text-warning', red: 'zego-text-danger', violet: '' }[tone];

  return (
    <div
      className="w-full rounded-xl border border-l-4 zego-border-color zego-surface-bg p-4 shadow-sm"
      style={{ borderLeftColor: TONE_ZEGO_COLOR[tone] }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="zego-text-tertiary text-xs font-medium">{label}</p>
        {sorted.length > 1 && <span className="text-[11px] zego-text-tertiary">{sorted.length} สกุล</span>}
      </div>
      <p className={cx('mt-1.5 text-2xl font-bold tabular-nums', valueColor)} style={tone === 'violet' ? { color: TONE_ZEGO_COLOR.violet } : undefined}>
        {count} <span className="text-sm font-medium">{unit}</span>
      </p>
      {sorted.length === 0 ? (
        <p className="mt-1 text-xs zego-text-tertiary">ไม่มียอด</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5 text-xs tabular-nums">
          {shown.map((t) => (
            <li key={t.currency} className="flex items-baseline justify-between gap-3">
              <span className="font-medium zego-text-secondary">{t.currency}</span>
              <span className="font-semibold zego-text">{money(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-[11px] font-medium zego-text-info hover:underline">
          {expanded ? 'ย่อ' : `+ อีก ${more} สกุล`}
        </button>
      )}
      {hint && <p className="zego-text-tertiary mt-1 text-xs">{hint}</p>}
    </div>
  );
}
