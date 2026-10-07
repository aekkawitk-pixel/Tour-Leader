'use client';

/**
 * Combobox — ช่องค้นหาแบบเลือกจากรายการเท่านั้น (ไม่รับข้อความอิสระ)
 *
 * รองรับ: พิมพ์ค้นหา · ลูกศรขึ้น-ลง · Enter ยืนยัน · Escape ปิดรายการ ·
 *          Focus ช่องว่างแล้วเห็นรายการทั้งหมด · สถานะกำลังโหลด / ไม่พบ / ผิดพลาด
 * ARIA:   role="combobox" + listbox + aria-activedescendant (screen reader อ่านรายการที่ไฮไลต์ได้)
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from './Primitives';
import { baseControl, errorControl } from './FormField';
import { Icon } from './Icon';

/** เลื่อนไฮไลต์ตามปุ่มลูกศร — ฟังก์ชันบริสุทธิ์ เพื่อให้ทดสอบได้โดยไม่ต้องมี DOM */
export function nextHighlight(
  current: number,
  key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
  length: number,
): number {
  if (length === 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current >= length - 1 ? 0 : current + 1;
    case 'ArrowUp':
      return current <= 0 ? length - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
  }
}

export function Combobox<T>({
  label,
  required,
  value,
  items,
  getKey,
  getLabel,
  getSubLabel,
  onSelect,
  onSearch,
  placeholder,
  hint,
  error,
  disabled,
  disabledHint,
  loading = false,
  loadError,
  emptyMessage = 'ไม่พบรายการที่ค้นหา',
  placement = 'bottom',
}: {
  label: string;
  required?: boolean;
  /** ชื่อของรายการที่เลือกอยู่ ('' = ยังไม่เลือก) */
  value: string;
  /** รายการที่กรองแล้วตามคำค้น */
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | undefined;
  /** เลือกจากรายการ · null = ล้างค่า */
  onSelect: (item: T | null) => void;
  /** แจ้งคำค้นที่พิมพ์ (ผู้เรียกกรองรายการเอง — ไม่มีการเรียกข้อมูลใหม่) */
  onSearch: (query: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** ข้อความอธิบายเมื่อยังกรอกไม่ได้ เช่น "เลือกจังหวัดก่อน" */
  disabledHint?: string;
  loading?: boolean;
  loadError?: string;
  emptyMessage?: string;
  /** เปิดรายการลงล่าง (ค่าเริ่มต้น) หรือขึ้นบน — ใช้ขึ้นบนเมื่อช่องอยู่ท้ายพื้นที่เลื่อน รายการจะได้ไม่ล้นจอ */
  placement?: 'bottom' | 'top';
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** ช่องแสดงชื่อที่เลือกอยู่ · เมื่อเปิดรายการจะแสดงคำค้นที่พิมพ์แทน */
  const inputValue = open ? query : value;

  /* ปิดรายการเมื่อคลิกนอกช่อง — ค่าที่เลือกไว้ไม่หาย เพราะไม่รับข้อความอิสระ */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* เลื่อนรายการที่ไฮไลต์ให้อยู่ในมุมมองเสมอ (ใช้คีย์บอร์ดกับรายการยาว ๆ ได้) */
  useEffect(() => {
    if (!open || highlight < 0) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const openList = (nextQuery = '') => {
    if (disabled) return;
    setQuery(nextQuery);
    onSearch(nextQuery);
    setHighlight(-1);
    setOpen(true);
  };

  const choose = (item: T) => {
    onSelect(item);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'Escape') {
      if (open) {
        /* Modal ดัก keydown ไว้ที่ document — ต้องหยุด native event ด้วย
           ไม่งั้น Escape ที่ตั้งใจปิดรายการจะไปปิด Modal ทั้งใบ */
        event.nativeEvent.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList('');
        return;
      }
      setHighlight((current) => nextHighlight(current, event.key as 'ArrowDown', items.length));
      return;
    }

    if (event.key === 'Enter') {
      if (!open) return;
      event.preventDefault();
      // ยังไม่ได้เลื่อนลูกศร แต่ผลลัพธ์เหลือรายการเดียว → ยืนยันรายการนั้นได้เลย
      const index = highlight >= 0 ? highlight : items.length === 1 ? 0 : -1;
      if (index >= 0 && items[index]) choose(items[index]);
      return;
    }

    if (event.key === 'Tab' && open) setOpen(false);
  };

  const showEmpty = open && !loading && !loadError && items.length === 0;
  const activeId = highlight >= 0 && items[highlight] ? `${id}-opt-${getKey(items[highlight])}` : undefined;

  const describedBy = useMemo(() => {
    if (error) return `${id}-error`;
    if (disabled && disabledHint) return `${id}-hint`;
    if (hint) return `${id}-hint`;
    return undefined;
  }, [disabled, disabledHint, error, hint, id]);

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      {/* แถว Label สูงขั้นต่ำเท่ากับ FormField (min-h-6) — วางคู่ช่องอื่นในแถวเดียวกันแล้วต้องตรงแนว */}
      <div className="flex min-h-6 items-center gap-1.5">
        <label htmlFor={id} className="zego-text truncate text-sm font-medium" title={label}>
          {label}
          {required && (
            <span className="zego-text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      </div>

      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          disabled={disabled}
          placeholder={disabled ? disabledHint : placeholder}
          value={inputValue}
          onChange={(e) => openList(e.target.value)}
          onFocus={() => openList('')}
          onKeyDown={handleKeyDown}
          className={cx(baseControl, 'pr-8', error && errorControl)}
        />

        <span className="zego-text-tertiary pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <Icon name={loading ? 'clock' : 'chevronDown'} className="h-4 w-4" />
        </span>

        {/* z-20 = Z_DROPDOWN ใน @/lib/z-index (ตัวเลขคงเดิม อยู่ต่ำกว่า topbar/sidebar ของ zego แล้ว) */}
        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className={cx('zego-card-surface absolute z-40 max-h-56 w-full overflow-auto py-1', placement === 'top' ? 'bottom-full mb-1' : 'mt-1')}
          >
            {loading && (
              <li className="zego-text-secondary px-3 py-2 text-sm" role="status">
                กำลังโหลดรายการ…
              </li>
            )}

            {!loading && loadError && (
              <li className="zego-text-danger px-3 py-2 text-sm" role="alert">
                {loadError}
              </li>
            )}

            {showEmpty && (
              <li className="zego-text-secondary flex items-center justify-between gap-2 px-3 py-2 text-sm" role="status">
                <span>{emptyMessage}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setQuery(''); onSearch(''); }}
                  className="zego-text-info shrink-0 rounded px-1.5 py-0.5 text-xs font-medium hover:underline"
                >
                  ล้างคำค้นหา
                </button>
              </li>
            )}

            {!loading &&
              !loadError &&
              items.map((item, index) => {
                const key = getKey(item);
                const sub = getSubLabel?.(item);
                const selected = getLabel(item) === value;
                return (
                  <li
                    key={key}
                    id={`${id}-opt-${key}`}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                    onMouseEnter={() => setHighlight(index)}
                    className={cx(
                      'zego-menu-item mx-1',
                      index === highlight && 'zego-menu-item--selected',
                      selected && 'font-semibold',
                    )}
                  >
                    <span>{getLabel(item)}</span>
                    {sub && <span className="zego-text-tertiary text-xs">{sub}</span>}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="zego-text-danger text-xs font-medium">
          {error}
        </p>
      ) : (
        (hint || (disabled && disabledHint)) && (
          <p id={`${id}-hint`} className="zego-text-secondary text-xs">
            {disabled && disabledHint ? disabledHint : hint}
          </p>
        )
      )}
    </div>
  );
}
