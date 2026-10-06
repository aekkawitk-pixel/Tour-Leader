'use client';

/**
 * ตัวกรองช่วงเวลาของพอร์ทัลหัวหน้าทัวร์ — เลือกปี แล้วเลือกเดือนจากตาราง 12 เดือนของปีนั้น
 * (แทนชิปเรียงแถวเดียว ซึ่งยาวจนดูยากเมื่อมีหลายเดือน/ข้ามปี) (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 *
 * ค่า (value):  'yyyy' = ทั้งปี · 'yyyy-mm' = เดือนเดียว (ปี ค.ศ. — แสดงเป็น พ.ศ.) · null = ไม่มีข้อมูลเลย
 * ตาราง 12 เดือนแสดงตลอด — เปิดมาที่ปีปัจจุบัน (ถ้าปีนี้ไม่มีกรุ๊ป = ปีล่าสุดที่มี) · เปลี่ยนปีที่ช่องเลือกปี
 * ใช้กรองด้วย matchesPeriodFilter(startDate, value) — เทียบ prefix ของวันที่ ISO
 * เดือนที่ไม่มีกรุ๊ปกดไม่ได้ · ตัวเลขมุมบอกจำนวนกรุ๊ปของเดือนนั้น
 */

import { cx } from '@/components/ui/Primitives';

const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function matchesPeriodFilter(isoDate: string, value: string | null): boolean {
  return !value || isoDate.startsWith(value);
}

/**
 * ค่าที่ใช้กรองจริง — ค่าที่เลือกไว้ยังมีกรุ๊ปอยู่ใช้ค่านั้น
 * ไม่ได้เลือก / ไม่มีกรุ๊ปแล้ว (ข้อมูลเปลี่ยน/ค้นหา) → ปีปัจจุบัน ถ้าปีนี้ไม่มีกรุ๊ป → ปีล่าสุดที่มี
 */
export function validPeriodFilter(value: string | null, monthKeys: string[], today: string): string | null {
  if (value && monthKeys.some((m) => m.startsWith(value))) return value;
  const years = [...new Set(monthKeys.map((m) => m.slice(0, 4)))].sort();
  if (years.length === 0) return null;
  const thisYear = today.slice(0, 4);
  return years.includes(thisYear) ? thisYear : years[years.length - 1];
}

export function MonthYearFilter({ counts, value, onChange }: {
  /** จำนวนกรุ๊ปต่อเดือน — key = 'yyyy-mm' */
  counts: Map<string, number>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const years = [...new Set([...counts.keys()].map((m) => m.slice(0, 4)))].sort().reverse();
  const year = value?.slice(0, 4) ?? null;
  if (!year) return null;
  const yearCount = (y: string) => [...counts].filter(([m]) => m.startsWith(y)).reduce((n, [, c]) => n + c, 0);

  return (
    <div className="space-y-2 rounded-xl border zego-border-color zego-surface-bg p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium zego-text-secondary">ช่วงเวลา</span>
        <select
          aria-label="เลือกปี"
          value={year}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border zego-border-color zego-surface-bg px-2 py-1.5 text-sm zego-text"
        >
          {years.map((y) => <option key={y} value={y}>ปี {Number(y) + 543} ({yearCount(y)})</option>)}
        </select>
      </div>

      {/* ตาราง 12 เดือนของปีที่เลือก — แสดงตลอด · แตะเดือนเดิมซ้ำ = กลับเป็นทั้งปี */}
      <div className="grid grid-cols-6 gap-1" role="group" aria-label={`เลือกเดือนในปี ${Number(year) + 543}`}>
        {TH_MONTHS_SHORT.map((label, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          const n = counts.get(key) ?? 0;
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={n === 0}
              aria-pressed={on}
              onClick={() => onChange(on ? year : key)}
              className={cx(
                'relative rounded-lg py-1.5 text-xs font-medium',
                on ? 'bg-emerald-600 text-white'
                  : n > 0 ? 'zego-surface-soft-bg zego-text zego-hover-surface'
                  : 'cursor-not-allowed zego-text-disabled',
              )}
            >
              {label}
              {n > 0 && (
                <span className={cx('absolute right-0.5 top-0 text-[9px] font-bold tabular-nums', on ? 'text-white' : 'zego-text-success')}>{n}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
