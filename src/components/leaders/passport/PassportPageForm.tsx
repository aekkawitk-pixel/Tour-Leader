'use client';

/**
 * ฟอร์มหน้าเล่มหนังสือเดินทาง — หน้าเล่มเดิมแต่ทุกช่องกรอกได้
 *
 * ใช้ร่วมกันทั้ง "เพิ่มเล่มใหม่" และ "แก้ไขเล่มเดิม" เพื่อให้ช่องอยู่ตำแหน่งเดียวกันเสมอ
 * และเพื่อให้กฎการกรอกอยู่ที่เดียว — ช่องประเทศ/สัญชาติต้องเลือกจาก Country Master
 * ช่องวันที่รับ-แสดงเป็น dd/mm/yy
 * แถบ MRZ ไม่มีช่องให้กรอก — ระบบอ่านจากรูปให้เอง แล้วแสดงบนการ์ดแบบอ่านเท่านั้น
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { cx } from '@/components/ui/Primitives';
import { baseControl, errorControl } from '@/components/ui/FormField';
import { DateInputBase } from '@/components/ui/DateInput';
import { PassportDataPage } from './PassportDataPage';
import { countrySelectOptions, nationalitySelectOptions } from '@/data/countryMaster';
import { YEAR_ERA_NOTE } from '@/lib/format';
import {
  PASSPORT_CHOICE_OPTIONS, PASSPORT_DATE_FIELDS, PASSPORT_FIELD_LABEL,
  type PassportFieldKey, type PassportFieldValues,
} from '@/data/leaders/passportBookTypes';
import type { ValidationIssue } from '@/lib/logic/passportValidation';
import type { Country } from '@/types';

/**
 * ช่องที่ค่าต้องมาจาก Country Master — พิมพ์เองไม่ได้ ไม่งั้นจะได้ค่าที่ระบบอ้างอิงไม่ได้
 * สองช่องนี้คนละรูปแบบตามที่พิมพ์บนเล่มจริง: ประเทศ = รหัส 3 ตัว (THA) · สัญชาติ = คำเต็ม (THAI)
 */
const COUNTRY_FIELDS: PassportFieldKey[] = ['issuingCountry', 'nationality'];

export function PassportPageForm({
  values, issues, countries, todayISO, readOnly = false, onChange, photo, banner,
}: {
  values: PassportFieldValues;
  issues: ValidationIssue[];
  countries: Country[];
  /** วันนี้ (ISO) — ใช้กันไม่ให้วันเกิดเป็นวันในอนาคต และให้ปี 2 หลักตีความถูก */
  todayISO: string;
  readOnly?: boolean;
  onChange: (key: PassportFieldKey, value: string) => void;
  /** ช่องรูปฝั่งซ้ายของหน้าเล่ม (ตัวดูรูป/ปุ่มอัปโหลด) */
  photo?: ReactNode;
  /** แถบเสริมใต้หัวเล่ม เช่น สถานะเล่ม/ผลตรวจ MRZ */
  banner?: ReactNode;
}) {
  const countryOptions = useMemo(() => countrySelectOptions(countries), [countries]);
  const nationalityOptions = useMemo(() => nationalitySelectOptions(countries), [countries]);

  /**
   * ชุดตัวเลือกของช่องนั้น — ประเทศ/สัญชาติมาจาก Country Master
   * ส่วนช่องอื่น (ประเภทเล่ม · เพศ · คำนำหน้า) เป็นชุดตายตัวตามที่พิมพ์บนเล่ม
   */
  const optionsFor = (key: PassportFieldKey) => {
    if (key === 'nationality') return nationalityOptions;
    if (key === 'issuingCountry') return countryOptions;
    return PASSPORT_CHOICE_OPTIONS[key] ?? [];
  };

    /** วันเกิดเป็นวันอนาคตไม่ได้ — '17/12/52' จึงหมายถึง 1952 ไม่ใช่ 2052 */
  const maxOf = (key: PassportFieldKey) => (key === 'dateOfBirth' ? todayISO : undefined);

  /** ช่องนี้ให้เลือกจากรายการหรือไม่ */
  const isChoice = (key: PassportFieldKey) => COUNTRY_FIELDS.includes(key) || key in PASSPORT_CHOICE_OPTIONS;

  const errorOf = (key: PassportFieldKey) => issues.find((i) => i.field === key && i.level === 'ERROR')?.message;
  const warnOf = (key: PassportFieldKey) => issues.find((i) => i.field === key && i.level === 'WARNING')?.message;

  /**
   * ช่องกรอกบนหน้าเล่ม — เปลือย ๆ ไม่มีป้ายกำกับของตัวเอง
   * เพราะป้ายสองภาษา (Surname / นามสกุล) เป็นของผังหน้าเล่มอยู่แล้ว
   */
  const renderPageControl = (key: PassportFieldKey, mono?: boolean) => {
    const err = errorOf(key);
    const warn = warnOf(key);

    return (
      <div>
        {isChoice(key) ? (
          <select
            value={values[key]}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={readOnly}
            aria-label={PASSPORT_FIELD_LABEL[key]}
            aria-invalid={Boolean(err)}
            className={cx(baseControl, 'px-2 py-1 text-sm', err && errorControl)}
          >
            <option value="">ระบุ</option>
            {/* ค่าเดิมที่ไม่อยู่ในรายการ (เช่นค่าที่ OCR อ่านมาผิด) — คงไว้ให้เห็นว่าต้องเปลี่ยนเป็นอะไร */}
            {values[key] && !optionsFor(key).some((o) => o.value === values[key]) && (
              <option value={values[key]}>
                {values[key]} — {COUNTRY_FIELDS.includes(key) ? 'ไม่พบใน Country Master' : 'ไม่อยู่ในรายการ'}
              </option>
            )}
            {optionsFor(key).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : PASSPORT_DATE_FIELDS.includes(key) ? (
          <DateInputBase
            value={values[key]}
            onChange={(iso) => onChange(key, iso)}
            max={maxOf(key)}
            invalid={Boolean(err)}
            disabled={readOnly}
            aria-label={PASSPORT_FIELD_LABEL[key]}
            className="px-2 py-1 text-sm"
          />
        ) : (
          <input
            value={values[key]}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={readOnly}
            aria-label={PASSPORT_FIELD_LABEL[key]}
            aria-invalid={Boolean(err)}
            spellCheck={false}
            className={cx(baseControl, 'px-2 py-1 text-sm', err && errorControl, mono && 'font-mono')}
          />
        )}
        {err ? (
          <p className="mt-0.5 text-xs font-medium text-rose-600">{err}</p>
        ) : warn ? (
          <p className="mt-0.5 text-xs text-amber-700">{warn}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PassportDataPage
        photo={photo}
        banner={banner}
        renderSlot={(slot) => renderPageControl(slot.key, slot.mono)}
        /* บอกระบบปีไว้ที่หัวข้อช่องวันที่ — 'yy' ไม่บอกว่าเป็น ค.ศ. หรือ พ.ศ. */
        slotNote={(slot) => (PASSPORT_DATE_FIELDS.includes(slot.key) ? YEAR_ERA_NOTE : undefined)}
      />
    </div>
  );
}
