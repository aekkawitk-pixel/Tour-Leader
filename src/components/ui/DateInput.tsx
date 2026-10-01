'use client';

/**
 * ช่องกรอกวันที่ร่วมของทั้งระบบ — แสดงและรับค่าเป็น `dd/mm/yy` (เช่น 17/07/26)
 * โดยยังคงส่งค่าออก/รับค่าเข้าเป็น ISO `YYYY-MM-DD` เหมือนเดิม จึงไม่กระทบ logic/ข้อมูล
 *
 * ความสามารถ:
 * - เติม `/` อัตโนมัติระหว่างพิมพ์
 * - ตรวจว่าวันที่มีอยู่จริง (31/02 = ไม่ผ่าน)
 * - ตรวจช่วง min/max (ISO) เช่น วันสิ้นสุดต้องไม่ก่อนวันเริ่ม
 * - placeholder = `dd/mm/yy`
 *
 * ใช้ 2 รูปแบบ:
 * - `DateField`     : พร้อม Label/hint/error (แทน `<TextInput type="date" />`)
 * - `DateInputBase` : เฉพาะ `<input>` เปล่า (แทน `<input type="date" />` ในตาราง)
 */

import type { InputHTMLAttributes } from 'react';
import { useId, useRef, useState } from 'react';
import { isoToShortDate, maskShortDate, shortDateToISOWithin } from '@/lib/format';
import { FormField, baseControl, errorControl } from './FormField';
import { cx } from './Primitives';
import { Icon } from './Icon';

/** hook แปลงระหว่าง ISO (ค่าจริง) กับข้อความ `dd/mm/yy` ที่ผู้ใช้เห็น/พิมพ์ */
function useShortDate({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}) {
  const [text, setText] = useState(() => isoToShortDate(value));
  const [lastValue, setLastValue] = useState(value);

  // ซิงก์ข้อความจาก prop เมื่อค่าภายนอกเปลี่ยน โดยไม่ทับสิ่งที่กำลังพิมพ์อยู่
  // (ปรับ state ระหว่าง render ตามแนวทาง React แทนการใช้ useEffect)
  if (value !== lastValue) {
    setLastValue(value);
    if ((shortDateToISOWithin(text, { min, max }) ?? '') !== (value ?? '')) {
      setText(isoToShortDate(value));
    }
  }

  const digits = text.replace(/\D/g, '');
  // ตีความปี 2 หลักตามขอบเขตของช่อง — ช่องที่ห้ามเป็นอนาคต (วันเกิด) จะได้ 1952 ไม่ใช่ 2052
  const iso = shortDateToISOWithin(text, { min, max });

  let error: string | undefined;
  if (digits.length === 6 && !iso) {
    error = 'กรุณาระบุวันที่ให้ถูกต้องในรูปแบบ dd/mm/yy';
  } else if (iso && min && iso < min) {
    error = `ต้องไม่ก่อน ${isoToShortDate(min)}`;
  } else if (iso && max && iso > max) {
    error = `ต้องไม่เกิน ${isoToShortDate(max)}`;
  }

  const handleChange = (raw: string) => {
    const masked = maskShortDate(raw);
    setText(masked);
    onChange(shortDateToISOWithin(masked, { min, max }) ?? '');
  };

  return { text, error, handleChange };
}

/* -------------------------------- DateField ------------------------------ */

interface DateFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'min' | 'max' | 'type'
  > {
  label: string;
  value: string;
  /** คืนค่าเป็น ISO `YYYY-MM-DD` (หรือ '' เมื่อยังกรอกไม่ครบ/ไม่ถูกต้อง) */
  onChange: (iso: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  /** ขอบเขต ISO `YYYY-MM-DD` */
  min?: string;
  max?: string;
  wrapperClassName?: string;
  /** แสดงไอคอนปฏิทินให้เปิด Date Picker ได้ (พิมพ์เองก็ยังได้) — ค่าเริ่มต้นเปิด */
  picker?: boolean;
}

export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  optional,
  min,
  max,
  wrapperClassName,
  className,
  picker = true,
  ...rest
}: DateFieldProps) {
  const id = useId();
  const nativeRef = useRef<HTMLInputElement>(null);
  const { text, error: maskError, handleChange } = useShortDate({ value, onChange, min, max });
  const shownError = error ?? maskError;

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker() เปิดปฏิทิน native โดยไม่ต้องโฟกัสช่องพิมพ์ (พิมพ์เองไม่ถูกขัดจังหวะ)
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fallback ด้านล่าง */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <FormField
      label={label}
      required={required}
      optional={optional}
      error={shownError}
      hint={hint}
      htmlFor={id}
      className={wrapperClassName}
    >
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yy"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          aria-invalid={Boolean(shownError)}
          className={cx(baseControl, picker && 'pr-10', shownError && errorControl, className)}
          {...rest}
        />
        {picker && (
          <>
            <button
              type="button"
              aria-label="เลือกจากปฏิทิน"
              onClick={openPicker}
              className="zego-icon-btn absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2.5"
            >
              <Icon name="calendar" className="h-4 w-4" />
            </button>
            {/* ช่อง date native ซ่อนไว้ ใช้เฉพาะเป็นตัวเปิด Date Picker (ค่าออกเป็น ISO) */}
            <input
              ref={nativeRef}
              type="date"
              value={value || ''}
              min={min}
              max={max}
              onChange={(e) => onChange(e.target.value)}
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-2 h-1 w-1 opacity-0"
            />
          </>
        )}
      </div>
    </FormField>
  );
}

/* ------------------------------ DateInputBase ---------------------------- */

interface DateInputBaseProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'min' | 'max' | 'type'
  > {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** บังคับสถานะผิดพลาดจากภายนอก (เพิ่มเติมจากการตรวจภายใน) */
  invalid?: boolean;
  /** แสดงไอคอนปฏิทินให้เปิด Date Picker ได้ (พิมพ์เองก็ยังได้) — ค่าเริ่มต้นเปิด */
  picker?: boolean;
}

export function DateInputBase({
  value,
  onChange,
  min,
  max,
  invalid,
  className,
  picker = true,
  ...rest
}: DateInputBaseProps) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const { text, error, handleChange } = useShortDate({ value, onChange, min, max });
  const isInvalid = invalid || Boolean(error);

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fallback */
      }
    }
    el.focus();
    el.click();
  };

  const input = (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/yy"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      aria-invalid={isInvalid}
      className={cx(baseControl, picker && 'pr-9', isInvalid && errorControl, className)}
    />
  );

  if (!picker) return input;

  return (
    <div className="relative">
      {input}
      {/* ไอคอนปฏิทิน (ด้านขวาในช่อง) — ไม่ดึงโฟกัสจากการนำทางด้วยคีย์บอร์ดในตาราง */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="เลือกจากปฏิทิน"
        onClick={openPicker}
        className="zego-icon-btn absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2"
      >
        <Icon name="calendar" className="h-4 w-4" />
      </button>
      {/* ช่อง date native ซ่อนไว้ ใช้เฉพาะเป็นตัวเปิด Date Picker (ค่าออกเป็น ISO) */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-2 h-1 w-1 opacity-0"
      />
    </div>
  );
}
