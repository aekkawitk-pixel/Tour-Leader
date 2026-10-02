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

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, EmptyState } from '@/components/ui/Primitives';
import { TextArea, TextInput } from '@/components/ui/FormField';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { MonthYearSelect, MonthHeader, useMonthGroups } from '@/components/ui/MonthFilter';
import { PhotoConfirmModal, ProofThumb } from '@/components/expenses/EnvelopeProofPhoto';
import { formatCurrency, formatDateRange, formatDateTime, toISODate, toISODateTime } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { envelopeName, envelopeStage, groupEnvelopeStatus, groupLines, returnedToFinanceBy, sumAmounts, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { EnvelopeStatusBadge, StatusPill } from '@/components/expenses/CashEnvelopeDrawer';

const fmt = (list: { amount: number; currency: string }[]) => list.map((f) => formatCurrency(f.amount, f.currency)).join(' · ');

export default function StaffEnvelopesPage() {
  const { currentUser, envelopes, expenses, saveEnvelope, leaders, noEnvelopeMarks } = useDemo();
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

  /*
    ทุกทอดต้องแนบรูปถ่ายหลักฐาน (photo) — กล่องยืนยันใน EnvelopeCard บังคับไว้แล้ว ที่นี่แค่บันทึกรูปคู่กับทอดนั้น
    กล่องยืนยันพร้อมรูปคือขั้นยืนยันแล้ว จึงไม่ถาม window.confirm ซ้ำอีกชั้น
  */
  const receive = async (env: CashEnvelope, photo: string) => {
    await saveEnvelope(
      { ...env, staffAck: { at: toISODateTime(new Date()), staffId, staffName: currentUser.name, photo } },
      'เจ้าหน้าที่ส่งกรุ๊ปยืนยันรับซอง',
      `${envelopeName(env)} · รับจากการเงิน${env.handover?.byName ? ` (${env.handover.byName})` : ''}`,
      photo,
    );
  };
  /**
   * หัวหน้าทัวร์ที่คอนเฟิร์มแล้วของกรุ๊ป ณ ตอนนี้ — อ่านใหม่ทุกครั้ง ไม่ใช้ชื่อที่ติดมากับการส่งมอบ
   * (ตอนการเงินส่งมอบอาจยังไม่มีหัวหน้าทัวร์ ชื่อในซองจึงเป็นแค่ "หัวหน้าทัวร์ของกรุ๊ป")
   */
  const leaderOf = (periodId: string) => {
    const a = loadActiveGuideAssignments().find((x) => x.periodId === periodId && x.assignmentStatus === 'CONFIRMED');
    const l = a ? leaders.find((x) => x.id === a.tourLeaderId) : undefined;
    return l ? { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() } : null;
  };

  /** ส่งต่อให้หัวหน้าทัวร์ของกรุ๊ป หรือคนอื่นที่มารับจริง (other) — ต้องมีหัวหน้าทัวร์ที่คอนเฟิร์มแล้วเสมอ */
  const passOn = async (env: CashEnvelope, photo: string, other?: { name: string; reason: string }) => {
    const leader = leaderOf(env.periodId);
    if (!leader) return;
    await saveEnvelope(
      {
        ...env,
        handover: other
          ? { ...env.handover!, receiverKind: 'other', receiverId: undefined, receiverName: other.name }
          : { ...env.handover!, receiverId: leader.id, receiverName: leader.name },
        staffHandoff: { at: toISODateTime(new Date()), staffName: currentUser.name, photo },
      },
      other ? 'เจ้าหน้าที่ส่งกรุ๊ปส่งต่อให้ผู้รับคนอื่น' : 'เจ้าหน้าที่ส่งกรุ๊ปส่งต่อให้หัวหน้าทัวร์',
      other
        ? `${envelopeName(env)} · ถึง ${other.name} (แทน ${leader.name}) · เหตุผล: ${other.reason}`
        : `${envelopeName(env)} · ถึง ${leader.name} · รอหัวหน้าทัวร์ยืนยันรับ`,
      photo,
    );
  };

  /** ติดปัญหาหน้างาน → ส่งซองคืนการเงิน (รอการเงินยืนยันรับคืน ซองยังไม่ถือว่ากลับถึงการเงินจนกว่าจะยืนยัน) */
  const giveBack = async (env: CashEnvelope, reason: string, photo: string) => {
    await saveEnvelope(
      { ...env, staffReturn: { at: toISODateTime(new Date()), staffId, staffName: currentUser.name, reason, photo } },
      'เจ้าหน้าที่ส่งกรุ๊ปส่งซองคืนการเงิน',
      `${envelopeName(env)} · เหตุผล: ${reason} · รอการเงินยืนยันรับคืน`,
      photo,
    );
  };

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
                      <GroupEnvelopeCard
                        key={r.key}
                        envs={r.envs}
                        leader={leaderOf(r.envs[0].periodId)}
                        onReceive={receive}
                        onPassOn={passOn}
                        onReturn={giveBack}
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
                                <p className="text-sm font-semibold zego-text">{p?.groupCode ?? g.periodId}</p>
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
                                <p className="text-sm font-semibold zego-text">{p?.groupCode ?? env.periodId} · {envelopeName(env)}</p>
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

/**
 * ซองที่ต้องส่งของกรุ๊ปเดียว (1 ซองหรือหลายซอง) ในการ์ดเดียว — หัวกรุ๊ปและขั้นตอนแสดงครั้งเดียว
 * ซองละ 1 แถวสั้น ๆ · ปุ่มยืนยันทำกับทุกซองที่อยู่ขั้นเดียวกันพร้อมกัน ด้วยรูปหลักฐานรูปเดียว (ถ่ายรวมทุกซอง)
 * แต่ละซองยังบันทึกประวัติ/รูปแยกของตัวเอง
 */
function GroupEnvelopeCard({
  envs,
  leader,
  onReceive,
  onPassOn,
  onReturn,
}: {
  envs: CashEnvelope[];
  /** หัวหน้าทัวร์ที่คอนเฟิร์มแล้วของกรุ๊ป — null = ยังไม่มี ส่งมอบไม่ได้ */
  leader: { id: string; name: string } | null;
  onReceive: (env: CashEnvelope, photo: string) => Promise<void>;
  onPassOn: (env: CashEnvelope, photo: string, other?: { name: string; reason: string }) => Promise<void>;
  onReturn: (env: CashEnvelope, reason: string, photo: string) => Promise<void>;
}) {
  const p = getTourPeriodById(envs[0].periodId);
  /** กล่องยืนยันที่เปิดอยู่ — ทุกทอดต้องแนบรูปถ่ายก่อนกดยืนยัน */
  const [mode, setMode] = useState<'receive' | 'handoff' | 'other' | 'return' | null>(null);
  const [otherName, setOtherName] = useState('');
  const [reason, setReason] = useState('');
  const allReceive = envs.filter((e) => envelopeStage(e) === 'handed_over' && !e.staffAck && !e.staffReturn);
  const allHolding = envs.filter((e) => !!e.staffAck && !e.staffHandoff && !e.staffReturn);
  /**
   * ซองที่ไม่เลือก (ทำบางซองได้ เช่น รับมาแค่ซองเดียว / คืนการเงินแค่ซองเดียว) — ค่าเริ่มต้นเลือกทุกซอง
   * เก็บเป็น "ที่ไม่เลือก" ซองที่เพิ่งเข้าขั้นนี้จึงถูกเลือกเองโดยไม่ต้องรีเซ็ต
   */
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => setUnpicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  // มีให้เลือกเฉพาะเมื่อขั้นเดียวกันมีมากกว่า 1 ซอง
  const pickable = (e: CashEnvelope) => (allReceive.length > 1 && allReceive.includes(e)) || (allHolding.length > 1 && allHolding.includes(e));
  const toReceive = allReceive.filter((e) => !unpicked.has(e.id));
  const holding = allHolding.filter((e) => !unpicked.has(e.id));
  const receiverName = leader?.name ?? envs[0].handover!.receiverName;
  const closeForm = () => { setMode(null); setOtherName(''); setReason(''); };
  /** ทำทีละซอง (บันทึกประวัติแยกของแต่ละซอง) แล้วปิดกล่อง */
  const runAll = async (list: CashEnvelope[], fn: (e: CashEnvelope) => Promise<void>) => {
    for (const e of list) await fn(e);
    closeForm();
  };
  const many = (list: CashEnvelope[]) => (list.length > 1 ? ` ${list.length} ซอง` : '');
  const summary = (list: CashEnvelope[]) => list.map((e) => `${envelopeName(e)} · ${fmt(e.sealed?.faceTotals ?? [])}`).join(' | ');
  const total = fmt(sumAmounts(envs.flatMap((e) => e.sealed?.faceTotals ?? [])));
  const h0 = envs[0].handover!;

  return (
    <li>
      <Card className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold zego-text">{p?.groupCode ?? envs[0].periodId}</p>
            <p className="line-clamp-1 text-xs zego-text-secondary">{p?.displayName}</p>
            {p && <p className="text-xs zego-text-tertiary">เดินทาง {formatDateRange(p.startDate, p.endDate)}</p>}
          </div>
          {envs.length === 1 ? <EnvelopeStatusBadge env={envs[0]} short /> : <StatusPill label={`${envs.length} ซอง`} tone="violet" />}
        </div>

        {/* ซองละแถว — ชื่อ ยอด สถานะ รูปหลักฐานของแต่ละทอด */}
        <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg zego-surface-soft-bg text-xs">
          {envs.map((env) => (
            <li key={env.id} className="space-y-0.5 px-3 py-2">
              {pickable(env) ? (
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" checked={!unpicked.has(env.id)} onChange={() => togglePick(env.id)} />
                    <span className="truncate font-semibold zego-text">{envelopeName(env)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums zego-text">{fmt(env.sealed?.faceTotals ?? [])}</span>
                </label>
              ) : (
                <p className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold zego-text">{envelopeName(env)}</span>
                  <span className="shrink-0 font-semibold tabular-nums zego-text">{fmt(env.sealed?.faceTotals ?? [])}</span>
                </p>
              )}
              {envs.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <EnvelopeStatusBadge env={env} short />
                  <span className="flex items-center gap-1">
                    <ProofThumb src={env.staffAck?.photo} label={`รับซองจากการเงิน · ${envelopeName(env)}`} />
                    <ProofThumb src={env.staffHandoff?.photo} label={`ส่งต่อให้ ${env.handover!.receiverName} · ${envelopeName(env)}`} />
                  </span>
                </div>
              )}
              {envs.length === 1 && (env.staffAck || env.staffHandoff) && (
                <span className="flex items-center gap-1">
                  <ProofThumb src={env.staffAck?.photo} label={`รับซองจากการเงิน · ${envelopeName(env)}`} />
                  <ProofThumb src={env.staffHandoff?.photo} label={`ส่งต่อให้ ${env.handover!.receiverName} · ${envelopeName(env)}`} />
                </span>
              )}
              {env.staffReturn && (
                <div className="flex items-start justify-between gap-2 text-amber-900">
                  <p>ส่งคืนการเงิน {formatDateTime(env.staffReturn.at)} — รอการเงินยืนยันรับคืน (เหตุผล: {env.staffReturn.reason})</p>
                  <ProofThumb src={env.staffReturn.photo} label={`ส่งซองคืนการเงิน · ${envelopeName(env)}`} />
                </div>
              )}
              {env.staffHandoff && (
                <p style={{ color: '#5b21b6' }}>
                  {env.handover!.receiverKind === 'other'
                    ? `ส่งให้ ${env.handover!.receiverName} แล้ว — รอหัวหน้าทัวร์ยืนยันรับ`
                    : `รอ ${env.handover!.receiverName} ยืนยันรับในเครื่องของตัวเอง`}
                </p>
              )}
            </li>
          ))}
          {envs.length > 1 && (
            <li className="flex justify-between gap-2 px-3 py-1.5 font-semibold zego-text">
              <span>รวม</span>
              <span className="tabular-nums">{total}</span>
            </li>
          )}
        </ul>

        <p className="text-xs zego-text-secondary">
          ส่งให้หัวหน้าทัวร์: <span className="font-medium zego-text">{leader ? leader.name : 'ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม'}</span>
          <span className="zego-text-tertiary"> · การเงินฝากให้คุณ {formatDateTime(h0.at)}{h0.byName ? ` โดย ${h0.byName}` : ''}</span>
        </p>
        {/* ขั้นตอนบรรทัดเดียว — สถานะของแต่ละซองบอกแล้วว่าถึงขั้นไหน */}
        <p className="text-[11px] zego-text-tertiary">รับซองจากการเงิน → ส่งต่อให้หัวหน้าทัวร์ → หัวหน้าทัวร์ยืนยันรับในเครื่องของตัวเอง</p>

        {(allReceive.length > 1 || allHolding.length > 1) && (
          <p className="text-[11px] zego-text-tertiary">ติ๊กเลือกซองที่จะทำรายการ — ทำบางซองก่อนได้ ที่เหลือทำทีหลัง</p>
        )}
        {allReceive.length > 0 && (
          <Button variant="primary" className="w-full" icon="camera" disabled={toReceive.length === 0} onClick={() => setMode('receive')}>
            {toReceive.length === 0 ? 'เลือกซองที่ได้รับก่อน' : `ยืนยันรับซองจากการเงิน${many(toReceive)} (แนบรูป)`}
          </Button>
        )}
        {/* ถือซองอยู่ — ส่งมอบได้เมื่อกรุ๊ปมีหัวหน้าทัวร์ที่คอนเฟิร์มแล้วเท่านั้น */}
        {allHolding.length > 0 && !leader && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            กรุ๊ปนี้ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม — ยังส่งมอบไม่ได้ ติดต่อผู้จัดสเก็ต หรือส่งซองคืนการเงิน
          </p>
        )}
        {allHolding.length > 0 && (
          <div className="space-y-2">
            <Button variant="primary" className="w-full" icon="camera" disabled={!leader || holding.length === 0} onClick={() => setMode('handoff')}>
              {holding.length === 0 ? 'เลือกซองที่จะส่งมอบก่อน' : leader ? `ส่งมอบ${many(holding)}ให้ ${leader.name} (แนบรูป)` : 'ส่งมอบให้หัวหน้าทัวร์'}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1 justify-center" disabled={!leader || holding.length === 0} onClick={() => setMode('other')}>
                ผู้รับไม่ใช่คนที่กำหนด
              </Button>
              <Button variant="secondary" size="sm" className="flex-1 justify-center" disabled={holding.length === 0} onClick={() => setMode('return')}>
                ส่งซองคืนการเงิน
              </Button>
            </div>
          </div>
        )}

        {/* กล่องยืนยันของแต่ละทอด — ต้องแนบรูปถ่ายก่อนจึงกดยืนยันได้ · ทำกับทุกซองในขั้นเดียวกัน */}
        {mode === 'receive' && (
          <PhotoConfirmModal
            title={`ยืนยันรับซองจากการเงิน${many(toReceive)}`}
            description={summary(toReceive)}
            confirmLabel="ยืนยันรับซอง"
            photoHint={toReceive.length > 1 ? 'ถ่ายรูปซองทั้งหมดที่ได้รับรวมกัน ให้เห็นหน้าซองและยอดเงินชัดเจน' : 'ถ่ายรูปซองที่ได้รับ ให้เห็นหน้าซองและยอดเงินชัดเจน'}
            onClose={closeForm}
            onConfirm={(photo) => runAll(toReceive, (e) => onReceive(e, photo))}
          />
        )}
        {mode === 'handoff' && leader && (
          <PhotoConfirmModal
            title={`ส่งมอบซอง${many(holding)}ให้ ${leader.name}`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งมอบ"
            photoHint="ถ่ายรูปหัวหน้าทัวร์คู่กับซอง ณ จุดส่งมอบ"
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onPassOn(e, photo))}
          />
        )}
        {mode === 'other' && (
          <PhotoConfirmModal
            title={`ส่งมอบให้ผู้รับคนอื่น (แทน ${receiverName})`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งมอบ"
            photoHint="ถ่ายรูปผู้รับจริงคู่กับซอง ณ จุดส่งมอบ"
            canConfirm={!!otherName.trim() && !!reason.trim()}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onPassOn(e, photo, { name: otherName.trim(), reason: reason.trim() }))}
          >
            <TextInput label="ชื่อผู้รับจริง" required value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="ชื่อ-นามสกุล ผู้ที่รับซอง" />
            <TextArea label="เหตุผล" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น หัวหน้าทัวร์ฝากเพื่อนร่วมทีมรับแทน" />
          </PhotoConfirmModal>
        )}
        {mode === 'return' && (
          <PhotoConfirmModal
            title={`ส่งซองคืนการเงิน${many(holding)}`}
            description={summary(holding)}
            confirmLabel="ยืนยันส่งคืน"
            photoHint="ถ่ายรูปซองตอนส่งคืน ให้เห็นหน้าซองชัดเจน"
            canConfirm={!!reason.trim()}
            onClose={closeForm}
            onConfirm={(photo) => runAll(holding, (e) => onReturn(e, reason.trim(), photo))}
          >
            <TextArea label="เหตุผล" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น กรุ๊ปเลื่อนเดินทาง / ไม่พบหัวหน้าทัวร์ที่สนามบิน" />
          </PhotoConfirmModal>
        )}
      </Card>
    </li>
  );
}
