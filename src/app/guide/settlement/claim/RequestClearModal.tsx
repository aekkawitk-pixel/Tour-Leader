'use client';

/**
 * หัวหน้าทัวร์ขอนัดเคลียร์เงินกับบัญชีเอง — เปิดจากหน้า "ตรวจสอบก่อนนัดเคลียร์เงิน" เมื่อกรุ๊ปทำครบทุกหัวข้อแล้ว
 * (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 *
 * บันทึกเป็นนัดประเภท "เคลียร์เงินกรุ๊ป" สถานะรอยืนยัน + requestedByLeader — ฝั่งการเงินเห็นในเมนูนัดหมาย
 * แล้วกด "ยืนยันนัด" (หรือเลื่อนนัด) ตามขั้นตอนเดิม · ช่องเวลาห่างกัน 30 นาที บอกช่องที่มีนัดแล้ว
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { addDays, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { firstFreeSlot, slotOptions } from '@/lib/logic/appointmentSlots';
import { nextAppointmentId } from '@/services/appointmentStore';
import { APPOINTMENT_MODE } from '@/lib/labels';
import { Button } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import type { AppointmentMode } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

const DURATION = 30;

export function RequestClearModal({ period, leaderId, onClose }: { period: TourPeriodMaster; leaderId: string; onClose: () => void }) {
  const { appointments, saveAppointment, currentUser, saving } = useDemo();
  // เริ่มที่พรุ่งนี้ ช่องว่างช่องแรก
  const [date, setDate] = useState(() => addDays(toISODate(new Date()), 1));
  const [time, setTime] = useState(() => firstFreeSlot(appointments, addDays(toISODate(new Date()), 1), DURATION));
  const [mode, setMode] = useState<AppointmentMode>('office');
  const [note, setNote] = useState('');
  const today = toISODate(new Date());
  const valid = !!date && date >= today && !!time;

  const submit = async () => {
    const at = toISODateTime(new Date());
    await saveAppointment({
      id: nextAppointmentId(appointments),
      date,
      time,
      durationMinutes: DURATION,
      leaderId,
      jobId: period.internalId,
      kind: 'clear',
      staffName: 'ฝ่ายบัญชี',
      mode,
      location: mode === 'office' ? 'สำนักงาน' : 'ออนไลน์ — ลิงก์จากการเงิน',
      note,
      status: 'pending',
      requestedByLeader: true,
      // หัวหน้าทัวร์ขอเอง — ไม่ปิดช่วงรับงาน (การเงินยังไม่ยืนยัน)
      blocksAssignment: false,
      history: [makeStatusEvent(null, 'pending', currentUser.name, at, 'หัวหน้าทัวร์ขอนัดเคลียร์เงิน')],
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="นัดเคลียร์เงินกับบัญชี"
      description={`${period.groupCode} · ${formatDateRange(period.startDate, period.endDate)}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" icon="calendar" loading={saving} disabled={!valid} onClick={() => void submit()}>ส่งคำขอนัด</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <DateField
          label="วันที่"
          required
          value={date}
          min={today}
          onChange={(v) => { setDate(v); if (v) setTime(firstFreeSlot(appointments, v, DURATION)); }}
          error={date && date < today ? 'เลือกวันนี้หรือวันถัดไป' : undefined}
        />
        <SelectInput
          label="เวลา"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          options={slotOptions(appointments, date, DURATION).map((o) => ({ value: o.value, label: o.label }))}
        />
        <SelectInput
          label="รูปแบบ"
          value={mode}
          onChange={(e) => setMode(e.target.value as AppointmentMode)}
          options={(['office', 'online'] as AppointmentMode[]).map((m) => ({ value: m, label: APPOINTMENT_MODE[m].label }))}
        />
        <TextArea label="หมายเหตุถึงบัญชี" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-xs zego-text-tertiary">ส่งคำขอแล้ว การเงินจะยืนยันนัด หรือเสนอเวลาใหม่ — ดูสถานะได้ที่เมนูนัดหมาย</p>
      </div>
    </Modal>
  );
}
