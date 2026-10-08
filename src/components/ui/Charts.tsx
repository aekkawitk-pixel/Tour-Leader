'use client';

/** กราฟแบบ SVG ล้วน — ไม่พึ่งไลบรารีภายนอก อ่านง่ายและมีตัวเลขกำกับเสมอ */

import { formatNumber } from '@/lib/format';
import { cx } from './Primitives';
import { EmptyState } from './Primitives';
import { TONE_ZEGO_COLOR } from '@/lib/tone-tokens';

export interface ChartDatum {
  label: string;
  value: number;
  /** สี hex */
  color?: string;
  /** ข้อความแสดงค่าแทนตัวเลขดิบ เช่น ฿12,000 */
  display?: string;
}

const DEFAULT_COLOR = '#2563eb';

/* ------------------------------- BarChart -------------------------------- */

export function BarChart({ data, unit = '' }: { data: ChartDatum[]; unit?: string }) {
  if (data.length === 0) {
    return <EmptyState title="ไม่มีข้อมูลในช่วงเวลาที่เลือก" />;
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2.5">
      {/* ป้ายกำกับซ้ำกันได้ (เช่น ชื่อคนซ้ำ) → ใช้ลำดับประกอบเป็น key */}
      {data.map((d, index) => (
        <li key={`${d.label}-${index}`} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
          <span className="zego-text-secondary truncate text-xs" title={d.label}>
            {d.label}
          </span>
          <span className="zego-surface-soft-bg h-5 overflow-hidden rounded">
            <span
              className="block h-full rounded transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: d.color ?? DEFAULT_COLOR,
              }}
            />
          </span>
          <span className="zego-text-secondary text-right text-xs font-semibold tabular-nums">
            {d.display ?? `${formatNumber(d.value)}${unit}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ DonutChart ------------------------------- */

export function DonutChart({ data, centerLabel }: { data: ChartDatum[]; centerLabel?: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return <EmptyState title="ไม่มีข้อมูล" />;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  // ตำแหน่งเริ่มต้นของแต่ละส่วน = ผลรวมสะสมของส่วนก่อนหน้า
  const arcs = data.map((d, index) => {
    const before = data.slice(0, index).reduce((sum, prev) => sum + prev.value, 0);
    return {
      ...d,
      dash: (d.value / total) * circumference,
      offset: (before / total) * circumference,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0 -rotate-90">
        {arcs.map((arc, index) => (
          <circle
            key={`${arc.label}-${index}`}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={arc.color ?? DEFAULT_COLOR}
            strokeWidth="22"
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>

      <ul className="flex-1 space-y-1.5">
        {centerLabel && <li className="zego-text mb-2 text-sm font-semibold">{centerLabel}</li>}
        {data.map((d, index) => (
          <li key={`${d.label}-${index}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: d.color ?? DEFAULT_COLOR }}
              aria-hidden="true"
            />
            <span className="zego-text-secondary flex-1">{d.label}</span>
            <span className="zego-text font-semibold tabular-nums">
              {d.display ?? formatNumber(d.value)}
            </span>
            <span className="zego-text-tertiary w-10 text-right tabular-nums">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ StatCard --------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  tone = 'slate',
  onClick,
  dense = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet';
  onClick?: () => void;
  /** จอเล็ก: การ์ดย่อ (ชื่อ + ตัวเลข ไม่มีคำอธิบาย) สำหรับวางหลายใบต่อแถว — จอ sm ขึ้นไปเหมือนเดิม */
  dense?: boolean;
}) {
  // เส้นสีคำ (border-left) ต่อโทน — ใช้ TONE_ZEGO_COLOR (currentColor-friendly) เหมือน Timeline dot
  // แทน border-l-{color} ของ Tailwind เดิม เพราะไม่มี class สำเร็จรูปสำหรับกรอบซ้ายที่ไล่สีตามโทนนี้
  const accentColor = TONE_ZEGO_COLOR[tone];

  const valueColor = {
    slate: 'zego-text',
    blue: 'zego-text-info',
    green: 'zego-text-success',
    amber: 'zego-text-warning',
    red: 'zego-text-danger',
    // violet ไม่มี class ตัวหนังสือสำเร็จรูปใน overrides.css (มีแค่ zego-badge--violet) — ใช้สี inline แทน
    violet: '',
  }[tone];

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx(
        'w-full rounded-xl border border-l-4 zego-border-color zego-surface-bg text-left shadow-sm',
        dense ? 'px-2.5 py-2 sm:p-4' : 'p-4',
        onClick && 'transition-shadow hover:shadow-md',
      )}
      style={{ borderLeftColor: accentColor }}
    >
      <p className={cx('zego-text-tertiary font-medium', dense ? 'line-clamp-2 text-[11px] leading-tight sm:text-xs' : 'text-xs')}>{label}</p>
      <p
        className={cx('font-bold tabular-nums', dense ? 'mt-0.5 text-lg sm:mt-1.5 sm:text-2xl' : 'mt-1.5 text-2xl', valueColor)}
        style={tone === 'violet' ? { color: accentColor } : undefined}
      >
        {value}
      </p>
      {hint && <p className={cx('zego-text-tertiary mt-1 text-xs', dense && 'hidden sm:block')}>{hint}</p>}
    </Wrapper>
  );
}
