'use client';

/** หน้าภาพรวม (Dashboard) */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import {
  computeDashboardStats,
  findExpiringDocuments,
  upcomingJobs,
  urgentTasks,
} from '@/lib/logic/dashboard';
import { conflictJobIds } from '@/lib/logic/conflicts';
import { buildMonthGrid, mapJobsByDate, monthTitle, shiftMonth } from '@/lib/logic/calendar';
import { JOB_STATUS, TONE_HEX } from '@/lib/labels';
import { TONE_ZEGO_COLOR } from '@/lib/tone-tokens';
import {
  formatTHB,
  formatDate,
  formatDateRange,
  parseDate,
  relativeDayLabel,
  TH_WEEKDAYS_SHORT,
} from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  cx,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@/components/ui/Primitives';
import { DonutChart, StatCard } from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { JobFormModal } from '@/components/jobs/JobFormModal';
import type { JobStatus, TourJob } from '@/types';

export default function DashboardPage() {
  const { jobs, leaders, expenses, settlements, appointments, today, currentUser } = useDemo();
  const router = useRouter();
  const [jobModal, setJobModal] = useState(false);

  const todayDate = parseDate(today);
  const [cursor, setCursor] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  });

  /** หัวหน้าทัวร์เห็นเฉพาะงานของตัวเอง */
  const visibleJobs = useMemo(() => {
    const leaderId = currentUser.leaderId;
    if (currentUser.role !== 'leader' || !leaderId) return jobs;
    return jobs.filter(
      (j) => j.leaderId === leaderId || j.assistantLeaderIds.includes(leaderId),
    );
  }, [jobs, currentUser]);

  const visibleSettlements = useMemo(() => {
    const leaderId = currentUser.leaderId;
    if (currentUser.role !== 'leader' || !leaderId) return settlements;
    return settlements.filter((s) => s.leaderId === leaderId);
  }, [settlements, currentUser]);

  const visibleExpenses = useMemo(() => {
    const leaderId = currentUser.leaderId;
    // เอกสารเบิกกรุ๊ปที่นำเข้า (รายการงบ) ไม่ใช่ใบเบิกที่ส่งมา — ไม่นับในสถิติ
    const submitted = expenses.filter((e) => !isGroupAdvanceDoc(e));
    if (currentUser.role !== 'leader' || !leaderId) return submitted;
    return submitted.filter((e) => e.requesterId === leaderId);
  }, [expenses, currentUser]);

  const stats = useMemo(
    () => computeDashboardStats(visibleJobs, leaders, visibleExpenses, visibleSettlements, today),
    [visibleJobs, leaders, visibleExpenses, visibleSettlements, today],
  );

  const tasks = useMemo(
    () =>
      urgentTasks(visibleJobs, leaders, visibleExpenses, visibleSettlements, appointments, today),
    [visibleJobs, leaders, visibleExpenses, visibleSettlements, appointments, today],
  );

  const upcoming = useMemo(() => upcomingJobs(visibleJobs, today), [visibleJobs, today]);
  const conflicts = useMemo(() => conflictJobIds(visibleJobs), [visibleJobs]);
  const expiring = useMemo(() => findExpiringDocuments(leaders, today), [leaders, today]);

  const statusSummary = useMemo(() => {
    const counts = new Map<JobStatus, number>();
    for (const job of visibleJobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([status, value]) => ({
        label: JOB_STATUS[status].label,
        value,
        color: TONE_HEX[JOB_STATUS[status].tone],
      }))
      .sort((a, b) => b.value - a.value);
  }, [visibleJobs]);

  const jobsByDate = useMemo(() => mapJobsByDate(visibleJobs), [visibleJobs]);
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month, today), [cursor, today]);

  const columns: Column<TourJob>[] = [
    {
      key: 'job',
      header: 'งานทัวร์',
      render: (job) => (
        <div className="min-w-0">
          <p className="zego-text flex items-center gap-1.5 font-medium">
            <span className="truncate">{job.title}</span>
            {conflicts.has(job.id) && (
              <span title="ตารางงานซ้อน" className="zego-text-danger shrink-0">
                <Icon name="warning" className="h-4 w-4" />
              </span>
            )}
          </p>
          <p className="zego-text-tertiary text-xs">
            {job.id} · {job.customer}
          </p>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'วันเดินทาง',
      render: (job) => (
        <div>
          <p className="zego-text-secondary whitespace-nowrap">
            {formatDateRange(job.departDate, job.returnDate)}
          </p>
          <p className="zego-text-tertiary text-xs">{relativeDayLabel(job.departDate, today)}</p>
        </div>
      ),
    },
    {
      key: 'leader',
      header: 'หัวหน้าทัวร์',
      hideOnMobile: true,
      render: (job) => {
        const leader = leaders.find((l) => l.id === job.leaderId);
        return leader ? (
          <span className="zego-text-secondary whitespace-nowrap">
            {leader.firstName} {leader.lastName}
          </span>
        ) : (
          <span className="zego-text-danger whitespace-nowrap text-xs font-medium">
            ยังไม่มีหัวหน้าทัวร์
          </span>
        );
      },
    },
    {
      key: 'pax',
      header: 'ผู้เดินทาง',
      align: 'right',
      hideOnMobile: true,
      render: (job) => <span className="tabular-nums">{job.paxCount}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (job) => <StatusBadge meta={JOB_STATUS[job.status]} size="sm" />,
    },
  ];

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        description={`สรุปสถานะงานและสิ่งที่ต้องดำเนินการ ณ วันที่ ${formatDate(today)}`}
        actions={
          <>
            {can(currentUser.role, 'job.create') && (
              <Button variant="primary" icon="plus" onClick={() => setJobModal(true)}>
                สร้างงานทัวร์
              </Button>
            )}
            {can(currentUser.role, 'leader.create') && (
              <Button variant="secondary" icon="plus" onClick={() => router.push('/leaders/new')}>
                เพิ่มหัวหน้าทัวร์
              </Button>
            )}
          </>
        }
      />

      {/* การ์ดสรุป */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="งานที่กำลังเดินทาง"
          value={stats.traveling}
          tone="blue"
          hint="อยู่ระหว่างเดินทางตอนนี้"
        />
        <StatCard
          label="งานที่ยังไม่มีหัวหน้าทัวร์"
          value={stats.needLeader}
          tone={stats.needLeader > 0 ? 'amber' : 'slate'}
          hint="ต้องจัดคนก่อนวันเดินทาง"
        />
        <StatCard
          label="งานที่ตารางซ้อนกัน"
          value={stats.conflicting}
          tone={stats.conflicting > 0 ? 'red' : 'slate'}
          hint="หัวหน้าทัวร์ถูกจัดซ้ำช่วงเวลา"
        />
        <StatCard
          label="รายการเบิกรออนุมัติ"
          value={stats.pendingExpenses}
          tone="violet"
          hint="รอฝ่ายบัญชีพิจารณา"
        />
        <StatCard
          label="งานรอเคลียร์"
          value={stats.awaitingSettlement}
          tone="blue"
          hint="ยังไม่ปิดการเคลียร์"
        />
        <StatCard
          label="งานเคลียร์เกินกำหนด"
          value={stats.overdueSettlement}
          tone={stats.overdueSettlement > 0 ? 'red' : 'green'}
          hint="เลยกำหนดวันเคลียร์แล้ว"
        />
        <StatCard
          label="เงินทดรองค้างเคลียร์"
          value={formatTHB(stats.outstandingAdvanceTHB)}
          tone="amber"
          hint="ยอดรวมที่ยังไม่ปิดบัญชี"
        />
        <StatCard
          label="เอกสารใกล้หมดอายุ"
          value={stats.expiringDocs}
          tone={stats.expiringDocs > 0 ? 'amber' : 'slate'}
          hint="ภายใน 120 วัน หรือหมดอายุแล้ว"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* งานที่ใกล้เดินทาง */}
        <Card className="xl:col-span-2" padded={false}>
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <CardHeader
              title="งานที่ใกล้เดินทาง"
              description="เรียงตามวันเดินทางที่ใกล้ที่สุด"
              action={
                <Link
                  href="/jobs"
                  className="zego-text-info zego-hover-surface rounded-lg px-2 py-1 text-sm font-medium"
                >
                  ดูงานทั้งหมด →
                </Link>
              }
            />
          </div>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <DataTable
              columns={columns}
              rows={upcoming}
              rowKey={(job) => job.id}
              emptyTitle="ยังไม่มีงานที่ใกล้เดินทาง"
              emptyDescription="เมื่อมีงานใหม่ที่ยังไม่ปิด จะแสดงที่นี่"
              emptyIcon="plane"
              rowClassName={(job) => (conflicts.has(job.id) ? 'bg-rose-50/50' : undefined)}
            />
          </div>
        </Card>

        {/* รายการเร่งด่วน */}
        <Card>
          <CardHeader title="ต้องดำเนินการเร่งด่วน" description={`${tasks.length} รายการ`} />
          {tasks.length === 0 ? (
            <EmptyState icon="check" title="ไม่มีงานค้าง" description="ทุกอย่างเรียบร้อยดี" />
          ) : (
            <ul className="-mx-1 max-h-[26rem] space-y-1 overflow-y-auto pr-1">
              {tasks.slice(0, 10).map((task) => (
                <li key={task.id}>
                  <Link
                    href={task.href}
                    className="zego-hover-surface flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TONE_ZEGO_COLOR[task.tone] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="zego-text block text-sm font-medium">{task.title}</span>
                      <span className="zego-text-tertiary block truncate text-xs">{task.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* ปฏิทินขนาดย่อ */}
        <Card>
          <CardHeader
            title="ปฏิทินงาน"
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="เดือนก่อนหน้า"
                  onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
                  className="zego-text-tertiary zego-hover-surface rounded-lg p-1.5"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="เดือนถัดไป"
                  onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
                  className="zego-text-tertiary zego-hover-surface rounded-lg p-1.5"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            }
          />
          <p className="zego-text-secondary -mt-2 mb-3 text-sm font-semibold">
            {monthTitle(cursor.year, cursor.month)}
          </p>

          <div className="grid grid-cols-7 gap-1 text-center">
            {TH_WEEKDAYS_SHORT.map((day) => (
              <div key={day} className="zego-text-tertiary pb-1 text-[11px] font-medium">
                {day}
              </div>
            ))}
            {grid.map((cell) => {
              const dayJobs = jobsByDate.get(cell.date) ?? [];
              const tones = Array.from(
                new Set(dayJobs.map((j) => JOB_STATUS[j.status].tone)),
              ).slice(0, 3);
              return (
                <Link
                  key={cell.date}
                  href="/calendar"
                  className={cx(
                    'flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors',
                    cell.inMonth ? 'zego-text-secondary zego-hover-surface' : 'zego-text-disabled',
                    cell.isToday && 'zego-today-badge font-bold',
                  )}
                >
                  <span>{parseDate(cell.date).getDate()}</span>
                  <span className="mt-0.5 flex h-1.5 gap-0.5">
                    {tones.map((tone) => (
                      <span
                        key={tone}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: TONE_ZEGO_COLOR[tone] }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </Link>
              );
            })}
          </div>
          <Link
            href="/calendar"
            className="zego-text-info zego-hover-surface mt-3 block rounded-lg py-1.5 text-center text-sm font-medium"
          >
            เปิดปฏิทินเต็มจอ →
          </Link>
        </Card>

        {/* สรุปสถานะงาน */}
        <Card>
          <CardHeader title="สรุปสถานะงาน" description={`ทั้งหมด ${visibleJobs.length} งาน`} />
          <DonutChart data={statusSummary} />
        </Card>

        {/* เอกสารใกล้หมดอายุ */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="เอกสารใกล้หมดอายุ" description="ภายใน 120 วัน หรือหมดอายุแล้ว" />
          {expiring.length === 0 ? (
            <EmptyState icon="check" title="ไม่มีเอกสารใกล้หมดอายุ" />
          ) : (
            <ul className="space-y-2">
              {expiring.slice(0, 6).map((doc) => (
                <li key={`${doc.leaderId}-${doc.documentName}`}>
                  <Link
                    href={`/leaders/${doc.leaderId}`}
                    className="zego-border-color zego-hover-surface flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="zego-text block truncate text-sm font-medium">
                        {doc.leaderName}
                      </span>
                      <span className="zego-text-tertiary block truncate text-xs">
                        {doc.documentName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={cx(
                          'block text-xs font-semibold',
                          doc.expired ? 'zego-text-danger' : 'zego-text-warning',
                        )}
                      >
                        {doc.expired ? 'หมดอายุแล้ว' : `เหลือ ${doc.daysLeft} วัน`}
                      </span>
                      <span className="zego-text-tertiary block text-[11px]">
                        {formatDate(doc.expiresAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <JobFormModal open={jobModal} onClose={() => setJobModal(false)} job={null} />
    </>
  );
}
