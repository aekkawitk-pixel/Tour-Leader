'use client';

/**
 * ฟอร์มเพิ่ม/แก้ไขเอกสารประจำตัว — ใช้ได้ทุกชนิดโดยไม่ต้องเขียนฟอร์มแยก
 *
 * ช่องข้อมูลทั้งหมดสร้างจาก DOC_SCHEMAS[kind] ชุดเดียวกับที่วิซาร์ดเพิ่มหัวหน้าทัวร์ใช้
 * เพิ่มชนิดเอกสารใหม่ในอนาคต = เพิ่ม schema ที่เดียว ฟอร์มนี้รองรับทันที
 *
 * หนังสือเดินทางไม่ใช้ฟอร์มนี้ — มีโมดูลของตัวเองที่รองรับ OCR/MRZ/รูปเล่ม
 */

import { useMemo, useState } from 'react';
import { withYearEraNote } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { useDemo } from '@/store/DemoStore';
import { nationalitySelectOptions } from '@/data/countryMaster';
import { readDocumentOcr } from '@/modules/tour-leaders/ocr';
import {
  DOC_TITLE_EN_BY_TH,
  DOC_SCHEMAS,
  docFieldPlaceholder,
  isExpiryBeforeIssue,
  isFileBasedDocKind,
  OTHER_DOC_TITLE_CUSTOM,
  OTHER_DOC_TITLE_PRESETS,
  OTHER_DOC_TITLE_TOUR_LICENSE,
  TOUR_LICENSE_SUBTYPES,
  type DocData,
  type DocFieldDef,
  type DocKind,
} from '@/data/leaders/documentSchemas';
import { documentNumberFieldKey, documentRequiredFieldKeys } from '@/data/leaders/documentFieldKeys';
import { DocumentFileField, type AttachedFile } from './DocumentFileField';
import { TourCardForm } from './TourCardForm';
import { IdCardForm } from './IdCardForm';
import { VisaForm } from './VisaForm';
import { ThaiAddressFields } from '@/components/leaders/ThaiAddressFields';
import type { LeaderAddress } from '@/types';
import { DOC_KIND_DISPLAY_NAME } from '@/lib/logic/documentView';
import {
  blankDocumentDraft,
  createDocument,
  findDocumentsByFieldValue,
  saveDocumentEdit,
} from '@/services/documentStore';
import type { AnyLeaderDocumentRecord, DocumentStatus } from '@/data/leaders/documentRecordTypes';

export function DocumentFormModal({
  open,
  kind,
  tourLeaderId,
  editing,
  variant = 'modal',
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: DocKind;
  tourLeaderId: string;
  /** null = เพิ่มใหม่ · มีค่า = แก้ไขฉบับเดิม */
  editing: AnyLeaderDocumentRecord | null;
  /**
   * modal  = เปิดเป็นหน้าต่างซ้อน (ค่าเริ่มต้น)
   * inline = ฝังฟอร์มลงในการ์ดเลย — ใช้ตอนยังไม่มีเอกสารชนิดนั้น จะได้กรอกได้ทันทีโดยไม่ต้องกดเปิด
   */
  variant?: 'modal' | 'inline';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser, today, countries, pushToast } = useDemo();
  const nowISO = `${today}T00:00`;
  const schema = DOC_SCHEMAS[kind];
  const requiredKeys = documentRequiredFieldKeys(kind);
  const fileBased = isFileBasedDocKind(kind);

  /*
   * ค่าเริ่มต้นอ่านจาก props ครั้งเดียวตอน mount — ผู้เรียกต้องสั่ง remount ด้วย key
   * เมื่อเปลี่ยนฉบับที่แก้ (ดู LeaderDocumentsCard) กันค่าจากรายการก่อนหน้าค้าง
   */
  const [values, setValues] = useState<DocData>(() => {
    if (!editing) return blankDocumentDraft(kind).fields;
    const filled: DocData = {};
    for (const f of DOC_SCHEMAS[kind]) filled[f.key] = editing.fields[f.key] ?? '';
    return filled;
  });
  /**
   * หมายเหตุระดับเอกสาร — ไม่มีช่องให้กรอกในฟอร์มแล้ว
   * ชนิดที่ต้องมีหมายเหตุจริง ๆ (ประวัติอาชญากรรม · ใบเซอร์ · อื่น ๆ) มีช่อง note ใน schema ของตัวเอง
   * ที่นี่คงค่าเดิมไว้เพื่อไม่ล้างสิ่งที่เคยบันทึก และเพื่อให้ระบบเติมสถานะการใช้งานต่อท้ายได้
   */
  const note = editing?.note ?? '';
  const [makePrimary, setMakePrimary] = useState(editing?.isPrimary ?? false);
  /**
   * ชื่อเอกสารของ "เอกสารอื่น ๆ" (kind 'other') — เลือกจาก list ก่อน แล้วค่อยเปิดช่องพิมพ์เองถ้าเลือก "อื่น ๆ"
   * ค่าที่บันทึกจริงยังอยู่ใน values.docTitle เหมือนเดิม ตัวแปรนี้ควบคุมแค่ UI ว่าจะโชว์ select หรือ select+text
   */
  const [otherTitleChoice, setOtherTitleChoice] = useState<string>(() => {
    if (kind !== 'other') return '';
    const current = (editing?.fields.docTitle ?? '').trim();
    if (!current) return '';
    if ((OTHER_DOC_TITLE_PRESETS as readonly string[]).includes(current)) return current;
    if ((TOUR_LICENSE_SUBTYPES as readonly string[]).includes(current)) return OTHER_DOC_TITLE_TOUR_LICENSE;
    return OTHER_DOC_TITLE_CUSTOM;
  });
  /** ประเภทบัตรนำเที่ยวที่เลือกต่อ (เฉพาะตอน otherTitleChoice === OTHER_DOC_TITLE_TOUR_LICENSE) */
  const [tourLicenseSub, setTourLicenseSub] = useState<string>(() => {
    if (kind !== 'other') return '';
    const current = (editing?.fields.docTitle ?? '').trim();
    return (TOUR_LICENSE_SUBTYPES as readonly string[]).includes(current) ? current : '';
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<AttachedFile | null>(() =>
    editing?.imageId
      ? {
          imageId: editing.imageId,
          fileName: editing.sourceFileName ?? 'ไฟล์แนบ',
          byteSize: editing.fileByteSize ?? 0,
          uploadedBy: editing.fileUploadedBy ?? editing.createdBy,
          uploadedAt: editing.fileUploadedAt ?? editing.createdAt,
        }
      : null,
  );

  const countryOptions = useMemo(
    () => countries.filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` })),
    [countries],
  );
  /** สัญชาติบนเอกสารพิมพ์เป็นคำเต็ม (THAI/USA) — ใช้ชุดเดียวกับหน้าเล่มหนังสือเดินทาง */
  const nationalityOptions = useMemo(() => nationalitySelectOptions(countries), [countries]);

  /**
   * ที่อยู่บนบัตร — เก็บเป็นช่อง string แยกกันในเอกสาร แต่ ThaiAddressFields ทำงานกับ
   * ก้อน LeaderAddress จึงแปลงไปกลับตรงนี้ เพื่อได้ลำดับ จังหวัด → เขต → แขวง → ไปรษณีย์
   * ชุดเดียวกับที่อยู่อื่นทั้งระบบ (รวมทั้งการล้างช่องล่างเมื่อเปลี่ยนช่องบน)
   */
  const docAddress = (): LeaderAddress => ({
    houseNo: '',
    countryId: 'C-TH', // บัตรประชาชนไทยเสมอ — ช่องนี้มีไว้เพื่อให้ตรงกับรูปแบบที่อยู่กลาง
    province: values.province ?? '',
    provinceCode: values.provinceCode || undefined,
    district: values.district ?? '',
    districtCode: values.districtCode || undefined,
    subdistrict: values.subdistrict ?? '',
    postalCode: values.postalCode ?? '',
  });

  const applyAddress = (next: LeaderAddress) => {
    setValues((prev) => ({
      ...prev,
      province: next.province ?? '',
      provinceCode: next.provinceCode ?? '',
      district: next.district ?? '',
      districtCode: next.districtCode ?? '',
      subdistrict: next.subdistrict ?? '',
      postalCode: next.postalCode ?? '',
    }));
  };

  /**
   * ชนิดที่มีปุ่ม "อัปโหลดรูปใหม่ / อ่าน OCR ใหม่" ใต้กรอบแนบไฟล์
   * (หนังสือเดินทางมีปุ่มของตัวเองอยู่แล้วในโมดูลของมัน)
   */
  const hasReadButton = kind === 'tour_card' || kind === 'id_card' || kind === 'visa';

  /**
   * อ่านข้อมูลจากไฟล์ที่เพิ่งแนบ แล้วเติมลงช่องที่ยังว่าง
   *
   * ยังไม่ได้เชื่อมบริการอ่านเอกสาร (OCR_ENABLED = false) — readDocumentOcr จะตอบ
   * 'unsupported' และ **ไม่เดาข้อมูลให้** ปุ่มจึงทำหน้าที่เปลี่ยนไฟล์แนบได้จริง
   * ส่วนการอ่านจะเริ่มทำงานเองทันทีที่เชื่อมบริการ โดยไม่ต้องแก้หน้าจอนี้อีก
   */
  const readFromFile = async (picked: File) => {
    const result = await readDocumentOcr(
      { name: picked.name, type: picked.type, size: picked.size, dataUrl: '' },
      kind,
    );

    if (!result.ok) {
      pushToast(
        'info',
        result.reason === 'unsupported'
          ? 'ยังไม่ได้เชื่อมบริการอ่านเอกสาร — แนบไฟล์แล้ว กรอกข้อมูลเองได้เลย'
          : 'อ่านข้อมูลจากไฟล์ไม่สำเร็จ — กรอกข้อมูลเองได้เลย',
      );
      return;
    }

    // เติมเฉพาะช่องที่ยังว่าง ไม่ทับค่าที่ผู้ใช้กรอกไว้เอง
    let filled = 0;
    setValues((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(result.data)) {
        if (value && !next[key]?.trim()) { next[key] = value; filled += 1; }
      }
      return next;
    });
    pushToast('success', filled > 0 ? `อ่านข้อมูลจากไฟล์ได้ ${filled} ช่อง — ตรวจสอบก่อนบันทึก` : 'อ่านไฟล์แล้ว แต่ไม่พบข้อมูลที่กรอกให้ได้');
  };

  const setField = (key: string, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      /*
       * บัตรประชาชนพิมพ์คำนำหน้าทั้งไทยและอังกฤษ — เลือกฝั่งไทยแล้วเติมฝั่งอังกฤษให้เลย
       * เติมเฉพาะตอนที่ยังว่าง เพื่อไม่ทับค่าที่ผู้ใช้ตั้งใจใส่เอง (เช่น ยศ/ตำแหน่งทางวิชาการ)
       */
      if (kind === 'id_card' && key === 'title' && !prev.titleEn) {
        const en = DOC_TITLE_EN_BY_TH[value as keyof typeof DOC_TITLE_EN_BY_TH];
        if (en) next.titleEn = en;
      }
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  /** เลขซ้ำกับเอกสารชนิดเดียวกันของคนอื่นหรือไม่ — เตือน ไม่บล็อก (อาจเป็นข้อมูลนำเข้าซ้ำ) */
  const duplicates = useMemo(() => {
    if (!open || fileBased) return []; // เอกสารแนบไฟล์ไม่มีเลขที่ที่ใช้เทียบซ้ำได้
    const numberKey = documentNumberFieldKey(kind);
    const value = values[numberKey] ?? '';
    return findDocumentsByFieldValue(kind, numberKey, value, editing?.docId)
      .filter((d) => d.tourLeaderId !== tourLeaderId);
  }, [open, fileBased, values, kind, editing?.docId, tourLeaderId]);

  function validate(): boolean {
    const next: Record<string, string> = {};

    for (const key of requiredKeys) {
      if (!(values[key] ?? '').trim()) {
        const label = schema.find((f) => f.key === key)?.label ?? 'ข้อมูล';
        next[key] = `กรุณาระบุ${label}`;
      }
    }
    if (fileBased && !file) {
      next.__file = 'กรุณาแนบไฟล์เอกสาร';
    }

    for (const f of schema) {
      const value = (values[f.key] ?? '').trim();
      if (f.type === 'idnumber' && value && value.length !== 13) {
        next[f.key] = 'เลขบัตรประชาชนต้องมี 13 หลัก';
      }
      if (f.minKey && isExpiryBeforeIssue(values[f.minKey] ?? '', value)) {
        next[f.key] = 'วันหมดอายุต้องไม่อยู่ก่อนวันที่ออกเอกสาร';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** ไฟล์ปัจจุบันในรูปแบบที่ store ใช้ — null = ถอดไฟล์ออก */
  const fileMeta = () => (file
    ? {
        imageId: file.imageId,
        sourceFileName: file.fileName,
        fileByteSize: file.byteSize,
        fileUploadedBy: file.uploadedBy,
        fileUploadedAt: file.uploadedAt,
      }
    : null);

  const save = (status: DocumentStatus) => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) {
        saveDocumentEdit(
          editing.docId,
          { fields: values, note, makePrimary, file: fileMeta() },
          { by: currentUser.name, at: nowISO },
        );
        pushToast('success', 'บันทึกการแก้ไขเอกสารเรียบร้อย');
      } else {
        createDocument({
          tourLeaderId,
          kind,
          fields: values,
          fieldOrigin: blankDocumentDraft(kind).fieldOrigin,
          entryMethod: 'MANUAL',
          status,
          ocrOriginal: null,
          imageId: file?.imageId ?? null,
          sourceFileName: file?.fileName ?? null,
          fileByteSize: file?.byteSize ?? null,
          fileUploadedBy: file?.uploadedBy ?? null,
          fileUploadedAt: file?.uploadedAt ?? null,
          makePrimary,
          by: currentUser.name,
          at: nowISO,
        });
        pushToast('success', status === 'CONFIRMED' ? 'บันทึกเอกสารเรียบร้อย' : 'บันทึกเป็นฉบับร่างเรียบร้อย');
      }
      onSaved();
      onClose();
    } catch (e) {
      // เขียนลงเบราว์เซอร์ไม่สำเร็จ — ต้องไม่ขึ้นว่าบันทึกสำเร็จ
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: DocFieldDef) => {
    const value = values[f.key] ?? '';
    const error = errors[f.key] || undefined;
    const wrapCls = f.full ? 'sm:col-span-2' : undefined;
    /* ช่องที่บันทึกไม่ผ่านถ้าเว้นว่าง ต้องติดดอกจันให้เห็นก่อนกดบันทึก ไม่ใช่ไปรู้ตอนขึ้น error */
    const required = requiredKeys.includes(f.key);

    if (f.type === 'date') {
      return (
        <DateField
          key={f.key}
          label={withYearEraNote(f.label)}
          required={required}
          wrapperClassName={wrapCls}
          value={value}
          min={f.minKey ? values[f.minKey] || undefined : undefined}
          max={f.notFuture ? today : undefined}
          error={error}
          onChange={(v) => setField(f.key, v)}
        />
      );
    }
    if (f.type === 'country' || f.type === 'nationality' || f.type === 'select') {
      const options = f.type === 'country'
        ? countryOptions
        : f.type === 'nationality'
          ? nationalityOptions
          : (f.options ?? []);
      // ค่าเดิมที่ไม่อยู่ในรายการต้องยังเห็นอยู่ ไม่งั้นจะดูเหมือนข้อมูลหาย
      const extra = value && !options.some((o) => o.value === value)
        ? [{ value, label: `${value} — ไม่อยู่ในรายการ` }]
        : [];

      return (
        <SelectInput
          key={f.key}
          label={f.label}
          required={required}
          wrapperClassName={wrapCls}
          placeholder={docFieldPlaceholder(f)}
          value={value}
          options={[...extra, ...options]}
          error={error}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    }
    if (f.type === 'textarea') {
      return (
        <TextArea
          key={f.key}
          label={f.label}
          required={required}
          wrapperClassName={wrapCls}
          placeholder={docFieldPlaceholder(f)}
          value={value}
          error={error}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    }

    const isId = f.type === 'idnumber';
    return (
      <TextInput
        key={f.key}
        label={f.label}
        required={required}
        wrapperClassName={wrapCls}
        placeholder={docFieldPlaceholder(f)}
        inputMode={isId ? 'numeric' : undefined}
        value={value}
        error={error}
        onChange={(e) => setField(f.key, isId ? e.target.value.replace(/\D/g, '').slice(0, 13) : e.target.value)}
      />
    );
  };

  /** ช่องกรอกตามชื่อ key — ให้ฟอร์มที่จัดวางเองเรียกใช้ได้โดยไม่ต้องรู้เรื่อง schema */
  const field = (key: string) => {
    const def = schema.find((f) => f.key === key);
    return def ? renderField(def) : null;
  };

  /**
   * ช่องแนบไฟล์ — บัตรผู้นำเที่ยวเอาไปวางตรงตำแหน่งรูปบนบัตร ชนิดอื่นวางไว้บนสุด
   * กลุ่มแนบไฟล์บอกชนิดไฟล์ไว้ที่ป้ายเลย เพราะไฟล์คือตัวเอกสาร ไม่ใช่ของแนบประกอบ
   */
  const fileField = (
    <DocumentFileField
      label={fileBased ? 'ไฟล์เอกสาร (PDF หรือรูปภาพ)' : 'ไฟล์เอกสาร'}
      required={fileBased}
      tourLeaderId={tourLeaderId}
      kind={kind}
      value={file}
      error={errors.__file}
      onChange={(f) => { setFile(f); setErrors((prev) => ({ ...prev, __file: '' })); }}
      onRead={hasReadButton ? readFromFile : undefined}
      retainReplaced={!!editing}
    />
  );

  const visibleFields = schema.filter((f) => !f.hidden);

  const title = `${editing ? 'แก้ไข' : 'เพิ่ม'}${DOC_KIND_DISPLAY_NAME[kind]}`;

  const actions = (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          {!editing && (
            <Button variant="secondary" onClick={() => save('DRAFT')} loading={saving}>
              บันทึกเป็นฉบับร่าง
            </Button>
          )}
          <Button variant="primary" icon="check" onClick={() => save('CONFIRMED')} loading={saving}>
            {editing ? 'บันทึกการแก้ไข' : 'ยืนยันและบันทึก'}
          </Button>
        </div>
  );

  const body = (
      <div className="space-y-4">
        {duplicates.length > 0 && (
          <Callout tone="amber" title="เลขที่เอกสารนี้มีอยู่แล้วในระบบ">
            พบเอกสารชนิดเดียวกันที่ใช้เลขนี้ของหัวหน้าทัวร์รหัส{' '}
            {duplicates.map((d) => d.tourLeaderId).join(', ')} — ตรวจสอบก่อนบันทึกว่าเป็นคนละใบจริง
          </Callout>
        )}

        {kind === 'tour_card' ? (
          /* บัตรผู้นำเที่ยว — ช่องกรอกวางทับตำแหน่งเดียวกับบนบัตรจริง */
          <TourCardForm field={field} fileSlot={fileField} cardType={values.cardType ?? ''} />
        ) : kind === 'visa' ? (
          /* วีซ่า — ช่องกรอกวางทับตำแหน่งเดียวกับบนสติกเกอร์จริง */
          <VisaForm field={field} fileSlot={fileField} />
        ) : kind === 'id_card' ? (
          /* บัตรประชาชน — เช่นเดียวกัน ช่องกรอกอยู่ตำแหน่งเดียวกับบนบัตร */
          <IdCardForm
            field={field}
            fileSlot={fileField}
            addressSlot={
              <div className="grid gap-3 sm:grid-cols-2">
                <ThaiAddressFields
                  address={docAddress()}
                  errors={errors}
                  fieldPrefix=""
                  required={false}
                  onChange={applyAddress}
                />
              </div>
            }
          />
        ) : kind === 'other' ? (
          /* เอกสารอื่น ๆ — เลือกชื่อจาก list แทนพิมพ์เอง เลือก "อื่น ๆ (ระบุ)" แล้วพิมพ์เองได้เสมอ */
          <>
            {fileField}
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="ชื่อเอกสาร"
                required
                wrapperClassName="sm:col-span-2"
                value={otherTitleChoice}
                options={[
                  ...OTHER_DOC_TITLE_PRESETS.map((label) => ({ value: label, label })),
                  { value: OTHER_DOC_TITLE_TOUR_LICENSE, label: 'บัตรนำเที่ยว' },
                  { value: OTHER_DOC_TITLE_CUSTOM, label: 'อื่น ๆ (ระบุ)' },
                ]}
                error={otherTitleChoice !== OTHER_DOC_TITLE_CUSTOM && otherTitleChoice !== OTHER_DOC_TITLE_TOUR_LICENSE ? errors.docTitle : undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setOtherTitleChoice(v);
                  if (v === OTHER_DOC_TITLE_TOUR_LICENSE) {
                    setTourLicenseSub('');
                    setField('docTitle', '');
                  } else {
                    setField('docTitle', v === OTHER_DOC_TITLE_CUSTOM ? '' : v);
                  }
                }}
              />
              {otherTitleChoice === OTHER_DOC_TITLE_TOUR_LICENSE && (
                <SelectInput
                  label="ประเภทบัตรนำเที่ยว"
                  required
                  wrapperClassName="sm:col-span-2"
                  value={tourLicenseSub}
                  options={TOUR_LICENSE_SUBTYPES.map((label) => ({ value: label, label }))}
                  error={errors.docTitle}
                  onChange={(e) => {
                    setTourLicenseSub(e.target.value);
                    setField('docTitle', e.target.value);
                  }}
                />
              )}
              {otherTitleChoice === OTHER_DOC_TITLE_CUSTOM && (
                <TextInput
                  label="ระบุชื่อเอกสาร"
                  required
                  wrapperClassName="sm:col-span-2"
                  value={values.docTitle ?? ''}
                  error={errors.docTitle}
                  onChange={(e) => setField('docTitle', e.target.value)}
                />
              )}
              {field('issuedDate')}
              {field('expiryDate')}
            </div>
          </>
        ) : (
          <>
            {fileField}
            {visibleFields.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">{visibleFields.map(renderField)}</div>
            )}
          </>
        )}

        {/*
          "เอกสารอื่น ๆ" ไม่มีแนวคิดฉบับหลัก/ฉบับรอง — แต่ละฉบับเป็นเอกสารคนละชื่อคนละไฟล์กัน (บัตรประชาชน/
          หนังสืออาชญากรรม/ใบเซอร์/ฯลฯ) ไม่ใช่หลายเวอร์ชันของเอกสารชนิดเดียวกันแบบพาสปอร์ต/บัตรหัวหน้าทัวร์
          ทุกฉบับที่แนบถือว่าใช้งานอยู่ทั้งหมด ไม่ต้องเลือกฉบับหลัก — วีซ่าก็เช่นกัน (ตัดออกตามที่ผู้ใช้ระบุ)
        */}
        {kind !== 'other' && kind !== 'visa' && (
          <label className="flex items-center gap-2 text-sm zego-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={makePrimary}
              onChange={(e) => setMakePrimary(e.target.checked)}
            />
            ตั้งเป็นฉบับหลักของเอกสารชนิดนี้
            <span className="text-xs zego-text-tertiary">(ฉบับหลักเดิมจะถูกลดเป็นฉบับรองอัตโนมัติ)</span>
          </label>
        )}
      </div>
  );

  /* ฝังในการ์ด — ไม่มีเปลือกหน้าต่างซ้อน ปุ่มอยู่ท้ายฟอร์มเลย */
  if (variant === 'inline') {
    return (
      <div className="space-y-4">
        {body}
        {actions}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={fileBased
        ? 'แนบไฟล์เอกสาร (PDF หรือรูปภาพ) — ระบบเก็บชื่อไฟล์ วันเวลาที่แนบ และผู้แนบให้อัตโนมัติ'
        : 'กรอกข้อมูลตามหน้าเอกสารจริง — บันทึกเป็นฉบับร่างไว้ก่อนได้ แล้วค่อยยืนยันเมื่อตรวจสอบครบ'}
      footer={actions}
    >
      {body}
    </Modal>
  );
}
