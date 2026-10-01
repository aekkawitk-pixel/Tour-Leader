/**
 * ไกด์ (หัวหน้าทัวร์) ที่ผู้ใช้แต่ละคน "ปักดาว" ไว้ — ส่วนตัวของแต่ละ User ไม่กระทบกัน
 *
 * เป็นทางลัดเร็ว ๆ จากหน้ารายชื่อ (กดดาวที่แถวได้เลย) ต่างจาก preferredGuideOrderStore
 * (จัดลำดับละเอียด) ตรงที่นี่เป็นแค่ Boolean — แต่มีผลเดียวกันตอนแนะนำ/เลือกไกด์: คนที่ปักดาวไว้
 * จะขึ้นก่อนคนอื่นเสมอ (ดู lib/logic/preferredGuideOrder → sortByPreference)
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'favoriteGuideIds';

function loadAll(): Record<string, string[]> {
  const parsed = readJson<Record<string, string[]>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** รหัสไกด์ที่ผู้ใช้คนนี้ปักดาวไว้ — ยังไม่เคยปักคืนอาร์เรย์ว่าง */
export function readFavoriteGuideIds(userId: string): string[] {
  const list = loadAll()[userId];
  return Array.isArray(list) ? list : [];
}

/** บันทึกชุดที่ปักดาวใหม่ทั้งชุดของ User คนนี้ — เขียนไม่สำเร็จโยน StorageWriteError ให้ผู้เรียกจัดการ */
export function writeFavoriteGuideIds(userId: string, ids: string[]): void {
  writeJson(KEY, { ...loadAll(), [userId]: ids });
}

/**
 * "ปักดาว" กับ "ตัดออก" ขัดกันเอง — ห้ามอยู่ในทั้งสองชุดพร้อมกัน (ปักดาว → นำออกจากชุดที่ตัดออก และกลับกัน)
 * ฝั่งหนึ่งเขียนแล้วยิง Event นี้ ให้ Hook อีกฝั่งที่เปิดอยู่บนหน้าเดียวกันอ่านชุดของตัวเองใหม่
 */
export const GUIDE_PREFS_CHANGED_EVENT = 'guide-prefs-changed';

export function notifyGuidePrefsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GUIDE_PREFS_CHANGED_EVENT));
}
