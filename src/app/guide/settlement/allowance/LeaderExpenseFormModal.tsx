'use client';

/**
 * เอกสารค่าใช้จ่ายหัวหน้าทัวร์ (ใบเบิกเบี้ยเลี้ยง) — ตามแบบฟอร์มกระดาษของบริษัท
 *
 * หัวเอกสาร: จำนวนลูกค้า (+ หัวหน้าทัวร์) · ลูกค้ายกเลิกเดินทาง · เบอร์ติดต่อ
 * รายการตั้งต้น 5 รายการ (LEADER_FORM_ITEMS):
 *   1) ค่าเบี้ยเลี้ยง = อัตราที่ฝ่ายจัดหัวหน้าทัวร์ตั้ง (เฉพาะโปรแกรม หรือค่าเริ่มต้นของประเทศ) × จำนวนวันเดินทาง — ไม่มีอัตรา = กรอกเอง บัญชีตรวจ
 *   2–5) ค่าเบ็ดเตล็ด / ค่าเค้กวันเกิด / ค่ามื้ออาหารอิสระ / ค่าวีซ่า — กรอกรายละเอียด ยอด สกุลเงิน และหมายเหตุ
 * มีรายการอื่นเพิ่ม → กด "เพิ่มรายการ" แล้วพิมพ์ชื่อรายการเอง (เช่น คืนค่า ADV) · ลบได้ · ช่องที่ไม่กรอกยอด = ไม่มีรายการนั้น
 * ทุกรายการกรอก ราคา × จำนวน = จำนวนเงิน (เบี้ยเลี้ยง: ราคา = อัตรา/วัน · จำนวน = วันเดินทาง)
 * ยอดแยกตามสกุลเงิน (บาท / สกุลอื่น) ไม่แปลง — เหมือนช่อง "บาท" กับ "สกุลอื่นๆ" ในแบบฟอร์ม
 * บันทึกร่างรอไว้ได้ตลอด (ก่อน/ระหว่างเดินทาง) · ส่งอนุมัติได้เมื่อจบทริปแล้ว (canSubmit)
 * จอมือถือ: แต่ละรายการเรียงเป็นการ์ด · จอกว้าง: เรียงเป็นตาราง คอลัมน์ตรงกันทุกแถว
 */

import { useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { formatCurrency, formatDate, formatDateRange } from '@/lib/format';
import { LEADER_FORM_ITEMS, tripDays } from '@/lib/logic/leaderClaims';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

export type LeaderClaimForm = NonNullable<ExpenseRequest['claimForm']>;

const CURRENCIES = ['THB', 'JPY', 'CNY', 'USD', 'EUR', 'HKD', 'TWD', 'KRW', 'SGD', 'VND', 'GEL', 'TRY', 'GBP', 'CHF'];
/** รายการตั้งต้นข้อ 2–5 — เบี้ยเลี้ยง (ข้อ 1) มีแถวเดียวคำนวณให้ */
const EXTRA_ITEMS: readonly string[] = LEADER_FORM_ITEMS.slice(1);

interface Row { key: string; item: string; added: boolean; detail: string; price: string; qty: string; currency: string; note: string }

/** คอลัมน์ของตาราง (จอกว้าง) — No · รายการ · รายละเอียด · ราคา · จำนวน · จำนวนเงิน · สกุล · หมายเหตุ · ลบ */
const GRID = 'sm:grid sm:grid-cols-[1.5rem_7.5rem_minmax(0,1fr)_6.5rem_4.5rem_7rem_5rem_minmax(0,0.7fr)_1.75rem] sm:items-center sm:gap-2';
/** ยอดรายการ = ราคา × จำนวน (กรอกไม่ครบ = 0) */
const amountOf = (x: Pick<Row, 'price' | 'qty'>) => {
  const p = Number(x.price);
  const q = Number(x.qty);
  return p > 0 && q > 0 ? p * q : 0;
};
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LeaderExpenseFormModal({
  period,
  existing,
  programRate,
  defaultPhone,
  paxSource,
  canSubmit,
  onClose,
  onSave,
}: {
  period: TourPeriodMaster;
  existing: ExpenseRequest | null;
  /** อัตราเบี้ยเลี้ยงต่อวันของโปรแกรมนี้ — null = ยังไม่ตั้ง */
  programRate: number | null;
  defaultPhone: string;
  /**
   * จำนวนลูกค้าตั้งต้น — จากเอกสารเบิกที่นำเข้าของกรุ๊ปนี้ (เช่น "34 ท่าน + 1 TL") ก่อน
   * ไม่มีจึงใช้ยอดจองของพีเรียด · ใบที่บันทึกไว้แล้วใช้ค่าที่บันทึก
   */
  paxSource: { pax: number; leaders: number | null; label: string } | null;
  /** จบทริปแล้ว — ส่งอนุมัติได้ (ยังไม่จบ = บันทึกร่างได้อย่างเดียว) */
  canSubmit: boolean;
  onClose: () => void;
  onSave: (lines: ExpenseLine[], form: LeaderClaimForm, note: string, submit: boolean) => Promise<void>;
}) {
  const days = tripDays(period.startDate, period.endDate);
  const prevLines = existing?.lines ?? [];
  const prevPerDiem = prevLines.find((l) => l.expenseType === LEADER_FORM_ITEMS[0]);
  const [rate, setRate] = useState(String(programRate ?? prevPerDiem?.unitPrice ?? ''));
  /*
    แถวตั้งต้น = ข้อ 2–5 ข้อละแถว · ใบเดิม: รายการแรกของแต่ละข้อลงแถวตั้งต้น
    ที่เหลือ (ซ้ำข้อเดิม / รายการที่ตั้งชื่อเอง) เป็นแถวเพิ่ม
  */
  const [rows, setRows] = useState<Row[]>(() => {
    const used = new Set<ExpenseLine>();
    const toRow = (item: string, l: ExpenseLine | undefined, added: boolean, key: string): Row => ({
      key, item, added, detail: l?.description ?? '',
      // ใบเดิมที่ไม่มีราคา/จำนวน (กรอกยอดตรง) = ราคา = ยอด × 1
      price: l ? String(l.unitPrice ?? l.amount) : '', qty: String(l?.quantity ?? 1),
      currency: l?.currency ?? 'THB', note: l?.note ?? '',
    });
    const fixed = EXTRA_ITEMS.map((item) => {
      const l = prevLines.find((x) => x.expenseType === item && !used.has(x));
      if (l) used.add(l);
      return toRow(item, l, false, `fixed-${item}`);
    });
    const extra = prevLines
      .filter((l) => !used.has(l) && l.expenseType !== LEADER_FORM_ITEMS[0])
      .map((l, i) => toRow(l.expenseType, l, true, `added-prev-${i}`));
    return [...fixed, ...extra];
  });
  const [seq, setSeq] = useState(0);
  const f = existing?.claimForm;
  const booked = (period.seatBooked ?? 0) > 0 ? period.seatBooked : null;
  const [pax, setPax] = useState(String(f?.paxCount ?? paxSource?.pax ?? booked ?? ''));
  const [leaders, setLeaders] = useState(String(f?.leaderCount ?? paxSource?.leaders ?? 1));
  const [cancelled, setCancelled] = useState(f?.cancelledPax != null ? String(f.cancelledPax) : '');
  const [phone, setPhone] = useState(f?.contactPhone ?? defaultPhone);
  const [note, setNote] = useState(existing?.note ?? '');
  const [saving, setSaving] = useState(false);

  const r = Number(rate);
  const perDiem = r > 0 ? r * days : 0;
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addRow = () => {
    setRows((rs) => [...rs, { key: `added-${seq}`, item: '', added: true, detail: '', price: '', qty: '1', currency: 'THB', note: '' }]);
    setSeq((n) => n + 1);
  };
  const removeRow = (key: string) => setRows((rs) => rs.filter((x) => x.key !== key));

  // ยอดรวมแยกสกุลเงิน — ข้อ 1 เป็นบาทเสมอ
  const totals = new Map<string, number>();
  if (perDiem > 0) totals.set('THB', perDiem);
  for (const x of rows) {
    const a = amountOf(x);
    if (a > 0) totals.set(x.currency, (totals.get(x.currency) ?? 0) + a);
  }
  // ราคาที่กรอกต้องมากกว่า 0 และมีจำนวน (เว้นราคาว่าง = ไม่มีรายการนี้)
  const isBad = (x: Row) => x.price.trim() !== '' && (!(Number(x.price) > 0) || !(Number(x.qty) > 0));
  // รายการที่เพิ่มเองต้องมีชื่อเมื่อกรอกยอด
  const needsName = (x: Row) => x.added && amountOf(x) > 0 && !x.item.trim();
  const badRow = rows.some(isBad);
  const missingName = rows.some(needsName);
  const ok = totals.size > 0 && !badRow && !missingName;
  // ร่างบันทึกได้แม้ยังกรอกไม่ครบ — ขอแค่ยอดที่กรอกเป็นตัวเลขถูกต้อง
  const draftOk = !badRow;
  // ใบที่ส่งอนุมัติไปแล้ว (รออนุมัติ) ไม่ย้อนกลับเป็นร่าง — แก้แล้วต้องส่งใหม่
  const canDraft = !existing || existing.status === 'draft' || existing.status === 'revise';
  const endText = formatDate(period.endDate ?? period.startDate);

  const save = async (submit: boolean) => {
    const at = period.endDate ?? period.startDate;
    const base = { receiptNo: '', evidenceFileName: '', receiptDate: at };
    const lines: ExpenseLine[] = [];
    if (perDiem > 0) {
      lines.push({
        ...base, id: 'L-1', expenseType: LEADER_FORM_ITEMS[0],
        purpose: `${LEADER_FORM_ITEMS[0]} ${formatCurrency(r, 'THB')} × ${days} วัน`,
        description: programRate && programRate === r ? 'อัตรามาตรฐาน' : 'อัตรากรอกเอง (ยังไม่ตั้ง/ต่างจากอัตรามาตรฐาน)',
        quantity: days, unitPrice: r, amount: perDiem, currency: 'THB', fxRate: 1, amountTHB: perDiem,
      });
    }
    // ตามลำดับบนฟอร์ม — ข้อตั้งต้นก่อน แล้วรายการที่เพิ่มเอง
    rows.forEach((x) => {
      const a = amountOf(x);
      if (!(a > 0)) return;
      const name = x.item.trim();
      lines.push({
        ...base, id: `L-${lines.length + 1}`, expenseType: name,
        purpose: x.detail.trim() ? `${name} · ${x.detail.trim()}` : name,
        description: x.detail.trim(), note: x.note.trim() || undefined,
        unitPrice: Number(x.price), quantity: Number(x.qty), amount: a, currency: x.currency,
        // สกุลอื่นไม่แปลงเป็นบาท (ตามแบบฟอร์ม) — amountTHB นับเฉพาะรายการบาท
        fxRate: x.currency === 'THB' ? 1 : 0, amountTHB: x.currency === 'THB' ? a : 0,
      });
    });
    setSaving(true);
    try {
      await onSave(lines, {
        paxCount: Number(pax) > 0 ? Number(pax) : null,
        leaderCount: Number(leaders) >= 0 ? Number(leaders) : 1,
        cancelledPax: cancelled.trim() === '' ? null : Number(cancelled),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
      }, note.trim(), submit);
    } finally {
      setSaving(false);
    }
  };

  const input = 'h-9 w-full rounded-lg border zego-border-color bg-white px-2.5 text-sm zego-text placeholder:text-[var(--zego-text-tertiary)] focus:border-[var(--zego-primary-500)] focus:outline-none';
  const label = 'mb-1 block text-xs font-medium zego-text-secondary';
  /** ป้ายช่องบนมือถือ (จอกว้างมีหัวตารางแล้ว) */
  const mLabel = 'mb-0.5 block text-[11px] zego-text-tertiary sm:hidden';

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${existing ? 'แก้ไข' : ''}เอกสารค่าใช้จ่ายหัวหน้าทัวร์`}
      description={`${period.groupCode} · ${period.programCode ? `${period.programCode} · ` : ''}${formatDateRange(period.startDate, period.endDate)} (${days} วัน)`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="min-w-0">
            <span className="block text-sm zego-text-secondary">
              รวม <span className="font-semibold tabular-nums zego-text">{[...totals].map(([c, a]) => formatCurrency(a, c)).join(' · ') || '—'}</span>
            </span>
            {!canSubmit && <span className="block text-xs zego-text-warning">ส่งอนุมัติได้ตั้งแต่ {endText} (จบทริป)</span>}
          </span>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
            {canDraft && (
              <Button variant="secondary" loading={saving} disabled={!draftOk} onClick={() => void save(false)}>บันทึกร่าง</Button>
            )}
            <Button
              variant="primary"
              loading={saving}
              disabled={!ok || !canSubmit}
              title={canSubmit ? undefined : `ยังไม่จบทริป — ส่งอนุมัติได้ตั้งแต่ ${endText}`}
              onClick={() => void save(true)}
            >
              {existing && existing.status !== 'draft' ? 'บันทึกและส่งใหม่' : 'ส่งอนุมัติ'}
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-5">
        {/* หัวเอกสาร */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">ข้อมูลกรุ๊ป</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className={label}>จำนวนลูกค้า (ท่าน)</span>
              <input type="number" inputMode="numeric" min={0} className={cx(input, 'tabular-nums')} value={pax} onChange={(e) => setPax(e.target.value)} placeholder="ระบุจำนวน" />
              {paxSource ? (
                <span className="mt-0.5 block text-[11px] zego-text-tertiary">ตาม{paxSource.label}</span>
              ) : booked ? (
                <span className="mt-0.5 block text-[11px] zego-text-tertiary">ยอดจอง {booked} ท่าน</span>
              ) : (
                <span className="mt-0.5 block text-[11px] zego-text-warning">ไม่พบจำนวนลูกค้าในระบบ — กรอกตามจริง</span>
              )}
            </label>
            <label className="block">
              <span className={label}>หัวหน้าทัวร์ (+)</span>
              <input type="number" inputMode="numeric" min={0} className={cx(input, 'tabular-nums')} value={leaders} onChange={(e) => setLeaders(e.target.value)} />
            </label>
            <label className="block">
              <span className={label}>ลูกค้ายกเลิกเดินทาง (คน)</span>
              <input type="number" inputMode="numeric" min={0} className={cx(input, 'tabular-nums')} value={cancelled} onChange={(e) => setCancelled(e.target.value)} placeholder="ไม่มี" />
            </label>
            <label className="block">
              <span className={label}>เบอร์ติดต่อ</span>
              <input type="tel" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
        </section>

        {/* รายการ */}
        <section>
          <h3 className="mb-2 text-sm font-semibold zego-text">รายการเบิก</h3>
          <div className="overflow-hidden rounded-lg border zego-border-color">
            {/* หัวตาราง (จอกว้าง) */}
            <div className={cx('hidden zego-surface-soft-bg px-3 py-2 text-xs font-medium zego-text-tertiary', GRID)}>
              <span>No.</span>
              <span>รายการ</span>
              <span>รายละเอียด</span>
              <span className="text-right">ราคา</span>
              <span className="text-right">จำนวน</span>
              <span className="text-right">จำนวนเงิน</span>
              <span>สกุล</span>
              <span>หมายเหตุ</span>
              <span />
            </div>

            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {/* 1) ค่าเบี้ยเลี้ยง — คำนวณจากอัตรา × วัน */}
              <li className={cx('space-y-2 px-3 py-2.5 sm:space-y-0', GRID)}>
                <span className="hidden text-sm tabular-nums zego-text-secondary sm:block">1</span>
                <span className="block text-sm font-medium zego-text"><span className="sm:hidden">1. </span>{LEADER_FORM_ITEMS[0]}</span>
                <span className="block text-xs zego-text-tertiary">{programRate !== null ? 'อัตราต่อวันมาตรฐาน × วันเดินทาง' : 'กรอกอัตราต่อวันเอง × วันเดินทาง'}</span>
                <span className="grid grid-cols-2 gap-2 sm:contents">
                  <span className="block">
                    <span className={mLabel}>ราคา (อัตรา/วัน)</span>
                    <input
                      type="number" inputMode="decimal" min={0} aria-label="อัตราเบี้ยเลี้ยงต่อวัน"
                      className={cx(input, 'text-right tabular-nums', programRate !== null && 'zego-surface-soft-bg')}
                      value={rate} disabled={programRate !== null} onChange={(e) => setRate(e.target.value)} placeholder="0.00"
                    />
                  </span>
                  <span className="block">
                    <span className={mLabel}>จำนวน (วัน)</span>
                    <span className={cx(input, 'flex items-center justify-end zego-surface-soft-bg tabular-nums')}>{days} วัน</span>
                  </span>
                  <span className="block">
                    <span className={mLabel}>จำนวนเงิน</span>
                    <span className={cx(input, 'flex items-center justify-end zego-surface-soft-bg font-semibold tabular-nums')}>{perDiem > 0 ? money(perDiem) : '—'}</span>
                  </span>
                  <span className="block">
                    <span className={mLabel}>สกุล</span>
                    <span className={cx(input, 'flex items-center zego-surface-soft-bg zego-text-secondary')}>THB</span>
                  </span>
                </span>
                <span className="hidden sm:block" />
                <span className="hidden sm:block" />
              </li>

              {rows.map((x, i) => (
                <li key={x.key} className={cx('space-y-2 px-3 py-2.5 sm:space-y-0', GRID)}>
                  <span className="hidden text-sm tabular-nums zego-text-secondary sm:block">{i + 2}</span>
                  <span className="flex items-center justify-between gap-2">
                    {x.added ? (
                      <input
                        aria-label="ชื่อรายการ"
                        className={cx(input, 'font-medium', needsName(x) && 'border-amber-400')}
                        value={x.item} onChange={(e) => setRow(x.key, { item: e.target.value })}
                        placeholder="ชื่อรายการ"
                      />
                    ) : (
                      <span className="text-sm font-medium zego-text"><span className="sm:hidden">{i + 2}. </span>{x.item}</span>
                    )}
                    {x.added && (
                      <button type="button" aria-label="ลบรายการ" onClick={() => removeRow(x.key)} className="rounded-md p-1 zego-text-tertiary hover:text-rose-600 sm:hidden">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                  <span className="block">
                    <span className={mLabel}>รายละเอียด</span>
                    <input
                      aria-label={`รายละเอียด ${x.item || 'รายการที่เพิ่ม'}`}
                      className={input}
                      value={x.detail} onChange={(e) => setRow(x.key, { detail: e.target.value })}
                      placeholder="รายละเอียด (ถ้ามี)"
                    />
                  </span>
                  <span className="grid grid-cols-2 gap-2 sm:contents">
                    <span className="block">
                      <span className={mLabel}>ราคา</span>
                      <input
                        type="number" inputMode="decimal" min={0} aria-label={`ราคา ${x.item}`}
                        className={cx(input, 'text-right tabular-nums', isBad(x) && Number(x.price) <= 0 && 'border-rose-400')}
                        value={x.price} onChange={(e) => setRow(x.key, { price: e.target.value })} placeholder="0.00"
                      />
                    </span>
                    <span className="block">
                      <span className={mLabel}>จำนวน</span>
                      <input
                        type="number" inputMode="decimal" min={0} aria-label={`จำนวน ${x.item}`}
                        className={cx(input, 'text-right tabular-nums', isBad(x) && !(Number(x.qty) > 0) && 'border-rose-400')}
                        value={x.qty} onChange={(e) => setRow(x.key, { qty: e.target.value })}
                      />
                    </span>
                    <span className="block">
                      <span className={mLabel}>จำนวนเงิน</span>
                      <span className={cx(input, 'flex items-center justify-end zego-surface-soft-bg font-semibold tabular-nums')}>{amountOf(x) > 0 ? money(amountOf(x)) : '—'}</span>
                    </span>
                    <span className="block">
                      <span className={mLabel}>สกุล</span>
                      <select aria-label={`สกุลเงิน ${x.item}`} className={input} value={x.currency} onChange={(e) => setRow(x.key, { currency: e.target.value })}>
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </span>
                  </span>
                  <span className="block">
                    <span className={mLabel}>หมายเหตุ</span>
                    <input aria-label={`หมายเหตุ ${x.item}`} className={input} value={x.note} onChange={(e) => setRow(x.key, { note: e.target.value })} />
                  </span>
                  <span className="hidden sm:flex sm:justify-center">
                    {x.added && (
                      <button type="button" aria-label="ลบรายการ" title="ลบรายการ" onClick={() => removeRow(x.key)} className="rounded-md p-1 zego-text-tertiary hover:text-rose-600">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="zego-divider-top px-3 py-2">
              <Button variant="ghost" size="sm" icon="plus" onClick={addRow}>เพิ่มรายการ</Button>
            </div>
          </div>

          {/* คำเตือน — รวมไว้ใต้ตาราง ไม่แทรกในแถว */}
          <div className="mt-2 space-y-1 text-xs">
            {programRate === null && (
              <p className="flex items-start gap-1.5 zego-text-warning">
                <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                โปรแกรมนี้ยังไม่ได้ตั้งอัตราเบี้ยเลี้ยง — กรอกอัตราเอง บัญชีตรวจ
              </p>
            )}
            {badRow && <p className="zego-text-danger">ราคาและจำนวนต้องมากกว่า 0 (เว้นราคาว่าง = ไม่มีรายการนี้)</p>}
            {missingName && <p className="zego-text-warning">รายการที่เพิ่มและมียอด ต้องตั้งชื่อรายการ</p>}
          </div>
        </section>

        <label className="block">
          <span className={label}>หมายเหตุถึงบัญชี <span className="font-normal zego-text-tertiary">(ไม่บังคับ)</span></span>
          <textarea rows={2} className={cx(input, 'h-auto py-2')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
