'use client';

/**
 * บันทึกใบเสร็จ — /guide/expenses/record
 *
 * ตัวเลือกกรุ๊ป (ขั้นที่ 1) แสดงอยู่เสมอทันทีที่เข้าหน้านี้ — ไม่มีปุ่ม "บันทึกค่าใช้จ่ายใหม่" ให้กดก่อน
 * เลือกกรุ๊ปจากการ์ดที่มีรายละเอียดเต็ม (ไม่ใช่ dropdown ข้อความ) แล้วค่อยเข้าฟอร์ม (ขั้นที่ 2)
 * ซึ่งเห็นรายละเอียดกรุ๊ปที่เลือก + ค่าใช้จ่ายที่เคยบันทึกไว้แล้วของกรุ๊ปนั้นก่อนกรอก
 *
 * สรุปค่าใช้จ่ายทั้งหมดของกรุ๊ปดูได้ที่หน้ารายละเอียดงาน (/guide/jobs/[id])
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { formatDateRange, formatThaiMonthYear, toISODate } from '@/lib/format';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { GuideEnvelopeCard } from '../GuideEnvelopeCard';
import { Icon } from '@/components/ui/Icon';
import { ExpenseQuickForm } from '../ExpenseQuickForm';
import { ExpensesBackHeader } from '../ExpensesBackHeader';
import { SpendSummaryCard } from '../SpendSummaryCard';
import { CurrencyStack } from '../CurrencyStack';
import { expenseOriginalTotals } from '../expenseAmounts';
import { leaderBudgetItems } from '@/lib/logic/groupBudget';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { ExpenseRequest } from '@/types';
import { tripEnded, tripOngoing } from '@/lib/logic/tripPhase';

// บันทึกใบเสร็จส่วนใหญ่ทำระหว่างเดินทาง — "ระหว่างทาง" เป็นค่าเริ่มต้น · หลังเดินทางทำบ้างเป็นบางครั้ง
const TRAVEL_FILTERS: { value: 'during' | 'after'; label: string }[] = [
  { value: 'during', label: 'ระหว่างทาง' },
  { value: 'after', label: 'หลังเดินทาง' },
];

export default function GuideExpensesRecordPage() {
  const { currentUser, expenses, envelopes, noEnvelopeMarks } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const myJobs = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
      .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
      .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
      // เฉพาะงานที่คอนเฟิร์มแล้วเท่านั้น — สถานะอื่น (เช่น ต้องเปลี่ยนคน) ไม่ควรบันทึกค่าใช้จ่ายได้
      .filter((x) => x.assignment.assignmentStatus === 'CONFIRMED')
      .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  }, [leaderId]);

  const myExpenses = useMemo(() => expenses.filter((e) => e.requesterId === leaderId), [expenses, leaderId]);

  const [selectedPeriod, setSelectedPeriod] = useState<TourPeriodMaster | null>(null);
  const [travelFilter, setTravelFilter] = useState<'during' | 'after'>('during');
  /** เข้าจาก "บันทึกใบเสร็จย้อนหลัง" (หน้าการเงิน หัวเรื่องหลังเดินทาง) — แสดงเฉพาะกรุ๊ปหลังเดินทาง ไม่มีตัวสลับ */
  const [afterOnly, setAfterOnly] = useState(false);
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

  /*
    เปิดจากหน้าการเงิน: ?period=<id> = เลือกกรุ๊ปนั้นให้เลย (ข้ามขั้นเลือกกรุ๊ป) · ?filter=after = แสดงเฉพาะกรุ๊ปหลังเดินทาง
    อ่าน URL ฝั่ง client ครั้งเดียวหลัง mount (หน้านี้ถูก prerender)
  */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จาก URL ครั้งเดียวตอน mount
    if (q.get('filter') === 'after') { setTravelFilter('after'); setAfterOnly(true); }
    const pid = q.get('period');
    const job = pid ? myJobs.find((j) => j.period.internalId === pid) : undefined;
    if (job) setSelectedPeriod(job.period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueNext = () => {
    setReopenBudget(justSaved?.viaBudget ?? false);
    setFormKey((k) => k + 1);
    setJustSaved(null);
  };

  // ระหว่างทาง / หลังเดินทาง — กติกากลาง (วันกลับขึ้นทั้งสองแท็บ) ดู src/lib/logic/tripPhase.ts
  // ใช้วันที่จริงของเครื่อง ไม่ใช้ DEMO_TODAY — เหตุผลเดียวกับหน้าเคลียร์ค่าใช้จ่ายรายกรุ๊ป (ดูคอมเมนต์ที่ /guide/settlement/claim)
  const realToday = toISODate(new Date());
  const filteredJobs = myJobs.filter((j) => (travelFilter === 'during'
    ? tripOngoing(j.period, realToday)
    : tripEnded(j.period, realToday)));

  // จัดกลุ่มตามเดือนเดินทาง (เดือนของวันไป) · หลังเดินทางเรียงเดือนล่าสุดขึ้นก่อน — กรุ๊ปที่เพิ่งกลับอยู่บนสุด
  const byMonth = new Map<string, typeof filteredJobs>();
  for (const j of filteredJobs) {
    const month = j.period.startDate.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), j]);
  }
  const sortedMonths = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const jobsByMonth = travelFilter === 'after'
    ? sortedMonths.reverse().map(([m, list]) => [m, [...list].reverse()] as const)
    : sortedMonths;

  // ไม่รวมรายการที่ยกเลิกแล้วในพรีวิวนี้ (แค่เช็คบริบทก่อนบันทึกใหม่) — ดูภาพรวมของกรุ๊ปได้ที่หน้ารายละเอียดงาน
  const jobExpenses = selectedPeriod
    ? myExpenses.filter((e) => e.jobId === selectedPeriod.internalId && e.status !== 'cancelled')
    : [];

  return (
    <div className="space-y-4">
      <ExpensesBackHeader
        title={afterOnly ? 'บันทึกใบเสร็จย้อนหลัง' : 'บันทึกใบเสร็จ'}
        description={afterOnly ? 'เลือกกรุ๊ปที่กลับมาแล้ว แล้วบันทึกค่าใช้จ่าย' : 'เลือกกรุ๊ปที่คอนเฟิร์มแล้ว แล้วบันทึกค่าใช้จ่าย'}
        backTab={afterOnly ? 'after' : 'during'}
      />

      {myJobs.length === 0 ? (
        <Card className="bg-amber-50 ring-1 ring-amber-200">
          <p className="text-sm zego-text-warning">ต้องมีงานที่คอนเฟิร์มแล้วก่อน จึงจะบันทึกค่าใช้จ่ายได้</p>
        </Card>
      ) : !selectedPeriod ? (
        // ขั้นที่ 1 — เลือกกรุ๊ปจากการ์ดรายละเอียดเต็ม ไม่ใช่ dropdown — แสดงอยู่เสมอ ไม่ต้องกดปุ่มเปิดก่อน
        <Card className="space-y-3">
          <p className="text-sm font-semibold zego-text">เลือกกรุ๊ปที่ต้องการบันทึกค่าใช้จ่าย</p>

          {!afterOnly && (
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
          )}

          {filteredJobs.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
              {travelFilter === 'during' ? 'ไม่มีกรุ๊ปที่กำลังเดินทางอยู่' : 'ไม่มีกรุ๊ปหลังเดินทาง'}
            </p>
          ) : (
          <div className="space-y-4">
            {jobsByMonth.map(([month, list]) => (
              <section key={month} className="space-y-2">
                <p className="flex items-baseline justify-between text-xs font-semibold zego-text-secondary">
                  <span>{formatThaiMonthYear(`${month}-01`)}</span>
                  <span className="font-normal zego-text-tertiary">{list.length} กรุ๊ป</span>
                </p>
                <ul className="space-y-2">
                  {list.map((j) => (
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
              </section>
            ))}
          </div>
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
          <SpendSummaryCard recorded={jobExpenses} budgetItems={leaderBudgetItems(expenses, envelopes, noEnvelopeMarks, selectedPeriod.internalId)} />
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
