'use client';

/**
 * ปฏิทินนัดหมายรายเดือนของหัวหน้าทัวร์ (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 *
 * วันที่มีนัดมีจุดสีใต้ตัวเลข (หลายนัดในวันเดียว = หลายจุด สูงสุด 3) · แตะวัน = ดูเฉพาะนัดวันนั้น · แตะซ้ำ = ทั้งเดือน
 * สีจุด: ส้ม = รอคุณยืนยัน · ฟ้า = รอการเงิน (คำขอของคุณ / ขอเลื่อน) · เขียว = ยืนยันแล้ว · เทา = เข้าพบแล้ว
 * นัดที่ยกเลิกไม่แสดง
 */

import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/Primitives';
import { formatThaiMonthYear, toISODate } from '@/lib/format';
import type { Appointment } from '@/types';

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function appointmentDotClass(a: Appointment): string {
  if (a.status === 'attended') return 'bg-slate-400';
  if (a.status === 'confirmed') return 'bg-emerald-500';
  if (a.status === 'pending' && !a.requestedByLeader) return 'bg-amber-500';
  return 'bg-sky-500';
}

export function AppointmentCalendar({ month, onMonth, selected, onSelect, appointments, today }: {
  /** 'yyyy-mm' */
  month: string;
  onMonth: (month: string) => void;
  /** 'yyyy-mm-dd' ที่เลือก — null = ทั้งเดือน */
  selected: string | null;
  onSelect: (day: string | null) => void;
  appointments: Appointment[];
  today: string;
}) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => toISODate(new Date(y, m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => { onMonth(toISODate(new Date(y, m + n, 1)).slice(0, 7)); onSelect(null); };
  const byDay = new Map<string, Appointment[]>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
  }

  return (
    <div className="rounded-xl border zego-border-color zego-surface-bg p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อนหน้า" className="rounded-lg p-1.5 zego-hover-surface"><Icon name="chevronLeft" className="h-4 w-4" /></button>
        <p className="text-sm font-semibold zego-text">{formatThaiMonthYear(`${month}-01`)}</p>
        <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป" className="rounded-lg p-1.5 zego-hover-surface"><Icon name="chevronRight" className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w, i) => (
          <p key={w} className={cx('py-1 text-[11px] font-medium', i === 0 ? 'text-rose-600' : 'zego-text-tertiary')}>{w}</p>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const list = byDay.get(d) ?? [];
          const on = selected === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(on ? null : d)}
              aria-pressed={on}
              aria-label={`${Number(d.slice(8))}${list.length ? ` · มีนัด ${list.length} รายการ` : ''}`}
              className={cx('flex flex-col items-center gap-0.5 rounded-lg py-1', on ? 'bg-emerald-600 text-white' : 'zego-hover-surface')}
            >
              <span className={cx(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                !on && d === today && 'ring-1 ring-emerald-600 font-bold zego-text-success',
                !on && d !== today && (list.length ? 'font-semibold zego-text' : i % 7 === 0 ? 'text-rose-600' : 'zego-text-secondary'),
              )}>
                {Number(d.slice(8))}
              </span>
              <span className="flex h-1.5 gap-0.5">
                {list.slice(0, 3).map((a) => (
                  <span key={a.id} className={cx('h-1.5 w-1.5 rounded-full', on ? 'bg-white' : appointmentDotClass(a))} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[10px] zego-text-tertiary">
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />รอคุณยืนยัน</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />รอการเงิน</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />ยืนยันแล้ว</span>
        <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />เข้าพบแล้ว</span>
      </p>
    </div>
  );
}
