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
import { Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { EnvelopeStatusBadge } from '@/components/expenses/CashEnvelopeDrawer';
import { SettlementBackHeader } from '../SettlementBackHeader';
import { GuideExpenseDetailDrawer } from '../../expenses/GuideExpenseDetailDrawer';
import { expenseOriginalTotals, requestedAtOf } from '../../expenses/expenseAmounts';
import type { ExpenseRequest } from '@/types';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';

const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ') || '—';

/** สรุปสถานะรวมของกรุ๊ป — ดูจากใบเสร็จ + ใบเบิกเบี้ยเลี้ยง (ร้ายแรงสุดขึ้นก่อน) */
function groupSummary(docs: ExpenseRequest[]): { label: string; cls: string } {
  if (docs.length === 0) return { label: 'ยังไม่มีรายการ', cls: 'bg-slate-100 text-slate-600' };
  if (docs.some((d) => d.status === 'revise')) return { label: 'มีรายการต้องแก้ไข', cls: 'bg-amber-100 text-amber-800' };
  if (docs.some((d) => d.status === 'rejected')) return { label: 'มีรายการไม่อนุมัติ', cls: 'bg-rose-50 text-rose-700' };
  if (docs.some((d) => d.status === 'draft')) return { label: 'มีร่างยังไม่ส่ง', cls: 'bg-slate-100 text-slate-700' };
  if (docs.some((d) => d.status === 'submitted')) return { label: 'รอบัญชีตรวจ', cls: 'bg-violet-50 text-violet-700' };
  if (docs.every((d) => d.status === 'paid')) return { label: 'จ่ายครบแล้ว', cls: 'bg-emerald-100 text-emerald-800' };
  return { label: 'อนุมัติแล้ว', cls: 'bg-sky-50 text-sky-700' };
}

export default function GuideSettlementClaimPage() {
  const { currentUser, expenses, envelopes } = useDemo();
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
          const docs = [...receipts, ...(perDiem ? [perDiem] : [])];
          const sum = groupSummary(docs);
          // วันกลับนับเป็นจบทริป (ตรงกับการส่งอนุมัติเบี้ยเลี้ยง)
          const ended = tripEnded(period, today);
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
                  <span className="block text-xs zego-text-tertiary">
                    {formatDateRange(period.startDate, period.endDate)}{ended ? '' : ' · กำลังเดินทาง'}
                    {' · '}ซอง {envs.length} · ใบเสร็จ {receipts.length} · เบี้ยเลี้ยง {perDiem ? 1 : 0}
                  </span>
                </span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', sum.cls)}>{sum.label}</span>
                <Icon name="chevronDown" className={cx('mt-0.5 h-4 w-4 shrink-0 zego-text-disabled transition', open && 'rotate-180')} />
              </button>

              {open && (
                <div className="space-y-3 zego-divider-top px-4 pb-4 pt-3">
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
                    action={<Link href={`/guide/expenses/record?period=${encodeURIComponent(period.internalId)}`} className="text-xs font-medium zego-text-info hover:underline">+ บันทึกใบเสร็จ</Link>}
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
                    action={<Link href="/guide/settlement/allowance" className="text-xs font-medium zego-text-info hover:underline">{perDiem ? 'ไปที่เบิกเบี้ยเลี้ยง' : '+ ทำใบเบิก'}</Link>}
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

      {/* ขั้นถัดไป — ทำรายการครบแล้ว นัดหมายเข้ามาเคลียร์เงินกับบัญชี */}
      {groups.length > 0 && (
        <Link href="/guide/settlement/appointments" className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm zego-hover-surface">
          <span className="min-w-0">
            <span className="block font-semibold text-emerald-800">ขั้นถัดไป: นัดหมายเคลียร์เงิน</span>
            <span className="block text-xs text-emerald-700">การเงินตรวจครบแล้วจะนัดเข้ามาเคลียร์เงิน — ดูนัดและยืนยันได้ที่นี่</span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-emerald-700" />
        </Link>
      )}

      <GuideExpenseDetailDrawer expense={detail} onClose={() => setDetail(null)} />
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
