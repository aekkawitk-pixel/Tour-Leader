'use client';

/**
 * ขั้นตอนที่ 1 — ข้อมูลทั่วไป · เรียงตามลำดับที่ผู้ใช้ต้องตัดสินใจ
 *   1. ข้อมูลส่วนบุคคล (รูป → รหัส → ประเภทบุคคล → รูปแบบการร่วมงาน + รายละเอียดของรูปแบบนั้น → ชื่อ/วันเกิด/เพศ/สัญชาติ)
 *   2. เอกสารประจำตัว — บัตรประชาชน (ไทย) / หนังสือเดินทาง+วีซ่า+ใบอนุญาตทำงาน (ต่างชาติ)
 *   3. ที่อยู่ปัจจุบัน (ต่างชาติ = ที่อยู่ปัจจุบันในประเทศไทย)
 *   4. ที่อยู่ตามบัตรประชาชน (ไทย) / ที่อยู่ในประเทศต้นทาง (ต่างชาติ)
 *   5. ข้อมูลระบบและหมายเหตุ
 *
 * ประเภทบุคคลกำหนดว่าจะเห็นช่องใด — ฟิลด์ของอีกประเภทถูกซ่อนและไม่ถูก validate
 *
 * ⚠️ ศาสนา เพศ และสถานภาพสมรส ไม่ถูกใช้คำนวณความเหมาะสมกับงาน (ดู lib/logic/matching.ts)
 */

import { useState } from 'react';
import { Button, Card, CardHeader, Callout, cx, Pill } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import {
  DOC_HOLDING_STATUS,
  DOC_HOLDING_STATUS_ORDER,
  GENDER,
  GENDER_ORDER,
  LEADER_SOURCE_TYPE,
  LEADER_SOURCE_TYPE_ORDER,
  LEADER_TYPE,
  LEADER_TYPE_DESC,
  LEADER_TYPE_ORDER,
  MARITAL_STATUS,
  MARITAL_STATUS_ORDER,
  PAY_TYPE,
  PAY_TYPE_ORDER,
  PAY_UNIT,
  PAY_UNIT_ORDER,
  PERSON_TYPE,
  PERSON_TYPE_ORDER,
  RELIGION,
  RELIGION_ORDER,
} from '@/lib/labels';
import { formatDateTime } from '@/lib/format';
import {
  DEFAULT_COUNTRY_ID,
  DEFAULT_PERSON_TYPE,
  DEFAULT_TITLE,
  NOTE_COUNTER_THRESHOLD,
  NOTE_MAX_LENGTH,
  TITLE_OPTIONS,
  TITLE_OPTIONS_EN,
  TITLE_TH_TO_EN,
} from '@/modules/tour-leaders/constants';
import { calculateAge, EMPTY_ADDRESS } from '@/modules/tour-leaders/utils';
import type { LeaderFormState } from '@/modules/tour-leaders/mappers';
import { PhotoPicker } from './PhotoPicker';
import { ThaiAddressFields } from './ThaiAddressFields';
import type {
  Country,
  DocHoldingStatus,
  Gender,
  LeaderAddress,
  LeaderSourceType,
  MaritalStatus,
  PayType,
  PayUnit,
  PersonType,
  Religion,
  TourLeader,
  TourLeaderUsageType,
} from '@/types';

/**
 * แถวชื่อ (ไทย/อังกฤษ) ใช้สัดส่วนเดียวกัน — คำนำหน้าแคบพอดีข้อมูล ชื่อ/นามสกุลยืดตามพื้นที่
 * ความกว้างคงที่ใช้เฉพาะ Desktop · จอกลาง 2 คอลัมน์ · มือถือ 1 คอลัมน์เต็มความกว้าง
 * (ไม่มีคอลัมน์ไหนยุบจนข้อความถูกตัด และไม่เกิด horizontal scroll)
 */
const NAME_ROW_GRID =
  'lg:grid-cols-[minmax(120px,140px)_minmax(220px,1fr)_minmax(220px,1fr)_minmax(180px,0.7fr)]';

/** แถวข้อมูลระบบ — วันที่เริ่มร่วมงาน / แหล่งที่มา / สถานะข้อมูล (จอกลาง 2 คอลัมน์ · มือถือ 1) */
const SYSTEM_ROW_GRID = 'lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(240px,0.8fr)]';

/** ตัวนับตัวอักษร — แสดงเฉพาะเมื่อใกล้ถึงขีดจำกัด */
function noteCounter(value: string, max: number): string | undefined {
  if (value.length < max * NOTE_COUNTER_THRESHOLD) return undefined;
  return `${value.length} / ${max} ตัวอักษร`;
}

/**
 * กลุ่มการ์ดที่เลือกแสดงได้ — ใช้ตอนเปิดจาก Modal เฉพาะหมวด (Flow B)
 *   personal  = ข้อมูลส่วนบุคคล + ประเภท/รูปแบบการร่วมงาน
 *   documents = เอกสารประจำตัวตามประเภทบุคคล
 *   address   = ที่อยู่ปัจจุบัน (+ ที่อยู่ในประเทศต้นทางของบุคคลต่างชาติ)
 *   idAddress = ที่อยู่ตามบัตรประชาชน
 *   system    = ข้อมูลระบบและหมายเหตุ
 */
export type GeneralInfoSection = 'personal' | 'documents' | 'address' | 'idAddress' | 'system';

const ALL_SECTIONS: readonly GeneralInfoSection[] = ['personal', 'documents', 'address', 'idAddress', 'system'];

export function GeneralInfoStep({
  form,
  leader,
  countries,
  today,
  errors,
  isNew,
  canSeeInternalNote,
  sections = ALL_SECTIONS,
  onChange,
}: {
  form: LeaderFormState;
  /** record เดิม (undefined = เพิ่มใหม่) */
  leader: TourLeader | null;
  countries: Country[];
  today: string;
  errors: Record<string, string>;
  isNew: boolean;
  canSeeInternalNote: boolean;
  /** แสดงเฉพาะกลุ่มการ์ดที่ระบุ (ค่าเริ่มต้น = ครบทุกกลุ่ม) */
  sections?: readonly GeneralInfoSection[];
  onChange: <K extends keyof LeaderFormState>(key: K, value: LeaderFormState[K]) => void;
}) {
  /** การ์ดกลุ่มนี้ถูกเปิดให้แสดงหรือไม่ */
  const showSection = (key: GeneralInfoSection) => sections.includes(key);
  /** ใส่เลขลำดับการ์ดเฉพาะตอนแสดงฟอร์มเต็ม — เปิดจาก Modal เฉพาะหมวดจะไม่มีเลขนำหน้า */
  const numbered = (order: number, title: string) =>
    sections.length === ALL_SECTIONS.length ? `${order}. ${title}` : title;
  /** ประเภทบุคคลแก้ที่ไหน — ฟอร์มเต็มอยู่การ์ดที่ 1 · Flow B อยู่ Card "ข้อมูลการร่วมงาน" */
  const personTypeSource = showSection('personal') ? 'ในการ์ดที่ 1' : 'ที่ Card “ข้อมูลการร่วมงาน”';
  /** ประเภทที่ผู้ใช้กำลังจะเปลี่ยนไป — รอการยืนยันก่อนล้างข้อมูลของประเภทเดิม */
  const [pendingPersonType, setPendingPersonType] = useState<{ next?: PersonType } | null>(null);
  /** กำลังจะปิดสวิตช์ "ระบุที่อยู่ในประเทศต้นทาง" ทั้งที่มีข้อมูลอยู่ */
  const [confirmHomeAddressOff, setConfirmHomeAddressOff] = useState(false);
  /** รูปแบบการร่วมงานที่กำลังจะเปลี่ยนไป — รอยืนยันก่อนล้างรายละเอียดของรูปแบบเดิม */
  const [pendingLeaderType, setPendingLeaderType] = useState<TourLeaderUsageType | null>(null);
  /** กำลังจะเปลี่ยนสถานะข้อมูลจาก "เปิดใช้งาน" เป็น "ระงับการใช้งาน" */
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  /** ระงับการใช้งานต้องยืนยันก่อน · เปิดใช้งานกลับทำได้ทันที */
  const requestActiveChange = (next: boolean) => {
    if (next) {
      onChange('active', true);
      return;
    }
    setConfirmDeactivate(true);
  };

  /** หมายเหตุภายใน / ข้อควรระวัง มีข้อมูลอยู่แล้วหรือไม่ — ใช้เปิดส่วน "ข้อมูลเพิ่มเติม" ให้อัตโนมัติ */
  const hasExtraNotes = Boolean(form.internalNote.trim() || form.cautions.trim());

  /** แทนที่ที่อยู่ปัจจุบันทั้งก้อน — ถ้าติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" ไว้ ที่อยู่ตามบัตรอัปเดตตามทันที */
  const setFullAddress = (next: LeaderAddress) => {
    onChange('address', next);
    if (form.idCardSameAsCurrent) onChange('idCardAddress', { ...next });
  };

  const setAddress = (patch: Partial<LeaderAddress>) =>
    setFullAddress({ ...form.address, ...patch });

  const setIdCardAddress = (patch: Partial<LeaderAddress>) =>
    onChange('idCardAddress', { ...form.idCardAddress, ...patch });

  const setHomeAddress = (patch: Partial<LeaderAddress>) =>
    onChange('homeCountryAddress', { ...form.homeCountryAddress, ...patch });

  /** มีข้อมูลที่อยู่ต้นทางกรอกไว้แล้วหรือยัง — ใช้ตัดสินว่าต้องถามยืนยันก่อนปิดสวิตช์ */
  const homeAddressFilled = () =>
    Object.values(form.homeCountryAddress).some(
      (value) => typeof value === 'string' && value.trim() !== '',
    );

  const clearHomeAddress = () => {
    onChange('hasHomeCountryAddress', false);
    onChange('homeCountryAddress', { ...EMPTY_ADDRESS, countryId: '' });
  };

  /** ปิดสวิตช์ทั้งที่มีข้อมูล → ถามยืนยันก่อนล้าง · เปิด/ปิดตอนยังว่าง → ทำได้ทันที */
  const requestHomeAddressToggle = (checked: boolean) => {
    if (checked) {
      onChange('hasHomeCountryAddress', true);
      return;
    }
    if (homeAddressFilled()) {
      setConfirmHomeAddressOff(true);
      return;
    }
    clearHomeAddress();
  };

  /** ติ๊ก → คัดลอกทันที · เอาติ๊กออก → คงข้อมูลที่คัดลอกไว้และเปิดให้แก้ไข */
  const toggleSameAsCurrent = (checked: boolean) => {
    onChange('idCardSameAsCurrent', checked);
    if (checked) onChange('idCardAddress', { ...form.address });
  };

  const sameAsCurrent = form.idCardSameAsCurrent;
  const isThai = form.personType === 'thai';
  const isForeigner = form.personType === 'foreigner';

  /** มีข้อมูลเฉพาะประเภทที่กรอกไว้แล้วหรือยัง — ใช้ตัดสินว่าต้องถามยืนยันก่อนล้างหรือไม่ */
  const hasDataOfCurrentType = (): boolean => {
    const filled = (...values: string[]) => values.some((v) => v.trim() !== '');
    const addressFilled = (a: LeaderAddress) =>
      filled(a.houseNo, a.building ?? '', a.villageNo ?? '', a.alley ?? '', a.road ?? '',
        a.subdistrict ?? '', a.district ?? '', a.province ?? '', a.postalCode ?? '');

    if (form.personType === 'thai') {
      return (
        filled(form.nationalIdNumber, form.nationalIdExpiresAt) ||
        form.idCardSameAsCurrent ||
        addressFilled(form.idCardAddress)
      );
    }
    if (form.personType === 'foreigner') {
      return (
        filled(
          form.firstNameEn,
          form.lastNameEn,
          form.birthCountryId,
          form.passportNumber,
          form.passportCountryId,
          form.passportIssuedAt,
          form.passportExpiresAt,
          form.visaNumber,
          form.visaType,
          form.visaExpiresAt,
          form.workPermitNumber,
          form.workPermitExpiresAt,
        ) ||
        Boolean(form.visaStatus) ||
        Boolean(form.workPermitStatus) ||
        addressFilled(form.homeCountryAddress)
      );
    }
    return false;
  };

  /**
   * เปลี่ยนประเภทบุคคล → ล้างเฉพาะฟิลด์ของประเภทเดิม
   * กันข้อมูลผิดชุดหลงไปกับ record ที่บันทึก (mappers ตัดออกอีกชั้นตอนบันทึก)
   */
  const applyPersonType = (next: PersonType | undefined) => {
    if (form.personType === 'thai') {
      onChange('nationalIdNumber', '');
      onChange('nationalIdExpiresAt', '');
      onChange('idCardAddress', { ...EMPTY_ADDRESS });
      onChange('idCardSameAsCurrent', false);
    } else if (form.personType === 'foreigner') {
      onChange('birthCountryId', '');
      onChange('passportNumber', '');
      onChange('passportCountryId', '');
      onChange('passportIssuedAt', '');
      onChange('passportExpiresAt', '');
      onChange('visaStatus', undefined);
      onChange('visaNumber', '');
      onChange('visaType', '');
      onChange('visaExpiresAt', '');
      onChange('workPermitStatus', undefined);
      onChange('workPermitNumber', '');
      onChange('workPermitExpiresAt', '');
      onChange('hasHomeCountryAddress', false);
      onChange('homeCountryAddress', { ...EMPTY_ADDRESS, countryId: '' });
      // ชื่อตามหนังสือเดินทางเป็นของบุคคลต่างชาติ — ล้างเมื่อออกจากประเภทนี้
      onChange('firstNameEn', '');
      onChange('lastNameEn', '');
    }

    /* คำนำหน้าและสัญชาติคนละชุดกัน — ตั้งค่าให้สอดคล้องกับประเภทใหม่ */
    if (next === 'thai') {
      onChange('title', DEFAULT_TITLE);
      onChange('titleEn', TITLE_TH_TO_EN[DEFAULT_TITLE] ?? '');
      onChange('nationalityCountryId', DEFAULT_COUNTRY_ID);
    } else if (next === 'foreigner') {
      // ให้ผู้ใช้เลือกคำนำหน้าตามหนังสือเดินทางเอง (แสดง placeholder)
      onChange('title', '');
      // สัญชาติไทยใช้กับบุคคลต่างชาติไม่ได้ — ล้างให้เลือกใหม่
      if (form.nationalityCountryId === DEFAULT_COUNTRY_ID) onChange('nationalityCountryId', '');
    }

    onChange('personType', next);
  };

  /* ---------------- รูปแบบการร่วมงาน — รายละเอียดเฉพาะของแต่ละรูปแบบ ---------------- */

  /** มีข้อมูลของรูปแบบการร่วมงานปัจจุบันกรอกไว้แล้วหรือยัง */
  const hasDataOfCurrentLeaderType = (): boolean => {
    const filled = (...values: string[]) => values.some((v) => v.trim() !== '');
    switch (form.leaderType) {
      case 'regular':
        return filled(form.employeeCode, form.team) || Boolean(form.workStatus);
      case 'freelance':
        return filled(form.payRate) || Boolean(form.payType) || Boolean(form.payUnit);
      case 'agent':
        return filled(
          form.agencyName,
          form.agencyContactName,
          form.agencyContactPhone,
          form.agencyContactEmail,
          form.agencyRefCode,
        );
      default:
        return false;
    }
  };

  /** ล้างเฉพาะรายละเอียดของรูปแบบเดิม — ข้อมูลส่วนกลาง (ชื่อ/ที่อยู่/ช่องทางติดต่อ) ไม่ถูกแตะ */
  const applyLeaderType = (next: TourLeaderUsageType) => {
    switch (form.leaderType) {
      case 'regular':
        onChange('employeeCode', '');
        onChange('team', '');
        onChange('workStatus', undefined);
        break;
      case 'freelance':
        onChange('payType', undefined);
        onChange('payRate', '');
        onChange('payUnit', undefined);
        break;
      case 'agent':
        onChange('agencyName', '');
        onChange('agencyContactName', '');
        onChange('agencyContactPhone', '');
        onChange('agencyContactEmail', '');
        onChange('agencyRefCode', '');
        break;
      default:
        break;
    }
    onChange('leaderType', next);
  };

  const requestLeaderTypeChange = (next: TourLeaderUsageType) => {
    if (next === form.leaderType) return;
    if (hasDataOfCurrentLeaderType()) {
      setPendingLeaderType(next);
      return;
    }
    applyLeaderType(next);
  };

  /** ขอเปลี่ยนประเภท — ถามยืนยันก่อนถ้ามีข้อมูลของประเภทเดิมที่จะถูกล้าง */
  const requestPersonTypeChange = (next: PersonType | undefined) => {
    if (next === form.personType) return;
    if (form.personType && hasDataOfCurrentType()) {
      setPendingPersonType({ next });
      return;
    }
    applyPersonType(next);
  };

  /** เลือกคำนำหน้าไทย → เติมคำนำหน้าอังกฤษให้ (ผู้ใช้แก้เองทีหลังได้) */
  const changeTitleTh = (title: string) => {
    onChange('title', title);
    const mapped = TITLE_TH_TO_EN[title];
    if (mapped) onChange('titleEn', mapped);
  };

  const age = calculateAge(form.birthDate, today);
  const typeChanged = !isNew && leader && leader.leaderType !== form.leaderType;

  /* คำนำหน้าไทย — คงค่าที่บันทึกไว้เดิมไว้ในรายการเสมอ (เช่น "ดร." จากข้อมูลชุดก่อน) */
  const titleOptions =
    form.title && !TITLE_OPTIONS.includes(form.title) && !isForeigner
      ? [...TITLE_OPTIONS, form.title]
      : TITLE_OPTIONS;

  const countryOptions = countries
    .filter((c) => c.isActive || c.id === form.nationalityCountryId)
    .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` }));

  /** สัญชาติของบุคคลต่างชาติต้องไม่ใช่ไทย */
  const nationalityOptions = isForeigner
    ? countryOptions.filter((c) => c.value !== DEFAULT_COUNTRY_ID)
    : countryOptions;

  return (
    <div className="space-y-5">
      {/* =================== Card 1: ข้อมูลส่วนบุคคล =================== */}
      {showSection('personal') && (
      <Card>
        <CardHeader
          title={isForeigner ? '1. ข้อมูลส่วนตัวตามหนังสือเดินทาง' : '1. ข้อมูลส่วนบุคคล'}
          description={
            isForeigner
              ? 'กรอกให้ตรงกับหน้าหนังสือเดินทางทุกช่อง'
              : 'ข้อมูลพื้นฐานของหัวหน้าทัวร์'
          }
        />

        <PhotoPicker
          photoUrl={form.photoUrl}
          initials={`${form.firstName.slice(0, 1)}${form.lastName.slice(0, 1)}` || '—'}
          color={leader?.avatarColor ?? 'bg-blue-600'}
          onChange={(url) => onChange('photoUrl', url)}
        />

        <div className="mt-5 zego-divider-top pt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div data-field="id">
              <TextInput
                label="รหัสหัวหน้าทัวร์"
                required
                value={form.id}
                error={errors.id}
                /* รหัสสร้างอัตโนมัติเสมอ — ผู้ใช้กรอกหรือแก้ไขเองไม่ได้ */
                readOnly
                disabled
                hint="ระบบสร้างรหัสให้อัตโนมัติ"
              />
              {isNew && !errors.id && (
                <p className="-mt-1 inline-flex items-center gap-1 text-xs zego-text-tertiary">
                  <Icon name="info" className="h-3 w-3" />
                  รหัสตัวอย่าง — ระบบจะออกรหัสจริงให้เมื่อกดบันทึก (กันรหัสซ้ำที่ฝั่งเซิร์ฟเวอร์)
                </p>
              )}
            </div>

            {/* ประเภทบุคคล — อยู่ถัดจากรหัสหัวหน้าทัวร์ · กำหนดชุดเอกสารที่ต้องกรอก */}
            <div data-field="personType" className="sm:col-span-2 lg:col-span-3">
              {/* ไม่มีตัวเลือกว่าง — ฟิลด์นี้ต้องมีค่าเสมอ (เริ่มต้น "บุคคลสัญชาติไทย") */}
              <SelectInput
                label="ประเภทบุคคล"
                required
                value={form.personType ?? DEFAULT_PERSON_TYPE}
                error={errors.personType}
                hint="ประเภทที่เลือกจะกำหนดข้อมูลประจำตัวและเอกสารที่ต้องกรอก"
                onChange={(e) => requestPersonTypeChange(e.target.value as PersonType)}
                options={PERSON_TYPE_ORDER.map((p) => ({ value: p, label: PERSON_TYPE[p] }))}
              />
            </div>
          </div>

          {/* รูปแบบการร่วมงาน (ทั่วไป / ประจำ / ฟรีแลนซ์ / เอเจนท์) */}
          <fieldset data-field="leaderType" className="mt-4">
            <legend className="mb-2 text-sm font-medium zego-text-secondary">
              รูปแบบการร่วมงาน <span className="zego-text-danger">*</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEADER_TYPE_ORDER.map((type) => (
                <label
                  key={type}
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    form.leaderType === type
                      ? 'zego-selected-border zego-selected-tint'
                      : 'zego-border-color zego-hover-selected',
                  )}
                >
                  <input
                    type="radio"
                    name="leader-type"
                    checked={form.leaderType === type}
                    onChange={() => requestLeaderTypeChange(type as TourLeaderUsageType)}
                    className="mt-0.5 h-4 w-4 accent-[var(--zego-primary-500)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium zego-text">
                      {LEADER_TYPE[type].label}
                    </span>
                    <span className="block text-xs zego-text-tertiary">{LEADER_TYPE_DESC[type]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* แก้ไขข้อมูลเดิมแล้วเปลี่ยนรูปแบบ → บันทึกเหตุผลลงประวัติ */}
          {typeChanged && (
            <div className="mt-3 space-y-3">
              <Callout tone="amber" title="กำลังเปลี่ยนรูปแบบการร่วมงาน">
                จาก <strong>{LEADER_TYPE[leader!.leaderType].label}</strong> เป็น{' '}
                <strong>{LEADER_TYPE[form.leaderType].label}</strong> —
                ระบบจะบันทึกลงประวัติการเปลี่ยนแปลงให้อัตโนมัติ
              </Callout>
              <TextInput
                label="เหตุผลของการเปลี่ยนรูปแบบการร่วมงาน"
                hint="ไม่บังคับ"
                value={form.typeChangeReason}
                onChange={(e) => onChange('typeChangeReason', e.target.value)}
              />
            </div>
          )}

          {/* ---- รายละเอียดรูปแบบการร่วมงาน — ต่อจากตัวเลือกทันที (ไม่เปิด Modal ใหม่) ----
               “หัวหน้าทัวร์ประจำ” ไม่มีรายละเอียดให้กรอกแล้ว — รหัสพนักงาน · วันที่เริ่มรูปแบบนี้ ·
               หน่วยงาน/ทีม · สถานะการร่วมงาน ถูกนำออกจากหน้าจอเพื่อลดข้อมูลซ้ำซ้อน
               (ฟิลด์ยังอยู่ในโมเดลและข้อมูลเดิมไม่ถูกลบ — ดู mappers.ts) */}
          {form.leaderType === 'general' || form.leaderType === 'regular' ? (
            <p className="mt-3 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
              {form.leaderType === 'regular'
                ? 'ไม่ต้องกรอกรายละเอียดเพิ่มสำหรับหัวหน้าทัวร์ประจำ'
                : 'ยังไม่ได้กำหนดรูปแบบการร่วมงานเฉพาะ'}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border zego-border-color zego-surface-soft-bg p-3">
              <p className="mb-3 text-sm font-semibold zego-text">
                รายละเอียดรูปแบบการร่วมงาน
                <span className="ml-1 font-normal zego-text-tertiary">
                  ({LEADER_TYPE[form.leaderType].label})
                </span>
              </p>

              {/* หัวหน้าทัวร์ฟรีแลนซ์ — ไม่มีข้อมูลบริษัท/เอเจนซี่ */}
              {form.leaderType === 'freelance' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div data-field="payType">
                    <SelectInput
                      label="รูปแบบค่าจ้าง"
                      required
                      placeholder="เลือกรูปแบบค่าจ้าง"
                      value={form.payType ?? ''}
                      error={errors.payType}
                      onChange={(e) => onChange('payType', (e.target.value || undefined) as PayType)}
                      options={PAY_TYPE_ORDER.map((p) => ({ value: p, label: PAY_TYPE[p] }))}
                    />
                  </div>
                  <div data-field="payRate">
                    <TextInput
                      label="อัตราค่าจ้างเบื้องต้น (บาท)"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="เช่น 3500"
                      hint="ไม่บังคับ"
                      value={form.payRate}
                      error={errors.payRate}
                      onChange={(e) => onChange('payRate', e.target.value)}
                    />
                  </div>
                  <div data-field="payUnit">
                    <SelectInput
                      label="หน่วยค่าจ้าง"
                      required={Boolean(form.payRate.trim())}
                      placeholder="เลือกหน่วย"
                      value={form.payUnit ?? ''}
                      error={errors.payUnit}
                      onChange={(e) => onChange('payUnit', (e.target.value || undefined) as PayUnit)}
                      options={PAY_UNIT_ORDER.map((u) => ({ value: u, label: PAY_UNIT[u] }))}
                    />
                  </div>
                </div>
              )}

              {/* หัวหน้าทัวร์เอเจนท์ */}
              {form.leaderType === 'agent' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div data-field="agencyName">
                    <TextInput
                      label="ชื่อเอเจนซี่"
                      required
                      placeholder="เช่น Bangkok Travel Agency"
                      value={form.agencyName}
                      error={errors.agencyName}
                      onChange={(e) => onChange('agencyName', e.target.value)}
                    />
                  </div>
                  <div data-field="agencyContactName">
                    <TextInput
                      label="ชื่อผู้ติดต่อ"
                      required
                      value={form.agencyContactName}
                      error={errors.agencyContactName}
                      onChange={(e) => onChange('agencyContactName', e.target.value)}
                    />
                  </div>
                  <div data-field="agencyContactPhone">
                    <TextInput
                      label="เบอร์โทรศัพท์ผู้ติดต่อ"
                      required
                      type="tel"
                      inputMode="tel"
                      placeholder="081-234-5678"
                      value={form.agencyContactPhone}
                      error={errors.agencyContactPhone}
                      onChange={(e) => onChange('agencyContactPhone', e.target.value)}
                    />
                  </div>
                  <div data-field="agencyContactEmail">
                    <TextInput
                      label="อีเมลผู้ติดต่อ"
                      type="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      hint="ไม่บังคับ"
                      value={form.agencyContactEmail}
                      error={errors.agencyContactEmail}
                      onChange={(e) => onChange('agencyContactEmail', e.target.value)}
                    />
                  </div>
                  <TextInput
                    label="รหัส / เลขอ้างอิงเอเจนซี่"
                    placeholder="เช่น AG-2026-014"
                    hint="ไม่บังคับ"
                    value={form.agencyRefCode}
                    onChange={(e) => onChange('agencyRefCode', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ---- กลุ่มชื่อภาษาไทย (บุคคลต่างชาติไม่ต้องกรอก) ---- */}
          {!isForeigner && (
            <section className="mt-5">
              <h4 className="mb-2 text-sm font-semibold zego-text">ข้อมูลชื่อภาษาไทย</h4>
              <div className={cx('grid gap-4 sm:grid-cols-2', NAME_ROW_GRID)}>
                <div data-field="title">
                  <SelectInput
                    label="คำนำหน้า"
                    required
                    hint="ภาษาไทย"
                    value={form.title}
                    error={errors.title}
                    onChange={(e) => changeTitleTh(e.target.value)}
                    options={titleOptions.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <div data-field="firstName">
                  <TextInput
                    label="ชื่อ"
                    required
                    lang="th"
                    autoComplete="given-name"
                    placeholder="กรอกชื่อ"
                    hint="ภาษาไทย"
                    value={form.firstName}
                    error={errors.firstName}
                    onChange={(e) => onChange('firstName', e.target.value)}
                  />
                </div>
                <div data-field="lastName">
                  <TextInput
                    label="นามสกุล"
                    required
                    lang="th"
                    autoComplete="family-name"
                    placeholder="กรอกนามสกุล"
                    hint="ภาษาไทย"
                    value={form.lastName}
                    error={errors.lastName}
                    onChange={(e) => onChange('lastName', e.target.value)}
                  />
                </div>
                <div data-field="nickname">
                  <TextInput
                    label="ชื่อเล่น"
                    optional
                    lang="th"
                    autoComplete="nickname"
                    placeholder="กรอกชื่อเล่น"
                    value={form.nickname}
                    error={errors.nickname}
                    onChange={(e) => onChange('nickname', e.target.value)}
                  />
                </div>
              </div>
            </section>
          )}

          {/* ---- กลุ่มชื่อภาษาอังกฤษ · บุคคลต่างชาติ = ชื่อตามหนังสือเดินทาง (บังคับ) ---- */}
          <section className="mt-5">
            <h4 className="mb-2 text-sm font-semibold zego-text">
              {isForeigner ? 'ข้อมูลชื่อตามหนังสือเดินทาง' : 'ข้อมูลชื่อภาษาอังกฤษ'}
            </h4>
            <div className={cx('grid gap-4 sm:grid-cols-2', NAME_ROW_GRID)}>
              <div data-field={isForeigner ? 'title' : 'titleEn'}>
                <SelectInput
                  label="คำนำหน้า"
                  required={isForeigner}
                  placeholder={isForeigner ? 'เลือก' : undefined}
                  hint={isForeigner ? 'ตามหนังสือเดินทาง' : 'เติมจากคำนำหน้าไทย'}
                  value={isForeigner ? form.title : form.titleEn}
                  error={isForeigner ? errors.title : errors.titleEn}
                  onChange={(e) => onChange(isForeigner ? 'title' : 'titleEn', e.target.value)}
                  options={TITLE_OPTIONS_EN.map((t) => ({ value: t, label: t }))}
                />
              </div>
              <div data-field="firstNameEn">
                <TextInput
                  label="ชื่อ"
                  required={isForeigner}
                  optional={!isForeigner}
                  lang="en"
                  autoComplete="given-name"
                  placeholder="First name"
                  hint={isForeigner ? 'ตามหนังสือเดินทาง' : undefined}
                  value={form.firstNameEn}
                  error={errors.firstNameEn}
                  onChange={(e) => onChange('firstNameEn', e.target.value)}
                />
              </div>
              <div data-field="lastNameEn">
                <TextInput
                  label="นามสกุล"
                  required={isForeigner}
                  optional={!isForeigner}
                  lang="en"
                  autoComplete="family-name"
                  placeholder="Last name"
                  hint={isForeigner ? 'ตามหนังสือเดินทาง' : undefined}
                  value={form.lastNameEn}
                  error={errors.lastNameEn}
                  onChange={(e) => onChange('lastNameEn', e.target.value)}
                />
              </div>
              <div data-field="nicknameEn">
                <TextInput
                  label="ชื่อเล่น (EN)"
                  optional
                  lang="en"
                  autoComplete="nickname"
                  placeholder="Nickname"
                  value={form.nicknameEn}
                  error={errors.nicknameEn}
                  onChange={(e) => onChange('nicknameEn', e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>


        {/* ---- แถวที่ 3: ข้อมูลบุคคล — แยกออกจากกลุ่มชื่อ ---- */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div data-field="birthDate">
            <DateField
              label="วันเดือนปีเกิด"
              required
              max={today}
              autoComplete="bday"
              value={form.birthDate}
              error={errors.birthDate}
              hint={age !== null ? `อายุ ${age} ปี (คำนวณจากวันเกิด ไม่ได้เก็บซ้ำ)` : undefined}
              onChange={(v) => onChange('birthDate', v)}
            />
          </div>
          <div data-field="gender">
            <SelectInput
              label="เพศ"
              required
              value={form.gender}
              error={errors.gender}
              onChange={(e) => onChange('gender', e.target.value as Gender)}
              options={GENDER_ORDER.map((g) => ({ value: g, label: GENDER[g].label }))}
            />
          </div>
          <div data-field="nationality">
            <SelectInput
              label="สัญชาติ"
              required
              placeholder="เลือกสัญชาติ"
              /* บุคคลสัญชาติไทย → กำหนดเป็นไทยอัตโนมัติและล็อกไว้ */
              disabled={isThai}
              value={form.nationalityCountryId}
              error={errors.nationality}
              hint={
                isThai
                  ? 'กำหนดเป็นไทยอัตโนมัติตามประเภทบุคคล'
                  : isForeigner
                    ? 'บุคคลต่างชาติต้องไม่ใช้สัญชาติไทย'
                    : 'เก็บด้วยรหัสประเทศ (countryId)'
              }
              onChange={(e) => onChange('nationalityCountryId', e.target.value)}
              options={nationalityOptions}
            />
          </div>
          {isForeigner && (
            <div data-field="birthCountryId">
              <SelectInput
                label="ประเทศที่เกิด"
                required
                placeholder="เลือกประเทศ"
                value={form.birthCountryId}
                error={errors.birthCountryId}
                onChange={(e) => onChange('birthCountryId', e.target.value)}
                options={countries
                  .filter((c) => c.isActive || c.id === form.birthCountryId)
                  .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` }))}
              />
            </div>
          )}
        </div>

        {/* ข้อมูลรอง — ซ่อนไว้จนกว่าจะกด (ไม่บังคับกรอกทั้งหมด) */}
        <details className="group mt-4 rounded-lg border zego-border-color zego-surface-soft-bg">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium zego-text-secondary">
            ข้อมูลเพิ่มเติม (ไม่บังคับ) — ศาสนา, สถานภาพสมรส
            <Icon
              name="chevronDown"
              className="h-4 w-4 zego-text-tertiary transition-transform group-open:rotate-180"
            />
          </summary>

          <div className="zego-divider-top p-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectInput
                label="ศาสนา"
                placeholder="ไม่ระบุ"
                hint="ไม่บังคับ"
                value={form.religion ?? ''}
                onChange={(e) => onChange('religion', (e.target.value || undefined) as Religion)}
                options={RELIGION_ORDER.map((r) => ({ value: r, label: RELIGION[r] }))}
              />
              <SelectInput
                label="สถานภาพสมรส"
                placeholder="ไม่ระบุ"
                hint="ไม่บังคับ"
                value={form.maritalStatus ?? ''}
                onChange={(e) =>
                  onChange('maritalStatus', (e.target.value || undefined) as MaritalStatus)
                }
                options={MARITAL_STATUS_ORDER.map((m) => ({ value: m, label: MARITAL_STATUS[m] }))}
              />

              {/* ช่องระบุเพิ่มเติมเมื่อเลือก "ศาสนาอื่น" */}
              {form.religion === 'other' && (
                <div data-field="religionOther">
                  <TextInput
                    label="ระบุศาสนาเพิ่มเติม"
                    required
                    value={form.religionOther}
                    error={errors.religionOther}
                    onChange={(e) => onChange('religionOther', e.target.value)}
                  />
                </div>
              )}
            </div>

            <p className="mt-3 text-xs zego-text-tertiary">
              ℹ️ ศาสนา เพศ และสถานภาพสมรส เป็นข้อมูลเพื่อการดูแลสวัสดิการเท่านั้น —
              <strong className="zego-text-secondary"> ไม่ถูกนำไปคำนวณคะแนนความเหมาะสมกับงาน</strong>
            </p>
          </div>
        </details>
      </Card>
      )}

      {/* ============ Card 2: เอกสารประจำตัว (ตามประเภทบุคคล) ============ */}
      {showSection('documents') && (
      <Card>
        <CardHeader
          title={numbered(
            2,
            isForeigner
              ? 'ข้อมูลหนังสือเดินทาง'
              : isThai
                ? 'ข้อมูลบัตรประชาชน (ไม่บังคับ)'
                : 'เอกสารประจำตัว',
          )}
          description={
            isForeigner
              ? 'หนังสือเดินทาง วีซ่า และใบอนุญาตทำงาน — กรอกให้ตรงกับเอกสารจริง'
              : isThai
                ? 'สามารถเว้นว่างได้ และกลับมาเพิ่มข้อมูลภายหลัง'
                : `ชุดเอกสารเปลี่ยนตามประเภทบุคคลที่เลือกไว้${personTypeSource}`
          }
        />

        {!form.personType && (
          <Callout tone="blue" title="เลือกประเภทบุคคล">
            เลือก <strong>{PERSON_TYPE.thai}</strong> หรือ <strong>{PERSON_TYPE.foreigner}</strong>{' '}
            {personTypeSource} เพื่อแสดงช่องกรอกเอกสารที่ต้องใช้
          </Callout>
        )}

        {/* ---- คนไทย: บัตรประชาชน ---- */}
        {isThai && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div data-field="nationalIdNumber">
              <TextInput
                label="เลขบัตรประชาชน"
                optional
                inputMode="numeric"
                maxLength={13}
                placeholder="1234567890123"
                hint="ไม่บังคับ · ถ้ากรอกต้องครบ 13 หลัก · ระบบจะปิดบังเลขก่อนบันทึกเสมอ (Demo ไม่เก็บเลขจริง)"
                value={form.nationalIdNumber}
                error={errors.nationalIdNumber}
                onChange={(e) => onChange('nationalIdNumber', e.target.value)}
              />
            </div>
            <div data-field="nationalIdExpiresAt">
              <DateField
                label="วันหมดอายุบัตรประชาชน"
                optional
                hint="ไม่บังคับ"
                value={form.nationalIdExpiresAt}
                error={errors.nationalIdExpiresAt}
                onChange={(v) => onChange('nationalIdExpiresAt', v)}
              />
            </div>
          </div>
        )}

        {/* ---- บุคคลต่างชาติ: หนังสือเดินทาง / วีซ่า / ใบอนุญาตทำงาน ---- */}
        {isForeigner && (
          <div className="space-y-5">
            <div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div data-field="passportNumber">
                  <TextInput
                    label="หมายเลขหนังสือเดินทาง"
                    required
                    placeholder="AA1234567"
                    hint="ระบบจะปิดบังเลขก่อนบันทึกเสมอ"
                    value={form.passportNumber}
                    error={errors.passportNumber}
                    onChange={(e) => onChange('passportNumber', e.target.value.toUpperCase())}
                  />
                </div>
                <div data-field="passportCountryId">
                  <SelectInput
                    label="ประเทศที่ออกหนังสือเดินทาง"
                    required
                    placeholder="เลือกประเทศ"
                    value={form.passportCountryId}
                    error={errors.passportCountryId}
                    onChange={(e) => onChange('passportCountryId', e.target.value)}
                    options={countries
                      .filter((c) => c.isActive || c.id === form.passportCountryId)
                      .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` }))}
                  />
                </div>
                <div data-field="passportIssuedAt">
                  <DateField
                    label="วันที่ออกหนังสือเดินทาง"
                    required
                    value={form.passportIssuedAt}
                    error={errors.passportIssuedAt}
                    onChange={(v) => onChange('passportIssuedAt', v)}
                  />
                </div>
                <div data-field="passportExpiresAt">
                  <DateField
                    label="วันหมดอายุหนังสือเดินทาง"
                    required
                    min={form.passportIssuedAt || undefined}
                    value={form.passportExpiresAt}
                    error={errors.passportExpiresAt}
                    onChange={(v) => onChange('passportExpiresAt', v)}
                  />
                </div>
              </div>
            </div>

            <div className="zego-divider-top pt-5">
              <p className="mb-3 text-sm font-semibold zego-text">วีซ่า</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div data-field="visaStatus">
                  <SelectInput
                    label="สถานะวีซ่า"
                    required
                    placeholder="เลือกสถานะ"
                    value={form.visaStatus ?? ''}
                    error={errors.visaStatus}
                    onChange={(e) =>
                      onChange('visaStatus', (e.target.value || undefined) as DocHoldingStatus)
                    }
                    options={DOC_HOLDING_STATUS_ORDER.map((s) => ({
                      value: s,
                      label: DOC_HOLDING_STATUS[s],
                    }))}
                  />
                </div>

                {/* รายละเอียดวีซ่า — แสดงเฉพาะเมื่อสถานะเป็น "มี" */}
                {form.visaStatus === 'has' && (
                  <>
                    <div data-field="visaType">
                      <TextInput
                        label="ประเภทวีซ่า"
                        required
                        placeholder="เช่น Non-B"
                        value={form.visaType}
                        error={errors.visaType}
                        onChange={(e) => onChange('visaType', e.target.value)}
                      />
                    </div>
                    <div data-field="visaNumber">
                      <TextInput
                        label="หมายเลขวีซ่า"
                        required
                        value={form.visaNumber}
                        error={errors.visaNumber}
                        onChange={(e) => onChange('visaNumber', e.target.value)}
                      />
                    </div>
                    <div data-field="visaExpiresAt">
                      <DateField
                        label="วันหมดอายุวีซ่า"
                        required
                        value={form.visaExpiresAt}
                        error={errors.visaExpiresAt}
                        onChange={(v) => onChange('visaExpiresAt', v)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="zego-divider-top pt-5">
              <p className="mb-3 text-sm font-semibold zego-text">ใบอนุญาตทำงาน</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div data-field="workPermitStatus">
                  <SelectInput
                    label="สถานะใบอนุญาตทำงาน"
                    required
                    placeholder="เลือกสถานะ"
                    value={form.workPermitStatus ?? ''}
                    error={errors.workPermitStatus}
                    onChange={(e) =>
                      onChange(
                        'workPermitStatus',
                        (e.target.value || undefined) as DocHoldingStatus,
                      )
                    }
                    options={DOC_HOLDING_STATUS_ORDER.map((s) => ({
                      value: s,
                      label: DOC_HOLDING_STATUS[s],
                    }))}
                  />
                </div>

                {/* รายละเอียดใบอนุญาตทำงาน — แสดงเฉพาะเมื่อสถานะเป็น "มี" */}
                {form.workPermitStatus === 'has' && (
                  <>
                    <div data-field="workPermitNumber">
                      <TextInput
                        label="หมายเลขใบอนุญาตทำงาน"
                        required
                        value={form.workPermitNumber}
                        error={errors.workPermitNumber}
                        onChange={(e) => onChange('workPermitNumber', e.target.value)}
                      />
                    </div>
                    <div data-field="workPermitExpiresAt">
                      <DateField
                        label="วันหมดอายุใบอนุญาตทำงาน"
                        required
                        value={form.workPermitExpiresAt}
                        error={errors.workPermitExpiresAt}
                        onChange={(v) => onChange('workPermitExpiresAt', v)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* ==================== Card 3: ที่อยู่ปัจจุบัน ==================== */}
      {showSection('address') && (
      <Card>
        <CardHeader
          title={numbered(3, isForeigner ? 'ที่อยู่ปัจจุบันในประเทศไทย (ไม่บังคับ)' : 'ที่อยู่ปัจจุบัน (ไม่บังคับ)')}
          description="สามารถเว้นว่างได้ และกลับมาเพิ่มข้อมูลภายหลัง"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div data-field="houseNo">
            <TextInput
              label="บ้านเลขที่"
              error={errors.houseNo}
              value={form.address.houseNo}
              onChange={(e) => setAddress({ houseNo: e.target.value })}
            />
          </div>
          <TextInput
            label="อาคาร / หมู่บ้าน"
            value={form.address.building ?? ''}
            onChange={(e) => setAddress({ building: e.target.value })}
          />
          <TextInput
            label="หมู่"
            value={form.address.villageNo ?? ''}
            onChange={(e) => setAddress({ villageNo: e.target.value })}
          />
          <TextInput
            label="ซอย"
            value={form.address.alley ?? ''}
            onChange={(e) => setAddress({ alley: e.target.value })}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="ถนน"
            value={form.address.road ?? ''}
            onChange={(e) => setAddress({ road: e.target.value })}
          />

          {/* จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์ (ลำดับต่อเนื่อง) */}
          <ThaiAddressFields
            address={form.address}
            errors={errors}
            fieldPrefix=""
            required={false}
            onChange={(next) => setFullAddress(next)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectInput
            label="ประเทศ"
            hint="ไม่บังคับ"
            value={form.address.countryId}
            onChange={(e) => setAddress({ countryId: e.target.value })}
            options={countries
              .filter((c) => c.isActive || c.id === form.address.countryId)
              .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` }))}
          />
          <TextInput
            label="หมายเหตุเกี่ยวกับที่อยู่"
            placeholder="เช่น ที่อยู่ตามทะเบียนบ้านต่างจากที่พักปัจจุบัน"
            value={form.address.note ?? ''}
            onChange={(e) => setAddress({ note: e.target.value })}
          />
        </div>
      </Card>
      )}

      {/* ====== Card 4: ที่อยู่ในประเทศต้นทาง (บุคคลต่างชาติ · ข้อมูลเสริม) ====== */}
      {showSection('address') && isForeigner && (
        <Card>
          <CardHeader
            title={numbered(4, 'ที่อยู่ในประเทศต้นทาง')}
            description="ข้อมูลเสริม — ใช้กับการติดต่อกลับประเทศต้นทางและงานเอกสาร"
          />

          {/* สวิตช์ — เป็น checkbox จริงเพื่อให้ใช้คีย์บอร์ดและ screen reader ได้ */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border zego-border-color zego-surface-soft-bg p-3 sm:items-center">
            <input
              type="checkbox"
              role="switch"
              checked={form.hasHomeCountryAddress}
              aria-controls="home-country-address"
              aria-expanded={form.hasHomeCountryAddress}
              onChange={(e) => requestHomeAddressToggle(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--zego-primary-500)] sm:mt-0"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium zego-text-secondary">
                ระบุที่อยู่ในประเทศต้นทาง
              </span>
              {!form.hasHomeCountryAddress && (
                <span className="block text-xs zego-text-tertiary">
                  ไม่บังคับ สามารถเปิดเพื่อเพิ่มข้อมูลได้
                </span>
              )}
            </span>
          </label>

          {form.hasHomeCountryAddress && (
            <div id="home-country-address" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div data-field="homeAddressLine">
                  <TextInput
                    label="ที่อยู่"
                    required
                    placeholder="เช่น 2-1 Nishi-Shinjuku, Apt. 501"
                    hint="บ้านเลขที่ อาคาร และถนน ตามรูปแบบของประเทศต้นทาง"
                    value={form.homeCountryAddress.houseNo}
                    error={errors.homeAddressLine}
                    onChange={(e) => setHomeAddress({ houseNo: e.target.value })}
                  />
                </div>
                <div data-field="homeCountry">
                  <SelectInput
                    label="ประเทศ"
                    required
                    placeholder="เลือกประเทศ"
                    value={form.homeCountryAddress.countryId}
                    error={errors.homeCountry}
                    onChange={(e) => setHomeAddress({ countryId: e.target.value })}
                    options={countries
                      .filter((c) => c.isActive || c.id === form.homeCountryAddress.countryId)
                      .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextInput
                  label="เมือง"
                  placeholder="เช่น Tokyo"
                  hint="ไม่บังคับ"
                  value={form.homeCountryAddress.district ?? ''}
                  onChange={(e) => setHomeAddress({ district: e.target.value })}
                />
                <TextInput
                  label="รัฐ / จังหวัด / ภูมิภาค"
                  placeholder="เช่น Kanto"
                  hint="ไม่บังคับ"
                  value={form.homeCountryAddress.province ?? ''}
                  onChange={(e) => setHomeAddress({ province: e.target.value })}
                />
                <TextInput
                  label="รหัสไปรษณีย์"
                  placeholder="เช่น 100-0001"
                  hint="ไม่บังคับ · รูปแบบตามประเทศต้นทาง"
                  value={form.homeCountryAddress.postalCode ?? ''}
                  onChange={(e) => setHomeAddress({ postalCode: e.target.value })}
                />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ============ Card 4: ที่อยู่ตามบัตรประชาชน (คนไทย) ============ */}
      {showSection('idAddress') && isThai && (
      <Card>
        <CardHeader
          title={numbered(4, 'ที่อยู่ตามบัตรประชาชน (ไม่บังคับ)')}
          description="สามารถเว้นว่างได้ และกลับมาเพิ่มข้อมูลภายหลัง — ติ๊กช่องด้านล่างหากตรงกับที่อยู่ปัจจุบัน"
        />

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border zego-border-color zego-surface-soft-bg p-3 text-sm zego-text-secondary sm:items-center">
          <input
            type="checkbox"
            checked={sameAsCurrent}
            onChange={(e) => toggleSameAsCurrent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--zego-primary-500)] sm:mt-0"
          />
          <span>
            เหมือนกับที่อยู่ปัจจุบัน
            <span className="block text-xs zego-text-tertiary sm:inline sm:before:content-['_—_']">
              ระบบจะคัดลอกข้อมูลให้อัตโนมัติและอัปเดตตามเมื่อแก้ที่อยู่ปัจจุบัน
            </span>
          </span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div data-field="idCardHouseNo">
            <TextInput
              label="บ้านเลขที่"
              disabled={sameAsCurrent}
              value={form.idCardAddress.houseNo}
              error={errors.idCardHouseNo}
              onChange={(e) => setIdCardAddress({ houseNo: e.target.value })}
            />
          </div>
          <TextInput
            label="หมู่"
            disabled={sameAsCurrent}
            value={form.idCardAddress.villageNo ?? ''}
            onChange={(e) => setIdCardAddress({ villageNo: e.target.value })}
          />
          <TextInput
            label="อาคาร / หมู่บ้าน"
            disabled={sameAsCurrent}
            value={form.idCardAddress.building ?? ''}
            onChange={(e) => setIdCardAddress({ building: e.target.value })}
          />
          <TextInput
            label="ซอย"
            disabled={sameAsCurrent}
            value={form.idCardAddress.alley ?? ''}
            onChange={(e) => setIdCardAddress({ alley: e.target.value })}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="ถนน"
            disabled={sameAsCurrent}
            value={form.idCardAddress.road ?? ''}
            onChange={(e) => setIdCardAddress({ road: e.target.value })}
          />

          {/* จังหวัด → เขต/อำเภอ → แขวง/ตำบล → รหัสไปรษณีย์ (พฤติกรรมเดียวกับที่อยู่ปัจจุบัน · ไม่บังคับ) */}
          <ThaiAddressFields
            address={form.idCardAddress}
            errors={errors}
            fieldPrefix="idCard"
            required={false}
            disabled={sameAsCurrent}
            onChange={(next) => onChange('idCardAddress', next)}
          />
        </div>
      </Card>
      )}

      {/* ============ Card 5: ข้อมูลระบบและหมายเหตุ ============ */}
      {showSection('system') && (
      <Card>
        <CardHeader
          title="5. ข้อมูลระบบและหมายเหตุ"
          description="วันที่และผู้สร้างระบบกำหนดให้อัตโนมัติ"
        />

        <div className={cx('grid items-start gap-4 sm:grid-cols-2', SYSTEM_ROW_GRID)}>
          <div data-field="joinedAt">
            <DateField
              label="วันที่เริ่มร่วมงาน"
              required
              value={form.joinedAt}
              error={errors.joinedAt}
              hint="วันที่เริ่มมีความสัมพันธ์กับบริษัท"
              onChange={(v) => onChange('joinedAt', v)}
            />
          </div>

          <SelectInput
            label="แหล่งที่มาของข้อมูล"
            optional
            placeholder="ไม่ระบุ"
            value={form.sourceType ?? ''}
            onChange={(e) =>
              onChange('sourceType', (e.target.value || undefined) as LeaderSourceType)
            }
            options={LEADER_SOURCE_TYPE_ORDER.map((s) => ({
              value: s,
              label: LEADER_SOURCE_TYPE[s],
            }))}
          />

          {/* สถานะข้อมูล — Switch พร้อมข้อความกำกับ (ไม่สื่อความหมายด้วยสีอย่างเดียว) */}
          <div data-field="active" className="grid content-start gap-1.5">
            <span className="flex min-h-6 items-center text-sm font-medium zego-text-secondary">
              สถานะข้อมูล
            </span>

            <div
              className={cx(
                /* สูงเท่ากับช่อง select/date ในแถวเดียวกัน → Label, Input และ Helper อยู่ในแนวเดียวกัน */
                'flex h-[41px] items-center gap-3 rounded-lg border px-3 transition-colors',
                form.active
                  ? 'zego-status-bar--success'
                  : 'zego-status-bar--warning',
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                aria-label="สถานะข้อมูล"
                onClick={() => requestActiveChange(!form.active)}
                className={cx(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
                  form.active ? 'bg-[var(--zego-success)]' : 'bg-[var(--zego-text-disabled)]',
                )}
              >
                <span
                  className={cx(
                    'pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    form.active ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </button>

              <span
                className={cx(
                  'text-sm font-medium',
                  form.active ? 'zego-text-success' : 'zego-text-warning',
                )}
              >
                {form.active ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
              </span>
            </div>

            <p className="text-xs zego-text-tertiary">
              {form.active
                ? 'สามารถเลือกหัวหน้าทัวร์รายนี้ไปจัดทริปได้'
                : 'ไม่สามารถเลือกไปจัดทริปใหม่ แต่ข้อมูลเดิมยังคงอยู่'}
            </p>
          </div>
        </div>

        {form.sourceType === 'other' && (
          <div data-field="sourceOther" className="mt-4 sm:max-w-md">
            <TextInput
              label="ระบุช่องทางอื่น"
              required
              value={form.sourceOther}
              error={errors.sourceOther}
              onChange={(e) => onChange('sourceOther', e.target.value)}
            />
          </div>
        )}

        {/* ---- หมายเหตุ ---- */}
        <div className="mt-5 space-y-4 zego-divider-top pt-5">
          <div data-field="generalNote">
            <TextArea
              label="หมายเหตุทั่วไป"
              optional
              rows={2}
              maxLength={NOTE_MAX_LENGTH.generalNote}
              hint={noteCounter(form.generalNote, NOTE_MAX_LENGTH.generalNote)}
              error={errors.generalNote}
              value={form.generalNote}
              onChange={(e) => onChange('generalNote', e.target.value)}
            />
          </div>

          {/* หมายเหตุภายใน + ข้อควรระวัง — ซ่อนไว้ · เปิดอัตโนมัติเมื่อมีข้อมูลอยู่แล้ว */}
          <details open={hasExtraNotes} className="group rounded-lg border zego-border-color zego-surface-soft-bg">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium zego-text-secondary">
              <span className="flex items-center gap-2">
                ข้อมูลเพิ่มเติม — หมายเหตุภายใน, ข้อควรระวัง
                {hasExtraNotes && <Pill tone="blue">มีข้อมูล</Pill>}
              </span>
              <Icon
                name="chevronDown"
                className="h-4 w-4 shrink-0 zego-text-tertiary transition-transform group-open:rotate-180"
              />
            </summary>

            <div className="space-y-4 zego-divider-top p-3">
              {canSeeInternalNote && (
                <div data-field="internalNote">
                  <TextArea
                    label="หมายเหตุภายใน"
                    optional
                    rows={2}
                    maxLength={NOTE_MAX_LENGTH.internalNote}
                    hint={
                      noteCounter(form.internalNote, NOTE_MAX_LENGTH.internalNote) ??
                      '🔒 เห็นเฉพาะผู้มีสิทธิ์ (ผู้ดูแลระบบ / ฝ่ายบุคคล) — หัวหน้าทัวร์ไม่เห็นข้อความนี้'
                    }
                    error={errors.internalNote}
                    value={form.internalNote}
                    onChange={(e) => onChange('internalNote', e.target.value)}
                  />
                </div>
              )}

              <div data-field="cautions">
                <TextArea
                  label="ข้อควรระวัง"
                  optional
                  rows={2}
                  maxLength={NOTE_MAX_LENGTH.cautions}
                  placeholder="เช่น แพ้อาหารทะเล / พาสปอร์ตใกล้หมดอายุ"
                  hint={
                    noteCounter(form.cautions, NOTE_MAX_LENGTH.cautions) ??
                    'จะแสดงเป็น Callout เด่นในหน้ารายละเอียด'
                  }
                  error={errors.cautions}
                  value={form.cautions}
                  onChange={(e) => onChange('cautions', e.target.value)}
                />
              </div>
            </div>
          </details>
        </div>


        {/* ข้อมูลระบบ — อ่านอย่างเดียว */}
        {leader && (
          <dl className="mt-5 grid gap-3 zego-divider-top pt-4 text-xs sm:grid-cols-2">
            <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
              <dt className="zego-text-tertiary">วันที่เพิ่มข้อมูล / ผู้เพิ่ม</dt>
              <dd className="mt-0.5 zego-text-secondary">
                {formatDateTime(leader.createdAt)} · {leader.createdBy}
              </dd>
            </div>
            <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
              <dt className="zego-text-tertiary">วันที่แก้ไขล่าสุด / ผู้แก้ไข</dt>
              <dd className="mt-0.5 zego-text-secondary">
                {formatDateTime(leader.updatedAt)} · {leader.updatedBy}
              </dd>
            </div>
          </dl>
        )}
      </Card>
      )}

      {/* ====== ยืนยันก่อนล้างข้อมูลของประเภทบุคคลเดิม ====== */}
      <Modal
        open={pendingPersonType !== null}
        onClose={() => setPendingPersonType(null)}
        size="sm"
        title="เปลี่ยนประเภทบุคคล?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingPersonType(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                applyPersonType(pendingPersonType?.next);
                setPendingPersonType(null);
              }}
            >
              เปลี่ยนและล้างข้อมูล
            </Button>
          </>
        }
      >
        <Callout tone="amber" title="ข้อมูลของประเภทเดิมจะถูกล้าง">
          {form.personType === 'thai'
            ? 'เลขบัตรประชาชน วันหมดอายุบัตร และที่อยู่ตามบัตรประชาชน จะถูกล้างทั้งหมด'
            : 'หนังสือเดินทาง วีซ่า ใบอนุญาตทำงาน ที่อยู่ในประเทศไทย และที่อยู่ในประเทศต้นทาง จะถูกล้างทั้งหมด'}
        </Callout>
        <p className="mt-3 text-sm zego-text-secondary">
          ข้อมูลส่วนอื่น เช่น ชื่อ ที่อยู่ปัจจุบัน และรูปแบบการร่วมงาน จะยังอยู่ครบ
        </p>
      </Modal>

      {/* ====== ยืนยันก่อนปิดสวิตช์ "ระบุที่อยู่ในประเทศต้นทาง" ====== */}
      <Modal
        open={confirmHomeAddressOff}
        onClose={() => setConfirmHomeAddressOff(false)}
        size="sm"
        title="ต้องการยกเลิกการระบุที่อยู่ในประเทศต้นทางหรือไม่"
        footer={
          <>
            {/* ยกเลิก → สวิตช์ยังเปิดอยู่และข้อมูลคงเดิม */}
            <Button variant="ghost" onClick={() => setConfirmHomeAddressOff(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearHomeAddress();
                setConfirmHomeAddressOff(false);
              }}
            >
              ยกเลิกและล้างข้อมูล
            </Button>
          </>
        }
      >
        <Callout tone="amber" title="ข้อมูลที่อยู่ในประเทศต้นทางจะถูกล้าง">
          ที่อยู่ เมือง รัฐ/จังหวัด/ภูมิภาค ประเทศ และรหัสไปรษณีย์ จะถูกล้างและไม่ถูกบันทึก
        </Callout>
        <p className="mt-3 text-sm zego-text-secondary">
          ที่อยู่ปัจจุบันในประเทศไทยเป็นคนละส่วน — จะไม่ได้รับผลกระทบ
        </p>
      </Modal>

      {/* ====== ยืนยันก่อนล้างรายละเอียดของรูปแบบการร่วมงานเดิม ====== */}
      <Modal
        open={pendingLeaderType !== null}
        onClose={() => setPendingLeaderType(null)}
        size="sm"
        title="เปลี่ยนรูปแบบการร่วมงาน?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingLeaderType(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingLeaderType) applyLeaderType(pendingLeaderType);
                setPendingLeaderType(null);
              }}
            >
              เปลี่ยนและล้างข้อมูล
            </Button>
          </>
        }
      >
        <Callout tone="amber" title="รายละเอียดของรูปแบบเดิมจะถูกล้าง">
          รายละเอียดของ “{LEADER_TYPE[form.leaderType].label}” ที่กรอกไว้จะถูกล้างและไม่ถูกบันทึก
        </Callout>
        <p className="mt-3 text-sm zego-text-secondary">
          ข้อมูลส่วนกลาง เช่น ข้อมูลส่วนตัว ที่อยู่ และช่องทางติดต่อ จะยังอยู่ครบ
        </p>
      </Modal>

      {/* ====== ยืนยันก่อนระงับการใช้งาน ====== */}
      <Modal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        size="sm"
        title="ระงับการใช้งานหัวหน้าทัวร์รายนี้?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onChange('active', false);
                setConfirmDeactivate(false);
              }}
            >
              ระงับการใช้งาน
            </Button>
          </>
        }
      >
        <Callout tone="amber" title="จะไม่สามารถเลือกไปจัดทริปใหม่ได้">
          หัวหน้าทัวร์รายนี้จะไม่ปรากฏให้เลือกเมื่อสร้างงานทัวร์ใหม่
        </Callout>
        <p className="mt-3 text-sm zego-text-secondary">
          ข้อมูลเดิม ประวัติงาน และเอกสารทั้งหมด <strong>ไม่ถูกลบ</strong> — เปิดใช้งานกลับได้ทุกเมื่อ
        </p>
      </Modal>
    </div>
  );
}
