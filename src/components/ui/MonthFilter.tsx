'use client';

/**
 * แบ่งรายการเป็นรายเดือน + เลือกดูตามปี/เดือน — ใช้ร่วมกันทุกพอร์ทัลมือถือ
 * (เจ้าหน้าที่ส่งกรุ๊ป: ตารางงาน / ซองเงิน · หัวหน้าทัวร์: งานของฉัน) ให้หน้าตาและพฤติกรรมเหมือนกัน ไม่ต้องจำหลายแบบ
 *
 * ใช้ dropdown ปี + เดือน แทนปุ่มเรียงแถว — งานสะสมหลายเดือน/ข้ามปีแล้วปุ่มยาวจนต้องเลื่อนหา
 * ตัวเลือกมีเฉพาะปี/เดือนที่มีรายการจริง (ไม่มีให้เลือกแล้วเจอหน้าว่าง)
 */

import { useState } from 'react';
import { SelectInput } from '@/components/ui/FormField';
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

/** ปี + เดือน แบบ dropdown คู่กัน · มีเดือนเดียวไม่ต้องแสดง (ไม่มีอะไรให้เลือก) */
export function MonthYearSelect<T>({ groups }: { groups: ReturnType<typeof useMonthGroups<T>> }) {
  if (groups.all.length <= 1) return null;
  const count = (list: MonthGroup<T>[]) => list.reduce((n, m) => n + m.items.length, 0);
  const yearOptions = [
    { value: 'all', label: `ทุกปี (${groups.total})` },
    ...groups.years.map((y) => ({ value: y, label: `${Number(y) + 543} (${count(groups.all.filter((m) => m.key.startsWith(y)))})` })),
  ];
  const monthOptions = [
    { value: 'all', label: `ทุกเดือน (${count(groups.inYear)})` },
    // ทุกปี → ชื่อเดือนต้องมีปีกำกับ ไม่งั้น "ตุลาคม" สองปีแยกไม่ออก · เลือกปีแล้ว → ชื่อเดือนอย่างเดียวพอ
    ...groups.inYear.map((m) => ({
      value: m.key,
      label: `${groups.year === 'all' ? m.label : m.label.split(' ')[0]} (${m.items.length})`,
    })),
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="เลือกปีและเดือน">
      <SelectInput label="ปี" value={groups.year} onChange={(e) => groups.setYear(e.target.value)} options={yearOptions} />
      <SelectInput label="เดือน" value={groups.month} onChange={(e) => groups.setMonth(e.target.value)} options={monthOptions} />
    </div>
  );
}

/** หัวเดือนเหนือรายการของเดือนนั้น */
export function MonthHeader({ label, count, unit }: { label: string; count: number; unit: string }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-sm font-bold zego-text">{label}</h2>
      <span className="text-xs zego-text-tertiary">{count} {unit}</span>
    </div>
  );
}
