/**
 * จำแท็บล่าสุดของหน้ารายละเอียดหัวหน้าทัวร์ — แยกตาม tourLeaderId
 *
 * ใช้คู่กับ ?tab= ใน URL: URL มาก่อนเสมอ · ค่าที่จำไว้ใช้เฉพาะตอนเปิดหน้าโดยไม่ระบุแท็บ
 * เก็บใน localStorage เท่านั้น — ไม่ใช่ข้อมูลของหัวหน้าทัวร์ จึงไม่ปนกับ record จริง
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderDetailLastTab';

function loadAll(): Record<string, string> {
  const parsed = readJson<Record<string, string>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function readLastTab(tourLeaderId: string): string | null {
  return loadAll()[tourLeaderId] ?? null;
}

/** เขียนไม่สำเร็จไม่ควรทำให้การสลับแท็บพัง — กลืน error ไว้ */
export function writeLastTab(tourLeaderId: string, tab: string): void {
  try {
    writeJson(KEY, { ...loadAll(), [tourLeaderId]: tab });
  } catch {
    /* จำแท็บไม่ได้ก็ไม่เป็นไร — ยังใช้งานหน้าได้ตามปกติ */
  }
}
