'use client';

/**
 * การจองนัดเคลียร์เงินของเจ้าหน้าที่ — บอกทุกคนว่ากรุ๊ปนี้มีคนรับแล้ว กันเรียก/ทำซ้ำ
 *   เรียกแล้ว (calledEarly) — กด "เรียกคิวถัดไป" / "เรียกเข้าพบเลย"
 *   กำลังดำเนินการ (inProgress) — เปิดหน้าต่างเคลียร์เงินของกรุ๊ปที่มีนัดวันนี้ (เฉพาะคนที่จองไว้ หรือยังไม่มีใครจอง)
 *   หมดผล: ปิดเคลียร์ (นัดเป็นเข้าพบแล้ว) · ยกเลิก/เลื่อนนัด · "คืนคิว" / "ปลดสถานะ" เอง
 */

import { useDemo } from '@/store/DemoStore';
import { toISODateTime } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import type { Appointment } from '@/types';

/** กำลังดำเนินการอยู่จริงไหม (นัดยังไม่จบ) */
export function isInProgress(a: Appointment | null | undefined): a is Appointment & { inProgress: { at: string; by: string } } {
  return !!a?.inProgress && a.status !== 'attended' && a.status !== 'cancelled';
}

/** คนที่จองนัดนี้อยู่ (กำลังทำ > เรียกแล้ว) · ไม่มี = ยังว่าง */
export function claimedBy(a: Appointment | null | undefined): string | null {
  if (!a || a.status === 'attended' || a.status === 'cancelled') return null;
  return a.inProgress?.by ?? a.calledEarly?.by ?? null;
}

export function useClearProgress() {
  const { saveAppointment, currentUser } = useDemo();
  const me = currentUser.name;
  return {
    me,
    start: (a: Appointment) => saveAppointment({ ...a, inProgress: { at: toISODateTime(new Date()), by: me } }),
    /** ปลดสถานะกำลังทำ — ยังถือคิวไว้ (ถ้าเรียกไว้แล้ว) */
    release: (a: Appointment) => {
      const rest: Appointment = { ...a };
      delete rest.inProgress;
      return saveAppointment(rest);
    },
    /** คืนคิว — ปล่อยทั้งการเรียกและกำลังทำ กลับไปให้คนถัดไปเรียกได้ */
    releaseAll: (a: Appointment) => {
      const at = toISODateTime(new Date());
      const rest: Appointment = { ...a, history: [...a.history, makeStatusEvent(a.status, a.status, me, at, 'คืนคิว — ยังไม่ได้เคลียร์')] };
      delete rest.inProgress;
      delete rest.calledEarly;
      return saveAppointment(rest);
    },
    /** รับช่วงต่อจากคนอื่น — บันทึกในประวัติว่ารับจากใคร */
    takeOver: (a: Appointment) => {
      const at = toISODateTime(new Date());
      const from = claimedBy(a) ?? '—';
      return saveAppointment({
        ...a,
        inProgress: { at, by: me },
        ...(a.calledEarly ? { calledEarly: { ...a.calledEarly, by: me } } : {}),
        history: [...a.history, makeStatusEvent(a.status, a.status, me, at, `รับช่วงเคลียร์ต่อจาก ${from}`)],
      });
    },
  };
}
