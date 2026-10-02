'use client';

/**
 * ค่าใช้จ่ายรายกรุ๊ป — /guide/expenses/by-group
 *
 * ดูค่าใช้จ่ายที่บันทึกไว้แล้วทั้งหมด แยกเป็นก้อนตามกรุ๊ป (ไม่ใช่ลิสต์รวมเรียงเวลาแบบเดิม)
 * อ่านอย่างเดียว — จะบันทึกใหม่ให้ไปที่เมนู "บันทึกใบเสร็จ" (/guide/expenses/record)
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { leaderBudgetItems, recordedByBudgetLine } from '@/lib/logic/groupBudget';
import { GroupBudgetList } from '../GroupBudgetList';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatDateRange, formatDateTime } from '@/lib/format';
import { Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { MonthPicker, currentMonthStartFromNow } from '@/components/ui/MonthPicker';
import { ExpensesBackHeader } from '../ExpensesBackHeader';
import { GuideExpenseDetailDrawer } from '../GuideExpenseDetailDrawer';
import { CurrencyStack } from '../CurrencyStack';
import { CurrencyAmountGrid } from '../CurrencyAmountGrid';
import { expenseOriginalTotals, requestedAtOf, sumByCurrency } from '../expenseAmounts';
import type { ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

interface GroupBucket {
  period: TourPeriodMaster;
  expenses: ExpenseRequest[];
}

export default function GuideExpensesByGroupPage() {
  const { currentUser, expenses, today, envelopes, noEnvelopeMarks } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  // ทุกกรุ๊ปที่เคยถูกจัดให้ (ไม่จำกัดเฉพาะคอนเฟิร์มแล้ว) — เพื่อ join หาชื่อกรุ๊ปของค่าใช้จ่ายเก่าได้ครบ
  const periodById = useMemo(() => {
    const periods = getTourPeriods();
    return new Map(periods.map((p) => [p.internalId, p]));
  }, []);

  const myExpenses = useMemo(() => expenses.filter((e) => e.requesterId === leaderId), [expenses, leaderId]);

  /** กรุ๊ปที่ถูกจัดให้หัวหน้าทัวร์คนนี้ — ใช้หากรุ๊ปที่คนทำเบิกเตรียมรายการงบไว้แล้ว แม้ยังไม่ได้บันทึกใบเสร็จเลย */
  const myGroupIds = useMemo(
    () => new Set(leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId).map((a) => a.periodId) : []),
    [leaderId],
  );

  // กรุ๊ปที่มีค่าใช้จ่ายบันทึกไว้แล้ว หรือมีรายการงบ — เรียงตามวันเดินทางล่าสุดก่อน
  const buckets: GroupBucket[] = useMemo(() => {
    const grouped = new Map<string, ExpenseRequest[]>();
    for (const e of myExpenses) {
      // ใบเบิกเงินทดรอง (งบ) แสดงเป็นรายการงบแยกด้านล่าง ไม่ปนกับใบเสร็จที่บันทึก
      if (e.category === 'advance') continue;
      const list = grouped.get(e.jobId) ?? [];
      list.push(e);
      grouped.set(e.jobId, list);
    }
    for (const id of myGroupIds) {
      if (!grouped.has(id) && leaderBudgetItems(expenses, envelopes, noEnvelopeMarks, id).length > 0) grouped.set(id, []);
    }
    return [...grouped.entries()]
      .map(([jobId, list]) => {
        const period = periodById.get(jobId);
        return period ? { period, expenses: list.sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a))) } : null;
      })
      .filter((b): b is GroupBucket => Boolean(b))
      .sort((a, b) => b.period.startDate.localeCompare(a.period.startDate));
  }, [myExpenses, periodById, myGroupIds, expenses, envelopes, noEnvelopeMarks]);

  // กรองตามเดือนที่เลือก — เทียบวันเดินทางเริ่มต้นของกรุ๊ปว่าอยู่เดือนเดียวกับที่เลือกไหม
  const [monthCursor, setMonthCursor] = useState(today);
  // ค่าเริ่มต้น = เดือนปัจจุบันตามวันที่จริงของเครื่อง (ไม่ใช่วันอ้างอิงของ Demo) — ตั้งตอน mount เพราะหน้าถูก prerender
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonthCursor(currentMonthStartFromNow());
  }, []);
  const visibleBuckets = useMemo(
    () => buckets.filter((b) => b.period.startDate.slice(0, 7) === monthCursor.slice(0, 7)),
    [buckets, monthCursor],
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // เผื่อรายการเดียวที่แสดง กดเปิดไว้ให้เห็นเลย ไม่ต้องกดซ้ำ
  const effectiveExpandedId = expandedId ?? (visibleBuckets.length === 1 ? visibleBuckets[0].period.internalId : null);
  const [detailExpense, setDetailExpense] = useState<ExpenseRequest | null>(null);

  return (
    <div className="space-y-4">
      <ExpensesBackHeader title="ค่าใช้จ่ายรายกรุ๊ป" description="ค่าใช้จ่ายที่บันทึกไว้แล้ว แยกตามกรุ๊ป" />

      <MonthPicker value={monthCursor} onChange={setMonthCursor} ariaLabel="เลือกเดือนที่เดินทาง" centerLabel />

      {buckets.length === 0 ? (
        <Card>
          <EmptyState icon="receipt" title="ยังไม่มีรายการค่าใช้จ่าย" description={'ยังไม่มีรายการงบจากฝ่ายเบิกจ่าย และยังไม่ได้บันทึกค่าใช้จ่ายที่เมนู "บันทึกใบเสร็จ"'} />
        </Card>
      ) : visibleBuckets.length === 0 ? (
        <Card>
          <EmptyState icon="receipt" title="ไม่มีค่าใช้จ่ายในเดือนนี้" description="ลองเปลี่ยนเดือนที่ตัวเลือกด้านบน" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {visibleBuckets.map(({ period, expenses: list }) => {
            // ยอดรวม/จำนวนรายการนับเฉพาะรายการที่ยังไม่ถูกยกเลิก — รายการที่ยกเลิกยังโชว์ในลิสต์ย่อยไว้ตรวจสอบย้อนหลังได้ แต่ไม่นับรวม
            const activeList = list.filter((e) => e.status !== 'cancelled');
            const totalsByCurrency = sumByCurrency(activeList);
            const expanded = effectiveExpandedId === period.internalId;
            const budgetItems = leaderBudgetItems(expenses, envelopes, noEnvelopeMarks, period.internalId);
            const budgetNameById = new Map(budgetItems.map((b) => [b.line.id, b.line.purpose]));
            return (
              <li key={period.internalId}>
                <Card padded={false}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? '' : period.internalId)}
                    className="flex w-full items-center gap-3 px-4 pt-4 text-left zego-hover-surface"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 zego-text-success">
                      <Icon name="briefcase" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold zego-text">{period.groupCode}</span>
                      <span className="block truncate text-sm zego-text-secondary">{period.displayName}</span>
                      <span className="block text-xs zego-text-tertiary">
                        {period.countryName} · {formatDateRange(period.startDate, period.endDate)}
                      </span>
                    </span>
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className="h-4 w-4 shrink-0 zego-text-disabled" />
                  </button>

                  <div className="px-4 pb-4 pt-3">
                    <CurrencyAmountGrid totals={totalsByCurrency} recordCount={activeList.length} />
                    {list.length > activeList.length && (
                      <p className="mt-2 text-xs zego-text-tertiary">ยกเลิกแล้ว {list.length - activeList.length} รายการ</p>
                    )}
                    {budgetItems.length > 0 && !expanded && (
                      <p className="mt-2 text-xs zego-text-info">มีรายการตามงบ {budgetItems.length} รายการ — กดเพื่อดู</p>
                    )}
                  </div>

                  {expanded && budgetItems.length > 0 && (
                    <div className="px-4 pb-3">
                      <GroupBudgetList items={budgetItems} recorded={recordedByBudgetLine(expenses, period.internalId)} />
                    </div>
                  )}

                  {expanded && (
                    <ul className="divide-y divide-[var(--zego-border-soft)] zego-divider-top">
                      {list.map((e) => {
                        const originals = expenseOriginalTotals(e);
                        const cancelled = e.status === 'cancelled';
                        return (
                          <li key={e.id}>
                            {/* กดเข้าไปดูรายละเอียดเต็ม (ทุกรายการย่อย/Timeline) ผ่าน GuideExpenseDetailDrawer
                                รายการที่ยกเลิกแล้วจางลง + ขีดฆ่ายอดเงิน — ยังกดดูได้ แต่ไม่นับรวมในยอด/จำนวนด้านบน */}
                            <button
                              type="button"
                              onClick={() => setDetailExpense(e)}
                              className={cx(
                                'flex w-full items-start justify-between gap-2 px-4 py-3 text-left zego-hover-surface',
                                cancelled && 'opacity-60',
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium zego-text">{e.lines[0]?.expenseType ?? e.id}</p>
                                {e.lines[0]?.budgetLineId && budgetNameById.has(e.lines[0].budgetLineId) && (
                                  <p className="truncate text-xs zego-text-info">ตามงบ: {budgetNameById.get(e.lines[0].budgetLineId)}</p>
                                )}
                                <p className="text-xs zego-text-tertiary">{formatDateTime(e.submittedAt ?? e.requestedAt)}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <CurrencyStack
                                  totals={originals}
                                  lineClassName={cx('text-sm font-semibold tabular-nums zego-text', cancelled && 'line-through')}
                                />
                                <StatusBadge meta={EXPENSE_STATUS[e.status]} size="sm" />
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <GuideExpenseDetailDrawer expense={detailExpense} onClose={() => setDetailExpense(null)} />
    </div>
  );
}
