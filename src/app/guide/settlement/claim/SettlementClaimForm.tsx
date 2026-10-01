'use client';

/**
 * แบบฟอร์มเคลียร์ค่าใช้จ่ายรายกรุ๊ป — /guide/settlement/claim (ขั้นที่ 2)
 *
 * บันทึกลง Settlement (สร้างใหม่อัตโนมัติถ้ายังไม่มีสำหรับกรุ๊ป+หัวหน้าทัวร์นี้) ผ่าน submitSettlementClaim
 * "บันทึกแบบร่าง" = เก็บ items ไว้ สถานะคงเดิม (หรือ awaiting_docs ถ้าเพิ่งสร้าง) — แก้ต่อได้ภายหลัง
 * "ส่งอนุมัติ" = เก็บ items + เปลี่ยนสถานะเป็น under_review ให้บัญชีเห็นและเริ่มตรวจได้ทันที
 *
 * รายการ "ค่าเบี้ยเลี้ยง" คำนวณยอดเริ่มต้นให้อัตโนมัติจากตารางอัตราเบิกตามประเทศ (perDiemRates.ts) คูณ
 * จำนวนวันเดินทาง — ยังแก้ไขยอดเองได้เสมอก่อนบันทึก (ค่าเริ่มต้นให้ตรวจทาน ไม่ใช่ค่าบังคับ)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatDateRange, formatDate } from '@/lib/format';
import { findPerDiemRate, PER_DIEM_RATES } from '@/data/perDiemRates';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { scanReceipt } from '@/services/receiptScan';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { baseControl, TextInput } from '@/components/ui/FormField';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { groupAmountsByCurrency, formatMultiCurrency } from '../../expenses/expenseAmounts';
import type { BudgetLine, SettlementItem } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

/*
  รายการค่าใช้จ่ายทั้งหมดมาจากที่ตั้งไว้ล่วงหน้าเท่านั้น — ไม่มีปุ่มเพิ่มหมวดอิสระอีกต่อไป (ตัดออกตามที่ตกลง):
    • "รายการตามงบประมาณ" — จากไฟล์ทำเบิกของโอพี (groupBudgets)
    • "ค่าแลนด์" — จากเงินที่เจ้าหน้าที่ส่งกรุ๊ปถือมาให้และยืนยันรับแล้ว (custodyBatches)
    • "ค่าเบี้ยเลี้ยง" — อัตราคงที่ตามตารางบริษัท (perDiemRates.ts) ไม่เกี่ยวกับไฟล์ทำเบิกของโอพี จึงยังเป็นรายการเดี่ยวแยกต่างหาก
*/
const PER_DIEM_CATEGORY = 'ค่าเบี้ยเลี้ยง';
const LAND_COST_CATEGORY = 'ค่าแลนด์';

interface DraftClaimLine {
  id: string;
  category: string;
  description: string;
  formula: string;
  amount: string;
  currency: string;
  note: string;
  evidenceFileName: string;
  custodyAllocationId?: string;
  budgetLineId?: string;
  scannedFromReceipt?: boolean;
}

const newLineId = () => `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** เลข x ที่ปิดบังในข้อมูลจำลอง → เลขที่ดูสมบูรณ์แบบ deterministic (ไม่ใช่เลขบัญชีจริง — Demo ล้วน)
 *  ใช้เฉพาะจุดนี้ที่ผู้ใช้ยืนยันแล้วว่าต้องการให้แสดงเต็มรูปแบบตามตัวอย่าง ไม่กระทบจุดอื่นที่ยังปิดบังตามปกติ */
function demoFullAccountNumber(masked: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  let out = '';
  for (const ch of masked) {
    if (ch === 'x' || ch === 'X') {
      out += String(hash % 10);
      hash = Math.floor(hash / 7) + 3;
    } else {
      out += ch;
    }
  }
  return out;
}

function itemsToDraftLines(items: SettlementItem[]): DraftClaimLine[] {
  return items.map((it) => ({
    id: it.id,
    category: it.expenseType,
    description: it.purpose,
    formula: it.formula ?? '',
    amount: String(it.amount ?? it.claimedTHB ?? ''),
    currency: it.currency ?? 'THB',
    note: it.note ?? '',
    evidenceFileName: it.evidenceFileName ?? '',
    custodyAllocationId: it.custodyAllocationId,
    budgetLineId: it.budgetLineId,
    scannedFromReceipt: it.scannedFromReceipt,
  }));
}

export function SettlementClaimForm({
  period,
  onCancel,
  onSaved,
}: {
  period: TourPeriodMaster;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const {
    currentUser, leaders, master, settlements, custodyBatches, acknowledgeCustodyAllocation,
    groupBudgets, submitSettlementClaim, pushToast, saving,
  } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);
  const bank = leader?.bankAccounts.find((b) => b.isPrimary) ?? leader?.bankAccounts[0];
  const phone = leader?.contacts.find((c) => c.type === 'phone' && c.value)?.value;
  const sendOffStaff = useMemo(() => loadSendOffStaff(), []);

  const existing = settlements.find((s) => s.jobId === period.internalId && s.leaderId === leaderId);

  const [customerCount, setCustomerCount] = useState(String(existing?.customerCount ?? period.seatBooked ?? ''));
  const [companionCount, setCompanionCount] = useState(String(existing?.companionCount ?? 0));
  const [cancelledNote, setCancelledNote] = useState(existing?.cancelledCustomerNote ?? '');
  const [lines, setLines] = useState<DraftClaimLine[]>(
    existing && existing.items.length > 0 ? itemsToDraftLines(existing.items) : [],
  );
  const [action, setAction] = useState<'draft' | 'submit' | null>(null);
  const [ackTarget, setAckTarget] = useState<{ batchId: string; allocationId: string } | null>(null);
  const [acking, setAcking] = useState(false);
  const [scanningLineId, setScanningLineId] = useState<string | null>(null);

  /* งบประมาณที่ตั้งไว้ล่วงหน้าสำหรับกรุ๊ปนี้ (ถ้ามี) — จัดกลุ่มตามหมวดเพื่อแสดงตามใบทำเบิกต้นทาง */
  const budget = groupBudgets.find((b) => b.periodId === period.internalId);
  const budgetCategories = useMemo(() => {
    if (!budget) return [] as [string, BudgetLine[]][];
    const map = new Map<string, BudgetLine[]>();
    for (const bl of budget.lines) {
      if (!map.has(bl.category)) map.set(bl.category, []);
      map.get(bl.category)!.push(bl);
    }
    return [...map.entries()];
  }, [budget]);
  /* ทุกบรรทัดพร้อมตำแหน่งจริงใน lines[] — ใช้เรียก updateLine/removeLine/pickFile ให้ตรงตัวแม้จะกรองแสดงแยกกลุ่ม */
  const indexedLines = lines.map((line, i) => ({ line, i }));
  const custodyLines = indexedLines.filter(({ line }) => Boolean(line.custodyAllocationId));
  const perDiemLines = indexedLines.filter(({ line }) => !line.budgetLineId && !line.custodyAllocationId);

  /* เงินค่าแลนด์ที่การเงินเผื่อไว้ให้กรุ๊ป+หัวหน้าทัวร์คนนี้โดยเฉพาะ — อาจมาจากก้อนเดียวกับที่เผื่อกรุ๊ปอื่นด้วย */
  const myAllocations = useMemo(
    () =>
      custodyBatches.flatMap((batch) =>
        batch.allocations
          .filter((a) => a.periodId === period.internalId && a.leaderId === leaderId)
          .map((a) => ({ ...a, batchId: batch.id, currency: batch.currency, staffId: batch.staffId })),
      ),
    [custodyBatches, period.internalId, leaderId],
  );
  const pendingAck = myAllocations.filter((a) => !a.acknowledgedAt);
  const readyToAdd = myAllocations.filter((a) => a.acknowledgedAt && !lines.some((l) => l.custodyAllocationId === a.id));

  const fxRateFor = (code: string) => Number(master.currencies.find((c) => c.code === code)?.extra ?? '1') || 1;

  const validLines = lines
    .map((l) => ({ ...l, amountNum: Number(l.amount) || 0 }))
    .filter((l) => l.description.trim() && l.amountNum !== 0);
  const perDiemValidLines = validLines.filter((l) => !l.budgetLineId && !l.custodyAllocationId);
  const perDiemTotals = groupAmountsByCurrency(perDiemValidLines.map((l) => ({ amount: l.amountNum, currency: l.currency })));
  const budgetUsedTotals = groupAmountsByCurrency(
    validLines.filter((l) => l.budgetLineId).map((l) => ({ amount: l.amountNum, currency: l.currency })),
  );
  const budgetTotals = budget
    ? groupAmountsByCurrency(budget.lines.map((bl) => ({ amount: bl.budgetedAmount, currency: bl.currency })))
    : [];

  const updateLine = (index: number, patch: Partial<DraftClaimLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  /** เพิ่มรายการค่าเบี้ยเลี้ยง — เติมยอด/สูตรคำนวณให้อัตโนมัติจากตารางอัตราเบิก × จำนวนวัน แก้ไขยอดเองได้ก่อนบันทึก */
  const addLine = (category: string) => {
    const rate = findPerDiemRate(period.countryName);
    const days = period.durationDays;
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        category,
        description: 'เบี้ยเลี้ยงหัวหน้าทัวร์',
        formula: rate ? `${rate.toLocaleString('th-TH')} × ${days}` : '',
        amount: rate ? String(rate * days) : '',
        currency: 'THB',
        note: '',
        evidenceFileName: '',
      },
    ]);
  };

  /** แปลงเงินค่าแลนด์ที่ยืนยันรับแล้วให้เป็นรายการค่าใช้จ่าย — ยอดเริ่มต้น = ยอดที่รับมา แก้ไขได้ถ้าใช้จริงไม่เท่ากัน */
  const addLandCostLine = (allocation: (typeof readyToAdd)[number]) => {
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        category: LAND_COST_CATEGORY,
        description: 'ค่าแลนด์ที่จ่ายให้แลนด์โอเปอเรเตอร์',
        formula: '',
        amount: String(allocation.amount),
        currency: allocation.currency,
        note: '',
        evidenceFileName: '',
        custodyAllocationId: allocation.id,
      },
    ]);
  };

  const confirmAck = async () => {
    if (!ackTarget) return;
    setAcking(true);
    try {
      await acknowledgeCustodyAllocation(ackTarget.batchId, ackTarget.allocationId);
      setAckTarget(null);
    } finally {
      setAcking(false);
    }
  };

  /** เพิ่มยอดใช้จริง 1 ครั้งแบบกรอกเอง — ผูกกับ budgetLineId เสมอ เพื่อให้นับรวม/หักคงเหลือของรายการงบนั้นถูกต้อง */
  const addManualOccurrence = (bl: BudgetLine) => {
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        category: bl.category,
        description: bl.name,
        formula: '',
        amount: '',
        currency: bl.currency,
        note: '',
        evidenceFileName: '',
        budgetLineId: bl.id,
      },
    ]);
  };

  /** เพิ่มยอดใช้จริง 1 ครั้งจากการสแกนใบเสร็จ — ใช้ AI ตัวเดียวกับที่บันทึกใบเสร็จทั่วไป ดึงยอด/ผู้ขาย/วันที่มาเติมให้ */
  const scanOccurrence = async (bl: BudgetLine, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanningLineId(bl.id);
    try {
      const result = await scanReceipt(file);
      const currency = master.currencies.some((c) => c.active && c.code === result.currency) ? result.currency : bl.currency;
      setLines((prev) => [
        ...prev,
        {
          id: newLineId(),
          category: bl.category,
          description: result.merchantNameTh || bl.name,
          formula: '',
          amount: result.totalAmount > 0 ? String(result.totalAmount) : '',
          currency,
          note: '',
          evidenceFileName: file.name,
          budgetLineId: bl.id,
          scannedFromReceipt: true,
        },
      ]);
      if (result.confidence === 'low') {
        pushToast('warning', 'สแกนได้แต่ความมั่นใจต่ำ', 'ตรวจสอบยอดเงินอีกครั้งก่อนบันทึก');
      }
    } catch (err) {
      pushToast('error', 'สแกนใบเสร็จไม่สำเร็จ', err instanceof Error ? err.message : undefined);
    } finally {
      setScanningLineId(null);
    }
  };

  const pickFile = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    updateLine(index, { evidenceFileName: file.name });
  };

  const canSubmit = leaderId && validLines.length > 0;

  const save = async (submitForApproval: boolean) => {
    if (!leaderId || validLines.length === 0) return;
    setAction(submitForApproval ? 'submit' : 'draft');
    try {
      const expenseTypeName = (t: string) => t;
      const items: SettlementItem[] = validLines.map((l, i) => {
        const fxRate = fxRateFor(l.currency);
        const existingItem = existing?.items.find((it) => it.id === l.id);
        return {
          id: l.id.startsWith('L-') ? `STI-${Date.now()}-${i}` : l.id,
          expenseType: expenseTypeName(l.category),
          purpose: l.description.trim(),
          claimedTHB: Math.round(l.amountNum * fxRate),
          approvedTHB: existingItem?.approvedTHB ?? 0,
          decision: existingItem?.decision ?? 'pending',
          reason: existingItem?.reason ?? '',
          receiptNo: existingItem?.receiptNo ?? '—',
          hasReceipt: Boolean(l.evidenceFileName),
          reviewedBy: existingItem?.reviewedBy,
          reviewedAt: existingItem?.reviewedAt,
          amount: l.amountNum,
          currency: l.currency,
          fxRate,
          formula: l.formula || undefined,
          note: l.note.trim() || undefined,
          evidenceFileName: l.evidenceFileName || undefined,
          custodyAllocationId: l.custodyAllocationId,
          budgetLineId: l.budgetLineId,
          scannedFromReceipt: l.scannedFromReceipt,
        };
      });

      await submitSettlementClaim({
        periodId: period.internalId,
        periodEndDate: period.endDate,
        leaderId,
        items,
        customerCount: Number(customerCount) || undefined,
        companionCount: Number(companionCount) || undefined,
        cancelledCustomerNote: cancelledNote.trim() || undefined,
        submitForApproval,
      });
      onSaved();
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-sm font-medium zego-text-success">
          <Icon name="chevronLeft" className="h-4 w-4" />
          เคลียร์เงิน
        </button>
      </div>
      <div>
        <h1 className="text-lg font-bold zego-text">บันทึกค่าใช้จ่ายหัวหน้าทัวร์</h1>
        <p className="text-sm zego-text-tertiary">กรอกข้อมูลให้สอดคล้องกับเอกสารเบิกค่าใช้จ่าย</p>
      </div>

      {/* ข้อมูลเอกสาร */}
      <Card className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold zego-text">
          <Icon name="file" className="h-4 w-4 zego-text-success" />
          ข้อมูลเอกสาร
        </p>
        <dl className="divide-y divide-[var(--zego-border-soft)] text-sm">
          <Row label="จ่ายเงินให้" value={leader ? `${leader.title}${leader.firstName} ${leader.lastName}` : currentUser.name} />
          <Row label="Code กรุ๊ป" value={period.groupCode} />
          <Row label="โปรแกรมทัวร์" value={period.programCode ?? '—'} />
          <Row label="โปรแกรม" value={period.displayName} />
          <Row
            label="ช่วงเดินทาง"
            value={
              <span className="flex items-center gap-1.5">
                <Icon name="calendar" className="h-4 w-4 zego-text-tertiary" />
                {formatDateRange(period.startDate, period.endDate)}
              </span>
            }
          />
        </dl>
        <div className="grid grid-cols-2 gap-3 zego-divider-top pt-3">
          <TextInput
            label="จำนวนลูกค้า"
            type="number"
            inputMode="numeric"
            value={customerCount}
            onChange={(e) => setCustomerCount(e.target.value)}
          />
          <TextInput
            label="ผู้ติดตาม"
            type="number"
            inputMode="numeric"
            value={companionCount}
            onChange={(e) => setCompanionCount(e.target.value)}
          />
        </div>
        <TextInput
          label="ลูกค้ายกเลิกเดินทาง"
          optional
          value={cancelledNote}
          onChange={(e) => setCancelledNote(e.target.value)}
          placeholder="ระบุ (ถ้ามี)"
        />
      </Card>

      {/* เงินค่าแลนด์ที่ได้รับจากเจ้าหน้าที่ส่งกรุ๊ป */}
      {myAllocations.length > 0 && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold zego-text">
            <Icon name="money" className="h-4 w-4 zego-text-success" />
            เงินค่าแลนด์ที่ได้รับ
          </p>

          {pendingAck.length > 0 && (
            <div className="space-y-2">
              {pendingAck.map((a) => {
                const staff = sendOffStaff.find((s) => s.id === a.staffId);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold zego-text-warning">
                        {a.amount.toLocaleString('th-TH')} {a.currency}
                      </p>
                      <p className="text-xs zego-text-warning">
                        จากเจ้าหน้าที่ส่งกรุ๊ป {staff?.nickname ?? a.staffId}
                      </p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setAckTarget({ batchId: a.batchId, allocationId: a.id })}>
                      ยืนยันรับเงินแล้ว
                    </Button>
                  </div>
                );
              })}
              <p className="text-xs zego-text-tertiary">ต้องยืนยันรับเงินก่อน จึงจะเพิ่มเป็นรายการค่าแลนด์ในฟอร์มนี้ได้</p>
            </div>
          )}

          {readyToAdd.length > 0 && (
            <div className="space-y-2">
              {readyToAdd.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium zego-text">
                      รับแล้ว {a.amount.toLocaleString('th-TH')} {a.currency}
                    </p>
                    <p className="text-xs zego-text-tertiary">ยืนยันรับเมื่อ {formatDate(a.acknowledgedAt!)}</p>
                  </div>
                  <Button variant="success" size="sm" icon="plus" onClick={() => addLandCostLine(a)}>
                    เพิ่มเป็นรายการค่าแลนด์
                  </Button>
                </div>
              ))}
            </div>
          )}

          {custodyLines.map(({ line, i }) => (
            <ExpenseLineCard
              key={line.id}
              line={line}
              badge={<span className="shrink-0 rounded-full zego-badge--slate px-2 py-0.5 text-[11px] font-medium">{LAND_COST_CATEGORY}</span>}
              currencies={master.currencies}
              onUpdate={(patch) => updateLine(i, patch)}
              onRemove={() => removeLine(i)}
              onPickFile={(e) => pickFile(i, e)}
            />
          ))}
        </Card>
      )}

      {/* รายการตามงบประมาณ — ดึงจากรายการที่ตั้งงบไว้ล่วงหน้าต่อกรุ๊ป (ตัวอย่าง — ปกติมาจากการทำเบิกของโอพี) */}
      {budget && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold zego-text">
              <Icon name="checklist" className="h-4 w-4 zego-text-success" />
              รายการตามงบประมาณ
            </p>
            <span className="text-xs zego-text-tertiary">
              ใช้ไป {formatMultiCurrency(budgetUsedTotals)} · งบทั้งหมด {formatMultiCurrency(budgetTotals)}
            </span>
          </div>

          {budgetCategories.map(([category, blList]) => (
            <div key={category} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide zego-text-tertiary">{category}</p>
              {blList.map((bl) => {
                const occurrences = indexedLines.filter(({ line }) => line.budgetLineId === bl.id);
                const used = occurrences.reduce((sum, { line }) => sum + (Number(line.amount) || 0), 0);
                const remaining = bl.budgetedAmount - used;
                const scanning = scanningLineId === bl.id;
                return (
                  <div key={bl.id} className="zego-border-color space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium zego-text">{bl.name}</p>
                        {bl.description && <p className="text-xs zego-text-tertiary">{bl.description}</p>}
                        <p className="text-xs zego-text-tertiary">
                          {bl.quantity.toLocaleString('th-TH')} × {bl.unitPrice.toLocaleString('th-TH')} {bl.currency}
                          {bl.discount > 0 ? ` − ส่วนลด ${bl.discount.toLocaleString('th-TH')}` : ''} = งบ{' '}
                          {bl.budgetedAmount.toLocaleString('th-TH')} {bl.currency}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs zego-text-tertiary">ใช้ไป {used.toLocaleString('th-TH')} {bl.currency}</p>
                        <p className={cx('text-xs font-semibold', remaining < 0 ? 'zego-text-danger' : 'zego-text-success')}>
                          คงเหลือ {remaining.toLocaleString('th-TH')} {bl.currency}
                        </p>
                      </div>
                    </div>

                    {occurrences.map(({ line, i }, pos) => (
                      <ExpenseLineCard
                        key={line.id}
                        line={line}
                        badge={
                          <span className="shrink-0 rounded-full zego-badge--slate px-2 py-0.5 text-[11px] font-medium">
                            ครั้งที่ {pos + 1}
                          </span>
                        }
                        currencies={master.currencies}
                        onUpdate={(patch) => updateLine(i, patch)}
                        onRemove={() => removeLine(i)}
                        onPickFile={(e) => pickFile(i, e)}
                      />
                    ))}

                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" icon="plus" onClick={() => addManualOccurrence(bl)}>
                        กรอกเอง
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        id={`scan-${bl.id}`}
                        className="hidden"
                        disabled={scanning}
                        onChange={(e) => scanOccurrence(bl, e)}
                      />
                      <label
                        htmlFor={`scan-${bl.id}`}
                        className={cx(
                          'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium zego-text-success hover:bg-emerald-50',
                          scanning && 'pointer-events-none opacity-50',
                        )}
                      >
                        <Icon name="camera" className="h-4 w-4" />
                        {scanning ? 'กำลังสแกน...' : 'สแกนใบเสร็จ'}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      )}

      {/* ค่าเบี้ยเลี้ยง — อัตราคงที่ตามตารางบริษัท ไม่ได้อยู่ในไฟล์ทำเบิกของโอพี จึงแยกเป็นรายการเดี่ยวต่างหาก */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold zego-text">
            <Icon name="checklist" className="h-4 w-4 zego-text-success" />
            ค่าเบี้ยเลี้ยง
          </p>
          {perDiemValidLines.length > 0 && (
            <span className="text-right text-xs font-semibold zego-text-success">
              รวม {formatMultiCurrency(perDiemTotals)}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {perDiemLines.map(({ line, i }, pos) => (
            <ExpenseLineCard
              key={line.id}
              line={line}
              badge={
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full zego-badge--success text-xs font-semibold">
                  {pos + 1}
                </span>
              }
              currencies={master.currencies}
              onUpdate={(patch) => updateLine(i, patch)}
              onRemove={() => removeLine(i)}
              onPickFile={(e) => pickFile(i, e)}
            />
          ))}

          {perDiemLines.length === 0 && (
            <p className="zego-border-color rounded-lg border border-dashed px-4 py-6 text-center text-xs zego-text-tertiary">
              ยังไม่มีรายการ — กดปุ่มด้านล่างเพื่อเพิ่ม
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => addLine(PER_DIEM_CATEGORY)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 py-2.5 text-sm font-medium zego-text-success hover:bg-emerald-50"
        >
          <Icon name="plus" className="h-4 w-4" />
          เพิ่มค่าเบี้ยเลี้ยง
        </button>
      </Card>

      {/* ข้อมูลโอนเงิน */}
      <Card className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold zego-text">
          <Icon name="money" className="h-4 w-4 zego-text-success" />
          ข้อมูลโอนเงิน
        </p>
        <dl className="divide-y divide-[var(--zego-border-soft)] text-sm">
          <Row label="ชื่อบัญชี" value={bank?.accountName ?? '—'} />
          <Row label="เลขที่บัญชี" value={bank ? demoFullAccountNumber(bank.accountNoMasked, bank.id) : '—'} />
          <Row label="ธนาคาร" value={bank?.bank ?? '—'} />
          <Row label="เบอร์ติดต่อ" value={phone ?? '—'} />
        </dl>
      </Card>

      {/* อัตราเบิกอ้างอิงตามประเทศ */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold zego-text">
            <Icon name="guide" className="h-4 w-4 zego-text-success" />
            อัตราเบิกอ้างอิงตามประเทศ
          </p>
          <span className="flex items-center gap-1 rounded-full zego-badge--success px-2.5 py-1 text-xs">
            <Icon name="info" className="h-3.5 w-3.5" />
            เค้กวันเกิดเบิกได้ 1 ก้อน/กรุ๊ป
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs zego-text-tertiary">
                <th className="pb-2 font-medium">กลุ่มประเทศปลายทาง</th>
                <th className="pb-2 text-right font-medium">อัตราเบี้ยเลี้ยง (ต่อวัน)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
              {PER_DIEM_RATES.map((group) => (
                <tr key={group.labelTh}>
                  <td className="py-2 zego-text-secondary">{group.labelTh}</td>
                  <td className="py-2 text-right font-medium zego-text">{group.rateTHB.toLocaleString('th-TH')} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-2 pb-2">
        <Button variant="secondary" className="flex-1" icon="file" disabled={!canSubmit || saving} loading={action === 'draft'} onClick={() => save(false)}>
          บันทึกแบบร่าง
        </Button>
        <Button variant="success" icon="check" className="flex-1" disabled={!canSubmit || saving} loading={action === 'submit'} onClick={() => save(true)}>
          ส่งอนุมัติ
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        onConfirm={confirmAck}
        title="ยืนยันรับเงินค่าแลนด์"
        message="ยืนยันว่าได้รับเงินก้อนนี้จากเจ้าหน้าที่ส่งกรุ๊ปแล้วจริง — หลังยืนยันจะเพิ่มเป็นรายการค่าใช้จ่ายในฟอร์มนี้ได้"
        confirmLabel="ยืนยันรับเงินแล้ว"
        tone="success"
        loading={acking}
      />
    </div>
  );
}

/** การ์ดกรอกรายการเดียว — ใช้ร่วมกันทั้งรายการอิสระ (หมวดกดเพิ่มเอง) และรายการที่ผูกกับ budgetLineId (ยอดใช้จริงแต่ละครั้ง) */
function ExpenseLineCard({
  line,
  badge,
  currencies,
  onUpdate,
  onRemove,
  onPickFile,
}: {
  line: DraftClaimLine;
  badge: React.ReactNode;
  currencies: { code: string; active: boolean }[];
  onUpdate: (patch: Partial<DraftClaimLine>) => void;
  onRemove: () => void;
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="zego-border-color space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {badge}
          <p className="text-sm font-semibold zego-text">{line.category}</p>
          {line.scannedFromReceipt && (
            <span className="rounded-full zego-badge--violet px-2 py-0.5 text-[10px] font-medium">สแกนใบเสร็จ</span>
          )}
        </div>
        <button type="button" onClick={onRemove} className="shrink-0 rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600" aria-label="ลบรายการนี้">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      <input
        className={cx(baseControl, 'text-sm')}
        value={line.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        placeholder="รายละเอียด"
        aria-label="รายละเอียดรายการ"
      />

      {line.formula && <p className="text-xs zego-text-tertiary">สูตรคำนวณ: {line.formula}</p>}

      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <input
            className={cx(baseControl, 'h-full')}
            type="number"
            inputMode="decimal"
            value={line.amount}
            onChange={(e) => onUpdate({ amount: e.target.value })}
            placeholder="จำนวนเงิน"
            aria-label="จำนวนเงินรายการ"
          />
        </div>
        <div className="w-20 shrink-0">
          <select
            className={cx(baseControl, 'h-full')}
            value={line.currency}
            onChange={(e) => onUpdate({ currency: e.target.value })}
            aria-label="สกุลเงินรายการ"
          >
            {currencies.filter((c) => c.active).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        className={cx(baseControl, 'text-sm')}
        value={line.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
        placeholder="หมายเหตุ"
        aria-label="หมายเหตุรายการ"
      />

      <div className="flex items-center gap-3">
        <input type="file" accept="image/*" id={`file-${line.id}`} className="hidden" onChange={onPickFile} />
        <input type="file" accept="image/*" capture="environment" id={`cam-${line.id}`} className="hidden" onChange={onPickFile} />
        <label htmlFor={`file-${line.id}`} className="flex cursor-pointer items-center gap-1 text-xs font-medium zego-text-success">
          <Icon name="file" className="h-4 w-4" />
          แนบใบเสร็จ
        </label>
        <label htmlFor={`cam-${line.id}`} className="flex cursor-pointer items-center gap-1 text-xs font-medium zego-text-success">
          <Icon name="camera" className="h-4 w-4" />
        </label>
        {line.evidenceFileName && <span className="min-w-0 flex-1 truncate text-xs zego-text-tertiary">{line.evidenceFileName}</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 first:pt-0">
      <dt className="shrink-0 zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 text-right font-medium zego-text">{value}</dd>
    </div>
  );
}
