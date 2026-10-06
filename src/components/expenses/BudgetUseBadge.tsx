/**
 * ใบเสร็จเทียบรายการเบิก — ป้าย + ข้อความ ใช้ในหน้าตรวจใบเบิก (ExpenseDrawer) ทั้งทั้งใบ และต่อใบเสร็จเมื่อใบเบิกมีหลายใบเสร็จ
 * เขียว ครบ · ฟ้า ใช้ไม่ครบ (เหลือ) · แดง เกิน · เทา นอกรายการเบิก — คำนวณที่ budgetUseOf (lib/logic/groupBudget.ts)
 */

import { cx } from '@/components/ui/Primitives';
import { formatCurrency } from '@/lib/format';
import type { BudgetUse, BudgetUseKind } from '@/lib/logic/groupBudget';

export const BUDGET_USE_META: Record<BudgetUseKind, { label: string; cls: string }> = {
  full: { label: 'ครบ', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  under: { label: 'ใช้ไม่ครบ', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  over: { label: 'เกิน', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  outside: { label: 'นอกรายการเบิก', cls: 'bg-slate-50 text-slate-600 ring-slate-200' },
};

export function budgetUseText(u: BudgetUse): string {
  if (u.kind === 'outside' || u.currency === undefined) return 'ไม่ได้ผูกรายการเบิก';
  const money = (n: number) => formatCurrency(n, u.currency!);
  const tail = u.kind === 'over' ? ` · เกิน ${money(u.diff!)}` : u.kind === 'under' ? ` · เหลือ ${money(-u.diff!)}` : '';
  return `${u.budgetName} · เบิก ${money(u.budget!)} · ใช้รวม ${money(u.used!)}${tail}`;
}

export function BudgetUseBadge({ use }: { use: BudgetUse }) {
  return <span className={cx('rounded px-1.5 py-0.5 font-medium ring-1 ring-inset', BUDGET_USE_META[use.kind].cls)}>{BUDGET_USE_META[use.kind].label}</span>;
}
