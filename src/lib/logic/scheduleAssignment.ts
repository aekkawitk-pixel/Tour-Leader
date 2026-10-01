/**
 * ScheduleConflictService + ScheduleAssignmentService + AssignmentAuditService (§9/§10/§16)
 *   • recheckStaged — ตรวจรายการที่รอยืนยันอีกครั้งจากข้อมูลสด + ตรวจการเลือกคนซ้ำในรอบเดียวกัน (§9)
 *   • buildCommit   — validate ทีละรายการ → แยกผ่าน/มีปัญหา → สร้าง Assignment + MatchingResult + Audit
 * Frontend มีหน้าที่แสดงผล/รับตัวเลือก · การตรวจสอบและคำนวณอยู่ที่ Service นี้
 */

import type {
  AssignmentAudit,
  MatchingResult,
  MatchingRuleSet,
  TourJob,
  TourLeader,
  TourScheduleAssignment,
} from '@/types';
import { jobsOverlap } from './conflicts';
import { getActiveRuleSet } from './matchingRules';
import {
  evaluateLeaderForJob,
  type LeaderEvaluation,
  type MatchingContext,
} from './tourLeaderMatching';

/** รายการที่ผู้จัดเลือกไว้ (ยังไม่บันทึก — staged §8/§10) */
export interface StagedAssignment {
  tourJobId: string;
  tourLeaderId: string;
  source: 'manual' | 'recommended' | 'override';
  overrideReason?: string;
  /** รายชื่อที่ระบบแนะนำ ณ ตอนเลือก (บันทึกลง Audit เพื่อวิเคราะห์ภายหลัง) */
  recommendedLeaderIds: string[];
}

export interface RecheckItem {
  staged: StagedAssignment;
  evaluation: LeaderEvaluation | null;
  /** tourJobId อื่นในรอบนี้ที่เลือกคนเดียวกันและช่วงเวลาทับกัน (§9) */
  crossConflicts: string[];
  ok: boolean;
  blockReasons: string[];
}

/** §9 ตรวจ staged ทั้งหมดอีกครั้งจากข้อมูลสด + ตรวจการเลือกคนซ้ำในรอบเดียวกัน */
export function recheckStaged(
  staged: StagedAssignment[],
  jobsById: Map<string, TourJob>,
  leadersById: Map<string, TourLeader>,
  ctx: MatchingContext,
): RecheckItem[] {
  return staged.map((s) => {
    const job = jobsById.get(s.tourJobId);
    const leader = leadersById.get(s.tourLeaderId);
    if (!job || !leader) {
      return { staged: s, evaluation: null, crossConflicts: [], ok: false, blockReasons: ['ไม่พบข้อมูลงานหรือหัวหน้าทัวร์'] };
    }

    const evaluation = evaluateLeaderForJob(leader, job, ctx);
    const blockReasons = evaluation.failedRequired.map((f) => f.detail ? `${f.label} — ${f.detail}` : f.label);

    // §9 เลือกคนเดียวกันในรอบนี้ให้อีกงานที่ช่วงเวลาทับกัน
    const crossConflicts = staged
      .filter((o) => o !== s && o.tourLeaderId === s.tourLeaderId)
      .map((o) => jobsById.get(o.tourJobId))
      .filter((j): j is TourJob => !!j && jobsOverlap(j, job))
      .map((j) => j.id);
    if (crossConflicts.length) {
      blockReasons.push(`เลือกคนเดียวกันซ้อนกับงาน ${crossConflicts.join(', ')} ในรอบนี้`);
    }

    // §12 เลือกทับคำเตือนต้องระบุเหตุผล
    if (evaluation.eligible && evaluation.warnings.length > 0 && !s.overrideReason?.trim()) {
      blockReasons.push('ต้องระบุเหตุผลการเลือก เนื่องจากมีคำเตือน');
    }

    return {
      staged: s,
      evaluation,
      crossConflicts,
      ok: evaluation.eligible && crossConflicts.length === 0 && blockReasons.length === 0,
      blockReasons,
    };
  });
}

export interface CommitPass {
  staged: StagedAssignment;
  assignment: TourScheduleAssignment;
  matchingResult: MatchingResult;
  audit: AssignmentAudit;
}
export interface CommitFail {
  staged: StagedAssignment;
  reasons: string[];
}
export interface CommitResult {
  passed: CommitPass[];
  failed: CommitFail[];
}

/** §10 ตรวจซ้ำ → แยกผ่าน/มีปัญหา → สร้าง Assignment + MatchingResult + Audit (สถานะเริ่มต้น pending=รอคอนเฟิร์ม) */
export function buildCommit(
  staged: StagedAssignment[],
  jobsById: Map<string, TourJob>,
  leadersById: Map<string, TourLeader>,
  ctx: MatchingContext,
  actor: string,
  at: string,
): CommitResult {
  const ruleSet: MatchingRuleSet = ctx.ruleSet ?? getActiveRuleSet();
  const rechecked = recheckStaged(staged, jobsById, leadersById, ctx);
  const passed: CommitPass[] = [];
  const failed: CommitFail[] = [];

  rechecked.forEach((item, i) => {
    if (!item.ok || !item.evaluation) {
      failed.push({ staged: item.staged, reasons: item.blockReasons });
      return;
    }
    const s = item.staged;
    const e = item.evaluation;
    const manualOverride = e.warnings.length > 0;

    const matchingResult: MatchingResult = {
      id: `MR-${s.tourJobId}-${s.tourLeaderId}`,
      tourJobId: s.tourJobId,
      tourLeaderId: s.tourLeaderId,
      ruleSetId: ruleSet.id,
      ruleSetVersion: ruleSet.version,
      totalScore: e.score,
      maximumScore: e.maxScore,
      scorePercentage: e.scorePct,
      matchedReasons: e.matchedReasons,
      warningReasons: e.warnings.map((w) => w.label),
      failedRequiredRules: [],
      calculatedAt: at,
    };

    const assignment: TourScheduleAssignment = {
      id: `TSA-${s.tourJobId}`, // upsert ต่อหนึ่งงาน (หัวหน้าทัวร์หลัก 1 คน)
      tourJobId: s.tourJobId,
      tourLeaderId: s.tourLeaderId,
      assignmentStatus: 'pending', // §10 เริ่มต้น "รอคอนเฟิร์ม"
      assignedSource: s.source,
      matchingResultId: matchingResult.id,
      manualOverride,
      overrideReason: s.overrideReason?.trim() || undefined,
      assignedBy: actor,
      assignedAt: at,
      createdAt: at,
      updatedAt: at,
    };

    const audit: AssignmentAudit = {
      id: `AUD-${at}-${s.tourJobId}-${i}`,
      tourJobId: s.tourJobId,
      tourLeaderId: s.tourLeaderId,
      action: manualOverride ? 'override' : 'assign',
      assignedSource: s.source,
      followedRecommendation: s.recommendedLeaderIds[0] === s.tourLeaderId,
      recommendedLeaderIds: s.recommendedLeaderIds,
      matchingResult,
      overrideReason: s.overrideReason?.trim() || undefined,
      ruleSetId: ruleSet.id,
      ruleSetVersion: ruleSet.version,
      by: actor,
      at,
    };

    passed.push({ staged: s, assignment, matchingResult, audit });
  });

  return { passed, failed };
}
