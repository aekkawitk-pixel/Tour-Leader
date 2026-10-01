'use client';

/** ฟิลด์ฟอร์มพร้อมป้ายกำกับ ข้อความช่วยเหลือ และข้อความแจ้งเตือนเมื่อกรอกไม่ครบ */

import type { KeyboardEvent, ReactNode, RefObject, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cx } from './Primitives';
import { Icon } from './Icon';

/** สไตล์ช่องกรอกมาตรฐาน ใช้ร่วมกับ DateInput เพื่อให้หน้าตาตรงกันทุกช่อง (มาจาก zego-design-system) */
export const baseControl = 'zego-input';

export const errorControl = 'zego-input--error';

/**
 * โครงเดียวกันทุกช่อง: Label → Input → Helper/Error
 * แถว Label สูงขั้นต่ำเท่ากันทุกช่อง และตัดข้อความเมื่อพื้นที่แคบ
 * → Input ของช่องในแถวเดียวกันอยู่ในแนวตรงกันเสมอ แม้ Label ยาวไม่เท่ากัน
 */
export function FormField({
  label,
  required,
  optional,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  /** แสดงป้าย "ไม่บังคับ" ข้าง Label (ไม่รวมเป็นข้อความเดียวกับ Label) */
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <div className="flex min-h-6 items-center gap-1.5">
        <label htmlFor={htmlFor} className="zego-text truncate text-sm font-medium" title={label}>
          {label}
          {required && (
            <span className="zego-text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {optional && (
          <span className="zego-badge zego-badge--slate zego-badge--sm shrink-0">ไม่บังคับ</span>
        )}
      </div>

      {children}

      {error ? (
        <p className="zego-text-danger text-xs font-medium">{error}</p>
      ) : (
        hint && <p className="zego-text-tertiary text-xs">{hint}</p>
      )}
    </div>
  );
}

/* -------------------------------- TextInput ------------------------------ */

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** แสดงป้าย "ไม่บังคับ" ข้าง Label */
  optional?: boolean;
  wrapperClassName?: string;
}

export function TextInput({
  label,
  error,
  hint,
  required,
  optional,
  wrapperClassName,
  className,
  ...rest
}: TextInputProps) {
  const id = useId();
  return (
    <FormField
      label={label}
      required={required}
      optional={optional}
      error={error}
      hint={hint}
      htmlFor={id}
      className={wrapperClassName}
    >
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={cx(baseControl, error && errorControl, className)}
        {...rest}
      />
    </FormField>
  );
}

/* --------------------------------- Select -------------------------------- */

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  optional?: boolean;
  wrapperClassName?: string;
}

export function SelectInput({
  label,
  error,
  hint,
  required,
  optional,
  options,
  placeholder,
  wrapperClassName,
  className,
  ...rest
}: SelectInputProps) {
  const id = useId();
  return (
    <FormField
      label={label}
      required={required}
      optional={optional}
      error={error}
      hint={hint}
      htmlFor={id}
      className={wrapperClassName}
    >
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={cx(baseControl, error && errorControl, className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/* -------------------------------- Textarea ------------------------------- */

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  wrapperClassName?: string;
}

export function TextArea({
  label,
  error,
  hint,
  required,
  optional,
  wrapperClassName,
  className,
  ...rest
}: TextAreaProps) {
  const id = useId();
  return (
    <FormField
      label={label}
      required={required}
      optional={optional}
      error={error}
      hint={hint}
      htmlFor={id}
      className={wrapperClassName}
    >
      <textarea
        id={id}
        rows={3}
        aria-invalid={Boolean(error)}
        className={cx(baseControl, error && errorControl, className)}
        {...rest}
      />
    </FormField>
  );
}

/* ------------------------------ CheckboxGroup ---------------------------- */

export function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  error?: string;
}) {
  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };
  return (
    <FormField label={label} hint={hint} error={error}>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(option)}
              className={cx('zego-filter-chip', checked && 'zego-is-active')}
            >
              {option}
            </button>
          );
        })}
      </div>
    </FormField>
  );
}

/* -------------------------------- SearchBox ------------------------------ */

/**
 * ช่องค้นหามาตรฐาน — ใช้ทุกที่ที่มีการค้นหา ทั้งในหน้า ในกล่องรายการ และใน Drawer
 * หน้าตาเดียวกันหมด (ไอคอน · ความสูง · ขอบ · วงแหวนตอนโฟกัส) จะได้ไม่ดูเป็นคนละระบบ
 */
export function SearchBox({
  value,
  onChange,
  placeholder = 'ค้นหา…',
  className,
  label = 'ค้นหา',
  onClear,
  onKeyDown,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  /** ใส่แล้วจะมีปุ่มกากบาทล้างคำค้นตอนมีข้อความ */
  onClear?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const showClear = Boolean(onClear) && value !== '';
  return (
    <div className={cx('relative', className)}>
      <span className="zego-toolbar__search-icon pointer-events-none">
        <Icon name="search" className="h-4 w-4" />
      </span>
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cx(baseControl, 'pl-9', showClear && 'pr-9')}
      />
      {showClear && (
        <button
          type="button"
          aria-label={`ล้าง${label}`}
          onClick={onClear}
          className="zego-icon-btn absolute inset-y-0 right-2 flex items-center rounded p-1"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
