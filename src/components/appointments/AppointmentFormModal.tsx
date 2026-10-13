'use client';

/**
 * ฟอร์มสร้าง / แก้ไขนัดหมาย (ปฏิทินรวมเมนูนัดหมาย) พร้อมตรวจสอบเวลาซ้อน
 * ประเภทนัด (เคลียร์เงินกรุ๊ป / ส่งเอกสาร) · เลือกตามรหัสกรุ๊ป (ค้นหาได้) → หัวหน้าทัวร์ใส่ให้อัตโนมัติจากงานที่คอนเฟิร์มแล้ว
 * นัดใหม่ = รอหัวหน้าทัวร์ยืนยัน (หัวหน้าทัวร์ยืนยัน / ขอเลื่อนในพอร์ทัลของตัวเอง)
 */

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout, cx } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { firstFreeSlot, SLOT_DURATIONS, slotOptions } from '@/lib/logic/appointmentSlots';
import { useDemo } from '@/store/DemoStore';
import { APPOINTMENT_KIND, APPOINTMENT_KIND_OPTIONS, APPOINTMENT_MODE, APPOINTMENT_OFFICE_LOCATION } from '@/lib/labels';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { hasTimeOverlap } from '@/lib/logic/conflicts';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { formatDate, formatDateRange, toISODate, toISODateTime } from '@/lib/format';
import { clearReadiness } from '@/lib/logic/clearReadiness';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { loadGroupClears } from '@/services/groupClearStore';
import type { Appointment, AppointmentKind, AppointmentMode } from '@/types';

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
  /** กรุ๊ปที่เลือกมีนัดเคลียร์อยู่แล้ว → พาไปเลื่อนนัดเดิม (ไม่มี = บอกให้ไปเลื่อนเองที่เมนูนัดหมาย) */
  onOpenExisting?: (appointmentId: string) => void;
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
  onOpenExisting,
}: {
  onClose: () => void;
  appointment: Appointment | null;
  presetLeaderId?: string;
  presetJobId?: string;
  presetDate?: string;
  onCreated?: (appointment: Appointment) => void;
  onOpenExisting?: (appointmentId: string) => void;
}) {
  const {
    leaders,
    appointments,
    envelopes,
    expenses,
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
          mode: 'office',
          // นัดเก่าที่เป็นออนไลน์/ส่งเอกสาร — แก้แล้วเป็นเข้าสำนักงาน ใช้สถานที่ตั้งต้นแทน
          location: appointment.mode === 'office' ? appointment.location : APPOINTMENT_OFFICE_LOCATION,
          note: appointment.note,
        }
      : {
          date: presetDate ?? today,
          // นัดห่างกันช่วงละ 30 นาที — ตั้งต้นที่ช่องว่างช่องแรกของวัน
          time: firstFreeSlot(appointments, presetDate ?? today, 30),
          durationMinutes: '30',
          leaderId: presetLeaderId ?? '',
          jobId: presetJobId ?? '',
          kind: 'clear',
          staffName: currentUser.name,
          mode: 'office',
          location: APPOINTMENT_OFFICE_LOCATION,
          note: '',
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
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
        Number(form.durationMinutes || 30),
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
    if (!form.jobId) next.jobId = 'กรุณาเลือกรหัสกรุ๊ป';
    else if (!form.leaderId) next.jobId = 'กรุ๊ปนี้ยังไม่มีหัวหน้าทัวร์ที่คอนเฟิร์ม — นัดหมายไม่ได้';
    // นัดเคลียร์เงินต้องผูกกรุ๊ป · ประเภทอื่นไม่ผูกก็ได้
    // กรุ๊ปนี้มีนัดเคลียร์อยู่แล้ว — สร้างใหม่จะซ้ำ ต้องเลื่อนนัดเดิมแทน
    if (bookedClash) next.jobId = 'กรุ๊ปนี้มีนัดเคลียร์เงินแล้ว — เลื่อนนัดเดิมแทนการสร้างใหม่';
    if (!form.staffName.trim()) next.staffName = 'กรุณาระบุเจ้าหน้าที่ผู้รับผิดชอบ';
    if (!form.location.trim()) next.location = 'กรุณาระบุสถานที่';
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
      durationMinutes: Number(form.durationMinutes || 30),
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

  /*
    กรุ๊ปที่นัดได้ = กรุ๊ปหลังเดินทาง (จบทริปแล้ว — วันกลับนับเป็นจบทริป) ที่มีหัวหน้าทัวร์คอนเฟิร์มแล้ว
    (ระบบใส่หัวหน้าทัวร์ให้จากกรุ๊ป) · นัดเดิมที่ผูกกรุ๊ปไว้แล้วยังแสดงค้างได้
    แต่ละกรุ๊ปบอกความพร้อม (กติกาเดียวกับฝั่งหัวหน้าทัวร์ — clearReadiness) เรียง: พร้อมนัด → ยังไม่ครบ → นัดแล้ว → ปิดเคลียร์แล้ว
  */
  const groupOptions = useMemo(() => {
    const leaderByPeriod = new Map<string, string>();
    for (const a of loadActiveGuideAssignments()) {
      if (a.assignmentStatus === 'CONFIRMED' && !leaderByPeriod.has(a.periodId)) leaderByPeriod.set(a.periodId, a.tourLeaderId);
    }
    if (appointment?.jobId && !leaderByPeriod.has(appointment.jobId)) leaderByPeriod.set(appointment.jobId, appointment.leaderId);
    const today = toISODate(new Date());
    const clears = loadGroupClears();
    return [...leaderByPeriod]
      .map(([id, leaderId]) => {
        const p = getTourPeriodById(id);
        const l = leaders.find((x) => x.id === leaderId);
        const ready = p ? clearReadiness({
          started: true,
          ended: true,
          startText: formatDate(p.startDate),
          endText: formatDate(p.endDate || p.startDate),
          envs: envelopes.filter((e) => e.periodId === id && e.sealed),
          receipts: expenses.filter((e) => e.jobId === id && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled'),
          perDiem: activeLeaderClaim(expenses, id, leaderId, 'per_diem'),
        }) : null;
        // นัดเคลียร์ที่ยังมีผลของกรุ๊ปนี้ (ไม่นับนัดที่กำลังแก้อยู่)
        const booked = appointments.find((a) => a.id !== appointment?.id && a.kind === 'clear' && a.jobId === id && a.status !== 'cancelled' && a.status !== 'attended');
        const readiness: GroupReadiness = clears[id]?.closedAt ? { rank: 3, label: 'ปิดเคลียร์แล้ว', tone: 'slate' }
          : booked ? { rank: 2, label: `นัดแล้ว ${formatDate(booked.date)} ${booked.time} น. · เลือกเพื่อเลื่อนนัดเดิม`, tone: 'sky', bookedId: booked.id, bookedWhen: `${formatDate(booked.date)} ${booked.time} น.` }
            : ready?.ready ? { rank: 0, label: 'พร้อมนัด — เอกสารครบแล้ว', tone: 'emerald' }
              : { rank: 1, label: ready?.detail ?? 'ยังไม่ครบ', tone: 'amber' };
        return { id, leaderId, p, code: p?.groupCode ?? periodCodeOf(id), leaderName: l ? `${l.firstName} ${l.lastName}`.trim() : leaderId, readiness };
      })
      // หลังเดินทางเท่านั้น — กรุ๊ปที่ยังไม่กลับยังไม่มีอะไรให้เคลียร์/ส่งเอกสาร
      .filter((g) => g.id === appointment?.jobId || (!!g.p && g.p.endDate <= today))
      .sort((a, b) => a.readiness.rank - b.readiness.rank || (b.p?.endDate ?? '').localeCompare(a.p?.endDate ?? ''));
  }, [leaders, appointment, appointments, envelopes, expenses]);
  const [groupQuery, setGroupQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickedGroup = groupOptions.find((g) => g.id === form.jobId);
  /** สร้างนัดเคลียร์ใหม่ให้กรุ๊ปที่มีนัดอยู่แล้ว = นัดซ้ำ (แก้นัดเดิมไม่นับ) */
  const bookedClash = !appointment && form.kind === 'clear' ? pickedGroup?.readiness.bookedId ?? null : null;
  const gq = groupQuery.trim().toLowerCase();
  const groupMatches = groupOptions
    .filter((g) => !gq || [g.code, g.p?.displayName ?? '', g.leaderName].join(' ').toLowerCase().includes(gq))
    .slice(0, 8);
  const pickGroup = (g: (typeof groupOptions)[number]) => {
    setForm((f) => ({ ...f, jobId: g.id, leaderId: g.leaderId }));
    setErrors((e) => ({ ...e, jobId: undefined, leaderId: undefined }));
    setGroupQuery('');
    setPickerOpen(false);
  };

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
          <Button variant="primary" onClick={submit} loading={saving} disabled={!!bookedClash}>
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
          // ใช้งานจริง 2 ประเภท: เคลียร์เงินกรุ๊ป · ส่งเอกสาร (นัดเก่าประเภทอื่นยังแก้ได้ — คงค่าเดิมไว้ในตัวเลือก)
          options={[...new Set([...APPOINTMENT_KIND_OPTIONS, form.kind])].map((k) => ({ value: k, label: APPOINTMENT_KIND[k].label }))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <DateField
            label="วันที่"
            required
            value={form.date}
            error={errors.date}
            onChange={(v) => set('date', v)}
          />
          {/* ช่องเวลาห่างกัน 30 นาที — บอกช่องที่มีนัดแล้วในตัวเลือก */}
          <SelectInput
            label="เวลา"
            required
            value={form.time}
            error={errors.time}
            onChange={(e) => set('time', e.target.value)}
            options={slotOptions(appointments, form.date, Number(form.durationMinutes) || 30, appointment?.id, form.time)
              .map((o) => ({ value: o.value, label: o.label }))}
          />
          <SelectInput
            label="ระยะเวลา"
            value={form.durationMinutes}
            onChange={(e) => set('durationMinutes', e.target.value)}
            options={[...new Set([...SLOT_DURATIONS, Number(form.durationMinutes) || 30])].sort((a, b) => a - b)
              .map((m) => ({ value: String(m), label: m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชั่วโมง${m % 60 ? ` ${m % 60} นาที` : ''}` }))}
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

        {/* เลือกตามรหัสกรุ๊ป (ค้นหา) → หัวหน้าทัวร์ของกรุ๊ปใส่ให้อัตโนมัติ */}
        {/* รหัสกรุ๊ป (ค้นหา) เต็มแถว — แต่ละกรุ๊ปแสดง รหัส · วันเดินทาง / ชื่อโปรแกรม / หัวหน้าทัวร์ คนละบรรทัด */}
        <div className="relative">
          <label className="mb-1.5 block text-sm font-medium zego-text-secondary">รหัสกรุ๊ป <span className="text-rose-600">*</span></label>
          {pickedGroup && !pickerOpen ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-start justify-between gap-3 rounded-lg border zego-border-color bg-white px-3 py-2 text-left text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold zego-text">{pickedGroup.code}</span>
                  {pickedGroup.p && <span className="text-xs tabular-nums zego-text-secondary">{formatDateRange(pickedGroup.p.startDate, pickedGroup.p.endDate)}</span>}
                </span>
                <span className="block truncate text-xs zego-text-secondary" title={pickedGroup.p?.displayName}>{pickedGroup.p?.displayName ?? '—'}</span>
                <ReadinessTag readiness={pickedGroup.readiness} />
              </span>
              <span className="shrink-0 text-xs zego-text-info">เปลี่ยน</span>
            </button>
          ) : (
            <input
              autoFocus={pickerOpen}
              className={cx('h-10 w-full rounded-lg border bg-white px-3 text-sm', errors.jobId ? 'border-rose-400' : 'zego-border-color')}
              placeholder="พิมพ์รหัสกรุ๊ป ชื่อโปรแกรม หรือชื่อหัวหน้าทัวร์"
              value={groupQuery}
              onFocus={() => setPickerOpen(true)}
              onChange={(e) => { setGroupQuery(e.target.value); setPickerOpen(true); }}
              aria-label="ค้นหารหัสกรุ๊ป"
            />
          )}
          {pickerOpen && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border zego-border-color bg-white shadow-lg">
              <ul className="max-h-72 divide-y divide-[var(--zego-border-soft)] overflow-y-auto">
                {groupMatches.length === 0 ? (
                  <li className="px-3 py-2.5 text-xs zego-text-tertiary">ไม่พบกรุ๊ปหลังเดินทางที่มีหัวหน้าทัวร์คอนเฟิร์มแล้ว</li>
                ) : groupMatches.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => pickGroup(g)}
                      className={cx('block w-full px-3 py-2 text-left zego-hover-surface', g.id === form.jobId && 'bg-emerald-50')}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold zego-text">{g.code}</span>
                        <span className="shrink-0 text-xs tabular-nums zego-text-secondary">{g.p ? formatDateRange(g.p.startDate, g.p.endDate) : '—'}</span>
                      </span>
                      <span className="block truncate text-xs zego-text-secondary" title={g.p?.displayName}>{g.p?.displayName ?? '—'}</span>
                      <span className="block truncate text-xs zego-text-tertiary">หัวหน้าทัวร์ {g.leaderName}</span>
                      <ReadinessTag readiness={g.readiness} />
                    </button>
                  </li>
                ))}
              </ul>
              {pickedGroup && (
                <button type="button" onClick={() => setPickerOpen(false)} className="block w-full zego-divider-top px-3 py-1.5 text-left text-xs zego-text-info">ยกเลิกการเปลี่ยน</button>
              )}
            </div>
          )}
          {errors.jobId && !bookedClash && <p className="mt-1 text-xs text-rose-600">{errors.jobId}</p>}
          {bookedClash && !pickerOpen && (
            <div className="mt-2">
              <Callout tone="amber" title={`กรุ๊ปนี้มีนัดเคลียร์เงินแล้ว ${pickedGroup?.readiness.bookedWhen ?? ''}`}>
                สร้างนัดใหม่จะซ้ำกัน — ถ้าต้องการเปลี่ยนวันเวลา ให้เลื่อนนัดเดิม
                {onOpenExisting ? (
                  <span className="mt-2 block">
                    <Button variant="primary" size="sm" icon="calendar" onClick={() => onOpenExisting(bookedClash)}>เลื่อนนัดเดิม</Button>
                  </span>
                ) : (
                  <span className="block">ไปที่เมนูนัดหมาย แล้วเปิดนัด {bookedClash} → เลื่อนนัด</span>
                )}
              </Callout>
            </div>
          )}
        </div>

        {/* หัวหน้าทัวร์ — แยกบรรทัด ใส่ให้อัตโนมัติจากกรุ๊ปที่เลือก */}
        <div>
          <label className="mb-1.5 block text-sm font-medium zego-text-secondary">หัวหน้าทัวร์</label>
          <p className="flex h-10 items-center truncate rounded-lg border zego-border-color zego-surface-soft-bg px-3 text-sm zego-text" title={pickedGroup?.leaderName}>
            {pickedGroup ? pickedGroup.leaderName : <span className="zego-text-tertiary">ใส่ให้อัตโนมัติจากกรุ๊ป</span>}
          </p>
        </div>

        <TextInput
          label="เจ้าหน้าที่ผู้รับผิดชอบ"
          required
          value={form.staffName}
          error={errors.staffName}
          onChange={(e) => set('staffName', e.target.value)}
        />

        {/* รูปแบบนัดมีแบบเดียว = เข้าสำนักงาน — ไม่มีตัวเลือก */}
        <TextInput
          label={`สถานที่ · ${APPOINTMENT_MODE.office.label}`}
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

/** bookedId = นัดเคลียร์ที่ยังมีผลของกรุ๊ปนี้ — มีแล้วห้ามสร้างนัดซ้ำ ให้เลื่อนนัดเดิมแทน */
type GroupReadiness = { rank: number; label: string; tone: 'emerald' | 'amber' | 'sky' | 'slate'; bookedId?: string; bookedWhen?: string };

const READINESS_TAG: Record<GroupReadiness['tone'], string> = {
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** ความพร้อมให้นัดของกรุ๊ป — เขียว พร้อมนัด · ส้ม ยังไม่ครบ (บอกสิ่งที่ขาด) · ฟ้า นัดแล้ว · เทา ปิดเคลียร์แล้ว */
function ReadinessTag({ readiness }: { readiness: GroupReadiness }) {
  return (
    <span className={cx('mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', READINESS_TAG[readiness.tone])}>
      <span className="truncate">{readiness.label}</span>
    </span>
  );
}
