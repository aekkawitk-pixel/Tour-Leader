'use client';

/**
 * §11 ขั้นตอนหลักของการเพิ่มหนังสือเดินทาง
 *   เพิ่มหนังสือเดินทาง → อัปโหลดรูป → ตรวจสอบตัวอย่างรูป → OCR อ่านข้อมูล
 *   → แสดงข้อมูลที่อ่านได้ → ผู้ใช้ตรวจสอบและแก้ไข → เลือกเล่มหลัก → ยืนยันและบันทึก
 *
 * OCR ช่วยกรอกข้อมูลเบื้องต้นเท่านั้น — ห้ามบันทึกลงฐานข้อมูลก่อนผู้ใช้ยืนยัน (§2/§9)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button, Callout, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { PassportUploadStep } from './PassportUploadStep';
import { PassportImageViewer } from './PassportImageViewer';
import { PassportReviewForm } from './PassportReviewForm';
import {
  recognizePassport, OCR_STAGE_LABEL,
  type OcrStage, type PassportOcrResult,
} from '@/services/passportOcr';
import { FULL_CROP, isFullCrop, renderEditedImage, type CropRect } from '@/services/passportImageEdit';
import { savePassportImage } from '@/services/passportImageStore';
import {
  createPassportBook, findBooksByPassportNo, getPrimaryBook,
  replaceBookSource, updatePassportBook,
} from '@/services/passportBookStore';
import { validatePassportFields, evaluateSetPrimary } from '@/lib/logic/passportValidation';
import { composeFullName } from '@/lib/logic/passportOcrMapping';
import {
  emptyPassportFields, manualFieldOrigin, PASSPORT_FIELD_ORDER,
  type FieldOrigin, type OcrConfidence, type PassportFieldKey,
  type PassportFieldValues, type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';
import type { TourLeader } from '@/types';

type Step = 'choose' | 'upload' | 'processing' | 'review';

const STAGE_ORDER: OcrStage[] = ['UPLOADING', 'QUALITY_CHECK', 'READING', 'VALIDATING', 'DONE'];

export function PassportAddModal({
  open, leader, onClose, onSaved, onPendingChange, replaceBookId,
}: {
  open: boolean;
  leader: TourLeader;
  onClose: () => void;
  onSaved: () => void;
  /** §7 แจ้งสถานะ "กำลังตรวจสอบข้อมูล Passport ใหม่" ให้หน้ารายการแสดง (ยังไม่สร้าง Card จริง) */
  onPendingChange?: (pending: boolean) => void;
  /** §6 อ่าน OCR ใหม่/อัปโหลดรูปใหม่ให้เล่มเดิม แทนการสร้างเล่มใหม่ */
  replaceBookId?: string;
}) {
  const { currentUser, today, leaders, countries, pushToast } = useDemo();
  const nowISO = `${today}T00:00`;

  const [step, setStep] = useState<Step>('choose');
  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState('');
  const [rotateDeg, setRotateDeg] = useState(0);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);

  const [stage, setStage] = useState<OcrStage>('UPLOADING');
  const [percent, setPercent] = useState(0);
  const [ocr, setOcr] = useState<PassportOcrResult | null>(null);

  const [values, setValues] = useState<PassportFieldValues>(emptyPassportFields);
  const [fieldOrigin, setFieldOrigin] = useState<Record<PassportFieldKey, FieldOrigin>>(manualFieldOrigin);
  const [verified, setVerified] = useState<Set<PassportFieldKey>>(new Set());
  const [makePrimary, setMakePrimary] = useState(false);
  const [dupAck, setDupAck] = useState(false);
  const [confirmPrimary, setConfirmPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * รูปที่ผ่านการหมุน/ครอปแล้ว — ใช้ทั้งทำ OCR และเก็บเป็นไฟล์ต้นฉบับ (§10)
   * เก็บเป็น state (ไม่ใช่ ref) เพราะปุ่ม “อ่านข้อมูลใหม่” ต้องเปิด/ปิดตามสถานะนี้ตอน render
   */
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  // ปล่อย blob: URL เมื่อเปลี่ยนรูป/ปิดหน้าต่าง (§9)
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);

  /* ------------------------------ ข้อมูลประกอบ ------------------------------ */

  const existingPrimary = useMemo(() => (open ? getPrimaryBook(leader.id) : null), [open, leader.id]);
  const isFirstBook = existingPrimary === null;

  const duplicates = useMemo(() => {
    const no = values.passportNo.trim();
    if (!no) return [];
    return findBooksByPassportNo(no).map((b) => {
      const owner = leaders.find((l) => l.id === b.tourLeaderId);
      return {
        tourLeaderId: b.tourLeaderId,
        leaderName: owner ? `${owner.firstName} ${owner.lastName}` : b.tourLeaderId,
      };
    });
  }, [values.passportNo, leaders]);

  const confidenceMap = useMemo(() => {
    if (!ocr) return undefined;
    const m: Partial<Record<PassportFieldKey, OcrConfidence>> = {};
    for (const k of PASSPORT_FIELD_ORDER) m[k] = ocr.fields[k].confidence;
    return m;
  }, [ocr]);

  const validation = useMemo(() => validatePassportFields({
    fields: values,
    countries,
    todayISO: today,
    mrzCheck: ocr?.mrzCheck ?? null,
    confidence: confidenceMap,
    verifiedFields: [...verified, ...PASSPORT_FIELD_ORDER.filter((k) => fieldOrigin[k] !== 'OCR')],
    duplicates,
    duplicateAcknowledged: dupAck,
  }), [values, countries, today, ocr, confidenceMap, verified, fieldOrigin, duplicates, dupAck]);

  const primaryDecision = useMemo(
    () => evaluateSetPrimary(values.expiryDate, today, existingPrimary ? { label: existingPrimary.fields.passportNo || existingPrimary.bookId } : null),
    [values.expiryDate, today, existingPrimary],
  );

  /* -------------------------------- OCR (§2) -------------------------------- */

  const runOcr = useCallback(async () => {
    if (!file) return;
    setStep('processing');
    setStage('UPLOADING');
    setPercent(0);
    onPendingChange?.(true); // §7 ยังไม่สร้าง Card จริงจนกว่าจะยืนยัน

    try {
      const edited = rotateDeg !== 0 || !isFullCrop(crop)
        ? await renderEditedImage(file, rotateDeg, crop)
        : file;
      setEditedBlob(edited);

      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
      setReviewUrl(URL.createObjectURL(edited));

      const result = await recognizePassport(edited, {
        todayISO: today,
        onProgress: (p) => { setStage(p.stage); setPercent(p.percent); },
      });

      setOcr(result);

      // §2.7 เติมข้อมูลลงฟอร์มอัตโนมัติ — ยังไม่บันทึกลงฐานข้อมูล
      const next = emptyPassportFields();
      const origin = manualFieldOrigin();
      for (const k of PASSPORT_FIELD_ORDER) {
        next[k] = result.fields[k].value;
        origin[k] = result.fields[k].value ? 'OCR' : 'MANUAL';
      }
      setValues(next);
      setFieldOrigin(origin);
      setVerified(new Set());
      setMakePrimary(isFirstBook);
      setStep('review');
    } catch (e) {
      // §8 ไม่ลบรูปที่อัปโหลด · เปิดฟอร์มให้กรอกเอง พร้อมรูปไว้เทียบ
      const message = e instanceof Error ? e.message : String(e);
      setOcr({
        fields: PASSPORT_FIELD_ORDER.reduce((acc, k) => {
          acc[k] = { value: '', confidence: 'UNREADABLE', score: null, source: 'NONE' };
          return acc;
        }, {} as PassportOcrFields),
        mrz: null,
        mrzCheck: { parsed: false, passportNoValid: null, dateOfBirthValid: null, expiryValid: null, compositeValid: null },
        failureReasons: [`อ่านข้อมูลไม่สำเร็จ: ${message}`],
        succeeded: false,
        quality: [],
        rawText: '',
        durationMs: 0,
      });
      setValues(emptyPassportFields());
      setFieldOrigin(manualFieldOrigin());
      setMakePrimary(isFirstBook);
      setStep('review');
    }
  }, [file, rotateDeg, crop, today, isFirstBook, reviewUrl, onPendingChange]);

  /* ------------------------------ แก้ไขข้อมูล ------------------------------ */

  const changeField = (key: PassportFieldKey, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // §3 ชื่อเต็มประกอบจาก คำนำหน้า+ชื่อ+นามสกุล แต่ผู้ใช้แก้เองได้ (แก้แล้วไม่เขียนทับ)
      if ((key === 'titleName' || key === 'firstName' || key === 'lastName') && fieldOrigin.fullName !== 'USER_VERIFIED') {
        next.fullName = composeFullName(next.titleName, next.firstName, next.lastName);
      }
      return next;
    });
    // §5 ผู้ใช้แก้แล้ว → “ตรวจสอบโดยผู้ใช้แล้ว”
    setFieldOrigin((prev) => ({ ...prev, [key]: 'USER_VERIFIED' }));
  };

  const verifyField = (key: PassportFieldKey) => {
    setVerified((prev) => new Set(prev).add(key));
    setFieldOrigin((prev) => ({ ...prev, [key]: 'USER_VERIFIED' }));
  };

  /* -------------------------------- บันทึก -------------------------------- */

  const doSave = async (status: 'DRAFT' | 'CONFIRMED') => {
    if (saving) return;
    setSaving(true);
    try {
      let imageId: string | null = null;
      if (editedBlob) {
        imageId = await savePassportImage(editedBlob, {
          tourLeaderId: leader.id,
          fileName: fileName || 'passport.jpg',
          uploadedBy: currentUser.name,
          uploadedAt: nowISO,
        });
      }

      if (replaceBookId) {
        // §6 อ่าน OCR ใหม่/เปลี่ยนรูปของเล่มเดิม — ไม่สร้างเล่มใหม่
        replaceBookSource(
          replaceBookId,
          {
            imageId,
            sourceFileName: fileName || null,
            ocrOriginal: ocr ? ocr.fields : null,
            mrzCheck: ocr?.mrzCheck ?? null,
          },
          { by: currentUser.name, at: nowISO, reOcr: !!ocr },
        );
        updatePassportBook(replaceBookId, values, { by: currentUser.name, at: nowISO, status });
        pushToast('success', 'อัปเดตข้อมูลหนังสือเดินทางเล่มเดิมเรียบร้อย');
      } else {
        createPassportBook({
          tourLeaderId: leader.id,
          fields: values,
          fieldOrigin,
          entryMethod: ocr ? 'OCR' : 'MANUAL',
          status,
          ocrOriginal: ocr ? ocr.fields : null,
          ocrRawText: ocr ? ocr.rawText : null, // §9 เก็บข้อความ OCR ดิบไว้ตรวจย้อนหลัง
          mrzCheck: ocr?.mrzCheck ?? null,
          imageId,
          sourceFileName: fileName || null,
          makePrimary: makePrimary && primaryDecision.allowed,
          by: currentUser.name,
          at: nowISO,
        });
        pushToast('success', status === 'CONFIRMED' ? 'บันทึกหนังสือเดินทางเรียบร้อย' : 'บันทึกเป็นฉบับร่างเรียบร้อย');
      }

      onPendingChange?.(false);
      onSaved();
      onClose();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  const onConfirmClick = () => {
    if (makePrimary && primaryDecision.allowed && primaryDecision.needsConfirm) {
      setConfirmPrimary(true);
      return;
    }
    void doSave('CONFIRMED');
  };

  /* ---------------------------- การล้างรูป (§8) ---------------------------- */

  const clearImage = () => {
    setFile(null); setFileName(''); setRotateDeg(0); setCrop(FULL_CROP);
    setEditedBlob(null);
    if (reviewUrl) { URL.revokeObjectURL(reviewUrl); setReviewUrl(null); }
  };

  /* --------------------------------- Render -------------------------------- */

  const title = step === 'review' ? 'ตรวจสอบข้อมูล Passport' : 'เพิ่มหนังสือเดินทาง';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        description={step === 'review' ? undefined : `หัวหน้าทัวร์: ${leader.firstName} ${leader.lastName}`}
        size={step === 'review' ? 'xl' : 'lg'}
        footer={step === 'review' ? (
          <ReviewFooter
            canConfirm={validation.canConfirm}
            saving={saving}
            onCancel={onClose}
            onReupload={() => { clearImage(); setStep('upload'); setOcr(null); }}
            onReRun={() => void runOcr()}
            hasImage={!!editedBlob}
            onDraft={() => void doSave('DRAFT')}
            onConfirm={onConfirmClick}
          />
        ) : undefined}
      >
        {/* -------- §1 เลือกวิธีเพิ่ม -------- */}
        {step === 'choose' && (
          <div className="space-y-3">
            <MethodCard
              recommended
              title="อัปโหลดรูป Passport และอ่านข้อมูลอัตโนมัติ"
              description="ระบบจะอ่านข้อมูลจากแถบ MRZ และหน้าเล่มมาเติมให้ก่อน แล้วให้คุณตรวจสอบและแก้ไขก่อนบันทึก"
              onClick={() => setStep('upload')}
            />
            <MethodCard
              title="กรอกข้อมูลด้วยตนเอง"
              description="ข้ามขั้นตอน OCR แล้วกรอกข้อมูลทุกช่องเอง"
              onClick={() => {
                setOcr(null);
                setValues(emptyPassportFields());
                setFieldOrigin(manualFieldOrigin());
                setMakePrimary(isFirstBook);
                setStep('review');
              }}
            />
          </div>
        )}

        {/* -------- §1 อัปโหลด + ตัวอย่างรูป -------- */}
        {step === 'upload' && (
          <PassportUploadStep
            file={file}
            fileName={fileName}
            rotateDeg={rotateDeg}
            crop={crop}
            onPick={(f, name) => { setFile(f); setFileName(name); setRotateDeg(0); setCrop(FULL_CROP); }}
            onRotate={setRotateDeg}
            onCrop={setCrop}
            onClear={clearImage}
            onStart={() => void runOcr()}
            busy={false}
          />
        )}

        {/* -------- §2 สถานะระหว่างประมวลผล -------- */}
        {step === 'processing' && <ProcessingView stage={stage} percent={percent} />}

        {/* -------- §4 หน้าตรวจสอบข้อมูล 2 ฝั่ง -------- */}
        {step === 'review' && (
          <div className="space-y-4">
            <Callout tone="blue" title="กรุณาตรวจสอบข้อมูลที่ระบบอ่านจาก Passport และแก้ไขข้อมูลให้ถูกต้องก่อนบันทึก">
              ระบบ OCR ช่วยกรอกข้อมูลเบื้องต้นเท่านั้น — ทุกช่องแก้ไขได้ และจะบันทึกเป็นข้อมูลจริงเมื่อคุณกดยืนยันเท่านั้น
            </Callout>

            {/* §8 OCR ไม่สำเร็จ — แจ้งสาเหตุ ไม่ลบรูป ให้กรอกเองต่อได้ */}
            {ocr && !ocr.succeeded && (
              <Callout tone="amber" title="ระบบอ่านข้อมูลจากรูปไม่สำเร็จ — กรอกข้อมูลด้วยตนเองได้">
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                  {ocr.failureReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </Callout>
            )}
            {ocr && ocr.succeeded && ocr.failureReasons.length > 0 && (
              <Callout tone="amber" title="อ่านข้อมูลได้บางส่วน — โปรดตรวจสอบ">
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                  {ocr.failureReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </Callout>
            )}
            {validation.errors.length > 0 && (
              <Callout tone="red" title={`ต้องแก้ไขก่อนบันทึก ${validation.errors.length} รายการ`}>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                  {validation.errors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}
                  {validation.errors.length > 6 && <li>… และอีก {validation.errors.length - 6} รายการ</li>}
                </ul>
              </Callout>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              {/* ฝั่งซ้าย: รูป */}
              <div className="lg:sticky lg:top-0 lg:self-start">
                <PassportImageViewer url={reviewUrl} />
              </div>

              {/* ฝั่งขวา: ฟอร์ม */}
              <div className="space-y-4">
                <PassportReviewForm
                  values={values}
                  ocr={ocr?.fields ?? null}
                  fieldOrigin={fieldOrigin}
                  issues={validation.issues}
                  onChange={changeField}
                  verified={verified}
                  onVerify={verifyField}
                />

                {/* §6 เลขซ้ำ — ต้องยืนยันก่อน */}
                {duplicates.length > 0 && (
                  <div className="rounded-lg border zego-warned-border zego-warned-tint p-3">
                    <p className="text-sm font-semibold zego-text-danger">พบเลขหนังสือเดินทางซ้ำในระบบ</p>
                    <p className="mt-0.5 text-xs zego-text-danger">
                      เลขนี้เป็นของ {duplicates.map((d) => `${d.leaderName} (${d.tourLeaderId})`).join(', ')}
                    </p>
                    <label className="mt-2 flex items-start gap-2 text-xs zego-text-danger">
                      <input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
                      ยืนยันว่าต้องการบันทึกข้อมูลนี้แม้เลขหนังสือเดินทางซ้ำ
                    </label>
                  </div>
                )}

                {/* §7 ตั้งเป็นเล่มหลัก */}
                <div className="rounded-lg border zego-border-color zego-surface-soft-bg p-3">
                  <label className={cx('flex items-start gap-2 text-sm', !primaryDecision.allowed && 'opacity-60')}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={makePrimary && primaryDecision.allowed}
                      disabled={!primaryDecision.allowed || isFirstBook}
                      onChange={(e) => setMakePrimary(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium zego-text">ตั้งเป็นหนังสือเดินทางเล่มหลัก</span>
                      {isFirstBook && <span className="ml-1 text-xs zego-text-success">(เล่มแรกของหัวหน้าทัวร์ — ตั้งเป็นเล่มหลักอัตโนมัติ)</span>}
                    </span>
                  </label>
                  {!primaryDecision.allowed && (
                    <p className="mt-1 text-xs zego-text-danger">{primaryDecision.reason}</p>
                  )}
                  {primaryDecision.allowed && primaryDecision.warning && (
                    <p className="mt-1 text-xs zego-text-warning">{primaryDecision.warning}</p>
                  )}
                  {primaryDecision.allowed && primaryDecision.needsConfirm && makePrimary && (
                    <p className="mt-1 text-xs zego-text-tertiary">{primaryDecision.confirmMessage}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* §7 ยืนยันเปลี่ยนเล่มหลัก */}
      <ConfirmDialog
        open={confirmPrimary}
        onClose={() => setConfirmPrimary(false)}
        onConfirm={() => { setConfirmPrimary(false); void doSave('CONFIRMED'); }}
        title="เปลี่ยนหนังสือเดินทางเล่มหลัก"
        message={primaryDecision.allowed ? (primaryDecision.confirmMessage ?? '') : ''}
        confirmLabel="ยืนยันเปลี่ยนเล่มหลัก"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function MethodCard({
  title, description, onClick, recommended,
}: { title: string; description: string; onClick: () => void; recommended?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
        recommended ? 'zego-today-border zego-today-tint' : 'zego-border-color zego-hover-surface',
      )}
    >
      <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', recommended ? 'zego-today-badge' : 'zego-icon-well')}>
        <Icon name={recommended ? 'file' : 'edit'} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold zego-text">{title}</span>
          {recommended && <span className="rounded-full zego-today-badge px-2 py-0.5 text-[11px] font-medium">แนะนำ</span>}
        </span>
        <span className="mt-0.5 block text-sm zego-text-tertiary">{description}</span>
      </span>
    </button>
  );
}

/** §2 สถานะระหว่างอ่านข้อมูล */
function ProcessingView({ stage, percent }: { stage: OcrStage; percent: number }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  return (
    <div className="space-y-5 py-6">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium zego-text">{OCR_STAGE_LABEL[stage]}</span>
          <span className="tabular-nums zego-text-tertiary">{percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full zego-skeleton">
          <div className="h-full rounded-full zego-meter-fill transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="space-y-2">
        {STAGE_ORDER.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s} className={cx('flex items-center gap-2.5 text-sm', done ? 'zego-text-success' : active ? 'zego-text' : 'zego-text-tertiary')}>
              <span className={cx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] zego-step-circle',
                done && 'zego-step-circle--success',
                active && 'zego-step-circle--info',
              )}>
                {done ? <Icon name="check" className="h-3 w-3" /> : i + 1}
              </span>
              {OCR_STAGE_LABEL[s]}
            </li>
          );
        })}
      </ol>

      <p className="text-xs zego-text-tertiary">
        ครั้งแรกอาจใช้เวลาสักครู่เพื่อเตรียมระบบอ่านข้อความ — รูปถูกประมวลผลในเครื่องของคุณ ไม่ถูกส่งออกภายนอก
      </p>
    </div>
  );
}

/** §4 ปุ่มด้านล่างหน้าตรวจสอบข้อมูล */
function ReviewFooter({
  canConfirm, saving, hasImage, onCancel, onReupload, onReRun, onDraft, onConfirm,
}: {
  canConfirm: boolean; saving: boolean; hasImage: boolean;
  onCancel: () => void; onReupload: () => void; onReRun: () => void; onDraft: () => void; onConfirm: () => void;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
      <Button variant="secondary" onClick={onReupload} disabled={saving}>อัปโหลดรูปใหม่</Button>
      <Button variant="secondary" onClick={onReRun} disabled={saving || !hasImage}>อ่านข้อมูลใหม่</Button>
      <Button variant="secondary" onClick={onDraft} disabled={saving}>บันทึกเป็นฉบับร่าง</Button>
      <Button
        variant="primary"
        onClick={onConfirm}
        disabled={!canConfirm || saving}
        title={canConfirm ? undefined : 'ยังมีข้อมูลที่ต้องตรวจสอบหรือแก้ไขก่อนบันทึก'}
      >
        {saving ? 'กำลังบันทึก…' : 'ยืนยันและบันทึก'}
      </Button>
    </>
  );
}
