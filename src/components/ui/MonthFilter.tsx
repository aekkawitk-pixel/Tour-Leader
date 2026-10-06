'use client';

/**
 * แบ่งรายการเป็นรายเดือน + เลือกดูตามปี/เดือน — ใช้ร่วมกันทุกพอร์ทัลมือถือ
 * (เจ้าหน้าที่ส่งกรุ๊ป: ตารางงาน / ซองเงิน · หัวหน้าทัวร์: งานของฉัน) ให้หน้าตาและพฤติกรรมเหมือนกัน ไม่ต้องจำหลายแบบ
 *
 * เลือกปี (dropdown) + ตาราง 12 เดือน — เห็นทั้งปีในหน้าเดียว ไม่ต้องเลื่อนหา · เดือนที่ไม่มีรายการกดไม่ได้ (ไม่เจอหน้าว่าง)
 */

import { useState } from 'react';
import { cx } from '@/components/ui/Primitives';
import { formatThaiMonthYear } from '@/lib/format';

export interface MonthGroup<T> {
  /** YYYY-MM */
  key: string;
  label: string;
  items: T[];
}

/**
 * จัดกลุ่มตามเดือนของวันที่ที่ส่งมา (ISO YYYY-MM-DD) โดยรักษาลำดับเดิมของรายการ —
 * ผู้เรียกเรียงมาแบบไหน (ใกล้สุดก่อน / ล่าสุดก่อน) กลุ่มก็เรียงตามนั้น
 * ปี/เดือนที่เลือกไว้ไม่มีในรายการชุดใหม่ (เช่นเปลี่ยนแท็บ) → กลับเป็น "ทั้งหมด" เอง ไม่ค้างหน้าว่าง
 * today (YYYY-MM-DD) = วันอ้างอิงของระบบ — ค่าเริ่มต้นของปีคือปีปัจจุบัน (ถ้าปีนี้ไม่มีรายการเลยจะตกไปเป็น "ทุกปี" เอง)
 */
export function useMonthGroups<T>(items: T[], dateOf: (item: T) => string, today: string) {
  const [pickedYear, setPickedYear] = useState<string>(() => today.slice(0, 4) || 'all');
  const [pickedMonth, setPickedMonth] = useState<string>('all');

  const all: MonthGroup<T>[] = [];
  for (const item of items) {
    const key = (dateOf(item) || '').slice(0, 7);
    const last = all[all.length - 1];
    if (last && last.key === key) last.items.push(item);
    else all.push({ key, label: key ? formatThaiMonthYear(`${key}-01`) : 'ไม่ระบุวันที่', items: [item] });
  }

  const years = [...new Set(all.map((m) => m.key.slice(0, 4)))];
  const year = years.includes(pickedYear) ? pickedYear : 'all';
  const inYear = year === 'all' ? all : all.filter((m) => m.key.startsWith(year));
  const month = inYear.some((m) => m.key === pickedMonth) ? pickedMonth : 'all';
  const shown = month === 'all' ? inYear : inYear.filter((m) => m.key === month);

  return {
    all,
    shown,
    years,
    inYear,
    year,
    month,
    // เปลี่ยนปีแล้วล้างเดือนเสมอ — เดือนเดิมอยู่คนละปี
    setYear: (y: string) => { setPickedYear(y); setPickedMonth('all'); },
    setMonth: setPickedMonth,
    total: items.length,
  };
}

const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * ช่วงเวลา: เลือกปี (dropdown) + ตาราง 12 เดือนของปีนั้น — หน้าตาเดียวกับตัวกรองในพอร์ทัลหัวหน้าทัวร์ (guide/MonthYearFilter)
 * เดือนที่ไม่มีรายการกดไม่ได้ · ตัวเลขมุมบอกจำนวน · แตะเดือนเดิมซ้ำ = กลับเป็นทั้งปี · "ทุกปี" = ไม่แสดงตารางเดือน
 * แสดงทุกครั้งที่มีรายการ (แม้มีเดือนเดียว) — หน้าตาเหมือนกันทุกแท็บ เห็นว่างานอยู่เดือนไหนของปี
 */
export function MonthYearSelect<T>({ groups }: { groups: ReturnType<typeof useMonthGroups<T>> }) {
  if (groups.all.length === 0) return null;
  // จำนวนบอกที่แท็บและมุมช่องเดือนแล้ว — ช่องเลือกปีไม่ต้องซ้ำ
  const counts = new Map(groups.all.map((m) => [m.key, m.items.length]));
  const year = groups.year;
  return (
    <div className="space-y-2 rounded-xl border zego-border-color zego-surface-bg p-2.5" role="group" aria-label="เลือกช่วงเวลา">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium zego-text-secondary">ช่วงเวลา</span>
        <select
          aria-label="เลือกปี"
          value={year}
          onChange={(e) => groups.setYear(e.target.value)}
          className="flex-1 rounded-lg border zego-border-color zego-surface-bg px-2 py-1.5 text-sm zego-text"
        >
          <option value="all">ทุกปี</option>
          {groups.years.map((y) => <option key={y} value={y}>ปี {Number(y) + 543}</option>)}
        </select>
      </div>

      {year !== 'all' && (
        <div className="grid grid-cols-6 gap-1" role="group" aria-label={`เลือกเดือนในปี ${Number(year) + 543}`}>
          {TH_MONTHS_SHORT.map((label, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const n = counts.get(key) ?? 0;
            const on = groups.month === key;
            return (
              <button
                key={key}
                type="button"
                disabled={n === 0}
                aria-pressed={on}
                onClick={() => groups.setMonth(on ? 'all' : key)}
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
      )}
    </div>
  );
}

/**
 * หัวเดือนเหนือรายการของเดือนนั้น
 * count — ใส่เฉพาะเมื่อเป็นข้อมูลอื่นที่ไม่ซ้ำกับจำนวนรายการ (เช่น ซองที่ยังต้องส่ง) · จำนวนรายการของเดือนบอกที่ช่องเดือนแล้ว
 */
export function MonthHeader({ label, count, unit }: { label: string; count?: number; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-sm font-bold zego-text">{label}</h2>
      {count !== undefined && <span className="text-xs zego-text-tertiary">{count} {unit}</span>}
    </div>
  );
}
