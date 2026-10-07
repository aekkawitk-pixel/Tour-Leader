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
import { clearChecklist, clearNotEnded, effectiveClearValues, followUpsFromClose, fxBase, fxCovered, GROUP_CLEAR_STAGE, settlementBreakdown, type GroupClearSummary } from '@/lib/logic/groupClear';
import { CLEAR_EVENT_LABEL, saveGroupClear, type ClearSettlement, type GroupClearRecord } from '@/services/groupClearStore';
import { ClearAppointmentSection } from './ClearAppointmentSection';
import { FollowUpSection } from './FollowUpSection';
import { clearAppointmentOf } from '@/services/appointmentStore';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { EnvelopeStatusBadge, StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { expenseOriginalTotals, requestedAtOf } from '@/app/guide/expenses/expenseAmounts';
import { expenseStatusMeta } from '@/lib/logic/usageReport';
import { budgetUseOf } from '@/lib/logic/groupBudget';
import { printGroupClear } from '@/lib/printGroupClear';
import type { ExpenseRequest } from '@/types';

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTotals = (list: { amount: number; currency: string }[]) => list.map((t) => formatCurrency(t.amount, t.currency)).join(' · ') || '—';
/** ยอดรวมแยกสกุลของใบเสร็จหลายใบ */
const sumTotals = (list: ExpenseRequest[]) => {
  const m = new Map<string, number>();
  for (const t of list.flatMap(expenseOriginalTotals)) m.set(t.currency, (m.get(t.currency) ?? 0) + t.amount);
  return [...m].map(([currency, amount]) => ({ currency, amount }));
};

/* ---------------- รับคืน / จ่ายเพิ่ม หลายรายการ หลายสกุล ---------------- */

/** สกุลที่คืน/จ่ายได้ — สกุลของยอดในกรุ๊ปขึ้นก่อน (ต่อท้ายตอนใช้) */
const PAY_CURRENCIES = ['THB', 'JPY', 'CNY', 'USD', 'EUR', 'HKD', 'TWD', 'KRW', 'SGD', 'VND', 'GEL', 'TRY', 'GBP', 'CHF'];
/**
 * 1 แถวที่กรอก — สกุล + จำนวนที่คืน/จ่ายจริง · สกุลอื่นกรอกอัตราแลกเปลี่ยนเพิ่ม (อ้างอิงบาท ดู fxBase)
 * ระบบแปลงกลับเป็นสกุลของยอด เพื่อคิดว่าครบ / ขาด / เกิน
 */
type PayRow = { id: string; paidCurrency: string; amount: string; rate: string };
// id ต้องไม่ซ้ำแม้โมดูลถูกโหลดใหม่ (ตัวนับเริ่มใหม่แต่ state เดิมยังอยู่) — ซ้ำแล้วแก้แถวหนึ่งจะไปทับอีกแถว
const newRow = (paidCurrency: string): PayRow => ({ id: `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, paidCurrency, amount: '', rate: '' });
const round2 = (n: number) => Math.round(n * 100) / 100;
/** ค่าที่บันทึก → แถวฟอร์ม แยกตามสกุลของยอด */
const toRows = (list: ClearSettlement[] | undefined) => {
  const m: Record<string, PayRow[]> = {};
  for (const e of list ?? []) {
    (m[e.currency] ??= []).push({ ...newRow(e.paidCurrency ?? e.currency), amount: String(e.paidAmount ?? e.amount), rate: e.fxRate ? String(e.fxRate) : '' });
  }
  return m;
};
/** ยอดที่ตัดในสกุลของยอด — สกุลเดียวกัน = จำนวน · สกุลอื่น = แปลงตามอัตรา (ยังไม่กรอกอัตรา = 0) */
const coveredOf = (cur: string, r: PayRow) => (r.paidCurrency === cur
  ? (Number(r.amount) > 0 ? Number(r.amount) : 0)
  : fxCovered(cur, r.paidCurrency, Number(r.amount), Number(r.rate)));
const badNum = (v: string) => v.trim() !== '' && !(Number(v) >= 0);
const needRate = (cur: string, r: PayRow) => r.paidCurrency !== cur && Number(r.amount) > 0 && !(Number(r.rate) > 0);
const rowBad = (cur: string, r: PayRow) => badNum(r.amount) || badNum(r.rate) || needRate(cur, r);
/** แถวฟอร์ม → ค่าที่บันทึก (เฉพาะแถวที่มียอด) */
const toList = (m: Record<string, PayRow[]>): ClearSettlement[] => Object.entries(m).flatMap(([cur, rows]) => rows
  .filter((r) => Number(r.amount) > 0)
  .map((r) => (r.paidCurrency === cur
    ? { currency: cur, amount: Number(r.amount) }
    : { currency: cur, amount: coveredOf(cur, r), paidCurrency: r.paidCurrency, paidAmount: Number(r.amount), fxRate: Number(r.rate) })));

/** กรอกรับคืน / จ่ายเพิ่ม ของยอด 1 สกุล — หลายแถว แต่ละแถว = สกุล + จำนวน (สกุลอื่นมีช่องอัตรา) */
function SettleRows({ cur, target, label, verb, rows, currencies, onChange }: {
  cur: string;
  /** "รับ" (รับคืน) / "จ่าย" (บริษัทจ่ายเพิ่ม) — ใช้ในคำอธิบายและหัวคอลัมน์ */
  verb: string;
  /** ยอดที่ต้องคืน / ต้องจ่าย (สกุล cur) */
  target: number;
  label: string;
  rows: PayRow[] | undefined;
  currencies: string[];
  onChange: (rows: PayRow[]) => void;
}) {
  // ยังไม่มีแถว = แสดงแถวว่างสกุลเดียวกับยอดให้กรอกได้เลย
  const [first] = useState(() => newRow(cur));
  const list = rows?.length ? rows : [first];
  // แก้/ลบตามตำแหน่งแถว (ไม่อิง id) — id ซ้ำจาก state เก่าจะไม่ทำให้แก้แถวหนึ่งแล้วไปทับอีกแถว
  const set = (idx: number, patch: Partial<PayRow>) => onChange(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const total = round2(list.reduce((n, r) => n + coveredOf(cur, r), 0));
  const diff = round2(target - total);
  const waitingRate = list.some((r) => needRate(cur, r));
  const input = 'h-9 rounded-lg border bg-white px-2.5 text-right text-sm tabular-nums';
  // เลื่อนลูกกลิ้งเมาส์ตอนเคอร์เซอร์อยู่บนช่องตัวเลข = เบราว์เซอร์เปลี่ยนค่าเองโดยไม่รู้ตัว — ปลดโฟกัสกันไว้
  const noWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();
  return (
    <div className="space-y-1.5">
      <p className="zego-text-secondary">{label}</p>
      {/* วิธีกรอก — สั้น ๆ ให้รู้ว่าช่องไหนคืออะไร */}
      <p className="rounded-md zego-surface-soft-bg px-2.5 py-1.5 text-[11px] leading-relaxed zego-text-secondary">
        กรอกตามเงินที่{verb}จริง 1 แถวต่อ 1 สกุล · {verb}เป็น <b>{cur}</b> กรอกจำนวนอย่างเดียว ·
        {verb}เป็นสกุลอื่น เลือกสกุล → กรอกจำนวนที่{verb} → กรอกอัตราแลกเปลี่ยนที่ตกลงกัน แล้วระบบแปลงเป็น {cur} ให้
      </p>
      {/* หัวคอลัมน์ (จอกว้าง) */}
      <div className="hidden items-center gap-2 text-[11px] font-medium zego-text-tertiary sm:flex">
        <span className="w-24">สกุลที่{verb}</span>
        <span className="w-40 text-right">จำนวนที่{verb}</span>
        {list.some((r) => r.paidCurrency !== cur) && (
          <>
            <span className="w-48">อัตราแลกเปลี่ยน</span>
            <span>คิดเป็น {cur}</span>
          </>
        )}
      </div>
      {list.map((r, idx) => {
        const other = r.paidCurrency !== cur;
        const covered = coveredOf(cur, r);
        const base = fxBase(cur, r.paidCurrency);
        // อัตราคือ "เงิน 1 หน่วยของสกุลไหน คิดเป็นกี่หน่วยของอีกสกุล"
        const from = base === 'owed' ? cur : r.paidCurrency;
        const to = base === 'owed' ? r.paidCurrency : cur;
        const a = Number(r.amount);
        const k = Number(r.rate);
        return (
          <div key={`${r.id}-${idx}`} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={`สกุลที่${verb}`} className="h-9 w-24 rounded-lg border zego-border-color bg-white px-2 text-sm" value={r.paidCurrency} onChange={(e) => set(idx, { paidCurrency: e.target.value, rate: '' })}>
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number" inputMode="decimal" min={0} aria-label={`จำนวนที่${verb} (${r.paidCurrency})`}
                className={cx(input, 'w-40', badNum(r.amount) ? 'border-rose-400' : 'zego-border-color')}
                value={r.amount} onChange={(e) => set(idx, { amount: e.target.value })} onWheel={noWheel} placeholder={`0.00 ${r.paidCurrency}`}
              />
              {other && (
                <>
                  <span className="flex w-48 items-center gap-1.5 zego-text-secondary">
                    1 {from} =
                    <input
                      type="number" inputMode="decimal" min={0} step="any" aria-label={`อัตราแลกเปลี่ยน: 1 ${from} เท่ากับกี่ ${to}`}
                      className={cx(input, 'w-24', badNum(r.rate) || needRate(cur, r) ? 'border-rose-400' : 'zego-border-color')}
                      value={r.rate} onChange={(e) => set(idx, { rate: e.target.value })} onWheel={noWheel} placeholder="อัตรา"
                    />
                    {to}
                  </span>
                  <span className={cx('tabular-nums', covered > 0 ? 'font-medium zego-text' : 'zego-text-tertiary')}>{covered > 0 ? `${money(covered)} ${cur}` : '—'}</span>
                </>
              )}
              {list.length > 1 && (
                <button type="button" aria-label="ลบรายการ" className="rounded-md p-1 zego-text-tertiary hover:text-rose-600" onClick={() => onChange(list.filter((_, i) => i !== idx))}>
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* แถวสกุลอื่น — บอกความหมายของอัตรา และแสดงวิธีคิดให้ตรวจได้ */}
            {other && (
              <p className="pl-1 text-[11px] zego-text-tertiary">
                อัตรา = เงิน 1 {from} คิดเป็นกี่ {to}
                {covered > 0 && (
                  <span className="zego-text-secondary">
                    {' · '}{money(a)} {r.paidCurrency} {base === 'owed' ? '÷' : '×'} {k.toLocaleString('th-TH', { maximumFractionDigits: 6 })} = {money(covered)} {cur}
                  </span>
                )}
              </p>
            )}
          </div>
        );
      })}
      <button type="button" className="flex items-center gap-1 font-medium zego-text-info hover:underline" onClick={() => onChange([...list, newRow(cur === 'THB' ? 'USD' : 'THB')])}>
        <Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มสกุลเงิน
      </button>
      {/* สรุปยอด — ต้องรับ / รับแล้ว (คิดเป็นสกุลของยอด) / ผลต่าง แยกกล่องให้อ่านชัด */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border zego-border-color bg-white p-2 text-center">
        <div>
          <p className="text-[11px] zego-text-tertiary">ยอดที่ต้อง{verb}</p>
          <p className="text-sm font-semibold tabular-nums zego-text">{money(target)} {cur}</p>
        </div>
        <div>
          <p className="text-[11px] zego-text-tertiary">{verb}แล้ว (คิดเป็น {cur})</p>
          <p className="text-sm font-semibold tabular-nums zego-text">{money(total)} {cur}</p>
          {/* ยังมีแถวที่ไม่ได้กรอกอัตรา — ยอดนี้ยังไม่รวมแถวนั้น บอกให้ชัดว่าเป็นยอดบางส่วน */}
          {waitingRate && <p className="text-[11px] text-amber-800">ยังไม่รวมแถวที่ไม่มีอัตรา</p>}
        </div>
        <div className={cx('rounded-md', waitingRate ? 'bg-amber-50' : Math.abs(diff) < 0.005 ? 'bg-emerald-50' : diff > 0 ? 'bg-rose-50' : 'bg-amber-50')}>
          <p className="text-[11px] zego-text-tertiary">{waitingRate ? 'ยังคำนวณไม่ได้' : Math.abs(diff) < 0.005 ? 'ผล' : diff > 0 ? 'ยังขาด' : 'เกิน'}</p>
          <p className={cx('text-sm font-semibold tabular-nums', waitingRate ? 'text-amber-800' : Math.abs(diff) < 0.005 ? 'text-emerald-700' : diff > 0 ? 'text-rose-700' : 'text-amber-800')}>
            {waitingRate ? 'กรอกอัตราให้ครบ' : Math.abs(diff) < 0.005 ? `${verb}ครบ` : `${money(Math.abs(diff))} ${cur}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** ผลการเคลียร์ 1 สกุล (หลังปิด) — ใช้เงินครบ / คืนเงิน / ใช้เกิน → จ่ายเพิ่ม / ไม่อนุมัติ */
function OutcomeLine({ b, v }: {
  b: GroupClearSummary['balance'][number];
  v: { returned: ClearSettlement[]; paidExtra: ClearSettlement[]; rejectedExtra: { currency: string; amount: number; reason?: string }[] };
}) {
  const sum = (list: { currency: string; amount: number }[]) => list.filter((x) => x.currency === b.currency).reduce((n, x) => n + x.amount, 0);
  if (Math.abs(b.remaining) < 0.005) {
    return <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{b.currency} · ใช้เงินครบ <span className="text-xs font-normal">— ไม่ต้องคืน ไม่ต้องจ่ายเพิ่ม</span></p>;
  }
  if (b.remaining > 0) {
    const ret = sum(v.returned);
    const short = b.remaining - ret;
    const detail = settlementBreakdown(v.returned, b.currency);
    return (
      <div className="rounded-lg border zego-border-color px-3 py-2 text-sm zego-text">
        {b.currency} · หัวหน้าทัวร์คืนเงิน <b className="tabular-nums">{money(b.remaining)}</b>
        <span className="block text-xs zego-text-secondary">
          รับคืนจริง {money(ret)} {b.currency}
          {short > 0.005 ? <span className="zego-text-danger"> · ค้างคืน {money(short)}</span> : ret - b.remaining > 0.005 ? ` · คืนเกิน ${money(ret - b.remaining)}` : ' · ครบ'}
        </span>
        {detail.map((t, i) => <span key={i} className="block text-xs zego-text-tertiary">· {t}</span>)}
      </div>
    );
  }
  const over = -b.remaining;
  const paid = sum(v.paidExtra);
  const rej = v.rejectedExtra.filter((x) => x.currency === b.currency);
  const open = over - paid - rej.reduce((n, x) => n + x.amount, 0);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm zego-text">
      {b.currency} · ใช้เกินเงินในซอง <b className="tabular-nums">{money(over)}</b>
      {paid > 0.005 && <span className="block text-xs text-emerald-700">บริษัทจ่ายเพิ่ม {money(paid)} {b.currency}</span>}
      {settlementBreakdown(v.paidExtra, b.currency).map((t, i) => <span key={i} className="block text-xs zego-text-tertiary">· {t}</span>)}
      {rej.map((x, i) => <span key={i} className="block text-xs zego-text-danger">ไม่อนุมัติจ่ายเพิ่ม {money(x.amount)}{x.reason ? ` — ${x.reason}` : ''}</span>)}
      {open > 0.005 && <span className="block text-xs zego-text-warning">ยังค้างพิจารณา / จ่ายเพิ่ม {money(open)}</span>}
    </div>
  );
}

/** รายการใบเสร็จ — ชื่อรายการ · วันเวลาที่บันทึก · ยอด · สถานะตรวจ */
function ReceiptList({ list }: { list: ExpenseRequest[] }) {
  return (
    <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color bg-white text-sm">
      {list.map((r) => (
        <li key={r.id} className="flex items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate zego-text">{r.lines[0]?.purpose || r.lines[0]?.expenseType || 'ใบเสร็จ'}</span>
            {/* ใบเสร็จไม่ใช่ใบเบิก — ไม่แสดงเลข EXP (เลขภายในระบบ) · บอกวันเวลาที่บันทึกแทน */}
            <span className="block text-[11px] zego-text-tertiary">บันทึก {formatDateTime(requestedAtOf(r))}{r.lines.length > 1 ? ` · ${r.lines.length} รายการ` : ''}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums zego-text">{fmtTotals(expenseOriginalTotals(r))}</span>
          <StatusBadge meta={expenseStatusMeta(r)} size="sm" />
        </li>
      ))}
    </ul>
  );
}

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
  /** keepOpen = บันทึกความคืบหน้า (ยังไม่ปิด) — คงแผงไว้ให้พิมพ์ใบเคลียร์เงินต่อได้ */
  onSaved: (keepOpen?: boolean) => void;
}) {
  const { currentUser, pushToast, appointments, changeAppointmentStatus, expenses } = useDemo();
  // ใบเสร็จตามรายการเบิก / นอกรายการเบิก (ไม่ได้ผูก หรือรายการที่ผูกถูกลบออกจากใบเบิกแล้ว)
  const outsideReceipts = summary.receipts.filter((r) => budgetUseOf(expenses, r).kind === 'outside');
  const inListReceipts = summary.receipts.filter((r) => !outsideReceipts.includes(r));
  const p = getTourPeriodById(summary.periodId);
  const closed = summary.stage === 'closed' || summary.stage === 'closed_partial';
  /*
    เงินคืนจริง / บริษัทจ่ายเพิ่ม — ต่อสกุลของยอด กรอกได้หลายรายการ และจ่ายเป็นสกุลอื่นได้ (กรอกอัตรา)
    ค่าที่บันทึกไว้ก่อน ไม่มีจึงตั้งต้นว่าง (กรอกตามที่รับ/จ่ายจริง)
  */
  const [returned, setReturned] = useState<Record<string, PayRow[]>>(() => toRows(record?.returned));
  const [paidExtra, setPaidExtra] = useState<Record<string, PayRow[]>>(() => toRows(record?.paidExtra));
  const payCurrencies = [...new Set([...summary.balance.map((b) => b.currency), ...PAY_CURRENCIES])];
  // ใช้เกินซอง — แยกสกุล: บริษัทจ่ายเพิ่ม (pay) หรือ ไม่อนุมัติจ่ายเพิ่ม (reject · ต้องมีเหตุผล)
  const [overMode, setOverMode] = useState<Record<string, 'pay' | 'reject'>>(() => Object.fromEntries((record?.rejectedExtra ?? []).map((x) => [x.currency, 'reject' as const])));
  const [rejectReason, setRejectReason] = useState<Record<string, string>>(() => Object.fromEntries((record?.rejectedExtra ?? []).map((x) => [x.currency, x.reason])));
  const [noPerDiem, setNoPerDiem] = useState(!!record?.noPerDiem);
  const [note, setNote] = useState(record?.note ?? '');
  const [partialReason, setPartialReason] = useState(record?.partialReason ?? '');
  const s = GROUP_CLEAR_STAGE[summary.stage];
  const isRejected = (c: string) => overMode[c] === 'reject';
  /** ไม่อนุมัติจ่ายเพิ่ม = ทั้งยอดที่ใช้เกินของสกุลนั้น */
  const rejectedList = summary.balance.filter((b) => b.remaining < -0.005 && isRejected(b.currency))
    .map((b) => ({ currency: b.currency, amount: Math.round(-b.remaining * 100) / 100, reason: (rejectReason[b.currency] ?? '').trim() }));
  /** จ่ายเพิ่ม — เฉพาะสกุลที่เลือก "บริษัทจ่ายเพิ่ม" (สลับไปไม่อนุมัติแล้วยอดที่กรอกไว้ไม่นับ) */
  const paidExtraList = () => toList(paidExtra).filter((x) => !isRejected(x.currency));
  const badReject = rejectedList.some((x) => !x.reason);
  // เช็กลิสต์ — ปิดแล้วใช้ค่าที่บันทึก + การชำระยอดค้างติดตาม · ยังไม่ปิดใช้ค่าที่กำลังกรอก
  const checks = clearChecklist(summary, closed
    ? effectiveClearValues(record)
    : { returned: toList(returned), paidExtra: paidExtraList(), rejectedExtra: rejectedList, noPerDiem });
  const allOk = checks.every((c) => c.ok);
  // นับเฉพาะข้อที่เกี่ยวข้อง — ข้อสีเทา (ไม่เกี่ยวข้อง / ยังไม่ถึงเวลาตรวจ) ไม่นับ
  const counted = checks.filter((c) => !c.na);
  const okCount = counted.filter((c) => c.ok).length;
  const notEnded = clearNotEnded(summary.stage);
  // ปิดได้เมื่อจบทริปแล้ว — ครบ = เคลียร์ครบ · ไม่ครบ = ปิดแบบมีค้าง (ต้องมีเหตุผล)
  const canClose = !notEnded;
  const canAppoint = summary.stage === 'ready' || (summary.stage === 'waiting_leader' && summary.pendingDocs === 0);
  const badAmount = [returned, paidExtra].some((m) => Object.entries(m).some(([cur, rows]) => rows.some((r) => rowBad(cur, r))));
  const needReason = !allOk && !partialReason.trim();

  const values = () => ({
    returned: toList(returned),
    paidExtra: paidExtraList(),
    ...(rejectedList.length ? { rejectedExtra: rejectedList } : {}),
    ...(noPerDiem ? { noPerDiem: true } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  });
  /*
    พิมพ์ใบเคลียร์เงินได้หลังบันทึกแล้วเท่านั้น — ตัวเลขบนกระดาษต้องตรงกับในระบบ
    เทียบค่าที่กรอกกับที่บันทึกไว้ (เรียงตามสกุล ไม่สนลำดับ) · ยังไม่เคยบันทึก = ยังพิมพ์ไม่ได้
  */
  type Amt = ClearSettlement & { reason?: string };
  const sortAmt = (l: Amt[] = []) => l.map((x) => [x.currency, x.amount, x.paidCurrency ?? '', x.paidAmount ?? 0, x.fxRate ?? 0, x.reason ?? '']).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const sig = (v: { returned: Amt[]; paidExtra?: Amt[]; rejectedExtra?: Amt[]; noPerDiem?: boolean; note?: string }) =>
    JSON.stringify([sortAmt(v.returned), sortAmt(v.paidExtra), sortAmt(v.rejectedExtra), !!v.noPerDiem, v.note ?? '']);
  const unsaved = !record || sig(values()) !== sig(record);
  /** บันทึกความคืบหน้า (ยังไม่ปิด) */
  const saveProgress = () => {
    try {
      saveGroupClear({ ...(record ?? { history: [] }), periodId: summary.periodId, ...values() });
      pushToast('success', 'บันทึกแล้ว (ยังไม่ปิด)', `${p?.groupCode ?? periodCodeOf(summary.periodId)} · ครบ ${okCount}/${counted.length}`);
      onSaved(true);
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
        followUps: followUpsFromClose(summary, { returned: toList(returned), paidExtra: paidExtraList(), rejectedExtra: rejectedList }, at, currentUser.name),
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
      pushToast(kind === 'complete' ? 'success' : 'info', kind === 'complete' ? 'เคลียร์ครบ — ปิดการเคลียร์แล้ว' : 'ปิดแบบมีค้างแล้ว', p?.groupCode ?? periodCodeOf(summary.periodId));
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
      ...(record.rejectedExtra ? { rejectedExtra: record.rejectedExtra } : {}),
      ...(record.noPerDiem ? { noPerDiem: true } : {}),
      history: [...record.history, { at, by: currentUser.name, action: 'reopen' }],
    });
    pushToast('info', 'เปิดการเคลียร์เงินกรุ๊ปใหม่แล้ว', p?.groupCode ?? periodCodeOf(summary.periodId));
    onSaved();
  };

  /** ค่าที่ใช้แสดง/พิมพ์ — ปิดแล้ว = ที่บันทึก (รวมการชำระยอดค้าง) · ยังไม่ปิด = ที่กำลังกรอก */
  const effective = closed
    ? effectiveClearValues(record)
    : { returned: toList(returned), paidExtra: paidExtraList(), rejectedExtra: rejectedList, noPerDiem };
  const print = () => printGroupClear({
    summary, period: p, leaderName: leader?.name ?? '—',
    returned: effective.returned, paidExtra: effective.paidExtra, rejectedExtra: closed ? record?.rejectedExtra ?? [] : rejectedList,
    outsideReceipts, note: closed ? record?.note : note.trim() || undefined,
    ...(closed && record?.closedAt ? { closed: { at: record.closedAt, by: record.closedBy ?? '', kind: record.closeKind } } : {}),
    printedBy: currentUser.name,
  });

  const th = 'px-2 py-1.5 text-right text-xs font-medium zego-text-tertiary';
  return (
    <Drawer
      open
      onClose={onClose}
      size="xl"
      title={`เคลียร์เงินกรุ๊ป ${p?.groupCode ?? periodCodeOf(summary.periodId)}`}
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
            <Button variant="secondary" disabled={badAmount || badReject} onClick={saveProgress}>บันทึก (ยังไม่ปิด)</Button>
            <Button variant={allOk ? 'primary' : 'secondary'} disabled={!canClose || badAmount || badReject || needReason} onClick={close}>
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
        {closed && record && <FollowUpSection record={record} groupCode={p?.groupCode ?? periodCodeOf(summary.periodId)} onSaved={onSaved} />}

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
                    <th className={th}>ใช้ตามใบเสร็จ (ตรวจแล้ว)</th>
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
                        <span className="block text-[11px] zego-text-tertiary">{notEnded ? 'คงเหลือในซอง' : b.remaining > 0 ? 'หัวหน้าทัวร์ต้องคืน' : b.remaining < 0 ? 'ใช้เกินเงินในซอง' : 'ใช้เงินครบ'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* นอกรายการเบิก — ไม่ใช่เงินในซอง จึงไม่อยู่ในตารางและไม่หักจากคงเหลือ */}
          {summary.outside.length > 0 && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
              <span className="font-semibold">นอกรายการเบิก — ไม่ใช่เงินในซอง ไม่หักจากคงเหลือ:</span>{' '}
              {summary.outside.map((o) => [
                o.approved > 0 && `ตรวจแล้ว ${formatCurrency(o.approved, o.currency)}`,
                o.pending > 0 && `รอตรวจ ${formatCurrency(o.pending, o.currency)}`,
              ].filter(Boolean).join(' · ')).join(' · ')}
            </p>
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

        {/* ใบเสร็จ — แยกนอกรายการเบิกออกมาให้เห็นชัด (ไม่ได้ผูกกับรายการในใบเบิกเงินทดรอง ต้องดูเหตุผลประกอบ) */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">ใบเสร็จค่าใช้จ่าย ({summary.receipts.length})</h3>
            <Link href="/expenses" className="text-xs font-medium zego-text-info hover:underline">ตรวจที่ ตรวจสอบรายการจ่าย →</Link>
          </div>
          {summary.receipts.length === 0 ? (
            <p className="rounded-lg border zego-border-color px-3 py-2.5 text-xs zego-text-tertiary">ยังไม่มีใบเสร็จ</p>
          ) : (
            <>
              {inListReceipts.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium zego-text-secondary">ตามรายการเบิก ({inListReceipts.length})</p>
                  <ReceiptList list={inListReceipts} />
                </div>
              )}
              {outsideReceipts.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2">
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 px-1">
                    <p className="text-xs font-semibold text-amber-900">
                      นอกรายการเบิก ({outsideReceipts.length}) <span className="font-normal">— ไม่ใช่เงินในซอง ไม่หักจากคงเหลือ · ต้องดูเหตุผลประกอบ</span>
                    </p>
                    <p className="text-xs font-semibold tabular-nums text-amber-900">รวม {fmtTotals(sumTotals(outsideReceipts))}</p>
                  </div>
                  <ReceiptList list={outsideReceipts} />
                </div>
              )}
            </>
          )}
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
            groupCode={p?.groupCode ?? periodCodeOf(summary.periodId)}
            leader={leader}
            canAppoint={canAppoint}
            blockedReason={notEnded ? 'ยังไม่จบทริป'
              : summary.stage === 'waiting_docs' ? 'ยังมีเอกสารรอตรวจ'
                : 'หัวหน้าทัวร์ยังไม่ส่งเอกสารครบ'}
          />
        )}

        {/* ผลการเคลียร์แยกสกุล — ใช้เงินครบ / หัวหน้าทัวร์คืนเงิน / ใช้เกิน (บริษัทจ่ายเพิ่ม หรือไม่อนุมัติจ่ายเพิ่ม) · พิมพ์ใบเคลียร์เงินได้ทุกกรณี */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold zego-text">{closed ? 'ผลการเคลียร์' : 'ผลการเคลียร์ — รับเงินคืน / จ่ายเพิ่ม'}</h3>
            <span className="flex items-center gap-2">
              {!closed && unsaved && <span className="text-xs zego-text-warning">บันทึกก่อนจึงพิมพ์ได้</span>}
              <Button
                variant="secondary" size="sm" icon="download"
                disabled={!closed && unsaved}
                title={!closed && unsaved ? 'มีค่าที่ยังไม่บันทึก — กด "บันทึก (ยังไม่ปิด)" ก่อน' : undefined}
                onClick={print}
              >
                พิมพ์ใบเคลียร์เงิน
              </Button>
            </span>
          </div>
          {summary.balance.length === 0 ? (
            <p className="text-xs zego-text-tertiary">ไม่มีเงินในซองที่ต้องเคลียร์</p>
          ) : closed ? (
            <div className="space-y-2">
              {summary.balance.map((b) => <OutcomeLine key={b.currency} b={b} v={effective} />)}
              {record?.note && <p className="text-xs zego-text-secondary">หมายเหตุ: {record.note}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {summary.balance.map((b) => {
                const cur = b.currency;
                // ใช้เงินครบ — ไม่ต้องคืน ไม่ต้องจ่ายเพิ่ม
                if (Math.abs(b.remaining) < 0.005) {
                  return (
                    <div key={cur} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                      <Icon name="check" className="h-4 w-4 text-emerald-700" />
                      <span className="font-semibold text-emerald-800">{cur} · ใช้เงินครบ</span>
                      <span className="text-xs text-emerald-800">— ไม่ต้องคืน ไม่ต้องจ่ายเพิ่ม</span>
                    </div>
                  );
                }
                // ใช้ไม่ครบ — หัวหน้าทัวร์ต้องคืนตามจำนวน
                if (b.remaining > 0) {
                  return (
                    <div key={cur} className="space-y-1.5 rounded-lg border zego-border-color px-3 py-2 text-xs">
                      <p className="font-medium zego-text">{cur} · หัวหน้าทัวร์ต้องคืน <span className="font-semibold tabular-nums zego-text-danger">{money(b.remaining)}</span></p>
                      <SettleRows
                        cur={cur} target={b.remaining} label="รับคืนจริง" verb="รับ"
                        rows={returned[cur]} currencies={payCurrencies}
                        onChange={(rows) => setReturned((m) => ({ ...m, [cur]: rows }))}
                      />
                    </div>
                  );
                }
                // ใช้เกินเงินในซอง — บริษัทจ่ายเพิ่ม หรือ ไม่อนุมัติจ่ายเพิ่ม (ต้องมีเหตุผล)
                const over = -b.remaining;
                const mode = overMode[cur] ?? 'pay';
                return (
                  <div key={cur} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs">
                    <p className="font-medium zego-text">{cur} · ใช้เกินเงินในซอง <span className="font-semibold tabular-nums text-amber-800">{money(over)}</span></p>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`ผลการพิจารณาส่วนที่ใช้เกิน ${cur}`}>
                      {([['pay', 'บริษัทจ่ายเพิ่ม'], ['reject', 'ไม่อนุมัติจ่ายเพิ่ม']] as const).map(([k, label]) => (
                        <label key={k} className={cx('flex cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-sm', mode === k ? (k === 'pay' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-rose-400 ring-1 ring-rose-400') : 'zego-border-color')}>
                          <input type="radio" name={`over-${cur}`} className="accent-emerald-600" checked={mode === k} onChange={() => setOverMode((m) => ({ ...m, [cur]: k }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                    {mode === 'pay' ? (
                      <SettleRows
                        cur={cur} target={over} label="บริษัทจ่ายเพิ่มแล้ว" verb="จ่าย"
                        rows={paidExtra[cur]} currencies={payCurrencies}
                        onChange={(rows) => setPaidExtra((m) => ({ ...m, [cur]: rows }))}
                      />
                    ) : (
                      <label className="block">
                        <span className="mb-1 block zego-text-secondary">เหตุผลที่ไม่อนุมัติ <span className="text-rose-600">*</span> <span className="zego-text-tertiary">— หัวหน้าทัวร์รับผิดชอบส่วนเกิน {money(over)} {cur} เอง</span></span>
                        <textarea rows={2} className={cx('w-full rounded-lg border bg-white px-2.5 py-2 text-sm', rejectReason[cur]?.trim() ? 'zego-border-color' : 'border-rose-300')} value={rejectReason[cur] ?? ''} onChange={(e) => { const v = e.target.value; setRejectReason((m) => ({ ...m, [cur]: v })); }} placeholder="เช่น ใช้จ่ายเกินโดยไม่ได้แจ้งขออนุมัติล่วงหน้า" />
                      </label>
                    )}
                  </div>
                );
              })}
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
