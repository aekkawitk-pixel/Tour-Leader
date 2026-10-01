/**
 * Airport Master — ตรรกะ seed / เข้าถึง (ป้องกันสนามบินซ้ำด้วย iata_code)
 *
 * แนวคิดเดียวกับ Country Master:
 *   - AIRPORT_SEED = ชุดข้อมูลสนามบินตั้งต้น (src/data/airportSeed.ts)
 *   - dedupeAirports() = กันซ้ำด้วย iata (รายการแรกชนะ) → รันซ้ำได้ ผลลัพธ์เท่าเดิม
 *   - airportsOfCountry() = ดึงเฉพาะสนามบินของประเทศนั้น (ตาม country_code) เรียงยอดนิยมขึ้นก่อน
 */

import type { Airport, TourRoute } from '@/types';
import { AIRPORT_SEED, AIRPORT_SEED_VERSION } from './airportSeed';

export { AIRPORT_SEED, AIRPORT_SEED_VERSION };

/** กันสนามบินซ้ำด้วย iata (globally unique) — รายการแรกที่เจอชนะ */
export function dedupeAirports(list: Airport[] = AIRPORT_SEED): Airport[] {
  const seen = new Set<string>();
  const result: Airport[] = [];
  for (const a of list) {
    const key = a.iata.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(a);
  }
  return result;
}

/** สนามบินทั้งหมด (กันซ้ำแล้ว) พร้อมใช้งาน */
export const airports: Airport[] = dedupeAirports(AIRPORT_SEED);

/** ค้นสนามบินตามรหัส IATA */
export function airportByIata(iata: string | undefined): Airport | undefined {
  if (!iata) return undefined;
  const key = iata.toUpperCase();
  return airports.find((a) => a.iata === key);
}

/**
 * สนามบินของประเทศหนึ่ง (ตาม country_code = alpha-2) — เรียงยอดนิยมขึ้นก่อน แล้วตามรหัส IATA
 * @param countryCode รหัส alpha-2 เช่น 'JP'
 */
export function airportsOfCountry(countryCode: string): Airport[] {
  const cc = countryCode.toUpperCase();
  return airports
    .filter((a) => a.countryCode === cc)
    .sort((a, b) => {
      if (a.popular !== b.popular) return a.popular ? -1 : 1;
      return a.iata.localeCompare(b.iata);
    });
}

/** แปลง Airport → TourRoute (routeType = airport) เพื่อคงโมเดล/การจับคู่เดิมของระบบ */
export function airportToRoute(a: Airport, order: number): TourRoute {
  return {
    id: a.id,
    countryId: `C-${a.countryCode}`,
    routeType: 'airport',
    code: a.iata,
    nameTh: a.nameTh,
    nameEn: a.nameEn,
    isActive: a.isActive,
    order,
  };
}

/** TourRoute ของสนามบินทั้งหมด (สร้างจาก Airport Master) — จัด order ต่อประเทศ */
export function airportRoutes(): TourRoute[] {
  const perCountry = new Map<string, number>();
  return airports.map((a) => {
    const n = (perCountry.get(a.countryCode) ?? 0) + 1;
    perCountry.set(a.countryCode, n);
    return airportToRoute(a, n);
  });
}
