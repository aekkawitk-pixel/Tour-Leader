'use client';

/**
 * ยอดค้างติดตาม (หลังปิดเคลียร์แบบมีค้าง) — ในแผงเคลียร์เงินกรุ๊ป
 *
 * แต่ละยอด: ใครค้างใคร · สกุล · ยอด · ชำระแล้ว / คงค้าง · ประวัติการชำระ
 * บันทึกการชำระ: เงินสด / โอน / ตัดเป็นค่าใช้จ่าย (ต้องมีผู้อนุมัติ) — ไม่มีหักจากเบี้ยเลี้ยง (นโยบายบริษัท)
 *   ยอดค้างสกุลต่างประเทศ ชำระเป็นบาทได้ — กรอกอัตราแลกเปลี่ยน (บาท / 1 หน่วย) ระบบตัดยอดสกุลเดิมให้
 * ชำระครบทุกยอด → กรุ๊ปเปลี่ยนเป็น "เคลียร์ครบ" เอง (ถ้าเช็กลิสต์ข้ออื่นผ่าน) · เพิ่มยอดค้างเองได้ (เช่น ซองแจ้งยอดไม่ตรง)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, cx } from '@/components/ui/Primitives';
import { formatCurrency, formatDateTime, toISODateTime } from '@/lib/format';
import { followUpCovered, followUpOpen, followUpRemaining } from '@/lib/logic/groupClear';
import {
  FOLLOW_UP_METHOD, FOLLOW_UP_REASON, saveGroupClear,
  type FollowUp, type FollowUpMethod, type GroupClearRecord,
} from '@/services/groupClearStore';

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = 'h-9 w-full rounded-lg border zego-border-color bg-white px-2.5 text-sm';
const label = 'mb-1 block text-xs font-medium zego-text-secondary';

export function FollowUpSection({ record, groupCode, onSaved }: { record: GroupClearRecord; groupCode: string; onSaved: () => void }) {
  const { currentUser, pushToast } = useDemo();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const items = record.followUps ?? [];

  const save = (followUps: FollowUp[], msg: string) => {
    try {
      saveGroupClear({ ...record, followUps });
      pushToast('success', msg, groupCode);
      onSaved();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold zego-text">ยอดค้างติดตาม <span className="text-xs font-normal zego-text-tertiary">({items.filter(followUpOpen).length} ยอดยังไม่ปิด)</span></h3>
        {!adding && <Button variant="ghost" size="sm" icon="plus" onClick={() => setAdding(true)}>เพิ่มยอดค้าง</Button>}
      </div>

      {items.length === 0 && !adding && <p className="rounded-lg border border-dashed zego-border-color px-3 py-3 text-xs zego-text-tertiary">ไม่มียอดค้าง</p>}

      <ul className="space-y-2">
        {items.map((f) => {
          const open = followUpOpen(f);
          const leaderOwes = f.direction === 'leader_owes';
          return (
            <li key={f.id} className={cx('rounded-lg border px-3 py-2.5 text-sm', open ? (leaderOwes ? 'border-rose-200 bg-rose-50/40' : 'border-violet-200 bg-violet-50/40') : 'zego-border-color')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold zego-text">
                    {leaderOwes ? 'หัวหน้าทัวร์ค้างคืน' : 'บริษัทค้างจ่ายหัวหน้าทัวร์'} {formatCurrency(f.amount, f.currency)}
                  </p>
                  <p className="text-xs zego-text-tertiary">{FOLLOW_UP_REASON[f.reason]}{f.note ? ` · ${f.note}` : ''} · ตั้งเมื่อ {formatDateTime(f.createdAt)} โดย {f.createdBy}</p>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <p className="zego-text-secondary">ชำระแล้ว {money(followUpCovered(f))} {f.currency}</p>
                  <p className={cx('font-semibold', open ? 'zego-text-danger' : 'text-emerald-700')}>{open ? `คงค้าง ${money(followUpRemaining(f))} ${f.currency}` : 'ปิดยอดแล้ว'}</p>
                </div>
              </div>

              {f.payments.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t zego-border-color pt-2 text-xs zego-text-secondary">
                  {f.payments.map((p) => (
                    <li key={p.id}>
                      {formatDateTime(p.at)} · {FOLLOW_UP_METHOD[p.method]} {formatCurrency(p.paidAmount, p.paidCurrency)}
                      {p.fxRate ? ` (อัตรา ${p.fxRate} บาท/${f.currency} = ${money(p.covered)} ${f.currency})` : ''}
                      {p.ref ? ` · อ้างอิง ${p.ref}` : ''}{p.approvedBy ? ` · อนุมัติโดย ${p.approvedBy}` : ''}{p.note ? ` · ${p.note}` : ''} · โดย {p.by}
                    </li>
                  ))}
                </ul>
              )}

              {open && payingId !== f.id && (
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => setPayingId(f.id)}>{leaderOwes ? 'บันทึกรับเงิน' : 'บันทึกจ่ายเงิน'}</Button>
                </div>
              )}
              {payingId === f.id && (
                <PayForm
                  f={f}
                  onCancel={() => setPayingId(null)}
                  onSave={(payment) => {
                    setPayingId(null);
                    save(items.map((x) => (x.id === f.id ? { ...x, payments: [...x.payments, { ...payment, id: `FP-${Date.now()}`, at: toISODateTime(new Date()), by: currentUser.name }] } : x)),
                      leaderOwes ? 'บันทึกรับเงินแล้ว' : 'บันทึกจ่ายเงินแล้ว');
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onSave={(f) => {
            setAdding(false);
            save([...items, { ...f, id: `FU-${Date.now()}`, createdAt: toISODateTime(new Date()), createdBy: currentUser.name, payments: [] }], 'เพิ่มยอดค้างแล้ว');
          }}
        />
      )}
    </section>
  );
}

/** บันทึกการชำระ 1 ครั้ง — สกุลเดิม หรือบาท (กรอกอัตรา) · ตัดเป็นค่าใช้จ่ายต้องมีผู้อนุมัติ */
function PayForm({ f, onCancel, onSave }: {
  f: FollowUp;
  onCancel: () => void;
  onSave: (p: { method: FollowUpMethod; paidCurrency: string; paidAmount: number; fxRate?: number; covered: number; ref?: string; note?: string; approvedBy?: string }) => void;
}) {
  const remaining = followUpRemaining(f);
  const foreign = f.currency !== 'THB';
  const [method, setMethod] = useState<FollowUpMethod>('transfer');
  const [inThb, setInThb] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(remaining * 100) / 100));
  const [rate, setRate] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const payThb = foreign && inThb && method !== 'write_off';
  const a = Number(amount);
  const r = Number(rate);
  // ยอดที่ตัดในสกุลของยอดค้าง — จ่ายเป็นบาท = บาท ÷ อัตรา
  const covered = payThb ? (r > 0 ? Math.round((a / r) * 100) / 100 : 0) : a;
  const tooMuch = covered - remaining > 0.005;
  const invalid = !(a > 0) || (payThb && !(r > 0)) || !(covered > 0) || tooMuch || (method === 'write_off' && (!approvedBy.trim() || !note.trim()));

  return (
    <div className="mt-2 space-y-2 rounded-lg border zego-border-color bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className={label}>วิธี</span>
          <select className={input} value={method} onChange={(e) => setMethod(e.target.value as FollowUpMethod)}>
            {(Object.keys(FOLLOW_UP_METHOD) as FollowUpMethod[]).map((m) => <option key={m} value={m}>{FOLLOW_UP_METHOD[m]}</option>)}
          </select>
        </label>
        {foreign && method !== 'write_off' && (
          <label className="block">
            <span className={label}>ชำระเป็น</span>
            <select className={input} value={inThb ? 'THB' : f.currency} onChange={(e) => { const thb = e.target.value === 'THB'; setInThb(thb); setAmount(thb ? '' : String(Math.round(remaining * 100) / 100)); }}>
              <option value={f.currency}>{f.currency} (สกุลเดิม)</option>
              <option value="THB">THB (แลกเป็นบาท)</option>
            </select>
          </label>
        )}
        <label className="block">
          <span className={label}>ยอด ({payThb ? 'THB' : f.currency}) · คงค้าง {money(remaining)} {f.currency}</span>
          <input type="number" inputMode="decimal" min={0} className={cx(input, 'text-right tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        {payThb && (
          <label className="block">
            <span className={label}>อัตรา (บาท / 1 {f.currency})</span>
            <input type="number" inputMode="decimal" min={0} step="0.0001" className={cx(input, 'text-right tabular-nums')} value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        )}
        {method !== 'write_off' && (
          <label className="block"><span className={label}>เลขอ้างอิง / ใบเสร็จ</span><input className={input} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        )}
        {method === 'write_off' && (
          <label className="block"><span className={label}>ผู้อนุมัติ <span className="text-rose-600">*</span></span><input className={input} value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></label>
        )}
      </div>
      <label className="block">
        <span className={label}>{method === 'write_off' ? <>เหตุผลที่ตัดเป็นค่าใช้จ่าย <span className="text-rose-600">*</span></> : 'หมายเหตุ (ไม่บังคับ)'}</span>
        <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={method === 'write_off' ? 'เช่น ส่วนต่างอัตราแลกเปลี่ยน / เงินสูญหาย' : ''} />
      </label>
      {payThb && r > 0 && a > 0 && <p className="text-xs zego-text-secondary">ตัดยอดค้าง {money(covered)} {f.currency}</p>}
      {tooMuch && <p className="text-xs zego-text-danger">เกินยอดคงค้าง {money(remaining)} {f.currency}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={invalid}
          onClick={() => onSave({
            method, paidCurrency: payThb ? 'THB' : f.currency, paidAmount: a, covered,
            ...(payThb ? { fxRate: r } : {}),
            ...(ref.trim() ? { ref: ref.trim() } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(method === 'write_off' ? { approvedBy: approvedBy.trim() } : {}),
          })}
        >
          บันทึก
        </Button>
      </div>
    </div>
  );
}

/** เพิ่มยอดค้างเอง — เช่น ซองแจ้งยอดไม่ตรง ที่สรุปแล้วว่าใครค้างใคร */
function AddForm({ onCancel, onSave }: { onCancel: () => void; onSave: (f: Pick<FollowUp, 'direction' | 'reason' | 'currency' | 'amount' | 'note'>) => void }) {
  const [direction, setDirection] = useState<FollowUp['direction']>('leader_owes');
  const [currency, setCurrency] = useState('THB');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const invalid = !(Number(amount) > 0) || !/^[A-Z]{3}$/.test(currency.trim().toUpperCase()) || !note.trim();
  return (
    <div className="mt-2 space-y-2 rounded-lg border zego-border-color p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className={label}>ใครค้าง</span>
          <select className={input} value={direction} onChange={(e) => setDirection(e.target.value as FollowUp['direction'])}>
            <option value="leader_owes">หัวหน้าทัวร์ค้างคืน</option>
            <option value="company_owes">บริษัทค้างจ่ายหัวหน้าทัวร์</option>
          </select>
        </label>
        <label className="block"><span className={label}>สกุล</span><input className={cx(input, 'uppercase')} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></label>
        <label className="block"><span className={label}>ยอด</span><input type="number" inputMode="decimal" min={0} className={cx(input, 'text-right tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <label className="block"><span className={label}>รายละเอียด <span className="text-rose-600">*</span></span><input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ซอง 2 แจ้งยอดไม่ตรง ขาด 500" /></label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button variant="primary" size="sm" disabled={invalid} onClick={() => onSave({ direction, reason: 'other', currency: currency.trim().toUpperCase(), amount: Number(amount), note: note.trim() })}>เพิ่ม</Button>
      </div>
    </div>
  );
}
