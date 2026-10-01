/**
 * เล่มหนังสือเดินทางจากไฟล์นำเข้าต้นทางที่ผู้ใช้สั่ง "ลบ" ออกจากหน้าจอ
 *
 * ลบข้อมูลในไฟล์ต้นทางไม่ได้ (เป็นข้อมูลอ่านอย่างเดียวของระบบต้นทาง)
 * ที่ทำได้คือจำไว้ว่าไม่ต้องแสดงเล่มนำเข้าของคนนี้อีก — ถ้านำเข้ารอบใหม่แล้วอยากให้กลับมา
 * ต้องล้างรายการนี้ ซึ่งเป็นพฤติกรรมที่ตั้งใจ (ผู้ใช้ตัดสินใจลบไปแล้ว)
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'hiddenMasterPassports';

function load(): string[] {
  const parsed = readJson<string[]>(KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function isMasterPassportHidden(tourLeaderId: string): boolean {
  return load().includes(tourLeaderId);
}

/** เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าลบสำเร็จ) */
export function hideMasterPassport(tourLeaderId: string): void {
  const rows = load();
  if (rows.includes(tourLeaderId)) return;
  writeJson(KEY, [...rows, tourLeaderId]);
}

/** นำกลับมาแสดง (ใช้เมื่อผู้ใช้ต้องการเล่มนำเข้าคืน) */
export function unhideMasterPassport(tourLeaderId: string): void {
  writeJson(KEY, load().filter((id) => id !== tourLeaderId));
}
