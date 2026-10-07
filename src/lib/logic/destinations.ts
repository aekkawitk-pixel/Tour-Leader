/**
 * ปลายทางของงาน (ประเทศ) — การ์ด "ปลายทางเดือนนี้" ที่หน้าหลักหัวหน้าทัวร์
 * ข้อมูลกรุ๊ปมีชื่อประเทศเป็นภาษาอังกฤษตัวใหญ่ (JAPAN / CHINA / KOREA …) และรหัสประเทศมักว่าง
 * จึงจับคู่กับ Country Master เพื่อได้ธง + ชื่อไทย · จับคู่ไม่ได้ (เช่น EUROPE) = ใช้ชื่อเดิม ธง 🌍
 */

import { ISO_COUNTRY_SEED } from '@/data/countryMaster';

export interface DestinationCount {
  /** คีย์สำหรับ React — alpha2 หรือชื่อเดิม */
  key: string;
  label: string;
  /** ธงแบบ emoji — สำรองเมื่อไม่มีรหัสประเทศ (เช่น 🌍 ยุโรป) */
  flag: string;
  /** รหัสประเทศ alpha-2 ตัวเล็ก (เช่น 'jp') — ใช้แสดงธงเป็นภาพ (flag-icons) · ไม่มี = ใช้ emoji */
  alpha2?: string;
  count: number;
}

/** ชื่อที่ข้อมูลกรุ๊ปใช้ไม่ตรงกับ Country Master */
const ALIASES: Record<string, string> = { KOREA: 'KR', 'SOUTH KOREA': 'KR', TURKEY: 'TR', UK: 'GB', 'VIET NAM': 'VN' };
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
const flagOf = (alpha2: string) => String.fromCodePoint(...[...alpha2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** ชื่อประเทศ/รหัส → ธง + ชื่อไทย */
export function resolveDestination(countryName: string | null | undefined, countryCode?: string | null): { key: string; label: string; flag: string; alpha2?: string } {
  const code = (countryCode ?? '').replace(/^C-/, '').toUpperCase();
  const name = norm(countryName ?? '');
  const alpha2 = (code.length === 2 && code) || ALIASES[name] || ISO_COUNTRY_SEED.find((c) => c.nameEn === name)?.alpha2 || '';
  const seed = alpha2 ? ISO_COUNTRY_SEED.find((c) => c.alpha2 === alpha2) : undefined;
  if (seed) return { key: seed.alpha2, label: seed.nameTh, flag: flagOf(seed.alpha2), alpha2: seed.alpha2.toLowerCase() };
  if (!name) return { key: '?', label: 'ไม่ระบุประเทศ', flag: '🏳️' };
  // ไม่พบใน Country Master (เช่น EUROPE) — ใช้ชื่อเดิมแบบตัวพิมพ์ปกติ
  return { key: name, label: name.charAt(0) + name.slice(1).toLowerCase(), flag: '🌍' };
}

/** นับงานแยกประเทศปลายทาง — เรียงจากมากไปน้อย (เท่ากันเรียงตามชื่อ) */
export function destinationBreakdown(trips: { countryName?: string | null; countryCode?: string | null }[]): DestinationCount[] {
  const m = new Map<string, DestinationCount>();
  for (const t of trips) {
    const d = resolveDestination(t.countryName, t.countryCode);
    const cur = m.get(d.key);
    if (cur) cur.count += 1;
    else m.set(d.key, { ...d, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'));
}
