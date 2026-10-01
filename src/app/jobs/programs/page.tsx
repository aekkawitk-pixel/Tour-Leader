'use client';

/** การจัดสเก็ต — มุมมอง "ดูตามโปรแกรมทัวร์" (ตารางโปรแกรม + Quick Assign + จัดลงตารางงานแบบชุด) */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { JOB_FLOW, JOB_STATUS } from '@/lib/labels';
import { conflictJobIds } from '@/lib/logic/conflicts';
import {
  scheduleStatus,
  SCHEDULE_STATUS,
  SCHEDULE_STATUS_ORDER,
  type ScheduleStatus,
} from '@/lib/logic/scheduling';
import { formatDateRange, relativeDayLabel } from '@/lib/format';
import { Button, Card, PageHeader } from '@/components/ui/Primitives';
import { SegmentedControl } from '@/components/ui/Tabs';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Icon } from '@/components/ui/Icon';
import { ScheduleEditModal } from '@/components/jobs/ScheduleEditModal';
import { TourAssignDrawer } from '@/components/jobs/TourAssignDrawer';
import { QuickAssignPopover } from '@/components/jobs/QuickAssignPopover';
import { LEADER_ASSIGNMENT_ENABLED } from '@/lib/featureFlags';
import { ProgramScheduleView } from '@/components/jobs/ProgramScheduleView';
import type { JobStatus, TourJob } from '@/types';

export default function JobsProgramsPage() {
  // ปิดจัดหัวหน้าทัวร์ชั่วคราว → แสดงตารางอ่านอย่างเดียว (โค้ดจัดหัวหน้าทัวร์ใน JobsProgramsAssignView ยังอยู่ครบ)
  if (!LEADER_ASSIGNMENT_ENABLED) return <ProgramScheduleView />;
  return <JobsProgramsAssignView />;
}

function JobsProgramsAssignView() {
  const { jobs, leaders, countries, currentUser, today, reload } = useDemo();
  const router = useRouter();

  const canMatch = can(currentUser.role, 'schedule.match');
  const canAssign = can(currentUser.role, 'schedule.assign');

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | JobStatus>('all');
  const [schedFilter, setSchedFilter] = useState<'all' | ScheduleStatus>('all');
  const [country, setCountry] = useState('all');
  const [leaderFilter, setLeaderFilter] = useState('all');

  const [scheduleTarget, setScheduleTarget] = useState<TourJob | null>(null);
  const [assignDrawer, setAssignDrawer] = useState(false);
  const [quickJob, setQuickJob] = useState<TourJob | null>(null);

  const scoped = useMemo(() => {
    const leaderId = currentUser.leaderId;
    if (currentUser.role !== 'leader' || !leaderId) return jobs;
    return jobs.filter((j) => j.leaderId === leaderId || j.assistantLeaderIds.includes(leaderId));
  }, [jobs, currentUser]);

  const conflicts = useMemo(() => conflictJobIds(jobs), [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((job) => {
        if (status !== 'all' && job.status !== status) return false;
        if (schedFilter !== 'all' && scheduleStatus(job) !== schedFilter) return false;
        if (country !== 'all' && job.country !== country) return false;
        if (leaderFilter === 'none' && job.leaderId) return false;
        if (leaderFilter !== 'all' && leaderFilter !== 'none' && job.leaderId !== leaderFilter) return false;
        if (!q) return true;
        return [job.id, job.title, job.customer, job.country, job.route].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => b.departDate.localeCompare(a.departDate));
  }, [scoped, query, status, schedFilter, country, leaderFilter]);

  const hasFilter =
    query.trim() !== '' || status !== 'all' || schedFilter !== 'all' || country !== 'all' || leaderFilter !== 'all';

  const resetFilters = () => {
    setQuery('');
    setStatus('all');
    setSchedFilter('all');
    setCountry('all');
    setLeaderFilter('all');
  };

  const columns: Column<TourJob>[] = [
    {
      key: 'job',
      header: 'งานทัวร์',
      className: 'min-w-[16rem]',
      render: (job) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium zego-text">
            <span className="truncate">{job.title}</span>
            {conflicts.has(job.id) && (
              <span title="ตารางงานซ้อน" className="shrink-0 zego-text-danger">
                <Icon name="warning" className="h-4 w-4" />
              </span>
            )}
          </p>
          <p className="truncate text-xs zego-text-tertiary">{job.id} · {job.customer}</p>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'ประเทศ',
      hideOnMobile: true,
      render: (job) => <span className="whitespace-nowrap zego-text-secondary">{job.country}</span>,
    },
    {
      key: 'dates',
      header: 'วันเดินทาง',
      render: (job) => (
        <div>
          <p className="whitespace-nowrap zego-text-secondary">{formatDateRange(job.departDate, job.returnDate)}</p>
          <p className="text-xs zego-text-tertiary">{relativeDayLabel(job.departDate, today)}</p>
        </div>
      ),
    },
    {
      key: 'leader',
      header: 'หัวหน้าทัวร์',
      className: 'min-w-[13rem] whitespace-nowrap',
      render: (job) => {
        const leader = leaders.find((l) => l.id === job.leaderId);
        const name = leader ? `${leader.firstName} ${leader.lastName}` : null;
        const content =
          job.status === 'rejected' ? (
            <span className="zego-badge--danger inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium">
              <Icon name="warning" className="h-3 w-3" />
              รอจัดหัวหน้าทัวร์ใหม่
            </span>
          ) : name ? (
            job.status === 'offered' ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="font-medium zego-text">{name}</span>
                <span className="zego-badge--warning inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium">
                  รอคอนเฟิร์ม
                </span>
              </span>
            ) : (
              <span className="zego-text-secondary">{name}</span>
            )
          ) : (
            <span className="zego-badge--slate inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium">
              ยังไม่ระบุ
            </span>
          );
        if (!canAssign) return content;
        return (
          <button
            type="button"
            title="จัดหัวหน้าทัวร์เร็ว"
            aria-label="จัดหัวหน้าทัวร์เร็ว"
            onClick={(ev) => {
              ev.stopPropagation();
              setQuickJob(job);
            }}
            className="group inline-flex items-center gap-1.5 rounded-md text-left"
          >
            {content}
            <Icon name="users" className="h-3.5 w-3.5 shrink-0 zego-text-disabled group-hover:text-[var(--zego-info)]" />
          </button>
        );
      },
    },
    {
      key: 'pax',
      header: 'ผู้เดินทาง',
      align: 'center',
      hideOnMobile: true,
      render: (job) => <span className="tabular-nums">{job.paxCount}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="การจัดสเก็ต"
        description={`ทั้งหมด ${scoped.length} ทัวร์ · แสดง ${filtered.length} ทัวร์`}
        actions={
          <>
            <SegmentedControl
              label="มุมมองการจัดสเก็ต"
              value="program"
              onChange={(v) => {
                if (v === 'leader') router.push('/jobs');
              }}
              options={[
                { value: 'leader', label: 'จัดตามหัวหน้าทัวร์' },
                { value: 'program', label: 'ดูตามโปรแกรมทัวร์' },
              ]}
            />
            {canMatch && (
              <Button variant="primary" icon="users" onClick={() => setAssignDrawer(true)}>
                จัดหัวหน้าทัวร์ลงตารางงาน
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(4,1fr)_auto] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium zego-text-secondary">ค้นหา</label>
            <SearchBox value={query} onChange={setQuery} placeholder="รหัสทัวร์ ชื่อโปรแกรม หรือลูกค้า" label="ค้นหาทัวร์" />
          </div>
          <SelectInput
            label="สถานะการจัดสเก็ต"
            value={schedFilter}
            onChange={(e) => setSchedFilter(e.target.value as 'all' | ScheduleStatus)}
            options={[{ value: 'all', label: 'ทุกสถานะ' }, ...SCHEDULE_STATUS_ORDER.map((s) => ({ value: s, label: SCHEDULE_STATUS[s].label }))]}
          />
          <SelectInput
            label="สถานะงาน"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | JobStatus)}
            options={[{ value: 'all', label: 'ทุกสถานะ' }, ...JOB_FLOW.map((s) => ({ value: s, label: JOB_STATUS[s].label })), { value: 'rejected', label: JOB_STATUS.rejected.label }]}
          />
          <SelectInput
            label="ประเทศ"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[{ value: 'all', label: 'ทุกประเทศ' }, ...countries.filter((c) => c.isActive).map((c) => ({ value: c.nameTh, label: c.nameTh }))]}
          />
          <SelectInput
            label="หัวหน้าทัวร์"
            value={leaderFilter}
            onChange={(e) => setLeaderFilter(e.target.value)}
            options={[
              { value: 'all', label: 'ทุกคน' },
              { value: 'none', label: '⚠ ยังไม่มีหัวหน้าทัวร์' },
              ...leaders.map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` })),
            ]}
          />
          <div>{hasFilter && <Button variant="ghost" size="sm" onClick={resetFilters}>ล้างตัวกรอง</Button>}</div>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(job) => job.id}
          onRowClick={(job) => setScheduleTarget(job)}
          rowClassName={(job) => (conflicts.has(job.id) ? 'bg-rose-50/50' : undefined)}
          emptyIcon={hasFilter ? 'search' : 'calendar'}
          emptyTitle={hasFilter ? 'ไม่พบทัวร์ตามเงื่อนไข' : 'ยังไม่มีทัวร์ที่พร้อมสำหรับการจัดสเก็ต'}
          emptyDescription={hasFilter ? 'ลองปรับคำค้นหาหรือล้างตัวกรอง แล้วค้นหาอีกครั้ง' : 'รายการทัวร์จะแสดงอัตโนมัติเมื่อมีข้อมูลวันและเวลาเดินทางครบถ้วนในระบบ'}
          emptyAction={
            hasFilter ? (
              <Button variant="secondary" onClick={resetFilters}>ล้างตัวกรอง</Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={reload}>รีเฟรชข้อมูล</Button>
                <Button variant="ghost" onClick={() => setSchedFilter('not_ready')}>ตรวจสอบข้อมูลที่ยังไม่พร้อม</Button>
              </div>
            )
          }
        />
      </Card>

      <ScheduleEditModal open={scheduleTarget !== null} onClose={() => setScheduleTarget(null)} job={scheduleTarget} />
      <TourAssignDrawer open={assignDrawer} onClose={() => setAssignDrawer(false)} />
      <QuickAssignPopover open={quickJob !== null} onClose={() => setQuickJob(null)} job={quickJob} />
    </>
  );
}
