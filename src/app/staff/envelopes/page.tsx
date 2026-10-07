'use client';

/**
 * ซองเงินที่ต้องส่ง — /staff/envelopes (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * หลักการถือเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → (ส่งแลนด์ | ใช้ตามรายการ)
 * เจ้าหน้าที่เห็นเฉพาะซองที่การเงินฝากตัวเองไปส่ง (handover.proxyStaffId = รหัสของตัวเอง):
 *   1) ยืนยันรับซองจากการเงิน (ในเครื่องของตัวเอง = หลักฐานทอดที่สอง)
 *   2) ส่งมอบให้หัวหน้าทัวร์แล้ว → หัวหน้าทัวร์ยืนยันรับในเครื่องของตัวเอง (ทอดสุดท้าย)
 * และกรุ๊ปที่ได้รับมอบหมายให้ส่ง ซึ่งซองยังไม่ถึงมือ (ดูได้ว่าการเงินจัดถึงไหนแล้ว)
 */

import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { MonthYearSelect, MonthHeader, useMonthGroups } from '@/components/ui/MonthFilter';
import { formatDateRange, formatDateTime, toISODate } from '@/lib/format';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { envelopeName, groupEnvelopeStatus, groupLines, returnedToFinanceBy, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { EnvelopeStatusBadge, StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { CarrierEnvelopeCard, useCarrierActions } from '@/components/expenses/CarrierEnvelopeCard';

export default function StaffEnvelopesPage() {
  const { currentUser, envelopes, expenses, noEnvelopeMarks } = useDemo();
  // วันอ้างอิงเดียวกับหน้าตารางงาน (useStaffPortal) — ปีเริ่มต้นของตัวเลือกปีจะได้ตรงกันทั้งพอร์ทัล
  const today = toISODate(new Date());
  const staffId = currentUser.sendOffStaffId ?? '';

  const mine = envelopes.filter((e) => staffId && e.handover?.proxyStaffId === staffId);
  const todo = mine.filter((e) => !e.leaderAck).sort((a, b) => a.handover!.at.localeCompare(b.handover!.at));
  const done = mine.filter((e) => e.leaderAck).sort((a, b) => b.leaderAck!.at.localeCompare(a.leaderAck!.at));

  // กรุ๊ปที่ได้รับมอบหมายให้ส่ง และมีเอกสารเบิก แต่ยังไม่มีซองฝากมาที่ตัวเอง
  const waiting = useMemo(() => {
    if (!staffId) return [];
    const periodIds = [...new Set(loadSendOffAssignments().filter((a) => a.staffId === staffId).map((a) => a.periodId))];
    return periodIds
      .map((periodId) => {
        const docs = expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === periodId);
        const envs = envelopes.filter((e) => e.periodId === periodId);
        return { periodId, docs, envs, status: groupEnvelopeStatus(groupLines(docs), envs, noEnvelopeMarks.find((m) => m.periodId === periodId)) };
      })
      .filter((g) => g.docs.length > 0 && !g.envs.some((e) => e.handover?.proxyStaffId === staffId));
  }, [staffId, expenses, envelopes, noEnvelopeMarks]);

  /*
    แบ่งรายเดือนตาม "วันเดินทางของกรุ๊ป" — ซองต้องถึงมือหัวหน้าทัวร์ก่อนกรุ๊ปออก จึงจัดตามเดือนที่กรุ๊ปเดินทาง
    ในแต่ละเดือนเรียง: ซองที่ต้องส่ง → กรุ๊ปที่ซองยังไม่ถึงมือ → ส่งถึงหัวหน้าทัวร์แล้ว · เดือนใกล้สุดก่อน
  */
  // ซองที่ต้องส่งของกรุ๊ปเดียวกันรวมเป็นการ์ดเดียว (หัวกรุ๊ป/ขั้นตอนแสดงครั้งเดียว · ยืนยันพร้อมกันได้)
  const todoGroups = [...todo.reduce((m, e) => m.set(e.periodId, [...(m.get(e.periodId) ?? []), e]), new Map<string, CashEnvelope[]>())]
    .map(([periodId, envs]) => ({ periodId, envs: envs.sort((a, b) => a.no - b.no) }));
  type Row = { key: string; kind: 'todo' | 'waiting' | 'done'; date: string; env?: CashEnvelope; envs?: CashEnvelope[]; group?: (typeof waiting)[number] };
  const startOf = (periodId: string) => getTourPeriodById(periodId)?.startDate ?? '';
  const KIND_ORDER = { todo: 0, waiting: 1, done: 2 } as const;
  const rows: Row[] = [
    ...todoGroups.map((g) => ({ key: `t-${g.periodId}`, kind: 'todo' as const, date: startOf(g.periodId), envs: g.envs })),
    ...waiting.map((g) => ({ key: `w-${g.periodId}`, kind: 'waiting' as const, date: startOf(g.periodId), group: g })),
    ...done.map((env) => ({ key: env.id, kind: 'done' as const, date: startOf(env.periodId), env })),
  ].sort((a, b) => (a.date.slice(0, 7).localeCompare(b.date.slice(0, 7))) || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || a.date.localeCompare(b.date));
  const monthGroups = useMonthGroups(rows, (r) => r.date, today);

  // การกระทำของผู้ถือซอง (รับ / ส่งต่อ / ฝากต่อ / ส่งคืน) — ใช้ร่วมกับหัวหน้าทัวร์ฝากส่ง (CarrierEnvelopeCard)
  const { leaderOf, relayTargetsFor, receive, passOn, relay, giveBack } = useCarrierActions({ kind: 'staff', id: staffId, name: currentUser.name });

  if (!staffId) {
    return <Card><EmptyState icon="warning" title="บัญชีนี้ยังไม่ผูกกับทะเบียนเจ้าหน้าที่ส่งกรุ๊ป" description="ติดต่อผู้ดูแลระบบให้ผูกรหัส SOS ก่อนใช้งาน" /></Card>;
  }

  const hasAny = rows.length > 0;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">ซองเงินที่ต้องส่ง</h1>
        <p className="text-xs zego-text-tertiary">รับซองจากการเงิน → ส่งต่อให้หัวหน้าทัวร์ · ยืนยันทุกขั้นในเครื่องของคุณเอง</p>
      </div>

      <MonthYearSelect groups={monthGroups} />

      {todo.length === 0 && (
        <Card>
          <EmptyState icon="money" title="ยังไม่มีซองที่ต้องส่ง" description="เมื่อการเงินฝากซองให้คุณนำไปส่งหัวหน้าทัวร์ รายการจะขึ้นที่นี่" />
        </Card>
      )}

      {hasAny && (
        <div className="space-y-5">
          {monthGroups.shown.map((m) => {
            const mTodo = m.items.filter((r) => r.kind === 'todo');
            const mWaiting = m.items.filter((r) => r.kind === 'waiting');
            const mDone = m.items.filter((r) => r.kind === 'done');
            return (
              <section key={m.key} aria-label={m.label} className="space-y-2">
                <MonthHeader label={m.label} count={mTodo.reduce((n, r) => n + (r.envs?.length ?? 0), 0)} unit="ซองที่ต้องส่ง" />

                {mTodo.length > 0 && (
                  <ul className="space-y-3">
                    {mTodo.map((r) => r.envs && (
                      <CarrierEnvelopeCard
                        key={r.key}
                        envs={r.envs}
                        leader={leaderOf(r.envs[0].periodId)}
                        onReceive={receive}
                        onPassOn={passOn}
                        onReturn={giveBack}
                        relayTargets={relayTargetsFor(r.envs[0].periodId)}
                        onRelay={relay}
                      />
                    ))}
                  </ul>
                )}

                {mWaiting.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="px-1 text-xs font-semibold zego-text-secondary">กรุ๊ปที่คุณได้รับมอบหมาย — ซองยังไม่ถึงมือ</h3>
                    <ul className="space-y-2">
                      {mWaiting.map((r) => {
                        const g = r.group!;
                        const p = getTourPeriodById(g.periodId);
                        // คนนี้ส่งซองคืนการเงินไปแล้ว (การเงินรับคืนแล้ว) — บอกสถานะจริง ไม่ใช่แค่ "รอส่งมอบ"
                        const returned = g.envs
                          .map((e) => returnedToFinanceBy(e, { id: staffId, name: currentUser.name }))
                          .find(Boolean);
                        return (
                          <li key={r.key}>
                            <Card className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold zego-text">{p?.groupCode ?? periodCodeOf(g.periodId)}</p>
                                {returned
                                  ? <StatusPill label="ส่งคืนการเงินแล้ว" tone="amber" />
                                  : <StatusPill label={g.status.stage === 'handed_over' || g.status.stage === 'received' ? 'ส่งมอบทางอื่นแล้ว' : g.status.label} tone={g.status.tone} />}
                              </div>
                              <p className="line-clamp-1 text-xs zego-text-secondary">{p?.displayName}</p>
                              {p && <p className="text-xs zego-text-tertiary">เดินทาง {formatDateRange(p.startDate, p.endDate)}</p>}
                              {g.status.stage === 'none' && (
                                <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">ไม่มีซองเงินให้รับ — {g.status.awaiting}</p>
                              )}
                              {returned && (
                                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  ส่งคืน {formatDateTime(returned.at)} · การเงินรับคืนแล้ว {formatDateTime(returned.receivedAt)}
                                  {returned.reason ? ` · เหตุผล: ${returned.reason}` : ''}
                                </p>
                              )}
                            </Card>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {mDone.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="px-1 text-xs font-semibold zego-text-secondary">ส่งถึงหัวหน้าทัวร์แล้ว</h3>
                    <ul className="space-y-2">
                      {mDone.map((r) => {
                        const env = r.env!;
                        const p = getTourPeriodById(env.periodId);
                        return (
                          <li key={r.key}>
                            <Card className="space-y-0.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold zego-text">{p?.groupCode ?? periodCodeOf(env.periodId)} · {envelopeName(env)}</p>
                                <EnvelopeStatusBadge env={env} short />
                              </div>
                              <p className="zego-text-secondary">{env.leaderAck!.leaderName} ยืนยันรับแล้ว · {formatDateTime(env.leaderAck!.at)}</p>
                            </Card>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
