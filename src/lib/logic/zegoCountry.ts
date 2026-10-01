/**
 * ประเทศของกรุ๊ปจาก Zego — ตรวจกับปลายทางจริงของกรุ๊ป แล้วแก้เมื่อ Zego ระบุผิด
 *
 * Zego ส่งประเทศมาระดับ "โปรแกรม" (CountryName) และบางโปรแกรมระบุผิด เช่น CKG-261001A-HU
 * (จีน ฉงชิ่ง) มาเป็น AMERICA — ทุกหน้าที่แสดงประเทศเลยผิดตาม
 *
 * ปลายทางอ่านจาก "หัวรหัสกรุ๊ป" (CKG-… TBS-… HBE-…) ไม่ใช่เที่ยวบินขาแรก
 * เพราะกรุ๊ปที่ต่อเครื่องขาแรกไปลงประเทศทางผ่าน (TBS จอร์เจีย บิน BKK-IST ตุรกีก่อน)
 *
 * แก้เฉพาะเมื่อค่าจาก Zego "ไม่ครอบคลุม" ประเทศปลายทาง:
 *   • Zego เป็นประเทศเดียว แต่คนละประเทศกับปลายทาง → ใช้ประเทศปลายทาง
 *   • Zego เป็นภูมิภาค (EUROPE / SCANDINAVIA / AMERICA …) ที่รวมปลายทางอยู่แล้ว → คงค่า Zego
 *   • ค่า Zego ที่ระบบไม่รู้จัก หรือหาปลายทางไม่ได้ → คงค่า Zego (ไม่เดา)
 */

import { airportByIata } from '@/data/airports';
import { countryOfIata } from '@/data/iataCountry';
import { ISO_COUNTRY_SEED } from '@/data/isoCountries';
import type { CountrySeed } from '@/data/countryMaster';

const byAlpha2 = new Map(ISO_COUNTRY_SEED.map((c) => [c.alpha2.toUpperCase(), c]));
const byName = new Map(ISO_COUNTRY_SEED.map((c) => [c.nameEn.toUpperCase(), c]));

/** ชื่อภูมิภาคที่ Zego ใช้แทนประเทศ → ประเทศไหนนับว่าอยู่ในภูมิภาคนั้น */
const REGIONS: Record<string, (c: CountrySeed) => boolean> = {
  ASIA: (c) => c.region === 'เอเชีย',
  EUROPE: (c) => c.region === 'ยุโรป',
  // Zego ขายทัวร์สแกนดิเนเวียรวมฟินแลนด์/ไอซ์แลนด์ด้วย — นับแบบ Nordic ไม่ให้แก้ผิดเป็นรายประเทศ
  SCANDINAVIA: (c) => ['DK', 'NO', 'SE', 'FI', 'IS'].includes(c.alpha2),
  NORDIC: (c) => ['DK', 'NO', 'SE', 'FI', 'IS'].includes(c.alpha2),
  AMERICA: (c) => c.region === 'อเมริกา',
  AMERICAS: (c) => c.region === 'อเมริกา',
  AFRICA: (c) => c.region === 'แอฟริกา',
  OCEANIA: (c) => c.region === 'โอเชียเนีย',
  'MIDDLE EAST': (c) => c.subregion === 'เอเชียตะวันตก',
};

export interface ResolvedZegoCountry {
  countryName: string;
  countryCode: string;
  /** ใส่ค่าเมื่อแก้จากค่า Zego — เก็บไว้ในข้อความตรวจสอบของพีเรียดให้ตรวจย้อนได้ */
  correctedFrom: string | null;
}

export function resolveZegoCountry(zegoCountry: string, zegoCountryCode: string, groupCode: string): ResolvedZegoCountry {
  const keep: ResolvedZegoCountry = { countryName: zegoCountry, countryCode: zegoCountryCode, correctedFrom: null };
  const destIata = groupCode.trim().toUpperCase().split('-')[0] ?? '';
  // Airport Master ก่อน แล้วตารางสำรอง (Master มีแค่สนามบินที่ใช้เลือกเส้นทาง ไม่ครอบคลุมปลายทางทัวร์ทั้งหมด)
  const destAlpha2 = airportByIata(destIata)?.countryCode ?? countryOfIata(destIata) ?? '';
  const dest = byAlpha2.get(destAlpha2.toUpperCase());
  const zego = zegoCountry.trim().toUpperCase();
  if (!dest || !zego) return keep;

  const zegoAsCountry = byName.get(zego);
  const covered = zegoAsCountry
    ? zegoAsCountry.alpha2 === dest.alpha2
    : REGIONS[zego]?.(dest);
  // undefined = ไม่รู้จักค่านี้ทั้งในชื่อประเทศและภูมิภาค → ไม่เดา
  if (covered === undefined || covered) return keep;

  return { countryName: dest.nameEn, countryCode: dest.alpha2, correctedFrom: zegoCountry };
}
