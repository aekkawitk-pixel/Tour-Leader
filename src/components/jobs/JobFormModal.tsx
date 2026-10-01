'use client';

/** ฟอร์มสร้าง / แก้ไขงานทัวร์ (ข้อมูลจำลอง) */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { useDemo } from '@/store/DemoStore';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { diffDays } from '@/lib/format';
import type { TourJob } from '@/types';

interface FormState {
  title: string;
  customer: string;
  country: string;
  customerGroup: string;
  cities: string;
  route: string;
  departDate: string;
  returnDate: string;
  meetingDate: string;
  meetingTime: string;
  meetingPoint: string;
  outboundNo: string;
  outboundRoute: string;
  inboundNo: string;
  inboundRoute: string;
  paxCount: string;
  coordinator: string;
  leaderFee: string;
  budget: string;
  note: string;
}

const emptyForm: FormState = {
  title: '',
  customer: '',
  country: '',
  customerGroup: '',
  cities: '',
  route: '',
  departDate: '',
  returnDate: '',
  meetingDate: '',
  meetingTime: '20:00',
  meetingPoint: 'สนามบินสุวรรณภูมิ ชั้น 4',
  outboundNo: '',
  outboundRoute: '',
  inboundNo: '',
  inboundRoute: '',
  paxCount: '',
  coordinator: '',
  leaderFee: '',
  budget: '',
  note: '',
};

function toForm(job: TourJob): FormState {
  const [meetingDate, meetingTime] = job.meetingDateTime.split('T');
  return {
    title: job.title,
    customer: job.customer,
    country: job.country,
    customerGroup: job.customerGroup ?? '',
    cities: job.cities.join(', '),
    route: job.route,
    departDate: job.departDate,
    returnDate: job.returnDate,
    meetingDate,
    meetingTime: meetingTime ?? '20:00',
    meetingPoint: job.meetingPoint,
    outboundNo: job.outboundFlight.flightNo,
    outboundRoute: job.outboundFlight.route,
    inboundNo: job.inboundFlight.flightNo,
    inboundRoute: job.inboundFlight.route,
    paxCount: String(job.paxCount),
    coordinator: job.coordinator,
    leaderFee: String(job.leaderFee),
    budget: String(job.budget),
    note: job.note,
  };
}

/** เปิดเมื่อ open = true เท่านั้น เพื่อให้ฟอร์มเริ่มต้นใหม่ทุกครั้ง (ไม่ต้อง reset ผ่าน effect) */
export function JobFormModal({
  open,
  onClose,
  job,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  job: TourJob | null;
  /** ใช้เมื่อกดสร้างงานจากวันที่ในปฏิทิน */
  initialDate?: string;
}) {
  if (!open) return null;
  return (
    <JobForm
      key={job?.id ?? `new-${initialDate ?? ''}`}
      onClose={onClose}
      job={job}
      initialDate={initialDate}
    />
  );
}

function JobForm({
  onClose,
  job,
  initialDate,
}: {
  onClose: () => void;
  job: TourJob | null;
  initialDate?: string;
}) {
  const { master, countries, saveJob, createJobId, saving, currentUser, today } = useDemo();
  const [form, setForm] = useState<FormState>(
    job
      ? toForm(job)
      : {
          ...emptyForm,
          coordinator: currentUser.name,
          departDate: initialDate ?? '',
          meetingDate: initialDate ?? '',
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) next.title = 'กรุณากรอกชื่อโปรแกรมทัวร์';
    if (!form.customer.trim()) next.customer = 'กรุณาระบุลูกค้าหรือบริษัทคู่ค้า';
    if (!form.country) next.country = 'กรุณาเลือกประเทศ';
    if (!form.departDate) next.departDate = 'กรุณาเลือกวันเดินทาง';
    if (!form.returnDate) next.returnDate = 'กรุณาเลือกวันเดินทางกลับ';
    if (form.departDate && form.returnDate && diffDays(form.departDate, form.returnDate) < 0)
      next.returnDate = 'วันกลับต้องไม่อยู่ก่อนวันเดินทาง';
    if (!form.paxCount.trim()) next.paxCount = 'กรุณาระบุจำนวนผู้เดินทาง';
    else if (Number.isNaN(Number(form.paxCount)) || Number(form.paxCount) < 0)
      next.paxCount = 'จำนวนผู้เดินทางต้องเป็นตัวเลข';
    if (form.leaderFee && Number.isNaN(Number(form.leaderFee)))
      next.leaderFee = 'ค่าตอบแทนต้องเป็นตัวเลข';
    if (form.budget && Number.isNaN(Number(form.budget))) next.budget = 'งบประมาณต้องเป็นตัวเลข';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    const id = job?.id ?? (await createJobId());
    const meetingDateTime = `${form.meetingDate || form.departDate}T${form.meetingTime || '00:00'}`;

    const next: TourJob = {
      ...(job ?? {
        id,
        leaderId: null,
        assistantLeaderIds: [],
        attachments: [],
        status: 'draft' as const,
        history: [makeStatusEvent(null, 'draft', currentUser.name, `${today}T09:00`)],
      }),
      id,
      title: form.title.trim(),
      customer: form.customer.trim(),
      country: form.country,
      customerGroup: form.customerGroup || undefined,
      cities: form.cities
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      route: form.route.trim() || `กรุงเทพฯ – ${form.country} – กรุงเทพฯ`,
      departDate: form.departDate,
      returnDate: form.returnDate,
      meetingDateTime,
      meetingPoint: form.meetingPoint.trim(),
      outboundFlight: {
        flightNo: form.outboundNo.trim() || '—',
        route: form.outboundRoute.trim() || '—',
        departAt: `${form.departDate}T00:00`,
        arriveAt: `${form.departDate}T00:00`,
      },
      inboundFlight: {
        flightNo: form.inboundNo.trim() || '—',
        route: form.inboundRoute.trim() || '—',
        departAt: `${form.returnDate}T00:00`,
        arriveAt: `${form.returnDate}T00:00`,
      },
      paxCount: Number(form.paxCount || 0),
      coordinator: form.coordinator.trim(),
      leaderFee: Number(form.leaderFee || 0),
      budget: Number(form.budget || 0),
      note: form.note,
    } as TourJob;

    await saveJob(next);
    onClose();
  };

  const countryOptions = countries
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.nameTh, label: `${c.nameEn} — ${c.nameTh}` }));

  const groupOptions = master.customerGroups
    .filter((g) => g.active && g.code !== 'GROUP_ALL')
    .map((g) => ({ value: g.name, label: g.name }));

  const duration =
    form.departDate && form.returnDate && diffDays(form.departDate, form.returnDate) >= 0
      ? diffDays(form.departDate, form.returnDate) + 1
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={job ? `แก้ไขงาน ${job.id}` : 'สร้างงานทัวร์ใหม่'}
      description="งานที่สร้างใหม่จะอยู่ในสถานะ “ร่าง” — จัดหัวหน้าทัวร์ได้จากหน้ารายละเอียดงาน"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {job ? 'บันทึกการแก้ไข' : 'สร้างงาน'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-2 text-sm font-semibold zego-text">ข้อมูลงาน</legend>
          <TextInput
            label="ชื่อโปรแกรมทัวร์"
            required
            placeholder="เช่น ญี่ปุ่น โตเกียว–โอซาก้า 6 วัน 4 คืน"
            value={form.title}
            error={errors.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="ลูกค้า / บริษัทคู่ค้า"
              required
              value={form.customer}
              error={errors.customer}
              onChange={(e) => set('customer', e.target.value)}
            />
            <SelectInput
              label="ประเทศ"
              required
              placeholder="เลือกประเทศ"
              options={countryOptions}
              value={form.country}
              error={errors.country}
              onChange={(e) => set('country', e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput
              label="ประเภทกรุ๊ป"
              placeholder="เลือกประเภทกรุ๊ป (ไม่บังคับ)"
              options={groupOptions}
              value={form.customerGroup}
              hint="ใช้จับคู่กับความถนัดของหัวหน้าทัวร์"
              onChange={(e) => set('customerGroup', e.target.value)}
            />
            <TextInput
              label="เมือง"
              placeholder="คั่นด้วยจุลภาค เช่น โตเกียว, เกียวโต"
              value={form.cities}
              onChange={(e) => set('cities', e.target.value)}
            />
            <TextInput
              label="เส้นทาง"
              placeholder="กรุงเทพฯ – โตเกียว – กรุงเทพฯ"
              value={form.route}
              onChange={(e) => set('route', e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 zego-divider-top pt-5">
          <legend className="mb-2 text-sm font-semibold zego-text">วันเดินทางและนัดหมาย</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="วันเดินทางไป"
              required
              value={form.departDate}
              error={errors.departDate}
              onChange={(v) => set('departDate', v)}
            />
            <DateField
              label="วันเดินทางกลับ"
              required
              value={form.returnDate}
              min={form.departDate || undefined}
              error={errors.returnDate}
              hint={duration ? `รวม ${duration} วัน` : undefined}
              onChange={(v) => set('returnDate', v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField
              label="วันนัดหมาย"
              value={form.meetingDate}
              onChange={(v) => set('meetingDate', v)}
            />
            <TimeField
              label="เวลานัดหมาย"
              value={form.meetingTime}
              onChange={(v) => set('meetingTime', v)}
            />
            <TextInput
              label="สนามบิน / จุดนัดพบ"
              value={form.meetingPoint}
              onChange={(e) => set('meetingPoint', e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 zego-divider-top pt-5">
          <legend className="mb-2 text-sm font-semibold zego-text">เที่ยวบิน</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="เที่ยวบินขาไป"
              placeholder="TG-660"
              value={form.outboundNo}
              onChange={(e) => set('outboundNo', e.target.value)}
            />
            <TextInput
              label="เส้นทางขาไป"
              placeholder="BKK – HND"
              value={form.outboundRoute}
              onChange={(e) => set('outboundRoute', e.target.value)}
            />
            <TextInput
              label="เที่ยวบินขากลับ"
              placeholder="TG-623"
              value={form.inboundNo}
              onChange={(e) => set('inboundNo', e.target.value)}
            />
            <TextInput
              label="เส้นทางขากลับ"
              placeholder="KIX – BKK"
              value={form.inboundRoute}
              onChange={(e) => set('inboundRoute', e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 zego-divider-top pt-5">
          <legend className="mb-2 text-sm font-semibold zego-text">
            ผู้เดินทาง ค่าตอบแทน และงบประมาณ
          </legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput
              label="จำนวนผู้เดินทาง"
              required
              inputMode="numeric"
              value={form.paxCount}
              error={errors.paxCount}
              onChange={(e) => set('paxCount', e.target.value)}
            />
            <TextInput
              label="ผู้ประสานงาน"
              value={form.coordinator}
              onChange={(e) => set('coordinator', e.target.value)}
            />
            <TextInput
              label="ค่าตอบแทน (บาท)"
              inputMode="numeric"
              value={form.leaderFee}
              error={errors.leaderFee}
              onChange={(e) => set('leaderFee', e.target.value)}
            />
            <TextInput
              label="งบประมาณ (บาท)"
              inputMode="numeric"
              value={form.budget}
              error={errors.budget}
              onChange={(e) => set('budget', e.target.value)}
            />
          </div>
          <TextArea
            label="หมายเหตุ"
            rows={2}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </fieldset>

        {!job && (
          <Callout tone="blue" title="ขั้นตอนถัดไป">
            หลังบันทึก งานจะอยู่ในสถานะ “ร่าง” เปิดหน้ารายละเอียดงานเพื่อเลือกหัวหน้าทัวร์
            ระบบจะแสดงคะแนนความเหมาะสมและเตือนเมื่อพบตารางงานซ้อน
          </Callout>
        )}
      </div>
    </Modal>
  );
}
