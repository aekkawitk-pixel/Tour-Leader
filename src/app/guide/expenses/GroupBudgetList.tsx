'use client';

/**
 * รายการงบของกรุ๊ป (จากใบเบิกเงินทดรองที่คนทำเบิกเตรียมไว้) เทียบกับยอดที่หัวหน้าทัวร์บันทึกใบเสร็จแล้ว
 * ใช้ในหน้า "ค่าใช้จ่ายรายกรุ๊ป" — ดูได้ว่ารายการไหนใช้ไปเท่าไร เหลือเท่าไร ก่อนและระหว่างเดินทาง
 */

import { cx } from '@/components/ui/Primitives';
import { formatCurrency } from '@/lib/format';
import type { BudgetItem } from '@/lib/logic/groupBudget';

export function GroupBudgetList({
  items,
  recorded,
}: {
  items: BudgetItem[];
  /** budgetLineId → (สกุลเงิน → ยอดที่บันทึกแล้ว) */
  recorded: Map<string, Map<string, number>>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold zego-text-secondary">รายการตามงบ ({items.length})</p>
      <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
        {items.map(({ line }) => {
          // เทียบเฉพาะสกุลเงินเดียวกับงบ — บันทึกด้วยสกุลอื่นแสดงแยกไว้ ไม่บวกข้ามสกุลเงิน
          const used = recorded.get(line.id) ?? new Map<string, number>();
          const usedSame = used.get(line.currency) ?? 0;
          const otherCurrencies = [...used.entries()].filter(([c]) => c !== line.currency);
          const pct = line.amount > 0 ? Math.min(100, Math.round((usedSame / line.amount) * 100)) : 0;
          const over = usedSame > line.amount;
          return (
            <li key={line.id} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] zego-text-tertiary">{line.expenseType}</p>
                  <p className="text-sm font-medium zego-text">{line.purpose}</p>
                  {line.description && <p className="text-xs zego-text-secondary">{line.description}</p>}
                  {line.quantity !== undefined && line.unitPrice !== undefined && (
                    <p className="text-[11px] tabular-nums zego-text-tertiary">
                      {line.quantity} × {formatCurrency(line.unitPrice, line.currency)}
                      {line.discount ? ` − ${formatCurrency(line.discount, line.currency)}` : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums zego-text">{formatCurrency(line.amount, line.currency)}</p>
                  <p className={cx('text-[11px] tabular-nums', over ? 'font-semibold zego-text-danger' : usedSame > 0 ? 'zego-text-success' : 'zego-text-tertiary')}>
                    ใช้แล้ว {formatCurrency(usedSame, line.currency)}
                  </p>
                  {otherCurrencies.map(([c, amt]) => (
                    <p key={c} className="text-[11px] tabular-nums zego-text-tertiary">+ {formatCurrency(amt, c)}</p>
                  ))}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full zego-surface-soft-bg">
                <div
                  className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-emerald-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {over && (
                <p className="mt-0.5 text-[11px] font-medium zego-text-danger">
                  เกินงบ {formatCurrency(usedSame - line.amount, line.currency)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
