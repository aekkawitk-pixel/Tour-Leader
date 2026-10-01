/**
 * ลำดับไกด์ (หัวหน้าทัวร์) ที่ผู้ใช้แต่ละคนจัดไว้เอง — ส่วนตัวของแต่ละ User ไม่กระทบกัน
 *
 * เก็บเป็น Record<userId, string[]> ใน localStorage — string[] คือรหัสหัวหน้าทัวร์
 * เรียงตามลำดับที่ต้องการ (ตัวแรก = อันดับ 1 ที่อยากใช้งานก่อน)
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'preferredGuideOrder';

function loadAll(): Record<string, string[]> {
  const parsed = readJson<Record<string, string[]>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** ลำดับไกด์ที่ผู้ใช้คนนี้ตั้งไว้ — ยังไม่เคยตั้งคืนอาร์เรย์ว่าง */
export function readPreferredGuideOrder(userId: string): string[] {
  const list = loadAll()[userId];
  return Array.isArray(list) ? list : [];
}

/** บันทึกลำดับใหม่ทั้งชุดของ User คนนี้ — เขียนไม่สำเร็จโยน StorageWriteError ให้ผู้เรียกจัดการ (เป็นข้อมูลของผู้ใช้ กลืน error เงียบ ๆ ไม่ได้) */
export function writePreferredGuideOrder(userId: string, order: string[]): void {
  writeJson(KEY, { ...loadAll(), [userId]: order });
}
