'use client';

/**
 * การลา — /staff/leave (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * ยื่นคำขอลาเอง (สถานะ "รอคอนเฟิร์ม") → ผู้จัดคอนเฟิร์ม/ปฏิเสธที่หน้ารายละเอียดเจ้าหน้าที่ (แท็บสถานะ/การลา)
 * ใช้ข้อมูลชุดเดียวกับฝั่งผู้จัด (sendOffStaffLeave) — วันลาที่คอนเฟิร์มแล้วจะถูกข้ามตอนจัดตาราง
 * ถอนคำขอได้เองเฉพาะที่ยังรอคอนเฟิร์ม
 * เลือกวันลาจากปฏิทินรายเดือน: เลือกได้ครั้งละ 1 วัน (แตะวันอื่น = เปลี่ยนวัน · แตะซ้ำ = เอาออก) → "ขอลา" เปิดฟอร์มพร้อมวันที่
 * ส่งครั้งเดียว = คำขอลาตามช่วงวันที่ติดกัน (6, 9–10 → 2 คำขอ) — ผู้จัดคอนเฟิร์มทีละช่วงได้
 * ปฏิทินระบายสีวันที่ลาอยู่แล้ว (รอคอนเฟิร์ม / คอนเฟิร์มแล้ว) และจุดวันที่มีงานส่งกรุ๊ป · วันที่ผ่านมาแล้วเลือกไม่ได้
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { buildMonthGrid, monthTitle, shiftMonth } from '@/lib/logic/calendar';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, cx, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea } from '@/components/ui/FormField';
import { formatDate, formatDateTime, parseDate, TH_WEEKDAYS_SHORT, toISODateTime } from '@/lib/format';
import { cancelSendOffLeave, loadSendOffLeave, nextSendOffLeaveId, upsertSendOffLeave } from '@/services/sendOffStaffLeaveStore';
import {
  activeLeaveOn, leaveDatesLabel, leaveDayCount, leaveRangesOf, SEND_OFF_LEAVE_STATUS, SEND_OFF_LEAVE_TYPE, SEND_OFF_LEAVE_TYPE_ORDER,
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
                    <p className="text-sm font-semibold zego-text">{SEND_OFF_LEAVE_TYPE[r.type].label} · {leaveDayCount(r)} วัน</p>
                    <p className="text-xs zego-text-secondary">
                      {formatDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}
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
          dates={picked}
          onClose={() => setOpen(false)}
          onSubmit={(v) => {
            try {
              // ช่วงวันที่ติดกัน = คำขอ 1 รายการ
              let rows = loadSendOffLeave();
              // กันอีกชั้น — วันที่มีงานส่งกรุ๊ปไม่ส่งเป็นคำขอลา
              const busy = new Set(duties.map((d) => d.dutyDate));
              for (const r of leaveRangesOf(picked.filter((d) => !busy.has(d)))) {
                rows = upsertSendOffLeave({
                  id: nextSendOffLeaveId(rows),
                  staffId,
                  ...v,
                  ...r,
                  status: 'pending',
                  requestedBy: currentUser.name,
                  requestedAt: toISODateTime(new Date()),
                });
              }
              setAll(rows);
              pushToast('success', 'ส่งคำขอลาแล้ว', `${leaveDatesLabel(picked)} · รอผู้จัดคอนเฟิร์ม`);
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

function LeaveRequestModal({
  dates,
  onClose,
  onSubmit,
}: {
  /** วันที่เลือกจากปฏิทิน (ไม่มีวันที่มีงานส่งกรุ๊ป — เลือกไม่ได้ตั้งแต่ปฏิทิน) */
  dates: string[];
  onClose: () => void;
  onSubmit: (v: { type: SendOffLeaveType; reason: string }) => void;
}) {
  const [type, setType] = useState<SendOffLeaveType>('personal');
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="ขอลา"
      description="ส่งให้ผู้จัดคอนเฟิร์ม — ระหว่างรอยังอาจถูกจัดงานได้"
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={dates.length === 0} onClick={() => onSubmit({ type, reason: reason.trim() })}>ส่งคำขอ</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
          <p className="text-xs zego-text-tertiary">วันที่ลา</p>
          <p className="text-sm font-semibold zego-text">{leaveDatesLabel(dates)}</p>
        </div>
        <SelectInput
          label="ประเภทการลา"
          value={type}
          onChange={(e) => setType(e.target.value as SendOffLeaveType)}
          options={SEND_OFF_LEAVE_TYPE_ORDER.map((t) => ({ value: t, label: SEND_OFF_LEAVE_TYPE[t].label }))}
        />
        <TextArea label="เหตุผล" optional rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
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
            : 'แตะวันที่ต้องการลา'}
        </p>
        {picked.length > 0 && <Button size="sm" variant="ghost" onClick={onClear}>ล้าง</Button>}
        <Button size="sm" variant="primary" icon="plus" disabled={picked.length === 0} onClick={onRequest}>ขอลา</Button>
      </div>
    </Card>
  );
}
