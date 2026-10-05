'use client';

/**
 * เบิกเบี้ยเลี้ยง — /guide/settlement/allowance (พอร์ทัลหัวหน้าทัวร์) · หน้านี้ทำได้เฉพาะใบเบิกเบี้ยเลี้ยง (ค่าทิปยังไม่เปิดใช้)
 *
 * หลักการเคลียร์งานรายกรุ๊ป: แยกเอกสาร 3 ใบต่อกรุ๊ป (ดู src/lib/logic/leaderClaims.ts)
 *   ค่าใช้จ่าย (ใบเสร็จจากเมนูค่าใช้จ่าย) · ใบเบิกเบี้ยเลี้ยง · ใบเบิกค่าทิป
 * หน้านี้แสดงทั้ง 3 อย่างของแต่ละกรุ๊ป และทำ/แก้ใบเบิกเบี้ยเลี้ยงกับค่าทิป
 * - เบี้ยเลี้ยง = "เอกสารค่าใช้จ่ายหัวหน้าทัวร์" ตามแบบฟอร์มบริษัท (LeaderExpenseFormModal) — 6 หมวด
 *   ข้อ 1 ค่าเบี้ยเลี้ยง = อัตราของโปรแกรม (ฝ่ายจัดหัวหน้าทัวร์ตั้งที่เมนูอัตราเบี้ยเลี้ยง) × จำนวนวันเดินทาง · พิมพ์ฟอร์มได้
 * - ค่าทิป = อัตราต่อลูกค้า (ตามประเทศ / เฉพาะโปรแกรม — ตั้งค่าระบบ → ค่าทิป) × จำนวนลูกค้า
 *   ไม่มีอัตราในระบบ → กรอกอัตราเอง บัญชีตรวจ · จำนวนลูกค้าตั้งต้นจากที่จองไว้ แก้ตามจริงได้ (ใส่หมายเหตุ)
 * ทำได้เมื่อจบทริปแล้ว (วันกลับ ≤ วันนี้) · แก้ได้เมื่อยังไม่อนุมัติ (ส่งอนุมัติ / ให้แก้ไข)
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadTipRates } from '@/services/tipRateStore';
import { loadPerDiemRates } from '@/services/perDiemRateStore';
import { printLeaderExpenseForm } from '@/lib/printLeaderExpenseForm';
import { LeaderExpenseFormModal, type LeaderClaimForm } from './LeaderExpenseFormModal';
import { groupAmountsByCurrency } from '../../expenses/expenseAmounts';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { findPerDiemRate } from '@/data/perDiemRates';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import {
  activeLeaderClaim, EMPTY_TIP_RATES, parsePaxText, LEADER_CLAIM_LABEL, perDiemRateFor, tipRateFor, tripDays, type LeaderClaimKind, EMPTY_PER_DIEM_RATES, type PerDiemRates, type TipRates,
} from '@/lib/logic/leaderClaims';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { SettlementBackHeader } from '../SettlementBackHeader';

const EDITABLE = new Set(['draft', 'submitted', 'revise']);

export default function GuideAllowancePage() {
  const { currentUser, leaders, expenses, saveExpense, createExpenseId } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);
  const today = toISODate(new Date());
  const [tipRates, setTipRates] = useState<TipRates>(EMPTY_TIP_RATES);
  const [perDiemRates, setPerDiemRates] = useState<PerDiemRates>(EMPTY_PER_DIEM_RATES);
  const [open, setOpen] = useState<{ kind: LeaderClaimKind; period: TourPeriodMaster; existing: ExpenseRequest | null } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setTipRates(loadTipRates());
    setPerDiemRates(loadPerDiemRates());
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

  /*
    เอกสารค่าใช้จ่ายหัวหน้าทัวร์ (เบี้ยเลี้ยง) — หลายรายการ + หัวเอกสาร
    submit = false → บันทึกร่างไว้ก่อน (ทำได้ตั้งแต่ก่อนเดินทาง) · ใบที่ถูกส่งกลับแก้ไขคงสถานะ "ให้แก้ไข"
    submit = true  → ส่งอนุมัติ (ได้เมื่อจบทริปแล้ว — กั้นที่ปุ่มในฟอร์ม)
  */
  const saveForm = async (period: TourPeriodMaster, lines: ExpenseLine[], form: LeaderClaimForm, note: string, existing: ExpenseRequest | null, submit: boolean) => {
    const at = toISODateTime(new Date());
    const totalTHB = lines.reduce((n, l) => n + l.amountTHB, 0);
    const status = submit ? 'submitted' : existing?.status === 'revise' ? 'revise' : 'draft';
    const what = submit ? 'ส่งอนุมัติเอกสารค่าใช้จ่ายหัวหน้าทัวร์' : 'บันทึกร่างเอกสารค่าใช้จ่ายหัวหน้าทัวร์';
    if (existing) {
      await saveExpense({
        ...existing, lines, totalTHB, claimForm: form, note, status, ...(submit ? { submittedAt: at } : {}),
        history: [...existing.history, makeStatusEvent(existing.status, status, currentUser.name, at, what)],
      });
    } else {
      const bank = leader?.bankAccounts.find((b) => b.isPrimary) ?? leader?.bankAccounts[0];
      await saveExpense({
        id: await createExpenseId(),
        jobId: period.internalId,
        category: 'leader_fee',
        claimKind: 'per_diem',
        claimForm: form,
        requesterId: leaderId ?? '',
        requesterName: leader ? `${leader.firstName} ${leader.lastName}`.trim() : currentUser.name,
        requestedAt: at,
        ...(submit ? { submittedAt: at } : {}),
        lines,
        totalTHB,
        bankAccount: bank
          ? { bank: bank.bank, accountNoMasked: bank.accountNoMasked, accountName: bank.accountName, branch: bank.branch ?? '' }
          : { bank: '', accountNoMasked: '', accountName: '', branch: '' },
        note,
        status,
        history: [makeStatusEvent(null, status, currentUser.name, at, `${what} — จากพอร์ทัลหัวหน้าทัวร์`)],
      });
    }
    setOpen(null);
  };
  /** จำนวนลูกค้าตามเอกสารเบิกที่นำเข้าของกรุ๊ป (หัวเอกสาร เช่น "34 ท่าน + 1 TL") — ไม่มี = null */
  const paxFromAdvanceDoc = (periodId: string) => {
    const doc = expenses.find((e) => isGroupAdvanceDoc(e) && e.jobId === periodId && e.sourceDoc?.pax && e.status !== 'cancelled');
    const parsed = parsePaxText(doc?.sourceDoc?.pax);
    return doc && parsed ? { ...parsed, label: `เอกสารเบิก ${doc.id}: ${doc.sourceDoc!.pax}` } : null;
  };
  const leaderPhone = leader?.contacts.find((c) => c.type === 'phone' && c.isPrimary)?.value ?? leader?.contacts.find((c) => c.type === 'phone')?.value ?? '';

  return (
    <div className="space-y-4">
      <SettlementBackHeader
        title="เบิกเบี้ยเลี้ยง"
        description="ทำเอกสารค่าใช้จ่ายหัวหน้าทัวร์ (เบี้ยเลี้ยง) แยกต่อกรุ๊ป — ทำร่างรอไว้ได้ตลอด ส่งอนุมัติได้เมื่อจบทริปแล้ว"
      />

      {myGroups.length === 0 ? (
        <Card><EmptyState icon="briefcase" title="ยังไม่มีงานที่คอนเฟิร์มแล้ว" /></Card>
      ) : (
        myGroups.map((period) => {
          const finished = (period.endDate ?? period.startDate) <= today;
          return (
            <Card key={period.internalId} className="space-y-2.5">
              <div>
                <p className="text-sm font-semibold zego-text">{period.groupCode}</p>
                <p className="line-clamp-1 text-xs zego-text-secondary">{period.displayName}</p>
                <p className="text-xs zego-text-tertiary">{period.countryName} · {formatDateRange(period.startDate, period.endDate)}</p>
              </div>
              <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
                {/* หน้านี้ทำได้เฉพาะเบี้ยเลี้ยง — ค่าใช้จ่าย (ใบเสร็จ) อยู่เมนูค่าใช้จ่าย · ค่าทิปยังไม่เปิดใช้ */}
                {(['per_diem'] as LeaderClaimKind[]).map((kind) => {
                  const existing = leaderId ? activeLeaderClaim(expenses, period.internalId, leaderId, kind) : null;
                  return (
                    <li key={kind} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium zego-text">{LEADER_CLAIM_LABEL[kind]}</span>
                        {existing ? (
                          <span className="flex flex-wrap items-center gap-1.5 text-xs zego-text-tertiary">
                            {existing.id} · {groupAmountsByCurrency(existing.lines.map((l) => ({ amount: l.amount, currency: l.currency }))).map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}
                            <StatusBadge meta={EXPENSE_STATUS[existing.status]} size="sm" />
                            {existing.status === 'draft' && (
                              <span className="w-full">{finished ? 'พร้อมส่งอนุมัติแล้ว — กดแก้ไข แล้วส่งอนุมัติ' : `ส่งอนุมัติได้ตั้งแต่ ${formatDate(period.endDate ?? period.startDate)}`}</span>
                            )}
                          </span>
                        ) : (
                          <span className="block text-xs zego-text-tertiary">{finished ? 'ยังไม่ได้ทำใบเบิก' : `ทำร่างรอไว้ได้ · ส่งอนุมัติได้ตั้งแต่ ${formatDate(period.endDate ?? period.startDate)}`}</span>
                        )}
                      </span>
                      {existing && kind === 'per_diem' && (
                        <Button variant="ghost" size="sm" icon="download" onClick={() => printLeaderExpenseForm(existing, period, leaderPhone)}>
                          พิมพ์
                        </Button>
                      )}
                      {existing ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon="edit"
                          disabled={!EDITABLE.has(existing.status)}
                          title={EDITABLE.has(existing.status) ? undefined : 'ใบเบิกที่อนุมัติ/ดำเนินการแล้ว แก้ไขไม่ได้'}
                          onClick={() => setOpen({ kind, period, existing })}
                        >
                          {existing.status === 'draft' && finished ? 'แก้ไข / ส่งอนุมัติ' : 'แก้ไข'}
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen({ kind, period, existing: null })}>
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

      {open && open.kind === 'per_diem' && (
        <LeaderExpenseFormModal
          key={`per_diem-${open.period.internalId}`}
          period={open.period}
          existing={open.existing}
          programRate={perDiemRateFor(open.period, perDiemRates)}
          paxSource={paxFromAdvanceDoc(open.period.internalId)}
          defaultPhone={leaderPhone}
          canSubmit={(open.period.endDate ?? open.period.startDate) <= today}
          onClose={() => setOpen(null)}
          onSave={(lines, form, note, submit) => saveForm(open.period, lines, form, note, open.existing, submit)}
        />
      )}
      {open && open.kind === 'tip' && (
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
