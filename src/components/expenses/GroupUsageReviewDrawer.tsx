'use client';

/**
 * ตรวจทั้งกรุ๊ปในหน้าเดียว — รายงานการใช้เงิน (ใบเสร็จค่าใช้จ่ายจริง) ของกรุ๊ป จัดตามรายการในใบเบิกเงินทดรอง
 *
 * แต่ละรายการเบิก: ยอดเบิก / ใช้รวม / ครบ·ใช้ไม่ครบ·เกิน แล้วตามด้วยใบเสร็จที่ผูก (รูปหลักฐาน · ยอด · สถานะ)
 * ตรวจเป็นกรุ๊ป ผ่านได้ทีละหลายใบ:
 *   - เปิดมา = เลือกใบที่ไม่มีปัญหาไว้ให้แล้ว (ไม่เกินงบ · มีหลักฐาน · อยู่ในรายการเบิก) → กด "ตรวจผ่าน" ได้ทันที
 *   - ติ๊กทั้งหมด / ทั้งรายการเบิก / ทีละใบ · ใบที่ส่งมาพร้อมกันถูกเลือกไปด้วยกัน (ตรวจผ่านเป็นหน่วยการส่ง)
 *   - ตรวจผ่านแล้วกรุ๊ปนี้ไม่เหลือรอตรวจ → ไปกรุ๊ปถัดไปที่รอตรวจให้เอง (onNext)
 * ใบที่ต้องตีตกบางบรรทัด / ส่งกลับแก้ / ปฏิเสธ → "เปิดตรวจ" ไปหน้าตรวจรายใบ (ExpenseDrawer) แล้วกลับมาที่นี่
 */

import { useMemo, useState } from 'react';
import { ConfirmDialog, Drawer } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { useDemo } from '@/store/DemoStore';
import { formatCurrency, formatDate, formatDateRange } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import {
  approvalPlan, autoReadyKeys, expenseStatusMeta, groupUsageReview, hasEvidence, lineTitle, usageRowKey, withSiblings,
} from '@/lib/logic/usageReport';
import { EvidencePreview } from '@/app/guide/expenses/EvidencePreview';
import { formatMultiCurrency, groupAmountsByCurrency } from '@/app/guide/expenses/expenseAmounts';
import { BudgetUseBadge, budgetUseText } from './BudgetUseBadge';

export function GroupUsageReviewDrawer({
  groupId,
  onClose,
  onOpenReport,
  onNext,
  nextLabel,
}: {
  groupId: string | null;
  onClose: () => void;
  onOpenReport: (expenseId: string) => void;
  /** ไปกรุ๊ปถัดไปที่รอตรวจ (ไม่มี = กรุ๊ปสุดท้าย) */
  onNext?: () => void;
  nextLabel?: string;
}) {
  const { expenses, approveExpenseLines, pushToast, saving } = useDemo();
  /** ใบเสร็จที่เลือก — ผูกกับกรุ๊ป · ยังไม่แตะ = ใช้ชุดที่เลือกให้ล่วงหน้า */
  const [picked, setPicked] = useState<{ groupId: string | null; keys: Set<string> }>({ groupId: null, keys: new Set() });
  const [confirm, setConfirm] = useState(false);
  /** กำลังตรวจผ่านหลายใบ (บันทึกทีละใบ) — กันกดซ้ำระหว่างทาง */
  const [busy, setBusy] = useState(false);

  const review = useMemo(() => (groupId ? groupUsageReview(expenses, groupId) : null), [expenses, groupId]);
  if (!groupId || !review) return null;

  const rows = review.sections.flatMap((s) => s.rows);
  const pending = rows.filter((r) => r.pending);
  const autoKeys = autoReadyKeys(review.sections);
  const selected = picked.groupId === groupId ? picked.keys : new Set(autoKeys);
  const setSelected = (keys: Iterable<string>) => setPicked({ groupId, keys: new Set(keys) });
  /** เลือก/เอาออก — พาใบที่ส่งมาพร้อมกันไปด้วยเสมอ */
  const setMany = (keys: string[], on: boolean) => {
    const group = withSiblings(rows, keys);
    setSelected(on ? [...selected, ...group] : [...selected].filter((k) => !group.includes(k)));
  };

  const plan = approvalPlan(rows, selected);
  const chosen = pending.filter((r) => plan.ready.includes(r.report.id));
  const chosenTotal = formatMultiCurrency(groupAmountsByCurrency(chosen.map((r) => ({ amount: r.line.amount, currency: r.line.currency }))));
  const allPendingKeys = pending.map(usageRowKey);
  const allOn = allPendingKeys.length > 0 && allPendingKeys.every((k) => selected.has(k));
  const pendingByReport = new Map<string, number>();
  for (const r of pending) pendingByReport.set(r.report.id, (pendingByReport.get(r.report.id) ?? 0) + 1);

  const period = getTourPeriodById(groupId);
  const docIds = [...new Set(review.sections.map((s) => s.item?.expenseId).filter(Boolean))];

  const approve = async () => {
    setConfirm(false);
    setBusy(true);
    const left = pending.length - chosen.length;
    try {
      for (const id of plan.ready) await approveExpenseLines(id, {}, { silent: true });
      pushToast('success', `ตรวจผ่านแล้ว ${chosen.length} ใบเสร็จ`, period?.groupCode ?? groupId);
      setSelected([]);
    } finally {
      setBusy(false);
    }
    // กรุ๊ปนี้ไม่เหลือรอตรวจ → ไปกรุ๊ปถัดไปเลย
    if (left === 0 && onNext) onNext();
  };

  return (
    <>
      <Drawer
        open
        size="xl"
        onClose={onClose}
        title={`ตรวจทั้งกรุ๊ป · ${period?.groupCode ?? groupId}`}
        description={[
          period?.displayName,
          period ? formatDateRange(period.startDate, period.endDate) : '',
          docIds.length > 0 ? `อ้างอิง ${docIds.join(', ')}` : '',
        ].filter(Boolean).join(' · ')}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm zego-text-secondary">
              {chosen.length > 0
                ? <>เลือก <b className="zego-text tabular-nums">{chosen.length}</b> ใบ · <span className="tabular-nums">{chosenTotal}</span></>
                : pending.length > 0 ? 'ยังไม่ได้เลือกใบเสร็จ' : 'กรุ๊ปนี้ไม่มีใบเสร็จรอตรวจ'}
            </p>
            <Button variant="secondary" onClick={onClose} disabled={busy}>ปิด</Button>
            {onNext && (
              <Button variant="secondary" onClick={onNext} disabled={busy} title={nextLabel ? `ไป ${nextLabel}` : undefined}>
                กรุ๊ปถัดไป →
              </Button>
            )}
            <Button variant="success" onClick={() => setConfirm(true)} loading={busy} disabled={saving || busy || chosen.length === 0}>
              ตรวจผ่าน {chosen.length} ใบ
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* สรุป + เลือกทั้งหมด */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
            <label className="flex items-center gap-2 font-medium zego-text">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600 disabled:opacity-30"
                checked={allOn}
                disabled={pending.length === 0}
                onChange={(e) => setMany(allPendingKeys, e.target.checked)}
              />
              เลือกทั้งหมดที่รอตรวจ ({pending.length})
            </label>
            <span className="text-xs zego-text-tertiary">
              เลือกใบที่ไม่มีปัญหาไว้ให้แล้ว {autoKeys.length} ใบ · ตรวจแล้ว / อื่น ๆ {rows.length - pending.length}
            </span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" disabled={autoKeys.length === 0} onClick={() => setSelected(autoKeys)}>
                เฉพาะที่ไม่มีปัญหา
              </Button>
              {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected([])}>ล้างที่เลือก</Button>}
            </span>
          </div>

          {review.sections.length === 0 && (
            <p className="py-8 text-center text-sm zego-text-tertiary">กรุ๊ปนี้ยังไม่มีใบเสร็จที่ส่งมา</p>
          )}

          {review.sections.map((s) => {
            const sectionKeys = s.rows.filter((r) => r.pending).map(usageRowKey);
            const sectionOn = sectionKeys.length > 0 && sectionKeys.every((k) => selected.has(k));
            return (
              // การ์ดเดียวต่อรายการเบิก — แถบหัวการ์ด (ยอดเบิก/ใช้รวม/ครบ·เกิน) เป็นของใบเสร็จที่อยู่ในการ์ดเดียวกันเท่านั้น
              <section
                key={s.item?.line.id ?? 'outside'}
                className={cx('overflow-hidden rounded-xl border', s.use?.kind === 'over' ? 'border-rose-300' : 'zego-border-color')}
              >
                <div className={cx('flex items-center gap-3 border-b px-3 py-2 text-xs', s.use?.kind === 'over' ? 'border-rose-200 bg-rose-50' : 'zego-surface-soft-bg border-[var(--zego-border-soft)]')}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-emerald-600 disabled:opacity-30"
                    checked={sectionOn}
                    disabled={sectionKeys.length === 0}
                    onChange={(e) => setMany(sectionKeys, e.target.checked)}
                    aria-label={`เลือกทุกใบของ ${s.item ? (s.use?.budgetName ?? '') : 'นอกรายการเบิก'}`}
                  />
                  {s.item ? (
                    <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      <BudgetUseBadge use={s.use!} />
                      <span className={cx('font-medium', s.use?.kind === 'over' ? 'text-rose-700' : 'zego-text')}>{budgetUseText(s.use!)}</span>
                      <span className="ml-auto tabular-nums zego-text-tertiary">{s.item.expenseId}</span>
                    </p>
                  ) : (
                    <p className="min-w-0 flex-1 font-medium zego-text">นอกรายการเบิก <span className="font-normal zego-text-tertiary">— ไม่ได้ผูกกับรายการในใบเบิกเงินทดรอง ต้องดูเหตุผลประกอบ</span></p>
                  )}
                </div>
                <ul className="divide-y divide-[var(--zego-border-soft)]">
                  {s.rows.map((r) => {
                    const key = usageRowKey(r);
                    const together = pendingByReport.get(r.report.id) ?? 0;
                    return (
                      <li key={key} className={cx('flex flex-wrap items-center gap-3 px-3 py-2.5', selected.has(key) && 'bg-emerald-50/50')}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-emerald-600 disabled:opacity-30"
                          checked={selected.has(key)}
                          disabled={!r.pending}
                          onChange={(e) => setMany([key], e.target.checked)}
                          aria-label={`เลือก ${r.line.purpose}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm zego-text">{lineTitle(r.line)}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs zego-text-tertiary">
                            <span>{r.line.expenseType}</span>
                            {r.line.receiptDate && <span>· ใบเสร็จ {formatDate(r.line.receiptDate)}</span>}
                            {/* ส่งมาพร้อมกัน — เลือก/ผ่านไปด้วยกัน */}
                            {r.pending && together > 1 && <span className="zego-text-info">· ส่งพร้อมกัน {together} ใบ</span>}
                            {r.line.note && <span className="zego-text-warning">· {r.line.note}</span>}
                          </p>
                          <div className={cx('mt-1 text-xs', !hasEvidence(r.line) && 'font-medium')}>
                            <EvidencePreview fileName={r.line.evidenceFileName} image={r.line.evidenceImage} />
                          </div>
                        </div>
                        <span className={cx('shrink-0 text-sm font-semibold tabular-nums', r.line.rejected ? 'line-through zego-text-tertiary' : 'zego-text')}>
                          {formatCurrency(r.line.amount, r.line.currency)}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {r.line.rejected
                            ? <StatusBadge meta={{ label: 'ไม่ผ่าน', tone: 'red' }} size="sm" />
                            : <StatusBadge meta={expenseStatusMeta(r.report)} size="sm" />}
                          <button type="button" className="text-xs font-medium zego-text-info hover:underline" onClick={() => onOpenReport(r.report.id)}>
                            เปิดตรวจ
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {review.idle.length > 0 && (
            <section>
              <p className="mb-1.5 text-xs font-semibold zego-text-tertiary">รายการเบิกที่ยังไม่มีใบเสร็จ ({review.idle.length})</p>
              <ul className="space-y-1 text-xs zego-text-tertiary">
                {review.idle.map((b) => (
                  <li key={b.line.id} className="flex justify-between gap-2">
                    <span className="truncate">{b.line.purpose || b.line.expenseType}</span>
                    <span className="shrink-0 tabular-nums">เบิก {formatCurrency(b.line.amount, b.line.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={approve}
        loading={saving}
        tone="success"
        title={`ตรวจผ่าน ${chosen.length} ใบเสร็จ?`}
        message={`ยอดรวม ${chosenTotal} — ยืนยันว่าใบเสร็จที่เลือกถูกต้องตามรายการเบิก สถานะเปลี่ยนเป็น ตรวจแล้ว${onNext && pending.length === chosen.length ? ' แล้วไปกรุ๊ปถัดไป' : ''}`}
        confirmLabel="ตรวจผ่าน"
      />
    </>
  );
}
