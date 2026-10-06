'use client';

/**
 * รายการค่าใช้จ่ายที่บันทึกแล้ว (หัวข้อ + ยอดรวมแยกสกุลเงิน + ทีละใบ) — แตะใบไหนเรียก onOpen เพื่อเปิดรายละเอียด
 * ใช้ในการ์ดสรุปหน้าบันทึกใบเสร็จ และหน้าเลือกวิธีบันทึกของ "นอกเหนือรายการเบิก" (กันบันทึกซ้ำ)
 */

import { StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { CurrencyStack } from './CurrencyStack';
import { expenseApprovedTotals, sumByCurrency } from './expenseAmounts';
import type { ExpenseRequest } from '@/types';
import { expenseStatusMeta } from '@/lib/logic/usageReport';

export function RecordedSection({
  title,
  tone,
  list,
  onOpen,
}: {
  title: string;
  tone: 'warning' | 'info';
  list: ExpenseRequest[];
  onOpen: (e: ExpenseRequest) => void;
}) {
  const sorted = [...list].sort((a, b) => (b.submittedAt ?? b.requestedAt).localeCompare(a.submittedAt ?? a.requestedAt));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className={cx('text-xs font-semibold', tone === 'warning' ? 'zego-text-warning' : 'zego-text-info')}>
          {title} ({list.length})
        </p>
        {list.length > 0 && <CurrencyStack totals={sumByCurrency(list)} className="text-right text-xs" lineClassName="font-semibold zego-text" />}
      </div>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-3 py-3 text-center text-xs zego-text-tertiary">ไม่มีรายการ</p>
      ) : (
        <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
          {sorted.map((e) => {
            const first = e.lines[0];
            return (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-emerald-50/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium zego-text">
                      {first?.purpose ?? first?.expenseType ?? 'ใบเสร็จ'}
                      {e.lines.length > 1 && <span className="font-normal zego-text-tertiary"> +{e.lines.length - 1}</span>}
                    </span>
                    <span className="block truncate text-[11px] zego-text-tertiary">
                      {first?.expenseType} · {formatDate(first?.receiptDate ?? e.submittedAt ?? e.requestedAt)}
                    </span>
                    <span className="block truncate text-[11px] zego-text-tertiary">หลักฐาน: {first?.evidenceFileName || '—'}</span>
                  </span>
                  <span className="shrink-0 space-y-0.5 text-right">
                    <CurrencyStack totals={expenseApprovedTotals(e)} className="text-right text-sm" lineClassName="font-semibold zego-text" />
                    {e.lines.some((l) => l.rejected) && <span className="block text-[11px] text-rose-600">อนุมัติบางรายการ</span>}
                    <StatusBadge meta={expenseStatusMeta(e)} size="sm" />
                  </span>
                  <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 zego-text-disabled" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
