'use client';

/**
 * แผงเคลียร์เงินกรุ๊ป — สรุปเงินของกรุ๊ปเดียว แยกทีละสกุล แล้วบันทึกรับเงินคืน / ปิดการเคลียร์
 *
 * ยอดทั้งหมดคำนวณสดจากซองเงินและใบเสร็จ (summarizeGroupClear) · ที่บันทึกคือเงินคืนจริง + ผู้ปิด (groupClearStore)
 * ปิดได้เมื่อจบทริปแล้วและไม่มีเอกสารรอตรวจ — เบี้ยเลี้ยงโอนแยก ไม่หักกลบ (ดูสถานะที่แท็บเบี้ยเลี้ยง)
 * ตรวจเอกสารครบแล้ว → นัดหมายหัวหน้าทัวร์เข้ามาเคลียร์เงิน (ClearAppointmentSection) → เคลียร์ตามนัด → ปิด
 */

import Link from 'next/link';
import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Drawer } from '@/components/ui/Modal';
import { Button, Callout, StatusBadge } from '@/components/ui/Primitives';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, formatDateTime, toISODateTime } from '@/lib/format';
import { envelopeName } from '@/lib/logic/cashEnvelope';
import { GROUP_CLEAR_STAGE, type GroupClearSummary } from '@/lib/logic/groupClear';
import { CLEAR_EVENT_LABEL, saveGroupClear, type GroupClearRecord } from '@/services/groupClearStore';
import { ClearAppointmentSection } from './ClearAppointmentSection';
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
  const closed = summary.stage === 'closed';
  // เงินคืนจริง — ตั้งต้นจากคงเหลือที่ต้องคืน (ยอดบวก) แก้ได้ตามที่รับจริง
  const [returned, setReturned] = useState<Record<string, string>>(() => Object.fromEntries(
    summary.balance.filter((b) => b.remaining > 0).map((b) => [b.currency, String(Math.round(b.remaining * 100) / 100)]),
  ));
  const [note, setNote] = useState(record?.note ?? '');
  const s = GROUP_CLEAR_STAGE[summary.stage];
  // ยังไม่มีใบเสร็จ/ใบเบิกก็ปิดได้ (เช่น คืนเงินทั้งซอง) — ห้ามเฉพาะยังไม่จบทริป / มีเอกสารรอตรวจ
  const canClose = summary.stage === 'ready' || (summary.stage === 'waiting_leader' && summary.pendingDocs === 0);
  const badAmount = Object.values(returned).some((v) => v.trim() !== '' && !(Number(v) >= 0));

  const close = () => {
    const at = toISODateTime(new Date());
    const rec: GroupClearRecord = {
      periodId: summary.periodId,
      returned: Object.entries(returned).filter(([, v]) => Number(v) > 0).map(([currency, v]) => ({ currency, amount: Number(v) })),
      ...(note.trim() ? { note: note.trim() } : {}),
      closedAt: at,
      closedBy: currentUser.name,
      history: [...(record?.history ?? []), { at, by: currentUser.name, action: 'close', ...(note.trim() ? { note: note.trim() } : {}) }],
    };
    try {
      saveGroupClear(rec);
      // เคลียร์ตามนัด — นัดเคลียร์เงินที่ยังไม่ยกเลิกเปลี่ยนเป็น "เข้าพบแล้ว"
      const appt = clearAppointmentOf(appointments, summary.periodId);
      if (appt && appt.status !== 'attended') void changeAppointmentStatus(appt.id, 'attended', 'เคลียร์เงินกรุ๊ปเรียบร้อย');
      pushToast('success', 'ปิดการเคลียร์เงินกรุ๊ปแล้ว', p?.groupCode ?? summary.periodId);
      onSaved();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };
  const reopen = () => {
    if (!record || !window.confirm('เปิดการเคลียร์เงินกรุ๊ปนี้ใหม่? ยอดเงินคืนที่บันทึกไว้จะถูกล้าง')) return;
    const at = toISODateTime(new Date());
    // เปิดใหม่ — ล้างเงินคืน/ผู้ปิด (นัดหมายคงไว้ตามเดิม)
    saveGroupClear({ periodId: record.periodId, returned: [], history: [...record.history, { at, by: currentUser.name, action: 'reopen' }] });
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
          <span className="text-xs zego-text-warning">
            {summary.stage === 'traveling' ? 'ยังไม่จบทริป'
              : summary.stage === 'waiting_docs' ? `มีเอกสารรอตรวจ ${summary.toReview.receipts + (summary.toReview.perDiem ? 1 : 0)} ใบ — ตรวจให้ครบก่อนปิด`
                : summary.pendingDocs > 0 ? `หัวหน้าทัวร์ยังไม่ส่งเอกสาร ${summary.pendingDocs} ใบ (ร่าง / ส่งกลับแก้ไข) — รอส่งก่อนปิด`
                  : summary.stage === 'waiting_leader' ? 'หัวหน้าทัวร์ยังไม่ส่งใบเสร็จ/ใบเบิก — ปิดได้ถ้าคืนเงินครบแล้ว' : ''}
          </span>
          <Button variant="primary" disabled={!canClose || badAmount} onClick={close}>ปิดการเคลียร์เงินกรุ๊ป</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusPill label={s.label} tone={s.tone} />
          <span className="zego-text-secondary">กำหนดเคลียร์ {formatDate(summary.dueDate)}</span>
          {summary.overdue && <span className="text-xs font-semibold zego-text-danger">เกินกำหนด</span>}
        </div>

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
                        <span className="block text-[11px] zego-text-tertiary">{b.remaining > 0 ? 'หัวหน้าทัวร์ต้องคืน' : b.remaining < 0 ? 'บริษัทจ่ายเพิ่ม' : 'พอดี'}</span>
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
            canAppoint={canClose}
            blockedReason={summary.stage === 'traveling' ? 'ยังไม่จบทริป'
              : summary.stage === 'waiting_docs' ? 'ยังมีเอกสารรอตรวจ'
                : 'หัวหน้าทัวร์ยังไม่ส่งเอกสารครบ'}
          />
        )}

        {/* ปิดการเคลียร์ */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">{closed ? 'ผลการเคลียร์' : 'บันทึกรับเงินคืน'}</h3>
          {closed ? (
            <div className="space-y-1 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
              <p className="zego-text">รับเงินคืน: <span className="font-semibold tabular-nums">{fmtTotals(record?.returned ?? []) === '—' ? 'ไม่มี' : fmtTotals(record?.returned ?? [])}</span></p>
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
                      <span className="mb-1 block font-medium zego-text-secondary">รับคืนจริง ({b.currency}) · ต้องคืน {money(b.remaining)}</span>
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
              {summary.balance.some((b) => b.remaining < 0) && (
                <Callout tone="amber" title="ใช้เกินเงินในซอง">
                  {summary.balance.filter((b) => b.remaining < 0).map((b) => `${b.currency} ${money(-b.remaining)}`).join(' · ')} — บริษัทต้องจ่ายเพิ่มให้หัวหน้าทัวร์
                </Callout>
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
