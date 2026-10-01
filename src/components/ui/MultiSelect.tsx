'use client';

/**
 * MultiSelect — ช่องเลือกได้หลายค่าพร้อมกัน (ใช้แทน SelectInput เมื่อค่ากรองมีได้มากกว่า 1)
 *
 * แบ่งเป็นสองชั้นเพื่อให้พฤติกรรมอยู่ที่เดียว:
 *   • MultiSelectControl — ปุ่มเปิด + รายการติ๊ก (คีย์บอร์ด / ARIA / คลิกนอกช่อง อยู่ที่นี่)
 *   • MultiSelect        — ห่อด้วย FormField ให้เป็นช่องในฟอร์มตามมาตรฐาน
 * แถบตัวกรองที่ใช้ปุ่มทรงแคปซูลเรียก MultiSelectControl ตรง ๆ แล้วส่ง triggerClassName เข้ามา
 *
 * • ค่าว่าง ([]) = ไม่กรอง → แสดงข้อความ allLabel เช่น "ทุกประเทศ"
 * • ปุ่มเปิดรายการหน้าตาเท่ากับ <select> เพื่อวางในแถวตัวกรองเดียวกันแล้วตรงแนว
 * • คีย์บอร์ด: ลูกศรขึ้น-ลง เลื่อน · Enter/Space เลือก-ยกเลิก · Escape ปิด · Home/End หัว-ท้าย
 * • รายการยาว (ตั้งแต่ SEARCH_THRESHOLD ขึ้นไป) มีช่องพิมพ์ค้นหาให้ · รายการสั้นไม่ต้องมีให้รก
 * • ARIA: listbox + aria-multiselectable + aria-activedescendant (screen reader อ่านได้ครบ)
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from './Primitives';
import { Icon } from './Icon';
import { baseControl, FormField, SearchBox } from './FormField';
import { nextHighlight } from './Combobox';

/**
 * จำนวนตัวเลือกที่ถือว่า "ยาวพอจะต้องค้นหา" — ต่ำกว่านี้กวาดตาหาเองเร็วกว่าพิมพ์
 * และช่องค้นหายังกินความสูงกล่องไปเปล่า ๆ จนบังเนื้อหาใต้กล่องด้วย
 */
export const SEARCH_THRESHOLD = 8;

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({
  label,
  wrapperClassName,
  hint,
  ...control
}: MultiSelectControlProps & {
  label: string;
  wrapperClassName?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <FormField label={label} hint={hint} htmlFor={id} className={wrapperClassName}>
      <MultiSelectControl id={id} ariaLabel={label} {...control} />
    </FormField>
  );
}

export interface MultiSelectControlProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: MultiSelectOption[];
  allLabel?: string;
  /** เกินจำนวนนี้แล้วสรุปเป็น "เลือกแล้ว N รายการ" แทนการไล่ชื่อ */
  summaryAfter?: number;
  /**
   * เปลี่ยนข้อความสรุปให้สั้นลงเมื่อปุ่มแคบ เช่น (n) => `${n} เดือน`
   * ใส่แล้วจะไม่แสดงป้ายตัวเลขซ้ำ เพราะข้อความบอกจำนวนอยู่แล้ว
   */
  summaryFormat?: (count: number) => string;
  disabled?: boolean;
  /** แทนคลาสปุ่มเปิดรายการทั้งชุด — ใช้เมื่อต้องการทรงอื่น เช่นแคปซูลในแถบตัวกรอง */
  triggerClassName?: string;
  /** ความกว้างกล่องรายการ (ค่าเริ่มต้นเท่าปุ่ม) — ตั้งให้กว้างกว่าได้เมื่อปุ่มแคบกว่าชื่อตัวเลือก */
  panelClassName?: string;
}

/** ตัวควบคุมล้วน ๆ (ไม่มี Label/FormField) — วางในแถบตัวกรองที่มีป้ายของตัวเองอยู่แล้วได้ */
export function MultiSelectControl({
  value,
  onChange,
  options,
  allLabel = 'ทั้งหมด',
  summaryAfter = 2,
  summaryFormat,
  disabled,
  triggerClassName,
  panelClassName,
  id: idProp,
  ariaLabel,
}: MultiSelectControlProps & { id?: string; ariaLabel?: string }) {
  const fallbackId = useId();
  const id = idProp ?? fallbackId;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchable = options.length >= SEARCH_THRESHOLD;

  /** ตัวเลือกที่ตรงคำค้น — ค่าที่ติ๊กไว้แล้วไม่หายไปไหน แค่ถูกซ่อนจากรายการชั่วคราว */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  /* ปิดรายการเมื่อคลิกนอกช่อง — ค่าที่ติ๊กไว้ไม่หาย */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); setHighlight(-1); }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* เปิดกล่องแล้วโฟกัสช่องค้นหาให้พิมพ์ต่อได้ทันที (สั่ง DOM อย่างเดียว ไม่แตะ state) */
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  /* ปิดกล่อง = ล้างคำค้นด้วย เปิดครั้งหน้าจึงเห็นรายการครบเสมอ ไม่ค้างผลค้นหาเดิม */
  const closePanel = () => { setOpen(false); setQuery(''); setHighlight(-1); };
  const openPanel = () => { setOpen(true); setQuery(''); setHighlight(-1); };

  /*
    ไฮไลต์คำนวณตอนอ่าน ไม่เก็บซ้ำเป็น state
    พิมพ์คำค้นใหม่แล้วรายการสั้นลง ตัวชี้เดิมอาจเลยขอบ — คิดสดทุกครั้งจึงไม่มีทางค้างผิดตำแหน่ง
  */
  const activeIndex = highlight >= 0 && highlight < shown.length ? highlight : -1;

  /* เลื่อนรายการที่ไฮไลต์ให้อยู่ในมุมมองเสมอ (รายการประเทศยาวกว่าความสูงกล่อง) */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const selected = new Set(value);
  const toggle = (optionValue: string) => {
    const next = selected.has(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    // เรียงตามลำดับใน options เสมอ — ค่าที่ส่งออกไม่ขึ้นกับลำดับที่ผู้ใช้กด
    onChange(options.filter((o) => next.includes(o.value)).map((o) => o.value));
  };

  const summary = (() => {
    if (value.length === 0) return allLabel;
    const labels = options.filter((o) => selected.has(o.value)).map((o) => o.label);
    if (labels.length === 0) return allLabel;
    if (labels.length <= summaryAfter) return labels.join(', ');
    return summaryFormat ? summaryFormat(labels.length) : `เลือกแล้ว ${labels.length} รายการ`;
  })();

  /* ใช้ร่วมกันทั้งปุ่มเปิดและช่องค้นหา — ปุ่มลูกศร/Enter/Escape ทำงานเหมือนกันทั้งสองที่ */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement | HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation();
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!open) {
        openPanel();
        setHighlight(0);
        return;
      }
      setHighlight((current) => nextHighlight(current, event.key as 'ArrowDown', shown.length));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        openPanel();
        setHighlight(0);
        return;
      }
      if (activeIndex >= 0 && shown[activeIndex]) toggle(shown[activeIndex].value);
    }
  };

  const activeId = activeIndex >= 0 ? `${id}-opt-${shown[activeIndex].value}` : undefined;

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        /*
          ปุ่มต้องมีชื่อของตัวเอง — <label> ที่ครอบอยู่ตั้งชื่อให้ <select> ได้ แต่ตั้งให้ <button> ไม่ได้
          ใส่ค่าที่เลือกไว้ท้ายชื่อด้วย เพราะ aria-label ทับข้อความในปุ่ม (ไม่งั้นจะไม่ได้ยินค่าปัจจุบัน)
        */
        aria-label={ariaLabel ? `${ariaLabel}: ${summary}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={handleKeyDown}
        className={cx(
          triggerClassName ?? cx(baseControl, 'flex items-center justify-between gap-2 text-left'),
          value.length === 0 && 'zego-text-tertiary',
        )}
      >
        <span className="truncate" title={summary}>{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {value.length > 0 && !summaryFormat && (
            <span className="zego-badge zego-badge--info zego-badge--sm">{value.length}</span>
          )}
          <Icon name="chevronDown" className={cx('zego-text-tertiary h-4 w-4 transition', open && 'rotate-180')} />
        </span>
      </button>

      {/* z-40 = Z_POPOVER ใน @/lib/z-index (ตัวเลขคงเดิม อยู่ต่ำกว่า topbar/sidebar ของ zego แล้ว) */}
      {open && (
        <div className={cx(
          'zego-popover zego-is-open z-40 mt-1 overflow-hidden',
          panelClassName ?? 'zego-popover--full',
        )}>
          {searchable && (
            <div className="zego-divider-bottom p-2">
              <SearchBox
                inputRef={searchRef}
                value={query}
                onChange={(v) => { setQuery(v); setHighlight(-1); }}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์เพื่อค้นหา"
                label={ariaLabel ? `ค้นหา${ariaLabel}` : 'ค้นหาตัวเลือก'}
              />
            </div>
          )}

          <div className="zego-divider-bottom flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="zego-text-tertiary text-xs">
              {value.length > 0 ? `เลือกแล้ว ${value.length} จาก ${options.length}` : allLabel}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                /* กำลังค้นอยู่ = เลือกเฉพาะที่เห็น และคงค่าที่ติ๊กไว้ก่อนหน้าไม่ให้หลุด */
                onClick={() => onChange(
                  options.filter((o) => selected.has(o.value) || shown.includes(o)).map((o) => o.value),
                )}
                className="zego-text-info rounded px-1.5 py-0.5 text-xs font-medium hover:underline"
              >
                {query.trim() ? `เลือกที่พบ (${shown.length})` : 'เลือกทั้งหมด'}
              </button>
              <button
                type="button"
                disabled={value.length === 0}
                onClick={() => onChange([])}
                className="zego-text-tertiary rounded px-1.5 py-0.5 text-xs font-medium hover:underline disabled:opacity-50 disabled:hover:no-underline"
              >
                ล้าง
              </button>
            </div>
          </div>

          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={ariaLabel}
            aria-activedescendant={activeId}
            className="max-h-60 overflow-auto py-1"
          >
            {shown.length === 0 && (
              <li className="zego-text-tertiary px-3 py-6 text-center text-sm">
                ไม่พบตัวเลือกที่ตรงกับ “{query.trim()}”
              </li>
            )}
            {shown.map((option, index) => {
              const isSelected = selected.has(option.value);
              return (
                <li
                  key={option.value}
                  id={`${id}-opt-${option.value}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(option.value)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cx(
                    'zego-menu-item mx-1',
                    index === activeIndex && 'zego-menu-item--selected',
                    isSelected && 'font-semibold',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSelected ? 'zego-button--primary border-transparent' : 'zego-surface-bg zego-checkbox-empty',
                    )}
                  >
                    {isSelected && <Icon name="check" className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
