/**
 * ตรรกะ "จัดงานตามหัวหน้าทัวร์" — แยกจาก UI ทั้งหมด
 *
 * ใช้ข้อมูลชุดเดียวกับหน้ารายละเอียดงาน (leader.status, job.leaderId) — ไม่เก็บข้อมูลมอบหมายซ้ำ
 *   • จัดงานให้คน = assignLeader(jobId, leaderId)   (สถานะเริ่มต้น "เสนอหัวหน้าทัวร์" = รอตอบรับ)
 *   • นำงานออก   = assignLeader(jobId, null)
 */

import type { Appointment, JobStatus, LeaderStatus, TourJob, TourLeader } from '@/types';
import type { StatusMeta } from '@/lib/labels';
import { LEADER_STATUS, LEADER_USAGE_STATUS } from '@/lib/labels';
import { diffDays, formatDate, formatDateRange, parseDate } from '@/lib/format';
import { findConflictsForLeader, isBlockingJob, jobsOverlap } from './conflicts';

/**
 * ความพร้อมรับงานที่ห้ามรับงานใหม่ — “ไม่พร้อมรับงาน” จะไม่แสดงในรายชื่อสำหรับจัดงานใหม่
 * จนกว่าจะเปลี่ยนกลับเป็น “พร้อมรับงาน”
 * (สถานะการใช้งานเป็นอีกมิติ — ตรวจด้วย isUsageBlocked / leaderAssignmentGate)
 */
export const UNAVAILABLE_LEADER_STATUSES: ReadonlySet<LeaderStatus> = new Set(['unavailable']);

/* ------------------- ลำดับการตรวจก่อนนำไปจัดงาน ------------------- */

export type AssignmentGateKey = 'usage' | 'readiness' | 'job_overlap' | 'leave_overlap';

export interface AssignmentGateResult {
  ok: boolean;
  /** กฎข้อแรกที่ไม่ผ่าน (null = ผ่านทุกข้อ) */
  failed: AssignmentGateKey | null;
  reason: string;
}

/**
 * กฎการนำหัวหน้าทัวร์ไปจัดงาน — ตรวจตามลำดับ หยุดที่ข้อแรกที่ไม่ผ่าน
 *   1) สถานะการใช้งานต้องเป็น “ใช้งาน”
 *   2) ความพร้อมรับงานต้องเป็น “พร้อมรับงาน”
 *   3) ไม่มีงานเดิมทับซ้อน
 *   4) ไม่มีรายการลา/ช่วงไม่พร้อมรับงานทับซ้อน
 */
export function leaderAssignmentGate(
  leader: Pick<TourLeader, 'usageStatus' | 'status'>,
  opts: { hasJobOverlap: boolean; hasLeaveOverlap: boolean },
): AssignmentGateResult {
  if (leader.usageStatus !== 'active') {
    return {
      ok: false,
      failed: 'usage',
      reason: `สถานะการใช้งานเป็น “${LEADER_USAGE_STATUS[leader.usageStatus].label}” — จัดงานใหม่ไม่ได้`,
    };
  }
  if (leader.status !== 'available') {
    return {
      ok: false,
      failed: 'readiness',
      reason: `ความพร้อมรับงานเป็น “${LEADER_STATUS[leader.status].label}” — จัดงานใหม่ไม่ได้`,
    };
  }
  if (opts.hasJobOverlap) {
    return { ok: false, failed: 'job_overlap', reason: 'มีงานเดิมทับซ้อนช่วงเวลานี้' };
  }
  if (opts.hasLeaveOverlap) {
    return { ok: false, failed: 'leave_overlap', reason: 'มีรายการลาหรือช่วงไม่พร้อมรับงานทับซ้อน' };
  }
  return { ok: true, failed: null, reason: '' };
}

export type JobTiming = 'current' | 'upcoming' | 'past';

/** งานนี้อยู่ในช่วงไหนเทียบกับวันนี้ (เทียบสตริง ISO ได้ตรง ๆ) */
export function jobTiming(job: TourJob, today: string): JobTiming {
  if (today < job.departDate) return 'upcoming';
  if (today > job.returnDate) return 'past';
  return 'current';
}

/** งานทั้งหมดที่ผูกกับหัวหน้าทัวร์คนนี้ (หัวหน้าทัวร์หลัก) เรียงวันเดินทางใหม่→เก่า */
export function jobsForLeader(jobs: TourJob[], leaderId: string): TourJob[] {
  return jobs
    .filter((j) => j.leaderId === leaderId)
    .sort((a, b) => b.departDate.localeCompare(a.departDate));
}

/** จัดกลุ่มงานของหัวหน้าทัวร์ตามหมวดการตอบรับ (แต่ละหมวดเรียงวันเดินทาง ใกล้→ไกล) */
export function leaderJobsByAcceptance(
  jobs: TourJob[],
  leaderId: string,
): Record<AcceptanceCategory, TourJob[]> {
  const grouped: Record<AcceptanceCategory, TourJob[]> = {
    assigned: [],
    accepted: [],
    rejected: [],
  };
  for (const job of jobs) {
    if (job.leaderId !== leaderId) continue;
    const category = acceptanceCategory(job.status);
    if (category) grouped[category].push(job);
  }
  for (const key of ACCEPTANCE_CATEGORIES) {
    grouped[key].sort((a, b) => a.departDate.localeCompare(b.departDate));
  }
  return grouped;
}

/** สรุปงานของหัวหน้าทัวร์สำหรับการ์ดรายชื่อ (นับตามการตอบรับ + งานถัดไป) */
export interface LeaderProgramSummary {
  total: number;
  counts: Record<AcceptanceCategory, number>;
  /** โปรแกรมถัดไปที่ "ตอบรับแล้ว" และยังไม่เริ่มเดินทาง (ใกล้สุด) */
  nextTrip: TourJob | null;
  /** จำนวนโปรแกรมที่มอบหมายแล้วรอตอบรับ และยังไม่เริ่มเดินทาง */
  pendingCount: number;
}

export function leaderProgramSummary(
  jobs: TourJob[],
  leaderId: string,
  today: string,
): LeaderProgramSummary {
  const grouped = leaderJobsByAcceptance(jobs, leaderId); // แต่ละหมวดเรียงวันเดินทาง ใกล้→ไกล
  const counts = {
    assigned: grouped.assigned.length,
    accepted: grouped.accepted.length,
    rejected: grouped.rejected.length,
  };
  return {
    total: counts.assigned + counts.accepted + counts.rejected,
    counts,
    nextTrip: grouped.accepted.find((j) => j.departDate >= today) ?? null,
    pendingCount: grouped.assigned.filter((j) => j.departDate >= today).length,
  };
}

export interface LeaderJobStats {
  total: number;
  current: number;
  upcoming: number;
  past: number;
}

export function leaderJobStats(jobs: TourJob[], leaderId: string, today: string): LeaderJobStats {
  const mine = jobs.filter((j) => j.leaderId === leaderId);
  const stats: LeaderJobStats = { total: mine.length, current: 0, upcoming: 0, past: 0 };
  for (const job of mine) stats[jobTiming(job, today)] += 1;
  return stats;
}

/** จำนวนโปรแกรมที่มอบหมายให้แต่ละคน (ใช้ในรายการด้านซ้าย) */
export function assignedCountByLeader(jobs: TourJob[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const job of jobs) {
    if (!job.leaderId) continue;
    map.set(job.leaderId, (map.get(job.leaderId) ?? 0) + 1);
  }
  return map;
}

/**
 * หมวดการตอบรับของหัวหน้าทัวร์ (ได้จากสถานะงาน — แหล่งเดียว ไม่เก็บซ้ำ)
 *   assigned  = เสนอแล้ว รอตอบรับ (offered)
 *   accepted  = ตอบรับแล้ว (accepted / traveling / awaiting_settlement / closed)
 *   rejected  = หัวหน้าทัวร์ปฏิเสธ (rejected)
 *   null      = ยังไม่มีหัวหน้าทัวร์ (draft / need_leader)
 */
export type AcceptanceCategory = 'assigned' | 'accepted' | 'rejected';

export const ACCEPTANCE_CATEGORIES: AcceptanceCategory[] = ['assigned', 'accepted', 'rejected'];

export function acceptanceCategory(status: JobStatus): AcceptanceCategory | null {
  switch (status) {
    case 'offered':
      return 'assigned';
    case 'rejected':
      return 'rejected';
    case 'accepted':
    case 'traveling':
    case 'awaiting_settlement':
    case 'closed':
      return 'accepted';
    default:
      return null;
  }
}

/** ป้าย/หัวข้อ Tab/ข้อความว่างของแต่ละหมวดการตอบรับ (คำว่า "ปฏิเสธ" สะกดถูกทั้งระบบ) */
export const ACCEPTANCE_TAB_META: Record<
  AcceptanceCategory,
  { tabLabel: string; badge: StatusMeta; empty: string }
> = {
  assigned: {
    tabLabel: 'โปรแกรมที่มอบหมาย',
    badge: { label: 'รอตอบรับ', tone: 'amber' },
    empty: 'ยังไม่มีโปรแกรมที่รอการตอบรับ',
  },
  accepted: {
    tabLabel: 'โปรแกรมที่ตอบรับ',
    badge: { label: 'ตอบรับแล้ว', tone: 'green' },
    empty: 'ยังไม่มีโปรแกรมที่หัวหน้าทัวร์ตอบรับ',
  },
  rejected: {
    tabLabel: 'โปรแกรมที่ปฏิเสธ',
    badge: { label: 'ปฏิเสธ', tone: 'red' },
    empty: 'ยังไม่มีโปรแกรมที่ถูกปฏิเสธ',
  },
};

/** สถานะการตอบรับของหัวหน้าทัวร์ (Badge) — อ้างอิงหมวดจากสถานะงาน */
export function leaderAcceptance(status: JobStatus): StatusMeta {
  const category = acceptanceCategory(status);
  return category
    ? ACCEPTANCE_TAB_META[category].badge
    : { label: 'ยังไม่ได้เสนอ', tone: 'slate' };
}

/** เหตุผลการปฏิเสธล่าสุด (อ่านจากประวัติสถานะ — ไม่เก็บฟิลด์ซ้ำ) */
export function rejectionReasonOf(job: TourJob): string | null {
  const event = [...job.history].reverse().find((e) => e.to === 'rejected');
  return event?.note?.trim() || null;
}

/** ข้อความกำกับช่วงเดินทางในการ์ด: "กำลังเดินทาง" / "อีก N วัน" / "สิ้นสุดแล้ว" */
export function travelStatusLabel(job: TourJob, today: string): string {
  const timing = jobTiming(job, today);
  if (timing === 'current') return 'กำลังเดินทาง';
  if (timing === 'past') return 'สิ้นสุดแล้ว';
  const days = diffDays(today, job.departDate);
  if (days === 0) return 'เดินทางวันนี้';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}

/** งานที่ยังไม่มีหัวหน้าทัวร์ (ตัวเลือกใน Drawer เพิ่มโปรแกรม) — ใกล้→ไกล */
export function unassignedJobs(jobs: TourJob[]): TourJob[] {
  return jobs
    .filter((j) => j.leaderId === null && j.status !== 'closed' && j.status !== 'cancelled')
    .sort((a, b) => a.departDate.localeCompare(b.departDate));
}

/* -------------------------- ห้ามมอบหมายย้อนหลัง -------------------------- */

export const BACKDATED_ASSIGN_MESSAGE =
  'ไม่สามารถมอบหมายหัวหน้าทัวร์ย้อนหลังได้ เนื่องจากโปรแกรมนี้เริ่มเดินทางแล้ว';

/**
 * โปรแกรม "เริ่มเดินทางไปแล้ว" หรือไม่ (เทียบวันเดินทางเริ่มต้นกับวันปัจจุบันของระบบ)
 *   • วันเดินทางเริ่มต้น < วันนี้ → เริ่มไปแล้ว (มอบหมายย้อนหลังไม่ได้)
 *   • วันเดินทางเริ่มต้น = วันนี้ → ยังมอบหมายได้ (ตลอดวันปัจจุบัน)
 *
 * หมายเหตุ §5: ระบบ Demo ตรึงวันที่ปัจจุบันไว้ (ไม่มีนาฬิกาภายในวัน) จึงอนุญาต
 * โปรแกรมที่ออกเดินทาง "วันนี้" ได้ตลอดวัน — ในระบบจริงควรเทียบวัน–เวลานัดหมาย
 * (meetingDateTime) กับเวลาปัจจุบันตาม Timezone Asia/Bangkok
 */
export function departureStarted(job: Pick<TourJob, 'departDate'>, today: string): boolean {
  return job.departDate < today;
}

/** เหตุผลที่มอบหมายย้อนหลังไม่ได้ (null = มอบหมายได้) — ใช้ตรวจซ้ำก่อนบันทึก */
export function backdatedAssignmentError(
  job: Pick<TourJob, 'departDate'>,
  today: string,
): string | null {
  return departureStarted(job, today) ? BACKDATED_ASSIGN_MESSAGE : null;
}

/**
 * งานที่ยังไม่มีหัวหน้าทัวร์ และ "ยังมอบหมายได้" (ออกเดินทางวันนี้หรืออนาคต)
 * ตัดงานที่เริ่มเดินทางไปแล้ว/เดินทางเสร็จ/ปิดงาน ออกจากรายการที่เลือกได้
 */
export function assignableJobsFrom(jobs: TourJob[], today: string): TourJob[] {
  return unassignedJobs(jobs).filter((j) => !departureStarted(j, today));
}

/* ------------------------------ ตรวจก่อนเพิ่ม ----------------------------- */

export type AddVerdict = 'ok' | 'warn' | 'blocked';

export interface AddCheck {
  verdict: AddVerdict;
  message?: string;
}

/** จำนวนวันห่างระหว่างสองงานที่ "ไม่ทับกัน" (0 = ติดกัน/ทับ) */
function gapDays(a: TourJob, b: TourJob): number {
  if (jobsOverlap(a, b)) return 0;
  const aEnd = parseDate(a.returnDate);
  const bStart = parseDate(b.departDate);
  if (aEnd < bStart) return diffDays(a.returnDate, b.departDate);
  return diffDays(b.returnDate, a.departDate);
}

/**
 * ตรวจว่ามอบหมายงาน `candidate` ให้หัวหน้าทัวร์ได้หรือไม่ (เทียบกับงานเดิม + นัดหมาย)
 *   • ทับกับงานเดิม  → blocked (ปิด Checkbox)
 *   • นัดหมายตรงช่วงเดินทาง หรือ ห่างงานเดิม ≤ 2 วัน → warn (เลือกได้ แต่เตือน)
 *   • ว่าง → ok
 * หมายเหตุ: การทับกับ "งานที่เลือกด้วยกันเอง" ให้ตรวจเพิ่มในชั้น UI (ขึ้นกับ selection)
 */
export function checkCandidateForLeader(
  candidate: TourJob,
  leaderId: string,
  jobs: TourJob[],
  appointments: Appointment[],
): AddCheck {
  const conflicts = findConflictsForLeader(leaderId, candidate, jobs);
  if (conflicts.length > 0) {
    const c = conflicts[0];
    return {
      verdict: 'blocked',
      message: `ทับกับ ${c.id} วันที่ ${formatDateRange(c.departDate, c.returnDate)}`,
    };
  }

  const clashAppt = appointments.find(
    (a) =>
      a.leaderId === leaderId &&
      a.status !== 'cancelled' &&
      a.date >= candidate.departDate &&
      a.date <= candidate.returnDate,
  );
  if (clashAppt) {
    return { verdict: 'warn', message: `มีนัดหมาย ${formatDate(clashAppt.date)} ในช่วงเดินทาง` };
  }

  const near = jobs
    .filter(
      (j) =>
        j.id !== candidate.id &&
        j.leaderId === leaderId &&
        isBlockingJob(j) &&
        !jobsOverlap(candidate, j),
    )
    .map((j) => ({ j, gap: gapDays(candidate, j) }))
    .filter(({ gap }) => gap <= 2)
    .sort((a, b) => a.gap - b.gap)[0];

  if (near) {
    return { verdict: 'warn', message: `ใกล้กับงาน ${near.j.id} (ห่าง ${near.gap} วัน)` };
  }

  return { verdict: 'ok' };
}
