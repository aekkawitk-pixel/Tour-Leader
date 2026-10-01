/**
 * Holiday Service — จุดเดียวที่ทุกหน้าอ่าน "วันหยุด"
 *
 * กฎเดียวกับ tourPeriodMaster (§14): ห้ามให้แต่ละหน้าคำนวณวันหยุดเอง ต้องเรียกผ่าน service นี้
 * เพราะปฏิทินในระบบมีหลายหน้า ถ้าต่างคนต่างคิดจะบอกวันหยุดไม่ตรงกัน
 *
 * ที่มาของข้อมูล 3 ชั้น (ชั้นหลังทับชั้นหน้า):
 *   1) FIXED        — วันที่ตายตัว เติมให้อัตโนมัติทุกปี
 *   2) COMPENSATORY — วันหยุดชดเชยเมื่อ FIXED ตรงเสาร์-อาทิตย์ · ระบบเสนอให้ตามกฎทั่วไป
 *                     แต่ ครม. ไม่ได้ให้ชดเชยทุกปี → ผู้ดูแลลบทิ้งได้
 *   3) override     — ที่ผู้ดูแลเพิ่ม/แก้ชื่อ/ซ่อน (localStorage)
 */

import { FIXED_HOLIDAYS, HOLIDAYS_NEEDING_ANNUAL_ENTRY } from '@/data/holidays/thaiHolidays.seed';
import { loadHolidayOverrides } from '@/services/holidayStore';

export type HolidaySource = 'fixed' | 'compensatory' | 'custom';

export interface Holiday {
  date: string; // ISO yyyy-mm-dd
  /** ชื่อตามที่บันทึกไว้ในเมนู "วันหยุด" — ทุกหน้าแสดงชื่อนี้เต็ม ไม่ย่อ */
  name: string;
  source: HolidaySource;
}

export type DayType = 'workday' | 'weekend' | 'holiday';

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isWeekendDate(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

/** ปีที่ระบบเตรียมวันหยุดไว้ให้ = ปีปัจจุบัน + ปีถัดไป (อ้างจากวันที่ของระบบ) */
export function holidayYears(today: string): [number, number] {
  const y = parse(today).getFullYear();
  return [y, y + 1];
}

/**
 * วันหยุดชดเชย — FIXED ที่ตรงเสาร์-อาทิตย์ เลื่อนไปวันทำการถัดไปที่ยังว่าง
 * เป็นเพียง "ข้อเสนอตามกฎทั่วไป" ไม่ใช่ประกาศจริง ผู้ดูแลลบได้จากหน้าวันหยุด
 */
function compensatoryFor(base: Holiday[]): Holiday[] {
  const taken = new Set(base.map((h) => h.date));
  const out: Holiday[] = [];
  for (const h of base) {
    const d = parse(h.date);
    if (!isWeekendDate(d)) continue;
    const next = new Date(d);
    do {
      next.setDate(next.getDate() + 1);
    } while (isWeekendDate(next) || taken.has(iso(next.getFullYear(), next.getMonth() + 1, next.getDate())));
    const nextIso = iso(next.getFullYear(), next.getMonth() + 1, next.getDate());
    taken.add(nextIso);
    out.push({ date: nextIso, name: `ชดเชย${h.name}`, source: 'compensatory' });
  }
  return out;
}

/** วันหยุดทั้งหมดของปี (เรียงตามวันที่) — ผ่าน override แล้ว */
export function getHolidays(year: number): Holiday[] {
  const fixed: Holiday[] = FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${h.monthDay}`,
    name: h.name,
    source: 'fixed' as const,
  }));
  const base = [...fixed, ...compensatoryFor(fixed)];

  const byDate = new Map<string, Holiday>();
  for (const h of base) byDate.set(h.date, h);

  const ov = loadHolidayOverrides();
  for (const [date, o] of Object.entries(ov)) {
    if (!date.startsWith(`${year}-`)) continue;
    if (o.removed) { byDate.delete(date); continue; }
    const existing = byDate.get(date);
    byDate.set(date, {
      date,
      name: o.name ?? existing?.name ?? 'วันหยุด',
      source: existing?.source ?? 'custom',
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** วันหยุดของหลายปีรวมกัน — ใช้กับปฏิทินที่คาบเกี่ยวปลายปี */
export function getHolidayMap(years: number[]): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const y of years) for (const h of getHolidays(y)) map.set(h.date, h);
  return map;
}

/** วันหยุดของวันนั้น (null = ไม่ใช่วันหยุดราชการ) */
export function holidayOf(date: string): Holiday | null {
  const year = Number(date.slice(0, 4));
  return getHolidays(year).find((h) => h.date === date) ?? null;
}

/**
 * ประเภทของวัน — จุดเดียวที่ปฏิทินทุกหน้าใช้ตัดสินว่าวันนั้นเป็นวันอะไร
 * วันหยุดชนะเสาร์-อาทิตย์ เพราะ "ชื่อวันหยุด" คือข้อมูลที่ผู้ใช้ต้องการ ส่วนเสาร์-อาทิตย์รู้จากหัวตารางอยู่แล้ว
 */
export function dayTypeOf(date: string, holidays?: Map<string, Holiday>): DayType {
  const holiday = holidays ? holidays.get(date) : holidayOf(date);
  if (holiday) return 'holiday';
  return isWeekendDate(parse(date)) ? 'weekend' : 'workday';
}

/** ชื่อวันหยุดที่ยังไม่ได้กำหนดในปีนั้น — ใช้เตือนผู้ดูแลว่าใส่ไม่ครบ */
export function missingAnnualHolidays(year: number): string[] {
  const names = new Set(getHolidays(year).map((h) => h.name));
  return HOLIDAYS_NEEDING_ANNUAL_ENTRY.filter((n) => ![...names].some((x) => x.includes(n)));
}
