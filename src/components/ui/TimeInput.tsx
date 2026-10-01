'use client';

/**
 * ช่องกรอกเวลาร่วมของทั้งระบบ — แสดงและรับค่าเป็น `HH:mm` แบบ 24 ชั่วโมงเสมอ
 * (ไม่พึ่ง locale ของอุปกรณ์ จึงไม่มีวันแสดง AM/PM แม้เครื่องตั้งค่าเป็น 12 ชั่วโมง — §4/§12)
 *
 * ความสามารถ:
 * - พิมพ์ตรง ๆ + เติม `:` อัตโนมัติ (0900 → 09:00 · 1830 → 18:30)
 * - เลือกจาก Time Picker (ไอคอนนาฬิกา) โดยค่าที่ได้เป็น 24 ชม. เสมอ
 * - ตรวจช่วง 00:00–23:59 · แก้ด้วย Backspace/Delete ได้ · ไม่ readonly
 * - ค่าออก/เข้าเป็น `HH:mm` ('' เมื่อยังกรอกไม่ครบ/ไม่ถูกต้อง)
 */

import type { InputHTMLAttributes } from 'react';
import { useId, useRef, useState } from 'react';
import { maskTime, parseDisplayTime } from '@/lib/format';
import { FormField, baseControl, errorControl } from './FormField';
import { cx } from './Primitives';
import { Icon } from './Icon';

const TIME_ERROR = 'กรุณาระบุเวลาในรูปแบบ 24 ชั่วโมง HH:mm';

/** hook แปลงระหว่างค่า `HH:mm` (ค่าจริง) กับข้อความที่ผู้ใช้พิมพ์ */
function useTimeText({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const [text, setText] = useState(() => value ?? '');
  const [lastValue, setLastValue] = useState(value);

  // ซิงก์ข้อความจาก prop เมื่อค่าภายนอกเปลี่ยน โดยไม่ทับสิ่งที่กำลังพิมพ์อยู่
  if (value !== lastValue) {
    setLastValue(value);
    if ((parseDisplayTime(text) ?? '') !== (value ?? '')) {
      setText(value ?? '');
    }
  }

  const digits = text.replace(/\D/g, '');
  const parsed = parseDisplayTime(text);
  // แจ้ง error เฉพาะเมื่อกรอกมากพอจะเป็นเวลาแล้วแต่ไม่ถูกต้อง (ไม่รบกวนระหว่างพิมพ์)
  const error = text.trim() !== '' && !parsed && digits.length >= 3 ? TIME_ERROR : undefined;

  const handleChange = (raw: string) => {
    const masked = maskTime(raw);
    setText(masked);
    onChange(parseDisplayTime(masked) ?? '');
  };

  return { text, error, handleChange };
}

interface TimeFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  label: string;
  value: string;
  /** คืนค่าเป็น `HH:mm` (หรือ '' เมื่อยังกรอกไม่ครบ/ไม่ถูกต้อง) */
  onChange: (hhmm: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  wrapperClassName?: string;
  /** แสดงไอคอนนาฬิกาให้เปิด Time Picker ได้ (พิมพ์เองก็ยังได้) — ค่าเริ่มต้นเปิด */
  picker?: boolean;
}

export function TimeField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  optional,
  wrapperClassName,
  className,
  picker = true,
  ...rest
}: TimeFieldProps) {
  const id = useId();
  const nativeRef = useRef<HTMLInputElement>(null);
  const { text, error: maskError, handleChange } = useTimeText({ value, onChange });
  const shownError = error ?? maskError;

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
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
          placeholder="hh:mm"
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
              aria-label="เลือกเวลาจากตัวเลือก"
              onClick={openPicker}
              className="zego-icon-btn absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2.5"
            >
              <Icon name="clock" className="h-4 w-4" />
            </button>
            {/* ช่อง time native ซ่อนไว้ ใช้เฉพาะเป็นตัวเปิด Time Picker (ค่าออกเป็น HH:mm 24 ชม.) */}
            <input
              ref={nativeRef}
              type="time"
              value={value || ''}
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
