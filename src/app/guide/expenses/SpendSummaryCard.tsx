'use client';

/**
 * การ์ดสรุปค่าใช้จ่ายที่บันทึกแล้วของกรุ๊ป — ใช้ที่หน้าบันทึกใบเสร็จ และรายละเอียดงาน (/guide/jobs/[id])
 */

import { useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { GuideExpenseDetailDrawer } from './GuideExpenseDetailDrawer';
import { RecordedSection } from './RecordedExpenseList';
import { sumByCurrency } from './expenseAmounts';
import type { BudgetItem } from '@/lib/logic/groupBudget';
import type { ExpenseRequest } from '@/types';

/** ค่าใช้จ่ายใบนี้บันทึก "ตามรายการเบิก" ไหม — ทุกบรรทัดในใบเดียวกันผูกรายการเบิกเดียวกัน (ดู ExpenseQuickForm) */
const isInBudget = (e: ExpenseRequest) => e.lines.some((l) => Boolean(l.budgetLineId));

/**
 * การ์ดสรุปยอดที่บันทึกแล้วของกรุ๊ป — 1 ช่องต่อ 1 สกุลเงิน (ไม่บวกข้ามสกุลเงิน) · แสดงเสมอ ยังไม่บันทึก = 0
 * แต่ละช่องแยกยอด "ตามรายการเบิก" / "นอกรายการเบิก" · สกุลที่มีงบเบิก → แถบสัดส่วนเทียบเฉพาะยอดตามรายการเบิก
 * "ดูรายละเอียด" → รายการทุกใบแยกสองหัวข้อ แตะใบไหนเปิดรายละเอียดเต็ม (ดูรูป / แก้ไข / ยกเลิก) ได้จากตรงนี้
 */
export function SpendSummaryCard({ recorded, budgetItems, title = 'สรุปค่าใช้จ่ายที่บันทึกแล้ว' }: { recorded: ExpenseRequest[]; budgetItems: BudgetItem[]; title?: string }) {
  const [listOpen, setListOpen] = useState(false);
  const [detail, setDetail] = useState<ExpenseRequest | null>(null);

  const inBudget = recorded.filter(isInBudget);
  const outside = recorded.filter((e) => !isInBudget(e));
  const toMap = (list: ExpenseRequest[]) => new Map(sumByCurrency(list).map((t) => [t.currency, t.amount]));
  const spentIn = toMap(inBudget);
  const spentOut = toMap(outside);
  const budget = new Map<string, number>();
  for (const { line } of budgetItems) budget.set(line.currency, (budget.get(line.currency) ?? 0) + line.amount);
  // สกุลเงินที่มีงบก่อน แล้วตามด้วยสกุลที่บันทึกนอกงบ · ไม่มีอะไรเลย = ช่อง THB 0
  const currencies = [...new Set([...budget.keys(), ...spentIn.keys(), ...spentOut.keys()])];
  if (currencies.length === 0) currencies.push('THB');
  const num = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold zego-text">{title}</p>
        <span className="rounded-full zego-surface-soft-bg px-2 py-0.5 text-xs zego-text-secondary">{recorded.length} รายการ</span>
      </div>
      <div className={cx('grid gap-2', currencies.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {currencies.map((c) => {
          const amtIn = spentIn.get(c) ?? 0;
          const amtOut = spentOut.get(c) ?? 0;
          const b = budget.get(c);
          const over = b !== undefined && amtIn > b;
          const pct = b ? Math.min(100, Math.round((amtIn / b) * 100)) : 0;
          return (
            <div key={c} className="rounded-xl border zego-border-color zego-surface-soft-bg px-3 py-2.5">
              <p className="text-[11px] font-semibold tracking-wide zego-text-tertiary">{c}</p>
              <p className="text-lg font-bold tabular-nums leading-tight zego-text">{num(amtIn + amtOut)}</p>
              <div className="mt-1 space-y-0.5 text-[11px] tabular-nums">
                <p className="flex justify-between gap-2">
                  <span className="zego-text-tertiary">ตามรายการเบิก</span>
                  <span className={cx('font-medium', over ? 'zego-text-danger' : 'zego-text-secondary')}>{num(amtIn)}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="zego-text-tertiary">นอกรายการเบิก</span>
                  <span className={cx('font-medium', amtOut > 0 ? 'zego-text-warning' : 'zego-text-secondary')}>{num(amtOut)}</span>
                </p>
              </div>
              {b !== undefined && (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                    <div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums zego-text-tertiary">
                    งบเบิก {formatCurrency(b, c)}
                    {over && <span className="font-medium zego-text-danger"> · เกิน {formatCurrency(amtIn - b, c)}</span>}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
      {recorded.length > 0 && (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border zego-border-color py-2 text-xs font-medium zego-text-info hover:bg-sky-50"
        >
          ดูรายละเอียด {recorded.length} รายการ
          {outside.length > 0 && <span className="zego-text-warning">(นอกรายการเบิก {outside.length})</span>}
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      )}

      {listOpen && !detail && (
        <Modal
          open
          onClose={() => setListOpen(false)}
          size="sm"
          title="ค่าใช้จ่ายที่บันทึกแล้ว"
          description={`${recorded.length} รายการ · แตะเพื่อดูรายละเอียด / รูป / แก้ไข`}
          footer={<Button variant="secondary" className="w-full" onClick={() => setListOpen(false)}>ปิด</Button>}
        >
          <div className="space-y-4">
            <RecordedSection title="นอกรายการเบิก" tone="warning" list={outside} onOpen={setDetail} />
            <RecordedSection title="ตามรายการเบิก" tone="info" list={inBudget} onOpen={setDetail} />
          </div>
        </Modal>
      )}
      <GuideExpenseDetailDrawer expense={detail} onClose={() => setDetail(null)} />
    </Card>
  );
}
