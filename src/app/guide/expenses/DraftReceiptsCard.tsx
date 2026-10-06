'use client';

/**
 * ใบเสร็จร่างของกรุ๊ป — หัวหน้าทัวร์บันทึกทีละใบเสร็จแบบ "บันทึกไว้ก่อน" แล้วส่งอนุมัติทีละใบ หรือพร้อมกันทีเดียว
 * ส่งพร้อมกัน = รวมเป็นใบเบิกเดียว (เลขเดียว หลายใบเสร็จข้างใน — lib/logic/expenseReceipts.ts)
 * (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route) · ร่างยังไม่ถึงฝ่ายบัญชี — ส่งแล้วจึงเข้าคิวตรวจ
 * ลบร่างได้ (สถานะยกเลิก — เก็บประวัติไว้ ไม่ลบทิ้งจริง)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { formatDate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { Button, Card } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { CurrencyStack } from './CurrencyStack';
import { expenseOriginalTotals, groupAmountsByCurrency } from './expenseAmounts';
import type { ExpenseRequest } from '@/types';
import { mergeDraftReceipts } from '@/lib/logic/expenseReceipts';

export function DraftReceiptsCard({ drafts }: { drafts: ExpenseRequest[] }) {
  const { saveExpense, discardExpenses, currentUser, saving, pushToast } = useDemo();
  const [confirmAll, setConfirmAll] = useState(false);
  const [removing, setRemoving] = useState<ExpenseRequest | null>(null);
  if (drafts.length === 0) return null;

  /** ส่งอนุมัติ — ส่ง 1 ครั้ง = ใบเบิก 1 ใบ · หลายร่าง = รวมเป็นใบเดียว (ร่างที่ถูกรวมถูกลบออก) */
  const send = async (list: ExpenseRequest[]) => {
    const at = toISODateTime(new Date());
    const doc = list.length > 1 ? mergeDraftReceipts(list) : list[0];
    const note = list.length > 1 ? `ส่งอนุมัติจากพอร์ทัลหัวหน้าทัวร์ · รวม ${list.length} ใบเสร็จ` : 'ส่งอนุมัติจากพอร์ทัลหัวหน้าทัวร์';
    await saveExpense({ ...doc, status: 'submitted', submittedAt: at, history: [...doc.history, makeStatusEvent('draft', 'submitted', currentUser.name, at, note)] });
    const merged = list.filter((e) => e.id !== doc.id).map((e) => e.id);
    if (merged.length > 0) await discardExpenses(merged);
    if (list.length > 1) pushToast('success', 'ส่งให้บัญชีตรวจแล้ว', `${list.length} ใบเสร็จ`);
  };
  const remove = async (e: ExpenseRequest) => {
    const at = toISODateTime(new Date());
    await saveExpense({ ...e, status: 'cancelled', history: [...e.history, makeStatusEvent('draft', 'cancelled', currentUser.name, at, 'ลบร่าง')] });
  };
  const total = groupAmountsByCurrency(drafts.flatMap((d) => expenseOriginalTotals(d)));

  return (
    <Card className="space-y-3 ring-1 ring-amber-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold zego-text">ร่างที่ยังไม่ส่ง ({drafts.length})</p>
          <p className="text-xs zego-text-tertiary">ยังไม่ถึงฝ่ายบัญชี — ส่งทีละใบ หรือส่งพร้อมกันเป็นใบเบิกเดียว</p>
        </div>
        <CurrencyStack totals={total} lineClassName="text-sm font-semibold" />
      </div>
      <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm zego-text">{d.lines[0]?.purpose || d.lines[0]?.expenseType || d.id}{d.lines.length > 1 ? ` และอีก ${d.lines.length - 1} รายการ` : ''}</span>
              {/* เลขร่างไม่แสดง — ส่งพร้อมกันจะได้เลขใบเบิกเดียว */}
              <span className="block text-[11px] zego-text-tertiary">{d.lines[0]?.receiptDate ? `ใบเสร็จ ${formatDate(d.lines[0].receiptDate)}` : `บันทึก ${formatDate(d.requestedAt)}`}</span>
            </span>
            <CurrencyStack totals={expenseOriginalTotals(d)} lineClassName="text-xs font-semibold" />
            <span className="flex shrink-0 gap-1">
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => setRemoving(d)}>ลบ</Button>
              <Button size="sm" variant="primary" disabled={saving} onClick={() => void send([d])}>ส่ง</Button>
            </span>
          </li>
        ))}
      </ul>
      {drafts.length > 1 && (
        <Button variant="primary" icon="check" className="w-full justify-center" loading={saving} onClick={() => setConfirmAll(true)}>
          ส่งอนุมัติทั้งหมด ({drafts.length})
        </Button>
      )}

      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={async () => { await send(drafts); setConfirmAll(false); }}
        title={`ส่งอนุมัติ ${drafts.length} ใบเสร็จ?`}
        message="รวมเป็นใบเบิกเดียวแล้วส่งให้ฝ่ายบัญชีตรวจ — ถ้าต้องแก้หลังส่ง ต้องรอบัญชีส่งกลับให้แก้ไข"
        confirmLabel="ส่งอนุมัติ"
        tone="primary"
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { if (removing) await remove(removing); setRemoving(null); }}
        title="ลบร่างนี้?"
        message={removing ? `${removing.lines[0]?.purpose ?? removing.id} — ยอดจะไม่ถูกนับในค่าใช้จ่ายของกรุ๊ป` : ''}
        confirmLabel="ลบร่าง"
        tone="danger"
      />
    </Card>
  );
}
