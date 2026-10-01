'use client';

/**
 * §3–§10 แก้ไขข้อมูลหนังสือเดินทางของ "เล่มที่กดเข้ามาเท่านั้น"
 *
 * Drawer เดียวครบทุก Section (ห้ามแยกหลายหน้า) + รูปต้นฉบับสำหรับเทียบ + เทียบ OCR ใหม่
 * ห้ามแก้/เขียนทับเล่มอื่น · เปลี่ยนเล่มหลักต้องยืนยัน (ห้ามมีเล่มหลัก > 1) · เตือนเมื่อมีข้อมูลไม่บันทึก
 */

import { useEffect, useMemo, useState } from 'react';
import { Drawer, ConfirmDialog } from '@/components/ui/Modal';
import { Button, Callout, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { PassportPageForm } from './PassportPageForm';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { PassportImageViewer } from './PassportImageViewer';
import { validatePassportFields, evaluateSetPrimary } from '@/lib/logic/passportValidation';
import { composeFullName, buildOcrComparison, type OcrCompareRow } from '@/lib/logic/passportOcrMapping';
import { maskPassport } from '@/lib/logic/tourLeaderMaster';
import { PASSPORT_CARD_STATUS_META } from '@/lib/logic/passportCard';
import { formatDate } from '@/lib/format';
import { recognizePassport, OCR_STAGE_LABEL, type OcrStage } from '@/services/passportOcr';
import { renderEditedImage, FULL_CROP, isAcceptedFile, isPdf, pdfFirstPageToImage, ACCEPT_ATTR } from '@/services/passportImageEdit';
import { savePassportImage, openPassportImageUrl, releaseImageUrl } from '@/services/passportImageStore';
import { savePassportEdit, replaceBookSource, findBooksByPassportNo, getPrimaryBook, getPassportBook } from '@/services/passportBookStore';
import {
  PASSPORT_FIELD_LABEL, MRZ_VALIDATION_LABEL, emptyPassportFields,
  type PassportFieldKey, type PassportFieldValues, type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';
import type { PassportCardModel } from '@/lib/logic/passportCardModel';

/** ช่องในแต่ละ Section (§6) */
const DATE_FIELDS: PassportFieldKey[] = ['dateOfBirth', 'issueDate', 'expiryDate'];

export function PassportEditModal({
  card, open, variant = 'modal', onClose, onSaved, onDelete, deleteDisabledReason,
}: {
  card: PassportCardModel | null;
  open: boolean;
  /**
   * modal  = เปิดเป็น Drawer (ค่าเริ่มต้น)
   * inline = ฝังฟอร์มลงในการ์ดเล่มนั้นเลย — แก้ตรงหน้าเล่มโดยไม่ต้องเปิดหน้าต่างซ้อน
   */
  variant?: 'modal' | 'inline';
  onClose: () => void;
  onSaved: () => void;
  /** ลบเล่มนี้ — ไม่ส่งมา = ไม่มีปุ่มลบในฟอร์ม (ยังลบจากเมนู ⋮ ได้เหมือนเดิม) */
  onDelete?: () => void;
  /** ลบไม่ได้เพราะอะไร — ปุ่มจะถูกปิดพร้อมบอกเหตุผลแทนที่จะหายไปเฉย ๆ */
  deleteDisabledReason?: string | null;
}) {
  const { currentUser, today, countries, leaders, pushToast } = useDemo();
  const nowISO = `${today}T00:00`;
  const canEdit = can(currentUser.role, 'passport.edit');
  const canChangePrimary = can(currentUser.role, 'passport.changePrimary');
  const canUpload = can(currentUser.role, 'passport.uploadImage');
  const canViewFull = can(currentUser.role, 'passport.viewFull');

  const book = card?.bookId ? getPassportBook(card.bookId) : null;

  const [values, setValues] = useState<PassportFieldValues>(() => ({ ...emptyPassportFields(), ...(card?.fields ?? {}) }));
  /* หมายเหตุภายในไม่มีช่องให้แก้ในฟอร์มแล้ว — คงค่าเดิมไว้ ไม่ให้การบันทึกไปล้างทิ้ง */
  const note = book?.note ?? '';
  const [makePrimary, setMakePrimary] = useState(!!card?.isPrimary);
  const [dupAck, setDupAck] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmPrimary, setConfirmPrimary] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /* รูปต้นฉบับ (§5) */
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<Blob | null>(null);
  const [newImageName, setNewImageName] = useState<string | null>(null);

  /* เทียบ OCR ใหม่ (§5) */
  const [ocrStage, setOcrStage] = useState<OcrStage | null>(null);
  const [ocrPercent, setOcrPercent] = useState(0);
  const [compare, setCompare] = useState<{ rows: OcrCompareRow[]; fields: PassportOcrFields } | null>(null);
  const [useOcr, setUseOcr] = useState<Set<PassportFieldKey>>(new Set());

  const dirty = useMemo(() => {
    if (!card) return false;
    const fieldsChanged = Object.keys(values).some((k) => values[k as PassportFieldKey] !== (card.fields[k as PassportFieldKey] ?? ''));
    return fieldsChanged || note !== (book?.note ?? '') || makePrimary !== card.isPrimary || !!newImage;
  }, [values, note, makePrimary, newImage, card, book]);

  // โหลดรูปต้นฉบับของเล่มนี้ (ถ้ามีสิทธิ์และมีไฟล์)
  useEffect(() => {
    if (!open || !card?.imageId || !canViewFull) return;
    let revoked = false;
    let url: string | null = null;
    openPassportImageUrl(card.imageId, { canView: canViewFull, by: currentUser.name, at: nowISO, tourLeaderId: card.bookId ? (getPassportBook(card.bookId)?.tourLeaderId ?? '') : '' })
      .then((u) => { if (u && !revoked) { url = u; setImageUrl(u); } });
    return () => { revoked = true; if (url) releaseImageUrl(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card?.imageId]);

  useEffect(() => () => { if (imageUrl) releaseImageUrl(imageUrl); }, [imageUrl]);

  const duplicates = useMemo(() => {
    const no = values.passportNo?.trim() ?? '';
    if (!no) return [];
    return findBooksByPassportNo(no, card?.bookId ?? undefined).map((b) => {
      const owner = leaders.find((l) => l.id === b.tourLeaderId);
      return { tourLeaderId: b.tourLeaderId, leaderName: owner ? `${owner.firstName} ${owner.lastName}` : b.tourLeaderId };
    });
  }, [values.passportNo, card?.bookId, leaders]);

  const validation = useMemo(() => validatePassportFields({
    fields: values,
    countries,
    todayISO: today,
    mrzCheck: card?.mrzCheck ?? null,
    verifiedFields: Object.keys(PASSPORT_FIELD_LABEL) as PassportFieldKey[], // แก้เล่มที่บันทึกแล้ว ไม่บังคับตรวจ confidence ซ้ำ
    duplicates,
    duplicateAcknowledged: dupAck,
  }), [values, countries, today, card?.mrzCheck, duplicates, dupAck]);

  const primaryDecision = useMemo(
    () => card && !card.isPrimary
      ? evaluateSetPrimary(values.expiryDate, today, (() => { const p = getPrimaryBook(getPassportBook(card.bookId ?? '')?.tourLeaderId ?? ''); return p ? { label: p.fields.passportNo || p.bookId } : null; })())
      : { allowed: true as const, needsConfirm: false, warning: null, confirmMessage: null },
    [card, values.expiryDate, today],
  );

  if (!card || !card.bookId) return null;

  const masked = maskPassport(card.fields.passportNo || null);
  const subtitle = `${masked}${card.isPrimary ? ' · เล่มหลัก' : ''}`;

  const changeField = (key: PassportFieldKey, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'titleName' || key === 'firstName' || key === 'lastName') {
        next.fullName = composeFullName(next.titleName, next.firstName, next.lastName);
      }
      return next;
    });
  };

  /* -------------------- §5 อ่าน OCR ใหม่ (ไม่เขียนทับทันที) -------------------- */
  const pickAndOcr = async (file: File) => {
    if (!isAcceptedFile(file)) { pushToast('error', 'รองรับเฉพาะ JPG, PNG, PDF'); return; }
    setCompare(null);
    setOcrStage('UPLOADING');
    setOcrPercent(0);
    try {
      const img = isPdf(file, file.name) ? await pdfFirstPageToImage(file) : file;
      const edited = await renderEditedImage(img, 0, FULL_CROP);
      setNewImage(edited);
      setNewImageName(file.name);
      if (imageUrl) releaseImageUrl(imageUrl);
      setImageUrl(URL.createObjectURL(edited));

      const result = await recognizePassport(edited, {
        todayISO: today,
        onProgress: (p) => { setOcrStage(p.stage); setOcrPercent(p.percent); },
      });
      const rows = buildOcrComparison(values, result.fields, Object.keys(PASSPORT_FIELD_LABEL) as PassportFieldKey[]);
      setCompare({ rows, fields: result.fields });
      setUseOcr(new Set(rows.filter((r) => r.differs).map((r) => r.key))); // ค่าที่ต่างเลือกใช้ค่าใหม่ไว้ก่อน
      setOcrStage(null);
    } catch (e) {
      setOcrStage(null);
      pushToast('error', e instanceof Error ? e.message : 'อ่านข้อมูลไม่สำเร็จ');
    }
  };

  const applyOcr = () => {
    if (!compare) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const row of compare.rows) {
        if (useOcr.has(row.key)) next[row.key] = row.ocr;
      }
      next.fullName = composeFullName(next.titleName, next.firstName, next.lastName);
      return next;
    });
    setCompare(null);
    pushToast('info', 'นำค่าจาก OCR ที่เลือกมาใช้แล้ว — ตรวจสอบและกดบันทึกเพื่อยืนยัน');
  };

  /* -------------------------------- บันทึก (§6/§8) -------------------------------- */
  const doSave = async () => {
    if (!card.bookId || saving) return;
    setSaving(true);
    try {
      // อัปโหลดรูปใหม่ก่อน (ถ้ามี) แล้วผูกกับเล่มนี้
      if (newImage) {
        const imageId = await savePassportImage(newImage, {
          tourLeaderId: getPassportBook(card.bookId)?.tourLeaderId ?? '',
          fileName: newImageName ?? 'passport.jpg',
          uploadedBy: currentUser.name,
          uploadedAt: nowISO,
        });
        replaceBookSource(card.bookId, {
          imageId,
          sourceFileName: newImageName,
          ocrOriginal: compare?.fields ?? null,
          mrzCheck: null,
        }, { by: currentUser.name, at: nowISO, reOcr: !!compare });
      }

      savePassportEdit(card.bookId, { fields: values, note, makePrimary: makePrimary && primaryDecision.allowed }, { by: currentUser.name, at: nowISO });
      pushToast('success', 'บันทึกข้อมูล Passport เรียบร้อยแล้ว');
      onSaved();
      onClose();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  // กด "บันทึกการแก้ไข" → ถ้าตั้งเล่มหลักใหม่ ยืนยันสลับก่อน → แล้วยืนยันการบันทึก
  const onSaveClick = () => {
    if (makePrimary && !card.isPrimary && primaryDecision.allowed && primaryDecision.needsConfirm) {
      setConfirmPrimary(true);
      return;
    }
    setConfirmSave(true);
  };

  /* ------------------------- §9 ป้องกันข้อมูลสูญหาย ------------------------- */
  const attemptClose = () => {
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  };

  const readOnly = !canEdit;

  const actionButtons = (
          <>
            <Button variant="ghost" onClick={attemptClose} disabled={saving}>
              {readOnly ? 'ปิด' : 'ยกเลิก'}
            </Button>
            {!readOnly && (
              <Button variant="primary" onClick={onSaveClick} disabled={!validation.canConfirm || saving || !dirty}
                title={!dirty ? 'ยังไม่มีการเปลี่ยนแปลง' : validation.canConfirm ? undefined : 'ยังมีข้อมูลที่ต้องแก้ไขก่อนบันทึก'}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล Passport'}
              </Button>
            )}
          </>
  );

  /* รูปต้นฉบับอยู่ช่องรูปของหน้าเล่ม — ตำแหน่งเดียวกับรูปจริงในเล่ม เทียบข้อมูลได้ทันที (§5) */
  const photoSlot = (
    <div className="w-full sm:w-56">
      {/* การดูรูปต้นฉบับต้องมีสิทธิ์เห็นข้อมูลเต็ม (§11) */}
      {canViewFull ? (
        <PassportImageViewer url={imageUrl} />
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg zego-surface-soft-bg p-3 text-center text-xs zego-text-tertiary border zego-border-color">
          ไม่มีสิทธิ์ดูรูปหนังสือเดินทาง (ดูได้เฉพาะผู้มีสิทธิ์เห็นข้อมูลเต็ม)
        </div>
      )}

      {/* §5 อัปโหลดรูปใหม่ / อ่าน OCR ใหม่ — เป็นสิทธิ์แยกจากการดูเลขเต็ม */}
      {canUpload && !readOnly && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border zego-border-color zego-surface-bg px-2.5 py-1.5 text-xs font-medium zego-text-secondary zego-hover-surface">
          <Icon name="file" className="h-3.5 w-3.5" /> อัปโหลดรูปใหม่ / อ่าน OCR ใหม่
          <input type="file" accept={ACCEPT_ATTR} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAndOcr(f); e.target.value = ''; }} />
        </label>
      )}
      {newImageName && <p className="mt-1 text-xs zego-text-success">รูปใหม่: {newImageName} (บันทึกเมื่อกด “บันทึกข้อมูล Passport”)</p>}

      {/* สถานะ OCR ระหว่างอ่าน */}
      {ocrStage && (
        <div className="mt-2 rounded-lg zego-today-tint px-2.5 py-1.5 text-xs zego-text-info border zego-today-border">
          {OCR_STAGE_LABEL[ocrStage]} · {ocrPercent}%
        </div>
      )}
    </div>
  );

  /* ลบเล่มนี้ — วางคู่กับปุ่มบันทึก/ยกเลิก เพราะเป็นชุดคำสั่งของ "เล่มที่กำลังแก้" เหมือนกัน */
  const deleteButton = onDelete && !readOnly && (
    <Button size="sm" variant="danger" onClick={onDelete} disabled={Boolean(deleteDisabledReason) || saving}
      title={deleteDisabledReason ?? undefined}>
      ลบ Passport
    </Button>
  );

  const body = (
        <div className="space-y-4">
          {readOnly && (
            <Callout tone="blue" title="โหมดดูอย่างเดียว">บทบาทของคุณดูข้อมูลได้ แต่ไม่มีสิทธิ์แก้ไขหนังสือเดินทาง</Callout>
          )}

          {/* §5 ตารางเทียบ OCR ใหม่ */}
          {compare && (
            <OcrCompareTable rows={compare.rows} useOcr={useOcr} onToggle={(k) => setUseOcr((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              onApply={applyOcr} onDiscard={() => setCompare(null)} />
          )}

          {validation.errors.length > 0 && (
            <Callout tone="red" title={`ต้องแก้ไขก่อนบันทึก ${validation.errors.length} รายการ`}>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {validation.errors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
            </Callout>
          )}

          {duplicates.length > 0 && (
            <div className="rounded-lg border zego-warned-border zego-warned-tint p-3">
              <p className="text-sm font-semibold zego-text-danger">เลขหนังสือเดินทางนี้ซ้ำกับเล่มอื่นในระบบ</p>
              <p className="mt-0.5 text-xs zego-text-danger">{duplicates.map((d) => `${d.leaderName} (${d.tourLeaderId})`).join(', ')}</p>
              <label className="mt-2 flex items-start gap-2 text-xs zego-text-danger">
                <input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} className="mt-0.5 h-4 w-4" disabled={readOnly} />
                ยืนยันบันทึกแม้เลขซ้ำ
              </label>
            </div>
          )}

          {/* ---------------- หน้าเล่มเดิม แต่ทุกช่องกรอกได้ (§4/§6) ---------------- */}
          <PassportPageForm
            values={values}
            issues={validation.issues}
            countries={countries}
            todayISO={today}
            readOnly={readOnly}
            onChange={changeField}
            photo={photoSlot}
            banner={
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="zego-text-tertiary">สถานะ Passport</span>
                <span className={cx('inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', PASSPORT_CARD_STATUS_META[card.status].tone)}>
                  {PASSPORT_CARD_STATUS_META[card.status].label}
                </span>
                <span className="ml-2 zego-text-tertiary">ตรวจสอบ MRZ</span>
                <span className={cx('inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', MRZ_VALIDATION_LABEL[card.mrzValidation].tone)}>
                  {MRZ_VALIDATION_LABEL[card.mrzValidation].label}
                </span>
              </div>
            }
          />

          {/* §4 การตั้งค่า */}
          <section className="rounded-xl border zego-border-color zego-surface-bg p-4">
            <h3 className="text-sm font-semibold zego-text">การตั้งค่า</h3>
            <div className="mt-2 space-y-3">
              {canChangePrimary && (
                <div className="rounded-lg border zego-border-color zego-surface-soft-bg p-3">
                  <label className={cx('flex items-start gap-2 text-sm', (!primaryDecision.allowed || card.isPrimary) && 'opacity-70')}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4"
                      checked={makePrimary && primaryDecision.allowed}
                      disabled={readOnly || card.isPrimary || !primaryDecision.allowed}
                      onChange={(e) => setMakePrimary(e.target.checked)} />
                    <span>
                      <span className="font-medium zego-text">ตั้งเป็น Passport เล่มหลัก</span>
                      {card.isPrimary && <span className="ml-1 text-xs zego-text-info">(เล่มนี้เป็นเล่มหลักอยู่แล้ว)</span>}
                    </span>
                  </label>
                  {!primaryDecision.allowed && <p className="mt-1 text-xs zego-text-danger">{primaryDecision.reason}</p>}
                  {primaryDecision.allowed && primaryDecision.warning && makePrimary && <p className="mt-1 text-xs zego-text-warning">{primaryDecision.warning}</p>}
                </div>
              )}

              <p className="text-xs zego-text-tertiary">
                ไฟล์/รูป Passport ปัจจุบัน: {card.sourceFileName ?? (newImageName ? newImageName : 'ไม่มีไฟล์แนบ')}
                {card.imageId && ' · เก็บในพื้นที่ส่วนตัว ไม่มี Public URL'}
              </p>
            </div>
          </section>
        </div>
  );

  return (
    <>
      {variant === 'inline' ? (
        /* ฝังในการ์ดเล่มนั้น — ไม่มีเปลือกหน้าต่างซ้อน */
        open && (
          <div className="mt-4 space-y-4">
            {/*
              แถบคำสั่งชุดเดียวของฟอร์ม — อยู่ตรงตำแหน่งที่เพิ่งกด "แก้ไข" พอดี
              วางไว้ชุดเดียว ไม่ซ้ำที่ท้ายฟอร์ม เพราะปุ่มสองชุดทำให้ผู้ใช้สงสัยว่าอันไหนคือของจริง
            */}
            <div className="flex flex-wrap items-center justify-between gap-2 zego-divider-bottom pb-3">
              <p className="text-sm font-medium zego-text-secondary">กำลังแก้ไขข้อมูลเล่มนี้</p>
              <div className="flex flex-wrap items-center gap-2">
                {deleteButton}
                <Button size="sm" variant="ghost" onClick={attemptClose} disabled={saving}>
                  {readOnly ? 'ปิด' : 'ยกเลิก'}
                </Button>
                {!readOnly && (
                  <Button size="sm" variant="primary" onClick={onSaveClick} disabled={!validation.canConfirm || saving || !dirty}
                    title={!dirty ? 'ยังไม่มีการเปลี่ยนแปลง' : validation.canConfirm ? undefined : 'ยังมีข้อมูลที่ต้องแก้ไขก่อนบันทึก'}>
                    {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                  </Button>
                )}
              </div>
            </div>

            {body}
          </div>
        )
      ) : (
        <Drawer
        open={open}
        onClose={attemptClose}
        /* §7 ชื่อหัวข้อตรงกับปุ่มใน Card "ข้อมูล Passport" */
        title={readOnly ? 'ข้อมูล Passport' : 'แก้ไขข้อมูล Passport'}
        description={subtitle}
        size="xl"
          footer={actionButtons}
        >
          {body}
        </Drawer>
      )}

      {/* §8 ยืนยันเปลี่ยนเล่มหลัก */}
      <ConfirmDialog
        open={confirmPrimary}
        onClose={() => setConfirmPrimary(false)}
        onConfirm={() => { setConfirmPrimary(false); setConfirmSave(true); }}
        title="เปลี่ยนหนังสือเดินทางเล่มหลัก"
        message={`Passport ${masked} จะถูกตั้งเป็นเล่มหลัก และ Passport เล่มหลักเดิมจะเปลี่ยนเป็นเล่มรอง ต้องการดำเนินการต่อหรือไม่`}
        confirmLabel="ดำเนินการต่อ"
        tone="primary"
      />

      {/* §6 ยืนยันการบันทึก */}
      <ConfirmDialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={() => { setConfirmSave(false); void doSave(); }}
        title="ยืนยันการแก้ไข"
        message={`ยืนยันการแก้ไขข้อมูล Passport ${masked} หรือไม่`}
        confirmLabel="บันทึกการแก้ไข"
        tone="primary"
        loading={saving}
      />

      {/* §9 เตือนข้อมูลไม่บันทึก */}
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        title="มีข้อมูลที่ยังไม่ได้บันทึก"
        message="มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่"
        confirmLabel="ออกโดยไม่บันทึก"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** ค่าในตารางเทียบ — ช่องวันที่แสดง dd/mm/yy ตามมาตรฐานทั้งระบบ ไม่โชว์ ISO ดิบให้ผู้ใช้ */
function compareText(key: PassportFieldKey, value: string): string {
  if (!value) return '—';
  return DATE_FIELDS.includes(key) ? formatDate(value) : value;
}

/** §5 ตารางเทียบ: ข้อมูลปัจจุบัน vs OCR ใหม่ — ผู้ใช้เลือกรายช่อง */
function OcrCompareTable({
  rows, useOcr, onToggle, onApply, onDiscard,
}: {
  rows: OcrCompareRow[];
  useOcr: Set<PassportFieldKey>;
  onToggle: (k: PassportFieldKey) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const diffRows = rows.filter((r) => r.differs);
  return (
    <div className="rounded-xl border zego-today-border zego-today-tint p-3">
      <p className="text-sm font-semibold zego-text-info">ผลอ่าน OCR ใหม่ — เลือกว่าจะใช้ค่าใหม่หรือคงค่าเดิม</p>
      <p className="mt-0.5 text-xs zego-text-info">ระบบยังไม่เขียนทับข้อมูล จนกว่าคุณจะกด “นำค่าที่เลือกมาใช้”</p>

      {diffRows.length === 0 ? (
        <p className="mt-2 rounded-lg zego-surface-bg px-3 py-2 text-sm zego-text-secondary">ค่าจาก OCR ใหม่ตรงกับข้อมูลปัจจุบันทุกช่อง — ไม่มีอะไรต้องเปลี่ยน</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="text-left text-xs zego-text-tertiary">
                <th className="py-1 pr-2 font-medium">ช่องข้อมูล</th>
                <th className="py-1 pr-2 font-medium">ข้อมูลปัจจุบัน</th>
                <th className="py-1 pr-2 font-medium">ข้อมูลจาก OCR ใหม่</th>
                <th className="py-1 font-medium">ใช้ค่าใหม่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border)]">
              {diffRows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5 pr-2 zego-text-secondary">{PASSPORT_FIELD_LABEL[r.key]}</td>
                  <td className="py-1.5 pr-2 zego-text-tertiary line-through">{compareText(r.key, r.current)}</td>
                  <td className="py-1.5 pr-2 font-medium zego-text-success">{compareText(r.key, r.ocr)}</td>
                  <td className="py-1.5">
                    <input type="checkbox" className="h-4 w-4" checked={useOcr.has(r.key)} onChange={() => onToggle(r.key)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDiscard}>คงค่าเดิมทั้งหมด</Button>
        {diffRows.length > 0 && <Button size="sm" variant="primary" onClick={onApply}>นำค่าที่เลือกมาใช้</Button>}
      </div>
    </div>
  );
}
