/** สรุปตัวเลขสำหรับหน้าภาพรวม — logic ล้วน ไม่มี UI */

import type {
  Appointment,
  ExpenseRequest,
  Settlement,
  TourJob,
  TourLeader,
} from '@/types';
import { diffDays, parseDate } from '@/lib/format';
import { findAllConflicts } from './conflicts';
import { summarizeSettlement, totalOutstandingAdvance } from './settlement';

export interface ExpiringDocument {
  leaderId: string;
  leaderName: string;
  documentName: string;
  expiresAt: string;
  daysLeft: number;
  expired: boolean;
}

export interface UrgentTask {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'red' | 'amber' | 'blue';
  severity: number; // เรียงลำดับความเร่งด่วน
}

export interface DashboardStats {
  traveling: number;
  needLeader: number;
  conflicting: number;
  pendingExpenses: number;
  awaitingSettlement: number;
  overdueSettlement: number;
  outstandingAdvanceTHB: number;
  expiringDocs: number;
}

/** เอกสารที่หมดอายุแล้วหรือจะหมดใน 120 วัน */
export function findExpiringDocuments(
  leaders: TourLeader[],
  today: string,
  windowDays = 120,
): ExpiringDocument[] {
  const result: ExpiringDocument[] = [];
  for (const leader of leaders) {
    for (const doc of leader.documents) {
      if (!doc.expiresAt) continue;
      const daysLeft = diffDays(today, doc.expiresAt);
      if (daysLeft <= windowDays) {
        result.push({
          leaderId: leader.id,
          leaderName: `${leader.firstName} ${leader.lastName}`,
          documentName: doc.name,
          expiresAt: doc.expiresAt,
          daysLeft,
          expired: daysLeft < 0,
        });
      }
    }
  }
  return result.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function computeDashboardStats(
  jobs: TourJob[],
  leaders: TourLeader[],
  expenses: ExpenseRequest[],
  settlements: Settlement[],
  today: string,
): DashboardStats {
  const conflicts = findAllConflicts(jobs);
  const conflictJobs = new Set(conflicts.flatMap((c) => [c.jobA, c.jobB]));

  const overdue = settlements.filter((s) => {
    if (s.status === 'settled' || s.status === 'closed') return false;
    return diffDays(s.dueDate, today) > 0;
  });

  return {
    traveling: jobs.filter((j) => j.status === 'traveling').length,
    needLeader: jobs.filter((j) => j.status === 'need_leader' || (!j.leaderId && j.status !== 'draft' && j.status !== 'closed' && j.status !== 'cancelled')).length,
    conflicting: conflictJobs.size,
    pendingExpenses: expenses.filter((e) => e.status === 'submitted').length,
    awaitingSettlement: settlements.filter((s) => s.status !== 'settled' && s.status !== 'closed')
      .length,
    overdueSettlement: overdue.length,
    outstandingAdvanceTHB: totalOutstandingAdvance(settlements),
    expiringDocs: findExpiringDocuments(leaders, today).length,
  };
}

/** งานที่ใกล้เดินทาง (เรียงตามวันเดินทาง) */
export function upcomingJobs(jobs: TourJob[], today: string, limit = 6): TourJob[] {
  return jobs
    .filter((j) => j.status !== 'closed' && j.status !== 'draft' && j.status !== 'cancelled')
    .filter((j) => parseDate(j.returnDate) >= parseDate(today))
    .sort((a, b) => a.departDate.localeCompare(b.departDate))
    .slice(0, limit);
}

/** รายการที่ต้องดำเนินการเร่งด่วน */
export function urgentTasks(
  jobs: TourJob[],
  leaders: TourLeader[],
  expenses: ExpenseRequest[],
  settlements: Settlement[],
  appointments: Appointment[],
  today: string,
): UrgentTask[] {
  const tasks: UrgentTask[] = [];
  const leaderName = (id: string) => {
    const l = leaders.find((x) => x.id === id);
    return l ? `${l.firstName} ${l.lastName}` : id;
  };

  // 1) เคลียร์งานเกินกำหนด
  for (const settlement of settlements) {
    const summary = summarizeSettlement(settlement, today);
    if (summary.overdueDays > 0) {
      tasks.push({
        id: `stl-${settlement.id}`,
        title: `เคลียร์งานเกินกำหนด ${summary.overdueDays} วัน`,
        detail: `${settlement.id} · ${leaderName(settlement.leaderId)} · งาน ${settlement.jobId}`,
        href: '/settlements',
        tone: summary.overdueDays > 14 ? 'red' : 'amber',
        severity: 100 + summary.overdueDays,
      });
    }
  }

  // 2) งานยังไม่มีหัวหน้าทัวร์ และใกล้เดินทาง
  for (const job of jobs) {
    if (job.leaderId || job.status === 'draft' || job.status === 'closed' || job.status === 'cancelled') continue;
    const daysLeft = diffDays(today, job.departDate);
    if (daysLeft < 0) continue;
    tasks.push({
      id: `job-${job.id}`,
      title:
        daysLeft <= 10
          ? `ยังไม่มีหัวหน้าทัวร์ — เดินทางในอีก ${daysLeft} วัน`
          : 'ยังไม่มีหัวหน้าทัวร์',
      detail: `${job.id} · ${job.title}`,
      href: `/jobs/${job.id}`,
      tone: daysLeft <= 10 ? 'red' : 'amber',
      severity: daysLeft <= 10 ? 90 : 40,
    });
  }

  // 3) ตารางซ้อน
  for (const conflict of findAllConflicts(jobs)) {
    tasks.push({
      id: `cf-${conflict.jobA}-${conflict.jobB}`,
      title: `ตารางงานซ้อน ${conflict.overlapDays} วัน`,
      detail: `${leaderName(conflict.leaderId)} · ${conflict.jobA} ซ้อนกับ ${conflict.jobB}`,
      href: `/jobs/${conflict.jobB}`,
      tone: 'red',
      severity: 95,
    });
  }

  // 4) ใบเบิกรออนุมัติ
  const pending = expenses.filter((e) => e.status === 'submitted');
  if (pending.length > 0) {
    tasks.push({
      id: 'exp-pending',
      title: `ใบเบิกรออนุมัติ ${pending.length} รายการ`,
      detail: pending.map((e) => e.id).join(', '),
      href: '/expenses',
      tone: 'blue',
      severity: 50,
    });
  }

  // 5) นัดหมายที่ยังไม่ยืนยัน
  const unconfirmed = appointments.filter(
    (a) => a.status === 'pending' && diffDays(today, a.date) >= 0,
  );
  if (unconfirmed.length > 0) {
    tasks.push({
      id: 'apt-pending',
      title: `นัดหมายรอยืนยัน ${unconfirmed.length} รายการ`,
      detail: unconfirmed.map((a) => `${a.id} (${leaderName(a.leaderId)})`).join(', '),
      href: '/appointments',
      tone: 'amber',
      severity: 45,
    });
  }

  // 6) เอกสารหมดอายุแล้ว
  for (const doc of findExpiringDocuments(leaders, today, 0)) {
    tasks.push({
      id: `doc-${doc.leaderId}-${doc.documentName}`,
      title: `${doc.documentName}หมดอายุแล้ว`,
      detail: `${doc.leaderName} · หมดอายุเมื่อ ${Math.abs(doc.daysLeft)} วันก่อน`,
      href: `/leaders/${doc.leaderId}`,
      tone: 'red',
      severity: 85,
    });
  }

  return tasks.sort((a, b) => b.severity - a.severity);
}
