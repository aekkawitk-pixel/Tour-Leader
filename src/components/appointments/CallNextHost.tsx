'use client';

/**
 * เคลียร์เสร็จก่อนเวลา → ถามว่าจะเรียกคิวถัดไปเลยไหม — ใช้ร่วมกันทุกจุดที่ปิดนัด
 *   ปิดเคลียร์เงินกรุ๊ป (GroupClearDrawer) · บันทึกเข้าพบในเมนูนัดหมาย
 *
 * ผู้เรียกแค่ส่ง askCallNext(นัดที่เพิ่งเสร็จ, รายการนัด) — ถ้าเสร็จก่อนเวลานัดจบและมีคิวถัดไป (วันเดียวกัน คิวเดียวกัน)
 * หน้าต่างถามจะขึ้นจาก CallNextHost ที่วางไว้ใน AppShell (อยู่รอดแม้หน้าต่าง/Drawer ที่เรียกจะปิดไปแล้ว)
 * กด "เรียกเข้าพบเลย" = บันทึก calledEarly → หัวหน้าทัวร์เห็นแจ้ง "เข้าพบได้เลย" ในพอร์ทัล + กระดิ่ง
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { appointmentStatusMeta } from '@/lib/labels';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { finishedEarly, LANE_LABEL, nextInQueue } from '@/lib/logic/appointmentSlots';
import { laneOfAppointment } from '@/lib/logic/appointmentLane';
import { toISODateTime } from '@/lib/format';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import type { Appointment } from '@/types';

const EVENT = 'appointment-call-next';

/** เสร็จก่อนเวลาและมีคิวถัดไป → เปิดหน้าต่างถาม · ไม่เข้าเงื่อนไข = ไม่ทำอะไร */
export function askCallNext(done: Appointment, appointments: Appointment[], now = toISODateTime(new Date())): void {
  if (typeof window === 'undefined' || !finishedEarly(done, now)) return;
  const next = nextInQueue(appointments, done, laneOfAppointment);
  if (next) window.dispatchEvent(new CustomEvent(EVENT, { detail: { doneId: done.id, done, nextId: next.id } }));
}

/** เรียกเข้าพบก่อนเวลานัด — บันทึก calledEarly + ประวัติ */
export function useCallIn() {
  const { saveAppointment, currentUser } = useDemo();
  return async (a: Appointment, reason: string) => {
    const at = toISODateTime(new Date());
    await saveAppointment({
      ...a,
      calledEarly: { at, by: currentUser.name },
      history: [...a.history, makeStatusEvent(a.status, a.status, currentUser.name, at, reason)],
    });
  };
}

const groupText = (a: Appointment) => {
  if (!a.jobId) return 'ไม่ผูกกรุ๊ป';
  const p = getTourPeriodById(a.jobId);
  return p ? `${p.groupCode} · ${p.displayName}` : periodCodeOf(a.jobId);
};
const endTime = (t: string, m: number) => {
  const [h, mm] = t.split(':').map(Number);
  const total = h * 60 + mm + m;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function CallNextHost() {
  const { appointments, leaders, saving } = useDemo();
  const callIn = useCallIn();
  const [ask, setAsk] = useState<{ done: Appointment; nextId: string } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ done: Appointment; nextId: string }>).detail;
      setAsk({ done: d.done, nextId: d.nextId });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  // อ่านนัดถัดไปจากรายการล่าสุด — ถ้าถูกเรียก/ยกเลิกไประหว่างนั้นก็ไม่ต้องถามแล้ว
  const next = ask ? appointments.find((a) => a.id === ask.nextId) : undefined;
  if (!ask || !next || next.calledEarly || next.status === 'attended' || next.status === 'cancelled') return null;
  const l = leaders.find((x) => x.id === next.leaderId);
  const leaderName = l ? `${l.firstName} ${l.lastName}`.trim() : next.leaderId;

  return (
    <Modal
      open
      onClose={() => setAsk(null)}
      size="sm"
      title="เสร็จก่อนเวลา — เรียกคิวถัดไปเลยไหม?"
      description={`${groupText(ask.done)} เคลียร์เสร็จก่อนเวลานัดจบ ${endTime(ask.done.time, ask.done.durationMinutes)} น.`}
      footer={(
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsk(null)} disabled={saving}>ไว้ก่อน</Button>
          <Button
            variant="primary"
            icon="bell"
            loading={saving}
            onClick={async () => {
              await callIn(next, `บัญชีเรียกเข้าพบก่อนเวลา — คิวก่อนหน้า (${groupText(ask.done)}) เคลียร์เสร็จเร็ว`);
              setAsk(null);
            }}
          >
            เรียกเข้าพบเลย
          </Button>
        </div>
      )}
    >
      <div className="space-y-2 text-sm">
        <p className="text-xs zego-text-tertiary">คิวถัดไป · คิว{LANE_LABEL[laneOfAppointment(next)]}</p>
        <div className="rounded-lg border zego-border-color px-3 py-2">
          <p className="font-semibold tabular-nums zego-text">นัดเดิม {next.time}–{endTime(next.time, next.durationMinutes)} น.</p>
          <p className="zego-text-secondary">{groupText(next)}</p>
          <p className="text-xs zego-text-tertiary">{leaderName} · {appointmentStatusMeta(next).label}</p>
        </div>
        <p className="text-xs zego-text-tertiary">หัวหน้าทัวร์จะเห็นแจ้ง &quot;บัญชีพร้อมแล้ว เข้าพบได้เลย&quot; ในพอร์ทัลและกระดิ่ง · ถ้ายังมาไม่ได้ ใช้เวลานัดเดิมตามปกติ</p>
      </div>
    </Modal>
  );
}
