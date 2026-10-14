'use client';

/**
 * หัวหน้าทัวร์ขอนัดเคลียร์เงินกับบัญชีเอง — เปิดจากส่วน "บัญชี-การเงิน" ในหน้ารายละเอียดงาน
 * (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 *
 * บันทึกเป็นนัดประเภท "เคลียร์เงินกรุ๊ป" สถานะรอยืนยัน + requestedByLeader — ฝั่งการเงินเห็นในเมนูนัดหมาย
 * แล้วกด "ยืนยันนัด" (หรือเลื่อนนัด) ตามขั้นตอนเดิม
 * เลือกได้เฉพาะวันเวลาที่ฝ่ายบัญชีว่าง: วันทำงาน (ไม่ใช่เสาร์-อาทิตย์/วันหยุดในเมนูวันหยุด) ตั้งแต่พรุ่งนี้
 * และช่องที่ไม่ชนนัดอื่นในคิวเดียวกัน — ญี่ปุ่นนัดละ 30 นาที · ประเทศอื่นนัดละ 10 นาที (คนละคิว ซ้อนเวลากันได้)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { formatDateRange, toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { LANE_DURATION, LANE_LABEL } from '@/lib/logic/appointmentSlots';
import { laneOfPeriod } from '@/lib/logic/appointmentLane';
import { nextAppointmentId } from '@/services/appointmentStore';
import { APPOINTMENT_MODE, APPOINTMENT_OFFICE_LOCATION } from '@/lib/labels';
import { Button, Callout } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/FormField';
import { FreeSlotPicker, isFreeChoice, useBookableDays } from '@/components/appointments/FreeSlotPicker';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

export function RequestClearModal({ period, leaderId, missing, onClose, onBack }: {
  period: TourPeriodMaster;
  leaderId: string;
  /** สิ่งที่ยังขาด (เช่น "ต้องทำ: เบี้ยเลี้ยง (ยังไม่ทำใบเบิก)") — มีค่า = นัดล่วงหน้าทั้งที่ยังไม่ครบ */
  missing?: string | null;
  onClose: () => void;
  /** กลับไปหน้าเลือกกรุ๊ป (เปิดจากเมนูนัดหมาย) — ไม่ส่ง = ปุ่มยกเลิกปิดหน้าต่าง */
  onBack?: () => void;
}) {
  const { appointments, saveAppointment, currentUser, saving } = useDemo();
  // ญี่ปุ่น = คิว 30 นาที · ประเทศอื่น = คิว 10 นาที
  const lane = laneOfPeriod(period.internalId);
  const DURATION = LANE_DURATION[lane];
  // วันทำการที่บัญชียังมีช่องว่าง — เริ่มพรุ่งนี้ (นัดวันนี้กระชั้นเกินไปสำหรับบัญชี) · กรุ๊ปที่ยังเดินทางอยู่ เริ่มหลังวันกลับ
  const days = useBookableDays(appointments, DURATION, undefined, lane, period.endDate || period.startDate);
  const [date, setDate] = useState(() => days[0]?.date ?? '');
  const [time, setTime] = useState(() => days[0]?.free[0] ?? '');
  const [note, setNote] = useState('');
  // ช่องที่เลือกไว้ถูกจองไปแล้วระหว่างนั้น → ต้องเลือกใหม่
  const valid = isFreeChoice(days, date, time);

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
      lane,
      staffName: 'ฝ่ายบัญชี',
      mode: 'office',
      location: APPOINTMENT_OFFICE_LOCATION,
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
      onClose={onBack ?? onClose}
      size="lg"
      title="นัดเคลียร์เงินกับบัญชี"
      description={`${period.groupCode} · ${formatDateRange(period.startDate, period.endDate)}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" icon={onBack ? 'chevronLeft' : undefined} onClick={onBack ?? onClose} disabled={saving}>{onBack ? 'เลือกกรุ๊ปอื่น' : 'ยกเลิก'}</Button>
          <Button variant="primary" icon="calendar" loading={saving} disabled={!valid} onClick={() => void submit()}>ส่งคำขอนัด</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {missing && (
          <Callout tone="amber" title="กรุ๊ปนี้ยังไม่ครบ">
            {missing} — นัดล่วงหน้าได้ แต่ต้องทำให้ครบก่อนวันนัด ไม่งั้นบัญชีอาจขอเลื่อนนัด
          </Callout>
        )}
        <p className="text-xs zego-text-tertiary">คิวเคลียร์เงิน{LANE_LABEL[lane]} · ครั้งละ {DURATION} นาที</p>
        <FreeSlotPicker days={days} date={date} time={time} duration={DURATION} onChange={(d, t) => { setDate(d); setTime(t); }} />
        {/* รูปแบบนัดมีแบบเดียว = เข้าสำนักงาน */}
        <p className="flex items-start gap-1.5 rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-secondary">
          <span className="font-semibold zego-text">{APPOINTMENT_MODE.office.label}</span> · {APPOINTMENT_OFFICE_LOCATION}
        </p>
        <TextArea label="หมายเหตุถึงบัญชี" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-xs zego-text-tertiary">ส่งคำขอแล้ว การเงินจะยืนยันนัด หรือเสนอเวลาใหม่ — ดูสถานะได้ที่เมนูนัดหมาย</p>
      </div>
    </Modal>
  );
}
