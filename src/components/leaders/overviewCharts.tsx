'use client';

/**
 * กราฟ interactive สำหรับหน้า "ภาพรวมหัวหน้าทัวร์" — SVG/CSS ล้วน ไม่พึ่งไลบรารี
 *   • StatusDonut  — Donut สถานะ (เลขรวมกลางวง · hover tooltip · กด slice เพื่อกรอง)
 *   • RankBarChart — Horizontal bar (ภาษา/ประเทศ/ประสบการณ์) กดแท่งเพื่อกรอง · ชื่ออ่านครบ
 *
 * กติกา (dataviz + ข้อกำหนด):
 *   • ไม่มี scroll ภายใน card · tooltip ไม่ถูกตัด (container overflow-visible)
 *   • กดผ่านสัมผัสได้ · แท่ง/สไลซ์ที่เลือกไฮไลต์ · single hue สำหรับ bar
 */

import { useState } from 'react';
import { cx } from '@/components/ui/Primitives';
import { EmptyState } from '@/components/ui/Primitives';
import { formatNumber } from '@/lib/format';

const BAR_HUE = '#2563eb';

/* --------------------------------- Donut --------------------------------- */

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function StatusDonut({
  slices,
  selectedKey,
  onSelect,
}: {
  slices: DonutSlice[];
  /** key ที่เลือกอยู่ (ไฮไลต์) */
  selectedKey?: string | null;
  onSelect: (slice: DonutSlice) => void;
}) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) return <EmptyState title="ไม่มีข้อมูลสถานะ" />;

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const arcs = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((sum, p) => sum + p.value, 0);
    return {
      ...s,
      dash: (s.value / total) * circumference,
      offset: (before / total) * circumference,
    };
  });

  const hoveredSlice = hover ? slices.find((s) => s.key === hover.key) : null;

  return (
    <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
      <div
        className="relative shrink-0"
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
          {arcs.map((arc) => {
            const dim = selectedKey != null && selectedKey !== arc.key;
            return (
              <circle
                key={arc.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={selectedKey === arc.key ? 26 : 22}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                className={cx('cursor-pointer transition-opacity', dim && 'opacity-30')}
                onClick={() => onSelect(arc)}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ key: arc.key, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
              />
            );
          })}
        </svg>
        {/* เลขรวมกลางวง */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums zego-text">{formatNumber(total)}</span>
          <span className="text-[11px] zego-text-tertiary">คน</span>
        </div>
        {/* tooltip */}
        {hover && hoveredSlice && (
          <div
            className="pointer-events-none absolute z-40 whitespace-nowrap rounded-lg bg-[var(--zego-text)] px-2.5 py-1.5 text-xs text-[var(--zego-surface)] shadow-lg"
            style={{ left: hover.x + 10, top: hover.y + 10 }}
          >
            <span className="font-semibold">{hoveredSlice.label}</span> · {formatNumber(hoveredSlice.value)} คน ·{' '}
            {Math.round((hoveredSlice.value / total) * 100)}%
          </div>
        )}
      </div>

      {/* legend (กดได้เช่นกัน) */}
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((s) => {
          const active = selectedKey === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors border border-transparent',
                  'zego-hover-surface',
                  active && 'zego-selected-tint zego-selected-border',
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-left zego-text-secondary">{s.label}</span>
                <span className="font-semibold tabular-nums zego-text">{formatNumber(s.value)}</span>
                <span className="w-9 text-right tabular-nums zego-text-tertiary">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ RankBarChart ----------------------------- */

export interface RankItem {
  key: string;
  label: string;
  value: number;
}

export function RankBarChart({
  items,
  selectedKeys = [],
  onSelect,
  unit = 'คน',
  initialLimit = 10,
  color = BAR_HUE,
  emptyLabel = 'ไม่มีข้อมูล',
}: {
  items: RankItem[];
  selectedKeys?: string[];
  onSelect: (item: RankItem) => void;
  unit?: string;
  /** แสดงกี่รายการก่อนกด "ดูทั้งหมด" (0 = แสดงทั้งหมดเสมอ) */
  initialLimit?: number;
  color?: string;
  emptyLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return <EmptyState title={emptyLabel} />;

  const max = Math.max(...items.map((i) => i.value), 1);
  const shown = initialLimit > 0 && !showAll ? items.slice(0, initialLimit) : items;
  const hiddenCount = items.length - shown.length;

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {shown.map((item) => {
          const active = selectedKeys.includes(item.key);
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={cx(
                  'group w-full rounded-md px-1.5 py-1 text-left transition-colors border border-transparent',
                  'zego-hover-surface',
                  active && 'zego-selected-tint zego-selected-border',
                )}
                title={`${item.label} · ${formatNumber(item.value)} ${unit}`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words text-xs font-medium zego-text-secondary">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums zego-text">
                    {formatNumber(item.value)} {unit}
                  </span>
                </div>
                <span className="block h-2.5 overflow-hidden rounded zego-surface-soft-bg">
                  <span
                    className="block h-full rounded-r transition-[width] duration-500"
                    style={{
                      width: `${Math.max(2, (item.value / max) * 100)}%`,
                      backgroundColor: active ? '#1d4ed8' : color,
                    }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {initialLimit > 0 && items.length > initialLimit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-medium zego-text-info hover:underline"
        >
          {showAll ? 'ย่อรายการ' : `ดูทั้งหมด (+${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
