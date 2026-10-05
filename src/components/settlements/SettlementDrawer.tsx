'use client';

/**
 * แผงเคลียร์เงินกรุ๊ป — ตรวจค่าใช้จ่ายทีละรายการ คำนวณยอดสุทธิทันที นัดหมาย
 * ยืนยันรับ/จ่ายเงิน และปิดการเคลียร์เงินกรุ๊ป
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal';
import { Button, Callout, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { Timeline } from '@/components/ui/Timeline';
import { Icon } from '@/components/ui/Icon';
import { AppointmentFormModal } from '@/components/appointments/AppointmentFormModal';
import { useDemo } from '@/store/DemoStore';
import { can, canViewPath } from '@/lib/permissions';
import { REVIEW_DECISION, SETTLEMENT_STATUS } from '@/lib/labels';
import { formatTHB, formatDate } from '@/lib/format';
import {
  applyReview,
  isReviewComplete,
  settlementDirectionLabel,
  summarizeSettlement,
} from '@/lib/logic/settlement';
import type { ReviewDecision, Settlement, SettlementItem, SettlementStatus } from '@/types';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

export function SettlementDrawer({
  settlement,
  onClose,
}: {
  settlement: Settlement | null;
  onClose: () => void;
}) {
  const {
    jobs,
    leaders,
    today,
    saving,
    currentUser,
    reviewSettlementItem,
    changeSettlementStatus,
    linkAppointmentToSettlement,
  } = useDemo();

  const [reviewItem, setReviewItem] = useState<SettlementItem | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>('full');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reviewError, setReviewError] = useState<string>();

  const [aptOpen, setAptOpen] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackNote, setSendBackNote] = useState('');
  const [sendBackError, setSendBackError] = useState<string>();

  const summary = useMemo(
    () => (settlement ? summarizeSettlement(settlement, today) : null),
    [settlement, today],
  );

  if (!settlement || !summary) return null;

  const job = jobs.find((j) => j.id === settlement.jobId);
  const leader = leaders.find((l) => l.id === settlement.leaderId);
  const canReview = can(currentUser.role, 'settlement.review');
  const reviewDone = isReviewComplete(settlement);

  const openReview = (item: SettlementItem) => {
    setReviewItem(item);
    setDecision(item.decision === 'pending' ? 'full' : item.decision);
    setApprovedAmount(String(item.approvedTHB || item.claimedTHB));
    setReason(item.reason);
    setReviewError(undefined);
  };

  const submitReview = async () => {
    if (!reviewItem) return;
    if (decision === 'pending') return;
    if (decision !== 'full' && !reason.trim()) {
      setReviewError('กรุณาระบุเหตุผลเมื่ออนุมัติบางส่วนหรือไม่อนุมัติ');
      return;
    }
    if (decision === 'partial') {
      const amount = Number(approvedAmount);
      if (Number.isNaN(amount) || amount <= 0 || amount >= reviewItem.claimedTHB) {
        setReviewError('ยอดอนุมัติบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดที่แจ้ง');
        return;
      }
    }
    const updated = applyReview(
      reviewItem,
      decision,
      Number(approvedAmount || 0),
      reason.trim(),
      currentUser.name,
      today,
    );
    await reviewSettlementItem(settlement.id, updated);
    setReviewItem(null);
  };

  const submitSendBack = async () => {
    if (!sendBackNote.trim()) {
      setSendBackError('กรุณาระบุเอกสารหรือรายการที่ต้องแก้ไข');
      return;
    }
    setSendBackOpen(false);
    await changeSettlementStatus(settlement.id, 'docs_incomplete', sendBackNote.trim());
    onClose();
  };

  const act = async (status: SettlementStatus, note?: string, ref?: string) => {
    await changeSettlementStatus(settlement.id, status, note, ref);
    onClose();
  };

  const netLabel = settlementDirectionLabel(summary);

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        ปิด
      </Button>

      {settlement.status === 'awaiting_docs' && (
        <Button
          variant="primary"
          onClick={() => act('under_review', 'ได้รับเอกสารจากหัวหน้าทัวร์แล้ว')}
          loading={saving}
        >
          รับเอกสารเข้าตรวจ
        </Button>
      )}

      {canReview && (settlement.status === 'under_review' || settlement.status === 'docs_incomplete') && (
        <>
          <Button variant="secondary" onClick={() => setSendBackOpen(true)} disabled={saving}>
            ส่งกลับให้แก้ไข
          </Button>
          <Button variant="secondary" icon="clock" onClick={() => setAptOpen(true)} disabled={saving}>
            นัดหมายเคลียร์เงิน
          </Button>
          <Button
            variant="primary"
            onClick={() => act('awaiting_settle_payment', 'ตรวจครบทุกรายการแล้ว')}
            disabled={saving || !reviewDone || settlement.items.length === 0}
            title={!reviewDone ? 'ต้องตรวจครบทุกรายการก่อน' : undefined}
          >
            สรุปผลการตรวจ
          </Button>
        </>
      )}

      {canReview && settlement.status === 'appointment_set' && (
        <Button
          variant="primary"
          onClick={() => act('awaiting_settle_payment', 'เข้าพบและตรวจเอกสารเรียบร้อย')}
          disabled={saving || !reviewDone}
        >
          สรุปผลการตรวจ
        </Button>
      )}

      {canReview && settlement.status === 'awaiting_settle_payment' && (
        <Button variant="success" icon="money" onClick={() => setConfirmSettle(true)} disabled={saving}>
          {summary.direction === 'leader_returns'
            ? 'ยืนยันได้รับเงินคืนแล้ว'
            : summary.direction === 'company_pays'
              ? 'ยืนยันจ่ายเงินเพิ่มแล้ว'
              : 'ยืนยันเคลียร์พอดี'}
        </Button>
      )}

      {can(currentUser.role, 'settlement.close') && settlement.status === 'settled' && (
        <Button variant="primary" onClick={() => setConfirmClose(true)} disabled={saving}>
          ปิดการเคลียร์เงินกรุ๊ป
        </Button>
      )}
    </>
  );

  return (
    <>
      <Drawer
        open={settlement !== null}
        onClose={onClose}
        title={`เคลียร์เงินกรุ๊ป ${settlement.id}`}
        description={`${leader ? `${leader.firstName} ${leader.lastName}` : settlement.leaderId} · ${settlement.jobId}`}
        footer={footer}
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={SETTLEMENT_STATUS[settlement.status]} />
            {summary.overdueDays > 0 && (
              <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', TONE_ZEGO_BADGE.red)}>
                <Icon name="warning" className="h-3.5 w-3.5" />
                เกินกำหนด {summary.overdueDays} วัน
              </span>
            )}
          </div>

          {/* ฝ่ายบัญชีเปิดหน้าการจัดสเก็ตไม่ได้ — แสดงข้อมูลงานเป็นกล่องธรรมดา ไม่ใช่ลิงก์ที่กดแล้วเจอหน้าไม่มีสิทธิ์ */}
          {job && (canViewPath(currentUser.role, `/jobs/${job.id}`) ? (
            <Link
              href={`/jobs/${job.id}`}
              className="zego-border-color zego-hover-surface block rounded-lg border px-3 py-2"
            >
              <p className="zego-text text-sm font-medium">{job.title}</p>
              <p className="zego-text-tertiary text-xs">
                {job.id} · กลับ {formatDate(job.returnDate)}
              </p>
            </Link>
          ) : (
            <div className="zego-border-color block rounded-lg border px-3 py-2">
              <p className="zego-text text-sm font-medium">{job.title}</p>
              <p className="zego-text-tertiary text-xs">
                {job.id} · กลับ {formatDate(job.returnDate)}
              </p>
            </div>
          ))}

          {/* สรุปยอด */}
          <div className="zego-border-color rounded-xl border p-4">
            <h3 className="zego-text mb-3 text-sm font-semibold">สรุปยอดเคลียร์เงินกรุ๊ป</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">เงินทดรองที่ได้รับ</dt>
                <dd className="zego-text font-semibold tabular-nums">
                  {formatTHB(summary.advanceTHB)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">ค่าใช้จ่ายที่หัวหน้าทัวร์แจ้ง</dt>
                <dd className="zego-text-secondary tabular-nums">{formatTHB(summary.claimedTHB)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">ค่าใช้จ่ายที่บัญชีอนุมัติ</dt>
                <dd className="zego-text font-semibold tabular-nums">
                  {formatTHB(summary.approvedTHB)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">ยอดที่ถูกตัด</dt>
                <dd className="zego-text-danger tabular-nums">−{formatTHB(summary.cutTHB)}</dd>
              </div>
            </dl>

            <div
              className={cx(
                'mt-3 rounded-lg border px-4 py-3',
                summary.direction === 'company_pays'
                  ? TONE_ZEGO_BADGE.green
                  : summary.direction === 'leader_returns'
                    ? TONE_ZEGO_BADGE.red
                    : TONE_ZEGO_BADGE.slate,
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cx(
                    'text-sm font-semibold',
                    summary.direction === 'company_pays'
                      ? 'zego-text-success'
                      : summary.direction === 'leader_returns'
                        ? 'zego-text-danger'
                        : 'zego-text-secondary',
                  )}
                >
                  ยอดสุทธิ
                </span>
                <span
                  className={cx(
                    'text-xl font-bold tabular-nums',
                    summary.direction === 'company_pays'
                      ? 'zego-text-success'
                      : summary.direction === 'leader_returns'
                        ? 'zego-text-danger'
                        : 'zego-text-secondary',
                  )}
                >
                  {formatTHB(Math.abs(summary.netTHB))}
                </span>
              </div>
              <p className="zego-text-secondary mt-1 text-xs">
                {netLabel} · สูตร: ค่าใช้จ่ายที่อนุมัติ ({formatTHB(summary.approvedTHB)}) − เงินทดรอง
                ({formatTHB(summary.advanceTHB)})
              </p>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Metric label="เอกสารไม่ครบ" value={summary.missingDocCount} tone="red" />
              <Metric label="อนุมัติบางส่วน" value={summary.partialCount} tone="amber" />
              <Metric label="ไม่อนุมัติ" value={summary.rejectedCount} tone="red" />
              <Metric label="ยังไม่ตรวจ" value={summary.pendingCount} tone="slate" />
            </dl>

            <p className="zego-text-tertiary mt-3 text-xs">
              กำหนดวันเคลียร์: {formatDate(settlement.dueDate)}
              {summary.overdueDays > 0 && (
                <span className="zego-text-danger ml-1 font-semibold">
                  (เกินกำหนด {summary.overdueDays} วัน)
                </span>
              )}
            </p>
          </div>

          {/* รายการค่าใช้จ่าย */}
          <div>
            <h3 className="zego-text mb-2 text-sm font-semibold">
              รายการค่าใช้จ่าย ({settlement.items.length})
            </h3>

            {settlement.items.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="ยังไม่ได้ส่งเอกสารค่าใช้จ่าย"
                description="หัวหน้าทัวร์ยังไม่ส่งรายการค่าใช้จ่ายเข้ามาในระบบ"
              />
            ) : (
              <ul className="space-y-2">
                {settlement.items.map((item) => (
                  <li
                    key={item.id}
                    className={cx(
                      'rounded-lg border p-3',
                      item.decision === 'rejected'
                        ? TONE_ZEGO_BADGE.red
                        : item.decision === 'partial'
                          ? TONE_ZEGO_BADGE.amber
                          : item.decision === 'full'
                            ? TONE_ZEGO_BADGE.green
                            : 'zego-border-color',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="zego-text text-sm font-medium">{item.expenseType}</p>
                        <p className="zego-text-secondary text-xs">{item.purpose}</p>
                      </div>
                      <StatusBadge meta={REVIEW_DECISION[item.decision]} size="sm" />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                      <span className="zego-text-tertiary">
                        แจ้ง:{' '}
                        <span className="zego-text-secondary font-semibold tabular-nums">
                          {formatTHB(item.claimedTHB)}
                        </span>
                      </span>
                      <span className="zego-text-tertiary">
                        อนุมัติ:{' '}
                        <span className="zego-text font-semibold tabular-nums">
                          {formatTHB(item.approvedTHB)}
                        </span>
                      </span>
                      <span
                        className={cx(
                          'inline-flex items-center gap-1',
                          item.hasReceipt ? 'zego-text-tertiary' : 'font-medium zego-text-danger',
                        )}
                      >
                        <Icon name={item.hasReceipt ? 'check' : 'warning'} className="h-3 w-3" />
                        {item.hasReceipt ? `ใบเสร็จ ${item.receiptNo}` : 'ไม่มีใบเสร็จ'}
                      </span>
                    </div>

                    {item.reason && (
                      <p className="zego-surface-bg zego-text-secondary mt-2 rounded px-2 py-1 text-xs">
                        เหตุผล: {item.reason}
                      </p>
                    )}

                    {canReview &&
                      settlement.status !== 'settled' &&
                      settlement.status !== 'closed' && (
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" variant="secondary" onClick={() => openReview(item)}>
                            {item.decision === 'pending' ? 'ตรวจรายการนี้' : 'แก้ไขผลการตรวจ'}
                          </Button>
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {settlement.appointmentId && (
            <Callout tone="sky" title="มีนัดหมายเคลียร์เงินแล้ว">
              รหัสนัดหมาย {settlement.appointmentId} — ดูรายละเอียดได้ที่หน้า “นัดหมาย”
            </Callout>
          )}

          {settlement.status === 'settled' && (
            <Callout tone="green" title="เคลียร์เรียบร้อยแล้ว">
              เคลียร์เมื่อ {formatDate(settlement.settledAt ?? '')}
              {settlement.paymentRef && (
                <>
                  {' '}
                  · อ้างอิง <span className="font-mono">{settlement.paymentRef}</span>
                </>
              )}
            </Callout>
          )}

          <div>
            <h3 className="zego-text mb-3 text-sm font-semibold">ประวัติการเคลียร์เงินกรุ๊ป</h3>
            <Timeline
              events={settlement.history}
              resolve={(key) =>
                SETTLEMENT_STATUS[key as SettlementStatus] ?? { label: key, tone: 'slate' }
              }
            />
          </div>
        </div>
      </Drawer>

      {/* ตรวจรายการทีละรายการ */}
      <Modal
        open={reviewItem !== null}
        onClose={() => setReviewItem(null)}
        size="sm"
        title="ตรวจค่าใช้จ่าย"
        description={reviewItem ? `${reviewItem.expenseType} · ${reviewItem.purpose}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewItem(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitReview} loading={saving}>
              บันทึกผลการตรวจ
            </Button>
          </>
        }
      >
        {reviewItem && (
          <div className="space-y-4">
            <div className="zego-surface-soft-bg rounded-lg px-3 py-2.5 text-sm">
              <div className="flex justify-between">
                <span className="zego-text-tertiary">ยอดที่แจ้ง</span>
                <span className="zego-text font-semibold tabular-nums">
                  {formatTHB(reviewItem.claimedTHB)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="zego-text-tertiary">เอกสาร</span>
                <span
                  className={cx(
                    'font-medium',
                    reviewItem.hasReceipt ? 'zego-text-secondary' : 'zego-text-danger',
                  )}
                >
                  {reviewItem.hasReceipt ? `ใบเสร็จ ${reviewItem.receiptNo}` : 'ไม่มีใบเสร็จ'}
                </span>
              </div>
            </div>

            <SelectInput
              label="ผลการตรวจ"
              required
              value={decision}
              onChange={(e) => {
                const value = e.target.value as ReviewDecision;
                setDecision(value);
                setReviewError(undefined);
                if (value === 'full') setApprovedAmount(String(reviewItem.claimedTHB));
                if (value === 'rejected') setApprovedAmount('0');
              }}
              options={[
                { value: 'full', label: 'อนุมัติเต็มจำนวน' },
                { value: 'partial', label: 'อนุมัติบางส่วน' },
                { value: 'rejected', label: 'ไม่อนุมัติ' },
              ]}
            />

            {decision === 'partial' && (
              <TextInput
                label="ยอดที่อนุมัติ (บาท)"
                required
                inputMode="numeric"
                value={approvedAmount}
                onChange={(e) => {
                  setApprovedAmount(e.target.value);
                  setReviewError(undefined);
                }}
                hint={`ต้องน้อยกว่ายอดที่แจ้ง (${formatTHB(reviewItem.claimedTHB)})`}
              />
            )}

            {decision !== 'full' && (
              <TextArea
                label="เหตุผล"
                required
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReviewError(undefined);
                }}
              />
            )}

            {reviewError && (
              <p className={cx('rounded-lg px-3 py-2 text-xs font-medium border', TONE_ZEGO_BADGE.red)}>
                {reviewError}
              </p>
            )}

            <div className={cx('rounded-lg px-3 py-2.5 border', TONE_ZEGO_BADGE.blue)}>
              <p className="zego-text-info text-xs">ยอดสุทธิใหม่หลังบันทึกรายการนี้</p>
              <p className="zego-text-info mt-0.5 text-lg font-bold tabular-nums">
                {(() => {
                  const others = settlement.items
                    .filter((i) => i.id !== reviewItem.id)
                    .reduce((sum, i) => sum + i.approvedTHB, 0);
                  const thisAmount =
                    decision === 'full'
                      ? reviewItem.claimedTHB
                      : decision === 'rejected'
                        ? 0
                        : Number(approvedAmount || 0);
                  const net = others + thisAmount - settlement.advanceTHB;
                  return net > 0
                    ? `บริษัทจ่ายเพิ่ม ${formatTHB(net)}`
                    : net < 0
                      ? `หัวหน้าทัวร์คืน ${formatTHB(Math.abs(net))}`
                      : 'เคลียร์พอดี';
                })()}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ส่งกลับให้แก้ไข */}
      <Modal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        size="sm"
        title="ส่งกลับให้แก้ไข"
        description={settlement.id}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSendBackOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitSendBack} loading={saving}>
              ส่งกลับ
            </Button>
          </>
        }
      >
        <TextArea
          label="ระบุเอกสาร / รายการที่ต้องแก้ไข"
          required
          rows={4}
          value={sendBackNote}
          error={sendBackError}
          onChange={(e) => {
            setSendBackNote(e.target.value);
            setSendBackError(undefined);
          }}
        />
      </Modal>

      {/* สร้างนัดหมายจากการเคลียร์เงินกรุ๊ป */}
      <AppointmentFormModal
        open={aptOpen}
        onClose={() => setAptOpen(false)}
        appointment={null}
        presetLeaderId={settlement.leaderId}
        presetJobId={settlement.jobId}
        onCreated={async (created) => {
          await linkAppointmentToSettlement(settlement.id, created.id);
        }}
      />

      <ConfirmDialog
        open={confirmSettle}
        onClose={() => setConfirmSettle(false)}
        onConfirm={async () => {
          setConfirmSettle(false);
          await act(
            'settled',
            summary.direction === 'leader_returns'
              ? `รับเงินคืน ${formatTHB(Math.abs(summary.netTHB))} เรียบร้อย (จำลอง)`
              : summary.direction === 'company_pays'
                ? `จ่ายเงินเพิ่ม ${formatTHB(summary.netTHB)} เรียบร้อย (จำลอง)`
                : 'เคลียร์พอดี ไม่มีการรับ/จ่ายเงิน',
            `PAY-DEMO-${Math.floor(Math.random() * 900000 + 100000)}`,
          );
        }}
        loading={saving}
        tone="success"
        title="ยืนยันการรับ/จ่ายเงิน"
        confirmLabel="ยืนยัน (จำลอง)"
        message={`${netLabel} เป็นจำนวน ${formatTHB(
          Math.abs(summary.netTHB),
        )} — ยืนยันว่าดำเนินการเรียบร้อยแล้ว? (ไม่มีการโอนเงินจริงใน Demo)`}
      />

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={async () => {
          setConfirmClose(false);
          await act('closed', 'ปิดการเคลียร์เงินกรุ๊ปและปิดงานทัวร์');
        }}
        loading={saving}
        tone="primary"
        title="ยืนยันการปิดการเคลียร์เงินกรุ๊ป"
        confirmLabel="ปิดการเคลียร์เงินกรุ๊ป"
        message={`ปิดการเคลียร์เงินกรุ๊ป ${settlement.id} และเปลี่ยนสถานะงาน ${settlement.jobId} เป็น “ปิดงาน” — การกระทำนี้จะบันทึกในประวัติ`}
      />
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'red' | 'amber' | 'slate';
}) {
  return (
    <div
      className={cx(
        'rounded-lg border px-2 py-1.5 text-center',
        value === 0 ? TONE_ZEGO_BADGE.slate : TONE_ZEGO_BADGE[tone],
      )}
    >
      <dt className="text-[10px]">{label}</dt>
      <dd className="text-sm font-bold tabular-nums">{value}</dd>
    </div>
  );
}
