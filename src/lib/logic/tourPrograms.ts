/**
 * โครงสร้าง "โปรแกรมทัวร์ → พีเรียดเดินทาง" (อ้างอิงรูปแบบรายงานโปรแกรมทัวร์จริง)
 *
 * โปรแกรมหนึ่งมีได้หลายพีเรียด — จัดกลุ่มด้วย programCode · แต่ละ TourJob = 1 พีเรียด
 * ทั้งหมด derive จาก field ของ TourJob เท่านั้น (ไม่มีข้อมูลจากระบบ Ticket Stock / PNR)
 */

import type { TourJob } from '@/types';
import { diffDays } from '@/lib/format';

/* -------------------------------- ระดับโปรแกรม -------------------------------- */

export interface ProgramMeta {
  code: string; // programCode หรือ id (โปรแกรมพีเรียดเดียว)
  name: string; // ชื่อโปรแกรม (ตัดท้าย "N วัน M คืน" ออกแล้ว)
  country: string;
  route: string;
  days: number;
  nights: number;
}

/** รหัสที่ใช้จัดกลุ่มพีเรียด (โปรแกรมเดียวกัน = programCode เดียวกัน) */
export function programKey(job: TourJob): string {
  return job.programCode ?? job.id;
}

/** รหัสพีเรียด (Group/Period Code) — ถ้าไม่ระบุใช้ id ของงาน */
export function periodCodeOf(job: TourJob): string {
  return job.periodCode ?? job.id;
}

/** ชื่อโปรแกรมแบบไม่มีท้าย "N วัน M คืน" (กันซ้ำกับ Duration ที่แสดงแยก) */
export function programDisplayName(title: string): string {
  return title.replace(/\s*\d+\s*วัน\s*\d+\s*คืน\s*$/u, '').trim() || title;
}

export function programMeta(job: TourJob): ProgramMeta {
  const days = diffDays(job.departDate, job.returnDate) + 1;
  return {
    code: programKey(job),
    name: programDisplayName(job.title),
    country: job.country,
    route: job.route,
    days,
    nights: Math.max(0, days - 1),
  };
}

/* -------------------------------- ระดับพีเรียด -------------------------------- */

export interface PeriodSeats {
  total: number | null;
  booked: number | null;
  remaining: number | null;
  /** จำนวนที่จองเกินที่นั่ง (0 = ไม่เกิน) */
  overbook: number;
}

/** ที่นั่ง/ยอดจอง/คงเหลือ + ตรวจยอดจองเกิน (remaining < 0) */
export function periodSeats(job: TourJob): PeriodSeats {
  const total = job.totalSeats ?? null;
  const booked = job.bookedSeats ?? (job.paxCount || null);
  if (total == null || booked == null) return { total, booked, remaining: null, overbook: 0 };
  const remaining = total - booked;
  return { total, booked, remaining, overbook: remaining < 0 ? -remaining : 0 };
}

export type AssignmentStatusKey = 'unassigned' | 'offered' | 'assigned' | 'no_leader';

export interface AssignmentStatus {
  key: AssignmentStatusKey;
  label: string;
  /** เลือกมาจัดหัวหน้าทัวร์ได้หรือไม่ (ยังไม่ระบุ = ได้) */
  assignable: boolean;
}

/** สถานะการจัดหัวหน้าทัวร์ของพีเรียด (derive จาก leaderId + status) */
export function assignmentStatusOf(job: TourJob): AssignmentStatus {
  if (job.leaderNotNeeded) return { key: 'no_leader', label: 'ไม่ต้องใช้หัวหน้าทัวร์', assignable: false };
  if (job.leaderId == null) return { key: 'unassigned', label: 'ยังไม่ระบุ', assignable: true };
  if (job.status === 'offered') return { key: 'offered', label: 'รอคอนเฟิร์ม', assignable: false };
  return { key: 'assigned', label: 'จัดหัวหน้าทัวร์แล้ว', assignable: false };
}

/* -------------------------------- จัดกลุ่ม -------------------------------- */

export interface ProgramGroup {
  meta: ProgramMeta;
  periods: TourJob[]; // เรียงตามวันเดินทาง
}

/**
 * จัดกลุ่มพีเรียดเป็นโปรแกรม — เรียงพีเรียดตามวันเดินทาง และเรียงโปรแกรมตามพีเรียดที่ใกล้สุด
 */
export function groupPeriodsByProgram(periods: TourJob[]): ProgramGroup[] {
  const map = new Map<string, TourJob[]>();
  for (const p of periods) {
    const key = programKey(p);
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map.values()]
    .map((ps) => ({
      meta: programMeta(ps[0]),
      periods: [...ps].sort((a, b) => a.departDate.localeCompare(b.departDate)),
    }))
    .sort((a, b) => a.periods[0].departDate.localeCompare(b.periods[0].departDate));
}

/** พีเรียดมีช่วงเดินทางคาบเกี่ยวกับเดือน [monthStart, monthEnd] หรือไม่ (รวมข้ามเดือน) */
export function periodInMonth(job: TourJob, monthStart: string, monthEnd: string): boolean {
  return job.departDate <= monthEnd && job.returnDate >= monthStart;
}
