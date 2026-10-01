/**
 * Zone Master (§4/§5) — โซนภูมิภาคสำหรับความเชี่ยวชาญของหัวหน้าทัวร์
 *
 * ⚠️ Scandinavia ≠ Nordic (§5)
 *   - Scandinavia = เดนมาร์ก / นอร์เวย์ / สวีเดน (Denmark / Norway / Sweden) เท่านั้น
 *   - Nordic (อนาคต) = + ฟินแลนด์ / ไอซ์แลนด์ (Finland / Iceland)
 *   ห้ามใช้แทนกัน · ห้ามดึง FI/IS เข้า Scandinavia อัตโนมัติ
 *
 * สมาชิกโซนกำหนดได้ 2 แบบ:
 *   - members: รายชื่อ alpha-2 ที่ระบุตายตัว (Scandinavia)
 *   - regions/subregions: จับคู่กับ Country.region / Country.subregion (ภาษาไทย ตาม ISO seed)
 */

import type { Country } from '@/types';
import { alpha2Of } from '@/data/countryMaster';

export interface Zone {
  id: string;
  nameEn: string;
  nameTh: string;
  /**
   * เปิดใช้งานใน Master หรือไม่ — false = ไม่แสดงเป็นตัวเลือกใหม่และค้นหาไม่พบ
   * ⚠️ ห้ามลบรายการที่ปิดใช้งานออกจากอาร์เรย์ — ข้อมูลหัวหน้าทัวร์เดิมที่อ้าง id นี้
   *    ต้องยังแปลงเป็นชื่อโซนได้ (ไม่งั้นหน้าโปรไฟล์/หน้าแก้ไขจะแสดงเป็น id ดิบหรือพัง)
   */
  active: boolean;
  /** ลำดับการแสดงผลใน Dropdown — เรียงต่อเนื่องเฉพาะรายการที่ยังเปิดใช้งาน */
  order: number;
  /** สมาชิกตายตัว (alpha-2) — ใช้กับโซนที่นิยามเฉพาะ เช่น Scandinavia */
  members?: string[];
  /** จับคู่กับ Country.region (ภาษาไทย) */
  regions?: string[];
  /** จับคู่กับ Country.subregion (ภาษาไทย) */
  subregions?: string[];
}

/**
 * โซนทั้งหมดที่ระบบรู้จัก (§4) — Scandinavia แยกจาก Nordic ชัดเจน (§5)
 *
 * แหล่งข้อมูลเดียวของทั้งระบบ · ทุกหน้าต้องดึงผ่าน getZones() / zoneById()
 * ห้ามประกาศรายการโซนซ้ำใน Component ใด ๆ
 *
 * โซนที่ปิดใช้งาน (active: false) — เก็บไว้เพื่อแปลง id ของข้อมูลเดิมเท่านั้น
 * ประเทศ/เส้นทาง/สนามบินของภูมิภาคเหล่านี้ไม่ถูกแตะ ยังเลือกจากช่อง “ประเทศที่เชี่ยวชาญ” ได้ตามปกติ
 */
export const ZONE_MASTER: Zone[] = [
  { id: 'Z-ASIA', nameEn: 'Asia', nameTh: 'เอเชีย', active: true, order: 1, regions: ['เอเชีย'] },
  { id: 'Z-EUROPE', nameEn: 'Europe', nameTh: 'ยุโรป', active: true, order: 2, regions: ['ยุโรป'] },
  // §5 Scandinavia = DK/NO/SE เท่านั้น (ไม่รวม FI/IS)
  { id: 'Z-SCANDINAVIA', nameEn: 'Scandinavia', nameTh: 'สแกนดิเนเวีย', active: true, order: 3, members: ['DK', 'NO', 'SE'] },

  /* ---- ปิดใช้งานแล้ว — ไม่แสดงเป็นตัวเลือกใหม่ (ข้อมูลเดิมยังอ่านได้) ---- */
  { id: 'Z-MIDDLE-EAST', nameEn: 'Middle East', nameTh: 'ตะวันออกกลาง', active: false, order: 101, subregions: ['เอเชียตะวันตก'] },
  { id: 'Z-AFRICA', nameEn: 'Africa', nameTh: 'แอฟริกา', active: false, order: 102, regions: ['แอฟริกา'] },
  { id: 'Z-NORTH-AMERICA', nameEn: 'North America', nameTh: 'อเมริกาเหนือ', active: false, order: 103, subregions: ['อเมริกาเหนือ'] },
  { id: 'Z-SOUTH-AMERICA', nameEn: 'South America', nameTh: 'อเมริกาใต้', active: false, order: 104, subregions: ['อเมริกาใต้'] },
  { id: 'Z-OCEANIA', nameEn: 'Oceania', nameTh: 'โอเชียเนีย', active: false, order: 105, regions: ['โอเชียเนีย'] },
];

/**
 * โซน "Nordic" — ยังไม่เปิดใช้เป็นค่าเริ่มต้น แต่นิยามไว้ให้ชัด (§5)
 * ถ้าจะเปิดใช้ในอนาคต = DK/NO/SE + FI/IS
 */
export const NORDIC_ZONE: Zone = {
  id: 'Z-NORDIC',
  nameEn: 'Nordic',
  nameTh: 'นอร์ดิก',
  active: false,
  order: 106,
  members: ['DK', 'NO', 'SE', 'FI', 'IS'],
};

/**
 * โซนที่เลือกได้ — เฉพาะที่เปิดใช้งาน เรียงตาม order (ไม่มีช่องว่างจากรายการที่ปิดไป)
 * ใช้เป็นแหล่งเดียวของทุก Dropdown/ช่องค้นหาโซน
 */
export function getZones(): Zone[] {
  return ZONE_MASTER.filter((z) => z.active).sort((a, b) => a.order - b.order);
}

/** โซนทุกสถานะ — สำหรับหน้าดูแล Master ที่ต้องเห็นรายการที่ปิดใช้งานด้วย */
export function getAllZones(): Zone[] {
  return [...ZONE_MASTER].sort((a, b) => a.order - b.order);
}

/**
 * ค้นตาม id — ครอบคลุมโซนที่ปิดใช้งานด้วย เพื่อให้ข้อมูลหัวหน้าทัวร์เดิมยังแสดงชื่อโซนได้
 * (การ "นำโซนออก" มีผลกับตัวเลือกใหม่เท่านั้น ไม่ลบข้อมูลเดิม)
 */
export function zoneById(zoneId: string | null | undefined): Zone | undefined {
  if (!zoneId) return undefined;
  if (zoneId === ALL_ZONES_ID) return ALL_ZONES;
  return ZONE_MASTER.find((z) => z.id === zoneId);
}

/**
 * "ได้ทุกโซน" — โซนเสมือน ไม่อยู่ใน ZONE_MASTER (จึงไม่โผล่ในตัวเลือกโซน/หน้าดูแล Master)
 * ใช้กับติ๊ก "ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง" ในหน้าความเชี่ยวชาญ — ครอบคลุมทุกประเทศใน Country Master
 */
export const ALL_ZONES_ID = 'Z-ALL';
export const ALL_ZONES: Zone = { id: ALL_ZONES_ID, nameEn: 'ทุกโซน', nameTh: '', active: false, order: 0 };

/** ประเทศทั้งหมดในโซน (จาก Country Master) — เรียงตามชื่อไทย */
export function zoneCountries(zone: Zone, countries: Country[]): Country[] {
  if (zone.id === ALL_ZONES_ID) return countries;
  const memberSet = zone.members ? new Set(zone.members.map((m) => m.toUpperCase())) : null;
  return countries.filter((c) => {
    if (memberSet) return memberSet.has(alpha2Of(c));
    if (zone.regions && zone.regions.includes(c.region ?? '')) return true;
    if (zone.subregions && zone.subregions.includes(c.subregion ?? '')) return true;
    return false;
  });
}

/** ประเทศ (alpha-2) นี้อยู่ในโซนหรือไม่ */
export function isCountryInZone(zone: Zone, country: Country): boolean {
  return zoneCountries(zone, [country]).length > 0;
}
