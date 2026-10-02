'use client';

/**
 * เบิกเบี้ยเลี้ยง / ค่าทิป — /guide/settlement/allowance (พอร์ทัลหัวหน้าทัวร์)
 *
 * หลักการเคลียร์งานรายกรุ๊ป: แยกเอกสาร 3 ใบต่อกรุ๊ป (ดู src/lib/logic/leaderClaims.ts)
 *   ค่าใช้จ่าย (ใบเสร็จจากเมนูค่าใช้จ่าย) · ใบเบิกเบี้ยเลี้ยง · ใบเบิกค่าทิป
 * หน้านี้แสดงทั้ง 3 อย่างของแต่ละกรุ๊ป และทำ/แก้ใบเบิกเบี้ยเลี้ยงกับค่าทิป
 * - เบี้ยเลี้ยง = อัตราต่อวันตามประเทศ (perDiemRates) × จำนวนวันเดินทาง
 * - ค่าทิป = อัตราต่อลูกค้า (ตามประเทศ / เฉพาะโปรแกรม — ตั้งค่าระบบ → ค่าทิป) × จำนวนลูกค้า
 *   ไม่มีอัตราในระบบ → กรอกอัตราเอง บัญชีตรวจ · จำนวนลูกค้าตั้งต้นจากที่จองไว้ แก้ตามจริงได้ (ใส่หมายเหตุ)
 * ทำได้เมื่อจบทริปแล้ว (วันกลับ ≤ วันนี้) · แก้ได้เมื่อยังไม่อนุมัติ (ส่งอนุมัติ / ให้แก้ไข)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadTipRates } from '@/services/tipRateStore';
import { findPerDiemRate } from '@/data/perDiemRates';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import {
  activeLeaderClaim, EMPTY_TIP_RATES, LEADER_CLAIM_LABEL, tipRateFor, tripDays, type LeaderClaimKind, type TipRates,
} from '@/lib/logic/leaderClaims';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import type { ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { SettlementBackHeader } from '../SettlementBackHeader';

const EDITABLE = new Set(['submitted', 'revise']);

export default function GuideAllowancePage() {
  const { currentUser, leaders, expenses, saveExpense, createExpenseId } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);
  const today = toISODate(new Date());
  const [tipRates, setTipRates] = useState<TipRates>(EMPTY_TIP_RATES);
  const [open, setOpen] = useState<{ kind: LeaderClaimKind; period: TourPeriodMaster; existing: ExpenseRequest | null } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setTipRates(loadTipRates());
  }, []);

  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const myGroups = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => periodById.get(a.periodId))
    .filter((p): p is TourPeriodMaster => Boolean(p))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const save = async (kind: LeaderClaimKind, period: TourPeriodMaster, line: { purpose: string; amount: number; description: string; quantity: number; unitPrice: number }, note: string, existing: ExpenseRequest | null) => {
    const at = toISODateTime(new Date());
    const lines = [{
      id: 'L-1',
      expenseType: LEADER_CLAIM_LABEL[kind],
      purpose: line.purpose,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      currency: 'THB',
      fxRate: 1,
      amountTHB: line.amount,
      receiptNo: '',
      evidenceFileName: '',
      receiptDate: period.endDate ?? period.startDate,
    }];
    if (existing) {
      await saveExpense({
        ...existing, lines, totalTHB: line.amount, note, status: 'submitted', submittedAt: at,
        history: [...existing.history, makeStatusEvent(existing.status, 'submitted', currentUser.name, at, `แก้ไขใบเบิก${LEADER_CLAIM_LABEL[kind]}`)],
      });
    } else {
      const bank = leader?.bankAccounts.find((b) => b.isPrimary) ?? leader?.bankAccounts[0];
      await saveExpense({
        id: await createExpenseId(),
        jobId: period.internalId,
        category: 'leader_fee',
        claimKind: kind,
        requesterId: leaderId ?? '',
        requesterName: leader ? `${leader.firstName} ${leader.lastName}`.trim() : currentUser.name,
        requestedAt: at,
        submittedAt: at,
        lines,
        totalTHB: line.amount,
        bankAccount: bank
          ? { bank: bank.bank, accountNoMasked: bank.accountNoMasked, accountName: bank.accountName, branch: bank.branch ?? '' }
          : { bank: '', accountNoMasked: '', accountName: '', branch: '' },
        note,
        status: 'submitted',
        history: [makeStatusEvent(null, 'submitted', currentUser.name, at, `ใบเบิก${LEADER_CLAIM_LABEL[kind]} — บันทึกจากพอร์ทัลหัวหน้าทัวร์`)],
      });
    }
    setOpen(null);
  };

  return (
    <div className="space-y-4">
      <SettlementBackHeader
        title="เบิกเบี้ยเลี้ยง / ค่าทิป"
        description="เคลียร์งานรายกรุ๊ป แยกเอกสาร 3 ใบ: ค่าใช้จ่าย · เบี้ยเลี้ยง · ค่าทิป — ทำได้เมื่อจบทริปแล้ว"
      />

      {myGroups.length === 0 ? (
        <Card><EmptyState icon="briefcase" title="ยังไม่มีงานที่คอนเฟิร์มแล้ว" /></Card>
      ) : (
        myGroups.map((period) => {
          const finished = (period.endDate ?? period.startDate) <= today;
          const receipts = expenses.filter((e) => e.jobId === period.internalId && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled');
          return (
            <Card key={period.internalId} className="space-y-2.5">
              <div>
                <p className="text-sm font-semibold zego-text">{period.groupCode}</p>
                <p className="line-clamp-1 text-xs zego-text-secondary">{period.displayName}</p>
                <p className="text-xs zego-text-tertiary">{period.countryName} · {formatDateRange(period.startDate, period.endDate)}</p>
              </div>
              <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
                {/* 1) ค่าใช้จ่าย — ใบเสร็จที่บันทึกไว้แล้วจากเมนูค่าใช้จ่าย */}
                <li className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium zego-text">ค่าใช้จ่าย</span>
                    <span className="block text-xs zego-text-tertiary">
                      {receipts.length > 0 ? `บันทึกแล้ว ${receipts.length} ใบเสร็จ` : 'ยังไม่มีใบเสร็จ'}
                    </span>
                  </span>
                  <Link href="/guide/finance?tab=during" className="shrink-0 text-xs font-medium zego-text-info hover:underline">ไปที่ค่าใช้จ่าย →</Link>
                </li>
                {(['per_diem', 'tip'] as LeaderClaimKind[]).map((kind) => {
                  const existing = leaderId ? activeLeaderClaim(expenses, period.internalId, leaderId, kind) : null;
                  return (
                    <li key={kind} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium zego-text">{LEADER_CLAIM_LABEL[kind]}</span>
                        {existing ? (
                          <span className="flex flex-wrap items-center gap-1.5 text-xs zego-text-tertiary">
                            {existing.id} · {formatCurrency(existing.totalTHB, 'THB')}
                            <StatusBadge meta={EXPENSE_STATUS[existing.status]} size="sm" />
                          </span>
                        ) : (
                          <span className="block text-xs zego-text-tertiary">{finished ? 'ยังไม่ได้ทำใบเบิก' : `ทำได้เมื่อจบทริป (หลัง ${formatDate(period.endDate ?? period.startDate)})`}</span>
                        )}
                      </span>
                      {existing ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="edit"
                          disabled={!EDITABLE.has(existing.status)}
                          title={EDITABLE.has(existing.status) ? undefined : 'ใบเบิกที่อนุมัติ/ดำเนินการแล้ว แก้ไขไม่ได้'}
                          onClick={() => setOpen({ kind, period, existing })}
                        >
                          แก้ไข
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" icon="plus" disabled={!finished} onClick={() => setOpen({ kind, period, existing: null })}>
                          ทำใบเบิก
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}

      {open && (
        <ClaimModal
          key={`${open.kind}-${open.period.internalId}`}
          kind={open.kind}
          period={open.period}
          existing={open.existing}
          tipRates={tipRates}
          onClose={() => setOpen(null)}
          onSave={(line, note) => save(open.kind, open.period, line, note, open.existing)}
        />
      )}
    </div>
  );
}

/**
 * ทำ/แก้ใบเบิกเบี้ยเลี้ยงหรือค่าทิป — ยอด = จำนวน × อัตรา
 * เบี้ยเลี้ยง: จำนวน = วันเดินทาง (คงที่) · อัตราตามประเทศ (ไม่มี = กรอกเอง)
 * ค่าทิป: จำนวน = ลูกค้า (ตั้งต้นจากที่จอง แก้ได้) · อัตราตามโปรแกรม/ประเทศ (ไม่มี = กรอกเอง)
 */
function ClaimModal({
  kind,
  period,
  existing,
  tipRates,
  onClose,
  onSave,
}: {
  kind: LeaderClaimKind;
  period: TourPeriodMaster;
  existing: ExpenseRequest | null;
  tipRates: TipRates;
  onClose: () => void;
  onSave: (line: { purpose: string; amount: number; description: string; quantity: number; unitPrice: number }, note: string) => Promise<void>;
}) {
  const days = tripDays(period.startDate, period.endDate);
  const standard = kind === 'per_diem'
    ? (() => { const r = findPerDiemRate(period.countryName); return r ? { rate: r, label: `อัตราเบี้ยเลี้ยง ${period.countryName}` } : null; })()
    : (() => {
      const r = tipRateFor(period, tipRates);
      return r ? { rate: r.rate, label: r.source === 'program' ? 'อัตราเฉพาะโปรแกรมนี้' : `อัตราค่าทิป ${period.countryName}` } : null;
    })();
  const prev = existing?.lines[0];
  const [qty, setQty] = useState(String(kind === 'per_diem' ? days : prev?.quantity ?? period.seatBooked ?? ''));
  const [rate, setRate] = useState(String(standard?.rate ?? prev?.unitPrice ?? ''));
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);

  const q = Number(qty);
  const r = Number(rate);
  const amount = q > 0 && r > 0 ? q * r : 0;
  const booked = period.seatBooked ?? null;
  const qtyChanged = kind === 'tip' && booked !== null && q !== booked;
  const ok = amount > 0 && (!qtyChanged || note.trim().length > 0);
  const unit = kind === 'per_diem' ? 'วัน' : 'คน';

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${existing ? 'แก้ไขใบเบิก' : 'ใบเบิก'}${LEADER_CLAIM_LABEL[kind]}`}
      description={`${period.groupCode} · ${formatDateRange(period.startDate, period.endDate)}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!ok}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  purpose: kind === 'per_diem'
                    ? `เบี้ยเลี้ยง ${period.groupCode} · ${q} วัน × ${formatCurrency(r, 'THB')}`
                    : `ค่าทิป ${period.groupCode} · ${q} คน × ${formatCurrency(r, 'THB')}`,
                  description: standard && standard.rate === r ? standard.label : 'อัตรากรอกเอง (ไม่มี/ต่างจากอัตรามาตรฐาน)',
                  quantity: q,
                  unitPrice: r,
                  amount,
                }, note.trim());
              } finally {
                setSaving(false);
              }
            }}
          >
            {existing ? 'บันทึกและส่งใหม่' : 'ส่งเบิก'} {amount > 0 ? formatCurrency(amount, 'THB') : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            label={kind === 'per_diem' ? 'จำนวนวันเดินทาง' : 'จำนวนลูกค้า'}
            type="number"
            inputMode="numeric"
            min={1}
            value={qty}
            disabled={kind === 'per_diem'}
            onChange={(e) => setQty(e.target.value)}
            hint={kind === 'per_diem' ? 'นับจากวันเดินทาง' : booked !== null ? `จองไว้ ${booked} คน` : undefined}
          />
          <TextInput
            label={`อัตรา (บาท / ${unit})`}
            type="number"
            inputMode="decimal"
            min={1}
            value={rate}
            disabled={Boolean(standard)}
            onChange={(e) => setRate(e.target.value)}
            hint={standard ? standard.label : 'ไม่มีอัตราในระบบ — กรอกเอง บัญชีตรวจ'}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg zego-surface-soft-bg px-3 py-2.5">
          <span className="text-sm zego-text-secondary">{q > 0 ? q : '–'} {unit} × {r > 0 ? formatCurrency(r, 'THB') : '–'}</span>
          <span className="text-base font-semibold tabular-nums zego-text">{formatCurrency(amount, 'THB')}</span>
        </div>
        {!standard && (
          <p className="flex items-start gap-1.5 text-xs zego-text-warning">
            <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ยังไม่มีอัตรา{LEADER_CLAIM_LABEL[kind]}ของ{kind === 'tip' ? 'ประเทศ/โปรแกรม' : 'ประเทศ'}นี้ในระบบ — แจ้งผู้ดูแลระบบให้ตั้งค่า
          </p>
        )}
        <TextArea
          label="หมายเหตุ"
          optional={!qtyChanged}
          required={qtyChanged}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={qtyChanged ? 'จำนวนลูกค้าต่างจากที่จอง — ระบุเหตุผล เช่น ยกเลิก 2 ท่านก่อนเดินทาง' : undefined}
        />
      </div>
    </Modal>
  );
}
