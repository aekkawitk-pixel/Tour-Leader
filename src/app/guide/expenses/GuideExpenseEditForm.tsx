'use client';

/**
 * แก้ไขค่าใช้จ่ายที่บันทึกไปแล้ว (พอร์ทัลหัวหน้าทัวร์) — เปิดจากแผงรายละเอียด
 *
 * แก้ได้เฉพาะตอนบัญชียังไม่ได้ตรวจ (ส่งอนุมัติ) หรือบัญชีส่งกลับมาให้แก้ (ให้แก้ไข)
 * แก้ได้: หลักฐาน (ถ่าย/เลือกรูปใหม่ · ไม่มีใบเสร็จ · รอแนบ) · ประเภท · วันที่ใบเสร็จ · รายการ/ยอด/สกุลเงิน · หมายเหตุ
 * การผูกกับรายการเบิก (budgetLineId) คงเดิม — จะเปลี่ยนรายการเบิกให้ยกเลิกแล้วบันทึกใหม่ผ่าน "ตามรายการเบิก"
 * บันทึกแล้วต่อ Timeline ว่าแก้อะไร · ใบที่อยู่สถานะ "ให้แก้ไข" จะกลับไป "ส่งอนุมัติ" ให้บัญชีตรวจอีกรอบ
 */

import { useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, cx } from '@/components/ui/Primitives';
import { baseControl, SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { compressImageToDataUrl } from '@/lib/image/compressImage';
import { toISODateTime } from '@/lib/format';
import { ImageLightbox } from './EvidencePreview';
import type { ExpenseLine, ExpenseRequest } from '@/types';

const NO_RECEIPT = 'ไม่มีหลักฐาน';
const PENDING_RECEIPT = 'รอแนบหลักฐาน';

interface DraftLine {
  id: string;
  description: string;
  amount: string;
  currency: string;
}

export function GuideExpenseEditForm({
  expense,
  onCancel,
  onSaved,
}: {
  expense: ExpenseRequest;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { master, saveExpense, currentUser } = useDemo();
  const first = expense.lines[0];

  const [expenseType, setExpenseType] = useState(
    () => master.expenseTypes.find((t) => t.name === first?.expenseType || t.code === first?.expenseType)?.code ?? '',
  );
  const [receiptDate, setReceiptDate] = useState(first?.receiptDate ?? '');
  const [lines, setLines] = useState<DraftLine[]>(() =>
    expense.lines.map((l) => ({ id: l.id, description: l.purpose, amount: String(l.amount), currency: l.currency })),
  );
  const [note, setNote] = useState(expense.note);
  const [evidenceFileName, setEvidenceFileName] = useState(first?.evidenceFileName ?? '');
  const [evidenceImage, setEvidenceImage] = useState<string | undefined>(first?.evidenceImage);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewImage, setViewImage] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const valid = lines
    .map((l) => ({ ...l, amountNum: Number(l.amount) || 0 }))
    .filter((l) => l.description.trim() && l.amountNum !== 0);
  const missing = [
    !expenseType && 'ประเภทค่าใช้จ่าย',
    valid.length === 0 && 'รายการ (รายละเอียด + จำนวนเงิน)',
  ].filter(Boolean) as string[];

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcessing(true);
    setEvidenceFileName(file.name);
    setEvidenceImage((await compressImageToDataUrl(file)) ?? undefined);
    setProcessing(false);
  };

  const setNoImage = (name: string) => {
    setEvidenceFileName(name);
    setEvidenceImage(undefined);
  };

  const fxRateFor = (code: string) => Number(master.currencies.find((c) => c.code === code)?.extra ?? '1') || 1;

  /** สรุปสิ่งที่เปลี่ยน ไว้ใส่ Timeline — บัญชีเห็นว่าแก้อะไรไปบ้าง */
  const describeChanges = (next: ExpenseLine[]) => {
    const out: string[] = [];
    const typeName = master.expenseTypes.find((t) => t.code === expenseType)?.name ?? expenseType;
    if (typeName !== first?.expenseType) out.push(`ประเภท → ${typeName}`);
    if ((receiptDate || undefined) !== first?.receiptDate) out.push('วันที่ใบเสร็จ');
    if (evidenceFileName !== first?.evidenceFileName || evidenceImage !== first?.evidenceImage) out.push(`หลักฐาน → ${evidenceFileName}`);
    const sig = (ls: { purpose: string; amount: number; currency: string }[]) => ls.map((l) => `${l.purpose}|${l.amount}|${l.currency}`).join(';');
    if (sig(next) !== sig(expense.lines)) out.push('รายการ/ยอดเงิน');
    if (note.trim() !== expense.note) out.push('หมายเหตุ');
    return out;
  };

  const submit = async () => {
    if (missing.length > 0) return;
    setSaving(true);
    try {
      const typeName = master.expenseTypes.find((t) => t.code === expenseType)?.name ?? expenseType;
      const budgetLineId = first?.budgetLineId;
      const nextLines: ExpenseLine[] = valid.map((l, i) => {
        const orig = expense.lines.find((x) => x.id === l.id);
        const fxRate = orig && orig.currency === l.currency ? orig.fxRate : fxRateFor(l.currency);
        return {
          id: orig?.id ?? `L-${Date.now()}-${i}`,
          expenseType: typeName,
          purpose: l.description.trim(),
          amount: l.amountNum,
          currency: l.currency,
          fxRate,
          amountTHB: Math.round(l.amountNum * fxRate),
          receiptNo: orig?.receiptNo ?? '—',
          evidenceFileName,
          ...(evidenceImage ? { evidenceImage } : {}),
          receiptDate: receiptDate || undefined,
          ...(budgetLineId ? { budgetLineId } : {}),
        };
      });
      const changes = describeChanges(nextLines);
      if (changes.length === 0) {
        onCancel();
        return;
      }
      const at = toISODateTime(new Date());
      const nextStatus = expense.status === 'revise' ? 'submitted' : expense.status;
      await saveExpense({
        ...expense,
        lines: nextLines,
        totalTHB: nextLines.reduce((s, l) => s + l.amountTHB, 0),
        note: note.trim(),
        status: nextStatus,
        history: [
          ...expense.history,
          makeStatusEvent(expense.status, nextStatus, currentUser.name, at, `หัวหน้าทัวร์แก้ไข: ${changes.join(', ')}`),
        ],
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const noImageKind = evidenceFileName === NO_RECEIPT || evidenceFileName === PENDING_RECEIPT;

  return (
    <div className="space-y-4">
      {/* หลักฐาน */}
      <div className="space-y-2">
        <p className="text-sm font-medium zego-text-secondary">หลักฐานการจ่ายเงิน</p>
        <div
          className={cx(
            'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
            noImageKind ? 'border-amber-200 bg-amber-50 zego-text-warning' : 'border-emerald-200 bg-emerald-50 zego-text-success',
          )}
        >
          {evidenceImage ? (
            <button type="button" onClick={() => setViewImage(true)} aria-label="ดูรูปหลักฐาน" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={evidenceImage} alt="รูปหลักฐาน" className="h-12 w-12 rounded-md border zego-border-color object-cover" />
            </button>
          ) : (
            <Icon name={noImageKind ? 'warning' : 'file'} className="h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{processing ? 'กำลังเตรียมรูป...' : evidenceFileName || '—'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon="camera" onClick={() => cameraRef.current?.click()} disabled={processing}>ถ่ายใหม่</Button>
          <Button variant="secondary" size="sm" icon="image" onClick={() => galleryRef.current?.click()} disabled={processing}>เลือกรูปใหม่</Button>
          <Button variant="ghost" size="sm" onClick={() => setNoImage(NO_RECEIPT)} disabled={processing}>ไม่มีใบเสร็จ</Button>
          <Button variant="ghost" size="sm" onClick={() => setNoImage(PENDING_RECEIPT)} disabled={processing}>รอแนบภายหลัง</Button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      </div>

      {first?.budgetLineId && (
        <p className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          <Icon name="receipt" className="h-3.5 w-3.5 shrink-0" />
          ผูกกับรายการเบิกเดิม — จะเปลี่ยนรายการเบิก ให้ยกเลิกรายการนี้แล้วบันทึกใหม่
        </p>
      )}

      <SelectInput
        label="ประเภทค่าใช้จ่าย"
        value={expenseType}
        onChange={(e) => setExpenseType(e.target.value)}
        placeholder="เลือกประเภท"
        options={master.expenseTypes.filter((t) => t.active).map((t) => ({ value: t.code, label: t.name }))}
      />

      <DateField label="วันที่ใบเสร็จ" value={receiptDate} onChange={setReceiptDate} />

      <div>
        <p className="mb-1.5 text-sm font-medium zego-text-secondary">รายการค่าใช้จ่าย</p>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={line.id} className="space-y-1.5 rounded-lg border zego-border-color p-2">
              <textarea
                className={cx(baseControl, 'resize-none text-sm leading-snug')}
                rows={2}
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
                aria-label="รายละเอียดรายการ"
              />
              <div className="flex items-stretch gap-2">
                <div className="flex-1">
                  <input
                    className={cx(baseControl, 'h-full')}
                    type="number"
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                    aria-label="จำนวนเงินรายการ"
                  />
                </div>
                <div className="w-20 shrink-0">
                  <select
                    className={cx(baseControl, 'h-full')}
                    value={line.currency}
                    onChange={(e) => updateLine(i, { currency: e.target.value })}
                    aria-label="สกุลเงินรายการ"
                  >
                    {master.currencies.filter((c) => c.active || c.code === line.currency).map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}
                  disabled={lines.length <= 1}
                  className="shrink-0 self-center rounded p-1.5 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-0"
                  aria-label="ลบรายการนี้"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { id: `NEW-${Date.now()}`, description: '', amount: '', currency: prev.at(-1)?.currency ?? 'THB' }])}
          className="mt-2 text-xs font-medium zego-text-info hover:underline"
        >
          + เพิ่มรายการ
        </button>
      </div>

      <TextArea label="หมายเหตุ" optional value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs zego-text-warning">ยังบันทึกไม่ได้ — ยังขาด: {missing.join(' · ')}</p>
      )}
      {expense.status === 'revise' && (
        <p className="text-xs zego-text-tertiary">บันทึกแล้วรายการนี้จะถูกส่งให้บัญชีตรวจอีกครั้ง</p>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>ยกเลิกการแก้ไข</Button>
        <Button variant="primary" className="flex-1" onClick={submit} loading={saving} disabled={missing.length > 0 || processing}>
          บันทึกการแก้ไข
        </Button>
      </div>

      {viewImage && evidenceImage && (
        <ImageLightbox src={evidenceImage} alt={evidenceFileName} onClose={() => setViewImage(false)} />
      )}
    </div>
  );
}
