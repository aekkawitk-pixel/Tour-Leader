/**
 * ชนิดใบ / ผู้ทำรายการ / อ้างอิงกรุ๊ป — ใช้ร่วมกันในหน้า "ตรวจสอบรายการจ่าย" (/expenses) และ "จ่ายเงิน" (/payments)
 */

import { formatDate, formatDateRange, formatThaiMonthYear } from '@/lib/format';
import { MONEY_CATEGORY, type StatusMeta } from '@/lib/labels';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { isHolidayFeeLine, SEND_OFF_FEE_TYPE } from '@/lib/logic/staffPortal';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import type { ExpenseRequest, TourJob, TourLeader } from '@/types';

/** ผู้ทำรายการ — หัวหน้าทัวร์ / เจ้าหน้าที่ส่งกรุ๊ป / พนักงานที่สร้างใบในระบบ */
export type RequesterRole = 'leader' | 'sendoff' | 'staff';
export const REQUESTER_ROLE: Record<RequesterRole, StatusMeta> = {
  leader: { label: 'หัวหน้าทัวร์', tone: 'teal' },
  sendoff: { label: 'เจ้าหน้าที่ส่งกรุ๊ป', tone: 'orange' },
  staff: { label: 'พนักงาน', tone: 'slate' },
};

export function requesterRoleOf(expense: ExpenseRequest, leaders: Pick<TourLeader, 'id'>[]): RequesterRole {
  if (expense.requesterKind === 'sendoff') return 'sendoff';
  return leaders.some((l) => l.id === expense.requesterId) ? 'leader' : 'staff';
}

/** ชื่อผู้ทำรายการ — หัวหน้าทัวร์ = ชื่อ นามสกุล (ชื่อเล่น) · คนอื่นใช้ชื่อที่บันทึกไว้ */
export function requesterLabel(expense: ExpenseRequest, leaders: TourLeader[]): string {
  const leader = leaders.find((l) => l.id === expense.requesterId);
  return leader ? leaderDisplayName(leader) : expense.requesterName;
}

/** ประเภทของใบ — ใบเจ้าหน้าที่ส่งกรุ๊ปแยกเป็น "ค่าส่งกรุ๊ป" (ไม่ปนกับค่าใช้จ่ายจริงของหัวหน้าทัวร์) */
export function expenseTypeOf(expense: ExpenseRequest): StatusMeta {
  if (expense.claimMonth) return { label: 'ค่าส่งกรุ๊ป (รายเดือน)', tone: 'orange' };
  if (expense.requesterKind === 'sendoff') return { label: 'ค่าส่งกรุ๊ป', tone: 'orange' };
  // ใบเบิกของหัวหน้าทัวร์ที่ไม่ใช่ใบเสร็จ — แยกเอกสารต่อกรุ๊ป (ดู leaderClaims.ts)
  if (expense.claimKind === 'per_diem') return { label: 'เบี้ยเลี้ยง', tone: 'indigo' };
  if (expense.claimKind === 'tip') return { label: 'ค่าทิป', tone: 'sky' };
  return MONEY_CATEGORY[expense.category];
}

/** ชนิดใบตามแท็บ — เบี้ยเลี้ยง / ค่าใช้จ่ายจริง / ค่าส่งกรุ๊ป / อื่น ๆ */
export type ExpenseKind = 'per_diem' | 'actual' | 'sendoff' | 'other';
export function expenseKindOf(expense: ExpenseRequest): ExpenseKind {
  if (expense.claimMonth || expense.requesterKind === 'sendoff') return 'sendoff';
  if (expense.claimKind === 'per_diem') return 'per_diem';
  if (expense.category === 'actual') return 'actual';
  return 'other';
}
export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = {
  per_diem: 'เบี้ยเลี้ยง',
  actual: 'ค่าใช้จ่ายจริง',
  sendoff: 'ค่าส่งกรุ๊ป',
  other: 'อื่น ๆ',
};

export interface ExpenseRef {
  title: string;
  codes: string[];
  programName: string;
  dates: string;
}

/**
 * อ้างอิงกรุ๊ปของใบ
 * - ใบค่าส่งกรุ๊ปรายเดือน: งวดเดือน + จำนวนกรุ๊ป · รหัสกรุ๊ปทุกกรุ๊ปในใบ (กรุ๊ปอยู่ที่บรรทัด)
 * - ใบของกรุ๊ปเดียว: งานเดิม (JOB-…) ก่อน ไม่พบ = กรุ๊ปจาก Tour Period Master · หาไม่เจอเลย = jobId ดิบ
 */
export function expenseRef(expense: ExpenseRequest, jobs: TourJob[]): ExpenseRef {
  if (expense.claimMonth) {
    const codes = [...new Set(expense.lines.map((l) => l.periodId).filter((id): id is string => Boolean(id)))]
      .map((id) => periodCodeOf(id));
    return { title: `${formatThaiMonthYear(`${expense.claimMonth}-01`)} · ${codes.length} กรุ๊ป`, codes, programName: '', dates: '' };
  }
  const job = jobs.find((j) => j.id === expense.jobId);
  if (job) {
    const code = job.periodCode ?? job.id;
    return { title: code, codes: [code], programName: job.title, dates: formatDateRange(job.departDate, job.returnDate) };
  }
  const period = getTourPeriodById(expense.jobId);
  return period
    ? { title: period.groupCode, codes: [period.groupCode], programName: period.displayName, dates: formatDateRange(period.startDate, period.endDate) }
    : { title: periodCodeOf(expense.jobId), codes: [periodCodeOf(expense.jobId)], programName: '', dates: '' };
}

/** ช่อง "รายการทัวร์" ในตาราง — แสดงครบ ไม่ตัดข้อความ */
export function ExpenseRefCell({ expense, r }: { expense: ExpenseRequest; r: ExpenseRef }) {
  if (expense.claimMonth) {
    /*
      เจ้าหน้าที่ 1 คนส่งได้ 20+ กรุ๊ป/เดือน — ไล่รหัสกรุ๊ปในตารางอ่านไม่ได้และดันแถวสูง
      จึงสรุปเป็น ช่วงวันไปส่ง + จำนวนอัตราปกติ/วันหยุด (สิ่งที่บัญชีใช้ตรวจยอด) · รายชื่อกรุ๊ปครบอยู่ในหน้ารายละเอียด
      รหัสกรุ๊ปยังค้นหาได้ และชี้ค้างดูได้ (title)
    */
    const fees = expense.lines.filter((l) => l.expenseType === SEND_OFF_FEE_TYPE && l.periodId);
    const dates = fees.map((l) => l.receiptDate).filter((d): d is string => Boolean(d)).sort();
    const holiday = fees.filter(isHolidayFeeLine).length;
    return (
      <div className="min-w-0" title={r.codes.join(', ')}>
        <p className="zego-text font-medium">{r.title}</p>
        <p className="zego-text-tertiary text-xs">
          {dates.length > 0 && `ไปส่ง ${formatDate(dates[0])}${dates.length > 1 ? `–${formatDate(dates.at(-1))}` : ''} · `}
          ปกติ {fees.length - holiday}{holiday > 0 && <span className="zego-text-warning"> · วันหยุด {holiday}</span>}
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-[14rem] max-w-[22rem]">
      <p className="zego-text whitespace-nowrap font-medium">{r.title}</p>
      {r.programName && <p className="zego-text-tertiary text-xs">{r.programName}</p>}
      {r.dates && <p className="zego-text-tertiary whitespace-nowrap text-xs tabular-nums">{r.dates}</p>}
    </div>
  );
}
