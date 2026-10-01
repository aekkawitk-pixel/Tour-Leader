'use client';

/**
 * §4 (ฝั่งขวา) + §5 ฟอร์มตรวจสอบข้อมูลที่ OCR อ่านมา
 *   • ทุกช่องแก้ไขได้ — ห้ามทำเป็น Read-only (§4)
 *   • แสดงระดับความมั่นใจรายช่อง: สูง=ปกติ · ปานกลาง=เตือนเหลือง · ต่ำ=กรอบแดง+“กรุณาตรวจสอบ” · อ่านไม่ได้=ว่าง+ข้อความ (§5)
 *   • เมื่อผู้ใช้แก้ไข → เปลี่ยนสถานะช่องจาก “ข้อมูลจาก OCR” เป็น “ตรวจสอบโดยผู้ใช้แล้ว” (§5)
 */

import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { PassportFormLayout } from './PassportFormLayout';
import {
  PASSPORT_DATE_FIELDS, PASSPORT_FIELD_LABEL,
  type FieldOrigin, type OcrConfidence, type PassportFieldKey,
  type PassportFieldValues, type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';
import type { ValidationIssue } from '@/lib/logic/passportValidation';

/** ป้ายกำกับระดับความมั่นใจ (§5) */
const CONFIDENCE_META: Record<OcrConfidence, { label: string; chip: string; tone: string } | null> = {
  HIGH: null, // ความมั่นใจสูง → แสดงตามปกติ ไม่รบกวนสายตา
  MEDIUM: { label: 'ควรตรวจสอบ', chip: 'zego-badge--warning', tone: 'border-[var(--zego-warning)]' },
  LOW: { label: 'กรุณาตรวจสอบ', chip: 'zego-badge--danger', tone: 'border-[var(--zego-danger)] zego-warned-tint' },
  UNREADABLE: { label: 'ไม่สามารถอ่านข้อมูลได้', chip: 'zego-badge--slate', tone: 'zego-border-color' },
};

interface Props {
  values: PassportFieldValues;
  ocr: PassportOcrFields | null;
  fieldOrigin: Record<PassportFieldKey, FieldOrigin>;
  issues: ValidationIssue[];
  onChange: (key: PassportFieldKey, value: string) => void;
  /** ช่องที่ผู้ใช้กด “ตรวจสอบแล้ว” โดยไม่ได้แก้ค่า (§5) */
  verified: Set<PassportFieldKey>;
  onVerify: (key: PassportFieldKey) => void;
}

export function PassportReviewForm({ values, ocr, fieldOrigin, issues, onChange, verified, onVerify }: Props) {
  const errorOf = (key: PassportFieldKey) => issues.find((i) => i.field === key && i.level === 'ERROR')?.message;
  const warnOf = (key: PassportFieldKey) => issues.find((i) => i.field === key && i.level === 'WARNING')?.message;

  const renderField = (key: PassportFieldKey) => {
        const f = ocr?.[key] ?? null;
        const origin = fieldOrigin[key];
        const isVerified = origin === 'USER_VERIFIED' || verified.has(key);
        // ผู้ใช้ตรวจ/แก้แล้ว → ไม่ต้องแสดงคำเตือนความมั่นใจอีก (§5)
        const confidence: OcrConfidence | null = f && !isVerified ? f.confidence : null;
        const meta = confidence ? CONFIDENCE_META[confidence] : null;
        const isDate = PASSPORT_DATE_FIELDS.includes(key);
        const isMrz = key === 'mrzLine1' || key === 'mrzLine2';
        const err = errorOf(key);
        const warn = warnOf(key);

    return (
          <div key={key} className={cx('rounded-lg border px-3 py-2.5', meta ? meta.tone : 'zego-border-color')}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {meta && (
                <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border', meta.chip)}>
                  <Icon name="warning" className="h-3 w-3" />
                  {meta.label}
                </span>
              )}
              {f && (
                <span className="text-[11px] zego-text-tertiary">
                  {isVerified
                    ? 'ตรวจสอบโดยผู้ใช้แล้ว'
                    : f.source === 'NONE' ? 'ไม่พบข้อมูลในรูป' : `ข้อมูลจาก OCR (${sourceLabel(f.source)})`}
                </span>
              )}
              {f?.mismatch && !isVerified && (
                <span className="text-[11px] zego-text-warning">MRZ ไม่ตรงกับข้อความบนเล่ม</span>
              )}
              {/* §5 ช่องความมั่นใจต่ำต้องยืนยันก่อนบันทึก แต่ต้องแก้ไขได้ตามปกติ */}
              {f && !isVerified && (confidence === 'LOW' || confidence === 'MEDIUM') && (
                <button
                  type="button"
                  onClick={() => onVerify(key)}
                  className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium zego-badge--info border"
                >
                  ตรวจสอบแล้ว ถูกต้อง
                </button>
              )}
            </div>

            {isDate ? (
              <DateField
                label={PASSPORT_FIELD_LABEL[key]}
                value={values[key]}
                onChange={(iso) => onChange(key, iso)}
                error={err}
                hint={warn ?? (f?.note && !isVerified ? f.note : undefined)}
              />
            ) : (
              <TextInput
                label={PASSPORT_FIELD_LABEL[key]}
                value={values[key]}
                onChange={(e) => onChange(key, e.target.value)}
                error={err}
                hint={warn ?? (f?.note && !isVerified ? f.note : undefined)}
                placeholder={confidence === 'UNREADABLE' ? 'ไม่สามารถอ่านข้อมูลได้ — กรุณากรอกเอง' : undefined}
                className={cx(isMrz && 'font-mono text-[12px]')}
                spellCheck={false}
              />
            )}
          </div>
    );
  };

  return <PassportFormLayout renderField={renderField} />;
}

function sourceLabel(source: PassportOcrFields[PassportFieldKey]['source']): string {
  switch (source) {
    case 'MRZ': return 'MRZ';
    case 'MRZ_VIZ': return 'MRZ + หน้าเล่ม';
    case 'VIZ': return 'หน้าเล่ม';
    case 'DERIVED': return 'ประกอบจากช่องอื่น';
    default: return 'ไม่ระบุ';
  }
}
