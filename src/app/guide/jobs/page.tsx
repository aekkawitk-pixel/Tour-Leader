'use client';

/**
 * งานของฉัน — /guide/jobs
 *
 * ⚠️ แก้ไขสำคัญ: เดิมอ่านจาก useDemo().jobs (TourJob) ซึ่งเป็นชุดข้อมูลเก่า/เล็กมาก (~10 รายการ
 * ไม่มีจริงสำหรับหัวหน้าทัวร์ส่วนใหญ่) ตัวระบบจัดหัวหน้าทัวร์จริงที่ใช้งานอยู่ (หน้า "การจัดสเก็ต")
 * ผูกกับ Tour Period Master ผ่าน guideAssignmentStore ต่างหาก — เปลี่ยนมาอ่านจากที่นั่นแทน
 * เพื่อให้เห็นงานที่ถูกจัดจริงตรงกับที่ผู้จัดเห็น (ดู src/services/guideAssignmentStore.ts)
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { boardStatusMeta } from '@/lib/logic/guideBoard';
import { formatDateRange, toISODate } from '@/lib/format';
import { Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { MonthHeader, MonthYearSelect, useMonthGroups } from '@/components/ui/MonthFilter';

export default function GuideJobsPage() {
  const { currentUser } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const myJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
    .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
    .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
    .sort((a, b) => b.period.startDate.localeCompare(a.period.startDate));

  // แบ่งรายปี/รายเดือนตามวันออกเดินทาง (ใหม่สุดก่อนเหมือนเดิม) — ค่าเริ่มต้นเป็นปีปัจจุบัน ชุดเดียวกับพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป
  const monthGroups = useMonthGroups(myJobs, (j) => j.period.startDate, toISODate(new Date()));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">งานของฉัน</h1>
        <p className="text-sm zego-text-tertiary">งานทัวร์ทั้งหมดที่ได้รับมอบหมาย — กดดูรายละเอียดและเอกสารทริป</p>
      </div>

      <MonthYearSelect groups={monthGroups} />

      {myJobs.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="briefcase" title="ยังไม่มีงานในระบบ" />
        </Card>
      ) : (
        <div className="space-y-5">
          {monthGroups.shown.map((m) => (
            <section key={m.key} aria-label={m.label} className="space-y-2">
              <MonthHeader label={m.label} count={m.items.length} unit="งาน" />
              <Card padded={false}>
                <ul className="divide-y divide-[var(--zego-border-soft)]">
                  {m.items.map(({ assignment, period }) => (
                    <li key={assignment.assignmentId}>
                      <Link
                        href={`/guide/jobs/${period.internalId}`}
                        className="flex items-center gap-3 px-4 py-3 zego-hover-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium zego-text">{period.groupCode} · {period.displayName}</p>
                          <p className="text-xs zego-text-tertiary">{period.countryName} · {formatDateRange(period.startDate, period.endDate)}</p>
                        </div>
                        <StatusBadge meta={boardStatusMeta(assignment.assignmentStatus)} size="sm" />
                        <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
