'use client';

/**
 * Modal "แก้ไขข้อมูลทั่วไป" (§1–§10) — ใช้แก้เฉพาะข้อมูลทั่วไปของหัวหน้าทัวร์
 *
 * ⚠️ ไม่มี Tab · ไม่แสดง Passport/ความเชี่ยวชาญ/ประวัติ/เอกสาร (§1/§11)
 *    บันทึกทับเฉพาะฟิลด์ในหมวดนี้ — ส่วนอื่นใช้ค่าเดิมจาก leader (§10)
 *    ซ้าย = รูปโปรไฟล์ · ขวา = ฟอร์ม 3 คอลัมน์ (§4)
 */

import { useMemo, useRef, useState } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button, Pill, StatusBadge, cx } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Combobox } from '@/components/ui/Combobox';
import { PhotoPicker } from '@/components/leaders/PhotoPicker';
import { useDemo } from '@/store/DemoStore';
import {
  GENDER, GENDER_ORDER, LEADER_STATUS,
  LEADER_SOURCE_TYPE, LEADER_SOURCE_TYPE_ORDER,
} from '@/lib/labels';
import { TITLE_OPTIONS, NAME_EN_PATTERN } from '@/modules/tour-leaders/constants';
import { leaderToForm, type LeaderFormState } from '@/modules/tour-leaders/mappers';
import { saveErrorMessage } from '@/services/browserStorage';
import type { AssignedCountry, Country, Gender, LeaderSourceType, TourLeader } from '@/types';

/* --------------------------------- draft --------------------------------- */

export interface GeneralDraft {
  photoUrl: string | null;
  title: string;
  firstName: string;
  lastName: string;
  nickname: string;
  firstNameEn: string;
  lastNameEn: string;
  gender: Gender;
  birthDate: string;
  nationalityCountryId: string;
  assignedCountryId: string;
  joinedAt: string;
  sourceType: LeaderSourceType | undefined;
  sourceOther: string;
}

function makeDraft(form: LeaderFormState): GeneralDraft {
  const primary = form.assignedCountries.find((a) => a.isPrimary) ?? form.assignedCountries[0];
  return {
    photoUrl: form.photoUrl ?? null,
    title: form.title,
    firstName: form.firstName,
    lastName: form.lastName,
    nickname: form.nickname,
    firstNameEn: form.firstNameEn,
    lastNameEn: form.lastNameEn,
    gender: form.gender,
    birthDate: form.birthDate,
    nationalityCountryId: form.nationalityCountryId,
    assignedCountryId: primary?.countryId ?? '',
    joinedAt: form.joinedAt,
    sourceType: form.sourceType,
    sourceOther: form.sourceOther,
  };
}

/** อัปเดตประเทศประจำหลัก โดยไม่ทำลายรายการอื่น (§10) */
function applyPrimaryCountry(list: AssignedCountry[], countryId: string): AssignedCountry[] {
  if (!countryId) return list;
  if (list.length === 0) return [{ id: `AC-${Date.now()}`, countryId, isPrimary: true, active: true }];
  const idx = list.findIndex((a) => a.isPrimary);
  const target = idx >= 0 ? idx : 0;
  return list.map((a, i) => (i === target ? { ...a, countryId, isPrimary: true } : a));
}

/** Searchable Dropdown ประเทศ (Country Master §5) */
function CountryPicker({
  label, value, countries, onSelect, error, placeholder,
}: { label: string; value: string; countries: Country[]; onSelect: (id: string) => void; error?: string; placeholder?: string }) {
  const [q, setQ] = useState('');
  const selected = countries.find((c) => c.id === value);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = countries.filter((c) => c.isActive || c.id === value);
    if (!s) return list.slice(0, 50);
    return list.filter((c) => [c.nameEn, c.nameTh, c.alpha2, c.alpha3, c.code].some((v) => (v ?? '').toLowerCase().includes(s))).slice(0, 50);
  }, [countries, q, value]);
  return (
    <Combobox<Country>
      label={label}
      placeholder={placeholder ?? 'ค้นหาประเทศ รหัสประเทศ หรือชื่อภาษาไทย'}
      value={selected ? `${selected.nameEn} (${selected.nameTh})` : ''}
      items={items}
      getKey={(c) => c.id}
      getLabel={(c) => `${c.nameEn} (${c.nameTh})`}
      getSubLabel={(c) => `· ${c.alpha3 ?? c.code ?? ''}`}
      onSearch={setQ}
      onSelect={(c) => { setQ(''); onSelect(c?.id ?? ''); }}
      error={error}
      emptyMessage="ไม่พบประเทศที่ค้นหา"
    />
  );
}

/* --------------------------------- modal --------------------------------- */

export function GeneralInfoEditModal({
  open, leader, onClose, onGoStatus,
}: {
  open: boolean;
  leader: TourLeader;
  onClose: () => void;
  /** §6 ปิด Modal แล้วไปแท็บ "สถานะและการลา" */
  onGoStatus: () => void;
}) {
  if (!open) return null;
  return <GeneralInfoForm key={leader.id} leader={leader} onClose={onClose} onGoStatus={onGoStatus} />;
}

function GeneralInfoForm({
  leader, onClose, onGoStatus,
}: { leader: TourLeader; onClose: () => void; onGoStatus: () => void }) {
  const { countries, today, saving, saveLeaderForm } = useDemo();

  const initial = useMemo(() => makeDraft(leaderToForm(leader)), [leader]);
  const [draft, setDraft] = useState<GeneralDraft>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pendingGoStatus, setPendingGoStatus] = useState(false);
  const submitting = useRef(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const set = <K extends keyof GeneralDraft>(k: K, v: GeneralDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const displayName = `${leader.firstName} ${leader.lastName}`.trim() || leader.id;
  const titleOptions = leader.title && !TITLE_OPTIONS.includes(leader.title) ? [...TITLE_OPTIONS, leader.title] : TITLE_OPTIONS;

  const focusField = (field: string) => {
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input,select')?.focus();
    }, 80);
  };

  /** §9 ตรวจก่อนบันทึก */
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!draft.firstName.trim()) e.firstName = 'กรุณากรอกชื่อภาษาไทย';
    if (!draft.lastName.trim()) e.lastName = 'กรุณากรอกนามสกุลภาษาไทย';
    if (draft.firstNameEn.trim() && !NAME_EN_PATTERN.test(draft.firstNameEn.trim())) e.firstNameEn = 'รูปแบบชื่อภาษาอังกฤษไม่ถูกต้อง';
    if (draft.lastNameEn.trim() && !NAME_EN_PATTERN.test(draft.lastNameEn.trim())) e.lastNameEn = 'รูปแบบนามสกุลภาษาอังกฤษไม่ถูกต้อง';
    if (draft.birthDate && draft.birthDate > today) e.birthDate = 'วันเกิดต้องไม่เป็นวันในอนาคต';
    if (draft.nationalityCountryId && !countries.some((c) => c.id === draft.nationalityCountryId)) e.nationality = 'กรุณาเลือกสัญชาติจากรายการ';
    if (draft.assignedCountryId && !countries.some((c) => c.id === draft.assignedCountryId)) e.assignedCountry = 'กรุณาเลือกประเทศประจำจากรายการ';
    return e;
  };

  const save = async () => {
    if (submitting.current || saving) return;
    const e = validate();
    setErrs(e);
    if (Object.keys(e).length > 0) {
      setSaveError('กรุณาตรวจสอบข้อมูลที่มีเครื่องหมายผิดพลาด');
      focusField(Object.keys(e)[0]);
      return;
    }
    submitting.current = true;
    setSaveError(null);
    try {
      // §10 บันทึกเฉพาะข้อมูลทั่วไป — ส่วนอื่นใช้ค่าเดิมจาก leader
      const base = leaderToForm(leader);
      const next: LeaderFormState = {
        ...base,
        photoUrl: draft.photoUrl,
        title: draft.title,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        nickname: draft.nickname.trim(),
        firstNameEn: draft.firstNameEn.trim().toUpperCase(),
        lastNameEn: draft.lastNameEn.trim().toUpperCase(),
        gender: draft.gender,
        birthDate: draft.birthDate,
        nationalityCountryId: draft.nationalityCountryId,
        joinedAt: draft.joinedAt,
        sourceType: draft.sourceType,
        sourceOther: draft.sourceOther,
        assignedCountries: applyPrimaryCountry(base.assignedCountries, draft.assignedCountryId),
      };
      // แจ้งผลสำเร็จที่ saveLeaderForm จุดเดียว (กัน Toast ซ้ำ) — ปิด Modal หลังบันทึกสำเร็จเท่านั้น
      await saveLeaderForm(next, leader, 'แก้ไขข้อมูลทั่วไป');
      onClose();
    } catch (err) {
      // §10 บันทึกไม่สำเร็จ — คง Modal + ค่าที่กรอกไว้ และบอกสาเหตุจริง
      setSaveError(saveErrorMessage(err));
    } finally {
      submitting.current = false;
    }
  };

  /** §1/§8 ปิดได้ทันทีถ้ายังไม่แก้ · ถ้าแก้แล้วต้องยืนยันก่อน (รวมคลิกนอก Modal) */
  const requestClose = () => { if (dirty) setConfirmLeave(true); else onClose(); };
  const requestGoStatus = () => { if (dirty) { setPendingGoStatus(true); setConfirmLeave(true); } else { onClose(); onGoStatus(); } };

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        size="xl"
        title="แก้ไขข้อมูลทั่วไป"
        description={`${displayName} · ${leader.id} — แก้ไขเฉพาะข้อมูลทั่วไป ข้อมูลหมวดอื่นไม่ถูกแก้ไข`}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs zego-text-danger">{saveError ?? ''}</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>ยกเลิก</Button>
              <Button variant="primary" onClick={save} loading={saving} disabled={saving}>บันทึกข้อมูลทั่วไป</Button>
            </span>
          </div>
        }
      >
        {/* §4 ซ้าย = รูปโปรไฟล์ (220–260px) · ขวา = ฟอร์ม 3 คอลัมน์ */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-full shrink-0 lg:w-60">
            <PhotoPicker
              photoUrl={draft.photoUrl}
              initials={`${draft.firstName.slice(0, 1)}${draft.lastName.slice(0, 1)}` || '—'}
              color={leader.avatarColor}
              onChange={(url) => set('photoUrl', url)}
            />
          </div>

          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* แถว 1 — อ่านอย่างเดียว: รหัส + สถานะพร้อมรับงาน (§4 ห้ามแก้ที่นี่) */}
            <div>
              <TextInput label="รหัสหัวหน้าทัวร์" value={leader.id} readOnly disabled hint="ระบบสร้างให้อัตโนมัติ" />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium zego-text-secondary">ความพร้อมรับงาน</span>
              <div className="flex min-h-[41px] flex-wrap items-center gap-2 rounded-lg border zego-border-color zego-surface-soft-bg px-3">
                <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
                {!leader.active && <Pill tone="red">ระงับการใช้งาน</Pill>}
              </div>
              <button type="button" onClick={requestGoStatus} className="mt-1 text-xs font-medium zego-text-info hover:underline">
                จัดการความพร้อมและการลา
              </button>
            </div>
            {/* แถว 2 — ชื่อไทย */}
            <div data-field="title">
              <SelectInput label="คำนำหน้า (ไทย)" value={draft.title} onChange={(e) => set('title', e.target.value)} options={titleOptions.map((t) => ({ value: t, label: t }))} />
            </div>
            <div data-field="firstName">
              <TextInput label="ชื่อ (ไทย)" required lang="th" value={draft.firstName} error={errs.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div data-field="lastName">
              <TextInput label="นามสกุล (ไทย)" required lang="th" value={draft.lastName} error={errs.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>

            {/* แถว 3 — ชื่ออังกฤษ + ชื่อเล่น */}
            <div data-field="firstNameEn">
              <TextInput label="ชื่อ (อังกฤษ)" optional lang="en" value={draft.firstNameEn} error={errs.firstNameEn} onChange={(e) => set('firstNameEn', e.target.value.toUpperCase())} />
            </div>
            <div data-field="lastNameEn">
              <TextInput label="นามสกุล (อังกฤษ)" optional lang="en" value={draft.lastNameEn} error={errs.lastNameEn} onChange={(e) => set('lastNameEn', e.target.value.toUpperCase())} />
            </div>
            <div data-field="nickname">
              <TextInput label="ชื่อเล่น" optional value={draft.nickname} onChange={(e) => set('nickname', e.target.value)} />
            </div>

            {/* แถว 4 — เพศ / วันเกิด / สัญชาติ */}
            <div data-field="gender">
              <SelectInput label="เพศ" value={draft.gender} onChange={(e) => set('gender', e.target.value as Gender)} options={GENDER_ORDER.map((g) => ({ value: g, label: GENDER[g].label }))} />
            </div>
            <div data-field="birthDate">
              <DateField label="วันเกิด" max={today} value={draft.birthDate} error={errs.birthDate} onChange={(v) => set('birthDate', v)} />
            </div>
            <div data-field="nationality">
              <CountryPicker label="สัญชาติ" value={draft.nationalityCountryId} countries={countries} error={errs.nationality} onSelect={(id) => set('nationalityCountryId', id)} />
            </div>

            {/* แถว 5 — ประเทศประจำ / วันที่เริ่มร่วมงาน / แหล่งที่มา */}
            <div data-field="assignedCountry">
              <CountryPicker label="ประเทศประจำ" value={draft.assignedCountryId} countries={countries} error={errs.assignedCountry} onSelect={(id) => set('assignedCountryId', id)} placeholder="ค้นหาประเทศประจำ" />
            </div>
            <div data-field="joinedAt">
              <DateField label="วันที่เริ่มร่วมงาน" value={draft.joinedAt} onChange={(v) => set('joinedAt', v)} />
            </div>
            <div data-field="sourceType" className={cx(draft.sourceType === 'other' && 'sm:col-span-2 lg:col-span-1')}>
              <SelectInput
                label="แหล่งที่มาของข้อมูล"
                optional
                placeholder="ไม่ระบุ"
                value={draft.sourceType ?? ''}
                onChange={(e) => set('sourceType', (e.target.value || undefined) as LeaderSourceType)}
                options={LEADER_SOURCE_TYPE_ORDER.map((s) => ({ value: s, label: LEADER_SOURCE_TYPE[s] }))}
              />
              {draft.sourceType === 'other' && (
                <div className="mt-2">
                  <TextInput label="ระบุแหล่งที่มา" value={draft.sourceOther} onChange={(e) => set('sourceOther', e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* §8 ยืนยันก่อนออกเมื่อมีข้อมูลที่ยังไม่บันทึก */}
      <ConfirmDialog
        open={confirmLeave}
        onClose={() => { setConfirmLeave(false); setPendingGoStatus(false); }}
        onConfirm={() => {
          setConfirmLeave(false);
          onClose();
          if (pendingGoStatus) onGoStatus();
          setPendingGoStatus(false);
        }}
        tone="danger"
        title="คุณมีข้อมูลที่ยังไม่ได้บันทึก"
        message="ต้องการออกโดยไม่บันทึกหรือไม่ — ข้อมูลที่แก้ไขไว้จะหายไป (กดยกเลิกเพื่อกลับไปแก้ไข)"
        confirmLabel="ออกโดยไม่บันทึก"
      />
    </>
  );
}
