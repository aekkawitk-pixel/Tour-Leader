'use client';

/**
 * เมนู "การจัดสเก็ต"
 *   • LEADER_ASSIGNMENT_ENABLED = true  → Flow เลือกหัวหน้าทัวร์ก่อน (3-panel) — โค้ดยังอยู่ครบ
 *   • LEADER_ASSIGNMENT_ENABLED = false → แสดงเฉพาะตารางงานทัวร์ + ข้อมูลพีเรียด (ปิดจัดหัวหน้าทัวร์ชั่วคราว)
 */

import { LEADER_ASSIGNMENT_ENABLED } from '@/lib/featureFlags';
import { LeaderAssignWorkspace } from '@/components/jobs/LeaderAssignWorkspace';
import { JobsScheduleView } from '@/components/jobs/JobsScheduleView';

export default function JobsPage() {
  return LEADER_ASSIGNMENT_ENABLED ? <LeaderAssignWorkspace /> : <JobsScheduleView />;
}
