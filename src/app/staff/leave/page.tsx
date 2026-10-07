'use client';

/**
 * การลา — /staff/leave (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * ยื่นคำขอลาเอง (สถานะ "รอคอนเฟิร์ม") → ผู้จัดคอนเฟิร์ม/ปฏิเสธที่หน้ารายละเอียดเจ้าหน้าที่ (แท็บสถานะ/การลา)
 * ใช้ข้อมูลชุดเดียวกับฝั่งผู้จัด (sendOffStaffLeave) — วันลาที่คอนเฟิร์มแล้วจะถูกข้ามตอนจัดตาราง
 * ถอนคำขอได้เองเฉพาะที่ยังรอคอนเฟิร์ม
 * แตะวันในปฏิทินเพื่อตั้งวันเริ่ม (ไม่บังคับ) → "ขอลา" เปิดฟอร์มแบบเดียวกับฝั่งหัวหน้าทัวร์
 *   (ประเภท · ลาทั้งวัน ↔ ระบุเวลา · วันที่เริ่ม/สิ้นสุด · เหตุผล) — ส่ง 1 ครั้ง = คำขอลา 1 ช่วง
 * ปฏิทินระบายสีวันที่ลาอยู่แล้ว (รอคอนเฟิร์ม / คอนเฟิร์มแล้ว) และจุดวันที่มีงานส่งกรุ๊ป · วันที่ผ่านมาแล้วเลือกไม่ได้
 */

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { buildMonthGrid, monthTitle, shiftMonth } from '@/lib/logic/calendar';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { formatDate, formatDateTime, parseDate, TH_WEEKDAYS_SHORT, toISODateTime } from '@/lib/format';
import { cancelSendOffLeave, loadSendOffLeave, nextSendOffLeaveId, upsertSendOffLeave } from '@/services/sendOffStaffLeaveStore';
import {
  activeLeaveOn, leaveDatesLabel, leaveDayCount, leaveIsAllDay, leaveTimeLabel, SEND_OFF_LEAVE_STATUS, SEND_OFF_LEAVE_TYPE, SEND_OFF_LEAVE_TYPE_ORDER,
  type SendOffLeaveRecord, type SendOffLeaveType,
} from '@/lib/logic/sendOffStaffLeave';
import { useStaffPortal } from '../useStaffPortal';
import type { StaffDuty } from '@/lib/logic/staffPortal';

export default function StaffLeavePage() {
  const { currentUser, pushToast } = useDemo();
  const { staffId, today, duties } = useStaffPortal();
  const [all, setAll] = useState<SendOffLeaveRecord[]>(() => loadSendOffLeave());
  const [open, setOpen] = useState(false);
  /** วันที่เลือกจากปฏิทิน (เรียงแล้ว) */
  const [picked, setPicked] = useState<string[]>([]);
  const mine = all.filter((r) => r.staffId === staffId).sort((a, b) => b.startDate.localeCompare(a.startDate));

  const cancel = (r: SendOffLeaveRecord) => {
    if (!window.confirm(`ถอนคำขอ${SEND_OFF_LEAVE_TYPE[r.type].label} ${formatDate(r.startDate)}${r.endDate !== r.startDate ? `–${formatDate(r.endDate)}` : ''}?`)) return;
    try {
      setAll(cancelSendOffLeave(r.id, currentUser.name));
      pushToast('success', 'ถอนคำขอลาแล้ว');
    } catch {
      pushToast('error', 'ถอนคำขอลาไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        {/* การลาเป็นหน้าย่อยของโปรไฟล์ — ลิงก์กลับเหมือนพอร์ทัลหัวหน้าทัวร์ */}
        <Link href="/staff/profile" className="mb-2 inline-flex items-center gap-1 text-sm font-medium zego-text-success">
          <Icon name="chevronLeft" className="h-4 w-4" />
          โปรไฟล์
        </Link>
        <h1 className="text-lg font-bold zego-text">การลา</h1>
        <p className="text-xs zego-text-tertiary">แตะวันในปฏิทินเพื่อเลือกวันลา · ผู้จัดคอนเฟิร์มแล้วจะไม่ถูกจัดงานในวันนั้น · วันที่มีงานส่งกรุ๊ปแล้วต้องแจ้งผู้จัดโดยตรง</p>
      </div>

      <LeaveCalendar
        today={today}
        records={mine}
        duties={duties}
        picked={picked}
        // ครั้งละ 1 วัน — แตะวันอื่นเปลี่ยนวัน · แตะวันเดิมซ้ำเอาออก
        onPick={(date) => setPicked((d) => (d[0] === date ? [] : [date]))}
        onClear={() => setPicked([])}
        onRequest={() => setOpen(true)}
      />

      <h2 className="text-sm font-semibold zego-text">คำขอลาของฉัน</h2>
      {mine.length === 0 ? (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-3 text-center text-xs zego-text-tertiary">ยังไม่มีคำขอลา</p>
      ) : (
        <ul className="space-y-2">
          {mine.map((r) => (
            <li key={r.id}>
              <Card className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold zego-text">{SEND_OFF_LEAVE_TYPE[r.type].label} · {leaveIsAllDay(r) ? `${leaveDayCount(r)} วัน` : 'บางช่วงเวลา'}</p>
                    <p className="text-xs zego-text-secondary">
                      {formatDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}{leaveTimeLabel(r) ? ` · ${leaveTimeLabel(r)}` : ''}
                    </p>
                  </div>
                  <StatusBadge meta={SEND_OFF_LEAVE_STATUS[r.status]} size="sm" />
                </div>
                {r.reason && <p className="text-xs zego-text-secondary">{r.reason}</p>}
                <p className="text-[11px] zego-text-tertiary">
                  ยื่นเมื่อ {formatDateTime(r.requestedAt)}
                  {r.decidedAt && r.status !== 'pending' ? ` · ${SEND_OFF_LEAVE_STATUS[r.status].label}โดย ${r.decidedBy ?? '—'}` : ''}
                  {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                </p>
                {r.status === 'pending' && (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => cancel(r)}>ถอนคำขอ</Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <LeaveRequestModal
          staffName={currentUser.name}
          today={today}
          initialDate={picked[0]}
          records={mine}
          dutyDates={new Set(duties.map((d) => d.dutyDate))}
          onClose={() => setOpen(false)}
          onSubmit={(v) => {
            try {
              // 1 คำขอ = 1 ช่วงวันที่ตามที่กรอก (เหมือนฝั่งหัวหน้าทัวร์)
              const rows = upsertSendOffLeave({
                id: nextSendOffLeaveId(loadSendOffLeave()),
                staffId,
                ...v,
                status: 'pending',
                requestedBy: currentUser.name,
                requestedAt: toISODateTime(new Date()),
              });
              setAll(rows);
              pushToast('success', 'ส่งคำขอลาแล้ว', `${formatDate(v.startDate)}${v.endDate !== v.startDate ? `–${formatDate(v.endDate)}` : ''} · รอผู้จัดคอนเฟิร์ม`);
              setOpen(false);
              setPicked([]);
            } catch {
              pushToast('error', 'ส่งคำขอลาไม่สำเร็จ');
            }
          }}
        />
      )}
    </div>
  );
}

type LeaveFormValue = { type: SendOffLeaveType; startDate: string; endDate: string; isAllDay: boolean; startTime?: string; endTime?: string; reason: string };

/**
 * ฟอร์มขอลา — หน้าตาและช่องเดียวกับฝั่งหัวหน้าทัวร์ (AvailabilityFormModal):
 *   ประเภท · ลาทั้งวัน ↔ ระบุเวลา · วันที่เริ่ม/สิ้นสุด (+ เวลาเริ่ม/สิ้นสุด) · เหตุผล/รายละเอียด · ส่งคำขอ (รออนุมัติ)
 * วันที่ตั้งต้นจากวันที่แตะในปฏิทิน (แก้ได้) · กติกาเจ้าหน้าที่: ห้ามย้อนหลัง · ห้ามทับวันที่มีงานส่งกรุ๊ป · ห้ามทับคำขอลาเดิม
 */
function LeaveRequestModal({
  staffName,
  today,
  initialDate,
  records,
  dutyDates,
  onClose,
  onSubmit,
}: {
  staffName: string;
  today: string;
  /** วันที่แตะเลือกในปฏิทิน (ไม่มี = วันนี้) */
  initialDate?: string;
  /** คำขอลาของเจ้าหน้าที่คนนี้ — ใช้กันลาทับช่วงเดิม */
  records: SendOffLeaveRecord[];
  /** วันที่มีงานส่งกรุ๊ป — ขอลาในระบบไม่ได้ ต้องแจ้งผู้จัดโดยตรง */
  dutyDates: Set<string>;
  onClose: () => void;
  onSubmit: (v: LeaveFormValue) => void;
}) {
  const [type, setType] = useState<SendOffLeaveType>('personal');
  const [startDate, setStartDate] = useState(initialDate ?? today);
  const [endDate, setEndDate] = useState(initialDate ?? today);
  // ค่าเริ่มต้นเมื่อระบุเวลา 09:00–18:00 เหมือนฝั่งหัวหน้าทัวร์ · เปิดจากวันที่แตะในปฏิทิน = ทั้งวัน
  const [isAllDay, setIsAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  type FieldErrors = { start?: string; end?: string; startTime?: string; endTime?: string; general?: string };
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearErrors = () => setErrors({});

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!startDate) e.start = 'กรุณาระบุวันที่ให้ถูกต้องในรูปแบบ dd/mm/yy';
    else if (startDate < today) e.start = 'ขอลาย้อนหลังไม่ได้';
    if (!endDate) e.end = 'กรุณาระบุวันที่ให้ถูกต้องในรูปแบบ dd/mm/yy';
    if (startDate && endDate && endDate < startDate) e.end = 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น';
    if (!isAllDay) {
      if (!startTime) e.startTime = 'กรุณาระบุเวลาเริ่มต้น';
      if (!endTime) e.endTime = 'กรุณาระบุเวลาสิ้นสุด';
      // วันเดียวกัน → เวลาสิ้นสุดต้องหลังเวลาเริ่ม · คนละวัน → ข้ามวันได้
      if (startDate && endDate && startDate === endDate && startTime && endTime && endTime <= startTime) e.endTime = 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น';
    }
    if (!e.start && !e.end && startDate && endDate) {
      const busy = [...dutyDates].filter((d) => d >= startDate && d <= endDate).sort();
      if (busy.length > 0) e.general = `ช่วงนี้มีงานส่งกรุ๊ป (${busy.map(formatDate).join(', ')}) — ขอลาในระบบไม่ได้ ให้แจ้งผู้จัดสเก็ตโดยตรง`;
      const dup = records.find((r) => (r.status === 'pending' || r.status === 'approved') && r.startDate <= endDate && startDate <= r.endDate);
      if (!e.general && dup) e.general = `ทับกับคำขอ${SEND_OFF_LEAVE_TYPE[dup.type].label} ${formatDate(dup.startDate)}${dup.endDate !== dup.startDate ? `–${formatDate(dup.endDate)}` : ''} ที่มีอยู่แล้ว`;
    }
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    onSubmit({ type, startDate, endDate, isAllDay, ...(isAllDay ? {} : { startTime, endTime }), reason: reason.trim() });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="เพิ่มวันลา/ช่วงไม่พร้อม"
      description="ส่งให้ผู้จัดคอนเฟิร์ม — ระหว่างรอยังอาจถูกจัดงานได้"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" icon="check" onClick={submit}>ส่งคำขอ (รออนุมัติ)</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          เจ้าหน้าที่ส่งกรุ๊ป: <strong className="zego-text-secondary">{staffName}</strong> (กำหนดไว้แล้ว)
        </div>

        <SelectInput
          label="ประเภท"
          required
          value={type}
          onChange={(e) => { setType(e.target.value as SendOffLeaveType); clearErrors(); }}
          options={SEND_OFF_LEAVE_TYPE_ORDER.map((t) => ({ value: t, label: SEND_OFF_LEAVE_TYPE[t].label }))}
        />

        {/* สลับ ทั้งวัน ↔ ระบุเวลา — ไม่ล้างวันที่ */}
        <label className="flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
          <input type="checkbox" className="h-4 w-4 accent-[var(--zego-primary-500)]" checked={isAllDay} onChange={(e) => { setIsAllDay(e.target.checked); clearErrors(); }} />
          ลาทั้งวัน (00:00–23:59)
        </label>

        {isAllDay ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="วันที่เริ่ม" required value={startDate} onChange={(v) => { setStartDate(v); if (v > endDate) setEndDate(v); clearErrors(); }} min={today} error={errors.start} />
            <DateField label="วันที่สิ้นสุด" required value={endDate} onChange={(v) => { setEndDate(v); clearErrors(); }} min={startDate} error={errors.end} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="วันที่เริ่ม" required value={startDate} onChange={(v) => { setStartDate(v); if (v > endDate) setEndDate(v); clearErrors(); }} min={today} error={errors.start} />
            <TimeField label="เวลาเริ่ม" required value={startTime} onChange={(v) => { setStartTime(v); clearErrors(); }} error={errors.startTime} />
            <DateField label="วันที่สิ้นสุด" required value={endDate} onChange={(v) => { setEndDate(v); clearErrors(); }} min={startDate} error={errors.end} />
            <TimeField label="เวลาสิ้นสุด" required value={endTime} onChange={(v) => { setEndTime(v); clearErrors(); }} error={errors.endTime} />
          </div>
        )}

        <TextArea label="เหตุผล/รายละเอียด" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); clearErrors(); }} />

        {errors.general && <p className="text-sm font-medium zego-text-danger">{errors.general}</p>}
      </div>
    </Modal>
  );
}

/**
 * ปฏิทินเลือกวันลา — รายเดือน เริ่มวันอาทิตย์
 * เลือกได้ครั้งละ 1 วัน — วันที่เลือกเป็นวงกลมเขียว · แตะซ้ำเอาออก
 * สี: วงเขียวอ่อน = ลาคอนเฟิร์มแล้ว · วงส้มอ่อน = รอคอนเฟิร์ม · วงฟ้าอ่อน = มีงานส่งกรุ๊ป · กรอบฟ้า = วันที่กำลังดูรายละเอียด
 * วันที่ผ่านมาแล้ว / วันที่ลาอยู่แล้ว / วันที่มีงานส่งกรุ๊ป เลือกไม่ได้ — แต่แตะดูรายละเอียดได้ถ้าวันนั้นมีงาน/การลา
 * กติกา: วันที่มีงานส่งกรุ๊ป (ทั้งคอนเฟิร์มแล้วและรอคอนเฟิร์ม) ขอลาในระบบไม่ได้ ต้องแจ้งผู้จัดสเก็ตโดยตรง
 * แตะวันที่มีกิจกรรม (งานส่งกรุ๊ป · คำขอลา) → แสดงรายละเอียดใต้ปฏิทิน
 */
function LeaveCalendar({
  today,
  records,
  duties,
  picked,
  onPick,
  onClear,
  onRequest,
}: {
  today: string;
  records: SendOffLeaveRecord[];
  duties: StaffDuty[];
  picked: string[];
  onPick: (date: string) => void;
  onClear: () => void;
  onRequest: () => void;
}) {
  const t = parseDate(today);
  const [cursor, setCursor] = useState({ year: t.getFullYear(), month: t.getMonth() });
  const cells = buildMonthGrid(cursor.year, cursor.month, today);
  const dutyDates = new Set(duties.map((d) => d.dutyDate));
  /** วันที่แตะล่าสุด — แสดงรายละเอียดกิจกรรมของวันนั้น */
  const [focus, setFocus] = useState<string | null>(null);
  const focusDuties = focus ? duties.filter((d) => d.dutyDate === focus) : [];
  const focusLeave = focus ? activeLeaveOn(records, focus) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="เดือนก่อน" className="rounded-lg p-1.5 zego-hover-surface" onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}>
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold zego-text">{monthTitle(cursor.year, cursor.month)}</p>
        <button type="button" aria-label="เดือนถัดไป" className="rounded-lg p-1.5 zego-hover-surface" onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}>
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {TH_WEEKDAYS_SHORT.map((w) => <span key={w} className="text-[11px] font-medium zego-text-tertiary">{w}</span>)}
        {cells.map((c) => {
          const leave = activeLeaveOn(records, c.date);
          const on = picked.includes(c.date);
          // วันที่มีงานส่งกรุ๊ป ขอลาในระบบไม่ได้ — ต้องแจ้งผู้จัดโดยตรง
          const disabled = c.date < today || !!leave || dutyDates.has(c.date);
          // มีกิจกรรม = แตะดูรายละเอียดได้ แม้เลือกเป็นวันลาไม่ได้
          const hasActivity = !!leave || dutyDates.has(c.date);
          return (
            <button
              key={c.date}
              type="button"
              disabled={disabled && !hasActivity}
              // active ได้ทีละวัน: แตะวันที่มีงาน/วันลา = ดูรายละเอียด (ล้างวันลาที่เลือกไว้) · แตะวันว่าง = เลือกเป็นวันลา (ปิดรายละเอียด)
              onClick={() => {
                if (disabled) {
                  setFocus(c.date);
                  onClear();
                } else {
                  setFocus(null);
                  onPick(c.date);
                }
              }}
              aria-pressed={on}
              aria-label={`${formatDate(c.date)}${leave ? ` · ${SEND_OFF_LEAVE_STATUS[leave.status].label}` : ''}${dutyDates.has(c.date) ? ' · มีงานส่งกรุ๊ป' : ''}`}
              className="relative flex h-10 items-center justify-center disabled:cursor-not-allowed"
            >
              {/* วงกลมเล็กกลางช่อง — ไม่เต็มช่อง ดูเป็นวันที่แตะเลือก ไม่ใช่บล็อกสี */}
              <span
                className={cx(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums',
                  !c.inMonth && 'opacity-40',
                  on ? 'bg-emerald-600 font-semibold text-white'
                    : leave?.status === 'approved' ? 'bg-emerald-100 text-emerald-800'
                    : leave?.status === 'pending' ? 'bg-amber-100 text-amber-800'
                    // วันที่มีงาน — วงฟ้าอ่อน แตะดูรายละเอียดได้ (ไม่ใช่เทาเหมือนวันที่ปิด) · วันที่ผ่านมาแล้วจางลง
                    : dutyDates.has(c.date) ? cx('bg-sky-100 font-medium text-sky-800', c.date < today && 'opacity-60')
                    : disabled ? 'zego-text-disabled'
                    : 'zego-text zego-hover-surface',
                  c.isToday && !on && 'ring-1 ring-inset ring-emerald-500',
                  focus === c.date && !on && 'ring-2 ring-inset ring-sky-500',
                )}
              >
                {parseDate(c.date).getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] zego-text-tertiary">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />วันที่เลือก</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-100" />ลาคอนเฟิร์มแล้ว</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-100" />รอคอนเฟิร์ม</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-100 ring-1 ring-sky-300" />มีงานส่งกรุ๊ป (แตะดูรายละเอียด · ลาไม่ได้)</span>
      </div>

      {/* รายละเอียดกิจกรรมของวันที่แตะ */}
      {focus && (focusDuties.length > 0 || focusLeave) && (
        <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold zego-text">{formatDate(focus)}</p>
            <button type="button" aria-label="ปิดรายละเอียด" className="rounded p-0.5 zego-text-tertiary hover:bg-white" onClick={() => setFocus(null)}>
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
          {focusDuties.map((d) => (
            <div key={d.assignmentId} className="text-xs">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                <span className="font-semibold zego-text">งานส่งกรุ๊ป {d.period?.groupCode ?? d.periodId}</span>
                {!d.confirmed && <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">รอคอนเฟิร์ม</span>}
              </p>
              {d.period?.displayName && <p className="ml-3 zego-text-secondary">{d.period.displayName}</p>}
              <p className="ml-3 zego-text-tertiary">
                {d.arrivalTime ? `ถึงสนามบิน ${d.arrivalTime} น.` : 'ยังไม่รู้เวลาถึงสนามบิน'}
                {d.airport ? ` · ${d.airport}` : ''}
                {d.flightTime ? ` · เครื่องออก ${d.flightTime}` : ''}
              </p>
            </div>
          ))}
          {focusLeave && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold zego-text">{SEND_OFF_LEAVE_TYPE[focusLeave.type].label}</span>
              <span className="zego-text-secondary">
                {formatDate(focusLeave.startDate)}{focusLeave.endDate !== focusLeave.startDate ? ` – ${formatDate(focusLeave.endDate)}` : ''} · {leaveDayCount(focusLeave)} วัน
              </span>
              <StatusBadge meta={SEND_OFF_LEAVE_STATUS[focusLeave.status]} size="sm" />
              {focusLeave.reason && <p className="w-full zego-text-tertiary">เหตุผล: {focusLeave.reason}</p>}
            </div>
          )}
          {focusDuties.length > 0 && focus >= today && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium zego-text-warning">
              วันนี้มีงานส่งกรุ๊ป — ขอลาในระบบไม่ได้ ถ้าต้องการลาวันนี้ ให้แจ้งผู้จัดสเก็ตโดยตรง
            </p>
          )}
        </div>
      )}

      {/* ช่วงที่เลือก → ขอลา */}
      <div className="flex items-center gap-2 rounded-lg zego-surface-soft-bg px-3 py-2">
        <p className="min-w-0 flex-1 text-xs zego-text-secondary">
          {picked.length > 0
            ? <>วันที่ลา: <b className="zego-text">{leaveDatesLabel(picked)}</b></>
            : 'แตะวันที่ต้องการลา หรือกด “ขอลา” แล้วระบุวันที่'}
        </p>
        {picked.length > 0 && <Button size="sm" variant="ghost" onClick={onClear}>ล้าง</Button>}
        <Button size="sm" variant="primary" icon="plus" onClick={onRequest}>ขอลา</Button>
      </div>
    </Card>
  );
}
