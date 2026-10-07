'use client';

/**
 * นัดหมาย — ปฏิทินรวมนัด 2 ประเภท (เคลียร์เงินกรุ๊ป · ส่งเอกสาร)
 *
 * ชุดนัดหมายกลาง (appointmentStore) — นัดเคลียร์เงินที่การเงินนัดจากเมนูเคลียร์เงินกรุ๊ปก็ขึ้นที่นี่
 * หัวหน้าทัวร์ยืนยัน / ขอเลื่อนในพอร์ทัล → ที่นี่เห็นคำขอ แล้ว "เลื่อนนัด" ให้ (กลับเป็นรอหัวหน้าทัวร์ยืนยัน)
 * ค่าเริ่มต้นเป็นมุมมองปฏิทิน — แต่ละวันแสดง "จำนวนกรุ๊ปที่นัดมา" (+ นัดที่ไม่ผูกกรุ๊ป)
 * กดวัน → แผงรายละเอียดการนัดของวันนั้น (เวลา กรุ๊ป หัวหน้าทัวร์ ประเภท สถานะ ผู้นัด/เมื่อไร) → กดนัดเพื่อจัดการ
 * ปุ่ม + มุมวัน = สร้างนัดวันนั้น
 * การ์ด "พร้อมนัดเคลียร์เงิน" — กรุ๊ปที่จบทริปและหัวหน้าทัวร์ทำครบแล้ว ยังไม่มีนัด → กดนัดได้เลย (lib/logic/clearQueue.ts)
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import Link from 'next/link';
import { APPOINTMENT_KIND, APPOINTMENT_KIND_OPTIONS, APPOINTMENT_MODE, APPOINTMENT_STATUS, appointmentStatusMeta } from '@/lib/labels';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { buildMonthGrid, monthTitle, shiftMonth } from '@/lib/logic/calendar';
import { hasTimeOverlap } from '@/lib/logic/conflicts';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT, toISODate } from '@/lib/format';
import {
  Button,
  Card,
  Callout,
  cx,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { slotOptions } from '@/lib/logic/appointmentSlots';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal';
import { Timeline } from '@/components/ui/Timeline';
import { Icon } from '@/components/ui/Icon';
import { AppointmentFormModal } from '@/components/appointments/AppointmentFormModal';
import type { Appointment, AppointmentKind, AppointmentStatus } from '@/types';
import { groupsReadyToClear, moneyGroupIds } from '@/lib/logic/clearQueue';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadGroupClears } from '@/services/groupClearStore';

export default function AppointmentsPage() {
  const { appointments, leaders, jobs, currentUser, changeAppointmentStatus, saving, envelopes, expenses } =
    useDemo();
  // วันที่จริงของเครื่อง — นัดหมายเป็นข้อมูลจริง (ไม่ใช้วันจำลองของ Demo ที่ตรึงไว้ ก.ค. 2569)
  const today = toISODate(new Date());

  const todayDate = parseDate(today);
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [kindFilter, setKindFilter] = useState<'all' | AppointmentKind>('all');
  const [presetDate, setPresetDate] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  });
  const [status, setStatus] = useState<'all' | AppointmentStatus>('all');
  const [leaderFilter, setLeaderFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  /** นัดจากการ์ด "พร้อมนัดเคลียร์เงิน" — ตั้งกรุ๊ป + หัวหน้าทัวร์ไว้ให้ */
  const [presetGroup, setPresetGroup] = useState<{ jobId: string; leaderId: string } | null>(null);
  const [showAllReady, setShowAllReady] = useState(false);
  /** กรุ๊ปที่ปิดเคลียร์แล้ว (localStorage) */
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const recs = loadGroupClears();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setClosedIds(new Set(Object.keys(recs).filter((id) => recs[id].closedAt)));
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** วันที่เปิดดูรายละเอียดการนัด (มุมมองปฏิทิน) */
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const selected = appointments.find((a) => a.id === selectedId) ?? null;
  const editing = appointments.find((a) => a.id === editingId) ?? null;

  const scoped = useMemo(() => {
    const leaderId = currentUser.leaderId;
    if (currentUser.role !== 'leader' || !leaderId) return appointments;
    return appointments.filter((a) => a.leaderId === leaderId);
  }, [appointments, currentUser]);

  const filtered = useMemo(
    () =>
      scoped
        .filter((a) => {
          if (status !== 'all' && a.status !== status) return false;
          if (leaderFilter !== 'all' && a.leaderId !== leaderFilter) return false;
          if (kindFilter !== 'all' && (a.kind ?? 'other') !== kindFilter) return false;
          return true;
        })
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [scoped, status, leaderFilter, kindFilter],
  );

  /** เวลาซ้อน (ของหัวหน้าทัวร์หรือเจ้าหน้าที่คนเดียวกัน) */
  const overlapIds = useMemo(() => {
    const ids = new Set<string>();
    const active = scoped.filter((a) => a.status !== 'cancelled');
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        const samePerson = a.leaderId === b.leaderId || a.staffName === b.staffName;
        if (!samePerson) continue;
        if (hasTimeOverlap(a.date, a.time, a.durationMinutes, b.date, b.time, b.durationMinutes)) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [scoped]);

  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of filtered) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date)!.push(a);
    }
    return map;
  }, [filtered]);

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month, today), [cursor, today]);

  const leaderName = (id: string) => {
    const leader = leaders.find((l) => l.id === id);
    return leader ? `${leader.firstName} ${leader.lastName}` : id;
  };
  /** กรุ๊ปของนัด — กรุ๊ปจริง (Tour Period) ก่อน · นัดเดิมแบบงาน JOB-… ใช้ชื่องาน */
  const groupOf = (a: Appointment): string => {
    if (!a.jobId) return 'ไม่ผูกกรุ๊ป';
    const p = getTourPeriodById(a.jobId);
    if (p) return `${p.groupCode} · ${p.displayName}`;
    const j = jobs.find((x) => x.id === a.jobId);
    return j ? `${j.id} — ${j.title}` : periodCodeOf(a.jobId);
  };

  const upcoming = scoped.filter(
    (a) => a.date >= today && (a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'),
  );
  const pending = scoped.filter((a) => a.status === 'pending');
  const askReschedule = scoped.filter((a) => a.status === 'rescheduled');
  const attended = scoped.filter((a) => a.status === 'attended');

  const canManage = can(currentUser.role, 'appointment.manage');

  /** กรุ๊ปที่พร้อมนัดเคลียร์เงิน — จบทริป · หัวหน้าทัวร์ทำครบ · ยังไม่มีนัด · ยังไม่ปิด */
  const readyGroups = useMemo(() => {
    const periods = moneyGroupIds(envelopes, expenses)
      .map((id) => getTourPeriodById(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const confirmed = new Map(loadActiveGuideAssignments()
      .filter((a) => a.assignmentStatus === 'CONFIRMED')
      .map((a) => [a.periodId, a.tourLeaderId]));
    return groupsReadyToClear({ periods, today, envelopes, expenses, appointments, closedIds }).map((c) => {
      const p = getTourPeriodById(c.periodId)!;
      const leaderId = confirmed.get(c.periodId) ?? c.summary.perDiem?.requesterId ?? c.summary.receipts[0]?.requesterId ?? '';
      const leader = leaders.find((l) => l.id === leaderId);
      return { ...c, p, leaderId, leaderName: leader ? leaderDisplayName(leader) : (c.summary.perDiem?.requesterName ?? '—') };
    });
  }, [envelopes, expenses, appointments, closedIds, leaders, today]);
  const READY_PREVIEW = 8;
  const readyShown = showAllReady ? readyGroups : readyGroups.slice(0, READY_PREVIEW);

  const submitReschedule = async () => {
    if (!selected || !newDate || !newTime) return;
    setRescheduleOpen(false);
    // เจ้าหน้าที่เลื่อนนัด → กลับเป็นรอหัวหน้าทัวร์ยืนยันวันเวลาใหม่
    await changeAppointmentStatus(
      selected.id,
      'pending',
      rescheduleNote.trim() ||
        `เลื่อนจาก ${formatDate(selected.date)} ${selected.time} เป็น ${formatDate(newDate)} ${newTime}`,
      newDate,
      newTime,
    );
    setSelectedId(null);
  };

  return (
    <>
      <PageHeader
        title="นัดหมาย"
        description="ปฏิทินรวมนัด — เคลียร์เงินกรุ๊ป · ส่งเอกสาร · หัวหน้าทัวร์ยืนยันหรือขอเลื่อนในพอร์ทัลของตัวเอง"
        actions={
          can(currentUser.role, 'appointment.create') && (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setEditingId(null);
                setPresetDate(undefined);
                setFormOpen(true);
              }}
            >
              สร้างนัดหมาย
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="นัดหมายที่จะถึง" value={upcoming.length} tone="blue" hint="ตั้งแต่วันนี้เป็นต้นไป" />
        <StatCard
          label="รอยืนยัน"
          value={pending.length}
          tone={pending.length > 0 ? 'amber' : 'slate'}
          // นัดที่หัวหน้าทัวร์ขอเอง = รอการเงินยืนยัน (แยกจากนัดที่รอหัวหน้าทัวร์ตอบรับ)
          hint={pending.some((a) => a.requestedByLeader)
            ? `หัวหน้าทัวร์ขอนัด ${pending.filter((a) => a.requestedByLeader).length} · รอหัวหน้าทัวร์ ${pending.filter((a) => !a.requestedByLeader).length}`
            : 'รอหัวหน้าทัวร์ตอบรับ'}
        />
        <StatCard
          label="ขอเลื่อนนัด"
          value={askReschedule.length}
          tone={askReschedule.length > 0 ? 'violet' : 'slate'}
          hint="หัวหน้าทัวร์ขอเลื่อน รอนัดใหม่"
        />
        <StatCard
          label="เวลาซ้อน"
          value={overlapIds.size}
          tone={overlapIds.size > 0 ? 'red' : 'green'}
          hint="นัดหมายที่ชนกัน"
        />
        <StatCard label="เข้าพบแล้ว" value={attended.length} tone="green" hint="เสร็จสิ้นแล้ว" />
      </div>

      {/* กรุ๊ปพร้อมนัดเคลียร์เงิน — หัวหน้าทัวร์ทำครบแล้ว ยังไม่มีนัด */}
      {can(currentUser.role, 'appointment.create') && readyGroups.length > 0 && (
        <Card className="mb-5 ring-1 ring-emerald-200">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold zego-text">พร้อมนัดเคลียร์เงิน ({readyGroups.length} กรุ๊ป)</p>
              <p className="text-xs zego-text-tertiary">จบทริปแล้ว หัวหน้าทัวร์ส่งครบทุกอย่าง (ซองเงิน · ใบเสร็จ · เบี้ยเลี้ยง) — ยังไม่มีนัด · เรียงจบทริปนานสุดก่อน</p>
            </div>
          </div>
          <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
            {readyShown.map((g) => (
              <li key={g.periodId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium zego-text">
                    {g.p.groupCode} <span className="font-normal zego-text-secondary">· {g.leaderName}</span>
                  </p>
                  <p className="text-xs zego-text-tertiary">{g.p.displayName}</p>
                  <p className="text-xs zego-text-tertiary">
                    กลับ {formatDate(g.p.endDate)} · {g.readiness.checks.map((c) => `${c.label} ${c.text}`).join(' · ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon="calendar"
                  disabled={!g.leaderId}
                  title={g.leaderId ? undefined : 'กรุ๊ปนี้ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม'}
                  onClick={() => { setEditingId(null); setPresetDate(undefined); setPresetGroup({ jobId: g.periodId, leaderId: g.leaderId }); setFormOpen(true); }}
                >
                  นัดหมาย
                </Button>
              </li>
            ))}
          </ul>
          {readyGroups.length > READY_PREVIEW && (
            <button type="button" className="mt-2 text-xs font-medium zego-text-info hover:underline" onClick={() => setShowAllReady((v) => !v)}>
              {showAllReady ? 'แสดงน้อยลง' : `แสดงทั้งหมด ${readyGroups.length} กรุ๊ป`}
            </button>
          )}
        </Card>
      )}

      {overlapIds.size > 0 && (
        <div className="mb-5">
          <Callout tone="amber" title={`พบนัดหมายที่เวลาซ้อนกัน ${overlapIds.size} รายการ`}>
            {Array.from(overlapIds).join(', ')} — ควรตรวจสอบและเลื่อนนัด
          </Callout>
        </div>
      )}

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <SelectInput
            label="ประเภทนัด"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | AppointmentKind)}
            options={[
              { value: 'all', label: 'ทุกประเภท' },
              ...APPOINTMENT_KIND_OPTIONS.map((k) => ({ value: k, label: APPOINTMENT_KIND[k].label })),
            ]}
          />
          <SelectInput
            label="สถานะ"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | AppointmentStatus)}
            options={[
              { value: 'all', label: 'ทุกสถานะ' },
              ...(
                ['pending', 'confirmed', 'rescheduled', 'attended', 'cancelled'] as AppointmentStatus[]
              ).map((s) => ({ value: s, label: APPOINTMENT_STATUS[s].label })),
            ]}
          />
          <SelectInput
            label="หัวหน้าทัวร์"
            value={leaderFilter}
            onChange={(e) => setLeaderFilter(e.target.value)}
            options={[
              { value: 'all', label: 'ทุกคน' },
              ...leaders.map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` })),
            ]}
          />
          <div className="flex justify-end">
            <SegmentedControl
              label="เลือกมุมมอง"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'รายการ' },
                { value: 'calendar', label: 'ปฏิทิน' },
              ]}
            />
          </div>
        </div>
      </Card>

      {view === 'list' ? (
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              icon="clock"
              title="ไม่มีนัดหมายตามเงื่อนไขที่เลือก"
              description="ลองเปลี่ยนตัวกรอง หรือกดปุ่ม “สร้างนัดหมาย”"
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((appointment) => (
                <li key={appointment.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(appointment.id)}
                    className={cx(
                      'flex w-full flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                      overlapIds.has(appointment.id)
                        ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                        : 'zego-border-color zego-hover-surface',
                    )}
                  >
                    <div className="w-24 shrink-0 text-center">
                      <p className="zego-text text-sm font-bold">
                        {formatDate(appointment.date)}
                      </p>
                      <p className="zego-text-tertiary text-xs">{appointment.time}</p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="zego-text flex items-center gap-1.5 font-medium">
                        {leaderName(appointment.leaderId)}
                        {overlapIds.has(appointment.id) && (
                          <span title="เวลาซ้อน" className="text-amber-600">
                            <Icon name="warning" className="h-4 w-4" />
                          </span>
                        )}
                      </p>
                      <p className="zego-text-tertiary truncate text-xs">
                        {appointment.id} · {groupOf(appointment)} · {appointment.location}
                      </p>
                    </div>

                    <StatusBadge meta={APPOINTMENT_KIND[appointment.kind ?? 'other']} size="sm" dot={false} />
                    <StatusBadge meta={APPOINTMENT_MODE[appointment.mode]} size="sm" dot={false} />
                    <StatusBadge meta={appointmentStatusMeta(appointment)} size="sm" />
                    {appointment.requestedByLeader && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">หัวหน้าทัวร์ขอนัด</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="zego-divider-bottom flex items-center gap-2 px-4 py-3">
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
            <h2 className="zego-text ml-1 text-base font-semibold">
              {monthTitle(cursor.year, cursor.month)}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[42rem]">
              <div className="zego-border-color zego-surface-soft-bg grid grid-cols-7 border-b">
                {TH_WEEKDAYS_SHORT.map((d) => (
                  <div
                    key={d}
                    className="zego-border-color zego-text-tertiary border-r px-2 py-2 text-center text-xs font-semibold last:border-r-0"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="zego-border-color grid grid-cols-7 border-l">
                {grid.map((cell) => {
                  const list = byDate.get(cell.date) ?? [];
                  return (
                    <div
                      key={cell.date}
                      className={cx(
                        'zego-border-color flex min-h-24 flex-col gap-1 border-b border-r p-1.5',
                        cell.inMonth ? 'zego-surface-bg' : 'zego-surface-soft-bg',
                      )}
                    >
                      <div className="group flex items-center justify-between">
                        <span
                          className={cx(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                            cell.isToday ? 'zego-today-badge font-bold' : cell.inMonth ? 'zego-text-secondary' : 'zego-text-disabled',
                          )}
                        >
                          {parseDate(cell.date).getDate()}
                        </span>
                        {can(currentUser.role, 'appointment.create') && (
                          <button
                            type="button"
                            title="สร้างนัดวันนี้"
                            aria-label={`สร้างนัดวันที่ ${formatDate(cell.date)}`}
                            onClick={() => { setEditingId(null); setPresetDate(cell.date); setFormOpen(true); }}
                            className="rounded p-0.5 zego-text-tertiary opacity-0 transition hover:text-emerald-700 focus:opacity-100 group-hover:opacity-100"
                          >
                            <Icon name="plus" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {/* สรุปของวัน — จำนวนกรุ๊ปที่นัดมา · กดดูรายละเอียดการนัด */}
                      {list.length > 0 && (() => {
                        const groups = new Set(list.filter((a) => a.jobId).map((a) => a.jobId)).size;
                        const noGroup = list.filter((a) => !a.jobId).length;
                        const waiting = list.filter((a) => a.status === 'pending').length;
                        const asking = list.filter((a) => a.status === 'rescheduled').length;
                        return (
                          <button
                            type="button"
                            onClick={() => setDayOpen(cell.date)}
                            title={`ดูการนัด ${list.length} รายการ`}
                            className="flex w-full flex-1 flex-col items-start justify-center gap-0.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-left transition hover:bg-emerald-100"
                          >
                            <span className="text-base font-bold leading-none text-emerald-800">
                              {groups > 0 ? groups : list.length} <span className="text-[11px] font-medium">{groups > 0 ? 'กรุ๊ป' : 'นัด'}</span>
                            </span>
                            {groups > 0 && noGroup > 0 && <span className="text-[10px] text-emerald-700">+ นัดอื่น {noGroup}</span>}
                            {(waiting > 0 || asking > 0) && (
                              <span className="flex flex-wrap gap-x-1.5 text-[10px] font-medium">
                                {waiting > 0 && <span className="text-amber-700">รอยืนยัน {waiting}</span>}
                                {asking > 0 && <span className="text-violet-700">ขอเลื่อน {asking}</span>}
                              </span>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* รายละเอียดการนัดของวันที่เลือก (จากปฏิทิน) */}
      {dayOpen && (() => {
        const list = (byDate.get(dayOpen) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
        const groups = new Set(list.filter((a) => a.jobId).map((a) => a.jobId)).size;
        const endTime = (t: string, m: number) => {
          const [h, mm] = t.split(':').map(Number);
          const total = h * 60 + mm + m;
          return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        };
        return (
          <Drawer
            open
            onClose={() => setDayOpen(null)}
            title={`นัดหมายวันที่ ${formatDate(dayOpen)}`}
            description={`${groups} กรุ๊ป · ${list.length} นัด`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setDayOpen(null)}>ปิด</Button>
                {can(currentUser.role, 'appointment.create') && (
                  <Button variant="primary" icon="plus" onClick={() => { setPresetDate(dayOpen); setEditingId(null); setDayOpen(null); setFormOpen(true); }}>
                    สร้างนัดวันนี้
                  </Button>
                )}
              </>
            }
          >
            {list.length === 0 ? (
              <EmptyState icon="clock" title="ไม่มีนัดในวันนี้" />
            ) : (
              <ul className="space-y-3">
                {list.map((a) => {
                  const p = a.jobId ? getTourPeriodById(a.jobId) : null;
                  const made = a.history[0];
                  return (
                    <li key={a.id} className={cx('rounded-xl border p-3', overlapIds.has(a.id) ? 'border-amber-300 bg-amber-50/40' : 'zego-border-color')}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold tabular-nums zego-text">{a.time}–{endTime(a.time, a.durationMinutes)} น.</p>
                          <p className="text-xs zego-text-tertiary">{a.id} · {a.durationMinutes} นาที</p>
                        </div>
                        <span className="flex flex-wrap gap-1.5">
                          <StatusBadge meta={APPOINTMENT_KIND[a.kind ?? 'other']} size="sm" dot={false} />
                          <StatusBadge meta={appointmentStatusMeta(a)} size="sm" />
                          {a.requestedByLeader && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">หัวหน้าทัวร์ขอนัด</span>}
                        </span>
                      </div>
                      <dl className="mt-2 space-y-1 text-sm">
                        <Row label="กรุ๊ป" value={p ? <><span className="font-semibold zego-text">{p.groupCode}</span><span className="block text-xs zego-text-tertiary">{p.displayName}</span></> : groupOf(a)} />
                        <Row label="หัวหน้าทัวร์" value={leaderName(a.leaderId)} />
                        <Row label="รูปแบบ / สถานที่" value={`${APPOINTMENT_MODE[a.mode].label} · ${a.location}`} />
                        <Row label="เจ้าหน้าที่" value={a.staffName} />
                        {made && <Row label="ทำนัดโดย" value={`${made.by} · ${formatDate(made.at.slice(0, 10))} ${made.at.slice(11, 16)}`} />}
                        {a.note && <Row label="หมายเหตุ" value={a.note} />}
                      </dl>
                      {a.status === 'rescheduled' && (
                        <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-800">หัวหน้าทัวร์ขอเลื่อน: {a.leaderNote || 'ไม่ได้ระบุ'}</p>
                      )}
                      {overlapIds.has(a.id) && <p className="mt-2 text-xs zego-text-warning">เวลาซ้อนกับนัดอื่น</p>}
                      <div className="mt-2 flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => { setDayOpen(null); setSelectedId(a.id); }}>จัดการนัด</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Drawer>
        );
      })()}

      {/* Drawer รายละเอียดนัดหมาย */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected ? `นัดหมาย ${selected.id}` : ''}
        description={
          selected
            ? `${formatDate(selected.date)} ${selected.time} (${selected.durationMinutes} นาที)`
            : undefined
        }
        footer={
          selected && (
            <>
              <Button variant="secondary" onClick={() => setSelectedId(null)} disabled={saving}>
                ปิด
              </Button>

              {canManage && selected.status !== 'attended' && selected.status !== 'cancelled' && (
                <>
                  <Button variant="ghost" onClick={() => setCancelOpen(true)} disabled={saving}>
                    ยกเลิกนัด
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNewDate(selected.date);
                      setNewTime(selected.time);
                      setRescheduleNote('');
                      setRescheduleOpen(true);
                    }}
                    disabled={saving}
                  >
                    เลื่อนนัด
                  </Button>
                  {selected.status === 'pending' && (
                    <Button
                      variant="primary"
                      onClick={async () => {
                        await changeAppointmentStatus(selected.id, 'confirmed', 'ยืนยันนัดหมาย');
                        setSelectedId(null);
                      }}
                      disabled={saving}
                    >
                      ยืนยันนัด
                    </Button>
                  )}
                  {selected.status === 'confirmed' && (
                    <Button
                      variant="success"
                      onClick={async () => {
                        await changeAppointmentStatus(selected.id, 'attended', 'เข้าพบเรียบร้อย');
                        setSelectedId(null);
                      }}
                      disabled={saving}
                    >
                      บันทึกว่าเข้าพบแล้ว
                    </Button>
                  )}
                </>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge meta={appointmentStatusMeta(selected)} />
              <StatusBadge meta={APPOINTMENT_KIND[selected.kind ?? 'other']} dot={false} />
              <StatusBadge meta={APPOINTMENT_MODE[selected.mode]} dot={false} />
              {overlapIds.has(selected.id) && (
                <span className="zego-badge--warning inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium">
                  <Icon name="warning" className="h-3.5 w-3.5" />
                  เวลาซ้อนกับนัดอื่น
                </span>
              )}
            </div>

            <dl className="space-y-2.5 text-sm">
              <Row label="หัวหน้าทัวร์" value={leaderName(selected.leaderId)} />
              <Row label="กรุ๊ป" value={groupOf(selected)} />
              <Row label="เจ้าหน้าที่" value={selected.staffName} />
              <Row label="สถานที่ / ลิงก์" value={selected.location} />
              <Row label="ระยะเวลา" value={`${selected.durationMinutes} นาที`} />
            </dl>

            {selected.status === 'rescheduled' && (
              <Callout tone="amber" title="หัวหน้าทัวร์ขอเลื่อนนัด">
                {selected.leaderNote || 'ไม่ได้ระบุวันเวลาที่สะดวก'} — กด “เลื่อนนัด” เพื่อนัดวันเวลาใหม่
              </Callout>
            )}
            {selected.kind === 'clear' && (
              <Link href="/settlements" className="block text-sm font-medium zego-text-info hover:underline">ไปที่เคลียร์เงินกรุ๊ป →</Link>
            )}

            {selected.note && (
              <div className="zego-surface-soft-bg rounded-lg px-4 py-3">
                <p className="zego-text-tertiary text-xs font-semibold">หมายเหตุ</p>
                <p className="zego-text-secondary mt-1 text-sm">{selected.note}</p>
              </div>
            )}

            <div>
              <h3 className="zego-text mb-3 text-sm font-semibold">ประวัตินัดหมาย</h3>
              <Timeline
                events={selected.history}
                resolve={(key) =>
                  APPOINTMENT_STATUS[key as AppointmentStatus] ?? { label: key, tone: 'slate' }
                }
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* เลื่อนนัด */}
      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        size="sm"
        title="เลื่อนนัดหมาย"
        description={selected?.id}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitReschedule} loading={saving}>
              บันทึกการเลื่อนนัด
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="วันที่ใหม่"
              required
              value={newDate}
              onChange={(v) => setNewDate(v)}
            />
            {/* ช่องเวลาห่างกัน 30 นาที — บอกช่องที่มีนัดแล้ว (ไม่นับนัดนี้เอง) */}
            <SelectInput
              label="เวลาใหม่"
              required
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              options={slotOptions(appointments, newDate, selected?.durationMinutes ?? 30, selected?.id, newTime).map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <TextArea
            label="เหตุผลการเลื่อน"
            rows={3}
            value={rescheduleNote}
            onChange={(e) => setRescheduleNote(e.target.value)}
            hint="เว้นว่างได้ ระบบจะบันทึกวันเดิม–วันใหม่ให้อัตโนมัติ"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          if (!selected) return;
          setCancelOpen(false);
          await changeAppointmentStatus(selected.id, 'cancelled', 'ยกเลิกนัดหมาย');
          setSelectedId(null);
        }}
        loading={saving}
        tone="danger"
        title="ยืนยันการยกเลิกนัดหมาย"
        confirmLabel="ยกเลิกนัดหมาย"
        message={
          selected
            ? `ต้องการยกเลิกนัดหมาย ${selected.id} วันที่ ${formatDate(selected.date)} ${selected.time} ใช่หรือไม่? ข้อมูลจะยังคงอยู่ในระบบและบันทึกในประวัติ`
            : ''
        }
      />

      <AppointmentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
          setPresetGroup(null);
        }}
        appointment={editing}
        presetDate={presetDate}
        presetJobId={presetGroup?.jobId}
        presetLeaderId={presetGroup?.leaderId}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="zego-text-tertiary w-32 shrink-0">{label}</dt>
      <dd className="zego-text-secondary min-w-0 flex-1">{value}</dd>
    </div>
  );
}
