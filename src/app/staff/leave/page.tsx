'use client';

/**
 * การลา — /staff/leave (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * ยื่นคำขอลาเอง (สถานะ "รอคอนเฟิร์ม") → ผู้จัดคอนเฟิร์ม/ปฏิเสธที่หน้ารายละเอียดเจ้าหน้าที่ (แท็บสถานะ/การลา)
 * ใช้ข้อมูลชุดเดียวกับฝั่งผู้จัด (sendOffStaffLeave) — วันลาที่คอนเฟิร์มแล้วจะถูกข้ามตอนจัดตาราง
 * ถอนคำขอได้เองเฉพาะที่ยังรอคอนเฟิร์ม
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { formatDate, formatDateTime, toISODateTime } from '@/lib/format';
import { cancelSendOffLeave, loadSendOffLeave, nextSendOffLeaveId, upsertSendOffLeave } from '@/services/sendOffStaffLeaveStore';
import {
  leaveDayCount, SEND_OFF_LEAVE_STATUS, SEND_OFF_LEAVE_TYPE, SEND_OFF_LEAVE_TYPE_ORDER, type SendOffLeaveRecord, type SendOffLeaveType,
} from '@/lib/logic/sendOffStaffLeave';
import { useStaffPortal } from '../useStaffPortal';

export default function StaffLeavePage() {
  const { currentUser, pushToast } = useDemo();
  const { staffId, today } = useStaffPortal();
  const [all, setAll] = useState<SendOffLeaveRecord[]>(() => loadSendOffLeave());
  const [open, setOpen] = useState(false);
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
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold zego-text">การลา</h1>
          <p className="text-xs zego-text-tertiary">ยื่นคำขอลา · ผู้จัดคอนเฟิร์มแล้วจะไม่ถูกจัดงานในวันนั้น</p>
        </div>
        <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>ขอลา</Button>
      </div>

      {mine.length === 0 ? (
        <Card><EmptyState icon="clock" title="ยังไม่มีคำขอลา" description="กด “ขอลา” เพื่อแจ้งวันที่ไม่สะดวกรับงานส่งกรุ๊ป" /></Card>
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
          today={today}
          onClose={() => setOpen(false)}
          onSubmit={(v) => {
            try {
              const rows = loadSendOffLeave();
              setAll(upsertSendOffLeave({
                id: nextSendOffLeaveId(rows),
                staffId,
                ...v,
                status: 'pending',
                requestedBy: currentUser.name,
                requestedAt: toISODateTime(new Date()),
              }));
              pushToast('success', 'ส่งคำขอลาแล้ว', 'รอผู้จัดคอนเฟิร์ม');
              setOpen(false);
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
  today,
  onClose,
  onSubmit,
}: {
  today: string;
  onClose: () => void;
  onSubmit: (v: { type: SendOffLeaveType; startDate: string; endDate: string; reason: string }) => void;
}) {
  const [type, setType] = useState<SendOffLeaveType>('personal');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const bad = !startDate || !endDate || endDate < startDate;
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
          <Button variant="primary" disabled={bad} onClick={() => onSubmit({ type, startDate, endDate, reason: reason.trim() })}>ส่งคำขอ</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <SelectInput
          label="ประเภทการลา"
          value={type}
          onChange={(e) => setType(e.target.value as SendOffLeaveType)}
          options={SEND_OFF_LEAVE_TYPE_ORDER.map((t) => ({ value: t, label: SEND_OFF_LEAVE_TYPE[t].label }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <TextInput label="ตั้งแต่วันที่" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
          <TextInput label="ถึงวันที่" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} error={endDate < startDate ? 'ต้องไม่ก่อนวันเริ่ม' : undefined} />
        </div>
        <TextArea label="เหตุผล" optional rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}
