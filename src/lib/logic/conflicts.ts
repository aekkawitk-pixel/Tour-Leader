/** ตรรกะตรวจงานซ้อน — แยกออกจาก UI ทั้งหมด */

import type { ScheduleConflict, TourJob } from '@/types';
import { diffDays, parseDate, toISODate } from '@/lib/format';

/** สถานะที่ถือว่า "จองตัว" หัวหน้าทัวร์แล้ว (ร่างและปิดงานไม่นับ) */
const BLOCKING_STATUSES = new Set(['offered', 'accepted', 'traveling', 'awaiting_settlement']);

export function isBlockingJob(job: TourJob): boolean {
  return BLOCKING_STATUSES.has(job.status);
}

/** งานสองงานคาบเกี่ยวกันหรือไม่ (นับวันเดินทาง–วันกลับแบบรวมปลาย) */
export function jobsOverlap(a: TourJob, b: TourJob): boolean {
  return (
    parseDate(a.departDate) <= parseDate(b.returnDate) &&
    parseDate(b.departDate) <= parseDate(a.returnDate)
  );
}

function overlapRange(a: TourJob, b: TourJob) {
  const start = parseDate(a.departDate) > parseDate(b.departDate) ? a.departDate : b.departDate;
  const end = parseDate(a.returnDate) < parseDate(b.returnDate) ? a.returnDate : b.returnDate;
  return { start, end, days: diffDays(start, end) + 1 };
}

/** หัวหน้าทัวร์คนนี้มีงานอื่นชนกับงานที่กำลังพิจารณาหรือไม่ */
export function findConflictsForLeader(
  leaderId: string,
  candidate: Pick<TourJob, 'id' | 'departDate' | 'returnDate'>,
  jobs: TourJob[],
): TourJob[] {
  const probe = candidate as TourJob;
  return jobs.filter(
    (job) =>
      job.id !== candidate.id &&
      isBlockingJob(job) &&
      (job.leaderId === leaderId || job.assistantLeaderIds.includes(leaderId)) &&
      jobsOverlap(probe, job),
  );
}

/** งานซ้อนทั้งหมดในระบบ (ใช้บน Dashboard และปฏิทิน) */
export function findAllConflicts(jobs: TourJob[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const byLeader = new Map<string, TourJob[]>();

  for (const job of jobs) {
    if (!isBlockingJob(job)) continue;
    const people = [job.leaderId, ...job.assistantLeaderIds].filter(Boolean) as string[];
    for (const leaderId of people) {
      if (!byLeader.has(leaderId)) byLeader.set(leaderId, []);
      byLeader.get(leaderId)!.push(job);
    }
  }

  for (const [leaderId, leaderJobs] of byLeader) {
    for (let i = 0; i < leaderJobs.length; i += 1) {
      for (let j = i + 1; j < leaderJobs.length; j += 1) {
        const a = leaderJobs[i];
        const b = leaderJobs[j];
        if (!jobsOverlap(a, b)) continue;
        const range = overlapRange(a, b);
        conflicts.push({
          leaderId,
          jobA: a.id,
          jobB: b.id,
          overlapStart: range.start,
          overlapEnd: range.end,
          overlapDays: range.days,
        });
      }
    }
  }
  return conflicts;
}

/** รหัสงานทั้งหมดที่เกี่ยวข้องกับความซ้อนทับ ใช้ทำเครื่องหมายในตาราง/ปฏิทิน */
export function conflictJobIds(jobs: TourJob[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of findAllConflicts(jobs)) {
    ids.add(conflict.jobA);
    ids.add(conflict.jobB);
  }
  return ids;
}

/** ตรวจเวลานัดหมายซ้อน (ใช้ในหน้านัดหมาย) */
export function hasTimeOverlap(
  aDate: string,
  aTime: string,
  aDuration: number,
  bDate: string,
  bTime: string,
  bDuration: number,
): boolean {
  if (aDate !== bDate) return false;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const aStart = toMinutes(aTime);
  const aEnd = aStart + aDuration;
  const bStart = toMinutes(bTime);
  const bEnd = bStart + bDuration;
  return aStart < bEnd && bStart < aEnd;
}

/** ทุกวันที่ในช่วงของงาน ใช้วาดปฏิทิน */
export function jobDateSpan(job: TourJob): string[] {
  const dates: string[] = [];
  const cursor = parseDate(job.departDate);
  const end = parseDate(job.returnDate);
  while (cursor <= end) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
