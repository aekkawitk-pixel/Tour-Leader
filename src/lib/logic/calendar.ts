/** ตรรกะปฏิทิน — สร้างตารางวันที่และจัดงานลงในแต่ละวัน */

import { parseDate, toISODate } from '@/lib/format';
import type { TourJob } from '@/types';
import { jobDateSpan } from './conflicts';

export interface CalendarCell {
  date: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
}

const TH_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function monthTitle(year: number, month: number): string {
  return `${TH_MONTHS_FULL[month]} ${year + 543}`;
}

/** ตาราง 6 สัปดาห์ (42 ช่อง) เริ่มวันอาทิตย์ */
export function buildMonthGrid(year: number, month: number, today: string): CalendarCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISODate(date);
    cells.push({
      date: iso,
      inMonth: date.getMonth() === month,
      isToday: iso === today,
    });
  }
  return cells;
}

/** 7 วันของสัปดาห์ที่มีวันที่ที่กำหนดอยู่ */
export function buildWeekGrid(anchor: string, today: string): CalendarCell[] {
  const date = parseDate(anchor);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISODate(d);
    return { date: iso, inMonth: true, isToday: iso === today };
  });
}

/** map: วันที่ → รายการงานที่กินวันนั้น */
export function mapJobsByDate(jobs: TourJob[]): Map<string, TourJob[]> {
  const map = new Map<string, TourJob[]>();
  for (const job of jobs) {
    for (const date of jobDateSpan(job)) {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(job);
    }
  }
  return map;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function shiftWeek(anchor: string, delta: number): string {
  const date = parseDate(anchor);
  date.setDate(date.getDate() + delta * 7);
  return toISODate(date);
}
