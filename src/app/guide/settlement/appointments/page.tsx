'use client';

/**
 * นัดหมายเคลียร์เงิน — /guide/settlement/appointments
 *
 * แสดงรายการรอเคลียร์ของตัวเอง + จองคิวนัดหมายกับ Finance ได้ในหน้าเดียว
 * (รวม Settlement Readiness + Appointment Booking ตามที่ตกลงกันไว้)
 *
 * ย้ายมาจาก /guide/settlement เดิม — ตอนนี้เป็นหัวข้อที่ 2 ของเมนู "เคลียร์เงิน" คู่กับ
 * "เคลียร์ค่าใช้จ่ายรายกรุ๊ป" (/guide/settlement/claim) ที่เพิ่มเข้ามาใหม่
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { SETTLEMENT_STATUS, APPOINTMENT_STATUS, APPOINTMENT_MODE } from '@/lib/labels';
import { formatDate, formatTHB } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { SettlementBackHeader } from '../SettlementBackHeader';
import type { Appointment, AppointmentMode, Settlement } from '@/types';

export default function GuideSettlementAppointmentsPage() {
  const {
    currentUser, settlements, appointments, jobs,
    saveAppointment, createAppointmentId, linkAppointmentToSettlement, today,
  } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const mySettlements = settlements
    .filter((s) => s.leaderId === leaderId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (mySettlements.length === 0) {
    return (
      <div className="space-y-4">
        <SettlementBackHeader title="นัดหมายเคลียร์เงิน" description="เตรียมเอกสารเคลียร์เงินและจองคิว Finance" />
        <Card>
          <EmptyState icon="money" title="ยังไม่มีรายการรอเคลียร์" description="รายการจะปรากฏที่นี่หลังงานทัวร์ของคุณจบและเข้าสถานะรอเคลียร์" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettlementBackHeader title="นัดหมายเคลียร์เงิน" description="เตรียมเอกสารเคลียร์เงินและจองคิว Finance" />

      {mySettlements.map((s) => (
        <SettlementCard
          key={s.id}
          settlement={s}
          jobTitle={jobs.find((j) => j.id === s.jobId)?.title ?? s.jobId}
          appointment={appointments.find((a) => a.id === s.appointmentId)}
          leaderId={leaderId!}
          actorName={currentUser.name}
          today={today}
          onBook={async (date, time, mode) => {
            const id = await createAppointmentId();
            const appt: Appointment = {
              id,
              date,
              time,
              durationMinutes: 30,
              leaderId: leaderId!,
              jobId: s.jobId,
              staffName: 'รอมอบหมาย',
              mode,
              location: mode === 'office' ? 'สำนักงานใหญ่ ชั้น 8' : mode === 'online' ? 'ลิงก์ประชุมจะแจ้งภายหลัง' : 'ส่งเอกสารทางไปรษณีย์',
              note: '',
              status: 'pending',
              history: [makeStatusEvent(null, 'pending', currentUser.name, today, 'จองจากพอร์ทัลหัวหน้าทัวร์')],
            };
            await saveAppointment(appt);
            await linkAppointmentToSettlement(s.id, id);
          }}
        />
      ))}
    </div>
  );
}

function SettlementCard({
  settlement, jobTitle, appointment, leaderId, actorName, today, onBook,
}: {
  settlement: Settlement;
  jobTitle: string;
  appointment: Appointment | undefined;
  leaderId: string;
  actorName: string;
  today: string;
  onBook: (date: string, time: string, mode: AppointmentMode) => Promise<void>;
}) {
  const [booking, setBooking] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState<AppointmentMode>('office');
  const [saving, setSaving] = useState(false);

  const approvedTotal = settlement.items.reduce((sum, i) => sum + i.approvedTHB, 0);
  const canBook = !settlement.appointmentId && settlement.status !== 'settled' && settlement.status !== 'closed';

  const submit = async () => {
    if (!date || !time) return;
    setSaving(true);
    try {
      await onBook(date, time, mode);
      setBooking(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padded={false}>
      <div className="zego-divider-bottom px-4 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold zego-text">{jobTitle}</p>
            <p className="text-xs zego-text-tertiary">{settlement.id} · กำหนด {formatDate(settlement.dueDate)}</p>
          </div>
          <StatusBadge meta={SETTLEMENT_STATUS[settlement.status]} size="sm" />
        </div>
      </div>

      <div className="px-4 py-3 text-sm zego-text-secondary">
        <div className="flex justify-between">
          <span>เงินทดรองที่ได้รับ</span>
          <span className="font-medium zego-text">{formatTHB(settlement.advanceTHB)}</span>
        </div>
        {settlement.items.length > 0 && (
          <div className="mt-1 flex justify-between">
            <span>ยอดที่ตรวจอนุมัติแล้ว ({settlement.items.length} รายการ)</span>
            <span className="font-medium zego-text">{formatTHB(approvedTotal)}</span>
          </div>
        )}
      </div>

      {appointment && (
        <div className="zego-divider-top px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide zego-text-tertiary">นัดหมาย</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-sm zego-text-secondary">
              {formatDate(appointment.date)} · {appointment.time} · {APPOINTMENT_MODE[appointment.mode].label}
            </p>
            <StatusBadge meta={APPOINTMENT_STATUS[appointment.status]} size="sm" />
          </div>
        </div>
      )}

      {canBook && !booking && (
        <div className="zego-divider-top px-4 py-3">
          <Button variant="primary" size="sm" icon="clock" className="w-full" onClick={() => setBooking(true)}>
            จองคิว Finance
          </Button>
        </div>
      )}

      {canBook && booking && (
        <div className="space-y-3 zego-divider-top px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <TextInput label="วันที่" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            <TextInput label="เวลา" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <SelectInput
            label="รูปแบบ"
            value={mode}
            onChange={(e) => setMode(e.target.value as AppointmentMode)}
            options={Object.entries(APPOINTMENT_MODE).map(([value, meta]) => ({ value, label: meta.label }))}
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setBooking(false)}>ยกเลิก</Button>
            <Button variant="primary" className="flex-1" disabled={!date || !time || saving} loading={saving} onClick={submit}>
              ยืนยันจอง
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
