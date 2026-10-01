'use client';

/**
 * ฟอร์มเพิ่ม/แก้ไข "วันลา / ช่วงไม่พร้อมรับงาน" (§5/§6)
 * รองรับทั้งวันและช่วงเวลา (HH:mm 24 ชม.) · ตรวจว่าเวลาสิ้นสุด ≥ เวลาเริ่ม
 * ผู้จัด/แอดมินบันทึก → อนุมัติทันที · หัวหน้าทัวร์แจ้งเอง → รออนุมัติ (§7)
 */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Primitives';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { useDemo } from '@/store/DemoStore';
import { saveErrorMessage } from '@/services/browserStorage';
import {
  AVAILABILITY_TYPE,
  AVAILABILITY_TYPE_ORDER,
  isValidAvailabilityType,
} from '@/lib/logic/availabilityStatus';
import type {
  AvailabilityRecordType,
  LeaderAvailabilityRecord,
  Role,
  TourLeader,
} from '@/types';

export function AvailabilityFormModal({
  open,
  onClose,
  leader,
  record,
  currentUserRole,
  currentUserName,
  initialStartDate,
  initialEndDate,
  initialAllDay,
}: {
  open: boolean;
  onClose: () => void;
  leader: TourLeader;
  record: LeaderAvailabilityRecord | null;
  currentUserRole: Role;
  currentUserName: string;
  /** ค่าเริ่มต้นเมื่อเปิดจากปฏิทิน (คลิก/ลากเลือกวัน) */
  initialStartDate?: string;
  initialEndDate?: string;
  initialAllDay?: boolean;
}) {
  if (!open) return null;
  return (
    <FormBody
      key={record?.id ?? `new-${initialStartDate ?? ''}-${initialEndDate ?? ''}`}
      onClose={onClose}
      leader={leader}
      record={record}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
      initialAllDay={initialAllDay}
    />
  );
}

function FormBody({
  onClose,
  leader,
  record,
  currentUserRole,
  currentUserName,
  initialStartDate,
  initialEndDate,
  initialAllDay,
}: {
  onClose: () => void;
  leader: TourLeader;
  record: LeaderAvailabilityRecord | null;
  currentUserRole: Role;
  currentUserName: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialAllDay?: boolean;
}) {
  const { saveAvailabilityRecord, createAvailabilityId, saving, today } = useDemo();
  const isManager = currentUserRole === 'admin' || currentUserRole === 'coordinator';

  const [type, setType] = useState<AvailabilityRecordType>(record?.type ?? 'personal_leave');
  const [startDate, setStartDate] = useState(record?.startDate ?? initialStartDate ?? today);
  const [endDate, setEndDate] = useState(record?.endDate ?? initialEndDate ?? initialStartDate ?? today);
  // §4 ค่าเริ่มต้นเมื่อระบุเวลา: 09:00–18:00
  const [startTime, setStartTime] = useState(record?.startTime || '09:00');
  const [endTime, setEndTime] = useState(record?.endTime || '18:00');
  const [isAllDay, setIsAllDay] = useState(record?.isAllDay ?? initialAllDay ?? false);
  const [blocks, setBlocks] = useState(record?.blocksAssignment ?? true);
  const [reason, setReason] = useState(record?.reason ?? '');
  const [internalNote, setInternalNote] = useState(record?.internalNote ?? '');

  type FieldErrors = {
    start?: string;
    end?: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
    general?: string;
  };
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearErrors = () => setErrors({});

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!isValidAvailabilityType(type)) e.general = 'ประเภทไม่ถูกต้อง';
    // §5 วันที่
    if (!startDate) e.start = 'กรุณาระบุวันที่ให้ถูกต้องในรูปแบบ dd/mm/yy';
    if (!endDate) e.end = 'กรุณาระบุวันที่ให้ถูกต้องในรูปแบบ dd/mm/yy';
    if (startDate && endDate && endDate < startDate) e.end = 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น';
    // §6 เวลา (เฉพาะเมื่อไม่ใช่ทั้งวัน)
    if (!isAllDay) {
      if (!startTime) e.startTime = 'กรุณาระบุเวลาเริ่มต้น';
      if (!endTime) e.endTime = 'กรุณาระบุเวลาสิ้นสุด';
      // วันเดียวกัน → เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม · คนละวัน → ข้ามวันได้
      if (startDate && endDate && startDate === endDate && startTime && endTime && endTime <= startTime) {
        e.endTime = 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น';
      }
    }
    return e;
  };

  const submit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    const now = `${today}T09:00`;
    const approval = record?.approval ?? (isManager ? 'approved' : 'pending');
    const id = record?.id ?? createAvailabilityId();
    const next: LeaderAvailabilityRecord = {
      id,
      leaderId: leader.id,
      type,
      startDate,
      endDate,
      startTime: isAllDay ? '' : startTime,
      endTime: isAllDay ? '' : endTime,
      isAllDay,
      blocksAssignment: blocks,
      reason: reason.trim(),
      internalNote: internalNote.trim() || undefined,
      approval,
      createdBy: record?.createdBy ?? currentUserName,
      createdByRole: record?.createdByRole ?? currentUserRole,
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
      history: record?.history ?? [
        {
          id: `AVH-${id}`,
          at: now,
          from: null,
          to: approval,
          by: currentUserName,
        },
      ],
    };
    // ปิด Modal หลังบันทึกสำเร็จเท่านั้น — ล้มเหลวจะคงฟอร์มไว้พร้อมสาเหตุจริง
    try {
      await saveAvailabilityRecord(next);
      onClose();
    } catch (err) {
      setErrors({ general: saveErrorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={record ? 'แก้ไขวันลา/ช่วงไม่พร้อม' : 'เพิ่มวันลา/ช่วงไม่พร้อม'}
      description={`${leader.firstName} ${leader.lastName} · ${leader.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" icon="check" onClick={submit} loading={saving}>
            {isManager ? 'บันทึก' : 'ส่งคำขอ (รออนุมัติ)'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          หัวหน้าทัวร์: <strong className="zego-text-secondary">{leader.firstName} {leader.lastName}</strong>
          {' '}(กำหนดไว้แล้ว)
        </div>

        <SelectInput
          label="ประเภท"
          required
          value={type}
          onChange={(e) => {
            setType(e.target.value as AvailabilityRecordType);
            clearErrors();
          }}
          options={AVAILABILITY_TYPE_ORDER.map((t) => ({ value: t, label: AVAILABILITY_TYPE[t].label }))}
        />

        {/* §1/§7 สลับ ทั้งวัน ↔ ระบุเวลา — ไม่ล้างวันที่ */}
        <label className="flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--zego-primary-500)]"
            checked={isAllDay}
            onChange={(e) => {
              setIsAllDay(e.target.checked);
              clearErrors();
            }}
          />
          ลาทั้งวัน (00:00–23:59)
        </label>

        {isAllDay ? (
          // §3 ทั้งวัน: วันที่เริ่ม + วันที่สิ้นสุด (ซ่อนเวลา)
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label="วันที่เริ่ม"
              required
              value={startDate}
              onChange={(v) => {
                setStartDate(v);
                clearErrors();
              }}
              error={errors.start}
            />
            <DateField
              label="วันที่สิ้นสุด"
              required
              value={endDate}
              onChange={(v) => {
                setEndDate(v);
                clearErrors();
              }}
              min={startDate}
              error={errors.end}
            />
          </div>
        ) : (
          // §3 ระบุเวลา: [วันที่เริ่ม][เวลาเริ่ม][วันที่สิ้นสุด][เวลาสิ้นสุด] (Desktop 4 คอลัมน์ · Mobile เรียงลง)
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DateField
              label="วันที่เริ่ม"
              required
              value={startDate}
              onChange={(v) => {
                setStartDate(v);
                clearErrors();
              }}
              error={errors.start}
            />
            <TimeField
              label="เวลาเริ่ม"
              required
              value={startTime}
              onChange={(v) => {
                setStartTime(v);
                clearErrors();
              }}
              error={errors.startTime}
            />
            <DateField
              label="วันที่สิ้นสุด"
              required
              value={endDate}
              onChange={(v) => {
                setEndDate(v);
                clearErrors();
              }}
              min={startDate}
              error={errors.end}
            />
            <TimeField
              label="เวลาสิ้นสุด"
              required
              value={endTime}
              onChange={(v) => {
                setEndTime(v);
                clearErrors();
              }}
              error={errors.endTime}
            />
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
          <input type="checkbox" className="h-4 w-4 accent-[var(--zego-primary-500)]" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} />
          ปิดรับงานในช่วงนี้ (นำไปตรวจการมอบหมาย)
        </label>

        <TextArea
          label="เหตุผล/รายละเอียด"
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            clearErrors();
          }}
          error={errors.reason}
        />
        {/* ช่องนี้ให้ผู้จัดจดถึงผู้จัดด้วยกัน — ซ่อนตอนหัวหน้าทัวร์กรอกคำขอของตัวเอง (ไม่มีประโยชน์กับผู้กรอก
            แต่ยังคงค่าเดิมไว้ไม่ลบทิ้ง เผื่อเป็นการแก้ไขรายการที่ผู้จัดเคยจดโน้ตไว้ก่อนแล้ว) */}
        {isManager && (
          <TextArea label="หมายเหตุภายใน" rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} hint="เห็นเฉพาะผู้จัด — ไม่แสดงต่อผู้อื่น" />
        )}

        {errors.general && <p className="text-sm font-medium zego-text-danger">{errors.general}</p>}
      </div>
    </Modal>
  );
}
