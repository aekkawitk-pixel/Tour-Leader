'use client';

/**
 * บัญชี-การเงินของกรุ๊ปเดียว — แสดงในหน้ารายละเอียดงาน (/guide/jobs/[id]#finance)
 * (เดิมเป็นการ์ดในหน้า "ตรวจสอบก่อนนัดเคลียร์เงิน" — ย้ายมาอยู่กับกรุ๊ปเพื่อให้ทุกเรื่องของกรุ๊ปอยู่ที่เดียว)
 *
 * - ผลสรุป "พร้อมเคลียร์หรือยัง" + ✓/✗ ทีละเรื่อง (clearReadiness)
 * - ปุ่มหลักเดียว: ทำนัดหมายเคลียร์เงิน (หลังจบทริป) · นัดแล้ว = บอกสถานะนัด
 * - ใบเสร็จค่าใช้จ่าย + เบี้ยเลี้ยง ของกรุ๊ปนี้ แตะดูรายละเอียดได้
 * ซองเงินไม่ซ้ำไว้ที่นี่ — การ์ดซองเงินอยู่ด้านบนของหน้ารายละเอียดงานแล้ว
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { EXPENSE_STATUS, appointmentStatusMeta } from '@/lib/labels';
import { formatCurrency, formatDate, toISODate } from '@/lib/format';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { clearReadiness, receiptsBlockedReason, type ReadinessTone } from '@/lib/logic/clearReadiness';
import { expenseStatusMeta } from '@/lib/logic/usageReport';
import { Button, Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { GuideExpenseDetailDrawer } from '../expenses/GuideExpenseDetailDrawer';
import { expenseOriginalTotals, requestedAtOf } from '../expenses/expenseAmounts';
import { RequestClearModal } from '../settlement/claim/RequestClearModal';
import type { ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ') || '—';

/** ป้ายผลสรุป "พร้อมเคลียร์หรือยัง" (clearReadiness) */
const READINESS_BADGE: Record<ReadinessTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
};

export function GroupFinancePanel({ period }: { period: TourPeriodMaster }) {
  const { currentUser, expenses, envelopes, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());
  const [detail, setDetail] = useState<ExpenseRequest | null>(null);
  const [requesting, setRequesting] = useState(false);
  // เปิดจากการ์ดกรุ๊ปในหน้าบัญชี-การเงิน (#finance) → เลื่อนมาที่ส่วนนี้ (เนื้อหามาจาก store หลัง mount เบราว์เซอร์จึงเลื่อนเองไม่ทัน)
  useEffect(() => {
    if (window.location.hash === '#finance') requestAnimationFrame(() => document.getElementById('finance')?.scrollIntoView({ block: 'start' }));
  }, []);

  const pid = period.internalId;
  const receipts = expenses
    .filter((e) => e.jobId === pid && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled')
    .sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a)));
  const perDiem = leaderId ? activeLeaderClaim(expenses, pid, leaderId, 'per_diem') : null;
  const envs = envelopes.filter((e) => e.periodId === pid && e.sealed).sort((a, b) => a.no - b.no);
  const started = tripStarted(period, today);
  // ยังไม่ออกเดินทางและยังไม่มีรายการ — ยังไม่มีเรื่องการเงินให้ทำ (ซองเงินอยู่การ์ดด้านบนแล้ว)
  if (!started && receipts.length === 0 && !perDiem) return null;

  // วันกลับนับเป็นจบทริป (ตรงกับการส่งอนุมัติเบี้ยเลี้ยง)
  const ended = tripEnded(period, today);
  const ready = clearReadiness({
    started,
    ended,
    startText: formatDate(period.startDate),
    endText: formatDate(period.endDate || period.startDate),
    envs,
    receipts,
    perDiem,
  });
  const apt = appointments
    .filter((a) => a.leaderId === leaderId && a.kind === 'clear' && a.jobId === pid && a.status !== 'cancelled')
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null;
  const blocked = receiptsBlockedReason(envs);

  return (
    <section id="finance" aria-labelledby="finance-title" className="scroll-mt-4">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="finance-title" className="text-sm font-semibold zego-text">บัญชี-การเงิน</h2>
            <p className={cx('text-xs', ready.tone === 'amber' ? 'font-medium text-amber-800' : ready.tone === 'emerald' ? 'text-emerald-700' : 'zego-text-tertiary')}>{ready.detail}</p>
          </div>
          <span className={cx('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', READINESS_BADGE[ready.tone])}>
            {ready.ready && <Icon name="check" className="h-3 w-3" />}
            {ready.ready && apt ? 'ครบแล้ว · นัดแล้ว' : ready.label}
          </span>
        </div>

        {/* สรุป ✓/✗ ทีละเรื่อง — ดูแวบเดียวรู้ว่าขาดอะไร (เขียว = เรียบร้อย · ส้ม = ต้องทำ · เทา = ไม่เกี่ยวกับกรุ๊ปนี้) */}
        <ul className="grid grid-cols-3 gap-1.5">
          {ready.checks.map((c) => (
            <li key={c.label} className={cx('rounded-lg px-2 py-1.5 text-center ring-1 ring-inset', c.na ? 'zego-surface-soft-bg ring-[var(--zego-border-soft)]' : c.ok ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200')}>
              <span className={cx('flex items-center justify-center gap-1 text-xs font-semibold', c.na ? 'zego-text-tertiary' : c.ok ? 'text-emerald-800' : 'text-amber-800')}>
                {!c.na && <Icon name={c.ok ? 'check' : 'warning'} className="h-3.5 w-3.5" />}
                {c.label}
              </span>
              <span className={cx('block text-[11px] leading-tight', c.na ? 'zego-text-tertiary' : c.ok ? 'text-emerald-700' : 'text-amber-800')}>{c.text}</span>
            </li>
          ))}
        </ul>

        {/* นัดเคลียร์เงิน — นัดแล้วบอกสถานะ · จบทริปแล้วนัดได้ (ครบ = ปุ่มหลัก · ยังไม่ครบ = นัดล่วงหน้า) · ยังไม่จบ = บอกว่านัดได้เมื่อไร */}
        {apt ? (
          <Link href="/guide/settlement/appointments" className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
            <span>
              <span className="font-semibold">นัดเคลียร์เงิน {formatDate(apt.date)} {apt.time} น.</span>
              {' · '}{appointmentStatusMeta(apt).label}
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0" />
          </Link>
        ) : ready.ready || ended ? (
          <div>
            <Button variant={ready.ready ? 'primary' : 'secondary'} icon="calendar" className="w-full justify-center" onClick={() => setRequesting(true)}>
              ทำนัดหมายเคลียร์เงิน
            </Button>
            {!ready.ready && <p className="mt-1 text-center text-[11px] text-amber-800">นัดล่วงหน้าได้ · ทำส่วนที่ขาดให้ครบก่อนวันนัด</p>}
          </div>
        ) : (
          <p className="text-xs zego-text-tertiary">
            <Icon name="calendar" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            นัดเคลียร์เงินได้หลังจบทริป ({formatDate(period.endDate || period.startDate)})
          </p>
        )}

        <Section
          title="ใบเสร็จค่าใช้จ่าย"
          count={receipts.length}
          action={blocked
            // ยังบันทึกไม่ได้ (ซองยังไม่ถึงมือ) — บอกเหตุผล ตรงกับช่องเช็กด้านบน
            ? <span className="text-xs zego-text-disabled">+ บันทึกใบเสร็จ · {blocked}</span>
            : <Link href={`/guide/expenses/record?period=${encodeURIComponent(pid)}`} className="text-xs font-medium zego-text-info hover:underline">+ บันทึกใบเสร็จ</Link>}
        >
          {receipts.length === 0 ? <Empty text="ยังไม่ได้บันทึกใบเสร็จ" /> : receipts.map((r) => (
            <Row
              key={r.id}
              onClick={() => setDetail(r)}
              title={r.lines[0]?.purpose || r.lines[0]?.expenseType || 'ใบเสร็จ'}
              // ใบเสร็จไม่ใช่ใบเบิก — ไม่แสดงเลข EXP (เลขภายในระบบ) · บอกวันที่ใบเสร็จแทน
              sub={`ใบเสร็จ ${formatDate(r.lines[0]?.receiptDate ?? requestedAtOf(r))}${r.lines.length > 1 ? ` · ${r.lines.length} รายการ` : ''}`}
              amount={fmtTotals(expenseOriginalTotals(r))}
            >
              <StatusBadge meta={expenseStatusMeta(r)} size="sm" />
            </Row>
          ))}
        </Section>

        <Section
          title="เบี้ยเลี้ยง"
          count={perDiem ? 1 : 0}
          action={
            <Link href={`/guide/settlement/allowance?period=${encodeURIComponent(pid)}`} className="text-xs font-medium zego-text-info hover:underline">
              {perDiem ? 'เปิดใบเบิก' : ended ? '+ ทำใบเบิก' : '+ ทำร่างไว้ก่อน'}
            </Link>
          }
        >
          {!perDiem ? <Empty text={ended ? 'ยังไม่ได้ทำใบเบิกเบี้ยเลี้ยง' : 'ทำร่างรอไว้ได้ · ส่งอนุมัติได้หลังจบทริป'} /> : (
            <Row
              onClick={() => setDetail(perDiem)}
              title="เอกสารค่าใช้จ่ายหัวหน้าทัวร์"
              sub={`${perDiem.id} · ${perDiem.lines.length} รายการ`}
              amount={fmtTotals(expenseOriginalTotals(perDiem))}
            >
              <StatusBadge meta={EXPENSE_STATUS[perDiem.status]} size="sm" />
            </Row>
          )}
        </Section>
      </Card>

      <GuideExpenseDetailDrawer expense={detail} onClose={() => setDetail(null)} />
      {requesting && leaderId && <RequestClearModal period={period} leaderId={leaderId} missing={ready.ready ? null : ready.detail} onClose={() => setRequesting(false)} />}
    </section>
  );
}

function Section({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold zego-text-secondary">{title} <span className="font-normal zego-text-tertiary">({count})</span></p>
        {action}
      </div>
      <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">{children}</ul>
    </div>
  );
}

function Row({ title, sub, amount, onClick, children }: { title: string; sub?: string; amount: string; onClick?: () => void; children: React.ReactNode }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm zego-text">{title}</span>
        {sub && <span className="block truncate text-[11px] zego-text-tertiary">{sub}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs font-semibold tabular-nums zego-text">{amount}</span>
        {children}
      </span>
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left zego-hover-surface">{body}</button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{body}</div>
      )}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="px-3 py-2.5 text-xs zego-text-tertiary">{text}</li>;
}
