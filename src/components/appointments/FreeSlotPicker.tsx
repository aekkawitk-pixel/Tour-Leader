'use client';

/**
 * เลือกวันเวลานัดจากช่องที่ฝ่ายบัญชีว่างเท่านั้น — ใช้ร่วมกันทุกจุดที่ขอนัด/เลื่อนนัด
 *   หัวหน้าทัวร์ขอนัดเคลียร์เงิน · หัวหน้าทัวร์เลื่อนนัด · เจ้าหน้าที่เลื่อนนัด
 * วัน = วันทำงาน (ไม่ใช่เสาร์-อาทิตย์/วันหยุดในเมนูวันหยุด) ตั้งแต่พรุ่งนี้ ที่ยังมีช่องว่าง
 * เวลา = แสดงครบทุกช่องของวัน (ญี่ปุ่นช่องละ 30 นาที · ประเทศอื่นช่องละ 10 นาที — คิวคนละคิว เจ้าหน้าที่คนละคน) · ช่องที่ชนนัดอื่นขึ้น "มีคิวนัดแล้ว" เลือกไม่ได้ (นัดที่กำลังเลื่อนไม่นับ — ช่องเดิมของมันเลือกซ้ำได้)
 *
 * useBookableDays คำนวณรายการวัน · FreeSlotPicker แสดงให้เลือก (ผู้เรียกถือค่า date/time เอง)
 */

import { useMemo } from 'react';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT, toISODate } from '@/lib/format';
import { bookableDays, DAY_PERIODS, daySlots, periodOf, slotStep, type ClearLane } from '@/lib/logic/appointmentSlots';
import { sameLane } from '@/lib/logic/appointmentLane';
import { capacityOf } from '@/services/clearCapacityStore';
import { useClearCapacity } from './useClearCapacity';
import { dayTypeOf, getHolidayMap } from '@/services/holidayService';
import { Callout, cx } from '@/components/ui/Primitives';
import type { Appointment } from '@/types';

/** จำนวนวันทำการที่ให้เลือก (นับเฉพาะวันที่ยังมีช่องว่าง) */
const DAYS_AHEAD = 10;

/** left = ช่องนี้รับได้อีกกี่กรุ๊ป · capacity = จำนวนเจ้าหน้าที่ของคิวในวันนั้น */
export type BookableDay = { date: string; free: string[]; left?: Record<string, number>; capacity?: number };

/** lane = คิวของนัดนี้ (ญี่ปุ่น / ประเทศอื่น) — นับชนเฉพาะนัดในคิวเดียวกัน · ไม่ส่ง = นับทุกนัด */
export function useBookableDays(appointments: Appointment[], duration: number, excludeId?: string, lane?: ClearLane, after?: string): BookableDay[] {
  // เริ่มวันถัดจาก after (เช่น วันกลับของกรุ๊ปที่ยังเดินทางอยู่) ถ้าช้ากว่าวันนี้ — ไม่งั้นเริ่มพรุ่งนี้
  // จำนวนเจ้าหน้าที่ต่อคิว (ตั้งค่า) — ช่องเต็มเมื่อนัดครบจำนวนคน
  const { settings } = useClearCapacity();
  const now = toISODate(new Date());
  const today = after && after > now ? after : now;
  return useMemo(() => {
    const year = Number(today.slice(0, 4));
    const holidays = getHolidayMap([year, year + 1]);
    const pool = lane ? sameLane(appointments, lane) : appointments;
    return bookableDays(pool, today, DAYS_AHEAD, duration, (iso) => dayTypeOf(iso, holidays) === 'workday', excludeId,
      lane ? (iso) => capacityOf(settings, iso, lane) : undefined);
  }, [appointments, today, duration, excludeId, lane, settings]);
}

/** ค่าที่เลือกยังว่างอยู่จริงหรือไม่ (ช่องอาจถูกจองไประหว่างกรอก) */
export function isFreeChoice(days: BookableDay[], date: string, time: string): boolean {
  return !!days.find((d) => d.date === date)?.free.includes(time);
}

export function FreeSlotPicker({ days, date, time, duration, onChange }: {
  days: BookableDay[];
  date: string;
  time: string;
  duration: number;
  onChange: (date: string, time: string) => void;
}) {
  if (days.length === 0) {
    return <Callout tone="amber" title="ฝ่ายบัญชีไม่มีช่องว่างในช่วงนี้">ติดต่อฝ่ายบัญชีโดยตรงเพื่อนัดเวลา</Callout>;
  }
  const day = days.find((d) => d.date === date);
  const free = day?.free ?? [];
  // หลายคนต่อคิว — บอกว่าช่องนี้รับได้อีกกี่กรุ๊ป
  const multi = (day?.capacity ?? 1) > 1;
  return (
    <>
      <div>
        <p className="mb-1.5 text-sm font-medium zego-text">วันที่ <span className="text-xs font-normal zego-text-tertiary">· เฉพาะวันที่บัญชีว่าง</span></p>
        {/* ตัดบรรทัดแทนเลื่อนข้าง — เห็นทุกวันที่เลือกได้ในครั้งเดียว */}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="วันที่">
          {days.map((d) => {
            const on = d.date === date;
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(d.date, d.free.includes(time) ? time : d.free[0])}
                className={cx('flex w-16 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5 text-center transition', on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'zego-border-color zego-hover-surface')}
              >
                <span className="text-[11px] zego-text-tertiary">{TH_WEEKDAYS_SHORT[parseDate(d.date).getDay()]}</span>
                <span className="text-base font-bold leading-tight">{parseDate(d.date).getDate()}</span>
                <span className="text-[10px] zego-text-tertiary">ว่าง {d.free.length}</span>
              </button>
            );
          })}
        </div>
      </div>
      {date && (
        <div>
          <p className="mb-1.5 text-sm font-medium zego-text">เวลา <span className="text-xs font-normal zego-text-tertiary">· {formatDate(date)} · ครั้งละ {duration} นาที</span></p>
          {/* แยกช่วงเช้า / บ่าย (สีเดียวกับปฏิทินนัดหมาย) — แสดงครบทุกช่อง ช่องที่มีนัดแล้วเลือกไม่ได้ และบอก "มีคิวนัดแล้ว" */}
          <div className="space-y-3" role="radiogroup" aria-label="เวลา">
          {DAY_PERIODS.map((period) => {
            const slots = daySlots(slotStep(duration)).filter((t) => periodOf(t) === period.key);
            if (slots.length === 0) return null;
            const freeCount = slots.filter((t) => free.includes(t)).length;
            return (
          <div key={period.key}>
            <p className="mb-1 flex items-baseline gap-2">
              <span className={cx('text-sm font-bold', period.key === 'morning' ? 'text-emerald-800' : 'text-[#6b4423]')}>ช่วง{period.label}</span>
              <span className="text-xs zego-text-tertiary">{period.range} น. · ว่าง {freeCount}/{slots.length}</span>
            </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {slots.map((t) => {
              const busy = !free.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={t === time}
                  disabled={busy}
                  title={busy ? 'มีคิวนัดแล้ว' : undefined}
                  onClick={() => onChange(date, t)}
                  className={cx(
                    'flex flex-col items-center justify-center rounded-lg border py-1.5 text-sm tabular-nums leading-tight transition',
                    busy
                      ? 'cursor-not-allowed border-dashed zego-border-color zego-surface-soft-bg zego-text-disabled'
                      : t === time ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-800' : 'zego-border-color zego-hover-surface',
                  )}
                >
                  <span className={busy ? 'line-through' : undefined}>{t}</span>
                  {busy && <span className="text-[10px] font-medium text-amber-700">มีคิวนัดแล้ว</span>}
                  {!busy && multi && <span className="text-[10px] zego-text-tertiary">ว่าง {day?.left?.[t] ?? day?.capacity}</span>}
                </button>
              );
            })}
          </div>
          </div>
            );
          })}
          </div>
        </div>
      )}
    </>
  );
}
