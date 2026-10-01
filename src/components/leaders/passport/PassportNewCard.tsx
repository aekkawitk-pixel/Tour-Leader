'use client';

/**
 * เพิ่มหนังสือเดินทาง — การ์ดเปล่าที่กรอกได้ทันทีในหน้าเดียวกัน (ไม่เปิดหน้าต่างซ้อน)
 *
 * ใช้ผังหน้าเล่มชุดเดียวกับการ์ดเล่มที่มีอยู่แล้ว ผู้ใช้จึงเห็นว่ากำลังกรอก "หน้าเล่ม" ตรง ๆ
 * บันทึกลงฐานข้อมูลเมื่อกดยืนยันเท่านั้น (§2/§9) — ก่อนหน้านั้นยังไม่มีเล่มนี้ในระบบ
 *
 * เส้นทางอ่านจากรูปด้วย OCR ยังอยู่ที่ปุ่ม "อัปโหลดรูปแล้วให้ระบบอ่าน" ซึ่งเปิดหน้าต่างเดิม
 * (มีขั้นตอนหมุน/ครอปรูปและป้ายความมั่นใจรายช่องที่การ์ดนี้ไม่มี)
 */

import { useMemo, useState } from 'react';
import { Button, Callout, Card, cx } from '@/components/ui/Primitives';
import { PassportPageForm } from './PassportPageForm';
import { useDemo } from '@/store/DemoStore';
import { validatePassportFields, evaluateSetPrimary } from '@/lib/logic/passportValidation';
import { composeFullName } from '@/lib/logic/passportOcrMapping';
import { createPassportBook, findBooksByPassportNo, getPrimaryBook } from '@/services/passportBookStore';
import {
  emptyPassportFields, manualFieldOrigin, PASSPORT_FIELD_ORDER,
  type PassportFieldKey, type PassportFieldValues,
} from '@/data/leaders/passportBookTypes';
import { ConfirmDialog } from '@/components/ui/Modal';
import type { TourLeader } from '@/types';

export function PassportNewCard({
  leader, onCancel, onSaved, onUseOcr,
}: {
  leader: TourLeader;
  onCancel: () => void;
  onSaved: () => void;
  /** เปิดเส้นทางอัปโหลดรูป + OCR (หน้าต่างเดิม) */
  onUseOcr: () => void;
}) {
  const { currentUser, today, countries, leaders, pushToast } = useDemo();
  const nowISO = `${today}T00:00`;

  const [values, setValues] = useState<PassportFieldValues>(emptyPassportFields);
  const [dupAck, setDupAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmPrimary, setConfirmPrimary] = useState(false);

  /** เล่มแรกของหัวหน้าทัวร์คนนี้ต้องเป็นเล่มหลักเสมอ (ห้ามมีเล่มที่ไม่มีเล่มหลัก) */
  const existingPrimary = useMemo(() => getPrimaryBook(leader.id), [leader.id]);
  const isFirstBook = existingPrimary === null;
  const [makePrimary, setMakePrimary] = useState(isFirstBook);

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

  const validation = useMemo(() => validatePassportFields({
    fields: values,
    countries,
    todayISO: today,
    mrzCheck: null,
    // กรอกเองทุกช่อง จึงไม่มีค่าจาก OCR ที่ต้องบังคับให้ยืนยันซ้ำ
    verifiedFields: PASSPORT_FIELD_ORDER,
    duplicates,
    duplicateAcknowledged: dupAck,
  }), [values, countries, today, duplicates, dupAck]);

  const primaryDecision = useMemo(
    () => evaluateSetPrimary(values.expiryDate, today, existingPrimary ? { label: existingPrimary.fields.passportNo || existingPrimary.bookId } : null),
    [values.expiryDate, today, existingPrimary],
  );

  const changeField = (key: PassportFieldKey, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // ชื่อเต็มประกอบจาก คำนำหน้า+ชื่อ+นามสกุล ให้อัตโนมัติ (ผู้ใช้แก้ทับได้)
      if (key === 'titleName' || key === 'firstName' || key === 'lastName') {
        next.fullName = composeFullName(next.titleName, next.firstName, next.lastName);
      }
      return next;
    });
  };

  const doSave = (status: 'DRAFT' | 'CONFIRMED') => {
    if (saving) return;
    setSaving(true);
    try {
      createPassportBook({
        tourLeaderId: leader.id,
        fields: values,
        fieldOrigin: manualFieldOrigin(),
        entryMethod: 'MANUAL',
        status,
        ocrOriginal: null,
        ocrRawText: null,
        mrzCheck: null,
        imageId: null,
        sourceFileName: null,
        makePrimary: makePrimary && primaryDecision.allowed,
        by: currentUser.name,
        at: nowISO,
      });
      pushToast('success', status === 'CONFIRMED' ? 'บันทึกหนังสือเดินทางเรียบร้อย' : 'บันทึกเป็นฉบับร่างเรียบร้อย');
      onSaved();
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
    doSave('CONFIRMED');
  };

  const actions = () => (
    <>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
      <Button size="sm" variant="secondary" onClick={() => doSave('DRAFT')} disabled={saving}>
        บันทึกเป็นฉบับร่าง
      </Button>
      <Button size="sm" variant="primary" onClick={onConfirmClick} disabled={!validation.canConfirm || saving}
        title={validation.canConfirm ? undefined : 'ยังมีข้อมูลที่ต้องแก้ไขก่อนบันทึก'}>
        {saving ? 'กำลังบันทึก…' : 'บันทึกหนังสือเดินทาง'}
      </Button>
    </>
  );

  return (
    <>
      <Card className="border zego-selected-border">
        {/* แถบคำสั่งชุดเดียวของการ์ด — ไม่วางปุ่มซ้ำที่ท้ายฟอร์ม เพราะสองชุดทำให้สับสนว่าอันไหนคือของจริง */}
        <div className="flex flex-wrap items-start justify-between gap-3 zego-divider-bottom pb-3">
          <div className="min-w-0">
            <p className="text-base font-semibold zego-text">หนังสือเดินทางเล่มใหม่</p>
            <p className="mt-0.5 text-sm zego-text-tertiary">
              กรอกตามหน้าเล่มได้เลย — จะบันทึกลงระบบเมื่อกดยืนยันเท่านั้น
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions()}</div>
        </div>

        <div className="mt-4 space-y-4">
          {validation.errors.length > 0 && (
            <Callout tone="red" title={`ต้องแก้ไขก่อนบันทึก ${validation.errors.length} รายการ`}>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {validation.errors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}
                {validation.errors.length > 6 && <li>… และอีก {validation.errors.length - 6} รายการ</li>}
              </ul>
            </Callout>
          )}

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

          <PassportPageForm
            values={values}
            issues={validation.issues}
            countries={countries}
            todayISO={today}
            onChange={changeField}
            photo={
              /* ช่องรูปของหน้าเล่ม — การ์ดนี้ไม่แนบรูป แต่เป็นทางเข้าเส้นทาง OCR */
              <div className="flex h-32 w-24 flex-col items-center justify-center gap-1.5 rounded border border-dashed zego-border-color zego-surface-bg p-2 text-center">
                <span className="text-[10px] leading-tight zego-text-tertiary">มีรูปหน้าเล่ม?</span>
                <button type="button" onClick={onUseOcr}
                  className="rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight zego-text-info border zego-border-color zego-hover-surface">
                  อัปโหลดรูป แล้วให้ระบบอ่าน
                </button>
              </div>
            }
          />

          <section className="rounded-xl border zego-border-color zego-surface-bg p-4">
            <h3 className="text-sm font-semibold zego-text">การตั้งค่า</h3>
            <div className="mt-2 rounded-lg border zego-border-color zego-surface-soft-bg p-3">
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
              {!primaryDecision.allowed && <p className="mt-1 text-xs zego-text-danger">{primaryDecision.reason}</p>}
              {primaryDecision.allowed && primaryDecision.warning && <p className="mt-1 text-xs zego-text-warning">{primaryDecision.warning}</p>}
            </div>
          </section>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmPrimary}
        onClose={() => setConfirmPrimary(false)}
        onConfirm={() => { setConfirmPrimary(false); doSave('CONFIRMED'); }}
        title="เปลี่ยนหนังสือเดินทางเล่มหลัก"
        message={primaryDecision.allowed ? (primaryDecision.confirmMessage ?? '') : ''}
        confirmLabel="ยืนยันเปลี่ยนเล่มหลัก"
      />
    </>
  );
}
