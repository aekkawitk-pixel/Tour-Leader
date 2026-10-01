'use client';

/**
 * PhoneInput — ช่องกรอกเบอร์โทรศัพท์ระหว่างประเทศ (reusable)
 *  - เลือกประเทศ (ธง + ชื่อ + รหัสโทรศัพท์) ค้นหาได้ · ค่าเริ่มต้นไทย +66
 *  - รองรับทั้งเบอร์ไทยและต่างประเทศ · ตรวจตามประเทศ (libphonenumber-js) · แปลง E.164
 *  - แยกค่าที่แสดง (displayPhone) กับค่าที่บันทึก (phoneE164) ผ่าน type PhoneValue
 *  - type="tel" → แป้นโทรศัพท์บนมือถือ
 *
 * Dropdown ประเทศ render ผ่าน portal (position: fixed) จึงไม่ถูก container ตัด:
 *  - คำนวณตำแหน่งจากช่องต้นทาง · reposition เมื่อ scroll/resize
 *  - พื้นที่ด้านล่างไม่พอ → เปิดขึ้นบนอัตโนมัติ · scrollbar อยู่ในรายการ dropdown เท่านั้น
 *  - z-index เหนือฟอร์ม/header แต่ต่ำกว่า modal · คลิกนอก/Escape ปิด
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Country } from '@/types';
import {
  changePhoneCountry,
  computePhone,
  dialCodeOf,
  exampleNationalNumber,
  isPhoneEmpty,
  isPhoneValid,
  isSupportedPhoneCountry,
  type PhoneValue,
} from '@/lib/phone';
import { FormField, baseControl, errorControl } from './FormField';
import { cx } from './Primitives';
import { Icon } from './Icon';

/** ธงจากรหัสประเทศ alpha-2 */
function flagEmoji(alpha2: string): string {
  const code = alpha2.toUpperCase();
  if (code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** ตำแหน่ง dropdown แบบ fixed (ยึดกับช่องต้นทาง) */
interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function PhoneInput({
  label,
  value,
  onChange,
  countries,
  error,
  required,
  hint,
  wrapperClassName,
}: {
  label: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  countries: Country[];
  error?: string;
  required?: boolean;
  hint?: string;
  wrapperClassName?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /** ประเทศที่ libphonenumber รองรับ (มีรหัสโทรศัพท์) เรียงตามชื่อไทย */
  const options = useMemo(
    () =>
      countries
        .filter((c) => isSupportedPhoneCountry(c.code))
        .map((c) => ({ code: c.code, nameTh: c.nameTh, nameEn: c.nameEn, dial: dialCodeOf(c.code) }))
        .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th')),
    [countries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.nameTh.toLowerCase().includes(q) ||
        o.nameEn.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        o.dial.includes(q),
    );
  }, [options, query]);

  /* คำนวณตำแหน่ง dropdown จากช่องต้นทาง (fixed) — เลือกเปิดล่าง/บนตามพื้นที่ */
  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(320, openUp ? spaceAbove : spaceBelow));
    const width = Math.min(Math.max(r.width, 260), vw - margin * 2);
    let left = r.left;
    if (left + width > vw - margin) left = Math.max(margin, vw - margin - width);
    setPlacement({
      left,
      width,
      maxHeight,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? vh - r.top + 4 : undefined,
    });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScrollResize = () => reposition();
    // capture = จับ scroll ของทุก container ที่ห่อช่องนี้ด้วย
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  /* คลิกนอกช่อง/นอก dropdown → ปิด */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const invalid = !isPhoneEmpty(value) && !isPhoneValid(value);
  const shownError = error ?? (invalid ? 'รูปแบบเบอร์ไม่ถูกต้องสำหรับประเทศที่เลือก' : undefined);
  const example = exampleNationalNumber(value.countryCode);
  const shownHint = hint ?? (example ? `ตัวอย่าง: ${value.dialCode} · ${example}` : undefined);

  const pickCountry = (code: string) => {
    onChange(changePhoneCountry(value, code));
    setOpen(false);
    setQuery('');
    // คืนโฟกัสให้ช่องเบอร์ไม่ได้ที่นี่ (ปล่อยตามธรรมชาติ)
  };

  return (
    <FormField
      label={label}
      required={required}
      error={shownError}
      hint={shownHint}
      htmlFor={id}
      className={wrapperClassName}
    >
      <div className="flex items-stretch gap-2">
        {/* ปุ่มเลือกประเทศ (ต้นทางของ dropdown) */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="เลือกประเทศของเบอร์โทรศัพท์"
          className={cx(
            baseControl,
            'flex shrink-0 items-center gap-1 whitespace-nowrap',
            shownError && errorControl,
          )}
        >
          <span aria-hidden="true">{flagEmoji(value.countryCode)}</span>
          <span className="zego-text font-mono">{value.dialCode || '+'}</span>
          <Icon name="chevronDown" className="zego-text-tertiary h-4 w-4" />
        </button>

        {/* ช่องกรอกเบอร์ */}
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.displayPhone}
          placeholder={example || 'เบอร์โทรศัพท์'}
          onChange={(e) => onChange(computePhone(e.target.value, value.countryCode))}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          aria-invalid={Boolean(shownError)}
          className={cx(baseControl, 'w-full min-w-0 flex-1', shownError && errorControl)}
        />
      </div>

      {open &&
        placement &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              left: placement.left,
              width: placement.width,
              top: placement.top,
              bottom: placement.bottom,
              maxHeight: placement.maxHeight,
              zIndex: 165, // = Z_PHONE_PORTAL ใน @/lib/z-index — ต้องสูงกว่า Modal (160) เพราะ portal ออกไปที่ document.body ข้าม Modal ได้
            }}
            className="zego-popover zego-is-open flex flex-col overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <div className="zego-divider-bottom shrink-0 p-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาประเทศ / รหัส (เช่น Japan, JP, +81)"
                aria-label="ค้นหาประเทศ"
                className={cx(baseControl, 'w-full')}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
              {filtered.length === 0 ? (
                <p className="zego-text-tertiary px-3 py-3 text-center text-sm">ไม่พบประเทศ</p>
              ) : (
                <ul role="listbox" aria-label="รายการประเทศ">
                  {filtered.map((o) => (
                    <li key={o.code}>
                      <button
                        type="button"
                        onClick={() => pickCountry(o.code)}
                        className={cx(
                          'zego-menu-item w-full',
                          o.code === value.countryCode && 'zego-menu-item--selected',
                        )}
                      >
                        <span aria-hidden="true">{flagEmoji(o.code)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {o.nameTh} <span className="zego-text-tertiary">{o.nameEn}</span>
                        </span>
                        <span className="zego-text-tertiary font-mono text-xs">{o.dial}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </FormField>
  );
}
