'use client';

/**
 * นัดหมาย — /guide/settlement/appointments (พอร์ทัลหัวหน้าทัวร์ · เมนู "นัดหมาย" แถบล่าง)
 *
 * นัดทุกประเภทที่เจ้าหน้าที่นัดหัวหน้าทัวร์คนนี้ (ชุดนัดหมายกลาง — เดียวกับปฏิทินเมนูนัดหมายฝั่งผู้จัด)
 *   เคลียร์เงินกรุ๊ป: การเงินนัดหลังตรวจใบเสร็จ/ใบเบิกครบ — บอกเงินที่ต้องนำมาคืน (แยกสกุล)
 *   ส่งเอกสาร / ประชุม / อื่น ๆ
 * หัวหน้าทัวร์: สร้างนัดเคลียร์เงิน (เลือกกรุ๊ป — NewAppointmentModal) · ยืนยันนัด · เลื่อนนัด (เลือกจากช่องที่บัญชีว่าง) → รอการเงินยืนยันเวลาใหม่
 * ด้านบนเป็นปฏิทินรายเดือน (AppointmentCalendar) — วันที่มีนัดมีจุดสี · แตะวัน = ดูเฉพาะนัดวันนั้น
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { APPOINTMENT_KIND, APPOINTMENT_MODE, appointmentStatusMeta } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { loadGroupClears } from '@/services/groupClearStore';
import { summarizeGroupClear } from '@/lib/logic/groupClear';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/FormField';
import { FreeSlotPicker, isFreeChoice, useBookableDays } from '@/components/appointments/FreeSlotPicker';
import type { Appointment } from '@/types';
import { AppointmentCalendar } from './AppointmentCalendar';
import { NewAppointmentModal } from './NewAppointmentModal';

export default function GuideSettlementAppointmentsPage() {
  const { currentUser, envelopes, expenses, appointments, changeAppointmentStatus, saving } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());
  /** นัดที่กำลังเลื่อน */
  const [asking, setAsking] = useState<Appointment | null>(null);
  /** สร้างนัดหมายใหม่ (เลือกกรุ๊ป → นัดเคลียร์เงิน) */
  const [creating, setCreating] = useState(false);

  // นัดของฉัน — นัดที่ยังมีผลก่อน (เรียงตามวันเวลา) แล้วตามด้วยที่เข้าพบแล้ว/ยกเลิก
  const mine = useMemo(() => appointments
    .filter((a) => a.leaderId === leaderId)
    .sort((a, b) => {
      const done = (x: Appointment) => (x.status === 'attended' || x.status === 'cancelled' ? 1 : 0);
      return done(a) - done(b) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
    }), [appointments, leaderId]);

  /*
    ปฏิทิน — เดือนที่ดู (เริ่มที่เดือนนี้) + วันที่เลือก (null = ทั้งเดือน)
    รายการด้านล่างแสดงเฉพาะนัดของวัน/เดือนที่เลือก
  */
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const shown = mine.filter((a) => (day ? a.date === day : a.date.startsWith(month)));
  // นัดถัดไปที่ยังมีผล (นอกเดือนที่ดูอยู่) — ไว้พาไปดูเมื่อเดือนนี้ไม่มีนัด
  const nextApt = mine.find((a) => a.date >= today && a.status !== 'cancelled' && a.status !== 'attended');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold zego-text">นัดหมาย</h1>
          <p className="text-sm zego-text-secondary">นัดเคลียร์เงินกับบัญชี — สร้างนัด ยืนยันนัด หรือเลื่อนนัด (เลือกเวลาที่บัญชีว่าง) ได้ที่นี่</p>
        </div>
        <Button variant="primary" size="sm" icon="plus" className="shrink-0" onClick={() => setCreating(true)}>สร้างนัดหมาย</Button>
      </div>

      <AppointmentCalendar month={month} onMonth={setMonth} selected={day} onSelect={setDay} appointments={mine} today={today} />

      <p className="px-1 text-xs font-semibold zego-text-secondary">
        {day ? `นัดวันที่ ${formatDate(day)}` : 'นัดในเดือนนี้'} <span className="font-normal zego-text-tertiary">({shown.length})</span>
      </p>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title={mine.length === 0 ? 'ยังไม่มีนัดหมาย' : day ? 'ไม่มีนัดในวันนี้' : 'ไม่มีนัดในเดือนนี้'}
            description={mine.length === 0 ? 'กด "สร้างนัดหมาย" เพื่อนัดเคลียร์เงินกรุ๊ปที่จบทริปแล้ว · นัดจากการเงินจะขึ้นที่นี่ด้วย' : undefined}
          />
          <div className="mt-2 space-y-1 text-center">
            {nextApt && !nextApt.date.startsWith(month) && (
              <button
                type="button"
                onClick={() => { setMonth(nextApt.date.slice(0, 7)); setDay(nextApt.date); }}
                className="block w-full text-sm font-medium zego-text-info hover:underline"
              >
                นัดถัดไป {formatDate(nextApt.date)} {nextApt.time} น. →
              </button>
            )}
          </div>
        </Card>
      ) : shown.map((a) => {
        const p = a.jobId ? getTourPeriodById(a.jobId) : null;
        // นัดเคลียร์เงิน — เงินที่ต้องนำมาคืน (คำนวณสดเหมือนฝั่งการเงิน)
        const toReturn = a.kind === 'clear' && p
          ? summarizeGroupClear({ periodId: a.jobId, startDate: p.startDate, endDate: p.endDate, today, envelopes, expenses, closed: !!loadGroupClears()[a.jobId]?.closedAt }).balance.filter((b) => b.remaining > 0)
          : null;
        const open = a.status === 'pending' || a.status === 'confirmed';
        // คุณขอนัดเอง และการเงินยังไม่ยืนยัน — ไม่มีปุ่มให้ยืนยันนัดของตัวเอง
        const waitingFinance = !!a.requestedByLeader && a.status === 'pending';
        return (
          <Card key={a.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <StatusBadge meta={APPOINTMENT_KIND[a.kind ?? 'other']} size="sm" dot={false} />
                <p className="mt-1 text-sm font-semibold zego-text">{p?.groupCode ?? (a.jobId ? periodCodeOf(a.jobId) : 'ไม่ผูกกรุ๊ป')}</p>
                {p && <p className="truncate text-xs zego-text-secondary">{p.displayName} · {formatDateRange(p.startDate, p.endDate)}</p>}
              </div>
              <StatusBadge meta={appointmentStatusMeta(a)} size="sm" />
            </div>

            <div className="rounded-lg zego-surface-soft-bg px-3 py-2.5 text-sm">
              <p className="font-semibold zego-text">{formatDate(a.date)} · {a.time} น. <span className="font-normal zego-text-tertiary">({a.durationMinutes} นาที)</span></p>
              <p className="zego-text-secondary">{APPOINTMENT_MODE[a.mode].label} · {a.location}</p>
              <p className="text-xs zego-text-tertiary">{a.requestedByLeader ? 'คุณขอนัดกับ' : 'ผู้นัด'} {a.staffName}{a.note ? ` · ${a.note}` : ''}</p>
            </div>

            {toReturn && open && (
              <div className="text-xs">
                <p className="mb-1 font-semibold zego-text-secondary">เงินที่ต้องนำมาคืน</p>
                {toReturn.length > 0
                  ? <p className="text-sm font-semibold tabular-nums zego-text-danger">{toReturn.map((b) => formatCurrency(b.remaining, b.currency)).join(' · ')}</p>
                  : <p className="zego-text-tertiary">ไม่มี</p>}
              </div>
            )}

            {waitingFinance && (
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">คุณส่งคำขอนัดนี้แล้ว — รอการเงินยืนยัน หรือเสนอเวลาใหม่</p>
            )}

            {a.status === 'rescheduled' && (
              <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">ส่งคำขอเลื่อนแล้ว — รอเจ้าหน้าที่นัดใหม่{a.leaderNote ? ` · ${a.leaderNote}` : ''}</p>
            )}

            {open && !waitingFinance && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" className="justify-center" onClick={() => setAsking(a)}>เลื่อนนัด</Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="check"
                  className="justify-center"
                  loading={saving}
                  disabled={a.status === 'confirmed'}
                  onClick={() => void changeAppointmentStatus(a.id, 'confirmed', 'หัวหน้าทัวร์ยืนยันนัด')}
                >
                  {a.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ยืนยันนัด'}
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {asking && <RescheduleModal appointment={asking} onClose={() => setAsking(null)} />}
      {creating && <NewAppointmentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/**
 * หัวหน้าทัวร์เลื่อนนัด — เลือกวันเวลาใหม่จากช่องที่ฝ่ายบัญชีว่างเท่านั้น (ช่องเดิมของนัดนี้นับว่าว่าง)
 * บันทึกแล้วนัดย้ายไปเวลาใหม่ทันที สถานะกลับเป็นรอยืนยัน + requestedByLeader → ฝั่งการเงินกด "ยืนยันนัด" (หรือเลื่อนอีกครั้ง)
 */
function RescheduleModal({ appointment: a, onClose }: { appointment: Appointment; onClose: () => void }) {
  const { appointments, saveAppointment, currentUser, saving } = useDemo();
  const days = useBookableDays(appointments, a.durationMinutes, a.id);
  const first = days.find((d) => d.date !== a.date || d.free.some((t) => t !== a.time)) ?? days[0];
  const [date, setDate] = useState(() => first?.date ?? '');
  const [time, setTime] = useState(() => first?.free.find((t) => first.date !== a.date || t !== a.time) ?? '');
  const [reason, setReason] = useState('');
  // ต้องว่างจริง และไม่ใช่วันเวลาเดิม
  const valid = isFreeChoice(days, date, time) && !(date === a.date && time === a.time);

  const submit = async () => {
    const what = `หัวหน้าทัวร์เลื่อนนัดจาก ${formatDate(a.date)} ${a.time} เป็น ${formatDate(date)} ${time}${reason.trim() ? ` · ${reason.trim()}` : ''}`;
    await saveAppointment({
      ...a,
      date,
      time,
      status: 'pending',
      requestedByLeader: true,
      leaderNote: reason.trim() || undefined,
      history: [...a.history, makeStatusEvent(a.status, 'pending', currentUser.name, toISODateTime(new Date()), what)],
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="เลื่อนนัด"
      description={`${a.id} · นัดเดิม ${formatDate(a.date)} ${a.time} น.`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" icon="calendar" loading={saving} disabled={!valid} onClick={() => void submit()}>เลื่อนนัด</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <FreeSlotPicker days={days} date={date} time={time} duration={a.durationMinutes} onChange={(d, t) => { setDate(d); setTime(t); }} />
        <TextArea label="เหตุผล" optional rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs zego-text-tertiary">เลื่อนแล้วการเงินจะยืนยันเวลาใหม่ หรือเลื่อนอีกครั้งถ้าไม่สะดวก</p>
      </div>
    </Modal>
  );
}
