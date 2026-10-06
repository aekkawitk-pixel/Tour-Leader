'use client';

/**
 * ตรวจสอบก่อนนัดเคลียร์เงิน — /guide/settlement/claim (พอร์ทัลหัวหน้าทัวร์)
 *
 * ขั้นสุดท้ายก่อนนัดหมาย: บันทึกใบเสร็จ → เบิกเบี้ยเลี้ยง → ตรวจสอบหน้านี้ → นัดหมายเข้ามาเคลียร์เงิน
 * แต่ละกรุ๊ปมีค่าใช้จ่ายอะไรทำไปแล้วบ้าง และแต่ละรายการอยู่สถานะไหน (ดูอย่างเดียว — กดดูรายละเอียดได้)
 *   1) ซองเงินที่ได้รับ — สถานะซอง (รอรับ / รับแล้ว / ส่งต่อ ...)
 *   2) ใบเสร็จค่าใช้จ่าย — ที่บันทึกจากเมนูค่าใช้จ่าย (ExpenseRequest category 'actual') · สถานะตรวจของบัญชี
 *   3) เอกสารค่าใช้จ่ายหัวหน้าทัวร์ (เบี้ยเลี้ยง) — ร่าง / รออนุมัติ / ให้แก้ไข / อนุมัติ / จ่ายแล้ว
 * กรุ๊ป = งานที่คอนเฟิร์มแล้วและออกเดินทางแล้ว (หรือมีรายการแล้ว) · ล่าสุดก่อน · สรุปสถานะรวมที่หัวการ์ด
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, toISODate } from '@/lib/format';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { envelopeName } from '@/lib/logic/cashEnvelope';
import { followUpOpen, followUpRemaining } from '@/lib/logic/groupClear';
import { FOLLOW_UP_REASON, loadGroupClears, type GroupClearRecord } from '@/services/groupClearStore';
import { Button, Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { EnvelopeStatusBadge } from '@/components/expenses/CashEnvelopeDrawer';
import { SettlementBackHeader } from '../SettlementBackHeader';
import { GuideExpenseDetailDrawer } from '../../expenses/GuideExpenseDetailDrawer';
import { expenseOriginalTotals, requestedAtOf } from '../../expenses/expenseAmounts';
import type { ExpenseRequest } from '@/types';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { clearReadiness, receiptsBlockedReason, type ReadinessTone } from '@/lib/logic/clearReadiness';
import { appointmentStatusMeta } from '@/lib/labels';
import { RequestClearModal } from './RequestClearModal';
import type { Appointment } from '@/types';

const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ') || '—';

/** ป้ายผลสรุป "พร้อมเคลียร์หรือยัง" ของแต่ละกรุ๊ป (clearReadiness) */
const READINESS_BADGE: Record<ReadinessTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
};

export default function GuideSettlementClaimPage() {
  const { currentUser, expenses, envelopes, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());

  const groups = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    const mine = leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [];
    return [...new Set(mine.map((a) => a.periodId))]
      .map((id) => periodById.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((period) => {
        const receipts = expenses
          .filter((e) => e.jobId === period.internalId && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled')
          .sort((a, b) => requestedAtOf(b).localeCompare(requestedAtOf(a)));
        const perDiem = leaderId ? activeLeaderClaim(expenses, period.internalId, leaderId, 'per_diem') : null;
        const envs = envelopes.filter((e) => e.periodId === period.internalId && e.sealed).sort((a, b) => a.no - b.no);
        return { period, receipts, perDiem, envs };
      })
      // ออกเดินทางแล้ว หรือมีรายการแล้ว — กรุ๊ปที่ยังไม่ออกและยังไม่มีอะไรไม่ต้องตรวจ
      .filter((g) => tripStarted(g.period, today) || g.receipts.length > 0 || g.perDiem || g.envs.length > 0)
      .sort((a, b) => b.period.startDate.localeCompare(a.period.startDate));
  }, [leaderId, expenses, envelopes, today]);

  // เปิดค้างไว้ทีละกรุ๊ป — ค่าเริ่มต้น = กรุ๊ปล่าสุด
  const [openId, setOpenId] = useState<string | null>(() => groups[0]?.period.internalId ?? null);
  const [detail, setDetail] = useState<ExpenseRequest | null>(null);
  /** กรุ๊ปที่กำลังขอนัดเคลียร์เงิน */
  const [requestFor, setRequestFor] = useState<(typeof groups)[number]['period'] | null>(null);
  /** นัดเคลียร์เงินของกรุ๊ปที่ยังมีผล (ไม่นับที่ยกเลิก) — ล่าสุดก่อน */
  const clearAptOf = (periodId: string): Appointment | null => appointments
    .filter((a) => a.leaderId === leaderId && a.kind === 'clear' && a.jobId === periodId && a.status !== 'cancelled')
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0] ?? null;
  // ยอดค้างติดตามหลังเคลียร์ (localStorage — อ่านหลัง mount)
  const [clears, setClears] = useState<Record<string, GroupClearRecord>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setClears(loadGroupClears());
  }, []);
  /*
    ?period=<id> (จากปุ่ม "แก้ไขใบเสร็จ" ในหัวเรื่องหลังเดินทางของหน้าบัญชี-การเงิน) → เปิดกรุ๊ปนั้นแล้วเลื่อนไปให้เห็นทันที ไม่ต้องหาเอง
    อ่าน URL ฝั่ง client หลัง mount (หน้านี้ถูก prerender)
  */
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('period');
    if (!pid || !groups.some((g) => g.period.internalId === pid)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จาก URL ครั้งเดียวตอน mount
    setOpenId(pid);
    requestAnimationFrame(() => document.getElementById(`claim-${pid}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const followUps = groups.flatMap(({ period }) => (clears[period.internalId]?.followUps ?? []).filter(followUpOpen).map((f) => ({ f, period })));

  return (
    <div className="space-y-4">
      <SettlementBackHeader title="ตรวจสอบก่อนนัดเคลียร์เงิน" description="ดูว่าแต่ละกรุ๊ปมีค่าใช้จ่ายอะไรทำไปแล้วบ้าง และอยู่สถานะไหน — ครบแล้วนัดหมายเข้ามาเคลียร์เงิน" />

      {/* ยอดค้างติดตาม — หลังบริษัทปิดเคลียร์แบบมีค้าง */}
      {followUps.length > 0 && (
        <Card>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold zego-text">
            <Icon name="warning" className="h-4 w-4 text-rose-600" />ยอดค้างติดตามหลังเคลียร์เงิน
          </h2>
          <ul className="divide-y divide-[var(--zego-border-soft)] text-sm">
            {followUps.map(({ f, period }) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium zego-text">{period.groupCode}</span>
                  <span className="block text-xs zego-text-tertiary">{FOLLOW_UP_REASON[f.reason]}{f.note ? ` · ${f.note}` : ''}</span>
                </span>
                <span className={cx('shrink-0 text-right text-xs font-semibold tabular-nums', f.direction === 'leader_owes' ? 'zego-text-danger' : 'text-violet-700')}>
                  {f.direction === 'leader_owes' ? 'ต้องคืนบริษัท' : 'บริษัทค้างจ่ายคุณ'}
                  <span className="block text-sm">{formatCurrency(followUpRemaining(f), f.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs zego-text-tertiary">ชำระเป็นเงินสดหรือโอนที่ฝ่ายการเงิน · ยอดสกุลต่างประเทศชำระเป็นบาทได้ตามอัตราแลกเปลี่ยนวันที่ชำระ · ไม่หักจากเบี้ยเลี้ยง</p>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <p className="zego-border-color rounded-lg border border-dashed px-4 py-6 text-center text-sm zego-text-tertiary">
            ยังไม่มีกรุ๊ปที่ออกเดินทางแล้ว
          </p>
        </Card>
      ) : (
        groups.map(({ period, receipts, perDiem, envs }) => {
          const open = openId === period.internalId;
          // วันกลับนับเป็นจบทริป (ตรงกับการส่งอนุมัติเบี้ยเลี้ยง)
          const ended = tripEnded(period, today);
          // ผลสรุปเดียวของกรุ๊ป: ครบแล้ว / ยังไม่ครบ (ขาดอะไร) / ยังไม่ถึงขั้นเคลียร์
          const ready = clearReadiness({
            started: tripStarted(period, today),
            ended,
            startText: formatDate(period.startDate),
            endText: formatDate(period.endDate || period.startDate),
            envs,
            receipts,
            perDiem,
          });
          return (
            <div key={period.internalId} id={`claim-${period.internalId}`} className="scroll-mt-4">
            <Card padded={false}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : period.internalId)}
                className="flex w-full items-start gap-2 px-4 py-3 text-left zego-hover-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">{period.groupCode}</span>
                  <span className="block truncate text-xs zego-text-secondary">{period.displayName}</span>
                  <span className="block text-xs zego-text-tertiary">{formatDateRange(period.startDate, period.endDate)}</span>
                  <span className={cx('mt-0.5 block text-xs', ready.tone === 'amber' ? 'font-medium text-amber-800' : ready.tone === 'emerald' ? 'text-emerald-700' : 'zego-text-tertiary')}>
                    {ready.detail}
                  </span>
                </span>
                <span className={cx('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', READINESS_BADGE[ready.tone])}>
                  {ready.ready && <Icon name="check" className="h-3 w-3" />}
                  {/* นัดไปแล้ว ไม่ต้องชวนทำนัดซ้ำ */}
                  {ready.ready && clearAptOf(period.internalId) ? 'ครบแล้ว · นัดแล้ว' : ready.label}
                </span>
                <Icon name="chevronDown" className={cx('mt-0.5 h-4 w-4 shrink-0 zego-text-disabled transition', open && 'rotate-180')} />
              </button>

              {/* ครบแล้ว → ปุ่มทำนัดหมายเห็นได้ทันทีโดยไม่ต้องกางการ์ด · นัดแล้ว → บอกสถานะนัด */}
              {(() => {
                const apt = clearAptOf(period.internalId);
                if (apt) {
                  return (
                    <Link href="/guide/settlement/appointments" className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
                      <span>
                        <span className="font-semibold">นัดเคลียร์เงิน {formatDate(apt.date)} {apt.time} น.</span>
                        {' · '}{appointmentStatusMeta(apt).label}
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0" />
                    </Link>
                  );
                }
                return ready.ready ? (
                  <div className="px-4 pb-3">
                    <Button variant="primary" icon="calendar" className="w-full justify-center" onClick={() => setRequestFor(period)}>
                      ทำนัดหมายเคลียร์เงิน
                    </Button>
                  </div>
                ) : null;
              })()}

              {open && (
                <div className="space-y-3 zego-divider-top px-4 pb-4 pt-3">
                  {/* สรุป ✓/✗ ทีละเรื่อง — ดูแวบเดียวรู้ว่าขาดอะไร */}
                  <ul className="grid grid-cols-3 gap-1.5">
                    {ready.checks.map((c) => (
                      // เขียว = เรียบร้อย · ส้ม = ต้องทำ · เทา = ไม่เกี่ยวข้องกับกรุ๊ปนี้ (นับว่าผ่าน)
                      <li key={c.label} className={cx('rounded-lg px-2 py-1.5 text-center ring-1 ring-inset', c.na ? 'zego-surface-soft-bg ring-[var(--zego-border-soft)]' : c.ok ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200')}>
                        <span className={cx('flex items-center justify-center gap-1 text-xs font-semibold', c.na ? 'zego-text-tertiary' : c.ok ? 'text-emerald-800' : 'text-amber-800')}>
                          {!c.na && <Icon name={c.ok ? 'check' : 'warning'} className="h-3.5 w-3.5" />}
                          {c.label}
                        </span>
                        <span className={cx('block text-[11px] leading-tight', c.na ? 'zego-text-tertiary' : c.ok ? 'text-emerald-700' : 'text-amber-800')}>{c.text}</span>
                      </li>
                    ))}
                  </ul>

                  {/* 1) ซองเงินที่ได้รับ */}
                  <Section title="ซองเงิน" count={envs.length}>
                    {envs.length === 0 ? <Empty text="ไม่มีซองเงินของกรุ๊ปนี้" /> : envs.map((e) => (
                      <Row key={e.id} title={envelopeName(e)} sub={e.leaderAck ? `รับแล้ว ${formatDate(e.leaderAck.at)}` : undefined} amount={fmtTotals(e.sealed?.faceTotals ?? [])}>
                        <EnvelopeStatusBadge env={e} short />
                      </Row>
                    ))}
                  </Section>

                  {/* 2) ใบเสร็จค่าใช้จ่าย */}
                  <Section
                    title="ใบเสร็จค่าใช้จ่าย"
                    count={receipts.length}
                    action={receiptsBlockedReason(envs)
                      // ยังบันทึกไม่ได้ (ซองยังไม่ถึงมือ) — ปุ่มเป็นสีเทา บอกเหตุผล ตรงกับช่องเช็กด้านบน
                      ? <span className="text-xs zego-text-disabled" title={receiptsBlockedReason(envs) ?? undefined}>+ บันทึกใบเสร็จ · {receiptsBlockedReason(envs)}</span>
                      : <Link href={`/guide/expenses/record?period=${encodeURIComponent(period.internalId)}`} className="text-xs font-medium zego-text-info hover:underline">+ บันทึกใบเสร็จ</Link>}
                  >
                    {receipts.length === 0 ? <Empty text="ยังไม่ได้บันทึกใบเสร็จ" /> : receipts.map((r) => (
                      <Row
                        key={r.id}
                        onClick={() => setDetail(r)}
                        title={r.lines[0]?.purpose || r.lines[0]?.expenseType || r.id}
                        sub={`${r.id} · ${formatDate(requestedAtOf(r))}${r.lines.length > 1 ? ` · ${r.lines.length} รายการ` : ''}`}
                        amount={fmtTotals(expenseOriginalTotals(r))}
                      >
                        <StatusBadge meta={EXPENSE_STATUS[r.status]} size="sm" />
                      </Row>
                    ))}
                  </Section>

                  {/* 3) เอกสารค่าใช้จ่ายหัวหน้าทัวร์ (เบี้ยเลี้ยง) */}
                  <Section
                    title="เบี้ยเลี้ยง"
                    count={perDiem ? 1 : 0}
                    action={<Link href="/guide/settlement/allowance" className="text-xs font-medium zego-text-info hover:underline">{perDiem ? 'ไปที่เบิกเบี้ยเลี้ยง' : ended ? '+ ทำใบเบิก' : '+ ทำร่างไว้ก่อน'}</Link>}
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
                </div>
              )}
            </Card>
            </div>
          );
        })
      )}


      <GuideExpenseDetailDrawer expense={detail} onClose={() => setDetail(null)} />
      {requestFor && leaderId && <RequestClearModal period={requestFor} leaderId={leaderId} onClose={() => setRequestFor(null)} />}
    </div>
  );
}

function Section({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold zego-text-secondary">{title} <span className="font-normal zego-text-tertiary">({count})</span></p>
        {action}
      </div>
      <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">{children}</ul>
    </section>
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
