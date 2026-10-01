'use client';

/**
 * การ์ดสรุปยอดตามสกุลเงิน — ไอคอนวงกลม + รหัสสกุลเงิน + ยอด เรียงเป็นกริด 2 คอลัมน์
 * ใช้แทนการต่อยอดหลายสกุลเงินเป็นข้อความเดียว เมื่อกรุ๊ปหนึ่งมีใบเสร็จหลายสกุลเงินปนกัน (ดู CurrencyStack
 * สำหรับจุดที่พื้นที่แคบกว่านี้ เช่น แถวรายการในลิสต์ — ที่นี่ใช้ตอนพื้นที่กว้างพอเป็นกริดได้)
 */

import type { CurrencyAmount } from './expenseAmounts';

/** สัญลักษณ์ย่อของแต่ละสกุลเงินที่ระบบรองรับ (ดู src/data/master.ts) — ไม่มีในตารางใช้ตัวอักษรแรกของรหัสแทน */
const CURRENCY_SYMBOL: Record<string, string> = {
  THB: '฿',
  JPY: '¥',
  KRW: '₩',
  CNY: '¥',
  TWD: 'NT$',
  EUR: '€',
  CHF: 'Fr.',
  USD: '$',
  TRY: '₺',
  NZD: 'NZ$',
  VND: '₫',
  GEL: '₾',
};

function formatPlainAmount(amount: number): string {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CurrencyAmountGrid({ totals, recordCount }: { totals: CurrencyAmount[]; recordCount?: number }) {
  if (totals.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs zego-text-tertiary">
        {typeof recordCount === 'number' && <span>{recordCount} รายการ</span>}
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium zego-text-success">{totals.length} สกุลเงิน</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {totals.map((t) => (
          <div key={t.currency} className="flex items-center gap-2 rounded-lg border zego-border-color zego-surface-soft-bg px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold zego-text-success">
              {CURRENCY_SYMBOL[t.currency] ?? t.currency.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium zego-text-tertiary">{t.currency}</span>
              <span className="block truncate text-sm font-semibold tabular-nums zego-text">{formatPlainAmount(t.amount)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
