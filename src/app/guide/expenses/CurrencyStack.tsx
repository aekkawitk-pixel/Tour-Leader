'use client';

/**
 * แสดงยอดหลายสกุลเงินเป็นบรรทัดแยกกัน (ไม่ join ด้วย " · " เป็นข้อความเดียว)
 * ใช้ในคอลัมน์แคบ/ชิดขวา (หัวการ์ดกรุ๊ป, แถวรายการในลิสต์) ที่ข้อความยาวจะล้น/ตัดกับไอคอนข้าง ๆ
 * ถ้ามีสกุลเงินเดียวก็แสดงบรรทัดเดียวตามปกติ — ไม่ต่างจากเดิม
 */

import { cx } from '@/components/ui/Primitives';
import { formatCurrency } from '@/lib/format';
import type { CurrencyAmount } from './expenseAmounts';

export function CurrencyStack({
  totals,
  className,
  lineClassName,
}: {
  totals: CurrencyAmount[];
  className?: string;
  lineClassName?: string;
}) {
  const rows = totals.length > 0 ? totals : [{ amount: 0, currency: 'THB' }];
  return (
    <span className={className}>
      {rows.map((t) => (
        <span key={t.currency} className={cx('block', lineClassName)}>
          {formatCurrency(t.amount, t.currency)}
        </span>
      ))}
    </span>
  );
}
