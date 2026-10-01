/**
 * Master "ประเทศ" — ตรรกะ seed / upsert (รันซ้ำได้โดยไม่สร้างข้อมูลซ้ำ)
 *
 * แนวคิดแบบ migration + seed สำหรับสถาปัตยกรรม in-memory:
 *   - ISO_COUNTRY_SEED  = ชุดข้อมูลตั้งต้นครบทุกประเทศตาม ISO 3166-1 (src/data/isoCountries.ts)
 *   - upsertCountries() = ผสาน seed เข้ากับข้อมูลที่มีอยู่ โดย "ป้องกันข้อมูลซ้ำด้วย alpha-2"
 *                         และ "ห้ามเขียนทับข้อมูลเดิมที่ผู้ใช้บันทึกไว้" — เติมเฉพาะช่องที่ยังว่าง
 *                         และเพิ่มเฉพาะประเทศใหม่ที่ยังไม่มี → เรียกซ้ำกี่ครั้งผลลัพธ์ก็เท่าเดิม
 *   - buildSeedCountries() = สร้างรายการพร้อมใช้ เรียงชื่อไทยตามตัวอักษร และดันไทยขึ้นลำดับต้น
 */

import type { Country } from '@/types';
import { ISO_COUNTRY_SEED, COUNTRY_SEED_VERSION } from './isoCountries';

export { ISO_COUNTRY_SEED, COUNTRY_SEED_VERSION };

/** หนึ่งรายการในชุด seed ISO 3166-1 (ยังไม่มี id/สถานะ/ลำดับ) */
export interface CountrySeed {
  alpha2: string;
  alpha3: string;
  /** สัญชาติภาษาอังกฤษตามที่พิมพ์บนหน้าเล่ม เช่น THAI ('' = ดินแดนที่ไม่มีสัญชาติ เช่น แอนตาร์กติกา) */
  nationality: string;
  callingCode: string;
  nameEn: string;
  nameTh: string;
  region: string;
  subregion: string;
}

/** ประเทศไทยต้องอยู่ลำดับต้นเสมอ (ใช้เป็นสัญชาติ/ประเทศผู้ออกเอกสารเป็นหลัก) */
export const PRIMARY_COUNTRY_ALPHA2 = 'TH';

/** id มาตรฐานของประเทศ = C-<alpha2> (เข้ากันได้กับ id เดิม เช่น C-TH, C-JP) */
export const countryIdOf = (alpha2: string): string => `C-${alpha2.toUpperCase()}`;

/** alpha-2 ของประเทศ — ใช้ field alpha2 ถ้ามี ไม่งั้น fallback ไปที่ code (ข้อมูลเดิม) */
export const alpha2Of = (c: Pick<Country, 'alpha2' | 'code'>): string =>
  (c.alpha2 ?? c.code ?? '').toUpperCase();

/**
 * รหัสประเทศที่ใช้เขียนลงหน้าหนังสือเดินทาง — alpha-3 ตามที่พิมพ์บนเล่มจริง (เช่น THA)
 * ประเทศเก่าที่ยังไม่มี alpha-3 ใน master ใช้ alpha-2 แทนเพื่อไม่ให้ตัวเลือกหาย
 */
export const passportCountryCodeOf = (c: Pick<Country, 'alpha2' | 'alpha3' | 'code'>): string =>
  ((c.alpha3 ?? '') || alpha2Of(c)).toUpperCase();

/**
 * ตัวเลือกสำหรับช่องที่ต้องอ้างอิง Country Master (สัญชาติ · ประเทศผู้ออก)
 * คงลำดับตาม master (ไทยอยู่ต้น) · ตัดประเทศที่ปิดใช้งานและรหัสซ้ำออก
 */
export function countrySelectOptions(countries: Country[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const c of countries) {
    if (!c.isActive) continue;
    const value = passportCountryCodeOf(c);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: `${value} · ${c.nameTh} (${c.nameEn})` });
  }
  return options;
}

/**
 * ตัวเลือกสำหรับช่อง "สัญชาติ" — ค่าเป็นสัญชาติตามที่พิมพ์บนหน้าเล่ม (THAI ไม่ใช่ THA)
 *
 * หลายดินแดนใช้สัญชาติเดียวกับประเทศแม่ (เกิร์นซีย์/เจอร์ซีย์/ยิบรอลตาร์ = BRITISH)
 * รายการนี้จึงเป็น "รายการสัญชาติ" ไม่ใช่รายการประเทศ — สัญชาติซ้ำจะขึ้นครั้งเดียว
 * และป้ายกำกับจะรวมชื่อประเทศที่ใช้สัญชาตินั้นไว้ให้ค้นเจอ
 */
export function nationalitySelectOptions(countries: Country[]): { value: string; label: string }[] {
  const byNationality = new Map<string, string[]>();
  for (const c of countries) {
    const value = (c.nationality ?? '').toUpperCase();
    if (!c.isActive || !value) continue;
    const names = byNationality.get(value);
    if (names) names.push(c.nameTh);
    else byNationality.set(value, [c.nameTh]);
  }
  return [...byNationality].map(([value, names]) => ({
    value,
    // เกิน 3 ประเทศแล้วป้ายจะยาวจนอ่านไม่ทัน — ตัดที่ 3 พอให้รู้ว่าหมายถึงสัญชาติไหน
    label: `${value} · ${names.slice(0, 3).join(' · ')}${names.length > 3 ? ' · อื่น ๆ' : ''}`,
  }));
}

/** แปลง 1 รายการ seed → Country (สถานะเปิดใช้งานเป็นค่าเริ่มต้น) */
export function countryFromSeed(seed: CountrySeed): Country {
  const alpha2 = seed.alpha2.toUpperCase();
  return {
    id: countryIdOf(alpha2),
    code: alpha2,
    alpha2,
    alpha3: seed.alpha3.toUpperCase(),
    nationality: seed.nationality.toUpperCase(),
    nameTh: seed.nameTh,
    nameEn: seed.nameEn.toUpperCase(),
    region: seed.region,
    subregion: seed.subregion,
    callingCode: seed.callingCode,
    isActive: true,
  };
}

/**
 * ผสาน seed เข้ากับข้อมูลเดิมแบบ upsert (idempotent)
 *  - ถ้ามีประเทศนี้อยู่แล้ว (จับคู่ด้วย alpha-2): คงข้อมูลเดิมทุกช่องที่ผู้ใช้บันทึกไว้
 *    เติมเฉพาะช่องมาตรฐานที่ยัง "ว่าง" (alpha3 / region / subregion / callingCode / alpha2)
 *  - ถ้ายังไม่มี: เพิ่มใหม่จาก seed
 *  - ไม่ลบและไม่ปิดใช้งานรายการเดิมที่ไม่อยู่ใน seed
 */
export function upsertCountries(
  existing: Country[],
  seed: CountrySeed[] = ISO_COUNTRY_SEED,
): Country[] {
  const result: Country[] = existing.map((c) => ({ ...c }));
  const byAlpha2 = new Map<string, Country>();
  for (const c of result) {
    const key = alpha2Of(c);
    if (key) byAlpha2.set(key, c);
  }

  for (const s of seed) {
    const key = s.alpha2.toUpperCase();
    const current = byAlpha2.get(key);
    if (current) {
      // เติมเฉพาะช่องที่ยังว่าง — ไม่แตะชื่อ/สถานะ/ลำดับที่ผู้ใช้ตั้งไว้
      current.alpha2 ??= key;
      current.alpha3 ??= s.alpha3.toUpperCase();
      current.nationality ??= s.nationality.toUpperCase();
      current.region ??= s.region;
      current.subregion ??= s.subregion;
      current.callingCode ??= s.callingCode;
    } else {
      const created = countryFromSeed(s);
      byAlpha2.set(key, created);
      result.push(created);
    }
  }

  return result;
}

/**
 * เรียงประเทศ: ไทยอยู่ลำดับต้นเสมอ → ที่เหลือเรียงตามชื่อไทย (ตัวอักษรไทย)
 * แล้วกำหนดค่า order ใหม่ให้ต่อเนื่อง (ไทย = 0)
 */
export function sortCountries(list: Country[]): Country[] {
  const collator = new Intl.Collator('th');
  const sorted = [...list].sort((a, b) => {
    const aTh = alpha2Of(a) === PRIMARY_COUNTRY_ALPHA2;
    const bTh = alpha2Of(b) === PRIMARY_COUNTRY_ALPHA2;
    if (aTh !== bTh) return aTh ? -1 : 1;
    return collator.compare(a.nameTh, b.nameTh);
  });
  return sorted.map((c, index) => ({ ...c, order: index }));
}

/**
 * สร้างรายการประเทศพร้อมใช้จากข้อมูลเดิม + seed ISO ทั้งหมด
 * @param existing ข้อมูลเดิมที่ต้องคงไว้ (เช่นที่ผู้ใช้แก้ชื่อ/ปิดใช้งาน) — ค่าเริ่มต้นว่าง
 */
export function buildSeedCountries(existing: Country[] = []): Country[] {
  return sortCountries(upsertCountries(existing, ISO_COUNTRY_SEED));
}
