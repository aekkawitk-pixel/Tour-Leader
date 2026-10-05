'use client';

/**
 * Flow B — Modal แก้ไข "เฉพาะหมวดเดียว" ของหัวหน้าทัวร์ที่มีข้อมูลอยู่แล้ว (§1/§2)
 *
 * ⚠️ ห้ามมี Tab · แสดงเฉพาะข้อมูลของหมวดที่กดเข้ามา (§7/§8)
 *    เริ่มจาก leaderToForm(leader) เสมอ → บันทึกทับเฉพาะหมวดนี้ ส่วนอื่นคงค่าเดิม (§9/§10)
 *    ตรวจความถูกต้องเฉพาะช่องของหมวดนี้ — error ของหมวดอื่นไม่บล็อกการบันทึก
 *
 * แต่ละหมวดมีจุดแก้ไขเพียงแห่งเดียว (§9) — ดูตารางความเป็นเจ้าของฟิลด์ที่ SECTION_FIELDS
 */

import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Button, Callout, cx, StatusBadge } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { useDemo } from '@/store/DemoStore';
import { formatDate } from '@/lib/format';
import {
  LEADER_TYPE, LEADER_TYPE_DESC, LEADER_TYPE_ORDER,
  PAY_TYPE, PAY_TYPE_ORDER, PAY_UNIT, PAY_UNIT_ORDER,
  PERSON_TYPE, PERSON_TYPE_ORDER, LEADER_USAGE_STATUS,
} from '@/lib/labels';
import { leaderToForm, type LeaderFormState } from '@/modules/tour-leaders/mappers';
import { DEFAULT_PERSON_TYPE } from '@/modules/tour-leaders/constants';
import { validateLeaderForm, type FieldError } from '@/modules/tour-leaders/validation';
import { saveErrorMessage } from '@/services/browserStorage';
import { ContactEditor } from './ContactEditor';
import { EmergencyContactEditor } from './EmergencyContactEditor';
import { EmploymentHistoryEditor } from './EmploymentHistoryEditor';
import { BankAccountEditor } from './BankAccountEditor';
import { GeneralInfoStep } from './GeneralInfoStep';
import type {
  LeaderType, PayType, PayUnit, PersonType, TourLeader,
} from '@/types';

/** หมวดที่แก้ไขแยกได้ — 1 หมวด = 1 Card = 1 Modal (§1) */
export type LeaderSectionKey =
  | 'contact'
  | 'employment'
  | 'identity-docs'
  | 'work-history'
  | 'bank';

const SECTION_META: Record<LeaderSectionKey, { title: string; saveLabel: string; description: string }> = {
  contact: {
    title: 'แก้ไขข้อมูลติดต่อ',
    saveLabel: 'บันทึกข้อมูลติดต่อ',
    description: 'ช่องทางติดต่อ ที่อยู่ปัจจุบัน และผู้ติดต่อฉุกเฉิน',
  },
  employment: {
    title: 'แก้ไขข้อมูลการร่วมงาน',
    saveLabel: 'บันทึกข้อมูลการร่วมงาน',
    description: 'ประเภทบุคคล รูปแบบการร่วมงาน และรายละเอียดตามรูปแบบที่เลือก',
  },
  'identity-docs': {
    title: 'แก้ไขเอกสารประจำตัว',
    saveLabel: 'บันทึกเอกสารประจำตัว',
    description: 'เอกสารประจำตัวตามประเภทบุคคล และที่อยู่ตามบัตรประชาชน',
  },
  'work-history': {
    title: 'แก้ไขประวัติการทำงาน',
    saveLabel: 'บันทึกประวัติการทำงาน',
    description: 'ประวัติการทำงานกับสถานประกอบการ — คนละส่วนกับงานทัวร์ที่ได้รับมอบหมายในระบบ',
  },
  bank: {
    title: 'แก้ไขบัญชีธนาคาร',
    saveLabel: 'บันทึกบัญชีธนาคาร',
    description: 'บัญชีรับเงินของหัวหน้าทัวร์ — เลขบัญชีถูกปิดบังก่อนบันทึกเสมอ',
  },
};

/** ช่องที่ "เป็นเจ้าของ" โดยแต่ละหมวด — ใช้กรอง error ให้เหลือเฉพาะของหมวดนี้ (§9) */
const SECTION_FIELDS: Partial<Record<LeaderSectionKey, readonly string[]>> = {
  contact: ['province', 'postalCode', 'houseNo', 'district', 'subdistrict', 'homeAddressLine', 'homeCountry'],
  employment: [
    'personType', 'leaderType', 'employeeCode', 'typeStartDate', 'workStatus',
    'payType', 'payRate', 'payUnit',
    'agencyName', 'agencyContactName', 'agencyContactPhone', 'agencyContactEmail',
  ],
  'identity-docs': [
    'nationalIdNumber', 'nationalIdExpiresAt',
    'idCardHouseNo', 'idCardProvince', 'idCardDistrict', 'idCardSubdistrict', 'idCardPostalCode',
    'birthCountryId', 'passportNumber', 'passportCountryId', 'passportIssuedAt', 'passportExpiresAt',
    'visaStatus', 'visaType', 'visaNumber', 'visaExpiresAt',
    'workPermitStatus', 'workPermitNumber', 'workPermitExpiresAt',
  ],
};

export function LeaderSectionEditModal({
  open, leader, section, onClose, onSaved,
}: {
  open: boolean;
  leader: TourLeader | null;
  section: LeaderSectionKey;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!open || !leader) return null;
  return (
    <SectionForm
      key={`${leader.id}-${section}`}
      leader={leader}
      section={section}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function SectionForm({
  leader, section, onClose, onSaved,
}: {
  leader: TourLeader;
  section: LeaderSectionKey;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const {
    master, countries, leaders, today, saving, currentUser, saveLeaderForm,
  } = useDemo();

  const meta = SECTION_META[section];
  const initial = useMemo<LeaderFormState>(() => leaderToForm(leader), [leader]);
  const [form, setForm] = useState<LeaderFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const submitting = useRef(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const set = <K extends keyof LeaderFormState>(key: K, value: LeaderFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSeeSalary = currentUser.role === 'admin' || currentUser.role === 'accounting';

  /** error ที่เป็นของหมวดนี้เท่านั้น — ห้ามให้ข้อมูลหมวดอื่นบล็อกการบันทึก */
  const isRelevant = (e: FieldError): boolean => {
    const owned = SECTION_FIELDS[section];
    if (owned?.includes(e.field)) return true;
    switch (section) {
      case 'contact':
        return e.step === 'contact';
      case 'work-history':
        return e.step === 'employment';
      case 'bank':
        return e.step === 'finance' && (e.field === 'bankAccounts' || form.bankAccounts.some((b) => b.id === e.field));
      default:
        return false;
    }
  };

  const focusField = (field?: string) => {
    if (!field) return;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    }, 100);
  };

  const save = async () => {
    if (submitting.current || saving) return;
    const validation = validateLeaderForm(form, { existingLeaders: leaders, isNew: false, today });
    const relevant = validation.errors.filter(isRelevant);
    if (relevant.length > 0) {
      const byField: Record<string, string> = {};
      for (const e of relevant) if (!byField[e.field]) byField[e.field] = e.message;
      setErrors(byField);
      setSaveError(`พบข้อผิดพลาด ${relevant.length} รายการ — กรุณาตรวจสอบก่อนบันทึก`);
      focusField(relevant[0].field);
      return;
    }
    setErrors({});
    submitting.current = true;
    setSaveError(null);
    try {
      // §10 บันทึกจากข้อมูลล่าสุดของหัวหน้าทัวร์ + เฉพาะช่องที่แก้ในหมวดนี้ → ไม่เขียนทับหมวดอื่น
      // แจ้งผลสำเร็จที่ saveLeaderForm จุดเดียว (กัน Toast ซ้ำ) — ปิด Modal หลังบันทึกสำเร็จเท่านั้น
      await saveLeaderForm(form, leader, meta.title);
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      submitting.current = false;
    }
  };

  /** §8 ปิดทันทีถ้ายังไม่แก้ · แก้แล้วต้องยืนยันก่อน (รวมคลิกนอก Modal) */
  const requestClose = () => { if (dirty) setConfirmLeave(true); else onClose(); };

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        size={section === 'employment' || section === 'contact' ? 'lg' : 'xl'}
        title={meta.title}
        description={`${leader.firstName} ${leader.lastName} · ${leader.id} — ${meta.description}`}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-rose-600">{saveError ?? ''}</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>ยกเลิก</Button>
              <Button variant="primary" onClick={save} loading={saving} disabled={saving}>{meta.saveLabel}</Button>
            </span>
          </div>
        }
      >
        {section === 'contact' && (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold zego-text">ช่องทางติดต่อ</h3>
              <div data-field="contacts">
                {errors.contacts && (
                  <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                    {errors.contacts}
                  </p>
                )}
                <ContactEditor contacts={form.contacts} errors={errors} onChange={(next) => set('contacts', next)} />
              </div>
            </section>

            <section className="zego-divider-top pt-5">
              <h3 className="mb-2 text-sm font-semibold zego-text">ผู้ติดต่อฉุกเฉิน</h3>
              <div data-field="emergencyContacts">
                {errors.emergencyContacts && (
                  <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                    {errors.emergencyContacts}
                  </p>
                )}
                <EmergencyContactEditor contacts={form.emergencyContacts} errors={errors} onChange={(next) => set('emergencyContacts', next)} />
              </div>
            </section>

            {/* ที่อยู่ปัจจุบัน — ใช้ฟอร์มชุดเดียวกับตอนเพิ่มข้อมูล (ไม่สร้างฟอร์มซ้ำ §9) */}
            <div className="zego-divider-top pt-5">
              <GeneralInfoStep
                sections={['address']}
                form={form}
                leader={leader}
                countries={countries}
                today={today}
                errors={errors}
                isNew={false}
                canSeeInternalNote={currentUser.role !== 'leader'}
                onChange={set}
              />
            </div>
          </div>
        )}

        {section === 'employment' && (
          <EmploymentFields
            form={form}
            errors={errors}
            originalLeaderType={leader.leaderType}
            joinedAt={leader.joinedAt}
            usageStatus={leader.usageStatus}
            onChange={set}
          />
        )}

        {section === 'identity-docs' && (
          <GeneralInfoStep
            sections={['documents', 'idAddress']}
            form={form}
            leader={leader}
            countries={countries}
            today={today}
            errors={errors}
            isNew={false}
            canSeeInternalNote={currentUser.role !== 'leader'}
            onChange={set}
          />
        )}

        {section === 'work-history' && (
          <div data-field="employmentHistory">
            <EmploymentHistoryEditor
              entries={form.employmentHistory}
              leaderId={form.id}
              today={today}
              now={`${today}T09:00`}
              errors={errors}
              canSeeSalary={canSeeSalary}
              onChange={(next) => set('employmentHistory', next)}
            />
          </div>
        )}

        {section === 'bank' && (
          <div data-field="bankAccounts">
            <BankAccountEditor
              accounts={form.bankAccounts}
              banks={master.banks}
              defaultAccountName={`${form.firstName} ${form.lastName}`.trim()}
              errors={errors}
              onChange={(next) => set('bankAccounts', next)}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => { setConfirmLeave(false); onClose(); }}
        tone="danger"
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก"
        message="ต้องการออกโดยไม่บันทึกหรือไม่ — ข้อมูลที่แก้ไขไว้จะหายไป (กดยกเลิกเพื่อกลับไปแก้ไข)"
        confirmLabel="ออกโดยไม่บันทึก"
      />
    </>
  );
}

/* ------------------------- ฟอร์ม "ข้อมูลการร่วมงาน" (§5/§6) ------------------------ */

/**
 * §6 "ประเภทหัวหน้าทัวร์" กับ "รูปแบบการร่วมงาน" มีความหมายเดียวกัน →
 * ใช้ Field เดียว (leaderType) และ Master เดียว (LEADER_TYPE) ตลอดทั้งระบบ
 */
function EmploymentFields({
  form, errors, originalLeaderType, joinedAt, usageStatus, onChange,
}: {
  form: LeaderFormState;
  errors: Record<string, string>;
  originalLeaderType: LeaderType;
  joinedAt: string;
  usageStatus: keyof typeof LEADER_USAGE_STATUS;
  onChange: <K extends keyof LeaderFormState>(key: K, value: LeaderFormState[K]) => void;
}) {
  const typeChanged = originalLeaderType !== form.leaderType;

  /** เปลี่ยนรูปแบบ → ล้างรายละเอียดของรูปแบบเดิม (ไม่แตะข้อมูลหมวดอื่น) */
  const changeLeaderType = (next: LeaderType) => {
    if (next === form.leaderType) return;
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

  return (
    <div className="space-y-5">
      {/* ลำดับช่องตรงกับการ์ด “ข้อมูลการร่วมงาน” (LeaderIdentityTab) — แก้ที่หนึ่งต้องแก้อีกที่ด้วย */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div data-field="personType">
          {/* ไม่มีตัวเลือกว่าง — ฟิลด์นี้ต้องมีค่าเสมอ · แก้ไขข้อมูลเดิมจะแสดงค่าที่บันทึกไว้จริง */}
          <SelectInput
            label="ประเภทบุคคล"
            required
            value={form.personType ?? DEFAULT_PERSON_TYPE}
            error={errors.personType}
            hint="ประเภทที่เลือกกำหนดชุดเอกสารประจำตัวที่ต้องกรอก"
            onChange={(e) => onChange('personType', e.target.value as PersonType)}
            options={PERSON_TYPE_ORDER.map((p) => ({ value: p, label: PERSON_TYPE[p] }))}
          />
        </div>
        <div>
          <TextInput
            label="วันที่เริ่มร่วมงาน"
            value={joinedAt ? formatDate(joinedAt) : ''}
            readOnly
            disabled
            hint="แก้ไขได้ที่ Card “ข้อมูลทั่วไป”"
          />
        </div>
        {/* สถานะโปรไฟล์ — อ่านอย่างเดียว (ปรับที่แท็บสถานะ) · ให้ฟอร์มกับหน้าแสดงมีช่องเดียวกัน */}
        <div>
          <span className="mb-1.5 block text-sm font-medium zego-text-secondary">สถานะโปรไฟล์</span>
          <div className="flex min-h-[41px] items-center rounded-lg border zego-border-color zego-surface-soft-bg px-3">
            <StatusBadge meta={LEADER_USAGE_STATUS[usageStatus]} size="sm" />
          </div>
          <p className="mt-1 text-xs zego-text-tertiary">ปรับได้ที่แท็บ “สถานะ / การลา”</p>
        </div>
      </div>

      {/* รูปแบบการร่วมงาน = ประเภทหัวหน้าทัวร์ (Field เดียว §6) */}
      <fieldset data-field="leaderType">
        <legend className="mb-2 text-sm font-medium zego-text-secondary">
          รูปแบบการร่วมงาน <span className="text-rose-600">*</span>
        </legend>
        <p className="mb-2 text-xs zego-text-tertiary">
          ใช้ค่าเดียวกับที่แสดงในหน้ารายการและหน้าโปรไฟล์
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEADER_TYPE_ORDER.map((type) => (
            <label
              key={type}
              className={cx(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                form.leaderType === type ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-surface',
              )}
            >
              <input
                type="radio"
                name="section-leader-type"
                checked={form.leaderType === type}
                onChange={() => changeLeaderType(type)}
                className="mt-0.5 h-4 w-4 accent-[var(--zego-primary-500)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium zego-text">{LEADER_TYPE[type].label}</span>
                <span className="block text-xs zego-text-tertiary">{LEADER_TYPE_DESC[type]}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.leaderType && <p className="mt-1.5 text-xs text-rose-600">{errors.leaderType}</p>}
      </fieldset>

      {typeChanged && (
        <div className="space-y-3">
          <Callout tone="amber" title="กำลังเปลี่ยนรูปแบบการร่วมงาน">
            จาก <strong>{LEADER_TYPE[originalLeaderType].label}</strong> เป็น{' '}
            <strong>{LEADER_TYPE[form.leaderType].label}</strong> — ระบบจะบันทึกลงประวัติการเปลี่ยนแปลงให้อัตโนมัติ
          </Callout>
          <TextInput
            label="เหตุผลของการเปลี่ยนรูปแบบการร่วมงาน"
            optional
            value={form.typeChangeReason}
            onChange={(e) => onChange('typeChangeReason', e.target.value)}
          />
        </div>
      )}

      {/* ---- รายละเอียดตามรูปแบบที่เลือก ----
           Card “รายละเอียดการร่วมงาน (หัวหน้าทัวร์ประจำ)” ถูกนำออกจากหน้าจอ — รหัสพนักงาน ·
           วันที่เริ่มรูปแบบนี้ · หน่วยงาน/ทีมที่สังกัด · สถานะการร่วมงาน ไม่ต้องกรอกอีกต่อไป
           ข้อมูลเดิมของหัวหน้าทัวร์ที่เคยกรอกไว้ยังคงอยู่ครบ (ไม่ถูกล้างตอนบันทึก) */}
      {form.leaderType === 'regular' ? (
        /* หัวหน้าทัวร์ประจำ — หน่วยงาน / ฝ่ายที่ดูแล (แสดงในหน้าโปรไฟล์ · บันทึกเฉพาะรูปแบบประจำ) */
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="team">
            <TextInput
              label="หน่วยงาน / ฝ่ายที่ดูแล"
              optional
              placeholder="เช่น ฝ่ายทัวร์ญี่ปุ่น"
              value={form.team}
              onChange={(e) => onChange('team', e.target.value)}
            />
          </div>
        </div>
      ) : form.leaderType === 'general' ? (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          ยังไม่ได้กำหนดรูปแบบการร่วมงานเฉพาะ — ไม่ต้องกรอกรายละเอียดเพิ่ม
        </p>
      ) : (
        <div className="rounded-xl border zego-border-color zego-surface-soft-bg p-3">
          <p className="mb-3 text-sm font-semibold zego-text">
            รายละเอียดการร่วมงาน
            <span className="ml-1 font-normal zego-text-tertiary">({LEADER_TYPE[form.leaderType].label})</span>
          </p>

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
                  optional
                  placeholder="เช่น 3500"
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

          {form.leaderType === 'agent' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div data-field="agencyName">
                <TextInput
                  label="บริษัท / หน่วยงานที่สังกัด"
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
                  optional
                  placeholder="name@example.com"
                  value={form.agencyContactEmail}
                  error={errors.agencyContactEmail}
                  onChange={(e) => onChange('agencyContactEmail', e.target.value)}
                />
              </div>
              <TextInput
                label="รหัส / เลขอ้างอิงเอเจนซี่"
                optional
                placeholder="เช่น AG-2026-014"
                value={form.agencyRefCode}
                onChange={(e) => onChange('agencyRefCode', e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <TextArea
        label="หมายเหตุการร่วมงาน"
        optional
        rows={2}
        maxLength={500}
        value={form.typeNote}
        onChange={(e) => onChange('typeNote', e.target.value)}
      />
    </div>
  );
}
