'use client';

/**
 * เบิกค่าใช้จ่าย — /staff/claims (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * เบิก "ค่าส่งกรุ๊ป" เป็นรายเดือน: เลือกกรุ๊ปที่ไปส่งแล้วในเดือนเดียวกัน → ทำเป็นใบเบิก 1 ใบยื่นบัญชี
 * (กรุ๊ปที่เบิกได้ = คอนเฟิร์มแล้ว + ถึงวันไปส่งแล้ว + ยังไม่อยู่ในใบเบิกที่ยังมีผล · จัดเดือนตามวันไปส่ง)
 * ค่าส่งกรุ๊ปคิดให้อัตโนมัติตามมาตรฐานที่ผู้ดูแลระบบตั้งไว้ (ตั้งค่าระบบ → ค่าส่งกรุ๊ป · เริ่มต้น 900 / วันหยุด 1,200) — ไม่ให้แก้เอง
 * เบิกค่าใช้จ่ายอื่นพร้อมกันได้ (ค่าเดินทาง/ทางด่วน/ที่จอดรถ) พร้อมรูปใบเสร็จ
 * ส่งเป็นใบเบิก (ExpenseRequest, requesterKind='sendoff', claimMonth) → ฝ่ายบัญชีตรวจ/อนุมัติที่เมนู "ตรวจสอบรายการจ่าย"
 * แต่ละบรรทัดค่าส่งกรุ๊ปบอกกรุ๊ปที่ line.periodId — บัญชีไม่อนุมัติบางกรุ๊ปได้ กรุ๊ปนั้นกลับมารอเบิกใหม่
 * ใบที่ยังไม่อนุมัติ (ส่งอนุมัติ / ให้แก้ไข) แก้ได้: เพิ่ม-ถอดกรุ๊ปของเดือนเดียวกัน · ค่าใช้จ่ายอื่น · หมายเหตุ → ส่งบัญชีตรวจใหม่
 * พิมพ์ใบเบิก (A4 มีช่องลงชื่อ) ได้ทุกสถานะ — ดู printClaim.ts
 */

import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, EmptyState, StatusBadge, cx } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateTime, formatThaiMonthYear, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { compressImageToDataUrl } from '@/lib/image/compressImage';
import {
  claimableDuties, DEFAULT_SEND_OFF_FEE_RATES, dutiesByMonth, sendOffFee, SEND_OFF_EXTRA_TYPES, SEND_OFF_FEE_TYPE, SEND_OFF_HOLIDAY_NOTE, staffClaims,
  type SendOffFeeRates, type StaffDuty,
} from '@/lib/logic/staffPortal';
import { loadSendOffFeeRates } from '@/services/sendOffFeeStore';
import { holidayOf } from '@/services/holidayService';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { useStaffPortal } from '../useStaffPortal';
import { MonthYearSelect, useMonthGroups } from '@/components/ui/MonthFilter';
import { printSendOffClaim } from './printClaim';
import { periodCodeOf } from '@/services/tourPeriodMaster';

/** ค่าส่งกรุ๊ปของงานนี้ — จากวันที่ไปส่ง (วันหยุดราชการ = อัตราวันหยุด) */
const feeOf = (d: StaffDuty, rates: SendOffFeeRates) => {
  if (!d.dutyDate) return sendOffFee(null, rates);
  const dow = new Date(`${d.dutyDate}T00:00:00`).getDay();
  const weekend = rates.weekendAsHoliday && (dow === 0 || dow === 6) ? (dow === 0 ? 'วันอาทิตย์' : 'วันเสาร์') : null;
  return sendOffFee(holidayOf(d.dutyDate)?.name ?? weekend, rates);
};
/** 'YYYY-MM' → "กันยายน 2569" */
const monthLabel = (month: string) => formatThaiMonthYear(`${month}-01`);

export default function StaffClaimsPage() {
  const { expenses, currentUser, saveExpense, createExpenseId } = useDemo();
  const { staffId, staff, duties, today } = useStaffPortal();
  /** มาตรฐานค่าส่งกรุ๊ป — อ่านหลัง mount (localStorage) กัน HTML ฝั่ง server ไม่ตรง */
  const [rates, setRates] = useState<SendOffFeeRates>(DEFAULT_SEND_OFF_FEE_RATES);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setRates(loadSendOffFeeRates());
  }, []);
  /** ใบเบิกที่กำลังทำ — expense = แก้ใบเดิม · ไม่มี = ทำใบใหม่ของเดือนนั้น */
  /** เดือนที่กางดูรายชื่อกรุ๊ป (มีเดือนเดียว = กางเสมอ) */
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [claimFor, setClaimFor] = useState<{ month: string; options: StaffDuty[]; selected: string[]; expense?: ExpenseRequest } | null>(null);

  const claimable = claimableDuties(duties, expenses, staffId, today);
  const months = dutiesByMonth(claimable);
  const mine = staffClaims(expenses, staffId);
  /*
    ใบเบิกของฉัน สะสมเดือนละใบ — ตัวกรองช่วงเวลา (ปี + ตาราง 12 เดือน) ชุดเดียวกับตารางงาน/ซองเงิน
    จัดเดือนตามเดือนของใบเบิก (claimMonth) · ใบแบบเดิมที่ไม่มีเดือน = เดือนที่ส่ง · เดือนล่าสุดก่อน
  */
  const claimMonthOf = (e: ExpenseRequest) => (e.claimMonth ? `${e.claimMonth}-01` : (e.submittedAt ?? e.requestedAt).slice(0, 10));
  const mineByMonth = [...mine].sort((a, b) => claimMonthOf(b).localeCompare(claimMonthOf(a)));
  const mineGroups = useMonthGroups(mineByMonth, claimMonthOf, today);
  const mineShown = mineGroups.shown.flatMap((m) => m.items);
  const bank = staff?.bankAccounts.find((b) => b.isPrimary && b.active) ?? staff?.bankAccounts.find((b) => b.active);
  const groupCodeOf = (periodId: string) => duties.find((d) => d.periodId === periodId)?.period?.groupCode ?? periodCodeOf(periodId);

  /** ใบที่ยังไม่อนุมัติ แก้ได้ (เฉพาะใบรายเดือน — ใบแบบเดิม 1 กรุ๊ป/ใบ ไม่มีข้อมูลกรุ๊ปที่บรรทัด) */
  const editable = (e: ExpenseRequest) => Boolean(e.claimMonth) && (e.status === 'submitted' || e.status === 'revise');

  /** แก้ใบเดิม — กรุ๊ปที่เลือกได้ = กรุ๊ปในใบ + กรุ๊ปที่ยังรอเบิกของเดือนเดียวกัน */
  const openEdit = (e: ExpenseRequest) => {
    const month = e.claimMonth!;
    const inDoc = e.lines.filter((l) => l.expenseType === SEND_OFF_FEE_TYPE && l.periodId && !l.rejected);
    const docDuties: StaffDuty[] = inDoc.map((l) =>
      duties.find((d) => d.periodId === l.periodId) ?? {
        assignmentId: l.periodId!, periodId: l.periodId!, period: null, dutyDate: l.receiptDate ?? `${month}-01`,
        arrivalTime: null, flightTime: null, airport: null, confirmed: true,
      });
    const more = claimable.filter((d) => d.dutyDate.startsWith(month) && !docDuties.some((x) => x.periodId === d.periodId));
    const options = [...docDuties, ...more].sort((a, b) => a.dutyDate.localeCompare(b.dutyDate));
    setClaimFor({ month, options, selected: docDuties.map((d) => d.periodId), expense: e });
  };

  const submit = async (month: string, lines: ExpenseLine[], note: string, editing?: ExpenseRequest) => {
    const at = toISODateTime(new Date());
    if (editing) {
      // แก้ใบเดิม → กลับไปรอบัญชีตรวจ (ใบที่ "ให้แก้ไข" ก็ส่งกลับเป็นส่งอนุมัติ)
      await saveExpense({
        ...editing,
        lines,
        totalTHB: lines.reduce((s, l) => s + l.amountTHB, 0),
        note,
        status: 'submitted',
        submittedAt: at,
        history: [...editing.history, makeStatusEvent(editing.status, 'submitted', currentUser.name, at, 'แก้ไขใบเบิก')],
      });
      setClaimFor(null);
      return;
    }
    const id = await createExpenseId();
    const expense: ExpenseRequest = {
      id,
      // ใบรายเดือนไม่ได้เป็นของกรุ๊ปใดกรุ๊ปหนึ่ง — jobId เป็นรหัสเดือนของเจ้าหน้าที่คนนี้ (กรุ๊ปอยู่ที่ line.periodId)
      jobId: `SENDOFF-${staffId}-${month}`,
      claimMonth: month,
      category: 'actual',
      requesterId: staffId,
      requesterName: currentUser.name,
      requesterKind: 'sendoff',
      requestedAt: at,
      submittedAt: at,
      lines,
      totalTHB: lines.reduce((s, l) => s + l.amountTHB, 0),
      bankAccount: { bank: bank?.bank ?? '', accountNoMasked: bank?.accountNoMasked ?? '', accountName: bank?.accountName ?? '', branch: bank?.branch ?? '' },
      note,
      status: 'submitted',
      history: [makeStatusEvent(null, 'submitted', currentUser.name, at, note || undefined)],
    };
    await saveExpense(expense);
    setClaimFor(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold zego-text">เบิกค่าใช้จ่าย</h1>
        <p className="text-xs zego-text-tertiary">เบิกค่าส่งกรุ๊ปเป็นรายเดือน — เลือกกรุ๊ปที่ไปส่งแล้วในเดือนนั้น ทำเป็นใบเบิก 1 ใบ · ฝ่ายบัญชีตรวจและอนุมัติ</p>
      </div>

      <section className="space-y-3">
        {/* จำนวนกรุ๊ปบอกที่แถวของแต่ละเดือนแล้ว — หัวข้อไม่ต้องซ้ำ */}
        <h2 className="text-sm font-semibold zego-text">ค่าส่งกรุ๊ป — รอเบิก</h2>
        {months.length === 0 ? (
          <Card><EmptyState icon="receipt" title="ยังไม่มีงานที่รอเบิก" description="งานที่คอนเฟิร์มแล้วและถึงวันไปส่งแล้วจะขึ้นที่นี่" /></Card>
        ) : (
          /*
            แถวสรุปเดือนละแถว (เดือนเก่าสุดก่อน) — เดือน · จำนวนกรุ๊ป · ยอดรวม · ปุ่มทำใบเบิก
            รายชื่อกรุ๊ปพับไว้ แตะแถวเพื่อดู · มีเดือนเดียว = กางให้เลย · ค้างหลายเดือน/หลายสิบกรุ๊ปก็ไม่ยาวจนหาปุ่มไม่เจอ
          */
          <Card className="divide-y divide-[var(--zego-border-soft)] p-0">
            {months.map(({ month, duties: list }) => {
              const total = list.reduce((s, d) => s + feeOf(d, rates).amount, 0);
              const open = months.length === 1 || openMonth === month;
              return (
                <div key={month}>
                  <div className="flex items-center gap-2 px-3 py-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                      onClick={() => setOpenMonth(open ? null : month)}
                      disabled={months.length === 1}
                      aria-expanded={open}
                    >
                      {months.length > 1 && (
                        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 zego-text-tertiary transition-transform', open ? 'rotate-0' : '-rotate-90')} />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold zego-text">{monthLabel(month)}</span>
                        <span className="block text-xs zego-text-tertiary">{list.length} กรุ๊ป · <span className="tabular-nums">{formatCurrency(total, 'THB')}</span></span>
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon="receipt"
                      onClick={() => setClaimFor({ month, options: list, selected: list.map((d) => d.periodId) })}
                    >
                      ทำใบเบิก
                    </Button>
                  </div>
                  {open && (
                    <ul className="mx-3 mb-3 divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
                      {list.map((d) => {
                        const fee = feeOf(d, rates);
                        return (
                          <li key={d.assignmentId}>
                            <div className="flex items-start gap-3 px-3 py-2.5">
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold zego-text">{d.period?.groupCode ?? periodCodeOf(d.periodId)}</span>
                                <span className="line-clamp-1 block text-xs zego-text-secondary">{d.period?.displayName}</span>
                                <span className="block text-xs zego-text-tertiary">ไปส่ง {formatDate(d.dutyDate)}{d.airport ? ` · ${d.airport}` : ''}</span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-sm font-semibold tabular-nums zego-text">{formatCurrency(fee.amount, 'THB')}</span>
                                <span className={cx('block text-[11px]', fee.holiday ? 'font-medium zego-text-warning' : 'zego-text-tertiary')}>
                                  {fee.holiday ? `วันหยุด · ${fee.holiday}` : 'อัตราปกติ'}
                                </span>
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold zego-text">ใบเบิกของฉัน</h2>
        <MonthYearSelect groups={mineGroups} />
        {mine.length === 0 ? (
          <p className="rounded-lg zego-surface-soft-bg px-3 py-3 text-center text-xs zego-text-tertiary">ยังไม่มีใบเบิก</p>
        ) : (
          <ul className="space-y-2">
            {mineShown.map((e) => (
              <li key={e.id}>
                <Card className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold zego-text">
                        {e.claimMonth ? `ค่าส่งกรุ๊ป เดือน${monthLabel(e.claimMonth)}` : groupCodeOf(e.jobId)}
                      </p>
                      <p className="text-[11px] zego-text-tertiary">{e.id} · ส่งเมื่อ {formatDateTime(e.submittedAt ?? e.requestedAt)}</p>
                    </div>
                    <StatusBadge meta={EXPENSE_STATUS[e.status]} size="sm" />
                  </div>
                  <ul className="space-y-0.5 text-xs">
                    {e.lines.map((l) => (
                      <li key={l.id} className={`flex justify-between gap-2 ${l.rejected ? 'line-through zego-text-tertiary' : 'zego-text-secondary'}`}>
                        <span className="truncate">
                          {l.expenseType === SEND_OFF_FEE_TYPE && l.periodId ? l.purpose : `${l.expenseType}${l.purpose && l.purpose !== l.expenseType ? ` · ${l.purpose}` : ''}`}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatCurrency(l.amount, l.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="flex justify-between border-t zego-border-color pt-1 text-sm font-semibold zego-text">
                    <span>รวม</span>
                    <span className="tabular-nums">{formatCurrency(e.lines.filter((l) => !l.rejected).reduce((s, l) => s + l.amount, 0), 'THB')}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button variant="secondary" size="sm" icon="download" onClick={() => printSendOffClaim(e, staff ? sendOffStaffName(staff) : currentUser.name)}>
                      พิมพ์
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="edit"
                      disabled={!editable(e)}
                      title={editable(e) ? undefined : 'ใบเบิกที่อนุมัติ/ดำเนินการแล้ว แก้ไขไม่ได้'}
                      onClick={() => openEdit(e)}
                    >
                      แก้ไข
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claimFor && (
        <ClaimModal
          rates={rates}
          key={claimFor.expense?.id ?? claimFor.month}
          month={claimFor.month}
          options={claimFor.options}
          initialSelected={claimFor.selected}
          editing={claimFor.expense}
          bankText={bank ? `${bank.bank} ${bank.accountNoMasked} · ${bank.accountName}` : null}
          onClose={() => setClaimFor(null)}
          onSubmit={(lines, note) => submit(claimFor.month, lines, note, claimFor.expense)}
        />
      )}
    </div>
  );
}

interface ExtraRow { key: number; type: string; amount: string; image: string | null }

function ClaimModal({
  month,
  options,
  initialSelected,
  editing,
  bankText,
  rates,
  onClose,
  onSubmit,
}: {
  month: string;
  /** กรุ๊ปที่เลือกใส่ใบนี้ได้ (เดือนเดียวกัน) */
  options: StaffDuty[];
  /** periodId ที่เลือกไว้ตอนเปิด */
  initialSelected: string[];
  /** ใบเดิมที่กำลังแก้ — เติมค่าใช้จ่ายอื่น/หมายเหตุเดิมให้ */
  editing?: ExpenseRequest;
  bankText: string | null;
  rates: SendOffFeeRates;
  onClose: () => void;
  onSubmit: (lines: ExpenseLine[], note: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [extras, setExtras] = useState<ExtraRow[]>(() =>
    (editing?.lines ?? [])
      .filter((l) => l.expenseType !== SEND_OFF_FEE_TYPE)
      .map((l, i) => ({ key: i + 1, type: l.expenseType, amount: String(l.amount), image: l.evidenceImage ?? null })));
  const [note, setNote] = useState(editing?.note ?? '');
  const duties = options.filter((d) => selected.has(d.periodId));
  const toggle = (periodId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(periodId)) next.delete(periodId);
      else next.add(periodId);
      return next;
    });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);

  const fees = duties.map((d) => ({ duty: d, fee: feeOf(d, rates) }));
  const feeTotal = fees.reduce((s, f) => s + f.fee.amount, 0);
  const ok = duties.length > 0 && extras.every((x) => Number(x.amount) > 0);
  const total = feeTotal + extras.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const setExtra = (key: number, patch: Partial<ExtraRow>) => setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const build = (): ExpenseLine[] => {
    const base = (i: number, expenseType: string, purpose: string, amount: number, receiptDate: string): ExpenseLine => ({
      id: `L-${i + 1}`,
      expenseType,
      purpose,
      amount,
      currency: 'THB',
      fxRate: 1,
      amountTHB: amount,
      receiptNo: '',
      evidenceFileName: '',
      receiptDate,
    });
    // ค่าส่งกรุ๊ป: 1 บรรทัดต่อกรุ๊ป (บอกกรุ๊ปที่ periodId) · ค่าใช้จ่ายอื่นเป็นของทั้งใบ
    const feeLines = fees.map(({ duty, fee }, i) => ({
      ...base(i, SEND_OFF_FEE_TYPE, `ส่งกรุ๊ป ${duty.period?.groupCode ?? periodCodeOf(duty.periodId)} · ${formatDate(duty.dutyDate)}${fee.holiday ? ` · วันหยุด (${fee.holiday})` : ''}`, fee.amount, duty.dutyDate),
      periodId: duty.periodId,
      // ป้ายอัตรา — ใช้แยกอัตราวันหยุดตอนแสดง/พิมพ์ (ยอดเปลี่ยนได้ตามมาตรฐานที่ผู้ดูแลระบบตั้ง)
      note: fee.holiday ? `${SEND_OFF_HOLIDAY_NOTE} (${fee.holiday})` : 'อัตราปกติ',
    }));
    const lastDate = duties.map((d) => d.dutyDate).sort().at(-1) ?? `${month}-01`;
    const extraLines = extras.map((x, i) => ({
      ...base(fees.length + i, x.type, x.type, Number(x.amount), lastDate),
      ...(x.image ? { evidenceFileName: 'receipt.jpg', evidenceImage: x.image } : {}),
    }));
    return [...feeLines, ...extraLines];
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${editing ? `แก้ไขใบเบิก ${editing.id} · ` : 'ใบเบิกค่าส่งกรุ๊ป '}เดือน${monthLabel(month)}`}
      description={`${duties.length} กรุ๊ป · ค่าส่งกรุ๊ปรวม ${formatCurrency(feeTotal, 'THB')}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!ok}
            onClick={async () => {
              setSaving(true);
              try { await onSubmit(build(), note.trim()); } finally { setSaving(false); }
            }}
          >
            {editing ? 'บันทึกและส่งใหม่' : 'ส่งเบิก'} {formatCurrency(total, 'THB')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-sm font-medium zego-text-secondary">ค่าส่งกรุ๊ป <span className="text-xs zego-text-tertiary">· ติ๊กกรุ๊ปที่จะเบิกในใบนี้</span></p>
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg zego-surface-soft-bg text-sm">
            {options.map((duty) => {
              const fee = feeOf(duty, rates);
              const on = selected.has(duty.periodId);
              return (
              <li key={duty.periodId}>
                <label className={cx('flex cursor-pointer items-start gap-2.5 px-3 py-2', !on && 'opacity-60')}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" checked={on} onChange={() => toggle(duty.periodId)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium zego-text">{duty.period?.groupCode ?? periodCodeOf(duty.periodId)}</span>
                  <span className="block text-xs zego-text-tertiary">
                    ไปส่ง {formatDate(duty.dutyDate)}{fee.holiday ? ` · วันหยุด (${fee.holiday})` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums zego-text">{formatCurrency(fee.amount, 'THB')}</span>
                </label>
              </li>
              );
            })}
          </ul>
          {duties.length === 0 && <p className="mt-1 text-xs zego-text-warning">เลือกอย่างน้อย 1 กรุ๊ป</p>}
          {editing?.status === 'revise' && <p className="mt-1 text-xs zego-text-tertiary">บันทึกแล้วใบนี้จะถูกส่งให้บัญชีตรวจอีกครั้ง</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium zego-text-secondary">ค่าใช้จ่ายอื่น <span className="text-xs zego-text-tertiary">(ไม่บังคับ)</span></p>
            <button
              type="button"
              className="text-xs font-medium zego-text-info hover:underline"
              onClick={() => setExtras((xs) => [...xs, { key: Date.now(), type: SEND_OFF_EXTRA_TYPES[0], amount: '', image: null }])}
            >
              + เพิ่มรายการ
            </button>
          </div>
          {extras.map((x) => (
            <div key={x.key} className="space-y-2 rounded-lg zego-surface-soft-bg p-2">
              <div className="grid grid-cols-[1fr_6.5rem] gap-2">
                <SelectInput label="ประเภท" value={x.type} onChange={(e) => setExtra(x.key, { type: e.target.value })} options={SEND_OFF_EXTRA_TYPES.map((t) => ({ value: t, label: t }))} />
                <TextInput label="บาท" type="number" inputMode="decimal" value={x.amount} onChange={(e) => setExtra(x.key, { amount: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {x.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.image} alt="ใบเสร็จ" className="h-10 w-10 rounded border zego-border-color object-cover" />
                  ) : (
                    <span className="text-xs zego-text-tertiary">ยังไม่แนบใบเสร็จ</span>
                  )}
                  <Button variant="ghost" size="sm" icon="camera" onClick={() => { setPickFor(x.key); fileRef.current?.click(); }}>ใบเสร็จ</Button>
                </div>
                <button type="button" className="text-xs zego-text-danger hover:underline" onClick={() => setExtras((xs) => xs.filter((y) => y.key !== x.key))}>ลบ</button>
              </div>
            </div>
          ))}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && pickFor !== null) setExtra(pickFor, { image: await compressImageToDataUrl(f) });
            }}
          />
        </div>

        <TextArea label="หมายเหตุ" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">
          โอนเข้าบัญชี: {bankText ?? <span className="zego-text-warning">ยังไม่มีบัญชีรับเงิน — แจ้งผู้ดูแลให้เพิ่มในทะเบียน</span>}
        </p>
      </div>
    </Modal>
  );
}
