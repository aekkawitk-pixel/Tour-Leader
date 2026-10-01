'use client';

/** ฟอร์มสร้าง / แก้ไขนัดหมาย พร้อมตรวจสอบเวลาซ้อน (จำลอง) */

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { useDemo } from '@/store/DemoStore';
import { APPOINTMENT_MODE } from '@/lib/labels';
import { hasTimeOverlap } from '@/lib/logic/conflicts';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { formatDate } from '@/lib/format';
import type { Appointment, AppointmentMode } from '@/types';

const MODE_DEFAULT_LOCATION: Record<AppointmentMode, string> = {
  office: 'สำนักงานใหญ่ ชั้น 8 ห้องประชุมบัญชี 1',
  online: 'ลิงก์ประชุมจำลอง: meet.demo-tour.local/',
  document: 'ส่งเอกสารทางไปรษณีย์ลงทะเบียน (จำลอง)',
};

interface FormState {
  date: string;
  time: string;
  durationMinutes: string;
  leaderId: string;
  jobId: string;
  staffName: string;
  mode: AppointmentMode;
  location: string;
  note: string;
}

/** เปิดเมื่อ open = true เท่านั้น เพื่อให้ฟอร์มเริ่มต้นใหม่ทุกครั้ง (ไม่ต้อง reset ผ่าน effect) */
export function AppointmentFormModal(props: {
  open: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  presetLeaderId?: string;
  presetJobId?: string;
  onCreated?: (appointment: Appointment) => void;
}) {
  if (!props.open) return null;
  return <AppointmentForm key={props.appointment?.id ?? 'new'} {...props} />;
}

function AppointmentForm({
  onClose,
  appointment,
  presetLeaderId,
  presetJobId,
  onCreated,
}: {
  onClose: () => void;
  appointment: Appointment | null;
  presetLeaderId?: string;
  presetJobId?: string;
  onCreated?: (appointment: Appointment) => void;
}) {
  const {
    leaders,
    jobs,
    appointments,
    saveAppointment,
    createAppointmentId,
    saving,
    currentUser,
    today,
  } = useDemo();

  const [form, setForm] = useState<FormState>(
    appointment
      ? {
          date: appointment.date,
          time: appointment.time,
          durationMinutes: String(appointment.durationMinutes),
          leaderId: appointment.leaderId,
          jobId: appointment.jobId,
          staffName: appointment.staffName,
          mode: appointment.mode,
          location: appointment.location,
          note: appointment.note,
        }
      : {
          date: today,
          time: '10:00',
          durationMinutes: '60',
          leaderId: presetLeaderId ?? '',
          jobId: presetJobId ?? '',
          staffName: currentUser.name,
          mode: 'office',
          location: MODE_DEFAULT_LOCATION.office,
          note: '',
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'mode') next.location = MODE_DEFAULT_LOCATION[value as AppointmentMode];
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /** ตรวจเวลาซ้อน: ทั้งของหัวหน้าทัวร์และของเจ้าหน้าที่ */
  const overlaps = useMemo(() => {
    if (!form.date || !form.time) return [];
    return appointments.filter((a) => {
      if (appointment && a.id === appointment.id) return false;
      if (a.status === 'cancelled') return false;
      const samePerson = a.leaderId === form.leaderId || a.staffName === form.staffName;
      if (!samePerson) return false;
      return hasTimeOverlap(
        form.date,
        form.time,
        Number(form.durationMinutes || 60),
        a.date,
        a.time,
        a.durationMinutes,
      );
    });
  }, [appointments, appointment, form]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.date) next.date = 'กรุณาเลือกวันที่';
    if (!form.time) next.time = 'กรุณาเลือกเวลา';
    if (!form.leaderId) next.leaderId = 'กรุณาเลือกหัวหน้าทัวร์';
    if (!form.jobId) next.jobId = 'กรุณาเลือกงานทัวร์';
    if (!form.staffName.trim()) next.staffName = 'กรุณาระบุเจ้าหน้าที่ผู้รับผิดชอบ';
    if (!form.location.trim()) next.location = 'กรุณาระบุสถานที่หรือลิงก์ประชุม';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    const id = appointment?.id ?? (await createAppointmentId());
    const next: Appointment = {
      ...(appointment ?? {
        id,
        status: 'pending' as const,
        history: [makeStatusEvent(null, 'pending', currentUser.name, `${today}T09:00`)],
      }),
      id,
      date: form.date,
      time: form.time,
      durationMinutes: Number(form.durationMinutes || 60),
      leaderId: form.leaderId,
      jobId: form.jobId,
      staffName: form.staffName.trim(),
      mode: form.mode,
      location: form.location.trim(),
      note: form.note,
    } as Appointment;

    await saveAppointment(next);
    onCreated?.(next);
    onClose();
  };

  const leaderJobs = form.leaderId
    ? jobs.filter(
        (j) => j.leaderId === form.leaderId || j.assistantLeaderIds.includes(form.leaderId),
      )
    : jobs;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={appointment ? `แก้ไขนัดหมาย ${appointment.id}` : 'สร้างนัดหมายใหม่'}
      description="นัดหมายเพื่อเคลียร์งานหรือส่งเอกสารกับฝ่ายบัญชี"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {appointment ? 'บันทึกการแก้ไข' : 'สร้างนัดหมาย'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <DateField
            label="วันที่"
            required
            value={form.date}
            error={errors.date}
            onChange={(v) => set('date', v)}
          />
          <TimeField
            label="เวลา"
            required
            value={form.time}
            error={errors.time}
            onChange={(v) => set('time', v)}
          />
          <SelectInput
            label="ระยะเวลา"
            value={form.durationMinutes}
            onChange={(e) => set('durationMinutes', e.target.value)}
            options={[
              { value: '30', label: '30 นาที' },
              { value: '45', label: '45 นาที' },
              { value: '60', label: '1 ชั่วโมง' },
              { value: '90', label: '1 ชั่วโมง 30 นาที' },
              { value: '120', label: '2 ชั่วโมง' },
            ]}
          />
        </div>

        {overlaps.length > 0 && (
          <Callout tone="amber" title="พบเวลานัดหมายซ้อน">
            {overlaps
              .map(
                (a) =>
                  `${a.id} (${formatDate(a.date)} ${a.time} · ${
                    a.leaderId === form.leaderId ? 'หัวหน้าทัวร์คนเดียวกัน' : 'เจ้าหน้าที่คนเดียวกัน'
                  })`,
              )
              .join(' · ')}
            {' — '}สามารถบันทึกต่อได้ แต่ควรตรวจสอบก่อน
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="หัวหน้าทัวร์"
            required
            placeholder="เลือกหัวหน้าทัวร์"
            value={form.leaderId}
            error={errors.leaderId}
            onChange={(e) => set('leaderId', e.target.value)}
            options={leaders.map((l) => ({
              value: l.id,
              label: `${l.firstName} ${l.lastName} (${l.id})`,
            }))}
          />
          <SelectInput
            label="งานทัวร์"
            required
            placeholder="เลือกงานทัวร์"
            value={form.jobId}
            error={errors.jobId}
            onChange={(e) => set('jobId', e.target.value)}
            options={leaderJobs.map((j) => ({ value: j.id, label: `${j.id} — ${j.title}` }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="เจ้าหน้าที่ผู้รับผิดชอบ"
            required
            value={form.staffName}
            error={errors.staffName}
            onChange={(e) => set('staffName', e.target.value)}
          />
          <SelectInput
            label="รูปแบบการนัดหมาย"
            value={form.mode}
            onChange={(e) => set('mode', e.target.value as AppointmentMode)}
            options={(['office', 'online', 'document'] as AppointmentMode[]).map((m) => ({
              value: m,
              label: APPOINTMENT_MODE[m].label,
            }))}
          />
        </div>

        <TextInput
          label="สถานที่ / ลิงก์ประชุม"
          required
          value={form.location}
          error={errors.location}
          onChange={(e) => set('location', e.target.value)}
        />

        <TextArea
          label="หมายเหตุ"
          rows={2}
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
        />
      </div>
    </Modal>
  );
}
