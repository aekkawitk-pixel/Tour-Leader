/**
 * ปลายทางของงาน (ประเทศ) — การ์ด "ปลายทางเดือนนี้" ที่หน้าหลักหัวหน้าทัวร์
 * หาประเทศตามลำดับ:
 *   1) ชื่อประเทศของกรุ๊ป (ภาษาอังกฤษตัวใหญ่ JAPAN / CHINA / KOREA …) จับคู่กับ Country Master
 *   2) สนามบินปลายทางหน้ารหัสกรุ๊ป (HRB-261211A-CZXJ → HRB = ฮาร์บิน → จีน)
 *   3) ไม่พบ (เช่น EUROPE) = ใช้ชื่อเดิม ธง 🌍
 * ⚠️ ไม่ใช้ countryCode ของกรุ๊ป — ข้อมูลจาก Zego เป็นรหัสของ Zego เอง ไม่ใช่ ISO (จีน = "CH" ซึ่ง ISO คือสวิตเซอร์แลนด์)
 */

import { ISO_COUNTRY_SEED } from '@/data/countryMaster';
import { airportByIata } from '@/data/airports';
import { countryOfIata } from '@/data/iataCountry';

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

/** สนามบินปลายทางหน้ารหัสกรุ๊ป → รหัสประเทศ alpha-2 (ไม่พบ = '') */
const alpha2OfGroup = (groupCode: string | null | undefined) => {
  const iata = (groupCode ?? '').trim().toUpperCase().split('-')[0] ?? '';
  return /^[A-Z]{3}$/.test(iata) ? (airportByIata(iata)?.countryCode ?? countryOfIata(iata) ?? '').toUpperCase() : '';
};

/** ชื่อประเทศ / รหัสกรุ๊ป → ธง + ชื่อไทย */
export function resolveDestination(countryName: string | null | undefined, groupCode?: string | null): { key: string; label: string; flag: string; alpha2?: string } {
  const name = norm(countryName ?? '');
  const alpha2 = ALIASES[name] || ISO_COUNTRY_SEED.find((c) => c.nameEn === name)?.alpha2 || alpha2OfGroup(groupCode);
  const seed = alpha2 ? ISO_COUNTRY_SEED.find((c) => c.alpha2 === alpha2) : undefined;
  if (seed) return { key: seed.alpha2, label: seed.nameTh, flag: flagOf(seed.alpha2), alpha2: seed.alpha2.toLowerCase() };
  if (!name) return { key: '?', label: 'ไม่ระบุประเทศ', flag: '🏳️' };
  // ไม่พบใน Country Master (เช่น EUROPE) — ใช้ชื่อเดิมแบบตัวพิมพ์ปกติ
  return { key: name, label: name.charAt(0) + name.slice(1).toLowerCase(), flag: '🌍' };
}

/** นับงานแยกประเทศปลายทาง — เรียงจากมากไปน้อย (เท่ากันเรียงตามชื่อ) */
export function destinationBreakdown(trips: { countryName?: string | null; groupCode?: string | null }[]): DestinationCount[] {
  const m = new Map<string, DestinationCount>();
  for (const t of trips) {
    const d = resolveDestination(t.countryName, t.groupCode);
    const cur = m.get(d.key);
    if (cur) cur.count += 1;
    else m.set(d.key, { ...d, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'));
}
