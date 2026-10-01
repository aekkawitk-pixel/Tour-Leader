'use client';

/**
 * เลือกรายการจาก "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" (ใบเบิกเงินทดรองที่คนทำเบิกเตรียมไว้) — วิธีบันทึก "ตามรายการเบิก"
 *
 * จัดรูปแบบตามเอกสารจริง (เช่น EXPOP26090218.xls): หัวเอกสาร (Ref / รหัสกรุ๊ป / วันที่เดินทาง / Pax / สกุลเงิน)
 * → รายการแยกตามหมวด เลขลำดับต่อเนื่องทั้งใบ → แต่ละรายการมี รายการ · คำอธิบาย · จำนวน × ราคา/หน่วย − ส่วนลด
 * · จำนวนเงินรวม · ใช้ไป · คงเหลือ → ยอดรวมท้ายเอกสาร
 * จอมือถือแคบ จึงแสดงแต่ละรายการเป็นแถวสองบรรทัดแทนตาราง 12 คอลัมน์ของไฟล์ต้นฉบับ
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, formatNumber } from '@/lib/format';
import { GuideExpenseDetailDrawer } from './GuideExpenseDetailDrawer';
import { CurrencyStack } from './CurrencyStack';
import { groupAmountsByCurrency } from './expenseAmounts';
import type { ExpenseLine, ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

/** หมวดในไฟล์ต้นทางบางชุดขึ้นต้นด้วย "#หมวด" (เช่น #หมวดเข้าชมสถานที่) — ตัดออกให้อ่านง่าย */
const categoryLabel = (raw: string) => raw.replace(/^#\s*(หมวด)?\s*/, '').trim() || 'อื่น ๆ';

export function AdvanceRequestPicker({
  period,
  documents,
  usedByBudget,
  selectedLineId,
  onPick,
  onBack,
}: {
  period: TourPeriodMaster;
  /** ใบเบิกเงินทดรองของกรุ๊ปนี้ (category 'advance') — ส่วนมากมีใบเดียว */
  documents: ExpenseRequest[];
  /** budgetLineId → (สกุลเงิน → ยอดที่บันทึกแล้ว) */
  usedByBudget: Map<string, Map<string, number>>;
  selectedLineId: string;
  onPick: (lineId: string) => void;
  onBack: () => void;
}) {
  const { expenses } = useDemo();
  /** รายการงบที่กำลังเปิดดูรายละเอียด (ใบเสร็จที่บันทึกเข้ารายการนี้แล้ว) */
  const [viewing, setViewing] = useState<{ no: number; line: ExpenseLine } | null>(null);
  /** ใบเสร็จที่เปิดดูเต็ม — ซ่อนหน้ารายละเอียดรายการงบระหว่างนั้น ปิดแล้วกลับมาที่เดิม */
  const [detailExpense, setDetailExpense] = useState<ExpenseRequest | null>(null);
  /**
   * ใบเบิกที่เปิดอยู่ — กรุ๊ปมีหลายใบ (หลาย Ref) ให้เห็นรายการใบเบิก + ยอดรวมทั้งกรุ๊ปก่อน แล้วค่อยเข้าไปเลือกรายการในใบนั้น
   * มีใบเดียว = เปิดใบนั้นเลย · มีรายการเลือกไว้แล้ว (กด "เปลี่ยนรายการ") = เปิดใบที่มีรายการนั้น
   */
  const multi = documents.length > 1;
  const [openDocId, setOpenDocId] = useState<string | null>(() =>
    multi ? (documents.find((d) => d.lines.some((l) => l.id === selectedLineId))?.id ?? null) : null,
  );
  const openDoc = multi ? documents.find((d) => d.id === openDocId) ?? null : documents[0] ?? null;
  const back = () => (multi && openDoc ? setOpenDocId(null) : onBack());

  // ใบเสร็จ (ค่าใช้จ่ายจริง) ของกรุ๊ปนี้ที่ผูกกับรายการงบ — เกณฑ์เดียวกับยอด "ใช้ไป" (ไม่นับปฏิเสธ/ยกเลิก)
  const recordsByLine = useMemo(() => {
    const groupIds = new Set(documents.map((d) => d.jobId));
    const out = new Map<string, { expense: ExpenseRequest; line: ExpenseLine }[]>();
    for (const e of expenses) {
      if (!groupIds.has(e.jobId) || e.category !== 'actual' || e.status === 'rejected' || e.status === 'cancelled') continue;
      for (const l of e.lines) {
        if (!l.budgetLineId || l.rejected) continue; // บรรทัดที่บัญชีไม่อนุมัติ ไม่นับ (เกณฑ์เดียวกับยอด "ใช้ไป")
        out.set(l.budgetLineId, [...(out.get(l.budgetLineId) ?? []), { expense: e, line: l }]);
      }
    }
    for (const list of out.values()) list.sort((a, b) => (b.expense.submittedAt ?? '').localeCompare(a.expense.submittedAt ?? ''));
    return out;
  }, [expenses, documents]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={back} className="rounded p-1 zego-text-secondary" aria-label="ย้อนกลับ">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold zego-text">{openDoc ? 'เลือกรายการเบิก' : `เลือกใบเบิก (${documents.length} ใบ)`}</p>
      </div>

      {openDoc ? (
        <AdvanceDocument
          key={openDoc.id}
          doc={openDoc}
          period={period}
          usedByBudget={usedByBudget}
          selectedLineId={selectedLineId}
          onPick={onPick}
          recordCount={(lineId) => recordsByLine.get(lineId)?.length ?? 0}
          onView={(no, line) => setViewing({ no, line })}
        />
      ) : (
        <AdvanceDocList documents={documents} usedByBudget={usedByBudget} onOpen={setOpenDocId} />
      )}

      <Button variant="secondary" className="w-full" onClick={back}>
        ย้อนกลับ
      </Button>

      {viewing && !detailExpense && (
        <BudgetLineDetail
          no={viewing.no}
          line={viewing.line}
          used={usedByBudget.get(viewing.line.id)?.get(viewing.line.currency) ?? 0}
          records={recordsByLine.get(viewing.line.id) ?? []}
          onClose={() => setViewing(null)}
          onOpenExpense={setDetailExpense}
          onRecordMore={() => {
            const id = viewing.line.id;
            setViewing(null);
            onPick(id);
          }}
        />
      )}
      <GuideExpenseDetailDrawer expense={detailExpense} onClose={() => setDetailExpense(null)} />
    </div>
  );
}

/** ยอดงบ / ใช้ไป ของใบเบิกหนึ่งใบ แยกสกุลเงิน — ใช้ไปนับเฉพาะสกุลเดียวกับรายการงบ (เกณฑ์เดียวกับหน้ารายการ) */
function docTotals(doc: ExpenseRequest, usedByBudget: Map<string, Map<string, number>>) {
  const budget: Record<string, number> = {};
  const used: Record<string, number> = {};
  for (const l of doc.lines) {
    budget[l.currency] = (budget[l.currency] ?? 0) + l.amount;
    used[l.currency] = (used[l.currency] ?? 0) + (usedByBudget.get(l.id)?.get(l.currency) ?? 0);
  }
  return { budget, used };
}

function addInto(into: Record<string, number>, from: Record<string, number>) {
  for (const [c, a] of Object.entries(from)) into[c] = (into[c] ?? 0) + a;
}

/** กรุ๊ปที่มีใบเบิกหลาย Ref — สรุปยอดรวมทั้งกรุ๊ป + การ์ดทีละใบ แตะเพื่อเปิดใบนั้น */
function AdvanceDocList({
  documents,
  usedByBudget,
  onOpen,
}: {
  documents: ExpenseRequest[];
  usedByBudget: Map<string, Map<string, number>>;
  onOpen: (id: string) => void;
}) {
  const perDoc = documents.map((doc) => ({ doc, ...docTotals(doc, usedByBudget) }));
  const allBudget: Record<string, number> = {};
  const allUsed: Record<string, number> = {};
  perDoc.forEach((d) => {
    addInto(allBudget, d.budget);
    addInto(allUsed, d.used);
  });
  const currencies = Object.keys(allBudget);

  return (
    <div className="space-y-2.5">
      {/* ยอดรวมทั้งกรุ๊ป — แยกบรรทัดตามสกุลเงิน ไม่บวกข้ามสกุล */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2.5">
        <p className="text-xs font-semibold text-sky-900">รวมทั้งกรุ๊ป · {documents.length} ใบเบิก</p>
        <div className="mt-1 space-y-0.5 text-xs">
          {currencies.map((c) => {
            const remaining = allBudget[c] - (allUsed[c] ?? 0);
            return (
              <div key={c} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
                <span className="font-semibold zego-text">งบ {formatCurrency(allBudget[c], c)}</span>
                <span className="zego-text-secondary">
                  ใช้ไป {formatCurrency(allUsed[c] ?? 0, c)} ·{' '}
                  <span className={remaining < 0 ? 'zego-text-danger' : 'zego-text-success'}>
                    {remaining < 0 ? 'เกิน' : 'คงเหลือ'} {formatCurrency(Math.abs(remaining), c)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="space-y-2">
        {perDoc.map(({ doc, budget, used }) => {
          const categories = new Set(doc.lines.map((l) => categoryLabel(l.expenseType))).size;
          return (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => onOpen(doc.id)}
                className="flex w-full items-start gap-3 rounded-xl border zego-border-color px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/40"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">
                  <Icon name="receipt" className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">Ref : {doc.id}</span>
                  <span className="block text-xs zego-text-tertiary">
                    {doc.lines.length} รายการ · {categories} หมวด
                    {doc.sourceDoc?.printedAt ? ` · ออกเมื่อ ${doc.sourceDoc.printedAt.split(' ')[0]}` : ''}
                  </span>
                  {Object.entries(budget).map(([c, amt]) => {
                    const u = used[c] ?? 0;
                    return (
                      <span key={c} className="block text-xs tabular-nums">
                        <span className="font-semibold zego-text">{formatCurrency(amt, c)}</span>
                        {u > 0 && (
                          <span className={amt - u < 0 ? 'zego-text-danger' : 'zego-text-secondary'}>
                            {' '}· ใช้ไป {formatCurrency(u, c)}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
                <Icon name="chevronRight" className="mt-2 h-4 w-4 shrink-0 zego-text-disabled" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** รายละเอียดรายการงบ 1 รายการ — งบ / ใช้ไป / คงเหลือ + ใบเสร็จทุกใบที่บันทึกเข้ารายการนี้ */
function BudgetLineDetail({
  no,
  line,
  used,
  records,
  onClose,
  onOpenExpense,
  onRecordMore,
}: {
  no: number;
  line: ExpenseLine;
  used: number;
  records: { expense: ExpenseRequest; line: ExpenseLine }[];
  onClose: () => void;
  onOpenExpense: (e: ExpenseRequest) => void;
  onRecordMore: () => void;
}) {
  const remaining = line.amount - used;
  const over = remaining < 0;
  const pct = line.amount > 0 ? Math.min(100, Math.round((used / line.amount) * 100)) : 0;
  // บันทึกด้วยสกุลเงินอื่นที่ไม่ใช่สกุลของงบ — ไม่นับรวมใน "ใช้ไป" แต่ยังแสดงให้เห็นในรายการ
  const otherCurrency = records.filter((r) => r.line.currency !== line.currency);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${no}. ${line.purpose}`}
      description={[categoryLabel(line.expenseType), line.description].filter(Boolean).join(' · ')}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" icon="plus" onClick={onRecordMore}>บันทึกเพิ่ม</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5 rounded-lg zego-surface-soft-bg px-3 py-2.5 text-sm">
          {line.quantity !== undefined && line.unitPrice !== undefined && (
            <p className="text-xs tabular-nums zego-text-tertiary">
              {formatNumber(line.quantity)} × {formatCurrency(line.unitPrice, line.currency)}
              {line.discount ? ` − ส่วนลด ${formatCurrency(line.discount, line.currency)}` : ''}
            </p>
          )}
          <div className="flex justify-between"><span className="zego-text-secondary">งบ</span><span className="font-semibold tabular-nums zego-text">{formatCurrency(line.amount, line.currency)}</span></div>
          <div className="flex justify-between"><span className="zego-text-secondary">ใช้ไป</span><span className="tabular-nums zego-text">{formatCurrency(used, line.currency)}</span></div>
          <div className="flex justify-between">
            <span className="zego-text-secondary">{over ? 'เกินงบ' : 'คงเหลือ'}</span>
            <span className={cx('font-semibold tabular-nums', over ? 'zego-text-danger' : 'zego-text-success')}>
              {formatCurrency(Math.abs(remaining), line.currency)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold zego-text-secondary">ใบเสร็จที่บันทึกแล้ว ({records.length})</p>
          {records.length === 0 ? (
            <p className="rounded-lg border border-dashed zego-border-color px-3 py-4 text-center text-xs zego-text-tertiary">ยังไม่มีใบเสร็จในรายการนี้</p>
          ) : (
            <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
              {records.map(({ expense, line: rec }) => (
                <li key={`${expense.id}-${rec.id}`}>
                  <button type="button" onClick={() => onOpenExpense(expense)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-emerald-50/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium zego-text">{rec.purpose}</span>
                      <span className="block text-[11px] zego-text-tertiary">
                        {expense.id} · {formatDate(rec.receiptDate ?? expense.submittedAt ?? expense.requestedAt)}
                      </span>
                      <span className="block truncate text-[11px] zego-text-tertiary">หลักฐาน: {rec.evidenceFileName || '—'}</span>
                    </span>
                    <span className="shrink-0 space-y-0.5 text-right">
                      <span className="block text-sm font-semibold tabular-nums zego-text">{formatCurrency(rec.amount, rec.currency)}</span>
                      <StatusBadge meta={EXPENSE_STATUS[expense.status]} size="sm" />
                    </span>
                    <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 zego-text-disabled" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {otherCurrency.length > 0 && (
            <p className="mt-1 text-[11px] zego-text-warning">มี {otherCurrency.length} ใบบันทึกด้วยสกุลเงินอื่น — ไม่นับรวมในยอด &quot;ใช้ไป&quot;</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AdvanceDocument({
  doc,
  period,
  usedByBudget,
  selectedLineId,
  onPick,
  recordCount,
  onView,
}: {
  doc: ExpenseRequest;
  period: TourPeriodMaster;
  usedByBudget: Map<string, Map<string, number>>;
  selectedLineId: string;
  onPick: (lineId: string) => void;
  recordCount: (lineId: string) => number;
  onView: (no: number, line: ExpenseLine) => void;
}) {
  // จัดกลุ่มตามหมวดตามลำดับที่ปรากฏในเอกสาร · เลขลำดับ (No.) นับต่อเนื่องทั้งใบเหมือนต้นฉบับ
  const sections: { category: string; rows: { no: number; line: ExpenseLine }[] }[] = [];
  doc.lines.forEach((line, i) => {
    const category = categoryLabel(line.expenseType);
    const last = sections.at(-1);
    if (last && last.category === category) last.rows.push({ no: i + 1, line });
    else sections.push({ category, rows: [{ no: i + 1, line }] });
  });

  const currencies = [...new Set(doc.lines.map((l) => l.currency))];
  const totals = groupAmountsByCurrency(doc.lines.map((l) => ({ amount: l.amount, currency: l.currency })));
  // นำเข้าจากไฟล์ → ใช้ค่าตามเอกสารต้นฉบับ · สร้างในระบบ → ใช้ข้อมูลจากโปรแกรมทัวร์แทน
  const meta = doc.sourceDoc;
  const pax = meta?.pax ?? (period.seatBooked ? `${period.seatBooked} ท่าน + 1 TL` : '');
  const travelDates = meta?.travelDates ?? formatDateRange(period.startDate, period.endDate);

  return (
    <div className="overflow-hidden rounded-xl border zego-border-color">
      {/* หัวเอกสาร */}
      <div className="space-y-1 border-b zego-border-color bg-sky-50/70 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold zego-text">เอกสารเบิกค่าใช้จ่ายกรุ๊ป</p>
          <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
            Ref : {doc.id}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
          <dt className="zego-text-tertiary">รหัสกรุ๊ป</dt>
          <dd className="font-medium zego-text">{period.groupCode}</dd>
          <dt className="zego-text-tertiary">วันที่เดินทาง</dt>
          <dd className="zego-text-secondary">{travelDates}</dd>
          {pax && (
            <>
              <dt className="zego-text-tertiary">Pax</dt>
              <dd className="zego-text-secondary">{pax}</dd>
            </>
          )}
          <dt className="zego-text-tertiary">สกุลเงิน</dt>
          <dd className="zego-text-secondary">{currencies.join(', ')}</dd>
          {/* ไม่แสดงผู้ติดต่อ / พิมพ์โดย ให้หัวหน้าทัวร์ (ตามที่ตกลง) — ยังเก็บไว้ใน sourceDoc ดูได้ฝั่งผู้จัด */}
        </dl>
      </div>

      {/* รายการแยกหมวด */}
      {sections.map((section) => (
        <div key={`${section.category}-${section.rows[0].no}`}>
          <p className="zego-surface-soft-bg px-3 py-1 text-[11px] font-semibold zego-text-secondary">{section.category}</p>
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {section.rows.map(({ no, line }) => {
              const used = usedByBudget.get(line.id)?.get(line.currency) ?? 0;
              const remaining = line.amount - used;
              const selected = line.id === selectedLineId;
              const hasUnit = line.quantity !== undefined && line.unitPrice !== undefined;
              return (
                <li key={line.id}>
                  <button
                    type="button"
                    onClick={() => onPick(line.id)}
                    className={cx(
                      'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-emerald-50/50',
                      selected && 'bg-emerald-50 ring-1 ring-inset ring-emerald-300',
                    )}
                  >
                    <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums zego-text-tertiary">{no}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium zego-text">{line.purpose}</span>
                      {line.description && <span className="block text-xs zego-text-secondary">{line.description}</span>}
                      {hasUnit && (
                        <span className="block text-[11px] tabular-nums zego-text-tertiary">
                          {formatNumber(line.quantity!)} × {formatCurrency(line.unitPrice!, line.currency)}
                          {line.discount ? ` − ส่วนลด ${formatCurrency(line.discount, line.currency)}` : ''}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums zego-text">{formatCurrency(line.amount, line.currency)}</span>
                      {used > 0 && (
                        <>
                          <span className="block text-[11px] tabular-nums zego-text-tertiary">ใช้ไป {formatCurrency(used, line.currency)}</span>
                          <span className={cx('block text-[11px] font-medium tabular-nums', remaining < 0 ? 'zego-text-danger' : 'zego-text-success')}>
                            คงเหลือ {formatCurrency(remaining, line.currency)}
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                  {/* แยกปุ่มจากแถว (ปุ่มซ้อนปุ่มไม่ได้) — แตะแถว = บันทึกเข้ารายการนี้ · แตะลิงก์ = ดูใบเสร็จที่บันทึกแล้ว */}
                  {(used > 0 || recordCount(line.id) > 0) && (
                    <button
                      type="button"
                      onClick={() => onView(no, line)}
                      className={cx(
                        'flex w-full items-center justify-end gap-1 px-3 pb-2 text-[11px] font-medium hover:underline',
                        selected ? 'bg-emerald-50' : '',
                        remaining < 0 ? 'zego-text-danger' : 'zego-text-info',
                      )}
                    >
                      ดูรายละเอียด · {recordCount(line.id)} ใบเสร็จ
                      <Icon name="chevronRight" className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* ยอดรวมท้ายเอกสาร */}
      <div className="flex items-start justify-between gap-2 border-t zego-border-color px-3 py-2">
        <span className="text-xs font-semibold zego-text-secondary">รวม {doc.lines.length} รายการ</span>
        <CurrencyStack totals={totals} className="text-right" lineClassName="text-sm font-semibold" />
      </div>
    </div>
  );
}
