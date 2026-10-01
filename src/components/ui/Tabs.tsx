'use client';

/** Tabs แบบเข้าถึงได้ด้วยคีย์บอร์ด (ลูกศรซ้าย/ขวา) */

import { useRef, type ReactNode } from 'react';
import { cx } from './Primitives';
import { Icon } from './Icon';

export interface TabItem {
  key: string;
  label: string;
  badge?: number;
  /** ผ่านแล้วและไม่มีข้อผิดพลาด — แสดงเครื่องหมายถูก */
  done?: boolean;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = items.findIndex((i) => i.key === value);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
    onChange(items[next].key);
    const buttons = listRef.current?.querySelectorAll('button');
    buttons?.[next]?.focus();
  };

  return (
    <div ref={listRef} role="tablist" onKeyDown={onKeyDown} className={cx('zego-product-tabs', className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            className={cx('zego-product-tab', active && 'zego-is-active')}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 ? (
              <span className="zego-product-tab__count">{item.badge}</span>
            ) : (
              item.done && (
                <>
                  {/* inline-block — Tailwind preflight ตั้ง svg เป็น block ทำให้เครื่องหมายถูกตกลงบรรทัดใหม่ใต้ชื่อแท็บ */}
                  <Icon name="check" className="zego-text-success ml-1 inline-block h-3.5 w-3.5 align-[-2px]" />
                  <span className="sr-only">ผ่านแล้ว</span>
                </>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ children, active }: { children: ReactNode; active: boolean }) {
  if (!active) return null;
  return (
    <div role="tabpanel" className="pt-4">
      {children}
    </div>
  );
}

/** ปุ่มสลับมุมมอง (ตาราง / การ์ด) */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="zego-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx('zego-segmented__button', value === option.value && 'zego-is-active')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
