'use client';

/**
 * นัดหมาย — /guide/settlement/appointments (พอร์ทัลหัวหน้าทัวร์ · เมนู "นัดหมาย" แถบล่าง)
 *
 * นัดทุกประเภทที่เจ้าหน้าที่นัดหัวหน้าทัวร์คนนี้ (ชุดนัดหมายกลาง — เดียวกับปฏิทินเมนูนัดหมายฝั่งผู้จัด)
 *   เคลียร์เงินกรุ๊ป: การเงินนัดหลังตรวจใบเสร็จ/ใบเบิกครบ — บอกเงินที่ต้องนำมาคืน (แยกสกุล)
 *   ส่งเอกสาร / ประชุม / อื่น ๆ
 * หัวหน้าทัวร์: ยืนยันนัด · ขอเลื่อนนัด (บอกวันเวลาที่สะดวก) → เจ้าหน้าที่นัดใหม่ (กลับมารอยืนยัน)
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
import type { Appointment } from '@/types';
import { AppointmentCalendar } from './AppointmentCalendar';

export default function GuideSettlementAppointmentsPage() {
  const { currentUser, envelopes, expenses, appointments, saveAppointment, changeAppointmentStatus, saving } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());
  const [asking, setAsking] = useState<Appointment | null>(null);
  const [askNote, setAskNote] = useState('');

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

  const requestReschedule = async (a: Appointment, note: string) => {
    await saveAppointment({
      ...a,
      status: 'rescheduled',
      leaderNote: note,
      history: [...a.history, makeStatusEvent(a.status, 'rescheduled', currentUser.name, toISODateTime(new Date()), `หัวหน้าทัวร์ขอเลื่อน: ${note}`)],
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold zego-text">นัดหมาย</h1>
        <p className="text-sm zego-text-secondary">นัดจากเจ้าหน้าที่ เช่น เคลียร์เงินกรุ๊ป — ยืนยันนัด หรือขอเลื่อนได้ที่นี่</p>
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
            description={mine.length === 0 ? 'กรุ๊ปที่ทำครบแล้ว กดทำนัดหมายเคลียร์เงินได้ที่หน้าตรวจสอบ · นัดจากการเงินจะขึ้นที่นี่ด้วย' : undefined}
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
                <Button variant="secondary" size="sm" className="justify-center" onClick={() => { setAsking(a); setAskNote(''); }}>ขอเลื่อนนัด</Button>
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

      {asking && (
        <Modal
          open
          onClose={() => setAsking(null)}
          size="sm"
          title="ขอเลื่อนนัด"
          description={`${asking.id} · นัดเดิม ${formatDate(asking.date)} ${asking.time} น.`}
          footer={
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setAsking(null)}>ยกเลิก</Button>
              <Button variant="primary" loading={saving} disabled={!askNote.trim()} onClick={async () => { await requestReschedule(asking, askNote.trim()); setAsking(null); }}>ส่งคำขอ</Button>
            </div>
          }
        >
          <TextArea
            label="วันเวลาที่สะดวก / เหตุผล"
            required
            rows={3}
            value={askNote}
            onChange={(e) => setAskNote(e.target.value)}
            placeholder="เช่น สะดวกวันพฤหัสที่ 12 ช่วงบ่าย"
          />
        </Modal>
      )}
    </div>
  );
}
