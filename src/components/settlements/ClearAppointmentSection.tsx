'use client';

/**
 * นัดหมายเคลียร์เงิน (ฝั่งการเงิน) — ในแผงเคลียร์เงินกรุ๊ป
 *
 * บันทึกลงชุดนัดหมายกลาง (Appointment kind 'clear', jobId = กรุ๊ป) — เห็นในปฏิทินเมนูนัดหมาย และพอร์ทัลหัวหน้าทัวร์
 * นัดได้เมื่อเอกสารผ่านตรวจครบแล้ว · หัวหน้าทัวร์ยืนยัน / ขอเลื่อน → เจ้าหน้าที่แก้นัด (กลับเป็นรอยืนยัน) · ยกเลิกได้
 * ปิดการเคลียร์เงินกรุ๊ปแล้ว นัดเปลี่ยนเป็น "เข้าพบแล้ว" อัตโนมัติ (ที่ GroupClearDrawer)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, StatusBadge } from '@/components/ui/Primitives';
import { APPOINTMENT_MODE, appointmentStatusMeta } from '@/lib/labels';
import { formatDate, toISODate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { clearAppointmentOf } from '@/services/appointmentStore';
import { firstFreeSlot, SLOT_DURATIONS, slotOptions } from '@/lib/logic/appointmentSlots';
import type { Appointment, AppointmentMode } from '@/types';

const DEFAULT_LOCATION: Record<Exclude<AppointmentMode, 'document'>, string> = {
  office: 'บริษัท ซีโก้ ทราเวล จำกัด ห้องการเงิน ชั้น 1',
  online: 'ลิงก์ประชุมออนไลน์ (ส่งให้ทางไลน์)',
};

export function ClearAppointmentSection({
  periodId,
  groupCode,
  leader,
  canAppoint,
  blockedReason,
}: {
  periodId: string;
  groupCode: string;
  leader: { id: string; name: string } | null;
  /** นัดได้ไหม — เอกสารผ่านตรวจครบแล้ว */
  canAppoint: boolean;
  blockedReason: string;
}) {
  const { currentUser, appointments, saveAppointment, createAppointmentId, changeAppointmentStatus, saving } = useDemo();
  const appt = clearAppointmentOf(appointments, periodId);
  const [editing, setEditing] = useState(false);
  const today = toISODate(new Date());
  const [form, setForm] = useState(() => ({
    date: appt?.date ?? today,
    // นัดห่างกันช่วงละ 30 นาที — นัดใหม่ตั้งต้นที่ช่องว่างช่องแรกของวัน
    time: appt?.time ?? firstFreeSlot(appointments, today, 30),
    durationMinutes: String(appt?.durationMinutes ?? 30),
    mode: (appt?.mode === 'online' ? 'online' : 'office') as 'office' | 'online',
    location: appt?.location ?? DEFAULT_LOCATION.office,
    note: appt?.note ?? '',
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const invalid = !form.date || form.date < today || !form.time || !form.location.trim();

  const save = async () => {
    if (!leader || invalid) return;
    const at = toISODateTime(new Date());
    const when = `${formatDate(form.date)} ${form.time} น.`;
    const fields = {
      date: form.date, time: form.time, durationMinutes: Number(form.durationMinutes) || 30,
      mode: form.mode as AppointmentMode, location: form.location.trim(), note: form.note.trim(),
      leaderId: leader.id, staffName: currentUser.name,
    };
    // แก้นัด → กลับเป็นรอหัวหน้าทัวร์ยืนยัน · นัดใหม่ = สร้างนัด kind 'clear' ผูกกรุ๊ป
    const next: Appointment = appt
      ? { ...appt, ...fields, status: 'pending', leaderNote: undefined, history: [...appt.history, makeStatusEvent(appt.status, 'pending', currentUser.name, at, `แก้นัดเป็น ${when}`)] }
      : {
        id: await createAppointmentId(), jobId: periodId, kind: 'clear', ...fields, status: 'pending', blocksAssignment: false,
        history: [makeStatusEvent(null, 'pending', currentUser.name, at, `นัดเคลียร์เงินกรุ๊ป ${groupCode} · ${when}`)],
      };
    await saveAppointment(next);
    setEditing(false);
  };

  const input = 'h-9 w-full rounded-lg border zego-border-color bg-white px-2.5 text-sm';
  const label = 'mb-1 block text-xs font-medium zego-text-secondary';

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold zego-text">นัดหมายเคลียร์เงิน</h3>

      {appt && !editing ? (
        <div className="space-y-2 rounded-lg border zego-border-color px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold zego-text">{appt.id} · {formatDate(appt.date)} {appt.time} น. ({appt.durationMinutes} นาที)</span>
            <StatusBadge meta={appointmentStatusMeta(appt)} size="sm" />
          </div>
          <p className="zego-text-secondary">{APPOINTMENT_MODE[appt.mode].label} · {appt.location}</p>
          <p className="text-xs zego-text-tertiary">ผู้นัด {appt.staffName}{appt.note ? ` · ${appt.note}` : ''}</p>
          {appt.status === 'rescheduled' && (
            <Callout tone="amber" title="หัวหน้าทัวร์ขอเลื่อนนัด">{appt.leaderNote || 'ไม่ได้ระบุวันเวลาที่สะดวก'} — กด “แก้ไขนัด” เพื่อนัดใหม่</Callout>
          )}
          {appt.status !== 'attended' && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => { if (window.confirm(`ยกเลิกนัด ${appt.id}?`)) void changeAppointmentStatus(appt.id, 'cancelled', 'ยกเลิกนัดเคลียร์เงิน'); }}>ยกเลิกนัด</Button>
              <Button variant={appt.status === 'rescheduled' ? 'primary' : 'secondary'} size="sm" icon="edit" onClick={() => setEditing(true)}>แก้ไขนัด</Button>
            </div>
          )}
        </div>
      ) : !canAppoint && !editing ? (
        <p className="rounded-lg border border-dashed zego-border-color px-3 py-3 text-xs zego-text-tertiary">นัดหมายได้หลังตรวจเอกสารครบ — {blockedReason}</p>
      ) : !leader ? (
        <p className="rounded-lg border border-dashed zego-border-color px-3 py-3 text-xs zego-text-warning">กรุ๊ปนี้ไม่มีหัวหน้าทัวร์ที่คอนเฟิร์มในระบบ — นัดหมายไม่ได้</p>
      ) : (
        <div className="space-y-3 rounded-lg border zego-border-color px-3 py-3">
          <p className="text-xs zego-text-secondary">นัด <span className="font-semibold zego-text">{leader.name}</span> เข้ามาเคลียร์เงินกรุ๊ป {groupCode} — นัดขึ้นในปฏิทินเมนูนัดหมาย และหัวหน้าทัวร์เห็นในพอร์ทัล แล้วกดยืนยันหรือขอเลื่อน</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className={label}>วันที่</span><input type="date" min={today} className={input} value={form.date} onChange={(e) => { const d = e.target.value; setForm((f) => ({ ...f, date: d, time: firstFreeSlot(appointments, d, Number(f.durationMinutes) || 30, appt?.id) })); }} /></label>
            <label className="block">
              <span className={label}>เวลา (ช่องละ 30 นาที)</span>
              <select className={input} value={form.time} onChange={(e) => set('time', e.target.value)}>
                {slotOptions(appointments, form.date, Number(form.durationMinutes) || 30, appt?.id, form.time).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>ระยะเวลา</span>
              <select className={input} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}>
                {[...new Set([...SLOT_DURATIONS, Number(form.durationMinutes) || 30])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} นาที</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="block">
              <span className={label}>รูปแบบ</span>
              <select className={input} value={form.mode} onChange={(e) => { const m = e.target.value as 'office' | 'online'; set('mode', m); set('location', DEFAULT_LOCATION[m]); }}>
                <option value="office">{APPOINTMENT_MODE.office.label}</option>
                <option value="online">{APPOINTMENT_MODE.online.label}</option>
              </select>
            </label>
            <label className="block"><span className={label}>สถานที่ / ลิงก์</span><input className={input} value={form.location} onChange={(e) => set('location', e.target.value)} /></label>
          </div>
          <label className="block"><span className={label}>หมายเหตุถึงหัวหน้าทัวร์ <span className="font-normal zego-text-tertiary">(ไม่บังคับ)</span></span><input className={input} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="เช่น นำเงินคืนและใบเสร็จตัวจริงมาด้วย" /></label>
          {form.date && form.date < today && <p className="text-xs zego-text-danger">วันที่ต้องไม่ก่อนวันนี้</p>}
          <div className="flex justify-end gap-2">
            {editing && <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>ยกเลิกการแก้ไข</Button>}
            <Button variant="primary" size="sm" icon="calendar" loading={saving} disabled={invalid} onClick={() => void save()}>{appt ? 'บันทึกนัดใหม่' : 'นัดหมาย'}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
