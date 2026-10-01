/**
 * แหล่งข้อมูลกลาง "วันลาและช่วงไม่พร้อม" — คงอยู่ใน localStorage (Demo)
 *
 * ใช้ Key เดียวทุกจุด (เพิ่ม/แก้/ลบ/โหลด/ปฏิทิน/รายการ) เพื่อกันข้อมูลหายหลัง Refresh
 * ทุกฟังก์ชัน:
 *   • ปลอดภัยกับ SSR/เบราว์เซอร์ที่ปิด localStorage (typeof window + try/catch)
 *   • JSON.parse ปลอดภัย — ข้อมูลเสียไม่ทำหน้าพัง
 *   • ไม่เขียน Array ว่างทับข้อมูลเดิม (seed เฉพาะเมื่อยังไม่มี Key)
 *   • idempotent — ทำงานซ้ำใน React Strict Mode ได้โดยไม่ซ้ำ/ไม่ล้างข้อมูล
 *   • เขียนไม่สำเร็จ → โยน StorageWriteError พร้อมสาเหตุจริง (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ)
 * เก็บ record ตาม tourLeaderId (field `leaderId`) จึงแยกข้อมูลของแต่ละคนได้
 */

import type { LeaderAvailabilityRecord } from '@/types';
import { leaderAvailabilityRecords as seedLeaveEvents } from '@/data/leaderAvailability';
import { canUseStorage, writeJson } from './browserStorage';

/** §1 Key เดียวทั้งระบบ */
export const LEAVE_STORAGE_KEY = 'tourLeaderLeaveEvents';

/** §2 อ่านข้อมูลอย่างปลอดภัย + seed เฉพาะเมื่อยังไม่มี Key (§9) */
export function loadLeaveEvents(): LeaderAvailabilityRecord[] {
  if (!canUseStorage()) return [...seedLeaveEvents]; // SSR / no-storage → ใช้ seed แต่ไม่เขียนทับ
  try {
    const raw = window.localStorage.getItem(LEAVE_STORAGE_KEY);
    if (raw === null) {
      // ยังไม่มี Key → seed หนึ่งครั้ง (idempotent เพราะครั้งถัดไป Key มีแล้ว)
      // seed ล้มเหลวไม่ใช่การกดบันทึกของผู้ใช้ → ปล่อยผ่าน ไม่ให้หน้าเว็บพัง
      try {
        window.localStorage.setItem(LEAVE_STORAGE_KEY, JSON.stringify(seedLeaveEvents));
      } catch { /* quota / โหมดส่วนตัว */ }
      return [...seedLeaveEvents];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...seedLeaveEvents];
    return parsed as LeaderAvailabilityRecord[];
  } catch {
    // ข้อมูลเสีย/Parse ไม่ได้ → คืน seed โดยไม่ทำให้หน้าเว็บพัง และไม่เขียนทับข้อมูลเดิม
    return [...seedLeaveEvents];
  }
}

/** §2 เขียนข้อมูล — เขียนไม่สำเร็จโยน StorageWriteError พร้อมสาเหตุจริง */
export function saveLeaveEvents(events: LeaderAvailabilityRecord[]): void {
  writeJson(LEAVE_STORAGE_KEY, events);
}

/** §3 เพิ่มรายการใหม่ (อ่านล่าสุดก่อน แล้วต่อท้าย ไม่ทับของคนอื่น) — คืน Array ใหม่ทั้งหมด */
export function addLeaveEvent(event: LeaderAvailabilityRecord): LeaderAvailabilityRecord[] {
  const all = loadLeaveEvents().filter((r) => r.id !== event.id); // กันซ้ำ id
  const next = [event, ...all];
  saveLeaveEvents(next);
  return next;
}

/** §4 แก้ไขเฉพาะรายการ id ที่ตรง — รักษารายการอื่นไว้ทั้งหมด */
export function updateLeaveEvent(
  id: string,
  changes: Partial<LeaderAvailabilityRecord>,
): LeaderAvailabilityRecord[] {
  const next = loadLeaveEvents().map((r) => (r.id === id ? { ...r, ...changes } : r));
  saveLeaveEvents(next);
  return next;
}

/** เพิ่มหรือแก้ไข (upsert) ตาม id */
export function upsertLeaveEvent(event: LeaderAvailabilityRecord): LeaderAvailabilityRecord[] {
  const all = loadLeaveEvents();
  const exists = all.some((r) => r.id === event.id);
  const next = exists ? all.map((r) => (r.id === event.id ? event : r)) : [event, ...all];
  saveLeaveEvents(next);
  return next;
}

/** §5 ลบเฉพาะรายการ id ที่ตรง — คืน Array ที่เหลือ */
export function deleteLeaveEvent(id: string): LeaderAvailabilityRecord[] {
  const next = loadLeaveEvents().filter((r) => r.id !== id);
  saveLeaveEvents(next);
  return next;
}

/** §7 กรองรายการของหัวหน้าทัวร์คนเดียว (tourLeaderId = leaderId) */
export function getLeaveEventsByLeader(leaderId: string): LeaderAvailabilityRecord[] {
  return loadLeaveEvents().filter((r) => r.leaderId === leaderId);
}

/** สร้าง id ที่ไม่ซ้ำจากเลขลำดับท้าย id (รูปแบบ AV-2026-NNN) กันชนกับข้อมูลที่ persist ไว้ */
export function nextLeaveEventId(events: LeaderAvailabilityRecord[]): string {
  const max = events.reduce((m, r) => {
    const match = /(\d+)\s*$/.exec(r.id); // เอาเฉพาะเลขลำดับท้าย ไม่รวมปีในกลาง id
    const n = match ? parseInt(match[1], 10) : 0;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `AV-2026-${String(max + 1).padStart(3, '0')}`;
}
