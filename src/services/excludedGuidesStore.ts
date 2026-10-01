/**
 * ไกด์ (หัวหน้าทัวร์) ที่ผู้ใช้แต่ละคนตัดออกจากรายการที่จะแนะนำ/เลือกได้ — ส่วนตัวของแต่ละ User
 *
 * ต่างจาก preferredGuideOrderStore (แค่จัดลำดับ) — คนที่อยู่ในชุดนี้จะไม่ถูกแสดงในหน้าเลือกไกด์เลย
 * จนกว่าจะถูกนำกลับเข้ามา (ดู lib/useExcludedGuides)
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'excludedGuideIds';

function loadAll(): Record<string, string[]> {
  const parsed = readJson<Record<string, string[]>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** รหัสไกด์ที่ผู้ใช้คนนี้ตัดออกไว้ — ยังไม่เคยตัดใครคืนอาร์เรย์ว่าง */
export function readExcludedGuideIds(userId: string): string[] {
  const list = loadAll()[userId];
  return Array.isArray(list) ? list : [];
}

/** บันทึกชุดที่ตัดออกใหม่ทั้งชุดของ User คนนี้ — เขียนไม่สำเร็จโยน StorageWriteError ให้ผู้เรียกจัดการ */
export function writeExcludedGuideIds(userId: string, ids: string[]): void {
  writeJson(KEY, { ...loadAll(), [userId]: ids });
}
