/**
 * นัดหมาย — ที่เก็บถาวรชุดเดียวของทั้งระบบ (ปฏิทินรวมเมนูนัดหมาย · นัดเคลียร์เงินกรุ๊ป · พอร์ทัลหัวหน้าทัวร์)
 *
 * เดิมนัดหมายมาจากข้อมูลจำลอง (JOB-…) และไม่ถูกบันทึก — รีเฟรชแล้วหาย
 * ตอนนี้เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import type { Appointment } from '@/types';
import { readJson, writeJson } from './browserStorage';

const KEY = 'appointments';

export function loadAppointments(): Appointment[] {
  const rows = readJson<unknown>(KEY, []);
  return Array.isArray(rows) ? (rows as Appointment[]) : [];
}

export function persistAppointment(appt: Appointment): void {
  const rest = loadAppointments().filter((a) => a.id !== appt.id);
  writeJson(KEY, [appt, ...rest]);
}

/** เลขนัดถัดไป APT-<ปี>-NNN — นับต่อจากเลขสูงสุดที่มีอยู่ (รีเฟรชแล้วไม่ซ้ำ) */
export function nextAppointmentId(existing: Appointment[], year = new Date().getFullYear()): string {
  const max = existing
    .map((a) => a.id.match(/^APT-(\d{4})-(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m && Number(m[1]) === year)
    .reduce((n, m) => Math.max(n, Number(m[2])), 0);
  return `APT-${year}-${String(max + 1).padStart(3, '0')}`;
}

/** นัดเคลียร์เงินของกรุ๊ป — นัดล่าสุดที่ยังไม่ยกเลิก (ไม่มี = ยังไม่นัด) */
export function clearAppointmentOf(appointments: Appointment[], periodId: string): Appointment | null {
  return appointments
    .filter((a) => a.kind === 'clear' && a.jobId === periodId && a.status !== 'cancelled')
    .sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;
}
