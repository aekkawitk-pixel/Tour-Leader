'use client';

/**
 * บันทึกใบเสร็จ — /guide/expenses/record
 *
 * ตัวเลือกกรุ๊ป (ขั้นที่ 1) แสดงอยู่เสมอทันทีที่เข้าหน้านี้ — ไม่มีปุ่ม "บันทึกค่าใช้จ่ายใหม่" ให้กดก่อน
 * เลือกกรุ๊ปจากการ์ดที่มีรายละเอียดเต็ม (ไม่ใช่ dropdown ข้อความ) แล้วค่อยเข้าฟอร์ม (ขั้นที่ 2)
 * ซึ่งเห็นรายละเอียดกรุ๊ปที่เลือก + ค่าใช้จ่ายที่เคยบันทึกไว้แล้วของกรุ๊ปนั้นก่อนกรอก
 *
 * รายการค่าใช้จ่ายทั้งหมดแยกตามกรุ๊ปดูได้ที่เมนู "ค่าใช้จ่ายรายกรุ๊ป" (/guide/expenses/by-group)
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { formatCurrency, formatDateRange, toISODate } from '@/lib/format';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { GuideExpenseDetailDrawer } from '../GuideExpenseDetailDrawer';
import { RecordedSection } from '../RecordedExpenseList';
import { GuideEnvelopeCard } from '../GuideEnvelopeCard';
import { Icon } from '@/components/ui/Icon';
import { ExpenseQuickForm } from '../ExpenseQuickForm';
import { ExpensesBackHeader } from '../ExpensesBackHeader';
import { CurrencyStack } from '../CurrencyStack';
import { expenseOriginalTotals, sumByCurrency } from '../expenseAmounts';
import { budgetItemsForGroup, type BudgetItem } from '@/lib/logic/groupBudget';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { ExpenseRequest } from '@/types';

const TRAVEL_FILTERS: { value: 'before' | 'after'; label: string }[] = [
  { value: 'before', label: 'ก่อนเดินทาง' },
  { value: 'after', label: 'หลังเดินทาง' },
];

export default function GuideExpensesRecordPage() {
  const { currentUser, expenses } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const myJobs = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
      .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
      .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
      // เฉพาะงานที่คอนเฟิร์มแล้วเท่านั้น — ยังไม่รับงาน (รอคอนเฟิร์ม/ปฏิเสธ/ต้องเปลี่ยนคน) ไม่ควรบันทึกค่าใช้จ่ายได้
      .filter((x) => x.assignment.assignmentStatus === 'CONFIRMED')
      .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  }, [leaderId]);

  const myExpenses = useMemo(() => expenses.filter((e) => e.requesterId === leaderId), [expenses, leaderId]);

  const [selectedPeriod, setSelectedPeriod] = useState<TourPeriodMaster | null>(null);
  const [travelFilter, setTravelFilter] = useState<'before' | 'after'>('before');
  const router = useRouter();
  /** เพิ่งบันทึกสำเร็จ → ถามว่าจะไปหน้าหลัก หรือทำรายการต่อ (กรุ๊ปเดิม) */
  const [justSaved, setJustSaved] = useState<{ expense: ExpenseRequest; viaBudget: boolean } | null>(null);
  /** เปลี่ยนค่าเพื่อ remount ฟอร์มใหม่ให้ว่างเมื่อ "ทำรายการต่อไป" */
  const [formKey, setFormKey] = useState(0);
  const [reopenBudget, setReopenBudget] = useState(false);

  /** เปลี่ยน/ออกจากกรุ๊ป → เริ่มใหม่ทั้งหมด (ไม่ค้างหน้า "บันทึกแล้ว" หรือเปิดรายการเบิกค้างไว้) */
  const selectPeriod = (p: TourPeriodMaster | null) => {
    setSelectedPeriod(p);
    setJustSaved(null);
    setReopenBudget(false);
    setFormKey((k) => k + 1);
  };

  const continueNext = () => {
    setReopenBudget(justSaved?.viaBudget ?? false);
    setFormKey((k) => k + 1);
    setJustSaved(null);
  };

  // ก่อนเดินทาง = ยังไม่ถึงวันออกเดินทาง · หลังเดินทาง = ออกเดินทางแล้ว (รวมกำลังเดินทางอยู่)
  // ใช้วันที่จริงของเครื่อง ไม่ใช้ DEMO_TODAY — เหตุผลเดียวกับหน้าเคลียร์ค่าใช้จ่ายรายกรุ๊ป (ดูคอมเมนต์ที่ /guide/settlement/claim)
  const realToday = toISODate(new Date());
  const filteredJobs = myJobs.filter((j) => (travelFilter === 'before' ? j.period.startDate > realToday : j.period.startDate <= realToday));

  // ไม่รวมรายการที่ยกเลิกแล้วในพรีวิวนี้ (แค่เช็คบริบทก่อนบันทึกใหม่) — ดูประวัติเต็มรวมรายการที่ยกเลิกได้ที่ "ค่าใช้จ่ายรายกรุ๊ป"
  const jobExpenses = selectedPeriod
    ? myExpenses.filter((e) => e.jobId === selectedPeriod.internalId && e.status !== 'cancelled')
    : [];

  return (
    <div className="space-y-4">
      <ExpensesBackHeader title="บันทึกใบเสร็จ" description="เลือกกรุ๊ปที่คอนเฟิร์มแล้ว แล้วบันทึกค่าใช้จ่าย" />

      {myJobs.length === 0 ? (
        <Card className="bg-amber-50 ring-1 ring-amber-200">
          <p className="text-sm zego-text-warning">ต้องมีงานที่คอนเฟิร์มแล้วก่อน จึงจะบันทึกค่าใช้จ่ายได้</p>
        </Card>
      ) : !selectedPeriod ? (
        // ขั้นที่ 1 — เลือกกรุ๊ปจากการ์ดรายละเอียดเต็ม ไม่ใช่ dropdown — แสดงอยู่เสมอ ไม่ต้องกดปุ่มเปิดก่อน
        <Card className="space-y-3">
          <p className="text-sm font-semibold zego-text">เลือกกรุ๊ปที่ต้องการบันทึกค่าใช้จ่าย</p>

          <div className="inline-flex overflow-hidden rounded-lg border zego-border-color">
            {TRAVEL_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={travelFilter === f.value}
                onClick={() => setTravelFilter(f.value)}
                className={cx(
                  'px-3 py-1.5 text-xs font-medium',
                  travelFilter === f.value ? 'bg-emerald-600 text-white' : 'zego-surface-bg zego-text-secondary zego-hover-surface',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredJobs.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
              ไม่มีกรุ๊ป{travelFilter === 'before' ? 'ก่อนเดินทาง' : 'หลังเดินทาง'}
            </p>
          ) : (
          <ul className="space-y-2">
            {filteredJobs.map((j) => (
              <li key={j.period.internalId}>
                <button
                  type="button"
                  onClick={() => selectPeriod(j.period)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border zego-border-color px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium zego-text">{j.period.groupCode} · {j.period.displayName}</span>
                    <span className="block text-xs zego-text-tertiary">{j.period.countryName} · {formatDateRange(j.period.startDate, j.period.endDate)}</span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
                </button>
              </li>
            ))}
          </ul>
          )}
        </Card>
      ) : (
        // ขั้นที่ 2 — เห็นรายละเอียดกรุ๊ปที่เลือก + ค่าใช้จ่ายที่เคยบันทึกไว้แล้ว แล้วค่อยกรอกฟอร์ม
        <div className="space-y-3">
          <div className="rounded-lg zego-surface-soft-bg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold zego-text">{selectedPeriod.groupCode} · {selectedPeriod.displayName}</p>
                <p className="mt-0.5 text-xs zego-text-tertiary">
                  {selectedPeriod.countryName} · {formatDateRange(selectedPeriod.startDate, selectedPeriod.endDate)}
                </p>
              </div>
              <button type="button" onClick={() => selectPeriod(null)} className="shrink-0 text-xs font-medium zego-text-success hover:underline">
                เปลี่ยนกรุ๊ป
              </button>
            </div>
          </div>
          <SpendSummaryCard recorded={jobExpenses} budgetItems={budgetItemsForGroup(expenses, selectedPeriod.internalId)} />
          <GuideEnvelopeCard periodId={selectedPeriod.internalId} mode="use" />
          {justSaved ? (
            <SavedPrompt
              expense={justSaved.expense}
              viaBudget={justSaved.viaBudget}
              onHome={() => router.push('/guide')}
              onContinue={continueNext}
            />
          ) : (
            <ExpenseQuickForm
              key={formKey}
              period={selectedPeriod}
              initialPickBudget={reopenBudget}
              onCancel={() => selectPeriod(null)}
              onSaved={(expense, viaBudget) => setJustSaved({ expense, viaBudget })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** หลังบันทึกสำเร็จ — สรุปสิ่งที่บันทึก แล้วให้เลือก: กลับหน้าหลัก หรือทำรายการต่อไปในกรุ๊ปเดิม */
function SavedPrompt({
  expense,
  viaBudget,
  onHome,
  onContinue,
}: {
  expense: ExpenseRequest;
  viaBudget: boolean;
  onHome: () => void;
  onContinue: () => void;
}) {
  const first = expense.lines[0];
  return (
    <Card className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
        <Icon name="check" className="h-6 w-6 zego-text-success" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold zego-text">บันทึกแล้ว</p>
        <p className="text-xs zego-text-tertiary">{expense.id}</p>
      </div>
      <div className="rounded-lg zego-surface-soft-bg px-3 py-2 text-left text-sm">
        <p className="truncate font-medium zego-text">
          {first?.purpose ?? '—'}
          {expense.lines.length > 1 && <span className="zego-text-tertiary"> และอีก {expense.lines.length - 1} รายการ</span>}
        </p>
        <CurrencyStack totals={expenseOriginalTotals(expense)} lineClassName="font-semibold" />
        {first?.evidenceFileName && <p className="mt-0.5 truncate text-xs zego-text-tertiary">หลักฐาน: {first.evidenceFileName}</p>}
      </div>
      <p className="text-sm zego-text-secondary">ต้องการทำอะไรต่อ?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onHome}>กลับหน้าหลัก</Button>
        <Button variant="primary" onClick={onContinue}>ทำรายการต่อไป</Button>
      </div>
      {viaBudget && <p className="text-[11px] zego-text-tertiary">&quot;ทำรายการต่อไป&quot; จะเปิดรายการเบิกของกรุ๊ปนี้ให้เลือกรายการถัดไป</p>}
    </Card>
  );
}

/** ค่าใช้จ่ายใบนี้บันทึก "ตามรายการเบิก" ไหม — ทุกบรรทัดในใบเดียวกันผูกรายการเบิกเดียวกัน (ดู ExpenseQuickForm) */
const isInBudget = (e: ExpenseRequest) => e.lines.some((l) => Boolean(l.budgetLineId));

/**
 * การ์ดสรุปยอดที่บันทึกแล้วของกรุ๊ป — 1 ช่องต่อ 1 สกุลเงิน (ไม่บวกข้ามสกุลเงิน) · แสดงเสมอ ยังไม่บันทึก = 0
 * แต่ละช่องแยกยอด "ตามรายการเบิก" / "นอกรายการเบิก" · สกุลที่มีงบเบิก → แถบสัดส่วนเทียบเฉพาะยอดตามรายการเบิก
 * "ดูรายละเอียด" → รายการทุกใบแยกสองหัวข้อ แตะใบไหนเปิดรายละเอียดเต็ม (ดูรูป / แก้ไข / ยกเลิก) ได้จากตรงนี้
 */
function SpendSummaryCard({ recorded, budgetItems }: { recorded: ExpenseRequest[]; budgetItems: BudgetItem[] }) {
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<ExpenseRequest | null>(null);

  const inBudget = recorded.filter(isInBudget);
  const outside = recorded.filter((e) => !isInBudget(e));
  const toMap = (list: ExpenseRequest[]) => new Map(sumByCurrency(list).map((t) => [t.currency, t.amount]));
  const spentIn = toMap(inBudget);
  const spentOut = toMap(outside);
  const budget = new Map<string, number>();
  for (const { line } of budgetItems) budget.set(line.currency, (budget.get(line.currency) ?? 0) + line.amount);
  // สกุลเงินที่มีงบก่อน แล้วตามด้วยสกุลที่บันทึกนอกงบ · ไม่มีอะไรเลย = ช่อง THB 0
  const currencies = [...new Set([...budget.keys(), ...spentIn.keys(), ...spentOut.keys()])];
  if (currencies.length === 0) currencies.push('THB');
  const num = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold zego-text">สรุปค่าใช้จ่ายที่บันทึกแล้ว</p>
        <span className="rounded-full zego-surface-soft-bg px-2 py-0.5 text-xs zego-text-secondary">{recorded.length} รายการ</span>
      </div>
      <div className={cx('grid gap-2', currencies.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {currencies.map((c) => {
          const amtIn = spentIn.get(c) ?? 0;
          const amtOut = spentOut.get(c) ?? 0;
          const b = budget.get(c);
          const over = b !== undefined && amtIn > b;
          const pct = b ? Math.min(100, Math.round((amtIn / b) * 100)) : 0;
          return (
            <div key={c} className="rounded-xl border zego-border-color zego-surface-soft-bg px-3 py-2.5">
              <p className="text-[11px] font-semibold tracking-wide zego-text-tertiary">{c}</p>
              <p className="text-lg font-bold tabular-nums leading-tight zego-text">{num(amtIn + amtOut)}</p>
              <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                <p className="flex justify-between gap-2">
                  <span className="zego-text-tertiary">ตามรายการเบิก</span>
                  <span className={cx('font-medium', over ? 'zego-text-danger' : 'zego-text-secondary')}>{num(amtIn)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="zego-text-tertiary">นอกรายการเบิก</span>
                  <span className={cx('font-medium', amtOut > 0 ? 'zego-text-warning' : 'zego-text-secondary')}>{num(amtOut)}</span>
                </p>
              </div>
              {b !== undefined && (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                    <div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums zego-text-tertiary">
                    งบเบิก {formatCurrency(b, c)}
                    {over && <span className="font-medium zego-text-danger"> · เกิน {formatCurrency(amtIn - b, c)}</span>}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
      {recorded.length > 0 && (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border zego-border-color py-2 text-xs font-medium zego-text-info hover:bg-sky-50"
        >
          ดูรายละเอียด {recorded.length} รายการ
          {outside.length > 0 && <span className="zego-text-warning">(นอกรายการเบิก {outside.length})</span>}
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      )}

      {listOpen && !detail && (
        <Modal
          open
          onClose={() => setListOpen(false)}
          size="sm"
          title="ค่าใช้จ่ายที่บันทึกแล้ว"
          description={`${recorded.length} รายการ · แตะเพื่อดูรายละเอียด / รูป / แก้ไข`}
          footer={<Button variant="secondary" className="w-full" onClick={() => setListOpen(false)}>ปิด</Button>}
        >
          <div className="space-y-4">
            <RecordedSection title="นอกรายการเบิก" tone="warning" list={outside} onOpen={setDetail} />
            <RecordedSection title="ตามรายการเบิก" tone="info" list={inBudget} onOpen={setDetail} />
          </div>
        </Modal>
      )}
      <GuideExpenseDetailDrawer expense={detail} onClose={() => setDetail(null)} />
    </Card>
  );
}
