'use client';

/** หน้านัดหมาย — มุมมองรายการและปฏิทิน สร้าง ยืนยัน เลื่อน หรือยกเลิกนัด */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { APPOINTMENT_MODE, APPOINTMENT_STATUS } from '@/lib/labels';
import { TONE_ZEGO_COLOR } from '@/lib/tone-tokens';
import { buildMonthGrid, monthTitle, shiftMonth } from '@/lib/logic/calendar';
import { hasTimeOverlap } from '@/lib/logic/conflicts';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT } from '@/lib/format';
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
import { TimeField } from '@/components/ui/TimeInput';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ConfirmDialog, Drawer, Modal } from '@/components/ui/Modal';
import { Timeline } from '@/components/ui/Timeline';
import { Icon } from '@/components/ui/Icon';
import { AppointmentFormModal } from '@/components/appointments/AppointmentFormModal';
import type { Appointment, AppointmentStatus } from '@/types';

export default function AppointmentsPage() {
  const { appointments, leaders, jobs, today, currentUser, changeAppointmentStatus, saving } =
    useDemo();

  const todayDate = parseDate(today);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [cursor, setCursor] = useState({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  });
  const [status, setStatus] = useState<'all' | AppointmentStatus>('all');
  const [leaderFilter, setLeaderFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          return true;
        })
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [scoped, status, leaderFilter],
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

  const upcoming = scoped.filter(
    (a) => a.date >= today && (a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'),
  );
  const pending = scoped.filter((a) => a.status === 'pending');
  const attended = scoped.filter((a) => a.status === 'attended');

  const canManage = can(currentUser.role, 'appointment.manage');

  const submitReschedule = async () => {
    if (!selected || !newDate || !newTime) return;
    setRescheduleOpen(false);
    await changeAppointmentStatus(
      selected.id,
      'rescheduled',
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
        description="นัดหมายเข้าพบ ประชุมออนไลน์ หรือส่งเอกสารกับฝ่ายบัญชี"
        actions={
          can(currentUser.role, 'appointment.create') && (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              สร้างนัดหมาย
            </Button>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="นัดหมายที่จะถึง" value={upcoming.length} tone="blue" hint="ตั้งแต่วันนี้เป็นต้นไป" />
        <StatCard
          label="รอยืนยัน"
          value={pending.length}
          tone={pending.length > 0 ? 'amber' : 'slate'}
          hint="รอหัวหน้าทัวร์ตอบรับ"
        />
        <StatCard
          label="เวลาซ้อน"
          value={overlapIds.size}
          tone={overlapIds.size > 0 ? 'red' : 'green'}
          hint="นัดหมายที่ชนกัน"
        />
        <StatCard label="เข้าพบแล้ว" value={attended.length} tone="green" hint="เสร็จสิ้นแล้ว" />
      </div>

      {overlapIds.size > 0 && (
        <div className="mb-5">
          <Callout tone="amber" title={`พบนัดหมายที่เวลาซ้อนกัน ${overlapIds.size} รายการ`}>
            {Array.from(overlapIds).join(', ')} — ควรตรวจสอบและเลื่อนนัด
          </Callout>
        </div>
      )}

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
                        {appointment.id} · {appointment.jobId} · {appointment.location}
                      </p>
                    </div>

                    <StatusBadge meta={APPOINTMENT_MODE[appointment.mode]} size="sm" dot={false} />
                    <StatusBadge meta={APPOINTMENT_STATUS[appointment.status]} size="sm" />
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
                      <span
                        className={cx(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          cell.isToday
                            ? 'zego-today-badge font-bold'
                            : cell.inMonth
                              ? 'zego-text-secondary'
                              : 'zego-text-disabled',
                        )}
                      >
                        {parseDate(cell.date).getDate()}
                      </span>
                      {list.map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => setSelectedId(appointment.id)}
                          title={`${appointment.time} — ${leaderName(appointment.leaderId)}`}
                          className="zego-surface-soft-bg zego-text-secondary flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:brightness-95"
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: TONE_ZEGO_COLOR[APPOINTMENT_STATUS[appointment.status].tone],
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {appointment.time} {leaderName(appointment.leaderId).split(' ')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

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
                  {selected.status !== 'confirmed' && (
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
              <StatusBadge meta={APPOINTMENT_STATUS[selected.status]} />
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
              <Row
                label="งานทัวร์"
                value={`${selected.jobId} — ${
                  jobs.find((j) => j.id === selected.jobId)?.title ?? '—'
                }`}
              />
              <Row label="เจ้าหน้าที่" value={selected.staffName} />
              <Row label="สถานที่ / ลิงก์" value={selected.location} />
              <Row label="ระยะเวลา" value={`${selected.durationMinutes} นาที`} />
            </dl>

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
            <TimeField
              label="เวลาใหม่"
              required
              value={newTime}
              onChange={(v) => setNewTime(v)}
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
        }}
        appointment={editing}
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
