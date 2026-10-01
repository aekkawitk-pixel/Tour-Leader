/**
 * คำนวณประสบการณ์การทำงานจากประวัติสถานประกอบการ — ฟังก์ชันบริสุทธิ์ ไม่มี UI
 *
 * กติกา:
 *  • งานปัจจุบัน (isCurrentJob) นับถึงเดือนปัจจุบัน
 *  • ช่วงเวลาที่ซ้อนกัน **ไม่นับเดือนซ้ำ** (รวมช่วงก่อนแล้วค่อยนับ)
 *  • เรียงจากงานปัจจุบัน → งานล่าสุด → งานในอดีต
 */

import type { EmploymentHistory, ExperienceSummary } from '@/types';

/** แปลงเดือน/ปี เป็นเลขลำดับเดือน (นับจากปี 0) เพื่อเทียบและรวมช่วงได้ง่าย */
export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export interface MonthRange {
  start: number;
  end: number; // inclusive
}

/** ช่วงเวลาของประวัติหนึ่งรายการ (คืน null ถ้าข้อมูลไม่พอ) */
export function rangeOf(entry: EmploymentHistory, today: string): MonthRange | null {
  if (!entry.startYear || !entry.startMonth) return null;
  const start = toMonthIndex(entry.startYear, entry.startMonth);

  const [ty, tm] = today.split('-').map(Number);
  const nowIndex = toMonthIndex(ty, tm);

  const end = entry.isCurrentJob
    ? nowIndex
    : entry.endYear && entry.endMonth
      ? toMonthIndex(entry.endYear, entry.endMonth)
      : null;

  if (end === null) return null;
  if (end < start) return null;
  return { start, end };
}

/** รวมช่วงที่ซ้อนหรือชนกันให้เป็นช่วงเดียว */
export function mergeRanges(ranges: MonthRange[]): MonthRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MonthRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    // ซ้อนกัน หรือชนกันพอดี (last.end + 1 === current.start) → รวมเป็นช่วงเดียว
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** มีช่วงเวลาที่ทับซ้อนกันจริงหรือไม่ (ใช้เตือน) */
export function hasOverlappingRanges(ranges: MonthRange[]): boolean {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start <= sorted[i - 1].end) return true;
  }
  return false;
}

/**
 * เรียงตามลำดับที่ผู้ใช้จัดไว้ (sortOrder) — ไม่แตะข้อมูล
 * รายการที่ยังไม่มี sortOrder ใช้ลำดับใน array เดิม (stable)
 * ⚠️ ใช้เป็นลำดับแสดงผลหลัก — ห้ามให้การเรียงตามวันที่มาทับ เว้นแต่ผู้ใช้สั่งเอง
 */
export function sortByDisplayOrder(list: EmploymentHistory[]): EmploymentHistory[] {
  return list
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.sortOrder ?? a.index) - (b.entry.sortOrder ?? b.index))
    .map((x) => x.entry);
}

/** เรียง: งานปัจจุบันก่อน → จากนั้นเรียงตามวันเริ่มล่าสุดไปเก่าสุด (ใช้เมื่อผู้ใช้กด "เรียงจากล่าสุด") */
export function sortEmploymentHistory(list: EmploymentHistory[]): EmploymentHistory[] {
  return [...list].sort((a, b) => {
    if (a.isCurrentJob !== b.isCurrentJob) return a.isCurrentJob ? -1 : 1;
    const aStart = toMonthIndex(a.startYear || 0, a.startMonth || 1);
    const bStart = toMonthIndex(b.startYear || 0, b.startMonth || 1);
    return bStart - aStart;
  });
}

export function formatDuration(totalMonths: number): string {
  if (totalMonths <= 0) return 'ยังไม่มีประสบการณ์';
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} เดือน`;
  if (months === 0) return `${years} ปี`;
  return `${years} ปี ${months} เดือน`;
}

/** ระยะเวลาของงานหนึ่งรายการ (ใช้แสดงในตาราง) */
export function entryDurationLabel(entry: EmploymentHistory, today: string): string {
  const range = rangeOf(entry, today);
  if (!range) return '—';
  return formatDuration(range.end - range.start + 1);
}

/** สรุปประสบการณ์รวม */
export function summarizeExperience(
  list: EmploymentHistory[],
  today: string,
): ExperienceSummary {
  const sorted = sortEmploymentHistory(list);
  const ranges = list
    .map((entry) => rangeOf(entry, today))
    .filter((r): r is MonthRange => r !== null);

  const merged = mergeRanges(ranges);
  const totalMonths = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);

  const currentJobs = sorted.filter((e) => e.isCurrentJob);

  return {
    totalMonths,
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    label: formatDuration(totalMonths),
    employerCount: list.length,
    currentJobs,
    latestPosition: sorted[0]?.position ?? '—',
    hasOverlap: hasOverlappingRanges(ranges),
  };
}

/* -------------------------------- ตัวช่วยแสดงผล ------------------------------- */

export const MONTH_NAMES_TH = [
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

export const MONTH_NAMES_TH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** "มี.ค. 2565" */
export function formatMonthYear(month?: number, year?: number): string {
  if (!month || !year) return '—';
  return `${MONTH_NAMES_TH_SHORT[month - 1]} ${year + 543}`;
}

/** ช่วงเวลาของงาน: "มี.ค. 2565 – ปัจจุบัน" */
export function formatEmploymentPeriod(entry: EmploymentHistory): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.isCurrentJob ? 'ปัจจุบัน' : formatMonthYear(entry.endMonth, entry.endYear);
  return `${start} – ${end}`;
}
