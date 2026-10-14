/**
 * คิวนัดเคลียร์เงินของแต่ละนัด/กรุ๊ป — ญี่ปุ่น (30 นาที) · ประเทศอื่น (10 นาที) · เจ้าหน้าที่คนละคน
 *
 * แยกจาก appointmentSlots.ts เพราะต้องอ่านข้อมูลกรุ๊ป (ประเทศ) — ไฟล์ช่องเวลายังเป็นฟังก์ชันบริสุทธิ์ทดสอบได้ลำพัง
 * นัดที่บันทึกช่องไว้ (lane) ใช้ค่านั้น · นัดเก่าที่ยังไม่มี → ดูประเทศของกรุ๊ป · ไม่ผูกกรุ๊ป = ประเทศอื่น
 */

import type { Appointment } from '@/types';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { countryNameOfGroup } from './advanceDocFallback';
import { LANE_DURATION, laneOfCountry, type ClearLane } from './appointmentSlots';

export function laneOfPeriod(periodId: string | null | undefined): ClearLane {
  if (!periodId) return 'other';
  const p = getTourPeriodById(periodId);
  return laneOfCountry(p?.countryName || countryNameOfGroup(p?.groupCode ?? periodCodeOf(periodId)));
}

export function laneOfAppointment(a: Pick<Appointment, 'lane' | 'jobId'>): ClearLane {
  return a.lane ?? laneOfPeriod(a.jobId);
}

/** นัดในคิวเดียวกัน — ส่งต่อให้ฟังก์ชันช่องเวลา (นัดคนละคิวไม่ชนกัน) */
export function sameLane(appointments: Appointment[], lane: ClearLane): Appointment[] {
  return appointments.filter((a) => laneOfAppointment(a) === lane);
}

/** ความยาวนัดเคลียร์เงินของกรุ๊ปนี้ */
export function clearDurationOf(periodId: string | null | undefined): number {
  return LANE_DURATION[laneOfPeriod(periodId)];
}
