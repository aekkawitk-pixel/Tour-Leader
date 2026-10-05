'use client';

/**
 * แท็บ "วันลาและช่วงไม่พร้อม" — บันทึกวัน/เวลา/ช่วงที่รับงานไม่ได้เท่านั้น
 *   • สลับมุมมอง ปฏิทิน (เดือน/สัปดาห์/วัน) ↔ รายการ (มีตัวกรอง)
 *   • ปุ่มเดียว: "เพิ่มวันลา/ช่วงไม่พร้อม"
 * ใช้ข้อมูลชุดเดียวกับทั้งระบบ (records → engine ตรวจมอบหมาย)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { toISODate } from '@/lib/format';
import {
  AVAILABILITY_APPROVAL,
  AVAILABILITY_TYPE,
  AVAILABILITY_TYPE_ORDER,
  formatRecordSchedule,
  isActiveOn,
  recordsForLeader,
  recordTypeLabel,
} from '@/lib/logic/availabilityStatus';
import { Button, Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { SelectInput } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/Modal';
import { RowMenu } from '@/components/leaders/reorderControls';
import { AvailabilityFormModal } from '@/components/leaders/AvailabilityFormModal';
import { AvailabilityCalendar } from '@/components/leaders/AvailabilityCalendar';
import { useWideContent } from '@/components/layout/AppShell';
import type { LeaderAvailabilityRecord, TourLeader } from '@/types';

export function LeaderLeaveTab({ leader }: { leader: TourLeader }) {
  const { availabilityRecords, currentUser, setAvailabilityApproval, saving } = useDemo();
  // วันจริง (ไม่ใช่วันจำลองของ Demo) — ปฏิทินเปิดที่เดือนปัจจุบัน · กำลังมีผล/กำลังจะถึงนับจากวันนี้จริง
  const today = toISODate(new Date());
  const canApprove = can(currentUser.role, 'leader.changeStatus');

  // ปฏิทิน/รายการวันลาต้องใช้พื้นที่กว้าง — ขยายเนื้อหาเต็มจอตลอดที่อยู่แท็บนี้
  useWideContent();

  const [mode, setMode] = useState<'calendar' | 'list'>('calendar');
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<LeaderAvailabilityRecord | null>(null);
  const [formInitial, setFormInitial] = useState<{ start: string; end: string; allDay: boolean } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaderAvailabilityRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaderAvailabilityRecord | null>(null);

  const records = recordsForLeader(availabilityRecords, leader.id);
  const calendarRecords = records.filter((r) => r.approval !== 'cancelled' && r.approval !== 'rejected');

  const openAdd = (start = today, end = today, allDay = true) => {
    setEditRecord(null);
    setFormInitial({ start, end, allDay });
    setFormOpen(true);
  };
  const openEdit = (r: LeaderAvailabilityRecord) => {
    setEditRecord(r);
    setFormInitial(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* หัว: ปุ่มเดียว "เพิ่ม" + สลับมุมมอง */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="มุมมองวันลา"
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: 'calendar', label: 'ปฏิทิน' },
            { value: 'list', label: 'รายการ' },
          ]}
        />
        <Button variant="primary" size="sm" icon="plus" onClick={() => openAdd()}>
          เพิ่มวันลา/ช่วงไม่พร้อม
        </Button>
      </div>

      {mode === 'calendar' ? (
        // ลด padding ภายในการ์ดปฏิทิน (8px มือถือ / 12px จอใหญ่) เพื่อให้ตารางกว้างเต็มการ์ด
        <Card padded={false} className="p-2 sm:p-3">
          <AvailabilityCalendar
            records={calendarRecords}
            today={today}
            onAddRange={(s, e) => openAdd(s, e, true)}
            onEditRecord={openEdit}
          />
        </Card>
      ) : (
        <Card>
          <RecordsList
            records={records}
            today={today}
            canApprove={canApprove}
            onEdit={openEdit}
            onApprove={(r) => setAvailabilityApproval(r.id, 'approved')}
            onReject={(r) => setRejectTarget(r)}
            onCancel={(r) => setCancelTarget(r)}
            onAdd={() => openAdd()}
          />
        </Card>
      )}

      <AvailabilityFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        leader={leader}
        record={editRecord}
        currentUserRole={currentUser.role}
        currentUserName={currentUser.name}
        initialStartDate={formInitial?.start}
        initialEndDate={formInitial?.end}
        initialAllDay={formInitial?.allDay}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={async () => {
          if (rejectTarget) await setAvailabilityApproval(rejectTarget.id, 'rejected', 'ผู้จัดปฏิเสธคำขอ');
          setRejectTarget(null);
        }}
        loading={saving}
        tone="danger"
        title="ปฏิเสธคำขอวันลา"
        confirmLabel="ยืนยันปฏิเสธ"
        message={rejectTarget ? `ปฏิเสธคำขอ ${rejectTarget.id} (${recordTypeLabel(rejectTarget)})? บันทึกเหตุผลไว้ในประวัติ` : ''}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (cancelTarget) await setAvailabilityApproval(cancelTarget.id, 'cancelled', 'ยกเลิกรายการ');
          setCancelTarget(null);
        }}
        loading={saving}
        tone="danger"
        title="ยกเลิกรายการ"
        confirmLabel="ยืนยันยกเลิก"
        message={cancelTarget ? `ยกเลิกรายการ ${cancelTarget.id}? จะไม่ถูกนำไปตรวจการมอบหมาย แต่ยังเก็บไว้ในประวัติ` : ''}
      />
    </div>
  );
}

/* --------------------------------- มุมมองรายการ + ตัวกรอง --------------------------------- */

type Timeframe = 'all' | 'active' | 'upcoming' | 'ended';

function RecordsList({
  records,
  today,
  canApprove,
  onEdit,
  onApprove,
  onReject,
  onCancel,
  onAdd,
}: {
  records: LeaderAvailabilityRecord[];
  today: string;
  canApprove: boolean;
  onEdit: (r: LeaderAvailabilityRecord) => void;
  onApprove: (r: LeaderAvailabilityRecord) => void;
  onReject: (r: LeaderAvailabilityRecord) => void;
  onCancel: (r: LeaderAvailabilityRecord) => void;
  onAdd: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('all');

  const filtered = records.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (statusFilter !== 'all' && r.approval !== statusFilter) return false;
    if (timeframe === 'active' && !isActiveOn(r, today)) return false;
    if (timeframe === 'upcoming' && !(r.startDate > today)) return false;
    if (timeframe === 'ended' && !(r.endDate < today)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <SelectInput
          label="ประเภท"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: 'all', label: 'ทุกประเภท' }, ...AVAILABILITY_TYPE_ORDER.map((t) => ({ value: t, label: AVAILABILITY_TYPE[t].label }))]}
        />
        <SelectInput
          label="สถานะ"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'ทุกสถานะ' },
            { value: 'pending', label: 'รออนุมัติ' },
            { value: 'approved', label: 'อนุมัติแล้ว' },
            { value: 'rejected', label: 'ปฏิเสธ' },
            { value: 'cancelled', label: 'ยกเลิก' },
          ]}
        />
        <SelectInput
          label="ช่วงเวลา"
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as Timeframe)}
          options={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'active', label: 'กำลังมีผล' },
            { value: 'upcoming', label: 'กำลังจะถึง' },
            { value: 'ended', label: 'สิ้นสุดแล้ว' },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed zego-border-color px-4 py-10 text-center text-sm zego-text-tertiary">
          {records.length === 0 ? (
            <>
              ยังไม่มีวันลาหรือช่วงไม่พร้อม —{' '}
              <button type="button" onClick={onAdd} className="font-medium zego-text-info hover:underline">
                เพิ่มรายการ
              </button>
            </>
          ) : (
            'ไม่มีรายการตามตัวกรอง'
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((r) => {
            const ended = r.endDate < today;
            const approvalMeta =
              ended && r.approval === 'approved' ? { label: 'สิ้นสุดแล้ว', tone: 'slate' as const } : AVAILABILITY_APPROVAL[r.approval];
            const menuItems = [
              { label: 'แก้ไข', onClick: () => onEdit(r), disabled: r.approval === 'cancelled' },
              ...(canApprove && r.approval === 'pending'
                ? [
                    { label: 'อนุมัติ', onClick: () => onApprove(r) },
                    { label: 'ปฏิเสธ', onClick: () => onReject(r), danger: true },
                  ]
                : []),
              {
                label: 'ยกเลิกรายการ',
                onClick: () => onCancel(r),
                danger: true,
                disabled: r.approval === 'cancelled' || r.approval === 'rejected',
              },
            ];
            return (
              <li key={r.id} className={cx('rounded-xl border zego-border-color p-3')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge meta={{ label: recordTypeLabel(r), tone: AVAILABILITY_TYPE[r.type].tone }} size="sm" dot={false} />
                      <StatusBadge meta={approvalMeta} size="sm" />
                      <span className="text-[11px] zego-text-tertiary">{r.blocksAssignment ? 'ปิดรับงาน' : 'ไม่ปิดรับงาน'}</span>
                      {isActiveOn(r, today) && r.approval === 'approved' && (
                        <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium zego-badge--warning">
                          กำลังมีผล
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm zego-text-secondary">{formatRecordSchedule(r)}</p>
                    <p className="text-xs zego-text-tertiary">เหตุผล: {r.reason || '—'}</p>
                    <p className="mt-0.5 text-xs zego-text-tertiary">{r.id} · บันทึกโดย {r.createdBy}</p>
                  </div>
                  <RowMenu items={menuItems} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
