/**
 * Holiday Override Store — วันหยุดที่ผู้ดูแลเพิ่ม/แก้/ซ่อนเอง
 *
 * โครงเดียวกับ periodOverrideStore (§10): ไม่แก้ชุดตั้งต้น แต่เก็บ override แยกแล้วทับตอนอ่าน
 * เพราะชุดตั้งต้นอยู่ใน git (ตรวจย้อนหลังได้) ส่วนวันหยุดที่ประกาศระหว่างปีต้องแก้ได้ทันทีโดยไม่ deploy
 *
 * คีย์ = วันที่ ISO (yyyy-mm-dd) → 1 วันมีได้ 1 รายการ
 */

export interface HolidayOverride {
  /** ชื่อที่ผู้ดูแลตั้ง — ทับชื่อจากชุดตั้งต้น หรือเป็นชื่อของวันหยุดที่เพิ่มเอง */
  name?: string;
  /** true = ซ่อนวันหยุดของชุดตั้งต้นวันนี้ (เช่น ปีนี้ ครม. ไม่ให้หยุดชดเชย) */
  removed?: boolean;
  /** ใครแก้ / แก้เมื่อไร — ไว้ตรวจย้อนหลัง */
  updatedBy?: string;
  updatedAt?: string;
}

const KEY = 'holidayOverrides';

function canUseStorage(): boolean {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

export function loadHolidayOverrides(): Record<string, HolidayOverride> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, HolidayOverride>) : {};
  } catch { return {}; }
}

function save(map: Record<string, HolidayOverride>): void {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* quota/private mode */ }
}

/** เพิ่มวันหยุดใหม่ หรือแก้ชื่อของวันที่มีอยู่ */
export function setHoliday(date: string, name: string, by: string, at: string): Record<string, HolidayOverride> {
  const map = loadHolidayOverrides();
  map[date] = { ...map[date], name: name.trim(), removed: false, updatedBy: by, updatedAt: at };
  save(map);
  return map;
}

/** ซ่อนวันหยุดของวันนั้น (ใช้ได้ทั้งวันที่มาจากชุดตั้งต้นและที่เพิ่มเอง) */
export function removeHoliday(date: string, by: string, at: string): Record<string, HolidayOverride> {
  const map = loadHolidayOverrides();
  map[date] = { ...map[date], removed: true, updatedBy: by, updatedAt: at };
  save(map);
  return map;
}

/** ล้าง override ของวันนั้น — กลับไปใช้ค่าจากชุดตั้งต้น */
export function clearHolidayOverride(date: string): Record<string, HolidayOverride> {
  const map = loadHolidayOverrides();
  delete map[date];
  save(map);
  return map;
}
