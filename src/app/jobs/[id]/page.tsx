'use client';

/** หน้ารายละเอียดงานทัวร์ — ข้อมูลงาน หัวหน้าทัวร์ การเงิน และ Timeline ประวัติสถานะ */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import {
  EXPENSE_STATUS,
  JOB_FLOW,
  JOB_STATUS,
  SETTLEMENT_STATUS,
} from '@/lib/labels';
import { findConflictsForLeader } from '@/lib/logic/conflicts';
import { summarizeSettlement } from '@/lib/logic/settlement';
import {
  diffDays,
  formatTHB,
  formatDate,
  formatDateRange,
  formatDateTime,
  relativeDayLabel,
} from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  Callout,
  cx,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@/components/ui/Primitives';
import { Timeline } from '@/components/ui/Timeline';
import { Icon } from '@/components/ui/Icon';
import { JobFormModal } from '@/components/jobs/JobFormModal';
import { JobStatusModal } from '@/components/jobs/JobStatusModal';
import { JobLeaderPicker } from '@/components/jobs/JobLeaderPicker';
import type { JobStatus } from '@/types';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { jobs, expenses, settlements, currentUser, today, ready } = useDemo();

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const job = jobs.find((j) => j.id === params.id);

  const conflictJobs = useMemo(() => {
    if (!job?.leaderId) return [];
    return findConflictsForLeader(job.leaderId, job, jobs);
  }, [job, jobs]);

  const jobExpenses = useMemo(
    () => expenses.filter((e) => e.jobId === params.id),
    [expenses, params.id],
  );
  const settlement = settlements.find((s) => s.jobId === params.id);

  if (!ready) return null;

  if (!job) {
    return (
      <Card>
        <EmptyState
          icon="search"
          title="ไม่พบงานทัวร์รายการนี้"
          description={`ไม่มีข้อมูลรหัส ${params.id} ในระบบ`}
          action={
            <Button variant="secondary" onClick={() => router.push('/jobs')}>
              กลับไปหน้ารายการงาน
            </Button>
          }
        />
      </Card>
    );
  }

  const currentIndex = JOB_FLOW.indexOf(job.status);
  const totalExpense = jobExpenses
    .filter((e) => e.status === 'paid')
    .reduce((sum, e) => sum + e.totalTHB, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => router.push('/jobs')}
        className="zego-icon-btn mb-3 inline-flex items-center gap-1 text-sm"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        กลับไปรายการการจัดสเก็ต
      </button>

      <PageHeader
        title={job.title}
        description={`${job.id} · ${job.customer} · ${job.route}`}
        actions={
          <>
            <StatusBadge meta={JOB_STATUS[job.status]} />
            {can(currentUser.role, 'job.edit') && (
              <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>
                แก้ไข
              </Button>
            )}
            {can(currentUser.role, 'job.changeStatus') && (
              <Button variant="primary" onClick={() => setStatusOpen(true)}>
                เปลี่ยนสถานะ
              </Button>
            )}
          </>
        }
      />

      {/* คำเตือน */}
      <div className="mb-5 space-y-3">
        {conflictJobs.length > 0 && (
          <Callout tone="red" title="พบตารางงานซ้อน">
            หัวหน้าทัวร์คนนี้มีงานอื่นในช่วงเวลาเดียวกัน:{' '}
            {conflictJobs.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                <Link href={`/jobs/${c.id}`} className="font-semibold underline">
                  {c.id}
                </Link>{' '}
                ({formatDateRange(c.departDate, c.returnDate)})
              </span>
            ))}
          </Callout>
        )}
        {!job.leaderId && job.status !== 'draft' && job.status !== 'closed' && job.status !== 'cancelled' && (
          <Callout tone="amber" title="งานนี้ยังไม่มีหัวหน้าทัวร์">
            เดินทาง {formatDate(job.departDate)} ({relativeDayLabel(job.departDate, today)})
            — กดปุ่ม “เลือกหัวหน้าทัวร์” เพื่อจัดคน
          </Callout>
        )}
      </div>

      {/* แถบสถานะ workflow */}
      <Card className="mb-5">
        <CardHeader title="ขั้นตอนของงาน" />
        <ol className="flex flex-wrap gap-x-1 gap-y-2">
          {JOB_FLOW.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li key={step} className="flex items-center gap-1">
                <span
                  className={cx(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
                    active
                      ? 'zego-today-badge'
                      : done
                        ? 'zego-badge--success border'
                        : 'zego-surface-soft-bg zego-text-tertiary',
                  )}
                >
                  {done && <Icon name="check" className="h-3 w-3" />}
                  {JOB_STATUS[step as JobStatus].label}
                </span>
                {index < JOB_FLOW.length - 1 && (
                  <Icon name="chevronRight" className="h-3 w-3 zego-text-disabled" />
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ข้อมูลงาน */}
        <Card className="lg:col-span-2">
          <CardHeader title="รายละเอียดงาน" />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="รหัสงาน" value={job.id} />
            <Row label="ลูกค้า / บริษัทคู่ค้า" value={job.customer} />
            <Row label="ประเทศ" value={job.country} />
            <Row label="เมือง" value={job.cities.join(', ') || '—'} />
            <Row label="เส้นทาง" value={job.route} />
            <Row
              label="วันเดินทาง"
              value={`${formatDateRange(job.departDate, job.returnDate)} (${
                diffDays(job.departDate, job.returnDate) + 1
              } วัน)`}
            />
            <Row label="วัน–เวลานัดหมาย" value={formatDateTime(job.meetingDateTime)} />
            <Row label="จุดนัดพบ" value={job.meetingPoint} />
            <Row
              label="เที่ยวบินขาไป"
              value={`${job.outboundFlight.flightNo} · ${job.outboundFlight.route}`}
            />
            <Row
              label="เที่ยวบินขากลับ"
              value={`${job.inboundFlight.flightNo} · ${job.inboundFlight.route}`}
            />
            <Row label="จำนวนผู้เดินทาง" value={`${job.paxCount} ท่าน`} />
            <Row label="ผู้ประสานงาน" value={job.coordinator} />
            <Row label="ค่าตอบแทนหัวหน้าทัวร์" value={formatTHB(job.leaderFee)} />
            <Row label="งบประมาณ" value={formatTHB(job.budget)} />
          </dl>

          {job.note && (
            <div className="mt-4 rounded-lg zego-surface-soft-bg px-4 py-3">
              <p className="text-xs font-semibold zego-text-tertiary">หมายเหตุ</p>
              <p className="mt-1 text-sm zego-text-secondary">{job.note}</p>
            </div>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold zego-text">เอกสารแนบ (จำลอง)</h3>
          {job.attachments.length === 0 ? (
            <p className="text-sm zego-text-tertiary">ไม่มีเอกสารแนบ</p>
          ) : (
            <ul className="space-y-2">
              {job.attachments.map((file) => (
                <li
                  key={file.id}
                  className="zego-border-color flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <Icon name="file" className="h-4 w-4 shrink-0 zego-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs zego-text-secondary">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs zego-text-tertiary">{file.size}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          {/* หัวหน้าทัวร์ — เลือก/เปลี่ยนได้ในการ์ด พร้อมรายการเลื่อน */}
          <JobLeaderPicker job={job} canAssign={can(currentUser.role, 'schedule.assign')} />

          {/* การเงินของงาน */}
          <Card>
            <CardHeader title="การเงินของงานนี้" />
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">งบประมาณ</dt>
                <dd className="font-semibold tabular-nums zego-text">
                  {formatTHB(job.budget)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="zego-text-tertiary">จ่ายแล้ว (ใบเบิก)</dt>
                <dd className="font-semibold tabular-nums zego-text">
                  {formatTHB(totalExpense)}
                </dd>
              </div>
              <div className="zego-divider-top flex justify-between pt-2.5">
                <dt className="zego-text-tertiary">ค่าตอบแทนหัวหน้าทัวร์</dt>
                <dd className="font-semibold tabular-nums zego-text">
                  {formatTHB(job.leaderFee)}
                </dd>
              </div>
            </dl>

            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
              ใบเบิกที่เกี่ยวข้อง ({jobExpenses.length})
            </h3>
            {jobExpenses.length === 0 ? (
              <p className="text-sm zego-text-tertiary">ยังไม่มีใบเบิก</p>
            ) : (
              <ul className="space-y-2">
                {jobExpenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="zego-border-color flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium zego-text">{expense.id}</p>
                      <p className="text-xs tabular-nums zego-text-tertiary">
                        {formatTHB(expense.totalTHB)}
                      </p>
                    </div>
                    <StatusBadge meta={EXPENSE_STATUS[expense.status]} size="sm" />
                  </li>
                ))}
              </ul>
            )}

            {settlement && (
              <>
                <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
                  การเคลียร์งาน
                </h3>
                <Link
                  href="/settlements"
                  className="zego-border-color zego-hover-surface flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium zego-text">{settlement.id}</p>
                    <p className="text-xs zego-text-tertiary">
                      ยอดสุทธิ{' '}
                      {formatTHB(Math.abs(summarizeSettlement(settlement, today).netTHB))}
                    </p>
                  </div>
                  <StatusBadge meta={SETTLEMENT_STATUS[settlement.status]} size="sm" />
                </Link>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Timeline */}
      <Card className="mt-5">
        <CardHeader title="ประวัติสถานะ (Timeline)" description="บันทึกทุกครั้งที่มีการเปลี่ยนสถานะ" />
        <Timeline
          events={job.history}
          resolve={(key) => JOB_STATUS[key as JobStatus] ?? { label: key, tone: 'slate' }}
        />
      </Card>

      <JobFormModal open={editOpen} onClose={() => setEditOpen(false)} job={job} />
      <JobStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} job={job} />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="w-40 shrink-0 zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 flex-1 zego-text-secondary">{value}</dd>
    </div>
  );
}
