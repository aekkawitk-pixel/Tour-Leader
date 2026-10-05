'use client';

/**
 * ฟอร์มสร้าง / แก้ไขนัดหมาย (ปฏิทินรวมเมนูนัดหมาย) พร้อมตรวจสอบเวลาซ้อน
 * ประเภทนัด (เคลียร์เงินกรุ๊ป / ส่งเอกสาร / ประชุม / อื่น ๆ) · กรุ๊ป = งานที่หัวหน้าทัวร์คนนั้นคอนเฟิร์มแล้ว
 * นัดใหม่ = รอหัวหน้าทัวร์ยืนยัน (หัวหน้าทัวร์ยืนยัน / ขอเลื่อนในพอร์ทัลของตัวเอง)
 */

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { useDemo } from '@/store/DemoStore';
import { APPOINTMENT_KIND, APPOINTMENT_MODE } from '@/lib/labels';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { hasTimeOverlap } from '@/lib/logic/conflicts';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { formatDate, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import type { Appointment, AppointmentKind, AppointmentMode } from '@/types';

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
  kind: AppointmentKind;
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
  /** วันที่ตั้งต้น (เช่น กดวันในปฏิทิน) */
  presetDate?: string;
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
  presetDate,
  onCreated,
}: {
  onClose: () => void;
  appointment: Appointment | null;
  presetLeaderId?: string;
  presetJobId?: string;
  presetDate?: string;
  onCreated?: (appointment: Appointment) => void;
}) {
  const {
    leaders,
    appointments,
    saveAppointment,
    createAppointmentId,
    saving,
    currentUser,
  } = useDemo();
  // วันที่จริงของเครื่อง (ไม่ใช้วันจำลองของ Demo)
  const today = toISODate(new Date());

  const [form, setForm] = useState<FormState>(
    appointment
      ? {
          date: appointment.date,
          time: appointment.time,
          durationMinutes: String(appointment.durationMinutes),
          leaderId: appointment.leaderId,
          jobId: appointment.jobId,
          kind: appointment.kind ?? 'other',
          staffName: appointment.staffName,
          mode: appointment.mode,
          location: appointment.location,
          note: appointment.note,
        }
      : {
          date: presetDate ?? today,
          time: '10:00',
          durationMinutes: '60',
          leaderId: presetLeaderId ?? '',
          jobId: presetJobId ?? '',
          kind: 'meeting',
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
    // นัดเคลียร์เงินต้องผูกกรุ๊ป · ประเภทอื่นไม่ผูกก็ได้
    if (form.kind === 'clear' && !form.jobId) next.jobId = 'นัดเคลียร์เงินต้องเลือกกรุ๊ป';
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
        history: [makeStatusEvent(null, 'pending', currentUser.name, toISODateTime(new Date()), `สร้างนัด${APPOINTMENT_KIND[form.kind].label}`)],
      }),
      kind: form.kind,
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

  /** กรุ๊ปของหัวหน้าทัวร์ที่เลือก — งานที่คอนเฟิร์มแล้ว ล่าสุดก่อน (นัดเดิมที่ผูกกรุ๊ปอื่นไว้ยังเลือกค้างได้) */
  const leaderGroups = useMemo(() => {
    if (!form.leaderId) return [];
    const ids = new Set(loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === form.leaderId && a.assignmentStatus === 'CONFIRMED')
      .map((a) => a.periodId));
    if (form.jobId) ids.add(form.jobId);
    return [...ids]
      .map((id) => ({ id, p: getTourPeriodById(id) }))
      .sort((a, b) => (b.p?.startDate ?? '').localeCompare(a.p?.startDate ?? ''));
  }, [form.leaderId, form.jobId]);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={appointment ? `แก้ไขนัดหมาย ${appointment.id}` : 'สร้างนัดหมายใหม่'}
      description="นัดหมายเพื่อเคลียร์เงินกรุ๊ปหรือส่งเอกสารกับฝ่ายบัญชี"
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
        <SelectInput
          label="ประเภทนัด"
          value={form.kind}
          onChange={(e) => set('kind', e.target.value as AppointmentKind)}
          options={(Object.keys(APPOINTMENT_KIND) as AppointmentKind[]).map((k) => ({ value: k, label: APPOINTMENT_KIND[k].label }))}
        />
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
            onChange={(e) => { set('leaderId', e.target.value); set('jobId', ''); }}
            options={leaders.map((l) => ({
              value: l.id,
              label: `${l.firstName} ${l.lastName} (${l.id})`,
            }))}
          />
          <SelectInput
            label="กรุ๊ป"
            required={form.kind === 'clear'}
            placeholder={form.leaderId ? (form.kind === 'clear' ? 'เลือกกรุ๊ป' : 'ไม่ผูกกรุ๊ป') : 'เลือกหัวหน้าทัวร์ก่อน'}
            value={form.jobId}
            error={errors.jobId}
            onChange={(e) => set('jobId', e.target.value)}
            options={leaderGroups.map(({ id, p }) => ({ value: id, label: p ? `${p.groupCode} · ${formatDateRange(p.startDate, p.endDate)}` : id }))}
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
