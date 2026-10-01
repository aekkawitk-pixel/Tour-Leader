/** ตรรกะสร้างรายงาน — คำนวณจากข้อมูลจำลอง แยกออกจาก UI */

import type {
  ExpenseRequest,
  Settlement,
  TourJob,
  TourLeader,
} from '@/types';
import { diffDays, parseDate } from '@/lib/format';
import { summarizeSettlement } from './settlement';
import { findExpiringDocuments } from './dashboard';

export interface DateRange {
  from: string;
  to: string;
}

export const RANGE_PRESETS = [
  { key: 'q2', label: 'ไตรมาส 2/2569 (เม.ย.–มิ.ย.)', from: '2026-04-01', to: '2026-06-30' },
  { key: 'q3', label: 'ไตรมาส 3/2569 (ก.ค.–ก.ย.)', from: '2026-07-01', to: '2026-09-30' },
  { key: 'h1', label: 'ครึ่งปีแรก 2569', from: '2026-01-01', to: '2026-06-30' },
  { key: 'year', label: 'ทั้งปี 2569', from: '2026-01-01', to: '2026-12-31' },
] as const;

export function inRange(date: string, range: DateRange): boolean {
  const d = parseDate(date);
  return d >= parseDate(range.from) && d <= parseDate(range.to);
}

/** จำนวนงานและวันทำงานต่อหัวหน้าทัวร์ */
export function jobsPerLeader(leaders: TourLeader[], jobs: TourJob[], range: DateRange) {
  return leaders
    .map((leader) => {
      const own = jobs.filter(
        (j) =>
          (j.leaderId === leader.id || j.assistantLeaderIds.includes(leader.id)) &&
          inRange(j.departDate, range),
      );
      return {
        leaderId: leader.id,
        name: `${leader.firstName} ${leader.lastName}`,
        jobCount: own.length,
        dayCount: own.reduce((sum, j) => sum + diffDays(j.departDate, j.returnDate) + 1, 0),
        feeTHB: own.reduce((sum, j) => sum + j.leaderFee, 0),
        rating: leader.rating,
      };
    })
    .sort((a, b) => b.jobCount - a.jobCount);
}

/** ค่าใช้จ่ายแยกตามงาน */
export function expensesPerJob(jobs: TourJob[], expenses: ExpenseRequest[], range: DateRange) {
  return jobs
    .filter((job) => inRange(job.departDate, range))
    .map((job) => {
      const own = expenses.filter((e) => e.jobId === job.id);
      const paid = own
        .filter((e) => e.status === 'paid')
        .reduce((sum, e) => sum + e.totalTHB, 0);
      return {
        jobId: job.id,
        title: job.title,
        country: job.country,
        budgetTHB: job.budget,
        paidTHB: paid,
        pendingTHB: own
          .filter((e) => e.status !== 'paid' && e.status !== 'rejected')
          .reduce((sum, e) => sum + e.totalTHB, 0),
        overBudget: paid > job.budget,
      };
    })
    .sort((a, b) => b.paidTHB - a.paidTHB);
}

/** เงินทดรองค้างเคลียร์ + งานเคลียร์ล่าช้า */
export function outstandingSettlements(
  settlements: Settlement[],
  leaders: TourLeader[],
  jobs: TourJob[],
  today: string,
) {
  return settlements
    .filter((s) => s.status !== 'settled' && s.status !== 'closed')
    .map((settlement) => {
      const summary = summarizeSettlement(settlement, today);
      const leader = leaders.find((l) => l.id === settlement.leaderId);
      const job = jobs.find((j) => j.id === settlement.jobId);
      return {
        id: settlement.id,
        jobId: settlement.jobId,
        jobTitle: job?.title ?? '—',
        leaderName: leader ? `${leader.firstName} ${leader.lastName}` : settlement.leaderId,
        advanceTHB: settlement.advanceTHB,
        approvedTHB: summary.approvedTHB,
        netTHB: summary.netTHB,
        overdueDays: summary.overdueDays,
        dueDate: settlement.dueDate,
        status: settlement.status,
      };
    })
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

/** ค่าใช้จ่ายที่ถูกตัดออก (ไม่อนุมัติ / อนุมัติบางส่วน) */
export function cutExpenses(settlements: Settlement[], leaders: TourLeader[]) {
  const rows: {
    settlementId: string;
    leaderName: string;
    expenseType: string;
    purpose: string;
    claimedTHB: number;
    approvedTHB: number;
    cutTHB: number;
    reason: string;
  }[] = [];

  for (const settlement of settlements) {
    const leader = leaders.find((l) => l.id === settlement.leaderId);
    for (const item of settlement.items) {
      const cut = item.claimedTHB - item.approvedTHB;
      if (item.decision === 'pending' || cut <= 0) continue;
      rows.push({
        settlementId: settlement.id,
        leaderName: leader ? `${leader.firstName} ${leader.lastName}` : settlement.leaderId,
        expenseType: item.expenseType,
        purpose: item.purpose,
        claimedTHB: item.claimedTHB,
        approvedTHB: item.approvedTHB,
        cutTHB: cut,
        reason: item.reason || '—',
      });
    }
  }
  return rows.sort((a, b) => b.cutTHB - a.cutTHB);
}

/** ค่าตอบแทนรายเดือน */
export function monthlyFees(jobs: TourJob[], range: DateRange) {
  const map = new Map<string, number>();
  for (const job of jobs) {
    if (!inRange(job.returnDate, range)) continue;
    if (job.status === 'draft') continue;
    const key = job.returnDate.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) ?? 0) + job.leaderFee);
  }
  const TH_MONTH = [
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
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);
      return { label: `${TH_MONTH[month - 1]} ${year + 543}`, value };
    });
}

/** เอกสารใกล้หมดอายุ (ใช้ซ้ำจาก dashboard) */
export { findExpiringDocuments };

/** คะแนนประเมินหัวหน้าทัวร์ */
export function leaderRatings(leaders: TourLeader[]) {
  return leaders
    .map((leader) => ({
      leaderId: leader.id,
      name: `${leader.firstName} ${leader.lastName}`,
      rating: leader.rating,
      evaluationCount: leader.evaluations.length,
      totalJobs: leader.totalJobs,
    }))
    .sort((a, b) => b.rating - a.rating);
}
