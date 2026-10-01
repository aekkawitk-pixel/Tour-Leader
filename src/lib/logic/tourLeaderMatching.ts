/**
 * TourLeaderMatchingService (§5/§6/§14) — ประเมินความเหมาะสม + ความพร้อมของหัวหน้าทัวร์ต่องาน
 * แยกตรรกะออกจาก UI ทั้งหมด · แยก Required / Scoring / Warning ชัดเจน (ไม่ hardcode ใน Component)
 *
 * ประกอบจากเอนจินที่มีอยู่แล้ว:
 *   • Required (บล็อก): active + ไม่ถูกระงับ + ไม่พักงาน/ไม่พร้อม + ไม่มอบหมายย้อนหลัง
 *                        + checkProgramAvailability === 'blocked' (ทับซ้อนตามวัน-เวลาจริง)
 *   • Warning (เลือกได้): checkProgramAvailability === 'warn' + เอกสารใกล้หมดอายุ
 *   • Score: scoreLeaderForJob (ตามน้ำหนักใน Rule Set)
 */

import type {
  Appointment,
  LeaderAvailabilityRecord,
  MatchFactor,
  MatchingRuleSet,
  TourJob,
  TourLeader,
} from '@/types';
import {
  LEADER_STATUS,
  LEADER_USAGE_STATUS,
  READINESS_TERM,
  USAGE_STATUS_TERM,
} from '@/lib/labels';
import { addDays, daysBetween, diffDays } from '@/lib/format';
import { scoreLeaderForJob, type MatchContext } from './matching';
import {
  checkProgramAvailability,
  leaderUnavailability,
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilityOptions,
  type AvailabilityVerdict,
} from './leaderAvailability';
import { UNAVAILABLE_LEADER_STATUSES, backdatedAssignmentError } from './leaderJobs';
import { isBlockingJob } from './conflicts';
import { getActiveRuleSet, ruleSetMaxScore } from './matchingRules';

export interface MatchingContext extends MatchContext {
  appointments: Appointment[];
  records: LeaderAvailabilityRecord[];
  options?: AvailabilityOptions;
  ruleSet?: MatchingRuleSet;
}

/** ผลของกฎหนึ่งข้อ (required-fail หรือ warning) — พร้อมเหตุผล + รายละเอียดช่วงวัน-เวลา (§5) */
export interface RuleOutcome {
  code: string;
  label: string;
  detail?: string;
}

export interface LeaderEvaluation {
  leaderId: string;
  /** ผ่านเงื่อนไขบังคับทั้งหมด → เลือกได้ */
  eligible: boolean;
  failedRequired: RuleOutcome[];
  warnings: RuleOutcome[];
  score: number;
  maxScore: number;
  scorePct: number;
  matchedReasons: string[];
  factors: MatchFactor[];
  availabilityVerdict: AvailabilityVerdict;
}

function warnCodeFor(reason?: string): string {
  if (!reason) return 'WARN_SAME_DAY';
  if (reason.includes('ยังไม่ระบุเวลาเริ่ม')) return 'WARN_NO_START_TIME';
  if (reason.includes('พักไม่เพียงพอ')) return 'WARN_INSUFFICIENT_REST';
  return 'WARN_SAME_DAY';
}

/** ประเมินหัวหน้าทัวร์ 1 คนต่องาน 1 งาน (§5/§6) */
export function evaluateLeaderForJob(
  leader: TourLeader,
  job: TourJob,
  ctx: MatchingContext,
): LeaderEvaluation {
  const failedRequired: RuleOutcome[] = [];
  const warnings: RuleOutcome[] = [];

  /**
   * Required ตามลำดับกฎการนำไปจัดงาน
   *   1) สถานะการใช้งานต้องเป็น “ใช้งาน”  2) ความพร้อมรับงานต้องเป็น “พร้อมรับงาน”
   * (3) งานทับซ้อน และ (4) วันลา/ช่วงไม่พร้อม ตรวจในขั้นถัดไปของไฟล์นี้
   */
  if (leader.usageStatus === 'ended') {
    failedRequired.push({
      code: 'REQ_ACTIVE',
      label: `${USAGE_STATUS_TERM}: ${LEADER_USAGE_STATUS.ended.label}`,
    });
  } else if (leader.usageStatus === 'suspended') {
    // ถูกระงับการใช้งาน — ห้ามเลือกเด็ดขาด (ห้าม override)
    failedRequired.push({
      code: 'REQ_NOT_SUSPENDED',
      label: `${USAGE_STATUS_TERM}: ${LEADER_USAGE_STATUS.suspended.label}`,
    });
  } else if (UNAVAILABLE_LEADER_STATUSES.has(leader.status)) {
    failedRequired.push({
      code: 'REQ_STATUS_AVAILABLE',
      label: `${READINESS_TERM}: ${LEADER_STATUS[leader.status].label}`,
    });
  }

  /* -------------------- Required: มอบหมายย้อนหลัง (§5) -------------------- */
  const backdated = backdatedAssignmentError(job, ctx.today);
  if (backdated) failedRequired.push({ code: 'REQ_NOT_BACKDATED', label: backdated });

  /* -------------------- Required/Warning: วัน–เวลา (§5.4–5.9) -------------------- */
  const windows = leaderUnavailability(leader.id, ctx.allJobs, ctx.appointments, ctx.records, job.id);
  const avail = checkProgramAvailability(job, windows, ctx.options ?? DEFAULT_AVAILABILITY_OPTIONS);
  if (avail.verdict === 'blocked') {
    failedRequired.push({
      code: 'REQ_NO_TIME_CONFLICT',
      label: avail.reason ?? 'มีงานทับซ้อนตามวัน–เวลา',
      detail: avail.detail,
    });
  } else if (avail.verdict === 'warn') {
    warnings.push({ code: warnCodeFor(avail.reason), label: avail.reason ?? 'ควรตรวจสอบ', detail: avail.detail });
  }

  /* ----------------------------- Score (§6) ----------------------------- */
  const match = scoreLeaderForJob(leader, job, ctx);
  if (!match.documentsValid) {
    warnings.push({ code: 'WARN_PASSPORT', label: 'เอกสารเดินทางใกล้หมดอายุ/หมดอายุ ณ วันเดินทาง' });
  }

  const ruleSet = ctx.ruleSet ?? getActiveRuleSet();
  const maxScore = ruleSetMaxScore(ruleSet) || 100;

  return {
    leaderId: leader.id,
    eligible: failedRequired.length === 0,
    failedRequired,
    warnings,
    score: match.score,
    maxScore,
    scorePct: Math.round((match.score / maxScore) * 100),
    matchedReasons: match.reasons,
    factors: match.factors,
    availabilityVerdict: avail.verdict,
  };
}

export interface JobRanking {
  /** ผ่านเงื่อนไขบังคับ เรียงเหมาะสมมาก→น้อย (§6) */
  eligible: LeaderEvaluation[];
  /** ไม่ผ่านเงื่อนไขบังคับ — มีเหตุผลพร้อมช่วงวัน-เวลา (§5) */
  ineligible: LeaderEvaluation[];
}

/**
 * จัดอันดับหัวหน้าทัวร์ต่อ 1 งาน (§6)
 * ลำดับ: ผ่านเงื่อนไข → ไม่มีคำเตือน(ไม่ทับ/พักพอ) → คะแนน(ประเทศ/เส้นทาง/ภาษา) → งานเดือนนั้นน้อยกว่า
 */
export function rankLeadersForJob(
  job: TourJob,
  leaders: TourLeader[],
  ctx: MatchingContext,
): JobRanking {
  const evaluated = leaders.map((l) => evaluateLeaderForJob(l, job, ctx));
  const monthOf = (iso: string) => iso.slice(0, 7);
  const jobMonth = monthOf(job.departDate);
  const monthCount = (leaderId: string) =>
    ctx.allJobs.filter(
      (j) => j.id !== job.id && j.leaderId === leaderId && isBlockingJob(j) && monthOf(j.departDate) === jobMonth,
    ).length;

  const eligible = evaluated
    .filter((e) => e.eligible)
    .sort((a, b) => {
      if (a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
      if (b.score !== a.score) return b.score - a.score;
      return monthCount(a.leaderId) - monthCount(b.leaderId);
    });
  const ineligible = evaluated.filter((e) => !e.eligible);
  return { eligible, ineligible };
}

/* ------------------- ข้อมูลประกอบตารางเปรียบเทียบ (§7) ------------------- */

export interface LeaderScheduleContext {
  /** จำนวนงาน (จองตัว) ในเดือนเดินทางของงานนี้ */
  monthCount: number;
  prevJob: TourJob | null;
  nextJob: TourJob | null;
  /** วันพักก่อนเริ่มงานนี้ (จากงานก่อนหน้า) · null = ไม่มีงานก่อนหน้า */
  restBeforeDays: number | null;
  /** วันพักหลังจบงานนี้ (ก่อนงานถัดไป) · null = ไม่มีงานถัดไป */
  restAfterDays: number | null;
}

export function leaderScheduleContext(
  leaderId: string,
  job: TourJob,
  allJobs: TourJob[],
): LeaderScheduleContext {
  const mine = allJobs.filter(
    (j) => j.id !== job.id && j.leaderId === leaderId && isBlockingJob(j),
  );
  const jobMonth = job.departDate.slice(0, 7);
  const monthCount = mine.filter((j) => j.departDate.slice(0, 7) === jobMonth).length;

  const before = mine
    .filter((j) => j.returnDate < job.departDate)
    .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
  const after = mine
    .filter((j) => j.departDate > job.returnDate)
    .sort((a, b) => a.departDate.localeCompare(b.departDate));
  const prevJob = before[0] ?? null;
  const nextJob = after[0] ?? null;

  return {
    monthCount,
    prevJob,
    nextJob,
    restBeforeDays: prevJob ? diffDays(prevJob.returnDate, job.departDate) : null,
    restAfterDays: nextJob ? diffDays(job.returnDate, nextJob.departDate) : null,
  };
}

/* ---------------- ระดับความเหมาะสม 4 ระดับ (§6) ---------------- */

export type SuitabilityKey = 'excellent' | 'good' | 'check' | 'blocked';

export const SUITABILITY: Record<SuitabilityKey, { label: string; className: string }> = {
  excellent: { label: 'เหมาะสมมาก', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  good: { label: 'เหมาะสม', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  check: { label: 'ควรตรวจสอบ', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  blocked: { label: 'ไม่สามารถจัดได้', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** สรุประดับความเหมาะสมจากผลประเมิน: ไม่ผ่าน→blocked · มีคำเตือน→check · คะแนนสูง→excellent · อื่น→good */
export function suitabilityLevel(e: LeaderEvaluation): SuitabilityKey {
  if (!e.eligible) return 'blocked';
  if (e.warnings.length > 0) return 'check';
  return e.score >= 75 ? 'excellent' : 'good';
}

/* ---------------- ระดับการเลือกได้ 3 ระดับ (§6) ---------------- */

export type AssignabilityKey = 'ok' | 'warn' | 'blocked';

export const ASSIGNABILITY: Record<AssignabilityKey, { label: string; className: string }> = {
  ok: { label: 'เลือกได้', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  warn: { label: 'เลือกได้แต่มีคำเตือน', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  blocked: { label: 'ไม่สามารถเลือกได้', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

/** 3 ระดับ: ไม่ผ่านเงื่อนไข→blocked · ผ่านแต่มีคำเตือน→warn · ผ่านสะอาด→ok */
export function assignabilityLevel(e: LeaderEvaluation): AssignabilityKey {
  if (!e.eligible) return 'blocked';
  return e.warnings.length > 0 ? 'warn' : 'ok';
}

/* ---------------- สรุปวันทำงานต่อเนื่อง + ช่วงพัก (§8/§9) ---------------- */

export interface ScheduleRunSummary {
  /** จำนวนวันทำงานต่อเนื่องยาวที่สุด (รวมงานที่ต่อ/ทับกัน) */
  consecutiveDays: number;
  /** ช่วงพักระหว่างงานที่เรียงต่อกัน (วันว่างระหว่างจบงานก่อนหน้า→เริ่มงานถัดไป) */
  restGaps: { from: string; to: string; days: number }[];
}

/**
 * คำนวณวันทำงานต่อเนื่อง + ช่วงพัก จากชุดงานของหัวหน้าทัวร์ (งานเดิม + ที่กำลังเลือก)
 * งานที่ต่อกัน/ทับกัน (ห่าง ≤ 0 วัน) นับเป็นช่วงเดียว
 */
export function scheduleRunSummary(
  jobs: Pick<TourJob, 'id' | 'departDate' | 'returnDate'>[],
): ScheduleRunSummary {
  const sorted = [...jobs].sort((a, b) => a.departDate.localeCompare(b.departDate));
  let consecutiveDays = 0;
  const restGaps: { from: string; to: string; days: number }[] = [];
  if (sorted.length === 0) return { consecutiveDays, restGaps };

  let runStart = sorted[0].departDate;
  let runEnd = sorted[0].returnDate;
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    // ต่อเนื่องเมื่อเริ่มงานถัดไป ≤ วันถัดจากจบงานก่อนหน้า 1 วัน (ติดกัน/ทับกัน)
    if (cur.departDate <= addDays(runEnd, 1)) {
      if (cur.returnDate > runEnd) runEnd = cur.returnDate;
    } else {
      consecutiveDays = Math.max(consecutiveDays, daysBetween(runStart, runEnd));
      restGaps.push({ from: sorted[i - 1].id, to: cur.id, days: diffDays(sorted[i - 1].returnDate, cur.departDate) - 1 });
      runStart = cur.departDate;
      runEnd = cur.returnDate;
    }
  }
  consecutiveDays = Math.max(consecutiveDays, daysBetween(runStart, runEnd));
  return { consecutiveDays, restGaps };
}
