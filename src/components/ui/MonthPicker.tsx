'use client';

/**
 * ตัวเลือกเดือน (Month Picker) — แสดงชื่อเดือนไทย + ปี พ.ศ. เก็บภายในเป็น ค.ศ. (ISO วันแรกของเดือน)
 * Layout: [ < ] [ สิงหาคม 2569 📅 ] [ > ]
 *   • ปุ่มลูกศร = เดือนก่อนหน้า/ถัดไป (รองรับข้ามปีอัตโนมัติ)
 *   • กดชื่อเดือน/ไอคอน → popover เลือกปี (พ.ศ.) + ตารางเดือน 12 ช่อง
 * onChange คืน ISO ของ "วันแรกของเดือน" เสมอ
 */

import { useEffect, useRef, useState } from 'react';
import { addMonths, formatThaiMonthYear, parseDate, startOfMonth, toISODate } from '@/lib/format';
import { cx } from './Primitives';
import { Icon } from './Icon';

const TH_MONTHS_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function MonthPicker({
  value,
  onChange,
  ariaLabel = 'เลือกเดือน',
  hint,
  centerLabel = false,
}: {
  value: string; // ISO วันใดก็ได้ในเดือนที่เลือก
  onChange: (isoFirstOfMonth: string) => void;
  ariaLabel?: string;
  /** ข้อความช่วยเหลือ แสดงเป็น tooltip เมื่อ hover (ประหยัดพื้นที่ §4) */
  hint?: string;
  /** จัดข้อความเดือน/ปีให้อยู่กึ่งกลางกล่อง (มีตัวเว้นระยะล่องหนถ่วงน้ำหนักไอคอนปฏิทินฝั่งขวา) — ค่าเริ่มต้น false ไม่กระทบจุดใช้งานเดิม */
  centerLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panelYear, setPanelYear] = useState(() => parseDate(value).getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  const selected = parseDate(value);
  const selMonth = selected.getMonth();
  const selYear = selected.getFullYear();

  // ปิด popover เมื่อคลิกนอกกรอบ / กด Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setPanelYear(selYear); // เปิดที่ปีของเดือนที่เลือกเสมอ
    setOpen((v) => !v);
  };

  const pick = (monthIndex: number) => {
    onChange(toISODate(new Date(panelYear, monthIndex, 1)));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="เดือนก่อนหน้า"
          onClick={() => onChange(addMonths(value, -1))}
          className="zego-button zego-button--icon shrink-0"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={hint}
          onClick={toggleOpen}
          className="zego-button min-w-0 flex-1 justify-between gap-2"
        >
          {/* ตัวเว้นระยะล่องหนขนาดเท่าไอคอน — ถ่วงน้ำหนักให้ข้อความอยู่กึ่งกลางกล่องจริง ๆ ไม่ใช่แค่กึ่งกลางพื้นที่ที่เหลือจากไอคอน */}
          {centerLabel && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className={cx('truncate', centerLabel && 'flex-1 text-center')}>{formatThaiMonthYear(value)}</span>
          <Icon name="calendar" className="zego-text-tertiary h-4 w-4 shrink-0" />
        </button>

        <button
          type="button"
          aria-label="เดือนถัดไป"
          onClick={() => onChange(addMonths(value, 1))}
          className="zego-button zego-button--icon shrink-0"
        >
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      {/* z-30 = Z_MONTH_PICKER ใน @/lib/z-index (ตัวเลขคงเดิม อยู่ต่ำกว่า topbar/sidebar ของ zego แล้ว) */}
      {open && (
        <div role="dialog" aria-label="เลือกเดือนและปี" className="zego-popover zego-is-open left-0 top-full z-30 mt-1 w-64 p-2">
          {/* เลือกปี (พ.ศ.) */}
          <div className="mb-2 flex items-center justify-between px-1">
            <button type="button" aria-label="ปีก่อนหน้า" onClick={() => setPanelYear((y) => y - 1)} className="zego-text-tertiary zego-cell-hover rounded-lg p-1.5">
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <span className="zego-text text-sm font-semibold">{panelYear + 543}</span>
            <button type="button" aria-label="ปีถัดไป" onClick={() => setPanelYear((y) => y + 1)} className="zego-text-tertiary zego-cell-hover rounded-lg p-1.5">
              <Icon name="chevronRight" className="h-4 w-4" />
            </button>
          </div>
          {/* ตารางเดือน 12 ช่อง */}
          <div className="grid grid-cols-3 gap-1">
            {TH_MONTHS_ABBR.map((m, i) => {
              const isSel = panelYear === selYear && i === selMonth;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={isSel}
                  className={cx(
                    'rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                    isSel ? 'zego-button--primary text-white' : 'zego-text-secondary zego-cell-hover',
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** ตัวช่วย: วันแรกของเดือนถัดจากวันอ้างอิง (ค่าเริ่มต้นของหน้าจัดสเก็ต §3) */
export function nextMonthStart(today: string): string {
  return startOfMonth(addMonths(today, 1));
}

/**
 * เดือนถัดไปจาก "วันที่จริงของเครื่องผู้ใช้" — ไม่ใช่วันที่อ้างอิงของ Demo ที่ตรึงไว้
 *
 * ⚠️ ต้องเรียกฝั่ง Client เท่านั้น (เช่นใน useEffect ตอน mount)
 *    หน้าเหล่านี้ถูก prerender ตอน build ถ้าคำนวณตอน render จะได้วันที่ตอน build
 *    ค้างอยู่ใน HTML และไม่ตรงกับฝั่งเบราว์เซอร์
 */
export function nextMonthStartFromNow(): string {
  return nextMonthStart(toISODate(new Date()));
}

/** เดือนปัจจุบันจาก "วันที่จริงของเครื่องผู้ใช้" — เรียกฝั่ง Client เท่านั้น (เหตุผลเดียวกับ nextMonthStartFromNow) */
export function currentMonthStartFromNow(): string {
  return startOfMonth(toISODate(new Date()));
}
