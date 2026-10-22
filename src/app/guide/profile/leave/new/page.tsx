'use client';

/**
 * ขอลา — /guide/profile/leave/new (ต้นแบบ C5 · กลับไป "‹ สถานะ/การลา")
 *
 * ฟอร์มสั้น: ประเภทการลา · วันที่เริ่ม/สิ้นสุด (สองคอลัมน์) · ช่วงเวลา · เหตุผล
 * ตรวจให้ก่อนส่ง — ทริปของเราที่ทับกับวันลา (กล่องทอง บอกรหัสกรุ๊ป/วันเดินทาง) และคำขอลาเดิมที่ทับกัน
 * ไม่มีอะไรทับ = กล่องเขียว "ไม่มีทริปทับกับวันลา · ส่งคำขอได้เลย"
 * ทับแล้วยังส่งได้ (ลาป่วยฉุกเฉินเลี่ยงไม่ได้) — ฝ่ายจัดงานเห็นและหาคนแทนเอง
 *
 * บันทึกผ่าน saveAvailabilityRecord ตัวเดียวกับฝั่งผู้จัด → รออนุมัติ · ปิดรับงานในช่วงนี้
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatDateRange, toISODate } from '@/lib/format';
import { AVAILABILITY_TYPE, formatRecordSchedule } from '@/lib/logic/availabilityStatus';
import {
  LEADER_LEAVE_TYPES,
  LEAVE_SPAN_OPTIONS,
  leaveSpanTimes,
  overlappingRecords,
  overlappingTrips,
  type DatedTrip,
  type LeaveSpan,
} from '@/lib/logic/leaveRequest';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { Button, Card, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import type { AvailabilityRecordType, LeaderAvailabilityRecord } from '@/types';
import { ProfileBackHeader } from '../../ProfileBackHeader';

const BACK = { backHref: '/guide/profile/leave', backLabel: 'สถานะ/การลา' };

type Errors = { start?: string; end?: string; startTime?: string; endTime?: string };

export default function GuideLeaveRequestPage() {
  const { currentUser, leaders, availabilityRecords, saveAvailabilityRecord, createAvailabilityId, saving } = useDemo();
  const router = useRouter();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const today = toISODate(new Date());

  const [type, setType] = useState<AvailabilityRecordType>('personal_leave');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [span, setSpan] = useState<LeaveSpan>('full');
  const [customStart, setCustomStart] = useState('09:00');
  const [customEnd, setCustomEnd] = useState('18:00');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ขอลา" {...BACK} />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  // ทริปของเรา — แหล่งเดียวกับหน้าหลัก/งานของฉัน (ไม่นับที่ปฏิเสธ)
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const trips: DatedTrip[] = loadActiveGuideAssignments()
    .filter((a) => a.tourLeaderId === leader.id && a.assignmentStatus !== 'DECLINED')
    .map((a) => periodById.get(a.periodId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ id: p.internalId, code: p.groupCode, startDate: p.startDate, endDate: p.endDate }));

  const multiDay = Boolean(start && end && start !== end);
  // ครึ่งวันใช้ได้เฉพาะลาวันเดียว — เปลี่ยนเป็นหลายวันแล้วถือเป็นทั้งวัน
  const effectiveSpan: LeaveSpan = multiDay && LEAVE_SPAN_OPTIONS.find((o) => o.value === span)?.singleDayOnly ? 'full' : span;
  const datesValid = Boolean(start && end && end >= start);
  const tripHits = datesValid ? overlappingTrips(trips, start, end) : [];
  const dupes = datesValid ? overlappingRecords(availabilityRecords, leader.id, start, end) : [];

  const validate = (): Errors => {
    const e: Errors = {};
    if (!start) e.start = 'กรุณาระบุวันที่เริ่ม';
    if (!end) e.end = 'กรุณาระบุวันที่สิ้นสุด';
    if (start && end && end < start) e.end = 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
    if (effectiveSpan === 'custom') {
      if (!customStart) e.startTime = 'กรุณาระบุเวลาเริ่ม';
      if (!customEnd) e.endTime = 'กรุณาระบุเวลาสิ้นสุด';
      if (!multiDay && customStart && customEnd && customEnd <= customStart) e.endTime = 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const now = new Date();
    const at = `${today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const id = createAvailabilityId();
    const record: LeaderAvailabilityRecord = {
      id,
      leaderId: leader.id,
      type,
      startDate: start,
      endDate: end,
      ...leaveSpanTimes(effectiveSpan, { start: customStart, end: customEnd }),
      blocksAssignment: true,
      reason: reason.trim(),
      approval: 'pending',
      createdBy: currentUser.name,
      createdByRole: currentUser.role,
      createdAt: at,
      updatedAt: at,
      history: [{ id: `AVH-${id}`, at, from: null, to: 'pending', by: currentUser.name }],
    };
    try {
      await saveAvailabilityRecord(record); // แจ้ง "ส่งคำขอวันลาแล้ว (รออนุมัติ)" เอง
      router.push('/guide/profile/leave');
    } catch {
      /* store แจ้งสาเหตุแล้ว — คงฟอร์มไว้ให้ลองใหม่ */
    }
  };

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ขอลา" {...BACK} />

      <Card className="space-y-3">
        <SelectInput
          label="ประเภทการลา"
          required
          value={type}
          onChange={(e) => setType(e.target.value as AvailabilityRecordType)}
          options={LEADER_LEAVE_TYPES.map((t) => ({ value: t, label: AVAILABILITY_TYPE[t].label }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <DateField
            label="วันที่เริ่ม"
            required
            value={start}
            onChange={(v) => {
              setStart(v);
              // เลื่อนวันเริ่มเลยวันสิ้นสุด → ขยับวันสิ้นสุดตาม (ลาวันเดียวเป็นกรณีที่พบบ่อยสุด)
              if (v && (!end || end < v)) setEnd(v);
              setErrors({});
            }}
            error={errors.start}
          />
          <DateField label="วันที่สิ้นสุด" required value={end} min={start} onChange={(v) => { setEnd(v); setErrors({}); }} error={errors.end} />
        </div>

        <SelectInput
          label="ช่วงเวลา"
          value={effectiveSpan}
          onChange={(e) => { setSpan(e.target.value as LeaveSpan); setErrors({}); }}
          options={LEAVE_SPAN_OPTIONS.filter((o) => !(multiDay && o.singleDayOnly)).map((o) => ({ value: o.value, label: o.label }))}
          hint={multiDay ? 'ลาหลายวัน — เลือกได้ทั้งวันหรือระบุเวลาเอง' : undefined}
        />
        {effectiveSpan === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <TimeField label="เวลาเริ่ม" required value={customStart} onChange={(v) => { setCustomStart(v); setErrors({}); }} error={errors.startTime} />
            <TimeField label="เวลาสิ้นสุด" required value={customEnd} onChange={(v) => { setCustomEnd(v); setErrors({}); }} error={errors.endTime} />
          </div>
        )}

        <TextArea
          label="เหตุผล"
          optional
          rows={3}
          value={reason}
          placeholder="เช่น พาครอบครัวไปโรงพยาบาล"
          onChange={(e) => setReason(e.target.value)}
          hint="ฝ่ายจัดงานตอบกลับภายใน 1 วันทำการ"
        />
      </Card>

      {/* ตรวจก่อนส่ง — ทริปที่ทับ · คำขอเดิมที่ทับ · ไม่มีอะไรทับ = เขียว */}
      {datesValid && (tripHits.length > 0 ? (
        <div className="zego-guide-warnbox zego-guide-warnbox--top">
          <span className="zego-guide-warnbox__icon"><Icon name="warning" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">มีทริปทับกับวันลา {tripHits.length} ทริป</p>
            <ul className="zego-guide-warnbox__sub">
              {tripHits.map((t) => <li key={t.id}><span className="zego-guide-code">{t.code}</span> · {formatDateRange(t.startDate, t.endDate)}</li>)}
            </ul>
            <p className="zego-guide-warnbox__sub mt-1">ส่งคำขอได้ — ฝ่ายจัดงานจะติดต่อกลับเรื่องหาคนแทน</p>
          </div>
        </div>
      ) : (
        <div className="zego-guide-warnbox zego-guide-warnbox--ok">
          <span className="zego-guide-warnbox__icon"><Icon name="checkCircle" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">ไม่มีทริปทับกับวันลา</p>
            <p className="zego-guide-warnbox__sub">ส่งคำขอได้เลย</p>
          </div>
        </div>
      ))}
      {dupes.length > 0 && (
        <div className="zego-guide-warnbox zego-guide-warnbox--top">
          <span className="zego-guide-warnbox__icon"><Icon name="calendar" className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="zego-guide-warnbox__title">ช่วงนี้มีคำขอลา/ช่วงไม่ว่างอยู่แล้ว</p>
            <ul className="zego-guide-warnbox__sub">
              {dupes.map((r) => <li key={r.id}>{AVAILABILITY_TYPE[r.type].label} · {formatRecordSchedule(r)}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button className="justify-center" onClick={() => router.push('/guide/profile/leave')} disabled={saving}>ยกเลิก</Button>
        <Button variant="primary" className="justify-center" onClick={submit} loading={saving}>ส่งคำขอลา</Button>
      </div>
    </div>
  );
}
