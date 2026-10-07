/**
 * ข้อมูลกรุ๊ปสำรองจากตัวเอกสารเบิก (.xls) — ใช้เมื่อหากรุ๊ปใน Tour Period Master ไม่เจอ
 * (เช่น กรุ๊ปที่เดินทางไปแล้วไม่ถูกดึงมาในข้อมูล Zego รอบใหม่) ไม่ให้แถวขึ้น "—" และไม่หลุดตัวกรองช่วงเดินทาง
 *   วันเดินทาง  — "01/10/26 - 06/10/26" (วัน/เดือน/ปี ค.ศ. 2 หลัก ตามที่พิมพ์ในไฟล์)
 *   ประเทศ     — สนามบินปลายทางหน้ารหัสกรุ๊ป (KIX-261001K-MM → KIX → JAPAN)
 *   ชื่อรายการ  — ตัดรหัสโปรแกรมนำหน้าออก ("ZGKIX-2648MM : โอซาก้า…" → "โอซาก้า…")
 */

import { airportByIata } from '@/data/airports';
import { countryOfIata } from '@/data/iataCountry';
import { ISO_COUNTRY_SEED } from '@/data/countryMaster';

/** "01/10/26" → "2026-10-01" · รูปแบบอื่น = null */
function parseShortDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543; // ปี พ.ศ. 4 หลัก
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "01/10/26 - 06/10/26" → { startDate, endDate } · อ่านไม่ได้ = null */
export function parseTravelDates(text: string | null | undefined): { startDate: string; endDate: string } | null {
  const parts = (text ?? '').split(/\s*[-–—]\s*|\s+ถึง\s+/).filter(Boolean);
  const start = parts[0] ? parseShortDate(parts[0]) : null;
  const end = parts[1] ? parseShortDate(parts[1]) : start;
  return start && end ? { startDate: start, endDate: end < start ? start : end } : null;
}

/** ชื่อประเทศ (อังกฤษตัวใหญ่ แบบเดียวกับข้อมูลกรุ๊ป) จากสนามบินปลายทางหน้ารหัสกรุ๊ป · ไม่พบ = '' */
export function countryNameOfGroup(groupCode: string | null | undefined): string {
  const iata = (groupCode ?? '').trim().toUpperCase().split('-')[0] ?? '';
  if (!/^[A-Z]{3}$/.test(iata)) return '';
  const alpha2 = (airportByIata(iata)?.countryCode ?? countryOfIata(iata) ?? '').toUpperCase();
  return ISO_COUNTRY_SEED.find((c) => c.alpha2 === alpha2)?.nameEn ?? '';
}

/** ชื่อรายการทัวร์ — ตัดรหัสโปรแกรมที่นำหน้าด้วย ":" ออก */
export const cleanProgramName = (name: string | null | undefined) => (name ?? '').replace(/^\s*[A-Z0-9][A-Z0-9-]*\s*:\s*/i, '').trim();

/** ข้อมูลสำรองจาก sourceDoc ของเอกสารเบิก */
export function advanceDocFallback(meta: { groupCode?: string; programName?: string; travelDates?: string } | null | undefined) {
  const dates = parseTravelDates(meta?.travelDates);
  return {
    startDate: dates?.startDate ?? null,
    endDate: dates?.endDate ?? null,
    countryName: countryNameOfGroup(meta?.groupCode),
    programName: cleanProgramName(meta?.programName),
  };
}
