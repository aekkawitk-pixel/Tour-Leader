'use client';

/**
 * แผงเคลียร์เงินกรุ๊ป — สรุปเงินของกรุ๊ปเดียว แยกทีละสกุล แล้วบันทึกรับเงินคืน / ปิดการเคลียร์
 *
 * ยอดทั้งหมดคำนวณสดจากซองเงินและใบเสร็จ (summarizeGroupClear) · ที่บันทึกคือเงินคืนจริง + ผู้ปิด (groupClearStore)
 * ปิดได้เมื่อจบทริปแล้วและไม่มีเอกสารรอตรวจ — เบี้ยเลี้ยงโอนแยก ไม่หักกลบ (ดูสถานะที่แท็บเบี้ยเลี้ยง)
 * ตรวจเอกสารครบแล้ว → นัดหมายหัวหน้าทัวร์เข้ามาเคลียร์เงิน (ClearAppointmentSection) → เคลียร์ตามนัด → ปิด
 *
 * เช็กลิสต์ความครบถ้วน 6 ข้อ (clearChecklist) คำนวณสดจากค่าที่กำลังกรอก:
 *   ผ่านครบ → ปิดเป็น "เคลียร์ครบ" · ยังมีข้อค้าง → ปิดได้แบบ "ปิดแบบมีค้าง" ต้องใส่เหตุผล (เห็นข้อค้างย้อนหลังได้)
 * "บันทึก (ยังไม่ปิด)" = เก็บเงินคืน / จ่ายเพิ่ม / ไม่มีเบี้ยเลี้ยง ไว้ก่อน — ตารางนับความคืบหน้า "ครบ x/6" จากค่าที่บันทึก
 */

import Link from 'next/link';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Drawer } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, formatDateTime, toISODateTime } from '@/lib/format';
import { envelopeName } from '@/lib/logic/cashEnvelope';
import { clearChecklist, clearNotEnded, effectiveClearValues, followUpsFromClose, GROUP_CLEAR_STAGE, type GroupClearSummary } from '@/lib/logic/groupClear';
import { CLEAR_EVENT_LABEL, saveGroupClear, type GroupClearRecord } from '@/services/groupClearStore';
import { ClearAppointmentSection } from './ClearAppointmentSection';
import { FollowUpSection } from './FollowUpSection';
import { clearAppointmentOf } from '@/services/appointmentStore';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { EnvelopeStatusBadge, StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { expenseOriginalTotals } from '@/app/guide/expenses/expenseAmounts';

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ') || '—';

export function GroupClearDrawer({
  summary,
  leader,
  record,
  onClose,
  onSaved,
}: {
  summary: GroupClearSummary;
  leader: { id: string; name: string } | null;
  record: GroupClearRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser, pushToast, appointments, changeAppointmentStatus } = useDemo();
  const p = getTourPeriodById(summary.periodId);
  const closed = summary.stage === 'closed' || summary.stage === 'closed_partial';
  const toForm = (list: { currency: string; amount: number }[] | undefined) => Object.fromEntries((list ?? []).map((x) => [x.currency, String(x.amount)]));
  // เงินคืนจริง — ค่าที่บันทึกไว้ก่อน ไม่มีจึงตั้งต้นว่าง (กรอกตามที่รับจริง · ปุ่ม "เท่ายอดต้องคืน" ช่วยเติม)
  const [returned, setReturned] = useState<Record<string, string>>(() => toForm(record?.returned));
  // บริษัทจ่ายเพิ่มแล้ว (ใช้เกินซอง)
  const [paidExtra, setPaidExtra] = useState<Record<string, string>>(() => toForm(record?.paidExtra));
  const [noPerDiem, setNoPerDiem] = useState(!!record?.noPerDiem);
  const [note, setNote] = useState(record?.note ?? '');
  const [partialReason, setPartialReason] = useState(record?.partialReason ?? '');
  const s = GROUP_CLEAR_STAGE[summary.stage];
  const toList = (m: Record<string, string>) => Object.entries(m).filter(([, v]) => Number(v) > 0).map(([currency, v]) => ({ currency, amount: Number(v) }));
  // เช็กลิสต์ — ปิดแล้วใช้ค่าที่บันทึก + การชำระยอดค้างติดตาม · ยังไม่ปิดใช้ค่าที่กำลังกรอก
  const checks = clearChecklist(summary, closed
    ? effectiveClearValues(record)
    : { returned: toList(returned), paidExtra: toList(paidExtra), noPerDiem });
  const allOk = checks.every((c) => c.ok);
  // นับเฉพาะข้อที่เกี่ยวข้อง — ข้อสีเทา (ไม่เกี่ยวข้อง / ยังไม่ถึงเวลาตรวจ) ไม่นับ
  const counted = checks.filter((c) => !c.na);
  const okCount = counted.filter((c) => c.ok).length;
  const notEnded = clearNotEnded(summary.stage);
  // ปิดได้เมื่อจบทริปแล้ว — ครบ = เคลียร์ครบ · ไม่ครบ = ปิดแบบมีค้าง (ต้องมีเหตุผล)
  const canClose = !notEnded;
  const canAppoint = summary.stage === 'ready' || (summary.stage === 'waiting_leader' && summary.pendingDocs === 0);
  const badAmount = [...Object.values(returned), ...Object.values(paidExtra)].some((v) => v.trim() !== '' && !(Number(v) >= 0));
  const needReason = !allOk && !partialReason.trim();

  const values = () => ({
    returned: toList(returned),
    paidExtra: toList(paidExtra),
    ...(noPerDiem ? { noPerDiem: true } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  });
  /** บันทึกความคืบหน้า (ยังไม่ปิด) */
  const saveProgress = () => {
    try {
      saveGroupClear({ ...(record ?? { history: [] }), periodId: summary.periodId, ...values() });
      pushToast('success', 'บันทึกแล้ว (ยังไม่ปิด)', `${p?.groupCode ?? summary.periodId} · ครบ ${okCount}/${counted.length}`);
      onSaved();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const close = () => {
    if (needReason) return;
    const at = toISODateTime(new Date());
    const kind = allOk ? 'complete' as const : 'partial' as const;
    const reasonNote = kind === 'partial' ? `ปิดแบบมีค้าง (${checks.filter((c) => !c.ok).map((c) => c.label).join(', ')}) · ${partialReason.trim()}` : 'เคลียร์ครบทุกข้อ';
    const rec: GroupClearRecord = {
      periodId: summary.periodId,
      ...values(),
      closeKind: kind,
      ...(kind === 'partial' ? {
        partialReason: partialReason.trim(),
        // ยอดเงินขาด / เกิน ที่ต้องติดตามต่อ — แยกสกุล แยกว่าใครค้างใคร
        followUps: followUpsFromClose(summary, { returned: toList(returned), paidExtra: toList(paidExtra) }, at, currentUser.name),
      } : {}),
      closedAt: at,
      closedBy: currentUser.name,
      history: [...(record?.history ?? []), { at, by: currentUser.name, action: 'close', note: reasonNote }],
    };
    try {
      saveGroupClear(rec);
      // เคลียร์ตามนัด — นัดเคลียร์เงินที่ยังไม่ยกเลิกเปลี่ยนเป็น "เข้าพบแล้ว"
      const appt = clearAppointmentOf(appointments, summary.periodId);
      if (appt && appt.status !== 'attended') void changeAppointmentStatus(appt.id, 'attended', 'เคลียร์เงินกรุ๊ปเรียบร้อย');
      pushToast(kind === 'complete' ? 'success' : 'info', kind === 'complete' ? 'เคลียร์ครบ — ปิดการเคลียร์แล้ว' : 'ปิดแบบมีค้างแล้ว', p?.groupCode ?? summary.periodId);
      onSaved();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };
  const reopen = () => {
    if (!record) return;
    // มีการชำระยอดค้างแล้ว — เปิดใหม่จะทำให้ยอดซ้ำ ให้ปิดยอดค้างต่อจากหน้านี้แทน
    if ((record.followUps ?? []).some((f) => f.payments.length > 0)) {
      window.alert('มีการบันทึกชำระยอดค้างติดตามแล้ว — เปิดการเคลียร์ใหม่ไม่ได้ ให้บันทึกการชำระ / เพิ่มยอดค้างในส่วน “ยอดค้างติดตาม” แทน');
      return;
    }
    if (!window.confirm('เปิดการเคลียร์เงินกรุ๊ปนี้ใหม่? ยอดเงินคืนและยอดค้างติดตามที่บันทึกไว้จะถูกล้าง')) return;
    const at = toISODateTime(new Date());
    // เปิดใหม่ — ล้างเงินคืน/ผู้ปิด/ชนิดการปิด · จ่ายเพิ่ม / ไม่มีเบี้ยเลี้ยง คงไว้ (เป็นข้อเท็จจริงที่เกิดแล้ว) · นัดหมายคงไว้
    saveGroupClear({
      periodId: record.periodId, returned: [],
      ...(record.paidExtra ? { paidExtra: record.paidExtra } : {}),
      ...(record.noPerDiem ? { noPerDiem: true } : {}),
      history: [...record.history, { at, by: currentUser.name, action: 'reopen' }],
    });
    pushToast('info', 'เปิดการเคลียร์เงินกรุ๊ปใหม่แล้ว', p?.groupCode ?? summary.periodId);
    onSaved();
  };

  const th = 'px-2 py-1.5 text-right text-xs font-medium zego-text-tertiary';
  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={`เคลียร์เงินกรุ๊ป ${p?.groupCode ?? summary.periodId}`}
      description={`${p?.displayName ?? ''}${p ? ` · ${formatDateRange(p.startDate, p.endDate)}` : ''} · หัวหน้าทัวร์ ${leader?.name ?? '—'}`}
      footer={closed ? (
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs zego-text-tertiary">ปิดโดย {record?.closedBy} · {record?.closedAt && formatDateTime(record.closedAt)}</span>
          <Button variant="secondary" onClick={reopen}>เปิดใหม่</Button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className={cx('text-xs', allOk ? 'text-emerald-700' : 'zego-text-warning')}>
            {notEnded ? 'ยังไม่จบทริป — ยังปิดไม่ได้' : allOk ? 'เช็กลิสต์ผ่านครบ — ปิดเป็น "เคลียร์ครบ"' : `ยังค้าง ${counted.length - okCount} ข้อ — ปิดได้แบบ "ปิดแบบมีค้าง" (ต้องใส่เหตุผล)`}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={badAmount} onClick={saveProgress}>บันทึก (ยังไม่ปิด)</Button>
            <Button variant={allOk ? 'primary' : 'secondary'} disabled={!canClose || badAmount || needReason} onClick={close}>
              {allOk ? 'ปิด · เคลียร์ครบ' : 'ปิดแบบมีค้าง'}
            </Button>
          </span>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill label={s.label} tone={s.tone} />
          {summary.dueDate && <span className="zego-text-secondary">กำหนดเคลียร์ {formatDate(summary.dueDate)}</span>}
          {summary.overdue && <span className="text-xs font-semibold zego-text-danger">เกินกำหนด</span>}
        </div>

        {/* เช็กลิสต์ความครบถ้วน — ครบทุกข้อ = เคลียร์ครบ */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">เช็กลิสต์ความครบถ้วน</h3>
            <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', notEnded ? 'bg-slate-100 text-slate-600' : allOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{notEnded ? 'ตรวจได้หลังจบทริป' : `ครบ ${okCount}/${counted.length}`}</span>
          </div>
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 px-3 py-2">
                {/* เขียว = ผ่าน · แดง = ค้าง · เทา = ไม่เกี่ยวข้อง / ยังไม่ถึงเวลาตรวจ */}
                <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', c.na ? 'bg-slate-100 text-slate-400' : c.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-50 text-rose-600')}>
                  {c.na ? <span className="text-xs font-bold leading-none">–</span> : <Icon name={c.ok ? 'check' : 'x'} className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block font-medium', c.na ? 'zego-text-tertiary' : 'zego-text')}>{c.label}</span>
                  <span className={cx('block text-xs', c.ok ? 'zego-text-tertiary' : 'zego-text-warning')}>{c.detail}</span>
                </span>
                {c.key === 'perDiem' && !closed && !summary.perDiem && (
                  <label className="flex shrink-0 items-center gap-1.5 text-xs zego-text-secondary">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={noPerDiem} onChange={(e) => setNoPerDiem(e.target.checked)} />
                    ไม่มีเบี้ยเลี้ยง
                  </label>
                )}
              </li>
            ))}
          </ul>
          {closed && record?.closeKind === 'partial' && record.partialReason && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ปิดแบบมีค้าง — เหตุผล: {record.partialReason}{allOk ? ' · ชำระยอดค้างครบแล้ว = เคลียร์ครบ' : ''}
            </p>
          )}
        </section>

        {/* ยอดค้างติดตาม — หลังปิด: รับคืนส่วนที่ขาด / จ่ายคืนส่วนที่เกิน (ไม่หักจากเบี้ยเลี้ยง) */}
        {closed && record && <FollowUpSection record={record} groupCode={p?.groupCode ?? summary.periodId} onSaved={onSaved} />}

        {/* สรุปเงินแยกสกุล */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">สรุปเงินในซอง (แยกสกุล)</h3>
          {summary.inTransit.length > 0 && (
            <p className="mb-2 text-xs zego-text-tertiary">
              ส่งมอบแล้ว หัวหน้าทัวร์ยังไม่ยืนยันรับ {summary.inTransit.map((t) => formatCurrency(t.amount, t.currency)).join(' · ')} — ยังไม่นับในยอดด้านล่าง
            </p>
          )}
          {summary.balance.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-3 py-4 text-center text-sm zego-text-tertiary">ยังไม่มีซองที่หัวหน้าทัวร์รับ และยังไม่มีใบเสร็จ</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border zego-border-color">
              <table className="w-full text-sm tabular-nums">
                <thead className="zego-surface-soft-bg">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-xs font-medium zego-text-tertiary">สกุล</th>
                    <th className={th}>ในซอง (รับแล้ว)</th>
                    <th className={th}>ส่งแลนด์</th>
                    <th className={th}>ใช้ตามใบเสร็จ (อนุมัติ)</th>
                    <th className={th}>รอตรวจ</th>
                    <th className={th}>คงเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--zego-border-soft)]">
                  {summary.balance.map((b) => (
                    <tr key={b.currency}>
                      <td className="px-2 py-1.5 font-medium zego-text">{b.currency}</td>
                      <td className="px-2 py-1.5 text-right">{money(b.face)}</td>
                      <td className="px-2 py-1.5 text-right">{money(b.land)}</td>
                      <td className="px-2 py-1.5 text-right">{money(b.spent)}</td>
                      <td className="px-2 py-1.5 text-right zego-text-tertiary">{b.pending > 0 ? money(b.pending) : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={b.remaining > 0 ? 'font-semibold zego-text-danger' : b.remaining < 0 ? 'font-semibold text-emerald-700' : 'zego-text'}>{money(Math.abs(b.remaining))}</span>
                        <span className="block text-[11px] zego-text-tertiary">{notEnded ? 'คงเหลือในซอง' : b.remaining > 0 ? 'หัวหน้าทัวร์ต้องคืน' : b.remaining < 0 ? 'บริษัทจ่ายเพิ่ม' : 'พอดี'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ซองเงิน */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">ซองเงิน ({summary.envelopes.length})</h3>
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
            {summary.envelopes.length === 0 ? <li className="px-3 py-2.5 text-xs zego-text-tertiary">ไม่มีซองเงิน</li> : summary.envelopes.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate zego-text">{envelopeName(e)}</span>
                  {(e.landPayments?.length ?? 0) > 0 && (
                    <span className="block text-[11px] zego-text-tertiary">ส่งแลนด์ {e.landPayments!.map((lp) => `${lp.landName} ${formatCurrency(lp.amount, lp.currency)}`).join(' · ')}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums zego-text">{fmtTotals(e.sealed?.faceTotals ?? [])}</span>
                <EnvelopeStatusBadge env={e} short />
              </li>
            ))}
          </ul>
        </section>

        {/* ใบเสร็จ */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">ใบเสร็จค่าใช้จ่าย ({summary.receipts.length})</h3>
            <Link href="/expenses" className="text-xs font-medium zego-text-info hover:underline">ตรวจที่ ตรวจสอบรายการจ่าย →</Link>
          </div>
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
            {summary.receipts.length === 0 ? <li className="px-3 py-2.5 text-xs zego-text-tertiary">ยังไม่มีใบเสร็จ</li> : summary.receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate zego-text">{r.lines[0]?.purpose || r.lines[0]?.expenseType || r.id}</span>
                  <span className="block text-[11px] zego-text-tertiary">{r.id}{r.lines.length > 1 ? ` · ${r.lines.length} รายการ` : ''}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums zego-text">{fmtTotals(expenseOriginalTotals(r))}</span>
                <StatusBadge meta={EXPENSE_STATUS[r.status]} size="sm" />
              </li>
            ))}
          </ul>
        </section>

        {/* เบี้ยเลี้ยง — โอนแยก ไม่หักกลบ */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">เบี้ยเลี้ยง <span className="text-xs font-normal zego-text-tertiary">(โอนแยก ไม่หักกลบกับเงินคืน)</span></h3>
            <Link href="/group-expenses" className="text-xs font-medium zego-text-info hover:underline">ไปที่แท็บเบี้ยเลี้ยง →</Link>
          </div>
          <div className="flex items-center gap-2 rounded-lg border zego-border-color px-3 py-2 text-sm">
            {summary.perDiem ? (
              <>
                <span className="min-w-0 flex-1 zego-text">{summary.perDiem.id}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums zego-text">{fmtTotals(expenseOriginalTotals(summary.perDiem))}</span>
                <StatusBadge meta={EXPENSE_STATUS[summary.perDiem.status]} size="sm" />
              </>
            ) : <span className="text-xs zego-text-tertiary">หัวหน้าทัวร์ยังไม่ได้ทำใบเบิกเบี้ยเลี้ยง</span>}
          </div>
        </section>

        {/* นัดหมาย — หลังตรวจเอกสารครบ */}
        {!closed && (
          <ClearAppointmentSection
            periodId={summary.periodId}
            groupCode={p?.groupCode ?? summary.periodId}
            leader={leader}
            canAppoint={canAppoint}
            blockedReason={notEnded ? 'ยังไม่จบทริป'
              : summary.stage === 'waiting_docs' ? 'ยังมีเอกสารรอตรวจ'
                : 'หัวหน้าทัวร์ยังไม่ส่งเอกสารครบ'}
          />
        )}

        {/* ปิดการเคลียร์ */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">{closed ? 'ผลการเคลียร์' : 'บันทึกรับเงินคืน / จ่ายเพิ่ม'}</h3>
          {closed ? (
            <div className="space-y-1 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
              <p className="zego-text">รับเงินคืน: <span className="font-semibold tabular-nums">{(record?.returned.length ?? 0) > 0 ? fmtTotals(record!.returned) : 'ไม่มี'}</span></p>
              {(record?.paidExtra?.length ?? 0) > 0 && <p className="zego-text">บริษัทจ่ายเพิ่ม: <span className="font-semibold tabular-nums">{fmtTotals(record!.paidExtra!)}</span></p>}
              {record?.note && <p className="zego-text-secondary">หมายเหตุ: {record.note}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {summary.balance.filter((b) => b.remaining > 0).length === 0 ? (
                <p className="text-xs zego-text-tertiary">ไม่มียอดที่หัวหน้าทัวร์ต้องคืน</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {summary.balance.filter((b) => b.remaining > 0).map((b) => (
                    <label key={b.currency} className="block text-xs">
                      <span className="mb-1 flex items-center justify-between gap-2 font-medium zego-text-secondary">
                        <span>รับคืนจริง ({b.currency}) · ต้องคืน {money(b.remaining)}</span>
                        <button type="button" className="font-medium zego-text-info hover:underline" onClick={() => setReturned((m) => ({ ...m, [b.currency]: String(Math.round(b.remaining * 100) / 100) }))}>เท่ายอด</button>
                      </span>
                      <input
                        type="number" inputMode="decimal" min={0}
                        className="h-9 w-full rounded-lg border zego-border-color bg-white px-2.5 text-right text-sm tabular-nums"
                        value={returned[b.currency] ?? ''}
                        onChange={(e) => { const v = e.target.value; setReturned((m) => ({ ...m, [b.currency]: v })); }}
                      />
                    </label>
                  ))}
                </div>
              )}
              {/* ใช้เกินเงินในซอง — บันทึกว่าบริษัทจ่ายเพิ่มให้หัวหน้าทัวร์แล้ว */}
              {summary.balance.some((b) => b.remaining < 0) && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {summary.balance.filter((b) => b.remaining < 0).map((b) => (
                    <label key={b.currency} className="block text-xs">
                      <span className="mb-1 flex items-center justify-between gap-2 font-medium zego-text-secondary">
                        <span>บริษัทจ่ายเพิ่มแล้ว ({b.currency}) · ใช้เกิน {money(-b.remaining)}</span>
                        <button type="button" className="font-medium zego-text-info hover:underline" onClick={() => setPaidExtra((m) => ({ ...m, [b.currency]: String(Math.round(-b.remaining * 100) / 100) }))}>เท่ายอด</button>
                      </span>
                      <input
                        type="number" inputMode="decimal" min={0}
                        className="h-9 w-full rounded-lg border zego-border-color bg-white px-2.5 text-right text-sm tabular-nums"
                        value={paidExtra[b.currency] ?? ''}
                        onChange={(e) => { const v = e.target.value; setPaidExtra((m) => ({ ...m, [b.currency]: v })); }}
                      />
                    </label>
                  ))}
                </div>
              )}
              {!allOk && !notEnded && (
                <label className="block text-xs">
                  <span className="mb-1 block font-medium zego-text-secondary">เหตุผลที่ปิดแบบมีค้าง <span className="text-rose-600">*</span> <span className="font-normal zego-text-tertiary">(ใช้เมื่อจำเป็นต้องปิดก่อนครบ)</span></span>
                  <textarea rows={2} className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-sm" value={partialReason} onChange={(e) => setPartialReason(e.target.value)} placeholder="เช่น หัวหน้าทัวร์ลาออก ติดตามเงินคืนผ่านฝ่ายบุคคล" />
                </label>
              )}
              <label className="block text-xs">
                <span className="mb-1 block font-medium zego-text-secondary">หมายเหตุ <span className="font-normal zego-text-tertiary">(ไม่บังคับ)</span></span>
                <textarea rows={2} className="w-full rounded-lg border zego-border-color bg-white px-2.5 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        {(record?.history.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold zego-text">ประวัติ</h3>
            <ul className="space-y-1 text-xs zego-text-secondary">
              {record!.history.map((h, i) => (
                <li key={i}>{formatDateTime(h.at)} · {h.by} · {CLEAR_EVENT_LABEL[h.action]}{h.note ? ` · ${h.note}` : ''}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}
