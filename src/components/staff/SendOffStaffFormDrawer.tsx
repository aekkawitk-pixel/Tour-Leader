'use client';

/**
 * ฟอร์มข้อมูลบัตรประชาชนของเจ้าหน้าที่ส่งกรุ๊ป — ใช้ร่วมกันทั้งตอน "เพิ่มเจ้าหน้าที่" (รายชื่อ)
 * และตอน "แก้ไข" จากแท็บ "เอกสารประจำตัว" ในหน้าโปรไฟล์ จึงแยกออกมาจาก SendOffStaffView
 * เพื่อไม่ให้มีฟอร์มบัตรประชาชนสองชุดที่ต้องแก้พร้อมกันทุกครั้ง
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { Drawer } from '@/components/ui/Modal';
import { DateField } from '@/components/ui/DateInput';
import { formatThaiId, withYearEraNote } from '@/lib/format';
import { DOC_SCHEMAS, docFieldPlaceholder, type DocFieldDef } from '@/data/leaders/documentSchemas';
import { DocumentFileField, type AttachedFile } from '@/components/leaders/documents/DocumentFileField';
import { readDocumentOcr } from '@/modules/tour-leaders/ocr';
import { IdCardForm } from '@/components/leaders/documents/IdCardForm';
import { ThaiAddressFields } from '@/components/leaders/ThaiAddressFields';
import type { LeaderAddress } from '@/types';
import {
  EMPTY_ID_CARD, isValidThaiId,
  SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_STATUS_ORDER, SEND_OFF_STAFF_TYPE, SEND_OFF_STAFF_TYPE_ORDER,
  type SendOffStaff, type SendOffStaffStatus, type SendOffStaffType, type ThaiIdCard,
} from '@/lib/logic/sendOffStaff';

/** ค่าตั้งต้นตอนสร้างเจ้าหน้าที่ใหม่ */
export const EMPTY_SEND_OFF_STAFF = (id: string): SendOffStaff => ({
  id,
  staffType: 'permanent',
  nickname: '',
  phone: '',
  status: 'active',
  note: '',
  idCard: { ...EMPTY_ID_CARD },
  bankAccounts: [],
});

/**
 * นิยามช่องบนบัตร — อ่านจาก schema id_card ชุดเดียวกับหัวหน้าทัวร์
 * ป้ายกำกับ ชนิดช่อง ตัวเลือกคำนำหน้า และข้อความ placeholder จึงตรงกันทุกช่องโดยอัตโนมัติ
 */
const ID_CARD_SCHEMA: Record<string, DocFieldDef> = Object.fromEntries(
  DOC_SCHEMAS.id_card.map((f) => [f.key, f]),
);

/** ช่องที่บันทึกไม่ผ่านถ้าเว้นว่าง — ติดดอกจันให้เห็นก่อนกดบันทึก */
const REQUIRED_CARD_KEYS = ['idNumber', 'firstName', 'lastName'];

export function SendOffStaffFormDrawer({ initial, onClose, onSave, selfService = false }: {
  initial: SendOffStaff;
  onClose: () => void;
  onSave: (s: SendOffStaff) => void;
  /** เจ้าหน้าที่แก้ของตัวเองในพอร์ทัล — ซ่อนช่องของผู้ดูแล (ประเภท · สถานะ · หมายเหตุ) */
  selfService?: boolean;
}) {
  const { pushToast } = useDemo();
  const [form, setForm] = useState<SendOffStaff>(initial);
  const [file, setFile] = useState<AttachedFile | null>((initial.idCardFile as AttachedFile | null) ?? null);
  /*
    ช่องที่ผู้ใช้แตะแล้ว — ฟอร์มเปล่าจะได้ไม่ขึ้นแดงทั้งใบตั้งแต่ยังไม่ได้พิมพ์อะไร
    เหมือนฟอร์มเอกสารของหัวหน้าทัวร์ที่ขึ้นข้อความเตือนต่อเมื่อกรอกแล้วไม่ผ่าน
  */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const set = <K extends keyof SendOffStaff>(k: K, v: SendOffStaff[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setCard = <K extends keyof SendOffStaff['idCard']>(k: K, v: SendOffStaff['idCard'][K]) => {
    setTouched((p) => (p[k as string] ? p : { ...p, [k as string]: true }));
    setForm((p) => ({ ...p, idCard: { ...p.idCard, [k]: v } }));
  };

  /* ตรวจเฉพาะสิ่งที่ผิดได้จริง — เลขบัตรมีหลักตรวจสอบในตัว จึงบอกได้ทันทีว่าพิมพ์ผิด */
  const idDigits = form.idCard.idNumber.replace(/\D/g, '');
  const idError = idDigits.length === 0
    ? 'กรอกเลขบัตรประชาชน'
    : !isValidThaiId(idDigits) ? 'เลขบัตรไม่ถูกต้อง (ตรวจจากหลักตรวจสอบ 13 หลัก)' : undefined;
  const nameError = form.idCard.firstName.trim() && form.idCard.lastName.trim() ? undefined : 'กรอกชื่อและนามสกุลตามบัตร';
  const valid = !idError && !nameError;

  /*
    ที่อยู่ใช้ชุดช่องเขตปกครองกลาง (จังหวัด → อำเภอ → ตำบล → ไปรษณีย์ สัมพันธ์กันเป็นลำดับ)
    ชุดนั้นรับ/คืนเป็น LeaderAddress จึงต้องแปลงไปกลับกับ ThaiIdCard ตรงนี้
    houseNo ไม่ได้ใช้ เพราะบัตรเก็บที่อยู่ทั้งบรรทัดไว้ใน addressLine อยู่แล้ว
  */
  const address: LeaderAddress = {
    houseNo: '',
    countryId: 'C-TH', // บัตรประชาชนไทยเสมอ
    subdistrict: form.idCard.subdistrict,
    district: form.idCard.district,
    province: form.idCard.province,
    provinceCode: form.idCard.provinceCode,
    districtCode: form.idCard.districtCode,
    postalCode: form.idCard.postalCode,
  };
  const onAddressChange = (next: LeaderAddress) => setForm((prev) => ({
    ...prev,
    idCard: {
      ...prev.idCard,
      subdistrict: next.subdistrict ?? '',
      district: next.district ?? '',
      province: next.province ?? '',
      provinceCode: next.provinceCode ?? '',
      districtCode: next.districtCode ?? '',
      postalCode: next.postalCode ?? '',
    },
  }));

  /**
   * อ่านข้อมูลจากไฟล์ที่เพิ่งแนบ — ใช้บริการเดียวกับเอกสารของหัวหน้าทัวร์
   * เติมเฉพาะช่องที่ยังว่าง ไม่ทับค่าที่ผู้ใช้กรอกไว้เอง
   */
  const readFromFile = async (picked: File) => {
    const result = await readDocumentOcr(
      { name: picked.name, type: picked.type, size: picked.size, dataUrl: '' },
      'id_card',
    );
    if (!result.ok) {
      pushToast('info', result.reason === 'unsupported'
        ? 'ยังไม่ได้เชื่อมบริการอ่านเอกสาร — แนบไฟล์แล้ว กรอกข้อมูลเองได้เลย'
        : 'อ่านข้อมูลจากไฟล์ไม่สำเร็จ — กรอกข้อมูลเองได้เลย');
      return;
    }
    let filled = 0;
    setForm((prev) => {
      const card = { ...prev.idCard } as Record<string, string>;
      for (const [key, value] of Object.entries(result.data)) {
        const text = typeof value === 'string' ? value : '';
        if (text && key in card && !card[key]?.trim()) { card[key] = text; filled += 1; }
      }
      return { ...prev, idCard: card as unknown as ThaiIdCard };
    });
    pushToast('success', filled > 0
      ? `อ่านข้อมูลจากไฟล์ได้ ${filled} ช่อง — ตรวจสอบก่อนบันทึก`
      : 'อ่านไฟล์แล้ว แต่ไม่พบข้อมูลที่กรอกให้ได้');
  };

  /**
   * ช่องกรอก 1 ช่องตามชื่อ key — ผัง IdCardForm เป็นคนเรียกใช้ตามตำแหน่งบนบัตร
   * ชนิดช่องและป้ายกำกับมาจาก schema กลาง ไม่ได้กำหนดเองที่นี่
   */
  const cardField = (key: string) => {
    const f = ID_CARD_SCHEMA[key];
    if (!f) return null;
    const value = String(form.idCard[key as keyof ThaiIdCard] ?? '');
    const required = REQUIRED_CARD_KEYS.includes(key);
    const problem = key === 'idNumber'
      ? idError
      : (key === 'firstName' || key === 'lastName') && !value.trim() ? nameError : undefined;
    const error = touched[key] ? problem : undefined;

    if (f.type === 'date') {
      return (
        <DateField
          label={withYearEraNote(f.label)}
          required={required}
          value={value}
          max={f.notFuture ? new Date().toISOString().slice(0, 10) : undefined}
          error={error}
          onChange={(v) => setCard(key as keyof ThaiIdCard, v)}
        />
      );
    }

    if (f.type === 'select') {
      return (
        <SelectInput
          label={f.label}
          required={required}
          placeholder={docFieldPlaceholder(f)}
          value={value}
          options={f.options ?? []}
          error={error}
          onChange={(e) => setCard(key as keyof ThaiIdCard, e.target.value)}
        />
      );
    }

    /* เลขบัตรรับเฉพาะตัวเลขและตัดที่ 13 หลัก เหมือนฟอร์มของหัวหน้าทัวร์ */
    const isId = f.type === 'idnumber';
    return (
      <TextInput
        label={f.label}
        required={required}
        placeholder={docFieldPlaceholder(f)}
        inputMode={isId ? 'numeric' : undefined}
        value={value}
        error={error}
        hint={isId && !idError && idDigits.length === 13 ? formatThaiId(idDigits) : undefined}
        onChange={(e) => setCard(key as keyof ThaiIdCard, isId ? e.target.value.replace(/\D/g, '').slice(0, 13) : e.target.value)}
      />
    );
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={selfService ? 'แก้ไขข้อมูลตามบัตรประชาชน' : `${initial.idCard.firstName ? 'แก้ไข' : 'เพิ่ม'}เจ้าหน้าที่ส่งกรุ๊ป`}
      description={`รหัส ${form.id} · ข้อมูลตามบัตรประชาชน`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave({ ...form, idCardFile: file, idCard: { ...form.idCard, idNumber: idDigits } })}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!selfService && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="ประเภทเจ้าหน้าที่"
            value={form.staffType}
            onChange={(e) => set('staffType', e.target.value as SendOffStaffType)}
            options={SEND_OFF_STAFF_TYPE_ORDER.map((t) => ({ value: t, label: SEND_OFF_STAFF_TYPE[t].label }))}
            hint={SEND_OFF_STAFF_TYPE[form.staffType].note}
          />
          <TextInput label="ชื่อเล่น" optional value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
          <SelectInput
            label="สถานะ"
            value={form.status}
            onChange={(e) => set('status', e.target.value as SendOffStaffStatus)}
            options={SEND_OFF_STAFF_STATUS_ORDER.map((st) => ({ value: st, label: SEND_OFF_STAFF_STATUS[st].label }))}
            hint={SEND_OFF_STAFF_STATUS[form.status].note}
          />
          <TextInput label="วันที่เริ่มร่วมงาน" optional type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || undefined)} />
        </div>
        )}

        {/*
          ผังหน้าบัตรชุดเดียวกับหัวหน้าทัวร์ — ผู้กรอกถือบัตรจริงแล้วไล่กรอกตามที่ตาเห็นได้เลย
          IdCardForm ทำหน้าที่จัดวางอย่างเดียว ช่องกรอกส่งเข้าไปจากที่นี่
        */}
        <IdCardForm
          field={cardField}
          addressSlot={
            <ThaiAddressFields
              address={address}
              errors={{}}
              fieldPrefix="idCard"
              required={false}
              onChange={onAddressChange}
            />
          }
          fileSlot={
            <DocumentFileField
              label="ไฟล์เอกสาร"
              tourLeaderId={form.id}
              kind="id_card"
              value={file}
              onChange={setFile}
              onRead={readFromFile}
              retainReplaced={Boolean(initial.idCardFile)}
            />
          }
        />

        {!selfService && <TextInput label="หมายเหตุ" optional value={form.note} onChange={(e) => set('note', e.target.value)} />}
      </div>
    </Drawer>
  );
}
