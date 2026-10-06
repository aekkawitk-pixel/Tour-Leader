/**
 * งานที่หัวหน้าทัวร์เปิดดูแล้ว — ใช้แยก "ได้รับงานใหม่" ในกระดิ่งแจ้งเตือนของพอร์ทัลหัวหน้าทัวร์
 * เก็บเป็น assignmentId ต่อเครื่อง (localStorage) · เปิดหน้ารายละเอียดงาน = ดูแล้ว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'guideSeenJobs';
/** แจ้งให้กระดิ่งนับใหม่ทันทีหลังเปิดดูงาน */
export const SEEN_JOBS_EVENT = 'guide-seen-jobs';

export function loadSeenJobIds(): Set<string> {
  const rows = readJson<unknown>(KEY, []);
  return new Set(Array.isArray(rows) ? rows.filter((x): x is string => typeof x === 'string') : []);
}

export function markJobSeen(assignmentId: string): void {
  const seen = loadSeenJobIds();
  if (seen.has(assignmentId)) return;
  seen.add(assignmentId);
  writeJson(KEY, [...seen]);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SEEN_JOBS_EVENT));
}
