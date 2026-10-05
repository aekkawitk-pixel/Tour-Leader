'use client';

/**
 * ซองเงินรอรับ — หน้าหลักหัวหน้าทัวร์ · รายการย่อ 1 กรุ๊ป = 1 บรรทัด กดขยายทีละกรุ๊ป
 *
 * - เรียงตามวันออกเดินทาง (ต้องรับก่อนอยู่บน) · แสดงไม่เกิน 4 กรุ๊ป ที่เหลือ "ดูทั้งหมด" → บัญชี-การเงิน แท็บก่อนเดินทาง
 * - เจ้าหน้าที่ส่งกรุ๊ปยังไม่ได้รับซองจากการเงิน = ขั้นตอนยังมาไม่ถึง → แสดงสถานะอย่างเดียว ไม่มีช่องติ๊ก/ปุ่ม
 * - ติ๊กเลือกซองที่ได้รับ (ค่าเริ่มต้นเลือกทุกซอง) → "ยืนยันรับ N ซอง" — รับได้ทั้งซองที่ถึงมือแล้ว และซองที่ยังระหว่างทาง
 *   (หน้างานอาจฝากคนอื่นนำมาให้ระหว่างเดินทาง · ประวัติบันทึกว่ารับก่อนเจ้าหน้าที่กดส่งต่อ)
 * - เดินทางกลับแล้วยังไม่ได้รับ → "แจ้งไม่ได้รับซอง" (ซองที่เลือก + เหตุผล) การเงินเห็นเป็นสถานะแดงทันที
 * - ป้ายสถานะ: ถึงมือแล้ว · ระหว่างทาง · แจ้งไม่ได้รับแล้ว
 */

import Link from 'next/link';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { EnvelopeRouteTag } from '@/components/expenses/CashEnvelopeDrawer';
import { ACK_BEFORE_HANDOFF_NOTE, carrierOf, carrierTitle, depositedViaGroup, envelopeName, leaderCanAck, leaderEnvelopeState, sumAmounts, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { formatCurrency, formatDate, formatDateTime, toISODate, toISODateTime } from '@/lib/format';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';

const MAX_ROWS = 4;
const fmt = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ');
/** คนที่ถือซองมาให้ = ผู้รับแทน (ถ้ามี) หรือเจ้าหน้าที่ที่ระบุไว้ */
const fromStaffOf = (env: CashEnvelope) => env.handover?.proxyName ?? (env.handover?.receiverKind === 'staff' ? env.handover.receiverName : undefined);

export function EnvelopeAckList() {
  const { envelopes, saveEnvelope, currentUser, leaders } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);
  const leaderName = leader ? `${leader.firstName} ${leader.lastName}`.trim() : currentUser.name;
  const today = toISODate(new Date());

  const groups = [...new Set(envelopes.filter((e) => leaderEnvelopeState(e, leaderId)).map((e) => e.periodId))]
    .map((periodId) => {
      const envs = envelopes.filter((e) => e.periodId === periodId && leaderEnvelopeState(e, leaderId)).sort((a, b) => a.no - b.no);
      const period = getTourPeriodById(periodId);
      return {
        periodId,
        period,
        envs,
        // ถึงมือแล้ว — ใช้กับป้ายสถานะเท่านั้น · กดรับได้ทุกซอง
        arrived: envs.filter((e) => leaderEnvelopeState(e, leaderId) === 'to_ack'),
        // ซองที่กดรับได้ (ออกจากการเงินแล้ว) — ยังอยู่การเงินกดไม่ได้
        ackable: envs.filter((e) => leaderCanAck(e, leaderId)),
        reported: envs.filter((e) => e.notReceived),
        // แจ้งไม่ได้รับได้เมื่อเดินทางกลับแล้ว (เลยวันกลับ)
        returned: !!period && period.endDate < today,
        totals: sumAmounts(envs.flatMap((e) => e.sealed?.faceTotals ?? [])),
      };
    })
    .sort((a, b) => (a.period?.startDate ?? '9').localeCompare(b.period?.startDate ?? '9'));

  // เปิดค้างไว้ 1 กรุ๊ป — ค่าเริ่มต้นเป็นกรุ๊ปที่ออกเดินทางก่อนสุด
  const [openId, setOpenId] = useState<string | null>(() => groups[0]?.periodId ?? null);
  /** ซองที่ไม่ได้ติ๊ก (ค่าเริ่มต้นเลือกทุกซอง — ซองใหม่ที่เพิ่งเข้ามาถูกเลือกเอง) */
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => setUnpicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const pickedOf = (envs: CashEnvelope[]) => envs.filter((e) => !unpicked.has(e.id) && leaderCanAck(e, leaderId));

  const [action, setAction] = useState<{ kind: 'ack' | 'report'; periodId: string } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const target = action ? groups.find((g) => g.periodId === action.periodId) : undefined;
  const targetEnvs = target ? pickedOf(action!.kind === 'report' ? target.envs.filter((e) => !e.notReceived) : target.envs) : [];
  const close = () => { setAction(null); setNote(''); };

  const run = async (fn: (env: CashEnvelope) => Promise<unknown>) => {
    setSaving(true);
    try {
      for (const env of targetEnvs) await fn(env);
      close();
    } finally {
      setSaving(false);
    }
  };
  const accept = () => run((env) => {
    const fromStaff = fromStaffOf(env);
    return saveEnvelope(
      { ...env, leaderAck: { at: toISODateTime(new Date()), leaderId: leaderId ?? '', leaderName, ...(fromStaff ? { fromStaffName: fromStaff } : {}) } },
      'หัวหน้าทัวร์ยืนยันรับซอง',
      `${envelopeName(env)}${fromStaff ? ` · รับต่อจาก ${fromStaff}` : ''}${leaderEnvelopeState(env, leaderId) === 'in_transit' ? ` · ${ACK_BEFORE_HANDOFF_NOTE}` : ''}`,
    );
  });
  const report = () => run((env) => saveEnvelope(
    { ...env, notReceived: { at: toISODateTime(new Date()), byName: leaderName, note: note.trim() } },
    'หัวหน้าทัวร์แจ้งไม่ได้รับซอง',
    `${envelopeName(env)} · ${fmt(env.sealed?.faceTotals ?? [])} · ${note.trim()}`,
  ));

  if (groups.length === 0) return null;
  const shown = groups.slice(0, MAX_ROWS);

  return (
    <Card padded={false}>
      <div className="zego-divider-bottom flex items-center justify-between gap-2 px-4 py-2.5">
        <p className="text-sm font-semibold zego-text">ซองเงินรอรับ · {groups.length} กรุ๊ป</p>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">รอรับ {groups.reduce((n, g) => n + g.envs.length, 0)} ซอง</span>
      </div>
      <ul className="divide-y divide-[var(--zego-border-soft)]">
        {shown.map((g) => {
          const open = openId === g.periodId;
          const isReady = g.arrived.length > 0;
          // ทั้งกรุ๊ปยังอยู่ที่การเงิน (เจ้าหน้าที่ยังไม่รับ) — ขั้นตอนยังมาไม่ถึง
          const waitingFinance = g.ackable.length === 0 && g.reported.length === 0;
          const allReported = g.reported.length === g.envs.length;
          const picked = pickedOf(g.envs);
          const pickedReportable = picked.filter((e) => !e.notReceived);
          return (
            <li key={g.periodId}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : g.periodId)}
                aria-expanded={open}
                className={cx('flex w-full items-center gap-2 px-4 py-2.5 text-left', isReady ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'zego-hover-surface')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm zego-text">
                    <span className="font-semibold">{g.period?.groupCode ?? g.periodId}</span> · {g.envs.length} ซอง
                  </span>
                  {/* มีซองฝากมากับกรุ๊ปอื่น — บรรทัดเดียวใต้รหัสกรุ๊ป */}
                  {(() => {
                    const n = g.envs.filter((e) => depositedViaGroup(e, g.period?.groupCode)).length;
                    return n > 0 ? <span className="block truncate text-[11px] font-semibold text-amber-700">ซองหลัก {g.envs.length - n} · ซองฝาก {n}</span> : null;
                  })()}
                  <span className="block text-xs zego-text-tertiary">
                    {g.period ? `ออก ${formatDate(g.period.startDate)} · ` : ''}{fmt(g.totals)}
                  </span>
                </span>
                <span className={cx(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  allReported ? 'bg-rose-50 text-rose-700' : isReady ? 'bg-emerald-100 text-emerald-800' : waitingFinance ? 'bg-slate-100 text-slate-600' : 'bg-violet-50 text-violet-700',
                )}>
                  {allReported ? 'แจ้งไม่ได้รับแล้ว' : isReady ? (g.arrived.length < g.envs.length ? `ถึงมือแล้ว ${g.arrived.length}/${g.envs.length}` : 'ถึงมือแล้ว') : waitingFinance ? 'ยังไม่ออกเดินทาง' : 'ระหว่างทาง'}
                </span>
                <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 zego-text-disabled transition', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="space-y-2 zego-surface-soft-bg px-4 pb-3 pt-2">
                  {g.period && <p className="text-xs zego-text-secondary">{g.period.displayName}</p>}
                  {/* ติ๊กเลือกซองที่ได้รับ — รับบางซองก่อนได้ */}
                  <ul className="space-y-1.5">
                    {g.envs.map((env) => {
                      const state = leaderEnvelopeState(env, leaderId);
                      const can = leaderCanAck(env, leaderId);
                      return (
                        <li key={env.id}>
                          <label className={cx('flex items-start gap-2 text-xs', can ? 'cursor-pointer' : 'cursor-default')}>
                            {/* ยังอยู่ที่การเงิน — ไม่มีช่องติ๊ก (เว้นที่ไว้ให้แถวตรงกัน) */}
                            {can
                              ? <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" checked={!unpicked.has(env.id)} onChange={() => togglePick(env.id)} />
                              : <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium zego-text">{envelopeName(env)}</span>
                                <EnvelopeRouteTag env={env} groupCode={g.period?.groupCode} />
                              </span>
                              <span className={cx('block', state === 'to_ack' ? 'text-emerald-700' : state === 'not_received' ? 'text-rose-700' : state === 'at_finance' ? 'zego-text-tertiary' : 'text-violet-700')}>
                                {state === 'not_received'
                                  ? `แจ้งไม่ได้รับแล้ว · ${formatDateTime(env.notReceived!.at)} · ${env.notReceived!.note}`
                                  : state === 'to_ack'
                                    ? `ถึงมือคุณแล้ว${fromStaffOf(env) ? ` · จาก ${fromStaffOf(env)}` : ''}`
                                    : state === 'at_finance'
                                      ? `รอ${carrierTitle(carrierOf(env.handover)?.kind ?? 'staff')} ${env.handover?.proxyName ?? ''} รับซอง`
                                      : `${carrierTitle(carrierOf(env.handover)?.kind ?? 'staff')} ${env.handover?.proxyName ?? ''} กำลังนำมาส่ง`}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums zego-text">{fmt(env.sealed?.faceTotals ?? [])}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {g.ackable.length === 0 ? (
                    // ขั้นตอนยังมาไม่ถึง — ไม่มีปุ่มให้กด
                    <p className="rounded-lg bg-slate-100 px-3 py-2 text-center text-xs zego-text-secondary">
                      ซองยังไม่ออกจากผู้ฝากส่ง — กดรับได้เมื่อผู้ถือซองกดรับซองแล้ว
                    </p>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="check"
                      className="w-full justify-center"
                      disabled={picked.length === 0}
                      onClick={() => setAction({ kind: 'ack', periodId: g.periodId })}
                    >
                      {picked.length === 0 ? 'เลือกซองที่ได้รับก่อน' : picked.length === g.ackable.length ? `ยืนยันรับทั้ง ${picked.length} ซอง` : `ยืนยันรับ ${picked.length} ซองที่เลือก`}
                    </Button>
                  )}
                  {/* เดินทางกลับแล้วยังไม่ได้รับเงิน → แจ้งการเงิน */}
                  {g.returned && pickedReportable.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="warning"
                      className="w-full justify-center"
                      onClick={() => setAction({ kind: 'report', periodId: g.periodId })}
                    >
                      แจ้งไม่ได้รับซอง ({pickedReportable.length} ซอง)
                    </Button>
                  )}
                  <Link href={`/guide/jobs/${g.periodId}`} className="block text-center text-[11px] font-medium zego-text-info hover:underline">
                    ดูรายละเอียดกรุ๊ป / แนบรูป / ส่งต่อซอง
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {groups.length > MAX_ROWS && (
        <Link href="/guide/finance?tab=before" className="block zego-divider-top px-4 py-2 text-center text-xs font-medium zego-text-success zego-hover-surface">
          ดูทั้งหมด {groups.length} กรุ๊ป ›
        </Link>
      )}

      <ConfirmDialog
        open={action?.kind === 'ack' && !!target}
        onClose={close}
        onConfirm={() => void accept()}
        loading={saving}
        tone="success"
        title={`ยืนยันรับซอง ${target?.period?.groupCode ?? ''}`}
        message={action?.kind === 'ack' && target
          ? `ยืนยันว่าได้รับ ${targetEnvs.length} ซองแล้ว — ${targetEnvs.map((e) => `${envelopeName(e)} ${fmt(e.sealed?.faceTotals ?? [])}`).join(', ')}${targetEnvs.some((e) => leaderEnvelopeState(e, leaderId) === 'in_transit') ? ' · บางซองเจ้าหน้าที่ส่งกรุ๊ปยังไม่กดส่งต่อ ระบบจะบันทึกว่าคุณรับก่อน' : ''}`
          : ''}
        confirmLabel={`ยืนยันรับ ${targetEnvs.length} ซอง`}
      />

      {action?.kind === 'report' && target && (
        <Modal
          open
          onClose={close}
          size="sm"
          title={`แจ้งไม่ได้รับซอง ${target.period?.groupCode ?? ''}`}
          description={targetEnvs.map((e) => `${envelopeName(e)} ${fmt(e.sealed?.faceTotals ?? [])}`).join(' · ')}
          footer={
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="secondary" onClick={close} disabled={saving}>ยกเลิก</Button>
              <Button variant="danger" loading={saving} disabled={!note.trim()} onClick={() => void report()}>ส่งแจ้งการเงิน</Button>
            </div>
          }
        >
          <TextArea
            label="รายละเอียด"
            required
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น เจ้าหน้าที่ส่งกรุ๊ปไม่ได้มาส่งที่สนามบิน / ไม่มีใครนำซองมาให้ระหว่างเดินทาง"
          />
          <p className="mt-2 text-xs zego-text-tertiary">การเงินจะเห็นทันทีและตามซองต่อ — ถ้าได้รับภายหลัง กดยืนยันรับได้ตามปกติ</p>
        </Modal>
      )}
    </Card>
  );
}
