'use client';

/**
 * เบิกค่าใช้จ่าย — /staff/claims (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * เบิก "ค่าส่งกรุ๊ป" ทีละกรุ๊ปที่ไปส่งแล้ว (คอนเฟิร์มแล้ว + ถึงวันไปส่งแล้ว + ยังไม่เคยเบิก)
 * เบิกค่าใช้จ่ายอื่นพร้อมกันได้ (ค่าเดินทาง/ทางด่วน/ที่จอดรถ) พร้อมรูปใบเสร็จ
 * ส่งเป็นใบเบิก (ExpenseRequest, requesterKind='sendoff') → ฝ่ายบัญชีตรวจ/อนุมัติที่เมนู "ตรวจสอบรายการจ่าย"
 * ยังไม่มีอัตราค่าส่งกรุ๊ปในระบบ — เจ้าหน้าที่กรอกยอดเอง ฝ่ายบัญชีตรวจตอนอนุมัติ
 */

import { useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateTime, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { compressImageToDataUrl } from '@/lib/image/compressImage';
import { claimableDuties, SEND_OFF_EXTRA_TYPES, SEND_OFF_FEE_TYPE, staffClaims, type StaffDuty } from '@/lib/logic/staffPortal';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import { useStaffPortal } from '../useStaffPortal';

export default function StaffClaimsPage() {
  const { expenses, currentUser, saveExpense, createExpenseId } = useDemo();
  const { staffId, staff, duties, today } = useStaffPortal();
  const [claimFor, setClaimFor] = useState<StaffDuty | null>(null);

  const claimable = claimableDuties(duties, expenses, staffId, today);
  const mine = staffClaims(expenses, staffId);
  const bank = staff?.bankAccounts.find((b) => b.isPrimary && b.active) ?? staff?.bankAccounts.find((b) => b.active);

  const submit = async (duty: StaffDuty, lines: ExpenseLine[], note: string) => {
    const id = await createExpenseId();
    const at = toISODateTime(new Date());
    const expense: ExpenseRequest = {
      id,
      jobId: duty.periodId,
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
        <p className="text-xs zego-text-tertiary">เบิกค่าส่งกรุ๊ปของงานที่ไปส่งแล้ว · ฝ่ายบัญชีตรวจและอนุมัติ</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold zego-text">ค่าส่งกรุ๊ป — รอเบิก ({claimable.length})</h2>
        {claimable.length === 0 ? (
          <Card><EmptyState icon="receipt" title="ยังไม่มีงานที่รอเบิก" description="งานที่คอนเฟิร์มแล้วและถึงวันไปส่งแล้วจะขึ้นที่นี่" /></Card>
        ) : (
          <ul className="space-y-2">
            {claimable.map((d) => (
              <li key={d.assignmentId}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold zego-text">{d.period?.groupCode ?? d.periodId}</p>
                    <p className="line-clamp-1 text-xs zego-text-secondary">{d.period?.displayName}</p>
                    <p className="text-xs zego-text-tertiary">ไปส่ง {formatDate(d.dutyDate)}{d.airport ? ` · ${d.airport}` : ''}</p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => setClaimFor(d)}>เบิก</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold zego-text">ใบเบิกของฉัน ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="rounded-lg zego-surface-soft-bg px-3 py-3 text-center text-xs zego-text-tertiary">ยังไม่มีใบเบิก</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((e) => {
              const p = duties.find((d) => d.periodId === e.jobId)?.period;
              return (
                <li key={e.id}>
                  <Card className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold zego-text">{p?.groupCode ?? e.jobId}</p>
                        <p className="text-[11px] zego-text-tertiary">{e.id} · ส่งเมื่อ {formatDateTime(e.submittedAt ?? e.requestedAt)}</p>
                      </div>
                      <StatusBadge meta={EXPENSE_STATUS[e.status]} size="sm" />
                    </div>
                    <ul className="space-y-0.5 text-xs">
                      {e.lines.map((l) => (
                        <li key={l.id} className={`flex justify-between gap-2 ${l.rejected ? 'line-through zego-text-tertiary' : 'zego-text-secondary'}`}>
                          <span className="truncate">{l.expenseType}{l.purpose && l.purpose !== l.expenseType ? ` · ${l.purpose}` : ''}</span>
                          <span className="shrink-0 tabular-nums">{formatCurrency(l.amount, l.currency)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="flex justify-between border-t zego-border-color pt-1 text-sm font-semibold zego-text">
                      <span>รวม</span>
                      <span className="tabular-nums">{formatCurrency(e.lines.filter((l) => !l.rejected).reduce((s, l) => s + l.amount, 0), 'THB')}</span>
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {claimFor && (
        <ClaimModal
          duty={claimFor}
          bankText={bank ? `${bank.bank} ${bank.accountNoMasked} · ${bank.accountName}` : null}
          onClose={() => setClaimFor(null)}
          onSubmit={(lines, note) => submit(claimFor, lines, note)}
        />
      )}
    </div>
  );
}

interface ExtraRow { key: number; type: string; amount: string; image: string | null }

function ClaimModal({
  duty,
  bankText,
  onClose,
  onSubmit,
}: {
  duty: StaffDuty;
  bankText: string | null;
  onClose: () => void;
  onSubmit: (lines: ExpenseLine[], note: string) => Promise<void>;
}) {
  const [fee, setFee] = useState('');
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);

  const feeAmt = Number(fee);
  const extraOk = extras.every((x) => Number(x.amount) > 0);
  const ok = feeAmt > 0 && extraOk;
  const total = (feeAmt || 0) + extras.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const setExtra = (key: number, patch: Partial<ExtraRow>) => setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const build = (): ExpenseLine[] => {
    const line = (i: number, expenseType: string, amount: number, image?: string | null): ExpenseLine => ({
      id: `L-${i + 1}`,
      expenseType,
      purpose: expenseType === SEND_OFF_FEE_TYPE ? `ส่งกรุ๊ป ${duty.period?.groupCode ?? duty.periodId} · ${formatDate(duty.dutyDate)}` : expenseType,
      amount,
      currency: 'THB',
      fxRate: 1,
      amountTHB: amount,
      receiptNo: '',
      evidenceFileName: image ? 'receipt.jpg' : '',
      ...(image ? { evidenceImage: image } : {}),
      receiptDate: duty.dutyDate,
    });
    return [line(0, SEND_OFF_FEE_TYPE, feeAmt), ...extras.map((x, i) => line(i + 1, x.type, Number(x.amount), x.image))];
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="เบิกค่าส่งกรุ๊ป"
      description={`${duty.period?.groupCode ?? duty.periodId} · ไปส่ง ${formatDate(duty.dutyDate)}${duty.airport ? ` · ${duty.airport}` : ''}`}
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
            ส่งเบิก {total > 0 ? formatCurrency(total, 'THB') : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <TextInput label="ค่าส่งกรุ๊ป (บาท)" type="number" inputMode="decimal" required value={fee} onChange={(e) => setFee(e.target.value)} />

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
