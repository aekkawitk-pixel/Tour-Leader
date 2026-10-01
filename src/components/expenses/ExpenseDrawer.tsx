'use client';

/**
 * แผงรายละเอียดใบเบิก — ดูรายการ ยอดรวม Timeline และดำเนินการตามสิทธิ์
 *
 * อนุมัติบางรายการได้: ตอนใบอยู่ "ส่งอนุมัติ" บัญชีติ๊กออกทีละบรรทัด (ต้องใส่เหตุผล) → อนุมัติเฉพาะที่เหลือ
 * บรรทัดที่ไม่อนุมัติไม่นับในยอดอนุมัติ/ยอดบาท/ยอดใช้ไปของรายการเบิก และหัวหน้าทัวร์เห็นเหตุผล
 * ยอดทุกจุดแสดงตามสกุลเงินที่ทำรายการมา ไม่แปลงเป็นบาท
 */

import { useState } from 'react';
import Link from 'next/link';
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal';
import { Button, Callout, cx, StatusBadge } from '@/components/ui/Primitives';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { Timeline } from '@/components/ui/Timeline';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { can, canViewPath } from '@/lib/permissions';
import { EXPENSE_STATUS, MONEY_CATEGORY } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, formatDateTime } from '@/lib/format';
import { CurrencyStack } from '@/app/guide/expenses/CurrencyStack';
import { expenseApprovedTotals, expenseOriginalTotals, formatMultiCurrency, groupAmountsByCurrency, requestedAtOf } from '@/app/guide/expenses/expenseAmounts';
import { EvidencePreview } from '@/app/guide/expenses/EvidencePreview';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import type { ExpenseRequest, ExpenseStatus } from '@/types';

export function ExpenseDrawer({
  expense,
  onClose,
  onEdit,
}: {
  expense: ExpenseRequest | null;
  onClose: () => void;
  onEdit: (expense: ExpenseRequest) => void;
}) {
  const { changeExpenseStatus, approveExpenseLines, saving, currentUser, jobs } = useDemo();
  /** บรรทัดที่บัญชีติ๊กออก (ไม่อนุมัติ) → เหตุผล · ผูกกับเลขใบ กันค้างเมื่อเปิดใบอื่น */
  const [review, setReview] = useState<{ id: string; excluded: Record<string, string> }>({ id: '', excluded: {} });

  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseNote, setReviseNote] = useState('');
  const [reviseError, setReviseError] = useState<string>();
  const [reviseMode, setReviseMode] = useState<'revise' | 'rejected'>('revise');

  const [payOpen, setPayOpen] = useState(false);
  const [payRef, setPayRef] = useState('');

  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  if (!expense) return null;
  // ยอดตามสกุลเงินที่ทำรายการมา (ไม่แปลงเป็นบาท) — ใบเดียวมีหลายสกุลได้ แยกบรรทัดละสกุล
  const originalTotals = expenseOriginalTotals(expense);
  const totalText = formatMultiCurrency(originalTotals);
  const approvedTotals = expenseApprovedTotals(expense);
  const partial = expense.lines.some((l) => l.rejected);

  const excluded = review.id === expense.id ? review.excluded : {};
  const setExcluded = (next: Record<string, string>) => setReview({ id: expense.id, excluded: next });
  const toggleLine = (lineId: string, approve: boolean) => {
    const next = { ...excluded };
    if (approve) delete next[lineId];
    else next[lineId] = '';
    setExcluded(next);
  };
  const excludedIds = Object.keys(excluded);
  const keptCount = expense.lines.length - excludedIds.length;
  const missingReason = excludedIds.some((id) => !excluded[id].trim());
  /** ยอดที่จะอนุมัติ (ระหว่างตรวจ) — ไม่รวมบรรทัดที่ติ๊กออก */
  const toApproveTotals = groupAmountsByCurrency(
    expense.lines.filter((l) => !(l.id in excluded)).map((l) => ({ amount: l.amount, currency: l.currency })),
  );

  const job = jobs.find((j) => j.id === expense.jobId);
  /*
   * ใบเบิกที่บันทึกจากพอร์ทัลหัวหน้าทัวร์ใช้ periodId (Tour Period Master) เป็น jobId
   * ไม่ใช่ TourJob.id อีกต่อไป (ดูหมายเหตุที่ src/app/guide/expenses/page.tsx) — หาไม่เจอใน jobs
   * ให้ลองหาใน Tour Period Master ต่อ ก่อนจะตกไปแสดง jobId ดิบ ๆ
   */
  const period = !job ? getTourPeriodById(expense.jobId) : null;
  const isAccounting = can(currentUser.role, 'expense.approve');
  const reviewing = expense.status === 'submitted' && isAccounting;
  const isOwner =
    expense.requesterId === currentUser.leaderId || currentUser.role === 'admin';

  const act = async (status: ExpenseStatus, note?: string, ref?: string) => {
    await changeExpenseStatus(expense.id, status, note, ref);
    onClose();
  };

  const openRevise = (mode: 'revise' | 'rejected') => {
    setReviseMode(mode);
    setReviseNote('');
    setReviseError(undefined);
    setReviseOpen(true);
  };

  const submitRevise = async () => {
    if (!reviseNote.trim()) {
      setReviseError('กรุณาระบุเหตุผล');
      return;
    }
    setReviseOpen(false);
    await act(reviseMode, reviseNote.trim());
  };

  const actions = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        ปิด
      </Button>

      {(expense.status === 'draft' || expense.status === 'revise') && isOwner && (
        <>
          <Button variant="secondary" icon="edit" onClick={() => onEdit(expense)} disabled={saving}>
            แก้ไข
          </Button>
          <Button variant="primary" onClick={() => setConfirmSubmit(true)} disabled={saving}>
            ส่งอนุมัติ
          </Button>
        </>
      )}

      {expense.status === 'submitted' && isAccounting && (
        <>
          <Button variant="secondary" onClick={() => openRevise('rejected')} disabled={saving}>
            ปฏิเสธ
          </Button>
          <Button variant="secondary" onClick={() => openRevise('revise')} disabled={saving}>
            ส่งกลับแก้ไข
          </Button>
          <Button
            variant="success"
            onClick={() => setConfirmApprove(true)}
            disabled={saving || keptCount === 0 || missingReason}
            title={keptCount === 0 ? 'ไม่อนุมัติทุกรายการ — ใช้ปุ่มปฏิเสธแทน' : missingReason ? 'ใส่เหตุผลของรายการที่ไม่อนุมัติให้ครบ' : undefined}
          >
            {excludedIds.length === 0 ? 'อนุมัติ' : `อนุมัติ ${keptCount}/${expense.lines.length} รายการ`}
          </Button>
        </>
      )}

      {expense.status === 'approved' && isAccounting && (
        <Button
          variant="primary"
          onClick={() => act('awaiting_payment', 'ตั้งเรื่องรอจ่ายเงิน')}
          loading={saving}
        >
          ตั้งเรื่องรอจ่าย
        </Button>
      )}

      {expense.status === 'awaiting_payment' && can(currentUser.role, 'expense.pay') && (
        <Button
          variant="primary"
          icon="money"
          onClick={() => {
            setPayRef('');
            setPayOpen(true);
          }}
          disabled={saving}
        >
          บันทึกการจ่ายเงิน
        </Button>
      )}
    </>
  );

  return (
    <>
      <Drawer
        open={expense !== null}
        onClose={onClose}
        title={`ใบเบิก ${expense.id}`}
        description={`${expense.requesterName} · บันทึกเมื่อ ${formatDateTime(requestedAtOf(expense))}`}
        footer={actions}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge meta={EXPENSE_STATUS[expense.status]} />
            <StatusBadge meta={MONEY_CATEGORY[expense.category]} dot={false} />
          </div>

          {expense.status === 'revise' && (
            <Callout tone="amber" title="ฝ่ายบัญชีส่งกลับให้แก้ไข">
              {expense.history.filter((h) => h.to === 'revise').at(-1)?.note ??
                'กรุณาตรวจสอบเอกสารประกอบ'}
            </Callout>
          )}
          {expense.status === 'rejected' && (
            <Callout tone="red" title="ใบเบิกถูกปฏิเสธ">
              {expense.history.filter((h) => h.to === 'rejected').at(-1)?.note ?? '—'}
            </Callout>
          )}
          {expense.status === 'paid' && (
            <Callout tone="green" title="จ่ายเงินแล้ว (จำลอง)">
              จ่ายเมื่อ {formatDate(expense.paidAt ?? '')} · อ้างอิง{' '}
              <span className="font-mono">{expense.paidRef}</span>
            </Callout>
          )}

          {/* ข้อมูลหลัก */}
          <dl className="space-y-2.5 text-sm">
            <Row
              label="งานทัวร์"
              value={
                job ? (
                  // ฝ่ายบัญชีเปิดหน้าการจัดสเก็ตไม่ได้ — แสดงชื่องานเป็นข้อความแทนลิงก์ที่กดแล้วเจอหน้าไม่มีสิทธิ์
                  canViewPath(currentUser.role, `/jobs/${job.id}`) ? (
                    <Link
                      href={`/jobs/${job.id}`}
                      className="zego-text-info hover:underline"
                    >
                      {job.id} — {job.title}
                    </Link>
                  ) : (
                    <span>{job.id} — {job.title}</span>
                  )
                ) : period ? (
                  <span>
                    {period.groupCode} — {period.displayName}
                    <span className="ml-1 text-xs zego-text-disabled">({formatDateRange(period.startDate, period.endDate)})</span>
                  </span>
                ) : (
                  expense.jobId
                )
              }
            />
            <Row label="ผู้บันทึก" value={expense.requesterName} />
            <Row label="วันที่บันทึก" value={formatDateTime(requestedAtOf(expense))} />
          </dl>

          {/* รายการ */}
          <div>
            <h3 className="mb-2 text-sm font-semibold zego-text">
              รายการค่าใช้จ่าย ({expense.lines.length})
            </h3>
            <ul className="space-y-2">
              {expense.lines.map((line) => {
                const off = reviewing ? line.id in excluded : Boolean(line.rejected);
                return (
                <li key={line.id} className={cx('rounded-lg border p-3', off ? 'border-rose-200 bg-rose-50/40' : 'zego-border-color')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {reviewing && (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                          checked={!off}
                          onChange={(e) => toggleLine(line.id, e.target.checked)}
                          aria-label={`อนุมัติรายการ ${line.purpose}`}
                        />
                      )}
                      <div className="min-w-0">
                        <p className={cx('text-sm font-medium', off ? 'zego-text-tertiary' : 'zego-text')}>{line.expenseType}</p>
                        <p className="text-xs zego-text-tertiary">{line.purpose}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {/* ตามสกุลเงินที่ทำรายการมา ไม่แปลงเป็นบาท */}
                      <p className={cx('text-sm font-semibold tabular-nums', off ? 'line-through zego-text-tertiary' : 'zego-text')}>
                        {formatCurrency(line.amount, line.currency)}
                      </p>
                      {off && <span className="text-[11px] font-semibold text-rose-600">ไม่อนุมัติ</span>}
                    </div>
                  </div>
                  {reviewing && off && (
                    <div className="mt-2">
                      <TextInput
                        label="เหตุผลที่ไม่อนุมัติ"
                        required
                        value={excluded[line.id]}
                        onChange={(e) => setExcluded({ ...excluded, [line.id]: e.target.value })}
                        placeholder="เช่น ไม่มีใบเสร็จ / ไม่อยู่ในเงื่อนไขเบิก"
                      />
                    </div>
                  )}
                  {!reviewing && line.rejected && line.rejectNote && (
                    <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">เหตุผลที่ไม่อนุมัติ: {line.rejectNote}</p>
                  )}
                  <div className="zego-divider-top mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-xs zego-text-tertiary">
                    <span>ใบเสร็จ: {line.receiptNo}</span>
                    {line.receiptDate && <span>วันที่ใบเสร็จ: {formatDate(line.receiptDate)}</span>}
                    {line.evidenceImage ? (
                      <EvidencePreview fileName={line.evidenceFileName} image={line.evidenceImage} />
                    ) : (
                      <span
                        className={cx(
                          'inline-flex items-center gap-1',
                          line.evidenceFileName === 'ไม่มีหลักฐาน' && 'font-medium text-rose-600',
                        )}
                      >
                        <Icon name="file" className="h-3 w-3" />
                        {line.evidenceFileName}
                      </span>
                    )}
                  </div>
                  {line.note && (
                    <p className="mt-2 rounded zego-badge--warning px-2 py-1 text-xs">
                      {line.note}
                    </p>
                  )}
                </li>
                );
              })}
            </ul>
            {reviewing && expense.lines.length > 1 && (
              <p className="mt-2 text-xs zego-text-tertiary">เอาเครื่องหมายถูกออกจากรายการที่ไม่อนุมัติ แล้วใส่เหตุผล — อนุมัติเฉพาะรายการที่เหลือ</p>
            )}

            {reviewing && excludedIds.length > 0 ? (
              <div className="mt-3 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-start justify-between gap-2 text-xs zego-text-tertiary">
                  <span>ยอดที่ขอ</span>
                  <CurrencyStack totals={originalTotals} className="text-right" lineClassName="tabular-nums" />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold zego-text-success">ยอดที่จะอนุมัติ ({keptCount}/{expense.lines.length} รายการ)</span>
                  <CurrencyStack totals={toApproveTotals} className="text-right" lineClassName="text-lg font-bold tabular-nums zego-text-success" />
                </div>
              </div>
            ) : partial ? (
              <div className="mt-3 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-start justify-between gap-2 text-xs zego-text-tertiary">
                  <span>ยอดที่ขอ</span>
                  <CurrencyStack totals={originalTotals} className="text-right" lineClassName="tabular-nums line-through" />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold zego-text-success">ยอดอนุมัติ (บางรายการ)</span>
                  <CurrencyStack totals={approvedTotals} className="text-right" lineClassName="text-lg font-bold tabular-nums zego-text-success" />
                </div>
              </div>
            ) : (
              <div className="zego-badge--info mt-3 flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm font-semibold">ยอดรวมทั้งใบ</span>
                <CurrencyStack totals={originalTotals} className="text-right" lineClassName="text-lg font-bold tabular-nums" />
              </div>
            )}
          </div>

          {expense.note && (
            <div className="zego-surface-soft-bg rounded-lg px-4 py-3">
              <p className="text-xs font-semibold zego-text-tertiary">หมายเหตุ</p>
              <p className="mt-1 text-sm zego-text-secondary">{expense.note}</p>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold zego-text">Timeline การอนุมัติ</h3>
            <Timeline
              events={expense.history}
              resolve={(key) =>
                EXPENSE_STATUS[key as ExpenseStatus] ?? { label: key, tone: 'slate' }
              }
            />
          </div>
        </div>
      </Drawer>

      {/* ส่งกลับแก้ไข / ปฏิเสธ */}
      <Modal
        open={reviseOpen}
        onClose={() => setReviseOpen(false)}
        size="sm"
        title={reviseMode === 'revise' ? 'ส่งกลับให้แก้ไข' : 'ปฏิเสธใบเบิก'}
        description={expense.id}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviseOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              variant={reviseMode === 'revise' ? 'primary' : 'danger'}
              onClick={submitRevise}
              loading={saving}
            >
              {reviseMode === 'revise' ? 'ส่งกลับแก้ไข' : 'ยืนยันการปฏิเสธ'}
            </Button>
          </>
        }
      >
        <TextArea
          label="เหตุผล"
          required
          rows={4}
          value={reviseNote}
          error={reviseError}
          onChange={(e) => {
            setReviseNote(e.target.value);
            setReviseError(undefined);
          }}
          hint="ข้อความนี้จะถูกบันทึกใน Timeline และแจ้งผู้ขอเบิก"
        />
      </Modal>

      {/* บันทึกการจ่ายเงิน */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="sm"
        title="บันทึกการจ่ายเงิน (จำลอง)"
        description={`${expense.id} · ${formatMultiCurrency(approvedTotals)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              variant="success"
              onClick={async () => {
                setPayOpen(false);
                await act('paid', 'บันทึกการจ่ายเงิน (จำลอง)', payRef.trim() || undefined);
              }}
              loading={saving}
            >
              ยืนยันการจ่ายเงิน
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Callout tone="amber" title="ไม่มีการโอนเงินจริง">
            Demo นี้ไม่เชื่อมต่อระบบธนาคารหรือโปรแกรมบัญชี การบันทึกนี้เป็นเพียงข้อมูลจำลอง
          </Callout>
          <TextInput
            label="เลขที่อ้างอิงการจ่าย"
            placeholder="เว้นว่างเพื่อให้ระบบสร้างให้ (จำลอง)"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={async () => {
          setConfirmApprove(false);
          const rejected = Object.fromEntries(excludedIds.map((id) => [id, excluded[id].trim()]));
          await approveExpenseLines(expense.id, rejected);
          setExcluded({});
          onClose();
        }}
        loading={saving}
        tone="success"
        title={excludedIds.length === 0 ? 'ยืนยันการอนุมัติ' : 'ยืนยันการอนุมัติบางรายการ'}
        confirmLabel={excludedIds.length === 0 ? 'อนุมัติใบเบิก' : `อนุมัติ ${keptCount} รายการ`}
        message={
          excludedIds.length === 0
            ? `อนุมัติใบเบิก ${expense.id} ยอดรวม ${totalText} ใช่หรือไม่?`
            : `อนุมัติใบเบิก ${expense.id} เฉพาะ ${keptCount}/${expense.lines.length} รายการ ยอด ${formatMultiCurrency(toApproveTotals)} · ไม่อนุมัติ: ${expense.lines
                .filter((l) => l.id in excluded)
                .map((l) => `${l.purpose} (${excluded[l.id].trim()})`)
                .join(', ')}`
        }
      />

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={async () => {
          setConfirmSubmit(false);
          await act('submitted', 'ส่งอนุมัติ');
        }}
        loading={saving}
        tone="primary"
        title="ยืนยันการส่งอนุมัติ"
        confirmLabel="ส่งอนุมัติ"
        message={`ส่งใบเบิก ${expense.id} ให้ฝ่ายบัญชีพิจารณา ยอดรวม ${totalText}`}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="w-32 shrink-0 zego-text-disabled">{label}</dt>
      <dd className="min-w-0 flex-1 zego-text-secondary">{value}</dd>
    </div>
  );
}
