/**
 * แหล่งเก็บ "การจัดหัวหน้าทัวร์ลงตารางงาน" + Audit — คงอยู่ใน localStorage (Demo)
 * มิเรอร์แนวทาง leave-storage: SSR guard · JSON.parse ปลอดภัย · ไม่ทับข้อมูลเดิม · storage event
 * เก็บเฉพาะ ID อ้างอิง + ผลวิเคราะห์ (ไม่เก็บข้อมูลทัวร์/หัวหน้าทัวร์ซ้ำ)
 */

import type { AssignmentAudit, TourScheduleAssignment } from '@/types';

export const ASSIGNMENT_STORAGE_KEY = 'tourScheduleAssignments';
export const AUDIT_STORAGE_KEY = 'tourAssignmentAudit';

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function loadList<T>(key: string): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function saveList<T>(key: string, list: T[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* quota/โหมดส่วนตัว — ปล่อยผ่าน */
  }
}

export function loadAssignments(): TourScheduleAssignment[] {
  return loadList<TourScheduleAssignment>(ASSIGNMENT_STORAGE_KEY);
}

export function saveAssignments(list: TourScheduleAssignment[]): void {
  saveList(ASSIGNMENT_STORAGE_KEY, list);
}

/** upsert รายการมอบหมายหลายรายการตาม tourJobId (หนึ่งงาน = หนึ่งรายการล่าสุด) */
export function upsertAssignments(next: TourScheduleAssignment[]): TourScheduleAssignment[] {
  const byJob = new Map(loadAssignments().map((a) => [a.tourJobId, a]));
  for (const a of next) byJob.set(a.tourJobId, a);
  const merged = [...byJob.values()];
  saveAssignments(merged);
  return merged;
}

export function loadAudit(): AssignmentAudit[] {
  return loadList<AssignmentAudit>(AUDIT_STORAGE_KEY);
}

export function saveAudit(list: AssignmentAudit[]): void {
  saveList(AUDIT_STORAGE_KEY, list);
}

/** ต่อท้าย Audit (ไม่ลบของเดิม) */
export function appendAudit(entries: AssignmentAudit[]): AssignmentAudit[] {
  const merged = [...loadAudit(), ...entries];
  saveAudit(merged);
  return merged;
}
