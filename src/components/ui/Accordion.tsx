'use client';

/** Accordion — ใช้จัดกลุ่มข้อมูลภายในขั้นตอนของฟอร์ม (เปิดหลายกลุ่มพร้อมกันได้) */

import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './Primitives';

export function Accordion({
  title,
  count,
  defaultOpen = true,
  errorCount = 0,
  description,
  children,
}: {
  title: string;
  /** จำนวนรายการ เช่น "ภาษา (3)" */
  count?: number;
  defaultOpen?: boolean;
  errorCount?: number;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cx('zego-card-surface', errorCount > 0 && 'zego-accordion--error')}>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cx(
            'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
            errorCount > 0 ? 'zego-accordion__head--error' : 'zego-accordion__head',
          )}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="zego-text text-sm font-semibold">{title}</span>
              {count !== undefined && (
                <span className="zego-badge zego-badge--slate zego-badge--sm">{count}</span>
              )}
              {errorCount > 0 && (
                <span className="zego-badge zego-badge--danger zego-badge--sm">
                  <Icon name="warning" className="h-3 w-3" />
                  {errorCount} ข้อผิดพลาด
                </span>
              )}
            </span>
            {description && (
              <span className="zego-text-tertiary mt-0.5 block text-xs">{description}</span>
            )}
          </span>

          <Icon
            name="chevronDown"
            className={cx('zego-text-tertiary h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
      </h3>

      {open && <div className="zego-divider-top p-4">{children}</div>}
    </section>
  );
}
